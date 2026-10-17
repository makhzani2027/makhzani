-- =============================================================================
-- رقيم — ١٣: البيع المباشر — pos_checkout (وconvert_quotation يستعمل نفس القلب) وجلسات الصندوق
-- التسعير مطابق لـ computeTotals و tender في packages/shared/src/pricing.ts:
--   بند = round(qty × unit_price − min(discount, gross)) ← المجموع ← خصم الفاتورة (≤ المجموع) ← الإجمالي
--   الفكة = min(max(المدفوع − الإجمالي, 0), النقد)، والمتبقي دين على الزبون.
-- آمن لإعادة التشغيل
-- =============================================================================

-- سعر النسخة بعملة المستند: سعر المتجر بالدينار، وللدولار يُقسم على سعر الصرف (سنتان)
create or replace function private.variant_price(
  p_variant uuid, p_tier public.price_tier, p_unit uuid, p_cur public.currency_code, p_rate numeric,
  out unit_price numeric, out factor numeric, out unit_name text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.product_variants;
  u public.variant_units;
  base numeric;
begin
  select * into v from public.product_variants x where x.id = p_variant;
  factor := 1;
  unit_name := null;
  if p_unit is not null then
    select * into u from public.variant_units x where x.id = p_unit and x.variant_id = p_variant;
    if u.id is null then
      raise exception using message = 'وحدة التعبئة لا تخص هذا المنتج.', errcode = 'P0001';
    end if;
    factor := u.factor;
    unit_name := u.unit_name;
  end if;
  if p_tier = 'wholesale' then
    base := coalesce(v.wholesale_price, v.price) * factor;
  else
    base := coalesce(u.price, v.price * factor);
  end if;
  unit_price := case when p_cur = 'IQD' then round(base, 0) else round(base / p_rate, 2) end;
end $$;

-- قلب فاتورة البيع: يتحقق، يسعّر، يخصم المخزون (FEFO/سيريالات)، يسجل الدفعات والفكة، ويفحص حد الدين.
-- p_trusted = أسعار البنود مثبّتة سلفاً (عرض سعر ساري) فلا تحتاج pos.price_override.
create or replace function private.post_sale(p jsonb, p_channel public.invoice_channel, p_quotation uuid, p_trusted boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  wh public.warehouses;
  cust public.customers;
  cur public.currency_code := coalesce(nullif(p ->> 'currency', ''), 'IQD')::public.currency_code;
  rate numeric;
  it jsonb;
  pay jsonb;
  vid uuid;
  v public.product_variants;
  pr public.products;
  pz record;
  tier public.price_tier;
  qty numeric;
  price numeric;
  disc numeric;
  gross numeric;
  lt numeric;
  v_avg numeric;
  prate numeric;
  pieces numeric;
  sers text[];
  lots jsonb;
  subtotal numeric := 0;
  inv_disc numeric;
  total numeric;
  cost_total numeric := 0;
  paid numeric := 0;
  cash numeric := 0;
  amt numeric;
  pcur public.currency_code;
  change numeric;
  left_change numeric;
  due numeric;
  bal numeric;
  iid uuid;
  num text;
  sess uuid;
  ids uuid[];
begin
  if p is null or jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'الفاتورة فارغة. أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  if jsonb_array_length(p -> 'items') > 300 then
    raise exception using message = 'عدد البنود كبير جداً.', errcode = 'P0001';
  end if;
  select * into wh from public.warehouses w where w.id = nullif(p ->> 'warehouse_id', '')::uuid and w.is_active;
  if wh.id is null then
    raise exception using message = 'اختر المخزن.', errcode = 'P0001';
  end if;
  if cur = 'USD' then
    rate := coalesce(nullif(p ->> 'exchange_rate', '')::numeric, private.usd_rate());
    if rate <= 0 then raise exception using message = 'سعر الصرف غير صالح.', errcode = 'P0001'; end if;
  else
    rate := 1;
  end if;
  if nullif(p ->> 'customer_id', '') is not null then
    select * into cust from public.customers c where c.id = (p ->> 'customer_id')::uuid;
    if cust.id is null then
      raise exception using message = 'الزبون غير موجود.', errcode = 'P0001';
    end if;
  else
    select * into cust from public.customers c where c.is_cash_customer limit 1;
  end if;

  -- قفل النسخ بترتيب ثابت قبل أي قراءة للرصيد
  ids := array(select distinct (x ->> 'variant_id')::uuid from jsonb_array_elements(p -> 'items') x);
  if exists (select 1 from unnest(ids) i where i is null) then
    raise exception using message = 'بند بلا منتج.', errcode = 'P0001';
  end if;
  perform private.lock_variants(ids);

  num := public.next_doc_number('sale');
  sess := case when uid is not null then private.open_session_of(uid) end;
  insert into public.invoices (number, kind, channel, customer_id, warehouse_id, branch_id, quotation_id, currency, exchange_rate,
    note, cash_session_id, created_by)
  values (num, 'sale', p_channel, cust.id, wh.id, wh.branch_id, p_quotation, cur, rate,
    left(nullif(btrim(p ->> 'note'), ''), 500), sess, uid)
  returning id into iid;

  for it in select x from jsonb_array_elements(p -> 'items') x order by x ->> 'variant_id' loop
    vid := (it ->> 'variant_id')::uuid;
    select * into v from public.product_variants x where x.id = vid;
    select * into pr from public.products x where x.id = v.product_id;
    if v.id is null or not v.is_active or pr.archived_at is not null then
      raise exception using message = 'منتج غير موجود أو مؤرشف في الفاتورة.', errcode = 'P0001';
    end if;
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if qty <= 0 then
      raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001';
    end if;
    tier := coalesce(nullif(it ->> 'price_tier', ''), 'retail')::public.price_tier;
    select * into pz from private.variant_price(vid, tier, nullif(it ->> 'unit_id', '')::uuid, cur, rate);
    price := pz.unit_price;
    if nullif(it ->> 'unit_price', '') is not null and (it ->> 'unit_price')::numeric is distinct from price then
      if (it ->> 'unit_price')::numeric < 0 then
        raise exception using message = 'السعر لا يكون سالباً.', errcode = 'P0001';
      end if;
      if not p_trusted and not public.has_perm('pos.price_override') then
        raise exception using message = 'تغيير السعر يتطلب صلاحية تعديل الأسعار.', errcode = 'P0001';
      end if;
      price := private.round_cur((it ->> 'unit_price')::numeric, cur);
    end if;
    gross := price * qty;
    disc := greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0);
    if disc > 0 and not p_trusted and not public.has_perm('pos.discount') then
      raise exception using message = 'الخصم يتطلب صلاحية الخصم.', errcode = 'P0001';
    end if;
    disc := least(disc, gross);
    lt := private.round_cur(gross - disc, cur);
    subtotal := subtotal + lt;

    pieces := qty * pz.factor;
    select coalesce(c.avg_cost, 0) into v_avg from public.variant_costs c where c.variant_id = vid;
    v_avg := coalesce(v_avg, 0);

    -- السيريالات: عدد القطع بالضبط، وكلها في هذا المخزن
    sers := private.jtext_array(it -> 'serials');
    if pr.track_serials then
      if cardinality(sers) <> pieces then
        raise exception using errcode = 'P0001', message = format('أدخل %s رقماً تسلسلياً لـ «%s».', private.fmt_qty(pieces), private.variant_label(vid));
      end if;
      update public.serials s set status = 'sold', sale_invoice_id = iid, warehouse_id = null
        where s.variant_id = vid and s.serial = any (sers) and s.status in ('in_stock', 'returned') and s.warehouse_id = wh.id;
      if (select count(*) from public.serials s where s.sale_invoice_id = iid and s.variant_id = vid and s.serial = any (sers)) <> cardinality(sers) then
        raise exception using message = 'رقم تسلسلي غير موجود في هذا المخزن أو مباع سابقاً.', errcode = 'P0001';
      end if;
    end if;

    perform private.apply_movement(vid, wh.id, -pieces, 'sale', v_avg, 'invoice', iid, null);
    lots := private.last_lots();

    insert into public.invoice_items (invoice_id, variant_id, product_id, name, variant_title, sku, qty, unit_price, discount,
      line_total, unit_cost, serials, price_tier, unit_name, unit_factor, lot_code, expiry_date)
    values (iid, vid, pr.id, pr.name, nullif(v.title, 'افتراضي'), v.sku, qty, price, private.round_cur(disc, cur), lt,
      round(v_avg * pz.factor, 2), sers, tier, pz.unit_name, pz.factor,
      case when jsonb_array_length(lots) > 0 then (select string_agg(l ->> 'lot_code', '، ') from jsonb_array_elements(lots) l) end,
      case when jsonb_array_length(lots) > 0 then (select min((l ->> 'expiry_date')::date) from jsonb_array_elements(lots) l) end);
    cost_total := cost_total + round(v_avg * pieces, 2);
  end loop;

  subtotal := private.round_cur(subtotal, cur);
  inv_disc := greatest(coalesce(nullif(p ->> 'discount', '')::numeric, 0), 0);
  if inv_disc > 0 and not p_trusted and not public.has_perm('pos.discount') then
    raise exception using message = 'الخصم يتطلب صلاحية الخصم.', errcode = 'P0001';
  end if;
  inv_disc := private.round_cur(least(inv_disc, subtotal), cur);
  total := subtotal - inv_disc;
  update public.invoices set subtotal = post_sale.subtotal, discount = inv_disc, total = post_sale.total,
    cost_total = post_sale.cost_total where id = iid;

  -- الدفعات بعملة الفاتورة للمقارنة (tender)
  if p -> 'payments' is not null and jsonb_typeof(p -> 'payments') <> 'array' then
    raise exception using message = 'صيغة الدفعات غير صالحة.', errcode = 'P0001';
  end if;
  for pay in select x from jsonb_array_elements(coalesce(p -> 'payments', '[]')) x loop
    amt := coalesce(nullif(pay ->> 'amount', '')::numeric, 0);
    if amt < 0 then raise exception using message = 'مبلغ الدفعة لا يكون سالباً.', errcode = 'P0001'; end if;
    pcur := coalesce(nullif(pay ->> 'currency', ''),
      (select a.currency::text from public.money_accounts a where a.id = nullif(pay ->> 'account_id', '')::uuid), cur::text)::public.currency_code;
    prate := case when cur = 'USD' then rate when pcur = 'USD' then coalesce(nullif(pay ->> 'exchange_rate', '')::numeric, private.usd_rate()) else 1 end;
    amt := private.convert(amt, pcur, cur, prate);
    paid := paid + amt;
    if pay ->> 'method' = 'cash' then cash := cash + amt; end if;
  end loop;
  paid := private.round_cur(paid, cur);
  change := private.round_cur(least(greatest(paid - total, 0), cash), cur);
  due := greatest(total - (paid - change), 0);

  -- الآجل: زبون معروف، وحد الدين (بالدينار المكافئ)
  if due > 0 then
    if cust.id is null or cust.is_cash_customer then
      raise exception using message = 'البيع بالآجل يتطلب اختيار زبون مسجّل.', errcode = 'P0001';
    end if;
    if cust.credit_limit is not null then
      select coalesce(b.balance, 0) + coalesce(round(b.balance_usd * private.usd_rate(), 0), 0) into bal
        from public.customer_balances b where b.customer_id = cust.id;
      -- الرصيد يشمل هذه الفاتورة الآن (إجماليها) قبل تسجيل دفعاتها
      bal := coalesce(bal, 0) - private.convert(total, cur, 'IQD', rate) + private.convert(due, cur, 'IQD', rate);
      if bal > cust.credit_limit then
        raise exception using errcode = 'P0001', message = format('تجاوز حد الدين للزبون «%s» (الحد %s).', cust.name, private.fmt_qty(cust.credit_limit));
      end if;
    end if;
  end if;

  -- تسجيل الدفعات: الفكة تُطرح من الدفعات النقدية
  left_change := change;
  for pay in select x from jsonb_array_elements(coalesce(p -> 'payments', '[]')) x loop
    amt := coalesce(nullif(pay ->> 'amount', '')::numeric, 0);
    continue when amt <= 0;
    pcur := coalesce(nullif(pay ->> 'currency', ''),
      (select a.currency::text from public.money_accounts a where a.id = nullif(pay ->> 'account_id', '')::uuid), cur::text)::public.currency_code;
    prate := case when cur = 'USD' then rate when pcur = 'USD' then coalesce(nullif(pay ->> 'exchange_rate', '')::numeric, private.usd_rate()) else 1 end;
    if pay ->> 'method' = 'cash' and left_change > 0 then
      declare eq numeric := private.convert(amt, pcur, cur, prate); take numeric;
      begin
        take := least(left_change, eq);
        left_change := left_change - take;
        amt := case when take >= eq then 0 else private.convert(eq - take, cur, pcur, prate) end;
      end;
      continue when amt <= 0;
    end if;
    perform private.add_payment('in', (pay ->> 'method')::public.payment_method, amt, cust.id, null, iid, null,
      pay ->> 'reference', null, pcur, case when pcur = 'USD' then prate end, nullif(pay ->> 'account_id', '')::uuid);
  end loop;
  perform private.refresh_invoice_paid(iid);

  return jsonb_build_object('invoice_id', iid, 'number', num, 'total', total, 'paid', paid - change, 'due', due,
    'change', change, 'currency', cur);
end $$;

-- نقطة البيع: {warehouse_id, customer_id?, currency?, exchange_rate?, items:[{variant_id, qty, unit_price?, discount?, serials?,
-- price_tier?, unit_id?}], discount?, payments:[{method, amount, reference?, account_id?, currency?}], note?}
-- يعيد {invoice_id, number, total, paid, due, change, currency}
create or replace function public.pos_checkout(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_perm('pos.sell');
  return private.post_sale(p, 'pos', null, false);
end $$;

-- جلسة الصندوق: واحدة مفتوحة لكل موظف
create or replace function public.open_cash_session(opening_float numeric default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.cash_sessions;
begin
  if not (public.has_perm('pos.sell') or public.has_perm('finance.manage')) then
    perform private.require_perm('pos.sell');
  end if;
  if private.open_session_of(auth.uid()) is not null then
    raise exception using message = 'لديك جلسة صندوق مفتوحة. أغلقها أولاً.', errcode = 'P0001';
  end if;
  if coalesce(opening_float, 0) < 0 then
    raise exception using message = 'المبلغ الافتتاحي لا يكون سالباً.', errcode = 'P0001';
  end if;
  insert into public.cash_sessions (opened_by, opening_float) values (auth.uid(), round(coalesce(opening_float, 0), 0))
  returning * into s;
  return to_jsonb(s);
end $$;

-- المتوقع = الافتتاحي + نقد داخل − نقد خارج − مصروفات نقدية في الجلسة (بالدينار)
create or replace function private.session_expected(sid uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select s.opening_float
    + coalesce((select sum(case when p.direction = 'in' then p.amount else -p.amount end) from public.payments p
                where p.cash_session_id = sid and p.method = 'cash' and p.currency = 'IQD' and p.voided_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e
                where e.cash_session_id = sid and e.method = 'cash' and e.currency = 'IQD'), 0)
  from public.cash_sessions s where s.id = sid
$$;

create or replace function public.close_cash_session(counted numeric, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  s public.cash_sessions;
begin
  if not (public.has_perm('pos.sell') or public.has_perm('finance.manage')) then
    perform private.require_perm('pos.sell');
  end if;
  sid := private.open_session_of(auth.uid());
  if sid is null then
    raise exception using message = 'لا توجد جلسة صندوق مفتوحة.', errcode = 'P0001';
  end if;
  if counted is null or counted < 0 then
    raise exception using message = 'أدخل المبلغ المعدود في الصندوق.', errcode = 'P0001';
  end if;
  update public.cash_sessions set status = 'closed', closed_by = auth.uid(), closed_at = now(),
    expected_cash = private.session_expected(sid), counted_cash = round(counted, 0),
    note = nullif(btrim(close_cash_session.note), '')
  where id = sid returning * into s;
  return to_jsonb(s) || jsonb_build_object('difference', s.counted_cash - s.expected_cash);
end $$;

revoke all on all functions in schema private from public;
