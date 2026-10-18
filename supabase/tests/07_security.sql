-- إصلاحات المراجعة الأمنية (migration ٢١): الملاحظة الداخلية للطلب، وعزل payment_transactions عن الزبون
set client_min_messages = notice;

select test.login('cust_a');
set role authenticated;
select public.place_order(jsonb_build_array(jsonb_build_object('variant_id', test.id('cup'), 'qty', 4)), test.id('addr_a'), 'delivery', 'cod', null, 'sec-note-order');
reset role;
insert into test.ids select 'sec_order', id from public.orders where customer_note = 'sec-note-order';
-- محاولة دفع (كأنها من دالة payments بمفتاح الخادم) برد خام فيه سر
insert into public.payment_transactions (order_id, provider, amount, status, raw)
values (test.id('sec_order'), 'wayl', 25000, 'pending', '{"webhookSecret": "leak"}');

select test.login('owner');
set role authenticated;
do $$
declare r jsonb; n0 bigint; e0 bigint;
begin
  n0 := test.peek(format('select count(*) from public.notifications where profile_id = %L', test.id('cust_a')))::bigint;
  e0 := test.peek(format('select count(*) from public.order_events where order_id = %L', test.id('sec_order')))::bigint;
  r := public.set_order_status(test.id('sec_order'), null, 'زبون كثير الإرجاع');
  perform test.eq(r ->> 'status', 'pending', 'ملاحظة داخلية: الحالة لا تتغير');
  perform test.eq(test.peek(format('select count(*) from public.order_events where order_id = %L', test.id('sec_order')))::bigint, e0 + 1,
    'ملاحظة داخلية: حدث جديد');
  perform test.eq(test.peek(format('select is_customer_visible::text from public.order_events where order_id = %L and note = %L',
    test.id('sec_order'), 'زبون كثير الإرجاع')), 'false', 'ملاحظة داخلية: الحدث غير ظاهر للزبون');
  perform test.eq(test.peek(format('select count(*) from public.notifications where profile_id = %L', test.id('cust_a')))::bigint, n0,
    'ملاحظة داخلية: لا إشعار للزبون');
  perform test.throws(format('select public.set_order_status(%L, null, %L)', test.id('sec_order'), '  '), 'اكتب الملاحظة', 'ملاحظة داخلية: فارغة ← رفض');
  perform test.ok((select count(*) from public.payment_transactions where order_id = test.id('sec_order')) = 1, 'payment_transactions: الموظف orders.view يقرأ');
end $$;
reset role;

select test.login('cust_a');
set role authenticated;
select test.eq((select count(*) from public.payment_transactions), 0::bigint, 'payment_transactions: الزبون لا يقرأ صفوف دفعه (raw)');
select test.eq((select count(*) from public.order_events where note = 'زبون كثير الإرجاع'), 0::bigint, 'ملاحظة داخلية: الزبون لا يراها');
select test.ok((select count(*) from public.orders where id = test.id('sec_order')) = 1, 'الزبون ما زال يرى طلبه');
select public.cancel_my_order(test.id('sec_order'), 'تنظيف الاختبار');
reset role;
