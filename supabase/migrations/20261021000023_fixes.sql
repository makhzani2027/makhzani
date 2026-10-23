-- =============================================================================
-- رقيم — ٢٣: إصلاحات المراجعة الثانية. آمن لإعادة التشغيل (create or replace / drop policy if exists)
-- ١) post_sale: رقم تسلسلي مكرر في بندين لنفس المنتج كان يمر (العدّ بعد التحديث يرى الصف نفسه مرتين ← بيع قطعتين برقم واحد)؛
--    حد الدين بلا قفل (بيعان آجلان متزامنان يتجاوزانه)؛ وإعداد pos.require_cash_session كان في الواجهة فقط.
-- ٢) transfer_stock: رقم موجود أصلاً في الوجهة كان يُحسب منقولاً ← الرصيد ينتقل والرقم يبقى في المصدر.
-- ٣) make_return: رقم تسلسلي يُرجع مرتين، أو رقم أُعيد بيعه بفاتورة أخرى يُنتزع منها؛ وإرجاع المشتريات بلا تحقق من الرقم.
-- ٤) void_invoice لإرجاع بيع: الرقم يعود مباعاً بالفاتورة الأصلية، ويُرفض إن بيع مجدداً.
-- ٥) save_quotation: مسار تغيير الحالة فقط {id, status} بلا إعادة تسعير.
-- ٦) app_settings: store.manage يحفظ مفتاح checkout وحده (صفحة التوصيل في اللوحة).
-- ٧) reviews: من يملك products.write يغيّر is_visible فقط، لا تقييم الزبون ولا تعليقه.
-- ٨) upsert_product: حفظ النموذج بنفس التكلفة لا يكتب فوق avg_cost/last_cost.
-- ٩) purchases.manage يقرأ فواتير الشراء وإرجاعه وبنودها ودفعات الموردين (أمين المخزن كان يرى قائمة فارغة).
-- ١٠) RPC جديدة: cancel_stocktake، add_serials، mark_serial_defective، register_push_token.
-- ١١) الصندوق الافتراضي واحد لكل عملة (لا واحد للمتجر كله).
-- ١٢) inventory_valuation: reports.view أو costs.view، وأعمدة التكلفة null بلا costs.view.
-- ١٣) customers: finance.view يقرأ الزبائن (أرصدة الديون عبر customer_balances).
-- =============================================================================

create or replace function private.post_sale(p jsonb, p_channel public.invoice_channel, p_quotation uuid, p_trusted boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
<<fn>>
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
  n_ser int;
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

  sess := case when uid is not null then private.open_session_of(uid) end;
  -- إعداد «لا بيع بلا جلسة صندوق مفتوحة» يُفرض هنا أيضاً (كان في الواجهة فقط فيتجاوزه استدعاء RPC مباشر)
  if p_channel = 'pos' and sess is null and coalesce((private.setting('pos') ->> 'require_cash_session')::boolean, false) then
    raise exception using message = 'افتح جلسة الصندوق أولاً قبل البيع.', errcode = 'P0001';
  end if;
  num := public.next_doc_number('sale');
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
      -- عدد الصفوف التي تغيّرت فعلاً: رقم مكرر في بندين (أو في البند نفسه) لا يُحسب مرتين
      get diagnostics n_ser = row_count;
      if n_ser <> cardinality(sers) then
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
  update public.invoices set subtotal = fn.subtotal, discount = inv_disc, total = fn.total,
    cost_total = fn.cost_total where id = iid;

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
      -- قفل الزبون: بيعان آجلان متزامنان لا يتجاوزان الحد معاً (الثاني يرى فاتورة الأول بعد انتظاره)
      perform 1 from public.customers c where c.id = cust.id for no key update;
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

create or replace function public.transfer_stock(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fw uuid := nullif(p ->> 'from_warehouse_id', '')::uuid;
  tw uuid := nullif(p ->> 'to_warehouse_id', '')::uuid;
  it jsonb;
  vid uuid;
  q numeric;
  v_avg numeric;
  sers text[];
  lot jsonb;
  out_lots jsonb;
  tid uuid;
  num text;
  n_ser int;
begin
  perform private.require_perm('inventory.transfer');
  if fw is null or tw is null or fw = tw then
    raise exception using message = 'اختر مخزنين مختلفين.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = tw and w.is_active) then
    raise exception using message = 'المخزن غير موجود أو معطّل.', errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  perform private.lock_variants(array(select distinct (x ->> 'variant_id')::uuid from jsonb_array_elements(p -> 'items') x));
  num := public.next_doc_number('transfer');
  insert into public.transfers (number, from_warehouse_id, to_warehouse_id, note, created_by)
  values (num, fw, tw, left(nullif(btrim(p ->> 'note'), ''), 500), auth.uid()) returning id into tid;

  for it in select x from jsonb_array_elements(p -> 'items') x order by x ->> 'variant_id' loop
    vid := (it ->> 'variant_id')::uuid;
    q := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if q <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    if exists (select 1 from public.transfer_items ti where ti.transfer_id = tid and ti.variant_id = vid) then
      raise exception using message = 'منتج مكرر في سند النقل.', errcode = 'P0001';
    end if;
    sers := private.jtext_array(it -> 'serials');
    if (select pr.track_serials from public.product_variants v join public.products pr on pr.id = v.product_id where v.id = vid) then
      if cardinality(sers) <> q then
        raise exception using errcode = 'P0001', message = format('أدخل %s رقماً تسلسلياً لـ «%s».', private.fmt_qty(q), private.variant_label(vid));
      end if;
      update public.serials set warehouse_id = tw where variant_id = vid and serial = any (sers) and warehouse_id = fw and status in ('in_stock', 'returned');
      -- المنقول فعلاً من المصدر (رقم موجود أصلاً في الوجهة أو مكرر لا يُحسب)
      get diagnostics n_ser = row_count;
      if n_ser <> cardinality(sers) then
        raise exception using message = 'رقم تسلسلي غير موجود في المخزن المصدر.', errcode = 'P0001';
      end if;
    end if;
    select coalesce(c.avg_cost, 0) into v_avg from public.variant_costs c where c.variant_id = vid;
    perform private.apply_movement(vid, fw, -q, 'transfer_out', v_avg, 'transfer', tid, num);
    out_lots := private.last_lots();
    if jsonb_array_length(out_lots) > 0 then
      for lot in select x from jsonb_array_elements(out_lots) x loop
        perform private.apply_movement(vid, tw, (lot ->> 'qty')::numeric, 'transfer_in', v_avg, 'transfer', tid, num,
          lot ->> 'lot_code', nullif(lot ->> 'expiry_date', '')::date);
      end loop;
      -- رصيد قديم بلا دفعات
      lot := (select jsonb_build_object('n', coalesce(sum((x ->> 'qty')::numeric), 0)) from jsonb_array_elements(out_lots) x);
      if (lot ->> 'n')::numeric < q then
        perform private.apply_movement(vid, tw, q - (lot ->> 'n')::numeric, 'transfer_in', v_avg, 'transfer', tid, num);
      end if;
    else
      perform private.apply_movement(vid, tw, q, 'transfer_in', v_avg, 'transfer', tid, num);
    end if;
    insert into public.transfer_items (transfer_id, variant_id, qty) values (tid, vid, q);
  end loop;
  return jsonb_build_object('transfer_id', tid, 'number', num);
end $$;

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
  n_ser int;
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
  values (num, rkind, (case when o.channel = 'online' then 'online' else 'manual' end)::public.invoice_channel, 'posted', o.customer_id, o.supplier_id,
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
        -- فقط رقم ما زال مباعاً بهذه الفاتورة (لا يُرجع مرتين، ولا يُمس رقم أُعيد بيعه بفاتورة أخرى)
        update public.serials set status = 'returned', warehouse_id = o.warehouse_id, sale_invoice_id = null
          where variant_id = oi.variant_id and serial = any (sers) and status = 'sold' and sale_invoice_id = o.id;
      else
        update public.serials set status = 'defective', warehouse_id = null, note = 'أُرجع للمورد ' || num
          where variant_id = oi.variant_id and serial = any (sers) and status in ('in_stock', 'returned') and warehouse_id = o.warehouse_id;
      end if;
      get diagnostics n_ser = row_count;
      if n_ser <> cardinality(sers) then
        raise exception using errcode = 'P0001', message = format('رقم تسلسلي مرتجع سابقاً أو غير موجود لـ «%s».', oi.name);
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

create or replace function public.void_invoice(id uuid, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  ii public.invoice_items;
  pieces numeric;
  k public.movement_kind;
  single_lot boolean;
  n_ser int;
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
        -- الرقم المرتجع يعود مباعاً بالفاتورة الأصلية — إلا إن بيع مجدداً (فإلغاء الإرجاع يُنقص الرصيد مرتين)
        update public.serials set status = 'sold', sale_invoice_id = i.return_of, warehouse_id = null
          where variant_id = ii.variant_id and serial = any (ii.serials) and status = 'returned';
        get diagnostics n_ser = row_count;
        if n_ser <> cardinality(ii.serials) then
          raise exception using message = 'بعض الأرقام التسلسلية المرتجعة بيعت مجدداً؛ لا يمكن إلغاء الإرجاع.', errcode = 'P0001';
        end if;
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
  -- تغيير الحالة فقط: {id, status} بلا بنود ← لا يُعاد التسعير ولا تُمس البنود
  if qid is not null and not (p ? 'items') and (p ? 'status') then
    select * into q from public.quotations x where x.id = qid for update;
    if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
    if q.status = 'converted' then raise exception using message = 'عرض السعر حُوّل لفاتورة ولا يُعدَّل.', errcode = 'P0001'; end if;
    update public.quotations set status = st where id = qid;
    return (select to_jsonb(x) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.name)
              from public.quotation_items i where i.quotation_id = x.id), '[]'::jsonb))
            from public.quotations x where x.id = qid);
  end if;
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

create or replace function public.upsert_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := nullif(p ->> 'id', '')::uuid;
  cur public.products;
  v_name text;
  v_slug text;
  base_slug text;
  n int := 1;
  can_cost boolean := public.has_perm('costs.view');
  v jsonb;
  o jsonb;
  u jsonb;
  vid uuid;
  keep_variants uuid[] := '{}';
  keep_units uuid[];
  keep_images uuid[] := '{}';
  is_new_variant boolean;
  cname text;
  img jsonb;
  iid uuid;
  wid uuid;
begin
  perform private.require_perm('products.write');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using message = 'بيانات المنتج غير صالحة.', errcode = 'P0001';
  end if;
  if pid is not null then
    select * into cur from public.products where id = pid for update;
    if cur.id is null then
      raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
    end if;
  end if;
  v_name := coalesce(nullif(btrim(p ->> 'name'), ''), cur.name);
  if v_name is null then
    raise exception using message = 'اسم المنتج مطلوب.', errcode = 'P0001';
  end if;
  if (p ? 'category_id') and nullif(p ->> 'category_id', '') is not null
     and not exists (select 1 from public.categories c where c.id = (p ->> 'category_id')::uuid) then
    raise exception using message = 'القسم غير موجود.', errcode = 'P0001';
  end if;
  if (p ? 'brand_id') and nullif(p ->> 'brand_id', '') is not null
     and not exists (select 1 from public.brands b where b.id = (p ->> 'brand_id')::uuid) then
    raise exception using message = 'العلامة التجارية غير موجودة.', errcode = 'P0001';
  end if;

  -- slug فريد: من المدخل أو من الاسم (مثل slugify في shared) مع لاحقة -2، -3…
  base_slug := left(replace(public.normalize_ar(coalesce(nullif(btrim(p ->> 'slug'), ''), case when pid is null then v_name end, cur.slug)), ' ', '-'), 80);
  if base_slug = '' then base_slug := 'item'; end if;
  v_slug := base_slug;
  while exists (select 1 from public.products x where x.slug = v_slug and x.id is distinct from pid) loop
    n := n + 1;
    v_slug := base_slug || '-' || n;
  end loop;

  if pid is null then
    if not (p ? 'variants') or jsonb_typeof(p -> 'variants') <> 'array' or jsonb_array_length(p -> 'variants') = 0 then
      raise exception using message = 'أضف نسخة واحدة على الأقل (السعر و SKU).', errcode = 'P0001';
    end if;
    insert into public.products (name, slug, created_by) values (v_name, v_slug, auth.uid()) returning * into cur;
    pid := cur.id;
  end if;

  update public.products set
    name = v_name,
    slug = v_slug,
    description = case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else description end,
    category_id = case when p ? 'category_id' then nullif(p ->> 'category_id', '')::uuid else category_id end,
    brand_id = case when p ? 'brand_id' then nullif(p ->> 'brand_id', '')::uuid else brand_id end,
    unit = case when p ? 'unit' then coalesce(nullif(btrim(p ->> 'unit'), ''), 'قطعة') else unit end,
    tags = case when p ? 'tags' then private.jtext_array(p -> 'tags') else tags end,
    specs = case when p ? 'specs' and jsonb_typeof(p -> 'specs') = 'array' then p -> 'specs' else specs end,
    warranty = case when p ? 'warranty' then nullif(btrim(p ->> 'warranty'), '') else warranty end,
    option_names = case when p ? 'option_names' then private.jtext_array(p -> 'option_names') else option_names end,
    track_serials = coalesce((p ->> 'track_serials')::boolean, track_serials),
    track_expiry = coalesce((p ->> 'track_expiry')::boolean, track_expiry),
    is_published = coalesce((p ->> 'is_published')::boolean, is_published),
    is_featured = coalesce((p ->> 'is_featured')::boolean, is_featured),
    allow_request = coalesce((p ->> 'allow_request')::boolean, allow_request)
  where id = pid;

  if p ? 'variants' then
    if jsonb_typeof(p -> 'variants') <> 'array' or jsonb_array_length(p -> 'variants') = 0 then
      raise exception using message = 'أضف نسخة واحدة على الأقل (السعر و SKU).', errcode = 'P0001';
    end if;
    for v in select * from jsonb_array_elements(p -> 'variants') loop
      vid := nullif(v ->> 'id', '')::uuid;
      is_new_variant := vid is null;
      if coalesce((v ->> 'price')::numeric, 0) < 0 or coalesce((v ->> 'compare_at_price')::numeric, 0) < 0
         or coalesce((v ->> 'wholesale_price')::numeric, 0) < 0 or coalesce((v ->> 'min_stock')::numeric, 0) < 0 then
        raise exception using message = 'الأسعار والكميات لا تكون سالبة.', errcode = 'P0001';
      end if;
      begin
        if is_new_variant then
          insert into public.product_variants (product_id, title, options, sku, barcode, price, compare_at_price, wholesale_price,
            min_stock, image_key, weight_g, is_active, sort)
          values (pid, coalesce(nullif(btrim(v ->> 'title'), ''), 'افتراضي'), coalesce(v -> 'options', '{}'::jsonb),
            coalesce(nullif(upper(btrim(v ->> 'sku')), ''), 'SKU-' || lpad(nextval('private.sku_seq')::text, 6, '0')),
            nullif(btrim(v ->> 'barcode'), ''), coalesce((v ->> 'price')::numeric, 0), (v ->> 'compare_at_price')::numeric,
            (v ->> 'wholesale_price')::numeric, coalesce((v ->> 'min_stock')::numeric, 0), nullif(v ->> 'image_key', ''),
            (v ->> 'weight_g')::int, coalesce((v ->> 'is_active')::boolean, true), coalesce((v ->> 'sort')::int, 0))
          returning id into vid;
        else
          update public.product_variants set
            title = case when v ? 'title' then coalesce(nullif(btrim(v ->> 'title'), ''), 'افتراضي') else title end,
            options = case when v ? 'options' then coalesce(v -> 'options', '{}'::jsonb) else options end,
            sku = case when v ? 'sku' and nullif(btrim(v ->> 'sku'), '') is not null then upper(btrim(v ->> 'sku')) else sku end,
            barcode = case when v ? 'barcode' then nullif(btrim(v ->> 'barcode'), '') else barcode end,
            price = coalesce((v ->> 'price')::numeric, price),
            compare_at_price = case when v ? 'compare_at_price' then (v ->> 'compare_at_price')::numeric else compare_at_price end,
            wholesale_price = case when v ? 'wholesale_price' then (v ->> 'wholesale_price')::numeric else wholesale_price end,
            min_stock = coalesce((v ->> 'min_stock')::numeric, min_stock),
            image_key = case when v ? 'image_key' then nullif(v ->> 'image_key', '') else image_key end,
            weight_g = case when v ? 'weight_g' then (v ->> 'weight_g')::int else weight_g end,
            is_active = coalesce((v ->> 'is_active')::boolean, is_active),
            sort = coalesce((v ->> 'sort')::int, sort)
          where id = vid and product_id = pid;
          if not found then
            raise exception using message = 'نسخة المنتج غير موجودة.', errcode = 'P0001';
          end if;
        end if;
      exception when unique_violation then
        get stacked diagnostics cname = constraint_name;
        raise exception using errcode = 'P0001', message = case when cname like '%barcode%'
          then 'الباركود مستعمل لمنتج آخر: ' || coalesce(v ->> 'barcode', '') else 'رمز SKU مستعمل لمنتج آخر: ' || coalesce(v ->> 'sku', '') end;
      end;
      keep_variants := keep_variants || vid;

      if can_cost and (v ? 'cost') and nullif(v ->> 'cost', '') is not null then
        if (v ->> 'cost')::numeric < 0 then
          raise exception using message = 'التكلفة لا تكون سالبة.', errcode = 'P0001';
        end if;
        insert into public.variant_costs (variant_id, avg_cost, last_cost) values (vid, (v ->> 'cost')::numeric, (v ->> 'cost')::numeric)
        -- النموذج يرسل التكلفة مع كل حفظ: لا نمس المتوسط ولا آخر تكلفة (تكلفة آخر شراء) إن لم تتغير فعلاً
        on conflict (variant_id) do update set avg_cost = excluded.avg_cost, last_cost = excluded.last_cost
          where public.variant_costs.avg_cost is distinct from excluded.avg_cost;
      end if;

      -- الرصيد الافتتاحي للنسخ الجديدة فقط (التعديل لاحقاً عبر adjust_stock)
      if is_new_variant then
        if jsonb_typeof(v -> 'opening') = 'array' then
          for o in select * from jsonb_array_elements(v -> 'opening') loop
            if coalesce((o ->> 'qty')::numeric, 0) > 0 then
              perform private.apply_movement(vid, (o ->> 'warehouse_id')::uuid, (o ->> 'qty')::numeric, 'opening',
                case when can_cost then (v ->> 'cost')::numeric end, 'adjustment', null, 'رصيد افتتاحي',
                o ->> 'lot_code', nullif(o ->> 'expiry_date', '')::date);
            end if;
          end loop;
        elsif coalesce((v ->> 'opening_qty')::numeric, 0) > 0 then
          wid := coalesce(nullif(v ->> 'opening_warehouse_id', '')::uuid,
            (select w.id from public.warehouses w where w.is_default and w.is_active limit 1));
          perform private.apply_movement(vid, wid, (v ->> 'opening_qty')::numeric, 'opening',
            case when can_cost then (v ->> 'cost')::numeric end, 'adjustment', null, 'رصيد افتتاحي');
        end if;
      end if;

      if jsonb_typeof(v -> 'units') = 'array' then
        keep_units := '{}';
        for u in select * from jsonb_array_elements(v -> 'units') loop
          if coalesce((u ->> 'factor')::numeric, 0) <= 0 or nullif(btrim(u ->> 'unit_name'), '') is null then
            raise exception using message = 'وحدة التعبئة تحتاج اسماً وعدد قطع أكبر من صفر.', errcode = 'P0001';
          end if;
          iid := null;
          begin
            if nullif(u ->> 'id', '') is null then
              insert into public.variant_units (variant_id, unit_name, factor, barcode, price)
              values (vid, btrim(u ->> 'unit_name'), (u ->> 'factor')::numeric, nullif(btrim(u ->> 'barcode'), ''), (u ->> 'price')::numeric)
              returning id into iid;
            else
              update public.variant_units set unit_name = btrim(u ->> 'unit_name'), factor = (u ->> 'factor')::numeric,
                barcode = nullif(btrim(u ->> 'barcode'), ''), price = (u ->> 'price')::numeric
              where id = (u ->> 'id')::uuid and variant_id = vid returning id into iid;
            end if;
          exception when unique_violation then
            raise exception using message = 'باركود الوحدة مستعمل مسبقاً: ' || coalesce(u ->> 'barcode', ''), errcode = 'P0001';
          end;
          if iid is not null then keep_units := keep_units || iid; end if;
        end loop;
        delete from public.variant_units where variant_id = vid and not (id = any (keep_units));
      end if;
    end loop;

    -- النسخ المحذوفة من النموذج: حذف إن لم يكن لها أثر، وإلا تعطيل
    update public.product_variants x set is_active = false
    where x.product_id = pid and not (x.id = any (keep_variants)) and x.is_active
      and (exists (select 1 from public.stock_movements m where m.variant_id = x.id)
        or exists (select 1 from public.order_items oi where oi.variant_id = x.id)
        or exists (select 1 from public.invoice_items ii where ii.variant_id = x.id)
        or exists (select 1 from public.quotation_items qi where qi.variant_id = x.id)
        or exists (select 1 from public.transfer_items ti where ti.variant_id = x.id)
        or exists (select 1 from public.stocktake_items si where si.variant_id = x.id));
    delete from public.product_variants x
    where x.product_id = pid and not (x.id = any (keep_variants))
      and not exists (select 1 from public.stock_movements m where m.variant_id = x.id)
      and not exists (select 1 from public.order_items oi where oi.variant_id = x.id)
      and not exists (select 1 from public.invoice_items ii where ii.variant_id = x.id)
      and not exists (select 1 from public.quotation_items qi where qi.variant_id = x.id)
      and not exists (select 1 from public.transfer_items ti where ti.variant_id = x.id)
      and not exists (select 1 from public.stocktake_items si where si.variant_id = x.id);
  end if;

  if jsonb_typeof(p -> 'images') = 'array' then
    for img in select * from jsonb_array_elements(p -> 'images') loop
      if nullif(btrim(img ->> 'key'), '') is null then continue; end if;
      iid := null;
      if nullif(img ->> 'id', '') is not null then
        update public.product_images set key = img ->> 'key', alt = nullif(btrim(img ->> 'alt'), ''), sort = coalesce((img ->> 'sort')::int, 0)
        where id = (img ->> 'id')::uuid and product_id = pid returning id into iid;
      else
        insert into public.product_images (product_id, key, alt, sort)
        values (pid, img ->> 'key', nullif(btrim(img ->> 'alt'), ''), coalesce((img ->> 'sort')::int, 0)) returning id into iid;
      end if;
      if iid is not null then keep_images := keep_images || iid; end if;
    end loop;
    delete from public.product_images where product_id = pid and not (id = any (keep_images));
  end if;

  update public.products set has_variants = (cardinality(option_names) > 0
    or (select count(*) from public.product_variants x where x.product_id = pid and x.is_active) > 1)
  where id = pid;

  return private.product_full(pid);
end $$;

-- ٦) صفحة «التوصيل» (store.manage) تحفظ app_settings.checkout فقط
select private.pol('app_settings', 'settings_checkout_insert', 'insert', null,
  'key = ''checkout'' and is_public and (select public.has_perm(''store.manage''))', 'authenticated');
select private.pol('app_settings', 'settings_checkout_update', 'update',
  'key = ''checkout'' and (select public.has_perm(''store.manage''))',
  'key = ''checkout'' and is_public and (select public.has_perm(''store.manage''))', 'authenticated');

-- ٧) الإشراف على التقييمات: الإظهار/الإخفاء فقط
revoke update on public.reviews from anon, authenticated;
grant update (is_visible) on public.reviews to authenticated;

revoke all on all functions in schema private from public;

-- ٩) المشتريات لمن يملك purchases.manage (سياسات إضافية تُجمع بـ OR مع القائمة)
select private.pol('invoices', 'invoices_read_purchases', 'select',
  'kind in (''purchase'', ''purchase_return'') and (select public.has_perm(''purchases.manage''))', null, 'authenticated');
select private.pol('invoice_items', 'invoice_items_read_purchases', 'select',
  'exists (select 1 from public.invoices i where i.id = invoice_id and i.kind in (''purchase'', ''purchase_return'')) and (select public.has_perm(''purchases.manage''))',
  null, 'authenticated');
select private.pol('payments', 'payments_read_purchases', 'select',
  'supplier_id is not null and (select public.has_perm(''purchases.manage''))', null, 'authenticated');

-- ١٣) الديون: finance.view يقرأ صفوف الزبائن (customer_balances بصلاحيات المستدعي)
select private.pol('customers', 'customers_read', 'select',
  'profile_id = (select auth.uid()) or (select public.has_perm(''customers.view'')) or (select public.has_perm(''finance.view''))', null, 'authenticated');

-- ١١) صندوق افتراضي واحد لكل عملة (resolve_account يختار الافتراضي بعملة الدفعة)
drop index if exists public.money_accounts_default_key;
create unique index if not exists money_accounts_default_currency_key on public.money_accounts (currency) where is_default;

-- ١٢) تقييم المخزون: نفس الشكل، والتكلفة لمن يملك costs.view فقط
create or replace function public.inventory_valuation() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  costs boolean := public.has_perm('costs.view');
begin
  if not costs then
    perform private.require_perm('reports.view');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'items', coalesce(x.items, 0), 'units', coalesce(x.units, 0),
      'cost_value', case when costs then round(coalesce(x.cost_value, 0), 0) end,
      'retail_value', round(coalesce(x.retail_value, 0), 0)) order by w.is_default desc, w.code)
    from public.warehouses w
    left join (
      select sl.warehouse_id, count(*) filter (where sl.qty > 0) as items, sum(greatest(sl.qty, 0)) as units,
        sum(greatest(sl.qty, 0) * coalesce(c.avg_cost, 0)) as cost_value, sum(greatest(sl.qty, 0) * v.price) as retail_value
      from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id
      left join public.variant_costs c on c.variant_id = sl.variant_id
      group by sl.warehouse_id
    ) x on x.warehouse_id = w.id
    where w.is_active
  ), '[]'::jsonb);
end $$;

-- ١٠) إلغاء جرد مفتوح (مسودة منسية كانت تمنع جرداً جديداً للمخزن)
create or replace function public.cancel_stocktake(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.stocktakes;
begin
  perform private.require_perm('inventory.adjust');
  select * into s from public.stocktakes x where x.id = p_id for update;
  if s.id is null then raise exception using message = 'الجرد غير موجود.', errcode = 'P0001'; end if;
  if s.status <> 'draft' then raise exception using message = 'الجرد مطبّق أو ملغى سابقاً.', errcode = 'P0001'; end if;
  update public.stocktakes set status = 'cancelled' where id = s.id;
  return jsonb_build_object('stocktake_id', s.id, 'number', s.number, 'status', 'cancelled');
end $$;

-- أرقام تسلسلية لرصيد موجود بلا أرقام (رصيد افتتاحي/قبل تفعيل التتبع). لا تتجاوز الرصيد في المخزن
create or replace function public.add_serials(p_variant uuid, p_warehouse uuid, p_serials text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sers text[] := array(select distinct btrim(x) from unnest(coalesce(p_serials, '{}')) x where btrim(x) <> '');
  have numeric;
begin
  perform private.require_perm('inventory.adjust');
  if cardinality(sers) = 0 then raise exception using message = 'أدخل رقماً تسلسلياً واحداً على الأقل.', errcode = 'P0001'; end if;
  if cardinality(sers) <> (select count(*) from unnest(p_serials) x where btrim(x) <> '') then
    raise exception using message = 'رقم تسلسلي مكرر في القائمة.', errcode = 'P0001';
  end if;
  if not coalesce((select pr.track_serials from public.product_variants v join public.products pr on pr.id = v.product_id where v.id = p_variant), false) then
    raise exception using message = 'هذا المنتج لا يتتبع الأرقام التسلسلية.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.is_active) then
    raise exception using message = 'المخزن غير موجود أو معطّل.', errcode = 'P0001';
  end if;
  perform private.lock_variants(array[p_variant]);
  if exists (select 1 from public.serials s where s.variant_id = p_variant and s.serial = any (sers)) then
    raise exception using message = 'رقم تسلسلي مسجّل سابقاً لهذا المنتج.', errcode = 'P0001';
  end if;
  select count(*) into have from public.serials s
    where s.variant_id = p_variant and s.warehouse_id = p_warehouse and s.status in ('in_stock', 'returned');
  if have + cardinality(sers) > private.qty_of(p_variant, p_warehouse) then
    raise exception using errcode = 'P0001', message = format('الأرقام أكثر من الرصيد بلا أرقام في المخزن (المتاح %s).',
      private.fmt_qty(greatest(floor(private.qty_of(p_variant, p_warehouse)) - have, 0)));
  end if;
  insert into public.serials (variant_id, serial, status, warehouse_id, note)
  select p_variant, x, 'in_stock', p_warehouse, 'أُضيف لرصيد موجود' from unnest(sers) x;
  return jsonb_build_object('variant_id', p_variant, 'warehouse_id', p_warehouse, 'added', cardinality(sers));
end $$;

-- رقم تسلسلي تالف: يخرج من الرصيد بحركة damage (الرقم والرصيد يبقيان متطابقين)
create or replace function public.mark_serial_defective(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.serials;
  newq numeric;
begin
  perform private.require_perm('inventory.adjust');
  select * into s from public.serials x where x.id = p_id;
  if s.id is null then raise exception using message = 'الرقم التسلسلي غير موجود.', errcode = 'P0001'; end if;
  perform private.lock_variants(array[s.variant_id]);
  select * into s from public.serials x where x.id = p_id for update;
  if s.status not in ('in_stock', 'returned') or s.warehouse_id is null then
    raise exception using message = 'الرقم ليس في المخزون (مباع أو تالف سابقاً).', errcode = 'P0001';
  end if;
  newq := private.apply_movement(s.variant_id, s.warehouse_id, -1, 'damage', null, 'adjustment', null,
    concat_ws(' — ', 'تالف: ' || s.serial, nullif(btrim(p_note), '')));
  update public.serials set status = 'defective', warehouse_id = null, note = coalesce(nullif(btrim(p_note), ''), note)
    where id = s.id;
  return jsonb_build_object('serial_id', s.id, 'status', 'defective', 'warehouse_id', s.warehouse_id, 'qty', newq);
end $$;

-- رمز الجهاز للإشعارات: الحساب الذي سجّل الدخول الآن على الجهاز يأخذ الرمز (upsert العميل كان يُرفض بـ RLS
-- لأن الصف يخص الحساب السابق على الهاتف نفسه، فلا تصل إشعارات الحساب الجديد وتصل إشعارات القديم)
create or replace function public.register_push_token(p_token text, p_platform text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t text := btrim(coalesce(p_token, ''));
  r public.push_tokens;
begin
  if uid is null then raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001'; end if;
  if length(t) < 10 or length(t) > 4096 then raise exception using message = 'رمز الجهاز غير صالح.', errcode = 'P0001'; end if;
  if p_platform is null or p_platform not in ('android', 'ios', 'web') then
    raise exception using message = 'المنصة غير صالحة.', errcode = 'P0001';
  end if;
  insert into public.push_tokens as x (profile_id, token, platform) values (uid, t, p_platform)
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'platform', r.platform);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.cancel_stocktake(uuid)', 'public.add_serials(uuid, uuid, text[])',
    'public.mark_serial_defective(uuid, text)', 'public.register_push_token(text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on all functions in schema private from public;
