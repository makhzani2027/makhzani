-- نقطة البيع: البيع والمخزون والتكلفة والفكة والوحدات والجملة والدولار والآجل والجلسة
set client_min_messages = notice;
select test.login('cashier');
set role authenticated;

select test.ok((public.open_cash_session(50000) ->> 'status') = 'open', 'جلسة: فتح الصندوق');
select test.throws($$select public.open_cash_session(0)$$, 'جلسة صندوق مفتوحة', 'جلسة: لا تُفتح مرتين');

-- بيع نقدي بسيط مع فكة
do $$
declare r jsonb; i public.invoices; m public.stock_movements;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20000))));
  perform test.eq((r ->> 'total')::numeric, 10000::numeric, 'بيع: الإجمالي من سعر الخادم');
  perform test.eq((r ->> 'change')::numeric, 10000::numeric, 'بيع: الفكة');
  perform test.ok(r ->> 'number' ~ '^S-\d{6}$', 'بيع: الترقيم S-000123');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), 98::numeric, 'بيع: الرصيد نقص');
  perform test.eq((select available_qty from public.product_variants where id = test.id('cup')), 98::numeric, 'بيع: available_qty محدّث');
  select * into m from public.stock_movements where ref_id = (r ->> 'invoice_id')::uuid;
  perform test.ok(m.kind = 'sale' and m.qty = -2 and m.balance_after = 98 and m.unit_cost = 3000, 'بيع: الحركة مسجّلة بالرصيد والتكلفة');
  select * into i from public.invoices where id = (r ->> 'invoice_id')::uuid;
  perform test.ok(i.paid = 10000 and i.due = 0 and i.cost_total = 6000 and i.cash_session_id is not null, 'بيع: المدفوع والتكلفة والجلسة');
  perform test.eq((select sum(amount) from public.payments where invoice_id = i.id), 10000::numeric, 'بيع: الدفعة بعد طرح الفكة');
  perform test.eq((select account_id from public.payments where invoice_id = i.id), test.id('box_iqd'), 'بيع: الدفعة في الصندوق الافتراضي');
end $$;

-- الكرتونة (factor 12) والجملة والدفع المختلط
do $$
declare r jsonb;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1, 'unit_id', test.id('carton')),
                               jsonb_build_object('variant_id', test.id('cup'), 'qty', 3, 'price_tier', 'wholesale')),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 50000), jsonb_build_object('method', 'card', 'amount', 16000, 'reference', 'T1'))));
  perform test.eq((r ->> 'total')::numeric, 66000::numeric, 'كرتونة: 54000 + جملة 3×4000');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), 83::numeric, 'كرتونة: خصمت 12 قطعة + 3');
  perform test.ok((select unit_factor = 12 and unit_name = 'كرتونة' and unit_cost = 36000 from public.invoice_items
                   where invoice_id = (r ->> 'invoice_id')::uuid and unit_factor > 1), 'كرتونة: البند بالوحدة وتكلفتها');
  perform test.eq((select count(*) from public.payments where invoice_id = (r ->> 'invoice_id')::uuid), 2::bigint, 'دفع مختلط: دفعتان');
end $$;

-- الصلاحيات: الخصم مسموح للكاشير، تغيير السعر لا
do $$
declare r jsonb;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'), 'discount', 1000,
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1, 'discount', 500)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 3500))));
  perform test.ok((r ->> 'total')::numeric = 3500 and (r ->> 'due')::numeric = 0, 'خصم: البند ثم الفاتورة (computeTotals)');
end $$;
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1, 'unit_price', 100)),
  'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 100))))$$, 'صلاحية تعديل الأسعار', 'سعر مختلف يتطلب pos.price_override');

-- منع السالب وآخر قطعة
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 2)),
  'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 50000))))$$, 'الكمية غير متوفرة', 'منع السالب: لا يباع أكثر من الرصيد');
select test.eq((select qty from public.stock_levels where variant_id = test.id('hp') and warehouse_id = test.id('main')), 1::numeric, 'منع السالب: الرصيد لم يتغير');

-- الآجل
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)), 'payments', '[]'::jsonb))$$,
  'زبون مسجّل', 'آجل: يتطلب زبوناً غير نقدي');
reset role;
update public.customers set credit_limit = 8000 where id = test.id('cust_b_c');
select test.login('cashier');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'), 'customer_id', test.id('cust_b_c'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1000))));
  perform test.eq((r ->> 'due')::numeric, 4000::numeric, 'آجل: ضمن الحد ← دين 4000');
  perform test.eq((select balance from public.customer_balances where customer_id = test.id('cust_b_c')), 4000::numeric, 'آجل: رصيد الزبون');
end $$;
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'), 'customer_id', test.id('cust_b_c'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)), 'payments', '[]'::jsonb))$$,
  'تجاوز حد الدين', 'آجل: تجاوز الحد ← رفض');

-- فاتورة بالدولار ودفعة بالدولار: amount_iqd بسعر الصرف
do $$
declare r jsonb; pm public.payments;
begin
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'), 'currency', 'USD',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 7.64, 'account_id', test.id('box_usd')))));
  perform test.eq((r ->> 'total')::numeric, 7.64::numeric, 'دولار: السعر 5000/1310 = 3.82 للقطعة');
  select * into pm from public.payments where invoice_id = (r ->> 'invoice_id')::uuid;
  perform test.ok(pm.currency = 'USD' and pm.exchange_rate = 1310 and pm.amount_iqd = 10008 and pm.account_id = test.id('box_usd'), 'دولار: amount_iqd = 7.64×1310');
  perform test.eq((select exchange_rate from public.invoices where id = (r ->> 'invoice_id')::uuid), 1310::numeric, 'دولار: سعر الصرف محفوظ في الفاتورة');
  perform test.eq((select cost_total from public.invoices where id = (r ->> 'invoice_id')::uuid), 6000::numeric, 'دولار: التكلفة بالدينار');
end $$;
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)),
  'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000, 'currency', 'IQD', 'account_id', test.id('box_usd')))))$$,
  'لا تطابق عملة', 'دولار: عملة الدفعة يجب أن تطابق الصندوق');

-- إغلاق الجلسة: المتوقع = 50000 + النقد الداخل بالدينار
do $$
declare r jsonb; cash numeric;
begin
  select coalesce(sum(amount), 0) into cash from public.payments
    where cash_session_id = (select id from public.cash_sessions where opened_by = auth.uid() and status = 'open') and method = 'cash' and currency = 'IQD';
  r := public.close_cash_session(50000 + cash, 'نهاية الدوام');
  perform test.ok((r ->> 'expected_cash')::numeric = 50000 + cash and (r ->> 'difference')::numeric = 0, 'جلسة: المتوقع = الافتتاحي + النقد');
end $$;
reset role;

select test.login('keeper');
set role authenticated;
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)), 'payments', '[]'::jsonb))$$, 'لا تملك صلاحية', 'أمين المخزن: لا يبيع');
reset role;
