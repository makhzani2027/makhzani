-- المشتريات ومتوسط التكلفة، الصلاحية FEFO، السيريالات، النقل، الجرد، السندات، التعديل
set client_min_messages = notice;
select test.login('keeper');
set role authenticated;

-- شراء: متوسط التكلفة المرجّح (weightedAvgCost)
do $$
declare q0 numeric; c0 numeric; r jsonb; want numeric;
begin
  q0 := (select sum(qty) from public.stock_levels where variant_id = test.id('cup'));
  c0 := (select avg_cost from public.variant_costs where variant_id = test.id('cup'));
  r := public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 50, 'unit_cost', 3600)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 100000))));
  want := round((q0 * c0 + 50 * 3600) / (q0 + 50), 2);
  perform test.eq((select avg_cost from public.variant_costs where variant_id = test.id('cup')), want, 'شراء: متوسط التكلفة المرجّح');
  perform test.eq((select last_cost from public.variant_costs where variant_id = test.id('cup')), 3600::numeric, 'شراء: آخر تكلفة');
  perform test.ok(r ->> 'number' ~ '^P-\d{6}$' and (r ->> 'total')::numeric = 180000 and (r ->> 'due')::numeric = 80000, 'شراء: الفاتورة والمتبقي للمورد');
  perform test.eq(test.peek(format('select balance from public.supplier_balances where supplier_id = %L', test.id('supplier')))::numeric, 80000::numeric, 'شراء: رصيد المورد');
  perform test.eq(test.peek(format('select direction from public.payments where invoice_id = %L', r ->> 'invoice_id')), 'out', 'شراء: سند صرف');
end $$;

-- شراء بالكرتونة وبالدولار: التكلفة بالدينار للقطعة
do $$
declare r jsonb;
begin
  r := public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('shop'), 'currency', 'USD', 'exchange_rate', 1300,
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1, 'unit_cost', 24, 'unit_id', test.id('carton')))));
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('shop')), 12::numeric, 'شراء كرتونة: 12 قطعة');
  perform test.eq((select unit_cost from public.stock_movements where ref_id = (r ->> 'invoice_id')::uuid), 2600::numeric, 'شراء دولار: 24×1300/12 = 2600 للقطعة');
  perform test.eq(test.peek(format('select balance_usd from public.supplier_balances where supplier_id = %L', test.id('supplier')))::numeric, 24::numeric, 'شراء دولار: رصيد المورد بالدولار منفصل');
end $$;

-- الصلاحية: دفعتان، البيع يأخذ الأقرب انتهاءً
select public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('milk'), 'qty', 10, 'unit_cost', 1000, 'lot_code', 'L-LATE', 'expiry_date', (current_date + 90)::text))));
select public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('milk'), 'qty', 5, 'unit_cost', 1000, 'lot_code', 'L-SOON', 'expiry_date', (current_date + 10)::text))));
select test.throws($$select public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('milk'), 'qty', 1, 'unit_cost', 1000))))$$, 'تاريخ الصلاحية', 'صلاحية: الشراء يتطلب التاريخ');
select test.eq(jsonb_array_length(public.near_expiry(30, 10)), 1, 'near_expiry: دفعة خلال 30 يوماً');
reset role;
select test.login('cashier');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('milk'), 'qty', 7)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10500))));
  perform test.eq(test.peek('select qty from public.stock_lots where lot_code = ''L-SOON'''), '0.000', 'FEFO: الدفعة الأقرب نفدت أولاً');
  perform test.eq(test.peek('select qty from public.stock_lots where lot_code = ''L-LATE'''), '8.000', 'FEFO: الباقي من الأبعد');
  perform test.ok((select lot_code like '%L-SOON%' and lot_code like '%L-LATE%' from public.invoice_items where invoice_id = (r ->> 'invoice_id')::uuid),
    'FEFO: الدفعات مسجّلة في البند');
end $$;
reset role;

-- السيريالات: شراء ثم بيع برقم محدد
select test.login('owner');
set role authenticated;
select public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('ph'), 'qty', 2, 'unit_cost', 250000, 'serials', jsonb_build_array('IMEI-1', 'IMEI-2')))));
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('ph'), 'qty', 1)), 'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 300000))))$$,
  'رقماً تسلسلياً', 'سيريال: البيع يتطلب الرقم');
select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('ph'), 'qty', 1, 'serials', jsonb_build_array('IMEI-2'))),
  'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 300000))));
select test.eq((select status::text from public.serials where serial = 'IMEI-2'), 'sold', 'سيريال: بيع الرقم');
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('ph'), 'qty', 1, 'serials', jsonb_build_array('IMEI-2'))),
  'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 300000))))$$, 'مباع سابقاً', 'سيريال: لا يباع مرتين');

-- النقل: الرصيدان والدفعات تنتقل
do $$
declare m0 numeric; s0 numeric;
begin
  m0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  s0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('shop'));
  perform public.transfer_stock(jsonb_build_object('from_warehouse_id', test.id('main'), 'to_warehouse_id', test.id('shop'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 10), jsonb_build_object('variant_id', test.id('milk'), 'qty', 3))));
  perform test.ok((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')) = m0 - 10
    and (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('shop')) = s0 + 10, 'نقل: خرج من المصدر ودخل الوجهة');
  perform test.eq((select qty from public.stock_lots where lot_code = 'L-LATE' and warehouse_id = test.id('shop')), 3::numeric, 'نقل: الدفعة انتقلت');
  perform test.throws(format('select public.transfer_stock(%L::jsonb)', jsonb_build_object('from_warehouse_id', test.id('main'), 'to_warehouse_id', test.id('shop'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 5)))), 'الكمية غير متوفرة', 'نقل: لا يتجاوز الرصيد');
end $$;

-- الجرد
do $$
declare s jsonb; q numeric;
begin
  s := public.create_stocktake(test.id('shop'), 'جرد شهري');
  perform test.ok(s ->> 'number' ~ '^ST-\d{6}$', 'جرد: الترقيم');
  perform public.set_stocktake_count((s ->> 'id')::uuid, test.id('cup'), 20);
  perform public.set_stocktake_count((s ->> 'id')::uuid, test.id('milk'), 3);
  perform test.ok((public.apply_stocktake((s ->> 'id')::uuid) ->> 'adjusted')::int = 1, 'جرد: فرق واحد طُبّق');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('shop')), 20::numeric, 'جرد: الرصيد = المعدود');
  perform test.ok((select kind = 'stocktake' from public.stock_movements where ref_id = (s ->> 'id')::uuid), 'جرد: حركة stocktake');
  perform test.throws(format('select public.set_stocktake_count(%L, %L, 1)', s ->> 'id', test.id('cup')), 'مطبّق', 'جرد: المطبّق لا يُعدَّل');
end $$;

-- السندات المخزنية بأنواعها
do $$
declare q0 numeric; r jsonb;
begin
  q0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  r := public.post_stock_voucher(jsonb_build_object('kind', 'in', 'warehouse_id', test.id('main'), 'reason', 'هدية من المورد',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 5))));
  perform test.ok(r ->> 'number' ~ '^SV-\d{6}$', 'سند: الترقيم SV');
  perform public.post_stock_voucher(jsonb_build_object('kind', 'sample_out', 'warehouse_id', test.id('main'), 'reason', 'عينة لمعرض',
    'customer_id', test.id('cust_b_c'), 'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2))));
  perform public.post_stock_voucher(jsonb_build_object('kind', 'sample_return', 'warehouse_id', test.id('main'), 'reason', 'رجعت العينة',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1))));
  perform public.post_stock_voucher(jsonb_build_object('kind', 'damage', 'warehouse_id', test.id('main'), 'reason', 'كسر',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1))));
  perform public.post_stock_voucher(jsonb_build_object('kind', 'out', 'warehouse_id', test.id('main'), 'reason', 'استعمال داخلي',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1))));
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0 + 5 - 2 + 1 - 1 - 1, 'سندات: الرصيد صحيح');
  perform test.eq((select string_agg(kind::text, ',' order by id) from public.stock_movements where ref_type = 'voucher'),
    'manual_in,sample_out,sample_return,damage,manual_out', 'سندات: أنواع الحركات');
end $$;

-- التعديل
do $$
begin
  perform public.adjust_stock(jsonb_build_object('variant_id', test.id('hid'), 'warehouse_id', test.id('main'), 'mode', 'set', 'qty', 2, 'note', 'تصحيح'));
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('hid') and warehouse_id = test.id('main')), 2::numeric, 'تعديل: set');
  perform test.throws(format('select public.adjust_stock(%L::jsonb)', jsonb_build_object('variant_id', test.id('hid'), 'warehouse_id', test.id('main'),
    'mode', 'delta', 'qty', -5, 'note', 'x')), 'الكمية غير متوفرة', 'تعديل: منع السالب');
  perform test.throws(format('select public.adjust_stock(%L::jsonb)', jsonb_build_object('variant_id', test.id('hid'), 'warehouse_id', test.id('main'),
    'mode', 'delta', 'qty', 1)), 'سبب', 'تعديل: يتطلب السبب');
end $$;
select test.ok(jsonb_array_length(public.inventory_valuation()) = 2, 'تقييم المخزون: صف لكل مخزن');
reset role;
select test.login('cashier');
set role authenticated;
select test.throws($$select public.adjust_stock('{}'::jsonb)$$, 'لا تملك صلاحية', 'كاشير: لا يعدّل المخزون');
select test.throws($$select public.inventory_valuation()$$, 'لا تملك صلاحية', 'كاشير: لا يرى تقييم التكلفة');
reset role;
