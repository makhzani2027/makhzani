-- إصلاحات المراجعة الثانية (migration ٢٣)
set client_min_messages = notice;

-- ---------------------------------------------------------------- الأرقام التسلسلية: البيع والنقل والإرجاع وإلغاؤه
select test.login('owner');
set role authenticated;
select public.upsert_product(jsonb_build_object('name', 'جهاز سيريال', 'is_published', true, 'track_serials', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'SR-1', 'price', 1000, 'cost', 500))));
reset role;
insert into test.ids select 'sr', id from public.product_variants where sku = 'SR-1';

select test.login('owner');
set role authenticated;
select public.post_purchase(jsonb_build_object('supplier_id', test.id('supplier'), 'warehouse_id', test.id('main'),
  'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 3, 'unit_cost', 500, 'serials', jsonb_build_array('S-A', 'S-B', 'S-C')))));
do $$
declare inv1 uuid; inv2 uuid; ret1 uuid; ret2 uuid; r jsonb;
begin
  -- رقم واحد في بندين لنفس المنتج: كان يبيع قطعتين برقم واحد
  perform test.throws(format('select public.pos_checkout(%L::jsonb)', jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 1, 'serials', jsonb_build_array('S-A')),
                               jsonb_build_object('variant_id', test.id('sr'), 'qty', 1, 'serials', jsonb_build_array('S-A'))),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 2000)))), 'رقم تسلسلي غير موجود', 'سيريال: رقم مكرر في بندين ← رفض');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('sr') and warehouse_id = test.id('main')), 3::numeric, 'سيريال: الرصيد لم يتغير بعد الرفض');

  -- النقل: رقم موجود أصلاً في الوجهة لا يُحسب منقولاً
  perform public.transfer_stock(jsonb_build_object('from_warehouse_id', test.id('main'), 'to_warehouse_id', test.id('shop'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 1, 'serials', jsonb_build_array('S-B')))));
  perform test.throws(format('select public.transfer_stock(%L::jsonb)', jsonb_build_object('from_warehouse_id', test.id('main'), 'to_warehouse_id', test.id('shop'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 1, 'serials', jsonb_build_array('S-B'))))),
    'غير موجود في المخزن المصدر', 'نقل: رقم في الوجهة أصلاً ← رفض');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('sr') and warehouse_id = test.id('main')), 2::numeric, 'نقل: رصيد المصدر لم يتغير بعد الرفض');

  -- الإرجاع: الرقم لا يُرجع مرتين
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 2, 'serials', jsonb_build_array('S-A', 'S-C'))),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 2000))));
  inv1 := (r ->> 'invoice_id')::uuid;
  ret1 := (public.post_return(jsonb_build_object('invoice_id', inv1, 'reason', 'عطل',
    'items', jsonb_build_array(jsonb_build_object('invoice_item_id', (select id from public.invoice_items where invoice_id = inv1), 'qty', 1, 'serials', jsonb_build_array('S-A'))))) ->> 'invoice_id')::uuid;
  perform test.eq((select status::text from public.serials where serial = 'S-A'), 'returned', 'إرجاع: الرقم مرتجع');
  perform test.throws(format('select public.post_return(%L::jsonb)', jsonb_build_object('invoice_id', inv1, 'reason', 'مرة ثانية',
    'items', jsonb_build_array(jsonb_build_object('invoice_item_id', (select id from public.invoice_items where invoice_id = inv1), 'qty', 1, 'serials', jsonb_build_array('S-A'))))),
    'مرتجع سابقاً', 'إرجاع: الرقم نفسه لا يُرجع مرتين');

  -- رقم أُعيد بيعه: إلغاء الإرجاع الأول يُرفض (وإلا نقص الرصيد مرتين لقطعة واحدة)
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('sr'), 'qty', 1, 'serials', jsonb_build_array('S-A'))),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1000))));
  inv2 := (r ->> 'invoice_id')::uuid;
  perform public.adjust_stock(jsonb_build_object('variant_id', test.id('sr'), 'warehouse_id', test.id('main'), 'kind', 'opening', 'qty', 1));
  perform test.throws(format('select public.void_invoice(%L, %L)', ret1, 'خطأ'), 'بيعت مجدداً', 'إلغاء الإرجاع: الرقم بيع مجدداً ← رفض');
  perform test.eq((select sale_invoice_id from public.serials where serial = 'S-A'), inv2, 'إرجاع: الرقم ما زال للفاتورة الجديدة');

  -- إلغاء إرجاع سليم: الرقم يعود مباعاً بالفاتورة الأصلية
  ret2 := (public.post_return(jsonb_build_object('invoice_id', inv1, 'reason', 'عطل',
    'items', jsonb_build_array(jsonb_build_object('invoice_item_id', (select id from public.invoice_items where invoice_id = inv1), 'qty', 1, 'serials', jsonb_build_array('S-C'))))) ->> 'invoice_id')::uuid;
  perform public.void_invoice(ret2, 'إرجاع بالخطأ');
  perform test.ok((select status = 'sold' and sale_invoice_id = inv1 and warehouse_id is null from public.serials where serial = 'S-C'),
    'إلغاء الإرجاع: الرقم مباع بالفاتورة الأصلية');
  perform test.eq((select qty from public.stock_levels where variant_id = test.id('sr') and warehouse_id = test.id('main')), 1::numeric, 'سيريال: الرصيد بعد إلغاء الإرجاع');

  -- رقم لرصيد بلا أرقام (القطعة الافتتاحية أعلاه)، ولا أكثر من الرصيد
  perform test.eq((public.add_serials(test.id('sr'), test.id('main'), array['S-D']) ->> 'added')::int, 1, 'add_serials: رقم لرصيد موجود');
  perform test.throws(format('select public.add_serials(%L, %L, %L)', test.id('sr'), test.id('main'), array['S-E']), 'أكثر من الرصيد', 'add_serials: لا يتجاوز الرصيد');
  perform test.throws(format('select public.add_serials(%L, %L, %L)', test.id('cup'), test.id('main'), array['X-1']), 'لا يتتبع', 'add_serials: منتج بلا تتبع');

  -- رقم تالف يخرج من الرصيد
  perform public.mark_serial_defective((select id from public.serials where serial = 'S-B'), 'شاشة مكسورة');
  perform test.ok((select status = 'defective' and warehouse_id is null from public.serials where serial = 'S-B')
    and (select qty from public.stock_levels where variant_id = test.id('sr') and warehouse_id = test.id('shop')) = 0, 'mark_serial_defective: تالف وخرج من الرصيد');
  perform test.throws(format('select public.mark_serial_defective(%L)', (select id from public.serials where serial = 'S-B')), 'ليس في المخزون', 'mark_serial_defective: مرة واحدة');
end $$;
reset role;

-- ---------------------------------------------------------------- جلسة الصندوق الإلزامية (كانت في الواجهة فقط)
update public.app_settings set value = value || '{"require_cash_session": true}' where key = 'pos';
select test.login('cashier');
set role authenticated;
do $$
begin
  if test.peek(format('select count(*) from public.cash_sessions where opened_by = %L and status = ''open''', auth.uid()))::int > 0 then
    perform public.close_cash_session(0);
  end if;
  perform test.throws(format('select public.pos_checkout(%L::jsonb)', jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000)))), 'افتح جلسة الصندوق', 'جلسة إلزامية: البيع بلا جلسة ← رفض');
  perform public.open_cash_session(0);
  perform test.ok((public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 1)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000)))) ->> 'invoice_id') is not null, 'جلسة إلزامية: البيع مع جلسة');
  perform public.close_cash_session(5000);
end $$;
reset role;
update public.app_settings set value = value || '{"require_cash_session": false}' where key = 'pos';

-- ---------------------------------------------------------------- عرض السعر: تغيير الحالة فقط
select test.login('cashier');
set role authenticated;
do $$
declare q jsonb; q2 jsonb;
begin
  q := public.save_quotation(jsonb_build_object('warehouse_id', test.id('main'), 'customer_name', 'زبون عرض',
    'items', jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 2))));
  q2 := public.save_quotation(jsonb_build_object('id', q ->> 'id', 'status', 'sent'));
  perform test.ok(q2 ->> 'status' = 'sent' and (q2 ->> 'total')::numeric = (q ->> 'total')::numeric
    and jsonb_array_length(q2 -> 'items') = 1, 'عرض السعر: تغيير الحالة فقط يبقي البنود والمبلغ');
  perform test.throws(format('select public.save_quotation(%L::jsonb)', jsonb_build_object('id', q ->> 'id', 'status', 'converted')),
    'تحويل لفاتورة', 'عرض السعر: converted لا يُضبط يدوياً');
end $$;
reset role;

-- ---------------------------------------------------------------- إعدادات الدفع والتوصيل لـ store.manage
select test.login('manager', 'aal2');
set role authenticated;
do $$
declare n int;
begin
  update public.app_settings set value = value || '{"min_order_total": 10000}' where key = 'checkout';
  get diagnostics n = row_count;
  perform test.eq(n, 1, 'checkout: المدير (store.manage) يحفظ إعدادات التوصيل');
  update public.app_settings set value = value || '{"x": 1}' where key = 'store';
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'checkout: لا يمس مفاتيح الإعدادات الأخرى');
end $$;
select test.throws($$update public.app_settings set key = 'inventory' where key = 'checkout'$$, 'row-level security', 'checkout: لا يغيّر المفتاح');
reset role;

-- ---------------------------------------------------------------- التقييمات: الإشراف على الظهور فقط
select test.login('keeper');
set role authenticated;
select test.throws($$update public.reviews set rating = 1$$, 'permission denied', 'تقييم: products.write لا يغيّر التقييم');
do $$
declare n int;
begin
  update public.reviews set is_visible = true;
  get diagnostics n = row_count;
  perform test.ok(n >= 1, 'تقييم: products.write يغيّر الظهور');
end $$;
reset role;

-- ---------------------------------------------------------------- upsert_product: التكلفة نفسها لا تكتب فوق آخر تكلفة
update public.variant_costs set avg_cost = 3100, last_cost = 3300 where variant_id = test.id('cup');
select test.login('owner');
set role authenticated;
select public.upsert_product(jsonb_build_object('id', (select product_id from public.product_variants where id = test.id('cup')),
  'variants', jsonb_build_array(jsonb_build_object('id', test.id('cup'), 'cost', 3100))));
reset role;
select test.ok((select avg_cost = 3100 and last_cost = 3300 from public.variant_costs where variant_id = test.id('cup')), 'upsert_product: التكلفة نفسها ← last_cost باقية');

-- ---------------------------------------------------------------- أمين المخزن (purchases.manage) يرى المشتريات
select test.login('keeper');
set role authenticated;
select test.ok((select count(*) from public.invoices where kind = 'purchase') > 0 and (select count(*) from public.invoices where kind = 'sale') = 0,
  'مشتريات: purchases.manage يقرأ فواتير الشراء فقط');
select test.ok((select count(*) from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id where i.kind = 'purchase') > 0, 'مشتريات: وبنودها');
reset role;

-- ---------------------------------------------------------------- إلغاء جرد مفتوح
select test.login('keeper');
set role authenticated;
do $$
declare s jsonb;
begin
  s := public.create_stocktake(test.id('shop'), 'جرد منسي');
  perform test.eq(public.cancel_stocktake((s ->> 'id')::uuid) ->> 'status', 'cancelled', 'cancel_stocktake: أُلغي');
  perform test.ok((public.create_stocktake(test.id('shop')) ->> 'status') = 'draft', 'cancel_stocktake: جرد جديد بعده');
  perform test.throws(format('select public.cancel_stocktake(%L)', s ->> 'id'), 'ملغى سابقاً', 'cancel_stocktake: مرة واحدة');
end $$;
reset role;
select test.login('cust_a');
set role authenticated;
select test.throws(format('select public.cancel_stocktake(%L)', (select id from test.ids limit 1)), 'لا تملك صلاحية', 'cancel_stocktake: الزبون لا');
reset role;

-- ---------------------------------------------------------------- رمز الجهاز: الحساب الجديد على الهاتف نفسه
select test.login('cust_a');
set role authenticated;
select public.register_push_token('device-token-shared-0001', 'android');
reset role;
select test.login('cust_b');
set role authenticated;
select test.throws($$insert into public.push_tokens (profile_id, token, platform) values (auth.uid(), 'device-token-shared-0001', 'android')
  on conflict (token) do update set profile_id = excluded.profile_id$$, 'row-level security', 'رمز الجهاز: upsert العميل يُرفض (السبب)');
select (public.register_push_token('device-token-shared-0001', 'android') ->> 'token') is not null;
reset role;
select test.eq((select profile_id from public.push_tokens where token = 'device-token-shared-0001'), test.id('cust_b'), 'register_push_token: الرمز انتقل للحساب الجديد');
select test.eq((select count(*) from public.push_tokens where token = 'device-token-shared-0001'), 1::bigint, 'register_push_token: صف واحد');

-- ---------------------------------------------------------------- صندوق افتراضي لكل عملة
update public.money_accounts set is_default = false where id = test.id('box_usd');
update public.money_accounts set is_default = true where id = test.id('box_usd');
select test.eq((select count(*) from public.money_accounts where is_default), 2::bigint, 'الصندوق الافتراضي: واحد للدولار مع الدينار');
select test.throws(format('insert into public.money_accounts (name, currency, is_default) values (%L, %L, true)', 'صندوق ثانٍ', 'IQD'),
  'duplicate key', 'الصندوق الافتراضي: واحد فقط لكل عملة');
update public.money_accounts set is_default = false where id = test.id('box_usd');

-- ---------------------------------------------------------------- تقييم المخزون و finance.view
select test.login('keeper');
set role authenticated;
select test.ok((select bool_and(x ? 'cost_value' and x ->> 'cost_value' is not null) from jsonb_array_elements(public.inventory_valuation()) x),
  'تقييم المخزون: costs.view يرى التكلفة');
reset role;
select test.login('cashier');
set role authenticated;
select test.throws($$select public.inventory_valuation()$$, 'لا تملك صلاحية', 'تقييم المخزون: بلا reports.view ولا costs.view ← رفض');
reset role;

insert into test.ids values ('acct', '00000000-0000-4000-8000-0000000000a5');
insert into auth.users (id, email) values (test.id('acct'), 'acct@raqeem.test');
insert into public.staff_roles (name, permissions) values ('محاسب اختبار', array['finance.view', 'reports.view']) on conflict do nothing;
update public.profiles set kind = 'staff', status = 'active', role_id = (select id from public.staff_roles where name = 'محاسب اختبار') where id = test.id('acct');
select test.login('acct');
set role authenticated;
select test.ok((select count(*) from public.customer_balances where balance > 0) > 0, 'الديون: finance.view يرى أرصدة الزبائن');
select test.ok((select bool_and(x ->> 'cost_value' is null and x ? 'retail_value') from jsonb_array_elements(public.inventory_valuation()) x),
  'تقييم المخزون: reports.view بلا تكلفة ← cost_value = null');
reset role;
