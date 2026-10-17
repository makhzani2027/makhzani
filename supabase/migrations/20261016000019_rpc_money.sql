-- =============================================================================
-- رقيم — ١٩: إلغاء الفاتورة، سندات القبض والصرف، المصروفات، التحويل بين الصناديق
-- آمن لإعادة التشغيل
-- =============================================================================

-- إلغاء فاتورة بقيد عكسي كامل: حركات معاكسة + إلغاء دفعاتها. لا تُلغى فاتورة لها إرجاع، ولا فاتورة طلب (استعمل الإرجاع)
create or replace function public.void_invoice(id uuid, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  ii public.invoice_items;
  pieces numeric;
  k public.movement_kind;
  single_lot boolean;
begin
  perform private.require_perm('invoices.void');
  select * into i from public.invoices x where x.id = void_invoice.id for update;
  if i.id is null then raise exception using message = 'الفاتورة غير موجودة.', errcode = 'P0001'; end if;
  if i.status = 'void' then raise exception using message = 'الفاتورة ملغاة سابقاً.', errcode = 'P0001'; end if;
  if nullif(btrim(reason), '') is null then raise exception using message = 'اكتب سبب الإلغاء.', errcode = 'P0001'; end if;
  if i.order_id is not null and i.kind = 'sale' then
    raise exception using message = 'فاتورة طلب التطبيق لا تُلغى؛ سجّل إرجاع الطلب بدلاً منها.', errcode = 'P0001';
  end if;
  if exists (select 1 from public.invoices r where r.return_of = i.id and r.status = 'posted') then
    raise exception using message = 'للفاتورة إرجاع مسجّل؛ ألغِ الإرجاع أولاً.', errcode = 'P0001';
  end if;
  perform private.lock_variants(array(select x.variant_id from public.invoice_items x where x.invoice_id = i.id));

  for ii in select * from public.invoice_items x where x.invoice_id = i.id order by x.variant_id loop
    pieces := ii.qty * ii.unit_factor;
    single_lot := ii.lot_code is not null and position('،' in ii.lot_code) = 0;
    k := case i.kind when 'sale' then 'sale_return' when 'purchase' then 'purchase_return' else 'adjustment' end;
    perform private.apply_movement(ii.variant_id, i.warehouse_id,
      case when i.kind in ('sale', 'purchase_return') then pieces else -pieces end, k,
      round(ii.unit_cost / ii.unit_factor, 2), 'invoice', i.id, 'إلغاء ' || i.number,
      case when single_lot then ii.lot_code end, case when single_lot then ii.expiry_date end);
    if cardinality(ii.serials) > 0 then
      if i.kind = 'sale' then
        update public.serials set status = 'in_stock', warehouse_id = i.warehouse_id, sale_invoice_id = null
          where variant_id = ii.variant_id and serial = any (ii.serials);
      elsif i.kind = 'purchase' then
        if exists (select 1 from public.serials s where s.variant_id = ii.variant_id and s.serial = any (ii.serials) and s.status <> 'in_stock') then
          raise exception using message = 'بعض الأرقام التسلسلية لهذه الفاتورة بيعت؛ لا يمكن إلغاؤها.', errcode = 'P0001';
        end if;
        delete from public.serials where variant_id = ii.variant_id and serial = any (ii.serials) and purchase_invoice_id = i.id;
      elsif i.kind = 'sale_return' then
        update public.serials set status = 'sold' where variant_id = ii.variant_id and serial = any (ii.serials);
      else
        update public.serials set status = 'in_stock', warehouse_id = i.warehouse_id where variant_id = ii.variant_id and serial = any (ii.serials);
      end if;
    end if;
  end loop;

  update public.payments set voided_at = now() where invoice_id = i.id and voided_at is null;
  update public.invoices set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(reason), paid = 0
    where invoices.id = i.id;
  return jsonb_build_object('invoice_id', i.id, 'number', i.number, 'status', 'void');
end $$;

-- سند قبض/صرف: {direction, method, amount, currency?, exchange_rate?, account_id?, customer_id?, supplier_id?, invoice_id?, reference?, note?}
create or replace function public.record_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  dir public.payment_direction;
  cust uuid := nullif(p ->> 'customer_id', '')::uuid;
  supp uuid := nullif(p ->> 'supplier_id', '')::uuid;
  cur public.currency_code;
  pid uuid;
begin
  perform private.require_perm('finance.manage');
  dir := coalesce(nullif(p ->> 'direction', ''), 'in')::public.payment_direction;
  if nullif(p ->> 'invoice_id', '') is not null then
    select * into i from public.invoices x where x.id = (p ->> 'invoice_id')::uuid for update;
    if i.id is null or i.status <> 'posted' then
      raise exception using message = 'الفاتورة غير موجودة أو ملغاة.', errcode = 'P0001';
    end if;
    cust := i.customer_id;
    supp := i.supplier_id;
  end if;
  if (cust is null) = (supp is null) then
    raise exception using message = 'اختر زبوناً أو مورداً للسند.', errcode = 'P0001';
  end if;
  if cust is not null and not exists (select 1 from public.customers c where c.id = cust and not c.is_cash_customer) then
    raise exception using message = 'الزبون غير موجود.', errcode = 'P0001';
  end if;
  if supp is not null and not exists (select 1 from public.suppliers s where s.id = supp) then
    raise exception using message = 'المورد غير موجود.', errcode = 'P0001';
  end if;
  if coalesce(nullif(p ->> 'amount', '')::numeric, 0) <= 0 then
    raise exception using message = 'أدخل مبلغاً أكبر من صفر.', errcode = 'P0001';
  end if;
  cur := coalesce(nullif(p ->> 'currency', ''),
    (select a.currency::text from public.money_accounts a where a.id = nullif(p ->> 'account_id', '')::uuid), i.currency::text, 'IQD')::public.currency_code;
  pid := private.add_payment(dir, coalesce(nullif(p ->> 'method', ''), 'cash')::public.payment_method, (p ->> 'amount')::numeric,
    cust, supp, i.id, null, p ->> 'reference', left(p ->> 'note', 500), cur,
    case when cur = 'USD' then nullif(p ->> 'exchange_rate', '')::numeric end, nullif(p ->> 'account_id', '')::uuid);
  return (select to_jsonb(x) from public.payments x where x.id = pid);
end $$;

-- مصروف: {category, amount, currency?, exchange_rate?, account_id?, method?, note?, spent_at?}
create or replace function public.record_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cur public.currency_code;
  m public.payment_method := coalesce(nullif(p ->> 'method', ''), 'cash')::public.payment_method;
  e public.expenses;
begin
  perform private.require_perm('finance.manage');
  if nullif(btrim(p ->> 'category'), '') is null then
    raise exception using message = 'اختر بند المصروف.', errcode = 'P0001';
  end if;
  if coalesce(nullif(p ->> 'amount', '')::numeric, 0) <= 0 then
    raise exception using message = 'أدخل مبلغاً أكبر من صفر.', errcode = 'P0001';
  end if;
  cur := coalesce(nullif(p ->> 'currency', ''),
    (select a.currency::text from public.money_accounts a where a.id = nullif(p ->> 'account_id', '')::uuid), 'IQD')::public.currency_code;
  insert into public.expenses (category, amount, currency, exchange_rate, account_id, method, note, spent_at, cash_session_id, created_by)
  values (btrim(p ->> 'category'), private.round_cur((p ->> 'amount')::numeric, cur), cur, private.doc_rate(p, cur),
    private.resolve_account(nullif(p ->> 'account_id', '')::uuid, m, cur), m, left(nullif(btrim(p ->> 'note'), ''), 500),
    coalesce(nullif(p ->> 'spent_at', '')::timestamptz, now()),
    case when m = 'cash' then private.open_session_of(auth.uid()) end, auth.uid())
  returning * into e;
  return to_jsonb(e);
end $$;

-- تحويل بين الصناديق: {from_account_id, to_account_id, amount, exchange_rate?, note?}
-- amount بعملة المصدر؛ exchange_rate (دينار لكل دولار) يلزم إن اختلفت العملتان
create or replace function public.transfer_money(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fa public.money_accounts;
  ta public.money_accounts;
  amt numeric := coalesce(nullif(p ->> 'amount', '')::numeric, 0);
  rate numeric := 1;
  bal numeric;
  t public.account_transfers;
begin
  perform private.require_perm('finance.manage');
  -- قفل الحسابين بترتيب ثابت
  perform 1 from public.money_accounts a where a.id in (nullif(p ->> 'from_account_id', '')::uuid, nullif(p ->> 'to_account_id', '')::uuid)
    order by a.id for update;
  select * into fa from public.money_accounts a where a.id = nullif(p ->> 'from_account_id', '')::uuid and a.is_active;
  select * into ta from public.money_accounts a where a.id = nullif(p ->> 'to_account_id', '')::uuid and a.is_active;
  if fa.id is null or ta.id is null then raise exception using message = 'اختر الحسابين.', errcode = 'P0001'; end if;
  if fa.id = ta.id then raise exception using message = 'لا يمكن التحويل لنفس الحساب.', errcode = 'P0001'; end if;
  if amt <= 0 then raise exception using message = 'أدخل مبلغاً أكبر من صفر.', errcode = 'P0001'; end if;
  amt := private.round_cur(amt, fa.currency);
  if fa.currency <> ta.currency then
    rate := coalesce(nullif(p ->> 'exchange_rate', '')::numeric, private.usd_rate());
    if rate <= 0 then raise exception using message = 'سعر الصرف غير صالح.', errcode = 'P0001'; end if;
  end if;
  select b.balance into bal from public.money_account_balances b where b.account_id = fa.id;
  if coalesce(bal, 0) < amt then
    raise exception using errcode = 'P0001', message = format('رصيد «%s» لا يكفي — المتاح %s', fa.name, private.fmt_qty(coalesce(bal, 0)));
  end if;
  insert into public.account_transfers (number, from_account_id, to_account_id, amount, exchange_rate, note, created_by)
  values (public.next_doc_number('account_transfer'), fa.id, ta.id, amt, rate, left(nullif(btrim(p ->> 'note'), ''), 500), auth.uid())
  returning * into t;
  return to_jsonb(t);
end $$;

revoke all on all functions in schema private from public;
