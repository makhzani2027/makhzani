-- =============================================================================
-- رقيم — ٢١: إصلاحات أمنية من المراجعة. آمن لإعادة التشغيل
-- ١) set_order_status(order_id, null, note) — «ملاحظة داخلية»: كانت تمر بآلة الحالات بقيمة null
--    فتفشل (status not null) أو تُسجَّل حدثاً ظاهراً للزبون يصله إشعاراً. الآن: حدث داخلي غير ظاهر فقط.
--    ولا تُكتب في orders.staff_note لأن الزبون يقرأ صف طلبه كاملاً عبر RLS (الأعمدة لا تُحجب لنفس الدور)،
--    فالملاحظة الداخلية تبقى في order_events (is_customer_visible = false) التي لا يراها إلا orders.view.
-- =============================================================================

create or replace function public.set_order_status(order_id uuid, status text, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  t public.order_status;
  iid uuid;
  r jsonb;
begin
  perform private.require_perm('orders.manage');
  -- ملاحظة داخلية فقط: لا تغيّر الحالة ولا تصل للزبون
  if status is null then
    if nullif(btrim(note), '') is null then
      raise exception using message = 'اكتب الملاحظة.', errcode = 'P0001';
    end if;
    select * into o from public.orders x where x.id = set_order_status.order_id for update;
    if o.id is null then raise exception using message = 'الطلب غير موجود.', errcode = 'P0001'; end if;
    insert into public.order_events (order_id, status, note, is_customer_visible, actor_id)
    values (o.id, null, left(btrim(note), 1000), false, auth.uid());
    update public.orders set updated_at = now() where id = o.id;
    return jsonb_build_object('order_id', o.id, 'status', o.status, 'invoice_id', o.invoice_id, 'return_invoice_id', null);
  end if;
  begin
    t := status::public.order_status;
  exception when invalid_text_representation then
    raise exception using message = 'حالة غير معروفة.', errcode = 'P0001';
  end;
  select * into o from public.orders x where x.id = set_order_status.order_id for update;
  if o.id is null then raise exception using message = 'الطلب غير موجود.', errcode = 'P0001'; end if;
  if not coalesce(private.order_can_transition(o.status, t, o.fulfillment), false) then
    raise exception using message = 'لا يمكن نقل الطلب لهذه الحالة من حالته الحالية.', errcode = 'P0001';
  end if;

  if t = 'cancelled' then
    perform private.cancel_order(o.id, coalesce(nullif(btrim(note), ''), 'ألغاه المتجر'));
    if o.payment_status = 'paid' then
      update public.orders set payment_status = 'refunded' where id = o.id;
    end if;
    return jsonb_build_object('order_id', o.id, 'status', 'cancelled');
  end if;

  if t = 'delivered' then
    iid := private.invoice_order(o);
    update public.orders set status = t, invoice_id = iid, delivered_at = now(),
      payment_status = case when o.payment_method in ('cod', 'office') then 'paid' else payment_status end
    where id = o.id;
  elsif t = 'returned' then
    if o.invoice_id is null then raise exception using message = 'الطلب بلا فاتورة.', errcode = 'P0001'; end if;
    r := private.make_return(o.invoice_id,
      (select jsonb_agg(jsonb_build_object('invoice_item_id', ii.id, 'qty', ii.qty)) from public.invoice_items ii where ii.invoice_id = o.invoice_id),
      case when (select i.paid from public.invoices i where i.id = o.invoice_id) > 0 then
        jsonb_build_object('method', case when o.payment_method = 'online' then 'wayl' else 'cash' end,
          'amount', least((select i.paid from public.invoices i where i.id = o.invoice_id),
                          (select i.subtotal - i.discount from public.invoices i where i.id = o.invoice_id)))
      end,
      coalesce(nullif(btrim(note), ''), 'إرجاع طلب ' || o.number));
    update public.orders set status = t,
      payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end where id = o.id;
  else
    update public.orders set status = t, confirmed_at = case when t = 'confirmed' then now() else confirmed_at end where id = o.id;
  end if;

  insert into public.order_events (order_id, status, note, is_customer_visible, actor_id)
  values (o.id, t, nullif(btrim(note), ''), true, auth.uid());
  return jsonb_build_object('order_id', o.id, 'status', t, 'invoice_id', coalesce(iid, o.invoice_id), 'return_invoice_id', r ->> 'invoice_id');
end $$;

-- ٢) payment_transactions: الزبون كان يقرأ صفوف دفع طلبه كاملة، ومنها raw (رد بوابة الدفع الخام الذي قد يعيد
--    webhookSecret المرسل عند إنشاء الرابط ← تزوير «تم الدفع»). التطبيق يقرأ الحالة عبر دالة payments (action=status)
--    بمفتاح الخادم، فلا حاجة لقراءة الجدول مباشرة: القراءة للموظفين orders.view فقط.
select private.pol('payment_transactions', 'payment_tx_read', 'select', '(select public.has_perm(''orders.view''))', null, 'authenticated');
