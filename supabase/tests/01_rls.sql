-- RLS والصلاحيات والمساعدات
set client_min_messages = notice;

-- normalize_ar = normalizeArabic في shared
select test.eq(public.normalize_ar('  أَحْمَدُ  '), 'احمد', 'normalize_ar: تشكيل وهمزة');
select test.eq(public.normalize_ar('مكتبـــة إسلامية'), 'مكتبه اسلاميه', 'normalize_ar: تطويل وتاء مربوطة');
select test.eq(public.normalize_ar('مُصطفى ٣٤٥ ABC'), 'مصطفي 345 abc', 'normalize_ar: ى وأرقام مشرقية وأحرف صغيرة');
select test.eq(public.normalize_ar('مؤسسة شاطئ'), 'موسسه شاطي', 'normalize_ar: ؤ ئ');
select test.eq(public.next_doc_number('quotation') ~ '^Q-\d{6}$', true, 'next_doc_number: Q-000001');
select test.ok(not has_function_privilege('anon', 'public.make_owner(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.make_owner(text, text)', 'execute'), 'make_owner مسحوب من anon/authenticated');
select test.ok(not has_function_privilege('authenticated', 'public.next_doc_number(text)', 'execute'), 'next_doc_number غير متاح للواجهة');

-- ---------------------------------------------------------------- الزائر
select test.logout();
set role anon;
select test.eq((select count(*) from public.variant_costs), 0::bigint, 'anon: لا يرى التكلفة');
select test.eq((select count(*) from public.stock_levels), 0::bigint, 'anon: لا يرى المخزون');
select test.eq((select count(*) from public.products where name = 'منتج مخفي'), 0::bigint, 'anon: لا يرى غير المنشور');
select test.ok((select count(*) from public.products where name = 'كوب سيراميك') = 1, 'anon: يرى المنشور');
select test.ok((select count(*) from public.app_settings where key = 'store') = 1 and (select count(*) from public.app_settings where key = 'inventory') = 0,
  'anon: يقرأ الإعدادات العامة فقط');
select test.ok(not (public.store_product('كوب-سيراميك')::text like '%avg_cost%'), 'anon: store_product بلا تكلفة');
select test.ok((public.store_search(q => 'كوب') -> 'items') is not null or jsonb_typeof(public.store_search(q => 'كوب')) is not null, 'anon: store_search يعمل');
select test.throws($$select public.place_order('[]'::jsonb)$$, 'permission denied', 'anon: لا يستدعي place_order');
select test.throws($$insert into public.stock_levels (variant_id, warehouse_id, qty) values (test.id('cup'), test.id('main'), 5)$$, 'permission denied', 'anon: لا يكتب المخزون');
reset role;

-- ---------------------------------------------------------------- الزبون
select test.login('cust_a');
set role authenticated;
select test.eq((select count(*) from public.variant_costs), 0::bigint, 'زبون: لا يرى التكلفة');
select test.eq((select count(*) from public.invoices), 0::bigint, 'زبون: لا يرى الفواتير');
select test.eq((select count(*) from public.profiles), 1::bigint, 'زبون: يرى ملفه فقط');
select test.eq((select count(*) from public.customers), 1::bigint, 'زبون: يرى صفه فقط');
select test.throws($$update public.profiles set kind = 'staff', is_owner = true where id = auth.uid()$$, '', 'زبون: لا يرقّي نفسه');
select test.ok((select kind from public.profiles where id = test.id('cust_a')) = 'customer', 'زبون: بقي زبوناً');
select test.throws($$select public.pos_checkout('{}'::jsonb)$$, 'لا تملك صلاحية', 'زبون: لا يبيع من نقطة البيع');
select test.throws($$select public.dashboard_summary()$$, 'لا تملك صلاحية', 'زبون: لا يرى اللوحة');
select test.ok((select count(*) from public.addresses) = 1, 'زبون: يرى عنوانه');
reset role;
select test.login('cust_b');
set role authenticated;
select test.eq((select count(*) from public.addresses), 0::bigint, 'زبون ب: لا يرى عنوان أ');
-- التخزين: مجلده فقط
select test.throws($$insert into storage.objects (bucket_id, name) values ('private', 'requests/' || test.id('cust_a') || '/x.webp')$$,
  'row-level security', 'زبون: لا يرفع في مجلد غيره');
insert into storage.objects (bucket_id, name) values ('private', 'requests/' || test.id('cust_b') || '/x.webp');
select test.ok(true, 'زبون: يرفع في مجلده');
select test.throws($$insert into storage.objects (bucket_id, name) values ('media', 'products/x.webp')$$, 'row-level security', 'زبون: لا يرفع للوسائط');
reset role;

-- ---------------------------------------------------------------- الموظفون
select test.login('cashier');
set role authenticated;
select test.eq((select count(*) from public.variant_costs), 0::bigint, 'كاشير: لا يرى التكلفة');
select test.ok((select count(*) from public.stock_levels) > 0, 'كاشير: يرى الأرصدة (inventory.view)');
select test.throws($$update public.stock_levels set qty = 999$$, 'permission denied', 'كاشير: لا يكتب الأرصدة');
select test.ok((public.dashboard_summary() ->> 'profit') is null, 'كاشير: الربح null بلا costs.view');
reset role;
select test.login('keeper');
set role authenticated;
select test.ok((select count(*) from public.variant_costs) > 0, 'أمين المخزن: يرى التكلفة');
reset role;
select test.login('owner');
set role authenticated;
select test.throws($$insert into public.stock_movements (variant_id, warehouse_id, kind, qty, balance_after) values (test.id('cup'), test.id('main'), 'adjustment', 1, 1)$$,
  'permission denied', 'المالك: لا يكتب الحركات مباشرة');
select test.throws($$update public.invoices set total = 0$$, 'permission denied', 'المالك: لا يعدّل الفواتير مباشرة');
reset role;

-- ---------------------------------------------------------------- التحقق بخطوتين
insert into auth.mfa_factors (user_id, status) values (test.id('manager'), 'verified');
select test.login('manager', 'aal1');
set role authenticated;
select test.ok(not public.has_perm('dashboard.view'), 'MFA: aal1 مع عامل مفعّل ← لا صلاحية');
select test.throws($$select public.dashboard_summary()$$, 'التحقق بخطوتين', 'MFA: رسالة إكمال التحقق');
reset role;
select test.login('manager', 'aal2');
set role authenticated;
select test.ok(public.has_perm('dashboard.view'), 'MFA: aal2 ← الصلاحية تعمل');
reset role;
