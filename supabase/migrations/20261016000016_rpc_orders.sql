-- =============================================================================
-- رقيم — ١٦: عروض الأسعار، إدارة طلبات التطبيق (آلة الحالات)، طلبات التوفير، الحملات
-- آمن لإعادة التشغيل
-- =============================================================================

-- عرض سعر: {id?, customer_id?, customer_name?, warehouse_id, currency?, exchange_rate?, status?, valid_until?, note?, discount?,
-- items:[{variant_id, qty, unit_price?, discount?, price_tier?}]} ← يعيد العرض مع بنوده
create or replace function public.save_quotation(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
<<fn>>
declare
  qid uuid := nullif(p ->> 'id', '')::uuid;
  q public.quotations;
  cur public.currency_code := coalesce(nullif(p ->> 'currency', ''), 'IQD')::public.currency_code;
  rate numeric;
  it jsonb;
  v public.product_variants;
  pr public.products;
  tier public.price_tier;
  pz record;
  price numeric;
  qty numeric;
  disc numeric;
  lt numeric;
  subtotal numeric := 0;
  inv_disc numeric;
  st public.quotation_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.quotation_status;
begin
  perform private.require_perm('quotations.manage');
  if st = 'converted' then raise exception using message = 'التحويل لفاتورة عبر زر «تحويل لفاتورة».', errcode = 'P0001'; end if;
  if not exists (select 1 from public.warehouses w where w.id = nullif(p ->> 'warehouse_id', '')::uuid and w.is_active) then
    raise exception using message = 'اختر المخزن.', errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  if nullif(p ->> 'customer_id', '') is null and nullif(btrim(p ->> 'customer_name'), '') is null then
    raise exception using message = 'اختر الزبون أو اكتب اسمه.', errcode = 'P0001';
  end if;
  rate := private.doc_rate(p, cur);
  if qid is not null then
    select * into q from public.quotations x where x.id = qid for update;
    if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
    if q.status = 'converted' then raise exception using message = 'عرض السعر حُوّل لفاتورة ولا يُعدَّل.', errcode = 'P0001'; end if;
    delete from public.quotation_items where quotation_id = qid;
    update public.quotations set customer_id = nullif(p ->> 'customer_id', '')::uuid, customer_name = nullif(btrim(p ->> 'customer_name'), ''),
      warehouse_id = (p ->> 'warehouse_id')::uuid, currency = cur, exchange_rate = rate, status = st,
      valid_until = nullif(p ->> 'valid_until', '')::date, note = left(nullif(btrim(p ->> 'note'), ''), 1000)
    where id = qid;
  else
    insert into public.quotations (number, status, customer_id, customer_name, warehouse_id, currency, exchange_rate, valid_until, note, created_by)
    values (public.next_doc_number('quotation'), st, nullif(p ->> 'customer_id', '')::uuid, nullif(btrim(p ->> 'customer_name'), ''),
      (p ->> 'warehouse_id')::uuid, cur, rate, nullif(p ->> 'valid_until', '')::date, left(nullif(btrim(p ->> 'note'), ''), 1000), auth.uid())
    returning id into qid;
  end if;

  for it in select x from jsonb_array_elements(p -> 'items') x loop
    select * into v from public.product_variants x where x.id = nullif(it ->> 'variant_id', '')::uuid;
    select * into pr from public.products x where x.id = v.product_id;
    if v.id is null then raise exception using message = 'منتج غير موجود في العرض.', errcode = 'P0001'; end if;
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if qty <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    tier := coalesce(nullif(it ->> 'price_tier', ''), 'retail')::public.price_tier;
    select * into pz from private.variant_price(v.id, tier, null, cur, rate);
    price := pz.unit_price;
    if nullif(it ->> 'unit_price', '') is not null and (it ->> 'unit_price')::numeric is distinct from price then
      perform private.require_perm('pos.price_override');
      price := private.round_cur(greatest((it ->> 'unit_price')::numeric, 0), cur);
    end if;
    disc := least(greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0), price * qty);
    if disc > 0 then perform private.require_perm('pos.discount'); end if;
    lt := private.round_cur(price * qty - disc, cur);
    subtotal := subtotal + lt;
    insert into public.quotation_items (quotation_id, variant_id, name, variant_title, qty, unit_price, discount, line_total, price_tier)
    values (qid, v.id, pr.name, nullif(v.title, 'افتراضي'), qty, price, private.round_cur(disc, cur), lt, tier);
  end loop;
  subtotal := private.round_cur(subtotal, cur);
  inv_disc := private.round_cur(least(greatest(coalesce(nullif(p ->> 'discount', '')::numeric, 0), 0), subtotal), cur);
  if inv_disc > 0 then perform private.require_perm('pos.discount'); end if;
  update public.quotations set subtotal = fn.subtotal, discount = inv_disc, total = fn.subtotal - inv_disc where id = qid;
  return (select to_jsonb(x) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name)
            from public.quotation_items i where i.quotation_id = x.id), '[]'::jsonb))
          from public.quotations x where x.id = qid);
end $$;

-- عرض سعر ← فاتورة بيع بنفس منطق pos_checkout. العرض الساري (valid_until لم ينتهِ) يثبّت أسعاره،
-- والمنتهي يُسعَّر من جديد بسعر اليوم. المخزون يُتحقق منه دائماً.
create or replace function public.convert_quotation(id uuid, payments jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotations;
  valid boolean;
  r jsonb;
begin
  perform private.require_perm('quotations.manage');
  select * into q from public.quotations x where x.id = convert_quotation.id for update;
  if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
  if q.status in ('converted', 'cancelled') then
    raise exception using message = 'عرض السعر محوّل أو ملغى سابقاً.', errcode = 'P0001';
  end if;
  valid := q.valid_until is null or q.valid_until >= (now() at time zone 'Asia/Baghdad')::date;
  r := private.post_sale(jsonb_build_object(
    'warehouse_id', q.warehouse_id, 'customer_id', q.customer_id, 'currency', q.currency,
    'exchange_rate', case when valid and q.currency = 'USD' then q.exchange_rate end,
    'discount', q.discount, 'note', concat_ws(' — ', 'عرض السعر ' || q.number, q.note), 'payments', coalesce(payments, '[]'),
    'items', (select jsonb_agg(jsonb_build_object('variant_id', i.variant_id, 'qty', i.qty, 'discount', i.discount,
      'price_tier', i.price_tier, 'unit_price', case when valid then i.unit_price end)) from public.quotation_items i where i.quotation_id = q.id)
  ), 'manual', q.id, true);
  update public.quotations set status = 'converted', invoice_id = (r ->> 'invoice_id')::uuid where quotations.id = q.id;
  return r || jsonb_build_object('quotation_id', q.id);
end $$;

-- آلة حالات الطلب — مطابقة لـ nextStatuses في packages/shared/src/order-flow.ts
create or replace function private.order_can_transition(f public.order_status, t public.order_status, ful public.fulfillment) returns boolean
language sql immutable set search_path = '' as $$
  select case f
    when 'pending' then t in ('confirmed', 'cancelled')
    when 'confirmed' then t in ('preparing', 'cancelled')
    when 'preparing' then t in ('ready', 'cancelled')
    when 'ready' then t in ('out_for_delivery', 'delivered', 'cancelled')
      and not (ful = 'delivery' and t = 'delivered') and not (ful = 'pickup' and t = 'out_for_delivery')
    when 'out_for_delivery' then t in ('delivered', 'cancelled')
    when 'delivered' then t = 'returned'
    else false end
$$;

-- تسليم الطلب: فاتورة بيع (online) تستهلك الحجز، ودفعة للدفع عند الاستلام/في المكتب، أو ربط الدفع الإلكتروني
create or replace function private.invoice_order(o public.orders) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  iid uuid;
  ct numeric;
  tx public.payment_transactions;
begin
  insert into public.invoices (number, kind, channel, customer_id, order_id, warehouse_id, branch_id, subtotal, discount, delivery_fee,
    total, note, created_by)
  values (public.next_doc_number('sale'), 'sale', 'online', o.customer_id, o.id, o.warehouse_id,
    (select w.branch_id from public.warehouses w where w.id = o.warehouse_id), o.subtotal, o.discount, o.delivery_fee, o.total,
    'طلب التطبيق ' || o.number, auth.uid())
  returning id into iid;
  insert into public.invoice_items (invoice_id, variant_id, product_id, name, variant_title, sku, qty, unit_price, discount, line_total, unit_cost)
  select iid, oi.variant_id, oi.product_id, oi.name, oi.variant_title, oi.sku, oi.qty, oi.unit_price,
    greatest(round(oi.unit_price * oi.qty, 0) - oi.line_total, 0), oi.line_total, coalesce(c.avg_cost, 0)
  from public.order_items oi left join public.variant_costs c on c.variant_id = oi.variant_id
  where oi.order_id = o.id order by oi.variant_id;
  select coalesce(sum(round(ii.unit_cost * ii.qty, 2)), 0) into ct from public.invoice_items ii where ii.invoice_id = iid;
  update public.invoices set cost_total = ct where id = iid;
  perform private.release_order(o.id, iid);

  if o.payment_method in ('cod', 'office') then
    perform private.add_payment('in', 'cash', o.total, o.customer_id, null, iid, o.id, null, 'تحصيل طلب ' || o.number);
  elsif o.payment_status = 'paid' then
    select * into tx from public.payment_transactions t where t.order_id = o.id and t.status = 'paid' order by t.updated_at desc limit 1;
    perform private.add_payment('in', 'wayl', o.total, o.customer_id, null, iid, o.id, tx.provider_ref, 'دفع إلكتروني ' || o.number,
      'IQD', null, (select a.id from public.money_accounts a where a.is_active and a.kind = 'wallet' and a.currency = 'IQD' order by a.created_at limit 1));
  end if;
  return iid;
end $$;

create or replace function public.set_order_status(order_id uuid, status text, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  t public.order_status;
  iid uuid;
  r jsonb;
begin
  perform private.require_perm('orders.manage');
  begin
    t := status::public.order_status;
  exception when invalid_text_representation then
    raise exception using message = 'حالة غير معروفة.', errcode = 'P0001';
  end;
  select * into o from public.orders x where x.id = set_order_status.order_id for update;
  if o.id is null then raise exception using message = 'الطلب غير موجود.', errcode = 'P0001'; end if;
  if not private.order_can_transition(o.status, t, o.fulfillment) then
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

-- طلب توفير منتج: الحالة + رد الموظف + ربط بمنتج ← إشعار للزبون
create or replace function public.set_request_status(id uuid, status text, reply text default null, product_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.product_requests;
  s public.request_status;
begin
  perform private.require_perm('requests.manage');
  begin
    s := status::public.request_status;
  exception when invalid_text_representation then
    raise exception using message = 'حالة غير معروفة.', errcode = 'P0001';
  end;
  update public.product_requests x set status = s, staff_reply = coalesce(nullif(btrim(reply), ''), x.staff_reply),
    product_id = coalesce(set_request_status.product_id, x.product_id)
  where x.id = set_request_status.id returning * into r;
  if r.id is null then raise exception using message = 'الطلب غير موجود.', errcode = 'P0001'; end if;
  if r.profile_id is not null then
    insert into public.notifications (profile_id, kind, title, body, data)
    values (r.profile_id, 'request',
      case s when 'reviewing' then 'نراجع طلبك' when 'sourcing' then 'نعمل على توفير طلبك' when 'available' then 'طلبك صار متوفراً'
        when 'fulfilled' then 'تم تنفيذ طلبك' when 'rejected' then 'تعذّر توفير طلبك' when 'cancelled' then 'أُلغي طلبك' else 'تحديث على طلبك' end,
      concat_ws(' — ', r.title, nullif(btrim(reply), '')),
      jsonb_build_object('request_id', r.id, 'number', r.number, 'status', s, 'product_id', r.product_id));
  end if;
  return to_jsonb(r);
end $$;

-- إرسال حملة: يضع وقت الإرسال، ينشئ إشعاراً داخلياً لكل زبون، ويستدعي push لموضوع all مرة واحدة
create or replace function public.send_campaign(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.notification_campaigns;
  n int;
  hook_url text;
  hook_secret text;
begin
  perform private.require_perm('notifications.send');
  select * into c from public.notification_campaigns x where x.id = send_campaign.id for update;
  if c.id is null then raise exception using message = 'الحملة غير موجودة.', errcode = 'P0001'; end if;
  if c.sent_at is not null then raise exception using message = 'أُرسلت الحملة سابقاً.', errcode = 'P0001'; end if;
  update public.notification_campaigns set sent_at = now() where notification_campaigns.id = c.id returning * into c;
  insert into public.notifications (profile_id, kind, title, body, data)
  select p.id, 'promo', c.title, c.body, jsonb_build_object('campaign_id', c.id, 'link_kind', c.link_kind, 'link_value', c.link_value, 'image_key', c.image_key)
  from public.profiles p where p.kind = 'customer' and p.status = 'active';
  get diagnostics n = row_count;
  select value into hook_url from private.settings where key = 'push_url';
  select value into hook_secret from private.settings where key = 'push_secret';
  if hook_url is not null and hook_secret is not null then
    begin
      perform net.http_post(url := hook_url,
        body := jsonb_build_object('type', 'CAMPAIGN', 'topic', 'all', 'record', to_jsonb(c)),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', hook_secret),
        timeout_milliseconds := 5000);
    exception when others then null;
    end;
  end if;
  return to_jsonb(c) || jsonb_build_object('recipients', n);
end $$;

revoke all on all functions in schema private from public;
