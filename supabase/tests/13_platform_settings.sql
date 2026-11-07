-- موقع رقيم التعريفي (migration ٢٩): بيانات التواصل للمنصة وحدها — لا يعدّلها أي صاحب متجر
set client_min_messages = notice;
reset role;

-- الزائر يقرأ
select test.logout();
set role anon;
select test.ok((select count(*) from public.platform_settings where key = 'contact') = 1, 'موقع رقيم: الزائر يقرأ بيانات التواصل');
select test.throws($$insert into public.platform_settings (key, value) values ('contact2', '{}')$$, 'permission denied', 'موقع رقيم: الزائر لا يكتب');
select test.throws($$select public.set_platform_setting('contact', '{"phone": "07700000001"}')$$, 'permission denied', 'موقع رقيم: الزائر لا يستدعي الحفظ');
reset role;

-- صاحب متجر آخر (فعّال) لا يعدّل
select test.login('owner2');
set role authenticated;
select test.throws($$select public.set_platform_setting('contact', '{"phone": "07700000001"}')$$, 'لا تملك صلاحية', 'موقع رقيم: صاحب متجر آخر لا يعدّل');
select test.throws($$update public.platform_settings set value = '{}'$$, 'permission denied', 'موقع رقيم: لا تعديل مباشر على الجدول');
-- ولا يغيّر الموقع من إعدادات متجره
update public.app_settings set value = value || '{"phone": "+9647709999999"}' where key = 'store';
select test.ok(coalesce((select value ->> 'phone' from public.platform_settings where key = 'contact'), '') <> '+9647709999999', 'موقع رقيم: إعدادات المتجر لا تغيّر الموقع');
reset role;

-- مدير المنصة يعدّل، والقيم تُنظَّف
select test.login('owner');
set role authenticated;
select test.eq((public.set_platform_setting('contact', '{"phone": "+9647701112222", "email": "info@raqeem.iq", "evil": "x", "socials": {"instagram": "https://instagram.com/raqeem", "facebook": "javascript:alert(1)"}}') ->> 'email'), 'info@raqeem.iq', 'موقع رقيم: مدير المنصة يحفظ');
select test.eq((select value ->> 'phone' from public.platform_settings where key = 'contact'), '+9647701112222', 'موقع رقيم: الحفظ وصل');
select test.ok(not ((select value from public.platform_settings where key = 'contact') ? 'evil'), 'موقع رقيم: حقول غير معروفة تُحذف');
select test.ok(not ((select value -> 'socials' from public.platform_settings where key = 'contact') ? 'facebook'), 'موقع رقيم: روابط غير https تُحذف');
select test.throws($$select public.set_platform_setting('other', '{}')$$, 'إعداد غير معروف', 'موقع رقيم: مفاتيح معروفة فقط');
reset role;

-- لا أحد يمنح نفسه (أو غيره) إدارة المنصة من الواجهة: زبون، ولا صاحب متجر بصلاحية الموظفين
select test.login('cust_a');
set role authenticated;
select test.throws($$update public.profiles set is_platform_admin = true where id = auth.uid()$$, 'إدارة المنصة', 'مدير المنصة: الزبون لا يمنح نفسه');
reset role;
select test.login('owner2');
set role authenticated;
select test.throws($$update public.profiles set is_platform_admin = true where id = auth.uid()$$, 'إدارة المنصة', 'مدير المنصة: صاحب متجر لا يمنح نفسه');
reset role;
select test.ok(not (select is_platform_admin from public.profiles where id = test.id('cust_a')) and not (select is_platform_admin from public.profiles where id = test.id('owner2')), 'مدير المنصة: لم يتغير شيء');
select test.login('cust_a');
set role authenticated;
select test.throws($$update public.profiles set store_id = (select id from public.stores where id <> private.store1() limit 1) where id = auth.uid()$$, '', 'العزل: الزبون لا ينقل نفسه لمتجر آخر');
reset role;
