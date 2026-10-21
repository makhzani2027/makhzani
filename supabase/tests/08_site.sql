-- محتوى الموقع التعريفي: app_settings.site (migration 22) — قراءة عامة، كتابة settings.manage فقط
set client_min_messages = notice;

select test.ok((select is_public from public.app_settings where key = 'site'), 'site: الصف موجود وعام');
select test.ok((select jsonb_array_length(value -> 'faq') from public.app_settings where key = 'site') > 0
  and (select jsonb_array_length(value #> '{delivery,governorates}') from public.app_settings where key = 'site') = 18,
  'site: القيمة الافتراضية (أسئلة + ١٨ محافظة)');

-- ---------------------------------------------------------------- الزائر
select test.logout();
set role anon;
select test.eq((select count(*) from public.app_settings where key in ('store', 'site')), 2::bigint, 'anon: يقرأ store و site معاً (key=in.(store,site))');
select test.eq((select value #>> '{payments,methods,0,key}' from public.app_settings where key = 'site'), 'cod', 'anon: يقرأ طرق الدفع');
update public.app_settings set value = '{}' where key = 'site';
select test.throws($$insert into public.app_settings (key, value, is_public) values ('site3', '{}', true)$$, '', 'anon: لا يكتب في app_settings');
reset role;
select test.ok((select jsonb_array_length(value -> 'faq') from public.app_settings where key = 'site') > 0, 'anon: تعديله لم يغيّر شيئاً');

-- ---------------------------------------------------------------- الزبون
select test.login('cust_a');
set role authenticated;
select test.ok((select count(*) from public.app_settings where key = 'site') = 1, 'زبون: يقرأ site');
update public.app_settings set value = '{"faq": []}' where key = 'site';
select test.throws($$insert into public.app_settings (key, value, is_public) values ('site', '{}', true) on conflict (key) do update set value = excluded.value$$,
  'row-level security', 'زبون: لا يكتب site (upsert)');
select test.throws($$insert into public.app_settings (key, value, is_public) values ('site2', '{}', true)$$, 'row-level security', 'زبون: لا ينشئ مفتاحاً');
select test.throws($$insert into storage.objects (bucket_id, name) values ('media', 'site/payments/x-sm.webp')$$, 'row-level security', 'زبون: لا يرفع شعار دفع');
reset role;
select test.ok((select jsonb_array_length(value -> 'faq') from public.app_settings where key = 'site') > 0, 'زبون: تعديله لم يغيّر شيئاً');

-- ---------------------------------------------------------------- موظف بلا settings.manage
select test.login('cashier');
set role authenticated;
update public.app_settings set value = '{"faq": []}' where key = 'site';
reset role;
select test.ok((select jsonb_array_length(value -> 'faq') from public.app_settings where key = 'site') > 0, 'كاشير: لا يعدّل site');

-- ---------------------------------------------------------------- settings.manage
select test.login('owner');
set role authenticated;
select test.ok(public.has_perm('settings.manage'), 'المالك: يملك settings.manage');
insert into public.app_settings (key, value, is_public)
values ('site', jsonb_set((select value from public.app_settings where key = 'site'), '{faq}', '[{"q": "سؤال اختبار؟", "a": "جواب."}]'), true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
insert into storage.objects (bucket_id, name) values ('media', 'site/payments/test-sm.webp');
select test.ok(true, 'settings.manage: يرفع شعار دفع في media/site/');
reset role;
select test.eq((select value #>> '{faq,0,q}' from public.app_settings where key = 'site'), 'سؤال اختبار؟', 'settings.manage: يكتب site');
select test.logout();
set role anon;
select test.eq((select value #>> '{faq,0,q}' from public.app_settings where key = 'site'), 'سؤال اختبار؟', 'anon: يرى التعديل فوراً');
reset role;

-- إعادة التشغيل لا تمسح تعديل المالك (on conflict do nothing)
insert into public.app_settings (key, value, is_public) values ('site', '{}', true) on conflict (key) do nothing;
select test.eq((select value #>> '{faq,0,q}' from public.app_settings where key = 'site'), 'سؤال اختبار؟', 'site: البذرة لا تكتب فوق التعديل');
delete from storage.objects where name = 'site/payments/test-sm.webp';
