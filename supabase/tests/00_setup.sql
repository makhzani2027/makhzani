-- إعداد الاختبارات: أدوات (schema test) + مستخدمون ومنتجات ثابتة المعرّفات. يُشغَّل أولاً بصلاحية postgres.
set client_min_messages = notice;
drop schema if exists test cascade;
create schema test;
grant usage on schema test to anon, authenticated;

create table test.ids (k text primary key, id uuid not null);
grant select on test.ids to anon, authenticated;

create function test.id(k text) returns uuid language sql stable as $$ select id from test.ids where ids.k = id.k $$;

create function test.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'PASS: %', name; else raise notice 'FAIL: %', name; end if;
end $$;

create function test.eq(got anyelement, want anyelement, name text) returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS: %', name;
  else raise notice 'FAIL: % (got %, want %)', name, got, want; end if;
end $$;

-- ينفّذ SQL ويتوقع خطأ يحوي النص
create function test.throws(q text, expect text, name text) returns void language plpgsql as $$
begin
  execute q;
  raise notice 'FAIL: % (لم يُرفض)', name;
exception when others then
  if sqlerrm like '%' || expect || '%' then raise notice 'PASS: %', name;
  else raise notice 'FAIL: % (خطأ آخر: %)', name, sqlerrm; end if;
end $$;

-- تسجيل دخول: يضبط مطالبات JWT (ثم set role authenticated في ملف الاختبار)
create function test.login(who text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', test.id(who), 'role', 'authenticated', 'aal', aal)::text, false)
$$;
create function test.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', false)
$$;
grant execute on all functions in schema test to anon, authenticated;

-- ---------------------------------------------------------------- المستخدمون
insert into test.ids values
  ('owner', '00000000-0000-4000-8000-0000000000a1'), ('cashier', '00000000-0000-4000-8000-0000000000a2'),
  ('keeper', '00000000-0000-4000-8000-0000000000a3'), ('manager', '00000000-0000-4000-8000-0000000000a4'),
  ('cust_a', '00000000-0000-4000-8000-0000000000b1'), ('cust_b', '00000000-0000-4000-8000-0000000000b2');
insert into auth.users (id, email, raw_user_meta_data)
select id, k || '@raqeem.test', jsonb_build_object('full_name', k) from test.ids;
select public.make_owner('owner@raqeem.test', 'المالك');
update public.profiles set kind = 'staff', status = 'active', role_id = (select id from public.staff_roles where name = 'كاشير') where id = test.id('cashier');
update public.profiles set kind = 'staff', status = 'active', role_id = (select id from public.staff_roles where name = 'أمين مخزن') where id = test.id('keeper');
update public.profiles set kind = 'staff', status = 'active', role_id = (select id from public.staff_roles where name = 'مدير') where id = test.id('manager');

insert into test.ids select 'main', id from public.warehouses where code = 'MAIN';
insert into public.warehouses (name, code, is_sellable) values ('صالة العرض', 'SHOP', true) on conflict do nothing;
insert into test.ids select 'shop', id from public.warehouses where code = 'SHOP';
insert into test.ids select 'cash_customer', id from public.customers where is_cash_customer;
insert into test.ids select 'box_iqd', id from public.money_accounts where name = 'الصندوق الرئيسي';
insert into test.ids select 'box_usd', id from public.money_accounts where name = 'صندوق الدولار';
update public.app_settings set value = value || '{"online_enabled": true}' where key = 'checkout';

-- زبونان أكملا بياناتهما
select test.login('cust_a');
set role authenticated;
select public.upsert_my_profile('زبون أ', '07701234567', 'baghdad');
insert into public.addresses (profile_id, label, recipient_name, phone, governorate, city, area)
values (test.id('cust_a'), 'البيت', 'زبون أ', '07701234567', 'baghdad', 'بغداد', 'الكرادة');
reset role;
select test.login('cust_b');
set role authenticated;
select public.upsert_my_profile('زبون ب', '07801234567', 'baghdad');
reset role;
insert into test.ids select 'cust_a_c', id from public.customers where profile_id = test.id('cust_a');
insert into test.ids select 'cust_b_c', id from public.customers where profile_id = test.id('cust_b');
insert into test.ids select 'addr_a', id from public.addresses where profile_id = test.id('cust_a');

-- ---------------------------------------------------------------- المنتجات (عبر upsert_product كمالك)
select test.login('owner');
set role authenticated;
select public.upsert_product(jsonb_build_object('name', 'كوب سيراميك', 'is_published', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'CUP-1', 'barcode', '6260000000017', 'price', 5000, 'wholesale_price', 4000, 'cost', 3000,
    'opening', jsonb_build_array(jsonb_build_object('warehouse_id', test.id('main'), 'qty', 100)),
    'units', jsonb_build_array(jsonb_build_object('unit_name', 'كرتونة', 'factor', 12, 'barcode', '6260000000024', 'price', 54000))))));
select public.upsert_product(jsonb_build_object('name', 'سماعة لاسلكية', 'is_published', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'HP-1', 'price', 25000, 'cost', 15000,
    'opening', jsonb_build_array(jsonb_build_object('warehouse_id', test.id('main'), 'qty', 1))))));
select public.upsert_product(jsonb_build_object('name', 'حليب طويل الأمد', 'is_published', true, 'track_expiry', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'MILK-1', 'price', 1500, 'cost', 1000))));
select public.upsert_product(jsonb_build_object('name', 'منتج مخفي', 'is_published', false, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'HID-1', 'price', 1000, 'cost', 500,
    'opening', jsonb_build_array(jsonb_build_object('warehouse_id', test.id('main'), 'qty', 5))))));
select public.upsert_product(jsonb_build_object('name', 'هاتف', 'is_published', true, 'track_serials', true, 'variants', jsonb_build_array(
  jsonb_build_object('title', 'افتراضي', 'sku', 'PH-1', 'price', 300000, 'cost', 250000))));
reset role;
insert into test.ids select lower(replace(sku, '-1', '')), id from public.product_variants where sku in ('CUP-1', 'HP-1', 'MILK-1', 'HID-1', 'PH-1');
insert into test.ids select 'carton', id from public.variant_units where barcode = '6260000000024';
insert into public.suppliers (name, phone) values ('مورد الاختبار', '07700000001');
insert into test.ids select 'supplier', id from public.suppliers where name = 'مورد الاختبار';
select test.ok((select count(*) from test.ids) >= 20, 'الإعداد: المستخدمون والمنتجات جاهزة');
