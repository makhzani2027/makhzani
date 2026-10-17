-- =============================================================================
-- رقيم — ١٨: سياسات RLS لكل جدول (المصفوفة في system/06-database.md) والصلاحيات على الجداول والدوال.
-- مبدأ: القراءة بسياسات، والكتابة على المستندات والمخزون عبر دوال security definer فقط.
-- آمن لإعادة التشغيل: كل سياسة تُحذف ثم تُنشأ
-- =============================================================================

-- ينشئ سياسة من جديد (drop if exists ثم create)
create or replace function private.pol(t text, n text, cmd text, using_expr text, check_expr text default null, roles text default 'anon, authenticated')
returns void language plpgsql set search_path = '' as $$
begin
  execute format('drop policy if exists %I on public.%I', n, t);
  execute format('create policy %I on public.%I for %s to %s %s %s', n, t, cmd, roles,
    case when cmd = 'insert' then '' else 'using (' || using_expr || ')' end,
    case when cmd in ('insert', 'update', 'all') then 'with check (' || coalesce(check_expr, using_expr) || ')' else '' end);
end $$;

-- RLS على كل جداول public
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- الكتالوج (قراءة عامة للظاهر)
select private.pol('categories', 'categories_read', 'select', 'is_visible or (select public.has_perm(''products.view''))');
select private.pol('categories', 'categories_write', 'all', '(select public.has_perm(''products.write'')) or (select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('brands', 'brands_read', 'select', 'true');
select private.pol('brands', 'brands_write', 'all', '(select public.has_perm(''products.write'')) or (select public.has_perm(''store.manage''))', null, 'authenticated');

select private.pol('products', 'products_read', 'select', '(is_published and archived_at is null) or (select public.has_perm(''products.view''))');
select private.pol('products', 'products_insert', 'insert', null, '(select public.has_perm(''products.write''))', 'authenticated');
select private.pol('products', 'products_update', 'update', '(select public.has_perm(''products.write''))', null, 'authenticated');
select private.pol('products', 'products_delete', 'delete', '(select public.has_perm(''products.delete''))', null, 'authenticated');

select private.pol('product_variants', 'variants_read', 'select',
  'exists (select 1 from public.products p where p.id = product_id and p.is_published and p.archived_at is null) or (select public.has_perm(''products.view''))');
select private.pol('product_variants', 'variants_write', 'all', '(select public.has_perm(''products.write''))', null, 'authenticated');
select private.pol('product_images', 'images_read', 'select',
  'exists (select 1 from public.products p where p.id = product_id and p.is_published and p.archived_at is null) or (select public.has_perm(''products.view''))');
select private.pol('product_images', 'images_write', 'all', '(select public.has_perm(''products.write''))', null, 'authenticated');
select private.pol('variant_units', 'units_read', 'select',
  'exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and p.is_published and p.archived_at is null) or (select public.has_perm(''products.view''))');
select private.pol('variant_units', 'units_write', 'all', '(select public.has_perm(''products.write''))', null, 'authenticated');
-- التكلفة: قراءة costs.view فقط، والكتابة عبر upsert_product وحركات المخزون
select private.pol('variant_costs', 'costs_read', 'select', '(select public.has_perm(''costs.view''))', null, 'authenticated');

select private.pol('reviews', 'reviews_read', 'select', 'is_visible or profile_id = (select auth.uid()) or (select public.has_perm(''products.write''))');
select private.pol('reviews', 'reviews_moderate', 'update', '(select public.has_perm(''products.write''))', null, 'authenticated');

-- ---------------------------------------------------------------- واجهة المتجر
select private.pol('banners', 'banners_read', 'select',
  '(is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or (select public.has_perm(''store.manage''))');
select private.pol('banners', 'banners_write', 'all', '(select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('home_sections', 'sections_read', 'select', 'is_active or (select public.has_perm(''store.manage''))');
select private.pol('home_sections', 'sections_write', 'all', '(select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('delivery_zones', 'zones_read', 'select', 'is_active or (select public.is_staff())');
select private.pol('delivery_zones', 'zones_write', 'all', '(select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('coupons', 'coupons_staff', 'all', '(select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('coupon_redemptions', 'redemptions_read', 'select', '(select public.has_perm(''store.manage''))', null, 'authenticated');
select private.pol('notification_campaigns', 'campaigns_staff', 'all', '(select public.has_perm(''notifications.send''))', null, 'authenticated');

select private.pol('app_settings', 'settings_read', 'select', 'is_public or (select public.is_staff())');
select private.pol('app_settings', 'settings_write', 'all', '(select public.has_perm(''settings.manage''))', null, 'authenticated');

-- ---------------------------------------------------------------- الحسابات والأدوار
select private.pol('profiles', 'profiles_read', 'select',
  'id = (select auth.uid()) or (select public.has_perm(''customers.view'')) or (select public.has_perm(''staff.manage'')) or (kind = ''staff'' and (select public.is_staff()))', null, 'authenticated');
-- protect_profile يمنع تغيير kind/role_id/is_owner/status لغير staff.manage
select private.pol('profiles', 'profiles_update', 'update', 'id = (select auth.uid()) or (select public.has_perm(''staff.manage''))', null, 'authenticated');
select private.pol('staff_roles', 'roles_read', 'select', '(select public.is_staff())', null, 'authenticated');
select private.pol('staff_roles', 'roles_write', 'all', '(select public.has_perm(''staff.manage''))', null, 'authenticated');
select private.pol('audit_log', 'audit_read', 'select', '(select public.has_perm(''audit.view''))', null, 'authenticated');

select private.pol('customers', 'customers_read', 'select', 'profile_id = (select auth.uid()) or (select public.has_perm(''customers.view''))', null, 'authenticated');
select private.pol('customers', 'customers_insert', 'insert', null, '(select public.has_perm(''customers.manage''))', 'authenticated');
select private.pol('customers', 'customers_update', 'update', '(select public.has_perm(''customers.manage''))', null, 'authenticated');
select private.pol('customers', 'customers_delete', 'delete', '(select public.has_perm(''customers.manage'')) and not is_cash_customer', null, 'authenticated');
select private.pol('suppliers', 'suppliers_read', 'select', '(select public.has_perm(''purchases.manage'')) or (select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('suppliers', 'suppliers_write', 'all', '(select public.has_perm(''purchases.manage''))', null, 'authenticated');

-- ملك الزبون فقط
select private.pol('addresses', 'addresses_own', 'all', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('cart_items', 'cart_own', 'all', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('favorites', 'favorites_own', 'all', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('push_tokens', 'push_tokens_own', 'all', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('notifications', 'notifications_own_read', 'select', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('notifications', 'notifications_own_update', 'update', 'profile_id = (select auth.uid())', null, 'authenticated');
select private.pol('notifications', 'notifications_own_delete', 'delete', 'profile_id = (select auth.uid())', null, 'authenticated');

-- ---------------------------------------------------------------- الطلبات (الكتابة عبر الدوال)
select private.pol('orders', 'orders_read', 'select', 'profile_id = (select auth.uid()) or (select public.has_perm(''orders.view''))', null, 'authenticated');
select private.pol('order_items', 'order_items_read', 'select',
  'exists (select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid())) or (select public.has_perm(''orders.view''))', null, 'authenticated');
select private.pol('order_events', 'order_events_read', 'select',
  '(is_customer_visible and exists (select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid()))) or (select public.has_perm(''orders.view''))', null, 'authenticated');
select private.pol('order_reservations', 'reservations_read', 'select', '(select public.has_perm(''orders.view'')) or (select public.has_perm(''inventory.view''))', null, 'authenticated');
select private.pol('payment_transactions', 'payment_tx_read', 'select',
  'exists (select 1 from public.orders o where o.id = order_id and o.profile_id = (select auth.uid())) or (select public.has_perm(''orders.view''))', null, 'authenticated');
select private.pol('product_requests', 'requests_read', 'select', 'profile_id = (select auth.uid()) or (select public.has_perm(''requests.manage''))', null, 'authenticated');
select private.pol('product_requests', 'requests_staff_update', 'update', '(select public.has_perm(''requests.manage''))', null, 'authenticated');

-- ---------------------------------------------------------------- المخزون (قراءة inventory.view، الكتابة عبر الدوال)
do $$
declare t text;
begin
  foreach t in array array['stock_levels', 'stock_movements', 'serials', 'transfers', 'transfer_items', 'stocktakes', 'stocktake_items',
    'stock_lots', 'stock_vouchers', 'stock_voucher_items'] loop
    perform private.pol(t, t || '_read', 'select', '(select public.has_perm(''inventory.view''))', null, 'authenticated');
  end loop;
end $$;
select private.pol('warehouses', 'warehouses_read', 'select', '(select public.is_staff())', null, 'authenticated');
select private.pol('warehouses', 'warehouses_write', 'all', '(select public.has_perm(''settings.manage''))', null, 'authenticated');
select private.pol('branches', 'branches_read', 'select', '(select public.is_staff())', null, 'authenticated');
select private.pol('branches', 'branches_write', 'all', '(select public.has_perm(''settings.manage''))', null, 'authenticated');

-- ---------------------------------------------------------------- المال
select private.pol('invoices', 'invoices_read', 'select', '(select public.has_perm(''invoices.view'')) or (select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('invoice_items', 'invoice_items_read', 'select', '(select public.has_perm(''invoices.view'')) or (select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('payments', 'payments_read', 'select', '(select public.has_perm(''finance.view'')) or (select public.has_perm(''invoices.view''))', null, 'authenticated');
select private.pol('expenses', 'expenses_read', 'select', '(select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('cash_sessions', 'cash_sessions_read', 'select', 'opened_by = (select auth.uid()) or (select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('money_accounts', 'money_accounts_read', 'select', '(select public.is_staff())', null, 'authenticated');
select private.pol('money_accounts', 'money_accounts_write', 'all', '(select public.has_perm(''settings.manage'')) or (select public.has_perm(''finance.manage''))', null, 'authenticated');
select private.pol('account_transfers', 'account_transfers_read', 'select', '(select public.has_perm(''finance.view''))', null, 'authenticated');
select private.pol('quotations', 'quotations_read', 'select', '(select public.has_perm(''quotations.manage'')) or (select public.has_perm(''invoices.view''))', null, 'authenticated');
select private.pol('quotation_items', 'quotation_items_read', 'select', '(select public.has_perm(''quotations.manage'')) or (select public.has_perm(''invoices.view''))', null, 'authenticated');
-- doc_counters: لا سياسات = لا وصول لأحد عبر الواجهة

-- ---------------------------------------------------------------- صلاحيات الجداول (حماية إضافية فوق RLS)
do $$
declare t text;
begin
  foreach t in array array['stock_levels', 'stock_movements', 'stock_lots', 'serials', 'transfers', 'transfer_items', 'stocktakes',
    'stocktake_items', 'stock_vouchers', 'stock_voucher_items', 'invoices', 'invoice_items', 'payments', 'expenses', 'cash_sessions',
    'account_transfers', 'quotations', 'quotation_items', 'orders', 'order_items', 'order_events', 'order_reservations',
    'payment_transactions', 'coupon_redemptions', 'doc_counters', 'audit_log', 'variant_costs', 'reviews', 'product_requests', 'notifications'] loop
    execute format('revoke insert, delete, truncate on public.%I from anon, authenticated', t);
    if t not in ('reviews', 'product_requests', 'notifications') then
      execute format('revoke update on public.%I from anon, authenticated', t);
    end if;
  end loop;
  execute 'revoke all on public.doc_counters from anon, authenticated';
  -- العروض: للزبون والزائر لا شيء منها (تبقى للموظفين حسب RLS الجداول تحتها)
  execute 'revoke all on public.customer_balances, public.supplier_balances, public.variant_stock, public.money_account_balances from anon';
  execute 'grant select on public.customer_balances, public.supplier_balances, public.variant_stock, public.money_account_balances to authenticated';
  execute 'revoke insert, update, delete on public.customer_balances, public.supplier_balances, public.variant_stock, public.money_account_balances from authenticated';
  -- الإشعار: الزبون يغيّر read_at فقط
  execute 'revoke update on public.notifications from anon, authenticated';
  execute 'grant update (read_at) on public.notifications to authenticated';
  execute 'revoke update on public.reviews from anon';
  execute 'revoke update on public.product_requests from anon';
end $$;

-- ---------------------------------------------------------------- صلاحيات الدوال
-- الداخلية والمشغّلات لا تُستدعى من الواجهة
revoke all on all functions in schema private from public;
do $$ begin
  revoke usage on schema private from anon, authenticated;
exception when undefined_object then null; end $$;
revoke execute on function public.next_doc_number(text) from public;
do $$ begin
  revoke execute on function public.next_doc_number(text) from anon, authenticated;
  revoke execute on function public.make_owner(text, text) from anon, authenticated;
  revoke execute on function public.set_updated_at() from anon, authenticated;
exception when undefined_object then null; end $$;
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
