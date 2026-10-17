-- =============================================================================
-- رقيم — ٢: المستخدمون والأدوار والأطراف والإعدادات والعدادات والسجل
-- آمن لإعادة التشغيل. الأعمدة = interfaces في packages/shared/src/types.ts
-- =============================================================================

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists staff_roles_name_key on public.staff_roles (name);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kind public.profile_kind not null default 'customer',
  full_name text,
  phone text,
  email text,
  avatar_key text,
  role_id uuid references public.staff_roles (id) on delete set null,
  is_owner boolean not null default false,
  status public.profile_status not null default 'active',
  onboarded boolean not null default false,
  governorate text,
  prefs jsonb not null default '{}',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;
create index if not exists profiles_kind_idx on public.profiles (kind);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null,
  phone text,
  phone2 text,
  governorate text,
  city text,
  address text,
  notes text,
  tags text[] not null default '{}',
  credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  is_cash_customer boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_profile_key on public.customers (profile_id) where profile_id is not null;
-- «زبون نقدي» واحد فقط
create unique index if not exists customers_cash_key on public.customers (is_cash_customer) where is_cash_customer;
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_name_trgm on public.customers using gin (name extensions.gin_trgm_ops);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  phone2 text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}',
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.doc_counters (
  kind text primary key,
  last_value bigint not null default 0 check (last_value >= 0)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.customers;
create trigger set_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.suppliers;
create trigger set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- =============================================================================
-- الدوال المساعدة للصلاحيات (تُستعمل في كل سياسة RLS)
-- =============================================================================

-- موظف فعّال؟
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.kind = 'staff' and p.status = 'active'
  )
$$;

-- إن فعّل المستخدم التحقق بخطوتين فيجب أن تكون الجلسة aal2 (وإلا فكلمة السر المسروقة وحدها تكفي)
create or replace function private.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles pr
    left join public.staff_roles r on r.id = pr.role_id
    where pr.id = auth.uid()
      and pr.kind = 'staff'
      and pr.status = 'active'
      and (pr.is_owner or p = any (coalesce(r.permissions, '{}')))
  ) and private.aal_ok()
$$;

-- موظف فعّال وجلسته مستوفية لشرط التحقق بخطوتين (لقراءات عامة للموظفين بلا صلاحية محددة)
create or replace function private.staff_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff() and private.aal_ok()
$$;

create or replace function public.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c where c.profile_id = auth.uid() and auth.uid() is not null limit 1
$$;

-- يفحص الصلاحية ويرمي خطأ عربياً — تستدعيه كل دوال الموظفين أولاً
create or replace function private.require_perm(p text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001';
  end if;
  if not public.has_perm(p) then
    if public.is_staff() and not private.aal_ok() then
      raise exception using message = 'أكمل التحقق بخطوتين أولاً.', errcode = 'P0001';
    end if;
    raise exception using message = 'لا تملك صلاحية هذه العملية.', errcode = 'P0001';
  end if;
end $$;

-- الفروع (القرار ١٨): فرع افتراضي واحد
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  address text,
  phone text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists branches_default_key on public.branches (is_default) where is_default;

-- قراءة إعداد (jsonb) — للدوال الداخلية
create or replace function private.setting(k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value from public.app_settings s where s.key = k), '{}'::jsonb)
$$;

-- تقريب المال: الدينار بلا كسور، الدولار لسنتين — مثل roundMoney في shared
-- (عملة المتجر من store.currency؛ والمستندات بعملة محددة تستعمل round_cur)
create or replace function private.round_money(n numeric) returns numeric
language sql stable set search_path = '' as $$
  select case when coalesce(private.setting('store') ->> 'currency', 'IQD') = 'USD' then round(n, 2) else round(n, 0) end
$$;

create or replace function private.round_cur(n numeric, cur public.currency_code) returns numeric
language sql immutable set search_path = '' as $$
  select case when cur = 'USD' then round(n, 2) else round(n, 0) end
$$;

-- سعر صرف اليوم (دينار لكل دولار) من app_settings.currency
create or replace function private.usd_rate() returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare r numeric := nullif(private.setting('currency') ->> 'usd_rate', '')::numeric;
begin
  if r is null or r <= 0 then
    raise exception using message = 'سعر صرف الدولار غير مضبوط في الإعدادات.', errcode = 'P0001';
  end if;
  return r;
end $$;

-- يحوّل مبلغاً بين العملتين بسعر صرف (دينار لكل دولار) مع التقريب الصحيح للعملة الهدف
create or replace function private.convert(amount numeric, from_cur public.currency_code, to_cur public.currency_code, rate numeric)
returns numeric
language sql immutable set search_path = '' as $$
  select case
    when from_cur = to_cur then amount
    when to_cur = 'IQD' then round(amount * rate, 0)
    else round(amount / rate, 2) end
$$;

-- الترقيم المتسلسل بقفل الصف — نفس formatDocNumber و DOC_PREFIX في shared: S-000123
create or replace function public.next_doc_number(kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  prefix text;
  n bigint;
begin
  prefix := case kind
    when 'sale' then 'S' when 'sale_return' then 'SR' when 'purchase' then 'P' when 'purchase_return' then 'PR'
    when 'order' then 'O' when 'receipt' then 'RC' when 'voucher' then 'PV' when 'request' then 'RQ'
    when 'transfer' then 'TR' when 'stocktake' then 'ST' when 'quotation' then 'Q' when 'stock_voucher' then 'SV'
    when 'account_transfer' then 'AT' end;
  if prefix is null then
    raise exception using message = 'نوع مستند غير معروف: ' || coalesce(kind, ''), errcode = 'P0001';
  end if;
  insert into public.doc_counters as dc (kind, last_value) values (next_doc_number.kind, 1)
  on conflict on constraint doc_counters_pkey do update set last_value = dc.last_value + 1
  returning dc.last_value into n;
  return prefix || '-' || lpad(n::text, greatest(6, length(n::text)), '0');
end $$;

-- يجعل مستخدم auth موجوداً صاحب المتجر — تُشغَّل من SQL Editor فقط (دليل الإعداد، الخطوة ٦)
create or replace function public.make_owner(email text, full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(make_owner.email)) limit 1;
  if uid is null then
    raise exception using message = 'لا يوجد مستخدم بهذا البريد. أنشئه أولاً من Authentication ← Users.', errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name, kind, is_owner, status, onboarded)
  values (uid, lower(btrim(make_owner.email)), nullif(btrim(make_owner.full_name), ''), 'staff', true, 'active', true)
  on conflict (id) do update set kind = 'staff', is_owner = true, status = 'active', onboarded = true,
    full_name = coalesce(nullif(btrim(make_owner.full_name), ''), public.profiles.full_name),
    email = coalesce(public.profiles.email, excluded.email);
  return uid;
end $$;

revoke all on function public.make_owner(text, text) from public;
do $$ begin
  revoke all on function public.make_owner(text, text) from anon, authenticated;
exception when undefined_object then null; end $$;
revoke all on function public.next_doc_number(text) from public;
do $$ begin
  revoke all on function public.next_doc_number(text) from anon, authenticated;
exception when undefined_object then null; end $$;
revoke all on all functions in schema private from public;
