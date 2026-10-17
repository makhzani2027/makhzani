-- =============================================================================
-- رقيم — ٢٠: التخزين (حاويتا media العامة و private)، وصلاحيات تنفيذ دوال RPC (آخر ملف لأنها تشمل كل الدوال)
-- آمن لإعادة التشغيل
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/webp', 'image/png', 'image/jpeg']),
       ('private', 'private', false, 10485760, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- media: قراءة للجميع؛ الكتابة لـ products.write أو store.manage داخل المجلدات المعروفة
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[1] in ('products', 'categories', 'brands', 'banners', 'campaigns')
  and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))));
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated using (
  bucket_id = 'media' and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))));

-- private: requests/<uid>/… و avatars/<uid>/… — كل مستخدم في مجلده؛ requests.manage يقرأ كل الطلبات
drop policy if exists private_insert_own on storage.objects;
create policy private_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'private' and (storage.foldername(name))[1] in ('requests', 'avatars')
  and (storage.foldername(name))[2] = (select auth.uid())::text);
drop policy if exists private_read on storage.objects;
create policy private_read on storage.objects for select to authenticated using (
  bucket_id = 'private' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or ((storage.foldername(name))[1] = 'requests' and (select public.has_perm('requests.manage')))
    or ((storage.foldername(name))[1] = 'avatars' and (select public.is_staff()))));
drop policy if exists private_delete_own on storage.objects;
create policy private_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'private' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- دوال الموظفين للمستخدم المسجّل فقط (وتفحص الصلاحية بنفسها)
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('upsert_product', 'archive_product', 'restore_product', 'next_barcode', 'pos_checkout',
             'post_purchase', 'post_return', 'void_invoice', 'record_payment', 'record_expense', 'adjust_stock', 'transfer_stock',
             'create_stocktake', 'set_stocktake_count', 'apply_stocktake', 'post_stock_voucher', 'save_quotation', 'convert_quotation',
             'transfer_money', 'set_order_status', 'set_request_status', 'open_cash_session', 'close_cash_session', 'dashboard_summary',
             'sales_series', 'top_products', 'inventory_valuation', 'low_stock', 'stagnant_products', 'near_expiry', 'customer_statement',
             'supplier_statement', 'send_campaign', 'place_order', 'cancel_my_order', 'upsert_my_profile', 'delete_my_account',
             'create_product_request', 'submit_review', 'mark_notifications_read') loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
