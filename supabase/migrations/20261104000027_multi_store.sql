-- =============================================================================
-- رقيم — ٢٧: تعدد المتاجر. آمن لإعادة التشغيل.
--
-- كل متجر منفصل تماماً: منتجاته ومخزونه وزبائنه وفواتيره وإعداداته وترقيم مستنداته.
-- المتجر الموجود يصبح «المتجر رقم ١» (المعرّف الثابت أدناه) ولا يتغير فيه شيء:
-- كل صف قائم يُعلَّم بـ store_id = المتجر ١ دون تعديل أي قيمة أخرى.
--
-- كيف يُعرف المتجر الحالي (private.current_store):
--   ١) مستخدم مسجّل ← متجر ملفه (profiles.store_id).
--   ٢) زائر برابط متجر ← ترويسة x-store = رابط المتجر (slug) لمتجر فعّال.
--   ٣) زائر بلا ترويسة (تطبيق المتجر الحالي) ← المتجر ١.
--   ٤) سياق الخادم (بلا JWT أو service_role) ← null = بلا قيد (الدوال الداخلية والمهام).
--
-- العزل في الجذر لا في الشاشات:
--   • سياسة RLS تقييدية (restrictive) على كل جدول: الصف مرئي/قابل للكتابة فقط لمتجره.
--   • الدوال (security definer) تُنقل لدور raqeem_fn الخاضع لـ RLS، فكل استعلاماتها داخل المتجر
--     تلقائياً دون إعادة كتابتها. الدوال التي تحتاج auth.users أو الشبكة تبقى للدور postgres.
--   • مشغّل يملأ store_id عند الإدراج: المتجر الحالي، أو متجر الصف الأب (للخادم)، أو المتجر ١.
--   • القيود الفريدة (الباركود، SKU، أرقام المستندات، الأسماء…) صارت داخل كل متجر.
-- =============================================================================

-- ---------------------------------------------------------------- المتاجر
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  logo_key text,
  phone text,
  email text,
  governorate text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'rejected')),
  owner_id uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint stores_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$')
);
create unique index if not exists stores_slug_key on public.stores (slug);
create index if not exists stores_status_idx on public.stores (status);

create or replace function private.store1() returns uuid
language sql immutable set search_path = '' as $$ select '00000000-0000-4000-a000-000000000001'::uuid $$;

insert into public.stores (id, slug, name, phone, status, approved_at)
select private.store1(), 'raqeem',
  coalesce(nullif(btrim((select value ->> 'name' from public.app_settings where key = 'store')), ''), 'رقيم'),
  (select value ->> 'phone' from public.app_settings where key = 'store'), 'active', now()
where not exists (select 1 from public.stores where id = private.store1());

-- ---------------------------------------------------------------- الملفات الشخصية
alter table public.profiles add column if not exists store_id uuid not null default '00000000-0000-4000-a000-000000000001'
  references public.stores (id) on delete restrict;
alter table public.profiles alter column store_id drop default;
alter table public.profiles add column if not exists is_platform_admin boolean not null default false;
create index if not exists profiles_store_idx on public.profiles (store_id);

-- مالك المتجر ١ = مدير المنصة (يوافق على المتاجر الجديدة)، ومالك المتجر ١ في جدول المتاجر
update public.profiles set is_platform_admin = true where is_owner and store_id = private.store1() and not is_platform_admin;
update public.stores s set owner_id = (select p.id from public.profiles p where p.is_owner and p.store_id = s.id order by p.created_at limit 1)
where s.id = private.store1() and s.owner_id is null;

-- ---------------------------------------------------------------- المتجر الحالي
create or replace function public.current_store_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s uuid;
  claims jsonb;
  hdr text;
begin
  if uid is not null then
    select p.store_id into s from public.profiles p where p.id = uid;
    if s is not null then return s; end if;
  end if;
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then claims := null;
  end;
  -- سياق الخادم: المهام الداخلية، الـ migrations، ومفتاح service_role
  if claims is null or claims ->> 'role' = 'service_role' then return null; end if;
  -- زائر برابط متجر
  begin
    hdr := lower(btrim(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-store'));
  exception when others then hdr := null;
  end;
  if hdr is not null and hdr <> '' then
    select x.id into s from public.stores x where x.slug = hdr and x.status = 'active';
    -- رابط غير موجود أو غير فعّال: لا بيانات (لا نرجع للمتجر ١)
    return coalesce(s, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return private.store1();
end $$;

-- للاستعمال الداخلي (نفس القيمة)
create or replace function private.current_store() returns uuid
language sql stable security definer set search_path = '' as $$ select public.current_store_id() $$;

-- للواجهات: متجر المستخدم الحالي (اسم وشعار ورابط)
create or replace function public.current_store() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) - 'note' from public.stores s where s.id = coalesce(private.current_store(), private.store1())
$$;

-- يملأ store_id عند الإدراج: المتجر الحالي ← متجر الصف الأب (TG_ARGV: عمود، جدول، ...) ← المتجر ١.
-- ويمنع إدراج صف لمتجر غير متجر المستخدم.
create or replace function private.fill_store() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cur uuid := private.current_store();
  i int := 0;
  ref uuid;
  parent uuid;
begin
  if new.store_id is null then
    new.store_id := cur;
    while new.store_id is null and i < coalesce(tg_nargs, 0) - 1 loop
      ref := nullif(to_jsonb(new) ->> tg_argv[i], '')::uuid;
      if ref is not null then
        execute format('select store_id from public.%I where id = $1', tg_argv[i + 1]) into parent using ref;
        new.store_id := parent;
      end if;
      i := i + 2;
    end loop;
    new.store_id := coalesce(new.store_id, private.store1());
  elsif cur is not null and new.store_id <> cur and coalesce(current_setting('raqeem.store_admin', true), '') <> 'on' then
    raise exception using message = 'لا يمكن الكتابة في بيانات متجر آخر.', errcode = '42501';
  end if;
  return new;
end $$;

-- منع نقل صف من متجر لآخر
create or replace function private.keep_store() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- سياق الخادم (current_store_id = null) أو دوال إدارة المتاجر فقط
  if new.store_id is distinct from old.store_id and coalesce(current_setting('raqeem.store_admin', true), '') <> 'on'
     and public.current_store_id() is not null then
    raise exception using message = 'لا يمكن نقل البيانات بين المتاجر.', errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- دور الدوال (خاضع لـ RLS)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'raqeem_fn') then
    create role raqeem_fn nologin inherit;
  end if;
end $$;
grant raqeem_fn to postgres;
grant authenticated to raqeem_fn;
grant usage on schema public, private to raqeem_fn;
grant all on all tables in schema public to raqeem_fn;
grant all on all sequences in schema public to raqeem_fn;
grant usage, select, update on all sequences in schema private to raqeem_fn;
grant execute on all functions in schema public, private to raqeem_fn;
alter default privileges in schema public grant all on tables to raqeem_fn;
alter default privileges in schema public grant all on sequences to raqeem_fn;
alter default privileges in schema public, private grant execute on functions to raqeem_fn;
do $$ begin
  execute 'grant usage on schema extensions to raqeem_fn';
exception when others then null; end $$;

-- ---------------------------------------------------------------- store_id على كل الجداول
-- الجدول ← أعمدة الآباء لاستنتاج المتجر في سياق الخادم (عمود، جدول، ...)
drop table if exists pg_temp._tenant;
create temporary table _tenant (t text primary key, parents text[]);
insert into _tenant values
  ('account_transfers', '{}'), ('addresses', '{profile_id,profiles}'), ('app_settings', '{}'), ('audit_log', '{}'),
  ('banners', '{}'), ('branches', '{}'), ('brands', '{}'), ('cart_items', '{profile_id,profiles}'),
  ('cash_sessions', '{}'), ('categories', '{}'), ('coupon_redemptions', '{order_id,orders,coupon_id,coupons}'), ('coupons', '{}'),
  ('customers', '{profile_id,profiles}'), ('delivery_zones', '{}'), ('doc_counters', '{}'), ('expenses', '{}'),
  ('favorites', '{profile_id,profiles}'), ('home_sections', '{}'), ('invoice_items', '{invoice_id,invoices}'), ('invoices', '{order_id,orders}'),
  ('money_accounts', '{}'), ('notification_campaigns', '{}'), ('notifications', '{profile_id,profiles}'),
  ('order_events', '{order_id,orders}'), ('order_items', '{order_id,orders}'), ('order_reservations', '{order_id,orders}'),
  ('orders', '{profile_id,profiles}'), ('payment_transactions', '{order_id,orders}'), ('payments', '{invoice_id,invoices}'),
  ('product_images', '{product_id,products}'), ('product_requests', '{profile_id,profiles}'), ('product_variants', '{product_id,products}'),
  ('products', '{}'), ('push_tokens', '{profile_id,profiles}'), ('quotation_items', '{quotation_id,quotations}'), ('quotations', '{}'),
  ('reviews', '{product_id,products}'), ('serials', '{variant_id,product_variants}'), ('staff_roles', '{}'),
  ('stock_levels', '{variant_id,product_variants}'), ('stock_lots', '{variant_id,product_variants}'),
  ('stock_movements', '{variant_id,product_variants}'), ('stock_voucher_items', '{voucher_id,stock_vouchers}'), ('stock_vouchers', '{}'),
  ('stocktake_items', '{stocktake_id,stocktakes}'), ('stocktakes', '{}'), ('suppliers', '{}'),
  ('transfer_items', '{transfer_id,transfers}'), ('transfers', '{}'), ('variant_costs', '{variant_id,product_variants}'),
  ('variant_units', '{variant_id,product_variants}'), ('warehouses', '{}');

do $$
declare r record; args text;
begin
  for r in select t, parents from _tenant where to_regclass('public.' || t) is not null loop
    -- عمود بقيمة المتجر ١ للصفوف القائمة (بلا تحديث صفوف ولا تشغيل مشغّلاتها)، ثم بلا قيمة افتراضية
    execute format('alter table public.%I add column if not exists store_id uuid not null default %L references public.stores (id) on delete cascade',
      r.t, private.store1());
    execute format('alter table public.%I alter column store_id drop default', r.t);
    execute format('create index if not exists %I on public.%I (store_id)', r.t || '_store_idx', r.t);
    args := (select string_agg(quote_literal(x), ', ') from unnest(r.parents) x);
    execute format('drop trigger if exists aa_fill_store on public.%I', r.t);
    execute format('create trigger aa_fill_store before insert on public.%I for each row execute function private.fill_store(%s)', r.t, coalesce(args, ''));
    execute format('drop trigger if exists aa_keep_store on public.%I', r.t);
    execute format('create trigger aa_keep_store before update of store_id on public.%I for each row execute function private.keep_store()', r.t);
    execute format('alter table public.%I enable row level security', r.t);
    execute format('drop policy if exists store_isolation on public.%I', r.t);
    execute format('create policy store_isolation on public.%I as restrictive for all to public
      using (store_id = (select public.current_store_id()) or (select public.current_store_id()) is null)
      with check (store_id = (select public.current_store_id()) or (select public.current_store_id()) is null)', r.t);
    execute format('drop policy if exists fn_access on public.%I', r.t);
    execute format('create policy fn_access on public.%I for all to raqeem_fn using (true) with check (true)', r.t);
  end loop;
end $$;

-- الملفات الشخصية: كل متجر يرى موظفيه وزبائنه، والمستخدم يرى ملفه دائماً
alter table public.profiles enable row level security;
drop policy if exists store_isolation on public.profiles;
create policy store_isolation on public.profiles as restrictive for all to public
  using (id = (select auth.uid()) or store_id = (select public.current_store_id()) or (select public.current_store_id()) is null)
  with check (id = (select auth.uid()) or store_id = (select public.current_store_id()) or (select public.current_store_id()) is null);
drop policy if exists fn_access on public.profiles;
create policy fn_access on public.profiles for all to raqeem_fn using (true) with check (true);
drop trigger if exists aa_keep_store on public.profiles;
create trigger aa_keep_store before update of store_id on public.profiles for each row execute function private.keep_store();

-- المتاجر: المتجر الفعّال مرئي للجميع (اسم وشعار للرابط)، والمالك يرى متجره، ومدير المنصة يرى الكل
alter table public.stores enable row level security;
drop policy if exists stores_read on public.stores;
create policy stores_read on public.stores for select to anon, authenticated
  using (status = 'active' or id = (select public.current_store_id())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_platform_admin));
drop policy if exists fn_access on public.stores;
create policy fn_access on public.stores for all to raqeem_fn using (true) with check (true);
revoke insert, update, delete, truncate on public.stores from anon, authenticated;
grant select on public.stores to anon, authenticated;

-- ---------------------------------------------------------------- القيود الفريدة داخل كل متجر
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (store_id, key);
alter table public.doc_counters drop constraint if exists doc_counters_pkey;
alter table public.doc_counters add constraint doc_counters_pkey primary key (store_id, kind);

drop index if exists public.staff_roles_name_key;
create unique index staff_roles_name_key on public.staff_roles (store_id, name);
drop index if exists public.customers_cash_key;
create unique index customers_cash_key on public.customers (store_id) where is_cash_customer;
drop index if exists public.branches_default_key;
create unique index branches_default_key on public.branches (store_id) where is_default;
drop index if exists public.categories_slug_key;
create unique index categories_slug_key on public.categories (store_id, slug);
drop index if exists public.brands_slug_key;
create unique index brands_slug_key on public.brands (store_id, slug);
drop index if exists public.products_slug_key;
create unique index products_slug_key on public.products (store_id, slug);
drop index if exists public.product_variants_sku_key;
create unique index product_variants_sku_key on public.product_variants (store_id, lower(sku));
drop index if exists public.product_variants_barcode_key;
create unique index product_variants_barcode_key on public.product_variants (store_id, barcode) where barcode is not null;
drop index if exists public.warehouses_code_key;
create unique index warehouses_code_key on public.warehouses (store_id, upper(code));
drop index if exists public.warehouses_default_key;
create unique index warehouses_default_key on public.warehouses (store_id) where is_default;
drop index if exists public.variant_units_barcode_key;
create unique index variant_units_barcode_key on public.variant_units (store_id, barcode) where barcode is not null;
drop index if exists public.transfers_number_key;
create unique index transfers_number_key on public.transfers (store_id, number);
drop index if exists public.stocktakes_number_key;
create unique index stocktakes_number_key on public.stocktakes (store_id, number);
drop index if exists public.stock_vouchers_number_key;
create unique index stock_vouchers_number_key on public.stock_vouchers (store_id, number);
drop index if exists public.money_accounts_name_key;
create unique index money_accounts_name_key on public.money_accounts (store_id, name);
drop index if exists public.money_accounts_default_key;
drop index if exists public.money_accounts_default_currency_key;
create unique index money_accounts_default_currency_key on public.money_accounts (store_id, currency) where is_default;
drop index if exists public.invoices_number_key;
create unique index invoices_number_key on public.invoices (store_id, number);
drop index if exists public.payments_number_key;
create unique index payments_number_key on public.payments (store_id, number);
drop index if exists public.account_transfers_number_key;
create unique index account_transfers_number_key on public.account_transfers (store_id, number);
drop index if exists public.quotations_number_key;
create unique index quotations_number_key on public.quotations (store_id, number);
drop index if exists public.delivery_zones_governorate_key;
create unique index delivery_zones_governorate_key on public.delivery_zones (store_id, governorate);
drop index if exists public.orders_number_key;
create unique index orders_number_key on public.orders (store_id, number);
drop index if exists public.coupons_code_key;
create unique index coupons_code_key on public.coupons (store_id, upper(code));
drop index if exists public.product_requests_number_key;
create unique index product_requests_number_key on public.product_requests (store_id, number);

-- الإعداد يُقرأ من متجر الطلب (وفي سياق الخادم: المتجر ١)
create or replace function private.setting(k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value from public.app_settings s
    where s.key = k and s.store_id = coalesce(private.current_store(), private.store1())), '{}'::jsonb)
$$;

-- ---------------------------------------------------------------- نقل الدوال لدور raqeem_fn
-- تبقى للدور postgres: ما يقرأ auth.users أو الشبكة، ودوال تحديد المتجر والصلاحيات (تقرأ الملفات بلا قيد).
create or replace function private.sync_fn_owners() returns int
language plpgsql set search_path = '' as $$
declare r record; n int := 0;
begin
  -- تغيير المالك يحتاج صلاحية CREATE للمالك الجديد على المخطط (مؤقتاً فقط)
  execute 'grant create on schema public, private to raqeem_fn';
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'private') and p.prosecdef and p.prokind = 'f'
      and pg_get_userbyid(p.proowner) <> 'raqeem_fn'
      and p.proname not in ('current_store', 'current_store_id', 'store1', 'fill_store', 'keep_store', 'has_perm', 'is_staff', 'staff_ok', 'aal_ok', 'require_perm',
        'make_owner', 'handle_new_user', 'handle_user_email', 'delete_my_account', 'push_hook', 'send_campaign', 'sync_fn_owners',
        'request_store', 'login_email', 'approve_store', 'reject_store', 'set_store_status', 'platform_stores', 'seed_store', 'is_platform_admin', 'my_store', 'protect_profile', 'pol')
  loop
    execute format('alter function %s owner to raqeem_fn', r.sig);
    n := n + 1;
  end loop;
  execute 'revoke create on schema public, private from raqeem_fn';
  return n;
end $$;
revoke all on function private.sync_fn_owners() from public;
select private.sync_fn_owners();

-- ---------------------------------------------------------------- المستخدم الجديد: متجر الرابط الذي سجّل منه
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  select x.id into s from public.stores x where x.slug = lower(btrim(new.raw_user_meta_data ->> 'store')) and x.status = 'active';
  insert into public.profiles (id, email, full_name, kind, store_id)
  values (new.id, lower(new.email),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''), 'customer',
    coalesce(s, private.store1()))
  on conflict (id) do nothing;
  return new;
end $$;

-- make_owner: يبقى للمتجر ١ (أداة إعداد أولى من SQL)
create or replace function public.make_owner(email text, full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(make_owner.email)) limit 1;
  if uid is null then
    raise exception using message = 'لا يوجد مستخدم بهذا البريد. أنشئه أولاً من Authentication ← Users.', errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name, kind, is_owner, status, onboarded, store_id, is_platform_admin)
  values (uid, lower(btrim(make_owner.email)), nullif(btrim(make_owner.full_name), ''), 'staff', true, 'active', true, private.store1(), true)
  on conflict (id) do update set kind = 'staff', is_owner = true, status = 'active', onboarded = true, is_platform_admin = true,
    full_name = coalesce(nullif(btrim(make_owner.full_name), ''), public.profiles.full_name),
    email = coalesce(public.profiles.email, excluded.email);
  return uid;
end $$;
revoke all on function public.make_owner(text, text) from public;
do $$ begin
  revoke all on function public.make_owner(text, text) from anon, authenticated;
exception when undefined_object then null; end $$;

drop table if exists pg_temp._tenant;
revoke all on function private.current_store() from public;
grant execute on function private.current_store() to service_role, raqeem_fn;
revoke all on function public.current_store_id() from public;
grant execute on function public.current_store_id() to anon, authenticated, service_role, raqeem_fn;
revoke all on function public.current_store() from public;
grant execute on function public.current_store() to anon, authenticated;
revoke all on function private.fill_store() from public;
revoke all on function private.store1() from public;
grant execute on function private.store1() to anon, authenticated, service_role, raqeem_fn;
