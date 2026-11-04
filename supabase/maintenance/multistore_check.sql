-- فحص قراءة فقط بعد تفعيل تعدد المتاجر: المتاجر، مدير المنصة، العزل، وأن بيانات المتجر ١ كاملة
select jsonb_build_object(
  'stores', (select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'status', status)) from public.stores),
  'platform_admins', (select jsonb_agg(full_name) from public.profiles where is_platform_admin),
  'store1', jsonb_build_object(
    'products', (select count(*) from public.products where store_id = '00000000-0000-4000-a000-000000000001'),
    'stock_total', (select coalesce(sum(qty), 0) from public.stock_levels where store_id = '00000000-0000-4000-a000-000000000001'),
    'customers', (select count(*) from public.customers where store_id = '00000000-0000-4000-a000-000000000001'),
    'settings', (select count(*) from public.app_settings where store_id = '00000000-0000-4000-a000-000000000001'),
    'quotations', (select count(*) from public.quotations where store_id = '00000000-0000-4000-a000-000000000001')),
  'rows_without_store', (select count(*) from public.products where store_id is null),
  'isolation_policies', (select count(*) from pg_policies where schemaname = 'public' and policyname = 'store_isolation'),
  'fn_on_raqeem_fn', (select count(*) from pg_proc where pg_get_userbyid(proowner) = 'raqeem_fn'),
  'migrations', (select jsonb_agg(version order by version desc) from (select version from supabase_migrations.schema_migrations order by version desc limit 3) m)
) as check;
