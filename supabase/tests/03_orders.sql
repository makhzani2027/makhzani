-- المتجر: quote_cart = computeTotals، الكوبونات، الحجز، الإلغاء، التسليم، الإرجاع، العزل، التقييم
set client_min_messages = notice;
insert into public.coupons (code, kind, value, max_discount) values ('save10', 'percent', 10, 1000) on conflict do nothing;
insert into public.coupons (code, kind, value) values ('MINUS6', 'fixed', 6000) on conflict do nothing;
insert into public.coupons (code, kind, value) values ('FREESHIP', 'free_delivery', 0) on conflict do nothing;
insert into public.coupons (code, kind, value, min_subtotal) values ('BIG', 'fixed', 1000, 500000) on conflict do nothing;
insert into public.coupons (code, kind, value, usage_limit) values ('ONCE', 'fixed', 500, 1) on conflict do nothing;

-- ---------------------------------------------------------------- quote_cart = computeTotals (نفس أرقام pricing.test.ts)
select test.logout();
set role anon;
do $$
declare q jsonb;
begin
  -- ١) 3×5000، بغداد 5000، بلا كوبون ← 15000 + 5000
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'baghdad', null);
  perform test.ok((q ->> 'subtotal')::numeric = 15000 and (q ->> 'discount')::numeric = 0 and (q ->> 'delivery_fee')::numeric = 5000
    and (q ->> 'total')::numeric = 20000 and (q ->> 'ok')::boolean, 'quote ١: 15000 + أجرة 5000 = 20000');
  -- ٢) نسبة 10% بسقف 1000 ← خصم 1000
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'baghdad', 'save10');
  perform test.ok((q ->> 'discount')::numeric = 1000 and (q ->> 'total')::numeric = 19000 and q ->> 'coupon_code' = 'SAVE10', 'quote ٢: 10% بسقف 1000 ← 19000');
  -- ٣) 31×5000 = 155000 − 6000 = 149000 < 150000 ← الأجرة تبقى ← 154000
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 31)), 'baghdad', 'MINUS6');
  perform test.ok((q ->> 'subtotal')::numeric = 155000 and (q ->> 'delivery_fee')::numeric = 5000 and (q ->> 'total')::numeric = 154000,
    'quote ٣: التوصيل المجاني يُحسب بعد الخصم (154000)');
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 31)), 'baghdad', null);
  perform test.ok((q ->> 'delivery_fee')::numeric = 0 and (q ->> 'total')::numeric = 155000, 'quote: فوق 150000 ← توصيل مجاني');
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'baghdad', 'FREESHIP');
  perform test.ok((q ->> 'delivery_fee')::numeric = 0 and (q ->> 'total')::numeric = 15000, 'كوبون: توصيل مجاني');
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'baghdad', 'BIG');
  perform test.ok((q ->> 'discount')::numeric = 0 and q ->> 'coupon_error' like '%الأدنى%', 'كوبون: الحد الأدنى غير متحقق');
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), 'baghdad', 'NOPE');
  perform test.ok(q ->> 'coupon_error' is not null, 'كوبون: غير موجود');
  q := public.quote_cart(jsonb_build_array(jsonb_build_object('variant_id', test.id('hid'), 'qty', 1)), 'baghdad', null);
  perform test.ok(not (q ->> 'ok')::boolean, 'quote: غير المنشور غير متاح');
end $$;
reset role;

-- ---------------------------------------------------------------- طلب ← حجز ← إلغاء ← تحرير
select test.login('cust_a');
set role authenticated;
do $$
declare r jsonb; before numeric;
begin
  before := (select available_qty from public.product_variants where id = test.id('cup'));
  r := public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 3)), test.id('addr_a'), 'delivery', 'cod', 'ONCE', 'اتصل قبل الوصول');
  perform test.ok(r ->> 'number' ~ '^O-\d{6}$' and (r ->> 'total')::numeric = 19500, 'طلب: أُنشئ بأسعار الخادم والكوبون');
  perform test.eq((select available_qty from public.product_variants where id = test.id('cup')), before - 3, 'طلب: المتوفر نقص بالحجز');
  perform test.eq(test.peek('select used_count from public.coupons where code = ''ONCE''')::int, 1, 'كوبون: سُجّل الاستخدام');
  perform public.cancel_my_order((r ->> 'order_id')::uuid, 'غيرت رأيي');
  perform test.eq((select available_qty from public.product_variants where id = test.id('cup')), before, 'إلغاء: الحجز تحرر');
  perform test.eq(test.peek('select used_count from public.coupons where code = ''ONCE''')::int, 0, 'إلغاء: الكوبون عاد');
  perform test.ok((select count(*) from public.notifications where data ->> 'order_id' = r ->> 'order_id') >= 2, 'إشعارات: حدث الطلب والإلغاء');
end $$;
select test.throws($$select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)), test.id('addr_a'), 'delivery', 'cod')$$,
  'أقل مبلغ', 'طلب: أقل من الحد الأدنى ← رفض');
-- آخر قطعة: أ يحجزها، ب يُرفض
select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 1)), test.id('addr_a'), 'delivery', 'cod');
reset role;
insert into public.addresses (profile_id, label, recipient_name, phone, governorate, city) values (test.id('cust_b'), 'البيت', 'زبون ب', '07801234567', 'baghdad', 'بغداد');
select test.login('cust_b');
set role authenticated;
select test.throws($$select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 1)),
  (select id from public.addresses limit 1), 'delivery', 'cod')$$, 'غير متوفرة', 'آخر قطعة: الطلب الثاني يُرفض');
select test.eq((select count(*) from public.orders), 0::bigint, 'عزل: الزبون ب لا يرى طلبات أ');
select test.eq((select count(*) from public.order_items), 0::bigint, 'عزل: ولا بنودها');
reset role;
select test.login('cashier');
set role authenticated;
select test.throws($$select public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('hp'), 'qty', 1)), 'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 25000))))$$,
  'الكمية غير متوفرة', 'الحجز: نقطة البيع لا تبيع المحجوز');
reset role;

-- ---------------------------------------------------------------- دورة الطلب حتى التسليم والإرجاع (المالك)
select test.login('cust_a');
set role authenticated;
select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 4)), test.id('addr_a'), 'delivery', 'cod');
reset role;
insert into test.ids select 'order1', id from public.orders where profile_id = test.id('cust_a') and status = 'pending' and total = 25000;
select test.login('owner');
set role authenticated;
do $$
declare q0 numeric; r jsonb; inv public.invoices;
begin
  q0 := (select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main'));
  perform public.set_order_status(test.id('order1'), 'confirmed', null);
  perform public.set_order_status(test.id('order1'), 'preparing', null);
  perform public.set_order_status(test.id('order1'), 'ready', null);
  perform test.throws(format('select public.set_order_status(%L, %L, null)', test.id('order1'), 'delivered'), 'لا يمكن نقل', 'آلة الحالات: التوصيل يمر بالمندوب');
  perform public.set_order_status(test.id('order1'), 'out_for_delivery', 'المندوب علي');
  r := public.set_order_status(test.id('order1'), 'delivered', null);
  select * into inv from public.invoices where id = (r ->> 'invoice_id')::uuid;
  perform test.ok(inv.channel = 'online' and inv.total = 25000 and inv.paid = 25000 and inv.cost_total = 12000, 'تسليم: فاتورة online مدفوعة بالتكلفة');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0 - 4, 'تسليم: الرصيد خُصم');
  perform test.eq((select reserved from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), 0::numeric, 'تسليم: الحجز استُهلك');
  perform test.eq((select payment_status::text from public.orders where id = test.id('order1')), 'paid', 'تسليم: الطلب مدفوع');
  r := public.set_order_status(test.id('order1'), 'returned', 'المنتج تالف');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('cup') and warehouse_id = test.id('main')), q0, 'إرجاع: الرصيد عاد');
  perform test.ok((select kind = 'sale_return' and total = 20000 from public.invoices where id = (r ->> 'return_invoice_id')::uuid), 'إرجاع: فاتورة SR');
  perform test.eq((select sum(amount) from public.payments where invoice_id = (r ->> 'return_invoice_id')::uuid and direction = 'out'), 20000::numeric,
    'إرجاع: المسترد = البضاعة بلا أجرة التوصيل');
  perform test.throws(format('select public.set_order_status(%L, %L, null)', test.id('order1'), 'confirmed'), 'لا يمكن نقل', 'آلة الحالات: النهائية لا تتغير');
end $$;
reset role;

-- التقييم بعد الاستلام فقط (طلب ثانٍ يُسلَّم)
select test.login('cust_a');
set role authenticated;
select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2)), null, 'pickup', 'office');
reset role;
select test.login('owner');
set role authenticated;
do $$
declare oid uuid := (select id from public.orders where fulfillment = 'pickup' and status = 'pending' limit 1);
begin
  perform public.set_order_status(oid, 'confirmed', null);
  perform public.set_order_status(oid, 'preparing', null);
  perform public.set_order_status(oid, 'ready', null);
  perform test.throws(format('select public.set_order_status(%L, %L, null)', oid, 'out_for_delivery'), 'لا يمكن نقل', 'آلة الحالات: الاستلام لا يمر بالمندوب');
  perform public.set_order_status(oid, 'delivered', null);
  perform test.ok(true, 'استلام من المكتب: سُلّم');
end $$;
reset role;
select test.login('cust_a');
set role authenticated;
select test.ok((public.submit_review((select product_id from public.product_variants where id = test.id('cup')), 5, 'ممتاز') ->> 'review_id') is not null,
  'تقييم: بعد الاستلام مسموح');
reset role;
select test.login('cust_b');
set role authenticated;
select test.throws($$select public.submit_review((select product_id from public.product_variants where id = test.id('cup')), 1, 'سيء')$$, 'بعد استلامه', 'تقييم: بلا شراء مرفوض');
reset role;
select test.ok((select rating_count from public.products p join public.product_variants v on v.product_id = p.id where v.id = test.id('cup')) = 1, 'تقييم: rating_count محدّث');
