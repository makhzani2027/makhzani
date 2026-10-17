-- الحساب: إكمال البيانات، الواجهة الرئيسية، حذف الحساب (شرط Google Play)
set client_min_messages = notice;
select test.logout();
set role anon;
select test.ok(public.store_home() ?& array['banners', 'sections'], 'store_home: البانرات والأقسام');
select test.ok(jsonb_array_length(public.store_home() -> 'sections') between 1 and 4, 'store_home: الأقسام غير الفارغة فقط');
reset role;

insert into test.ids values ('cust_c', '00000000-0000-4000-8000-0000000000b3');
insert into auth.users (id, email) values (test.id('cust_c'), 'cust_c@raqeem.test');
select test.login('cust_c');
set role authenticated;
select test.throws($$select public.upsert_my_profile('زبون ج', '12345', 'baghdad')$$, 'رقم', 'إكمال البيانات: رقم هاتف غير صالح');
select test.throws($$select public.upsert_my_profile('زبون ج', '07701234567', 'baghdad')$$, '', 'إكمال البيانات: الرقم مستعمل');
select public.upsert_my_profile('زبون ج', '+964 790 123 4567', 'basra');
select test.ok((select onboarded and phone = '+9647901234567' from public.profiles where id = auth.uid()), 'إكمال البيانات: onboarded والرقم موحّد');
select test.ok(public.my_customer_id() is not null, 'إكمال البيانات: صف الزبون');
insert into public.cart_items (profile_id, variant_id, qty) values (auth.uid(), test.id('cup'), 1);
select public.delete_my_account();
reset role;
select test.ok((select full_name = 'زبون محذوف' and phone is null from public.profiles where id = test.id('cust_c'))
  or not exists (select 1 from public.profiles where id = test.id('cust_c')), 'حذف الحساب: البيانات الشخصية مُسحت');
select test.eq((select count(*) from public.cart_items where profile_id = test.id('cust_c')), 0::bigint, 'حذف الحساب: السلة فُرّغت');
