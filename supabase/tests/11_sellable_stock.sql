-- الكميات المتاحة لمن يبيع بلا «عرض المخزون» (migration ٢٥)
set client_min_messages = notice;

-- دور بيع فقط (بلا inventory.view)
reset role;
update public.staff_roles set permissions = array_remove(permissions, 'inventory.view') where name = 'كاشير';

select test.login('cashier');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.stock_levels;
  perform test.eq(n, 0, 'بيع بلا عرض المخزون: جدول stock_levels محجوب (RLS)');
  perform test.ok(exists (select 1 from public.sellable_stock() x where x.variant_id = test.id('ph') and x.warehouse_id = test.id('main') and x.available > 0),
    'بيع بلا عرض المخزون: sellable_stock يعيد المتاح في المخزن');
end $$;
reset role;

-- المطابقة مع الجدول (المالك)
select test.login('owner');
set role authenticated;
do $$
declare bad int; missing int;
begin
  select count(*) into bad from public.sellable_stock() x
    join public.stock_levels s on s.variant_id = x.variant_id and s.warehouse_id = x.warehouse_id
    where x.available <> s.qty - s.reserved;
  perform test.eq(bad, 0, 'sellable_stock: المتاح = الكمية − المحجوز');
  select count(*) into missing from public.stock_levels s join public.warehouses w on w.id = s.warehouse_id
    where w.is_active and w.is_sellable and s.qty - s.reserved <> 0
      and not exists (select 1 from public.sellable_stock() x where x.variant_id = s.variant_id and x.warehouse_id = s.warehouse_id);
  perform test.eq(missing, 0, 'sellable_stock: كل كميات المخازن القابلة للبيع موجودة');
  perform test.ok(not exists (select 1 from public.sellable_stock() x join public.warehouses w on w.id = x.warehouse_id where not (w.is_active and w.is_sellable)),
    'sellable_stock: المخازن غير القابلة للبيع أو المعطلة مستبعدة');
end $$;
reset role;

-- زبون أو مجهول: ممنوع
select test.login('cust_a');
set role authenticated;
select test.throws('select * from public.sellable_stock()', 'لا تملك صلاحية', 'sellable_stock: الزبون ممنوع');
reset role;
select test.logout();
set role anon;
select test.throws('select * from public.sellable_stock()', 'permission denied', 'sellable_stock: المجهول ممنوع');
reset role;

update public.staff_roles set permissions = array_append(permissions, 'inventory.view') where name = 'كاشير' and not ('inventory.view' = any (permissions));
