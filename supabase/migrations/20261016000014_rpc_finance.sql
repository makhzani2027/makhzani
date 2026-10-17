-- =============================================================================
-- رقيم — ١٤: المشتريات والإرجاع (إلغاء الفاتورة والسندات والمصروفات في ١٩)
-- آمن لإعادة التشغيل
-- =============================================================================

-- سعر صرف المستند: الدينار = 1، الدولار = المرسل أو سعر اليوم
create or replace function private.doc_rate(p jsonb, cur public.currency_code) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare r numeric;
begin
  if cur = 'IQD' then return 1; end if;
  r := coalesce(nullif(p ->> 'exchange_rate', '')::numeric, private.usd_rate());
  if r <= 0 then raise exception using message = 'سعر الصرف غير صالح.', errcode = 'P0001'; end if;
  return r;
end $$;

-- يسجل مصفوفة دفعات [{method, amount, reference?, account_id?, currency?, exchange_rate?}] لفاتورة
create or replace function private.add_payments(
  p_payments jsonb, p_direction public.payment_direction, p_customer uuid, p_supplier uuid, p_invoice uuid,
  p_doc_cur public.currency_code, p_doc_rate numeric, p_note text default null
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  pay jsonb;
  amt numeric;
  pcur public.currency_code;
  n numeric := 0;
begin
  if p_payments is null or jsonb_typeof(p_payments) = 'null' then return 0; end if;
  if jsonb_typeof(p_payments) <> 'array' then
    raise exception using message = 'صيغة الدفعات غير صالحة.', errcode = 'P0001';
  end if;
  for pay in select x from jsonb_array_elements(p_payments) x loop
    amt := coalesce(nullif(pay ->> 'amount', '')::numeric, 0);
    if amt < 0 then raise exception using message = 'مبلغ الدفعة لا يكون سالباً.', errcode = 'P0001'; end if;
    continue when amt = 0;
    pcur := coalesce(nullif(pay ->> 'currency', ''),
      (select a.currency::text from public.money_accounts a where a.id = nullif(pay ->> 'account_id', '')::uuid), p_doc_cur::text)::public.currency_code;
    perform private.add_payment(p_direction, coalesce(nullif(pay ->> 'method', ''), 'cash')::public.payment_method, amt,
      p_customer, p_supplier, p_invoice, null, pay ->> 'reference', p_note, pcur,
      case when pcur = 'USD' then coalesce(nullif(pay ->> 'exchange_rate', '')::numeric, case when p_doc_cur = 'USD' then p_doc_rate end) end,
      nullif(pay ->> 'account_id', '')::uuid);
    n := n + 1;
  end loop;
  return n;
end $$;

-- فاتورة شراء: {supplier_id, warehouse_id, currency?, exchange_rate?, items:[{variant_id, qty, unit_cost, discount?, unit_id?,
-- serials?, lot_code?, expiry_date?}], discount?, payments?, note?} ← حركات شراء + متوسط تكلفة بالدينار + دفعات صرف
create or replace function public.post_purchase(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
<<fn>>
declare
  uid uuid := auth.uid();
  sp public.suppliers;
  wh public.warehouses;
  cur public.currency_code := coalesce(nullif(p ->> 'currency', ''), 'IQD')::public.currency_code;
  rate numeric;
  it jsonb;
  vid uuid;
  v public.product_variants;
  pr public.products;
  u public.variant_units;
  factor numeric;
  qty numeric;
  cost numeric;
  disc numeric;
  lt numeric;
  subtotal numeric := 0;
  inv_disc numeric;
  ratio numeric;
  piece_cost numeric;
  cost_total numeric := 0;
  sers text[];
  iid uuid;
  num text;
begin
  perform private.require_perm('purchases.manage');
  select * into sp from public.suppliers s where s.id = nullif(p ->> 'supplier_id', '')::uuid;
  if sp.id is null then raise exception using message = 'اختر المورد.', errcode = 'P0001'; end if;
  select * into wh from public.warehouses w where w.id = nullif(p ->> 'warehouse_id', '')::uuid and w.is_active;
  if wh.id is null then raise exception using message = 'اختر المخزن.', errcode = 'P0001'; end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'الفاتورة فارغة. أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  rate := private.doc_rate(p, cur);
  perform private.lock_variants(array(select distinct (x ->> 'variant_id')::uuid from jsonb_array_elements(p -> 'items') x));

  -- المجموع أولاً لتوزيع خصم الفاتورة على تكلفة البنود
  for it in select x from jsonb_array_elements(p -> 'items') x loop
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    cost := coalesce(nullif(it ->> 'unit_cost', '')::numeric, -1);
    if qty <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    if cost < 0 then raise exception using message = 'أدخل تكلفة صحيحة لكل بند.', errcode = 'P0001'; end if;
    subtotal := subtotal + private.round_cur(qty * cost - least(greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0), qty * cost), cur);
  end loop;
  subtotal := private.round_cur(subtotal, cur);
  inv_disc := private.round_cur(least(greatest(coalesce(nullif(p ->> 'discount', '')::numeric, 0), 0), subtotal), cur);
  ratio := case when subtotal > 0 then (subtotal - inv_disc) / subtotal else 1 end;

  num := public.next_doc_number('purchase');
  insert into public.invoices (number, kind, channel, supplier_id, warehouse_id, branch_id, currency, exchange_rate, subtotal,
    discount, total, note, created_by)
  values (num, 'purchase', 'manual', sp.id, wh.id, wh.branch_id, cur, rate, subtotal, inv_disc, subtotal - inv_disc,
    left(nullif(btrim(p ->> 'note'), ''), 500), uid)
  returning id into iid;

  for it in select x from jsonb_array_elements(p -> 'items') x order by x ->> 'variant_id' loop
    vid := (it ->> 'variant_id')::uuid;
    select * into v from public.product_variants x where x.id = vid;
    select * into pr from public.products x where x.id = v.product_id;
    if v.id is null then raise exception using message = 'منتج غير موجود في الفاتورة.', errcode = 'P0001'; end if;
    factor := 1;
    u := null;
    if nullif(it ->> 'unit_id', '') is not null then
      select * into u from public.variant_units x where x.id = (it ->> 'unit_id')::uuid and x.variant_id = vid;
      if u.id is null then raise exception using message = 'وحدة التعبئة لا تخص هذا المنتج.', errcode = 'P0001'; end if;
      factor := u.factor;
    end if;
    qty := (it ->> 'qty')::numeric;
    cost := (it ->> 'unit_cost')::numeric;
    disc := least(greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0), qty * cost);
    lt := private.round_cur(qty * cost - disc, cur);
    -- تكلفة القطعة بالدينار بعد الخصمين
    piece_cost := round(private.convert(lt * ratio, cur, 'IQD', rate) / (qty * factor), 2);

    sers := private.jtext_array(it -> 'serials');
    if pr.track_serials then
      if cardinality(sers) <> qty * factor then
        raise exception using errcode = 'P0001', message = format('أدخل %s رقماً تسلسلياً لـ «%s».', private.fmt_qty(qty * factor), private.variant_label(vid));
      end if;
      if exists (select 1 from public.serials s where s.variant_id = vid and s.serial = any (sers)) then
        raise exception using message = 'رقم تسلسلي مسجّل سابقاً لهذا المنتج.', errcode = 'P0001';
      end if;
      insert into public.serials (variant_id, serial, status, warehouse_id, purchase_invoice_id)
      select vid, s, 'in_stock', wh.id, iid from unnest(sers) s;
    end if;

    perform private.apply_movement(vid, wh.id, qty * factor, 'purchase', piece_cost, 'invoice', iid, null,
      it ->> 'lot_code', nullif(it ->> 'expiry_date', '')::date);
    if pr.track_expiry and nullif(it ->> 'expiry_date', '') is null then
      raise exception using errcode = 'P0001', message = format('أدخل تاريخ الصلاحية لـ «%s».', private.variant_label(vid));
    end if;

    insert into public.invoice_items (invoice_id, variant_id, product_id, name, variant_title, sku, qty, unit_price, discount,
      line_total, unit_cost, serials, unit_name, unit_factor, lot_code, expiry_date)
    values (iid, vid, pr.id, pr.name, nullif(v.title, 'افتراضي'), v.sku, qty, private.round_cur(cost, cur), private.round_cur(disc, cur), lt,
      round(piece_cost * factor, 2), sers, u.unit_name, factor, nullif(btrim(it ->> 'lot_code'), ''), nullif(it ->> 'expiry_date', '')::date);
    cost_total := cost_total + round(piece_cost * qty * factor, 2);
  end loop;

  update public.invoices set cost_total = fn.cost_total where id = iid;
  perform private.add_payments(p -> 'payments', 'out', null, sp.id, iid, cur, rate);
  return (select jsonb_build_object('invoice_id', i.id, 'number', i.number, 'total', i.total, 'paid', i.paid, 'due', i.due, 'currency', i.currency)
          from public.invoices i where i.id = iid);
end $$;

-- إرجاع (داخلية — تستعملها post_return و set_order_status): فاتورة SR/PR بنفس العملة وسعر الصرف،
-- البنود نسبة من الأصل، وخصم الفاتورة الأصلية يوزَّع بالنسبة. الرصيد يعود (بيع) أو يخرج (شراء)
create or replace function private.make_return(p_invoice uuid, p_items jsonb, p_refund jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
<<fn>>
declare
  uid uuid := auth.uid();
  o public.invoices;
  oi public.invoice_items;
  it jsonb;
  rkind public.invoice_kind;
  qty numeric;
  done_qty numeric;
  lt numeric;
  subtotal numeric := 0;
  disc numeric;
  pieces numeric;
  cost_total numeric := 0;
  sers text[];
  rid uuid;
  num text;
  amt numeric;
  single_lot boolean;
begin
  select * into o from public.invoices i where i.id = p_invoice for update;
  if o.id is null or o.kind not in ('sale', 'purchase') then
    raise exception using message = 'الفاتورة غير موجودة أو لا تقبل الإرجاع.', errcode = 'P0001';
  end if;
  if o.status <> 'posted' then raise exception using message = 'الفاتورة ملغاة.', errcode = 'P0001'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception using message = 'اكتب سبب الإرجاع.', errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'اختر البنود المرتجعة.', errcode = 'P0001';
  end if;
  rkind := case when o.kind = 'sale' then 'sale_return' else 'purchase_return' end;
  perform private.lock_variants(array(select ii.variant_id from public.invoice_items ii where ii.invoice_id = o.id));

  num := public.next_doc_number(rkind::text);
  insert into public.invoices (number, kind, channel, status, customer_id, supplier_id, order_id, return_of, warehouse_id, branch_id,
    currency, exchange_rate, note, cash_session_id, created_by)
  values (num, rkind, case when o.channel = 'online' then 'online' else 'manual' end, 'posted', o.customer_id, o.supplier_id,
    o.order_id, o.id, o.warehouse_id, o.branch_id, o.currency, o.exchange_rate, left(btrim(p_reason), 500),
    case when uid is not null then private.open_session_of(uid) end, uid)
  returning id into rid;

  for it in
    select x from jsonb_array_elements(p_items) x
    order by (select ii.variant_id from public.invoice_items ii where ii.id = nullif(x ->> 'invoice_item_id', '')::uuid)
  loop
    select * into oi from public.invoice_items ii where ii.id = nullif(it ->> 'invoice_item_id', '')::uuid and ii.invoice_id = o.id;
    if oi.id is null then raise exception using message = 'بند غير موجود في الفاتورة الأصلية.', errcode = 'P0001'; end if;
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if qty <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    select coalesce(sum(ri.qty), 0) into done_qty from public.invoice_items ri join public.invoices r on r.id = ri.invoice_id
      where ri.return_of_item_id = oi.id and r.status = 'posted';
    if qty > oi.qty - done_qty then
      raise exception using errcode = 'P0001', message = format('لا يمكن إرجاع أكثر مما بيع من «%s» — المتبقي %s',
        oi.name, private.fmt_qty(oi.qty - done_qty));
    end if;
    lt := private.round_cur(oi.line_total * qty / oi.qty, o.currency);
    subtotal := subtotal + lt;
    pieces := qty * oi.unit_factor;

    sers := private.jtext_array(it -> 'serials');
    if cardinality(oi.serials) > 0 then
      if cardinality(sers) = 0 and qty = oi.qty then sers := oi.serials; end if;
      if cardinality(sers) <> pieces or not (sers <@ oi.serials) then
        raise exception using errcode = 'P0001', message = format('حدد الأرقام التسلسلية المرتجعة لـ «%s».', oi.name);
      end if;
      if rkind = 'sale_return' then
        update public.serials set status = 'returned', warehouse_id = o.warehouse_id, sale_invoice_id = null
          where variant_id = oi.variant_id and serial = any (sers);
      else
        update public.serials set status = 'defective', warehouse_id = null, note = 'أُرجع للمورد ' || num
          where variant_id = oi.variant_id and serial = any (sers) and status = 'in_stock';
      end if;
    end if;

    single_lot := oi.lot_code is not null and position('،' in oi.lot_code) = 0;
    perform private.apply_movement(oi.variant_id, o.warehouse_id,
      case when rkind = 'sale_return' then pieces else -pieces end, rkind::text::public.movement_kind,
      round(oi.unit_cost / oi.unit_factor, 2), 'invoice', rid, null,
      case when single_lot then oi.lot_code end, case when single_lot then oi.expiry_date end);

    insert into public.invoice_items (invoice_id, variant_id, product_id, name, variant_title, sku, qty, unit_price, discount,
      line_total, unit_cost, serials, price_tier, unit_name, unit_factor, lot_code, expiry_date, return_of_item_id)
    values (rid, oi.variant_id, oi.product_id, oi.name, oi.variant_title, oi.sku, qty, oi.unit_price,
      greatest(private.round_cur(oi.unit_price * qty, o.currency) - lt, 0), lt, oi.unit_cost, sers, oi.price_tier, oi.unit_name,
      oi.unit_factor, oi.lot_code, oi.expiry_date, oi.id);
    cost_total := cost_total + round(oi.unit_cost * qty, 2);
  end loop;

  subtotal := private.round_cur(subtotal, o.currency);
  disc := case when o.subtotal > 0 then least(private.round_cur(subtotal * o.discount / o.subtotal, o.currency), subtotal) else 0 end;
  update public.invoices set subtotal = fn.subtotal, discount = disc, total = fn.subtotal - disc,
    cost_total = fn.cost_total where id = rid;

  -- المبلغ المسترد (للزبون صرف، ومن المورد قبض) لا يتجاوز قيمة الإرجاع
  if p_refund is not null and jsonb_typeof(p_refund) = 'object' then
    amt := coalesce(nullif(p_refund ->> 'amount', '')::numeric, 0);
    if amt > subtotal - disc then
      raise exception using message = 'المبلغ المسترد أكبر من قيمة الإرجاع.', errcode = 'P0001';
    end if;
    perform private.add_payments(jsonb_build_array(p_refund), case when rkind = 'sale_return' then 'out' else 'in' end::public.payment_direction,
      o.customer_id, o.supplier_id, rid, o.currency, o.exchange_rate);
  end if;
  return (select jsonb_build_object('invoice_id', i.id, 'number', i.number, 'total', i.total, 'paid', i.paid, 'currency', i.currency)
          from public.invoices i where i.id = rid);
end $$;

-- {invoice_id, items:[{invoice_item_id, qty, serials?}], refund:{method, amount, account_id?, currency?}?, reason}
create or replace function public.post_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_perm('invoices.void');
  return private.make_return(nullif(p ->> 'invoice_id', '')::uuid, p -> 'items', p -> 'refund', p ->> 'reason');
end $$;

revoke all on all functions in schema private from public;
