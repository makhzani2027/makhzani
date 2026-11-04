-- تعدد المتاجر (migrations ٢٧–٢٨): المتجر ١ لا يتغير، والمتاجر منفصلة تماماً
set client_min_messages = notice;
reset role;
insert into test.ids values ('store1', '00000000-0000-4000-a000-000000000001');
insert into test.ids select 'cup_p', product_id from public.product_variants where id = test.id('cup');

-- ---------------------------------------------------------------- المتجر ١ كما هو
do $$
begin
  perform test.ok(not exists (select 1 from public.products where store_id <> private.store1()), 'متجر ١: كل المنتجات القائمة في المتجر ١');
  perform test.ok(not exists (select 1 from public.stock_movements where store_id <> private.store1()), 'متجر ١: كل حركات المخزون في المتجر ١');
  perform test.ok((select status from public.stores where id = private.store1()) = 'active', 'متجر ١: فعّال');
  perform test.ok((select is_platform_admin from public.profiles where id = test.id('owner')), 'متجر ١: المالك مدير المنصة');
  perform test.eq((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'private') and p.prosecdef and pg_get_userbyid(p.proowner) not in ('raqeem_fn')
      and p.proname not in ('current_store', 'current_store_id', 'store1', 'fill_store', 'keep_store', 'has_perm', 'is_staff', 'staff_ok', 'aal_ok',
        'require_perm', 'make_owner', 'handle_new_user', 'handle_user_email', 'delete_my_account', 'push_hook', 'send_campaign',
        'sync_fn_owners', 'request_store', 'login_email', 'approve_store', 'reject_store', 'set_store_status', 'platform_stores',
        'seed_store', 'is_platform_admin', 'my_store', 'protect_profile', 'pol')), 0::bigint,
    'العزل: كل دوال security definer تعمل بدور raqeem_fn الخاضع للعزل');
end $$;

-- ---------------------------------------------------------------- صاحب متجر جديد يسجّل
insert into test.ids values ('owner2', '00000000-0000-4000-8000-0000000000c1'), ('cust2', '00000000-0000-4000-8000-0000000000c2');
insert into auth.users (id, email, raw_user_meta_data) values
  (test.id('owner2'), 'owner2@raqeem.test', '{"full_name": "صاحب المتجر الثاني"}'),
  (test.id('cust2'), 'cust2@raqeem.test', '{"full_name": "زبون المتجر الثاني"}');

select test.login('owner2');
set role authenticated;
select test.throws($$select public.request_store('{"name": "مركز الحلول", "slug": "ab", "phone": "07711112222"}')$$, 'رابطاً', 'تسجيل متجر: رابط قصير مرفوض');
select test.throws($$select public.request_store('{"name": "مركز الحلول", "slug": "raqeem", "phone": "07711112222"}')$$, 'محجوز', 'تسجيل متجر: رابط محجوز مرفوض');
select test.throws($$select public.request_store('{"name": "مركز الحلول", "slug": "alhulool", "phone": "123"}')$$, 'هاتف', 'تسجيل متجر: هاتف غير صالح مرفوض');
do $$
declare s jsonb;
begin
  s := public.request_store('{"name": "مركز الحلول الكهربائية", "slug": "alhulool", "phone": "+964 771 111 2222", "governorate": "nineveh"}');
  perform test.eq(s ->> 'status', 'pending', 'تسجيل متجر: الطلب بانتظار الموافقة');
  perform test.eq(s ->> 'phone', '+9647711112222', 'تسجيل متجر: الهاتف بصيغة موحدة');
  perform test.ok(not public.has_perm('products.write') and not public.is_staff(), 'تسجيل متجر: لا صلاحيات قبل الموافقة');
  perform test.eq((select count(*) from public.products), 0::bigint, 'تسجيل متجر: لا يرى منتجات المتجر ١');
  perform test.eq((select count(*) from public.customers), 0::bigint, 'تسجيل متجر: لا يرى زبائن المتجر ١');
  perform test.eq((select count(*) from public.app_settings), 0::bigint, 'تسجيل متجر: لا يرى إعدادات المتجر ١');
  perform test.eq((public.my_store() ->> 'status'), 'pending', 'تسجيل متجر: my_store يبيّن الحالة');
end $$;
select test.throws($$select public.platform_stores()$$, 'صلاحية', 'المنصة: صاحب متجر عادي لا يرى المتاجر');
reset role;
insert into test.ids select 'store2', id from public.stores where slug = 'alhulool';

-- مدير المنصة يوافق
select test.login('owner');
set role authenticated;
do $$
declare l jsonb;
begin
  l := public.platform_stores();
  perform test.ok(exists (select 1 from jsonb_array_elements(l) x where x ->> 'slug' = 'alhulool' and x ->> 'status' = 'pending'), 'المنصة: الطلب يظهر للمدير');
  perform public.set_store_status(test.id('store2'), 'active');
  -- المالك ما زال يرى متجره فقط
  perform test.ok(not exists (select 1 from public.products where store_id <> test.id('store1')), 'المنصة: مالك المتجر ١ لا يرى بيانات المتجر الجديد');
end $$;
select test.throws(format('select public.set_store_status(%L, ''suspended'')', '00000000-0000-0000-0000-00000000dead'), 'غير موجود', 'المنصة: متجر غير موجود');
reset role;
insert into test.ids select 'main2', id from public.warehouses where store_id = test.id('store2') and code = 'MAIN';
do $$
begin
  perform test.ok(test.id('main2') is not null, 'تجهيز: مخزن رئيسي للمتجر الجديد');
  perform test.eq((select count(*) from public.staff_roles where store_id = test.id('store2')), 4::bigint, 'تجهيز: أدوار الموظفين الأربعة');
  perform test.eq((select value ->> 'name' from public.app_settings where store_id = test.id('store2') and key = 'store'), 'مركز الحلول الكهربائية', 'تجهيز: إعدادات باسم الشركة');
  perform test.eq((select count(*) from public.delivery_zones where store_id = test.id('store2') and is_active), 1::bigint, 'تجهيز: التوصيل لمحافظة المتجر');
  perform test.eq((select governorate from public.delivery_zones where store_id = test.id('store2') and is_active), 'nineveh', 'تجهيز: المحافظة الصحيحة');
  perform test.ok(exists (select 1 from public.customers where store_id = test.id('store2') and is_cash_customer), 'تجهيز: زبون نقدي');
end $$;

-- ---------------------------------------------------------------- المتجر الثاني يعمل وحده
select test.login('owner2');
set role authenticated;
do $$
declare r jsonb; q jsonb; n int;
begin
  perform test.ok(public.has_perm('products.write'), 'متجر ٢: صلاحيات المالك بعد الموافقة');
  -- نفس SKU والباركود الموجودين في المتجر ١ مسموحان (فريدة داخل كل متجر)
  r := public.upsert_product(jsonb_build_object('name', 'انفيرتر سوفار', 'is_published', true, 'variants', jsonb_build_array(
    jsonb_build_object('title', 'افتراضي', 'sku', 'CUP-1', 'barcode', '6260000000017', 'price', 1200000, 'cost', 1000000,
      'opening', jsonb_build_array(jsonb_build_object('warehouse_id', test.id('main2'), 'qty', 7))))));
  perform test.eq((select count(*) from public.products), 1::bigint, 'متجر ٢: يرى منتجه فقط');
  perform test.eq((select count(*) from public.product_variants where sku = 'CUP-1'), 1::bigint, 'متجر ٢: SKU مكرر بين المتاجر مسموح');
  perform test.eq((select coalesce(sum(qty), 0) from public.stock_levels), 7::numeric, 'متجر ٢: مخزونه فقط');
  perform test.eq((select count(*) from public.warehouses), 1::bigint, 'متجر ٢: مخازنه فقط');
  perform test.eq((select count(*) from public.invoices), 0::bigint, 'متجر ٢: لا يرى فواتير المتجر ١');
  perform test.eq((select count(*) from public.profiles), 1::bigint, 'متجر ٢: لا يرى موظفي وزبائن المتجر ١');
  perform test.eq((select count(*) from public.sellable_stock()), 1::bigint, 'متجر ٢: الكميات المتاحة لمتجره فقط');
  perform test.eq(coalesce((public.dashboard_summary() ->> 'sales_count')::int, -1), 0, 'متجر ٢: لوحة المعلومات بلا مبيعات المتجر ١');
  -- ترقيم مستنداته يبدأ من ١
  q := public.save_quotation(jsonb_build_object('warehouse_id', test.id('main2'), 'customer_name', 'زبون',
    'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants limit 1), 'qty', 1))));
  perform test.eq(q ->> 'number', 'Q-000001', 'متجر ٢: ترقيم العروض يبدأ من ١');
  perform test.eq((q ->> 'total')::numeric, 1200000::numeric, 'متجر ٢: السعر من منتجه');
  r := public.pos_checkout(jsonb_build_object('warehouse_id', test.id('main2'),
    'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from public.product_variants limit 1), 'qty', 2)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 2400000))));
  perform test.eq(r ->> 'number', 'S-000001', 'متجر ٢: ترقيم الفواتير يبدأ من ١');
  update public.app_settings set value = value || '{"name": "مركز الحلول للطاقة", "logo_key": "site/logo/abc"}' where key = 'store';
  perform test.eq((public.current_store() ->> 'name'), 'مركز الحلول للطاقة', 'متجر ٢: تعديل الاسم من الإعدادات يصل لجدول المتاجر');
  perform test.eq((public.current_store() ->> 'logo_key'), 'site/logo/abc', 'متجر ٢: الشعار من الإعدادات');
  perform test.eq((select coalesce(sum(qty), 0) from public.stock_levels), 5::numeric, 'متجر ٢: البيع ينقص مخزونه');
end $$;
-- لا يلمس بيانات المتجر ١ ولو عرف المعرّفات
select test.throws(format($q$select public.pos_checkout(jsonb_build_object('warehouse_id', %L,
  'items', jsonb_build_array(jsonb_build_object('variant_id', %L, 'qty', 1)), 'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 5000))))$q$,
  test.id('main'), test.id('cup')), '', 'متجر ٢: لا يبيع من مخزن ومنتج المتجر ١');
select test.throws(format($q$select public.upsert_product(jsonb_build_object('id', %L, 'name', 'اختراق',
  'variants', jsonb_build_array(jsonb_build_object('title', 'افتراضي', 'sku', 'X-1', 'price', 1))))$q$, test.id('cup_p')), '', 'متجر ٢: لا يعدّل منتج المتجر ١');
select test.throws(format('select public.adjust_stock(%L, %L, 50, ''opening'', null)', test.id('cup'), test.id('main')), '', 'متجر ٢: لا يعدّل مخزون المتجر ١');
do $$
declare n int;
begin
  update public.app_settings set value = '{"name": "x"}' where key = 'store' and store_id = test.id('store1');
  get diagnostics n = row_count;
  perform test.eq(n, 0, 'متجر ٢: تعديل إعدادات المتجر ١ لا يصيب شيئاً');
end $$;
reset role;

do $$
begin
  perform test.eq((select value ->> 'name' from public.app_settings where key = 'store' and store_id = test.id('store1')), 'رقيم', 'متجر ١: اسم المتجر لم يتغير');
  perform test.ok((select name from public.products p join public.product_variants v on v.product_id = p.id where v.id = test.id('cup')) = 'كوب سيراميك', 'متجر ١: اسم منتجه لم يتغير');
end $$;

-- ---------------------------------------------------------------- الزوار: كل رابط يرى متجره
select test.logout();
set role anon;
do $$
begin
  perform test.ok(not exists (select 1 from public.products where store_id <> test.id('store1')), 'زائر بلا رابط (التطبيق الحالي): المتجر ١ فقط');
  perform set_config('request.headers', '{"x-store": "alhulool"}', false);
  perform test.eq((select count(*) from public.products), 1::bigint, 'زائر برابط المتجر ٢: منتجاته فقط');
  perform test.eq((select name from public.products limit 1), 'انفيرتر سوفار', 'زائر برابط المتجر ٢: المنتج الصحيح');
  perform test.eq((public.current_store() ->> 'name'), 'مركز الحلول للطاقة', 'زائر برابط المتجر ٢: اسم المتجر');
  perform set_config('request.headers', '{"x-store": "not-a-store"}', false);
  perform test.eq((select count(*) from public.products), 0::bigint, 'زائر برابط غير موجود: لا بيانات');
  perform set_config('request.headers', '', false);
end $$;
reset role;

-- زبون يسجّل من رابط المتجر ٢ ينتمي له
insert into test.ids values ('cust3', '00000000-0000-4000-8000-0000000000c3');
insert into auth.users (id, email, raw_user_meta_data) values (test.id('cust3'), 'cust3@raqeem.test', '{"full_name": "زبون ٣", "store": "alhulool"}');
select test.ok((select store_id from public.profiles where id = test.id('cust3')) = test.id('store2'), 'زبون من رابط المتجر ٢: ينتمي للمتجر ٢');
select test.ok((select store_id from public.profiles where id = test.id('cust2')) = test.id('store1'), 'زبون بلا رابط: المتجر ١');

-- ---------------------------------------------------------------- الإيقاف
select test.login('owner');
set role authenticated;
select public.set_store_status(test.id('store2'), 'suspended', 'تجربة');
select test.throws(format('select public.set_store_status(%L, ''suspended'')', test.id('store1')), 'الرئيسي', 'المنصة: لا يُوقف المتجر الرئيسي');
reset role;
select test.login('owner2');
set role authenticated;
select test.ok(not public.has_perm('products.write'), 'متجر موقوف: لا صلاحيات');
reset role;
select test.logout();
set role anon;
select set_config('request.headers', '{"x-store": "alhulool"}', false);
select test.eq((select count(*) from public.products), 0::bigint, 'متجر موقوف: رابطه بلا بيانات');
select set_config('request.headers', '', false);
reset role;

-- الدخول برقم الهاتف: لدالة الخادم فقط
select test.eq(public.login_email('+964 771 111 2222'), 'owner2@raqeem.test', 'الدخول بالهاتف: الرقم يوصل لبريد الحساب');
select test.logout();
set role anon;
select test.throws($$select public.login_email('07711112222')$$, 'permission denied', 'الدخول بالهاتف: الزائر لا يستعلم البريد');
reset role;
