-- =============================================================================
-- رقيم — ٦: المتجر (العناوين، التوصيل، الطلبات، الدفع الإلكتروني، السلة، المفضلة، الكوبونات،
-- البانرات، أقسام الرئيسية، طلبات التوفير، التقييمات، الإشعارات، رموز الأجهزة). آمن لإعادة التشغيل
-- =============================================================================

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  recipient_name text not null check (length(btrim(recipient_name)) > 0),
  phone text not null,
  governorate text not null,
  city text,
  area text,
  street text,
  landmark text,
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists addresses_profile_idx on public.addresses (profile_id);
create unique index if not exists addresses_default_key on public.addresses (profile_id) where is_default;

-- عنوان افتراضي واحد لكل زبون: تعيين جديد يلغي القديم
create or replace function private.single_default_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.addresses set is_default = false where profile_id = new.profile_id and is_default and id <> new.id;
  return new;
end $$;
drop trigger if exists single_default on public.addresses;
create trigger single_default before insert or update of is_default on public.addresses
  for each row when (new.is_default) execute function private.single_default_address();

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  governorate text not null,
  fee numeric(14,2) not null default 0 check (fee >= 0),
  eta_text text,
  is_active boolean not null default false,
  sort int not null default 0
);
create unique index if not exists delivery_zones_governorate_key on public.delivery_zones (governorate);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  customer_id uuid not null references public.customers (id),
  status public.order_status not null default 'pending',
  payment_method public.order_payment_method not null,
  payment_status public.order_payment_status not null default 'unpaid',
  fulfillment public.fulfillment not null,
  address jsonb,
  delivery_zone_id uuid references public.delivery_zones (id) on delete set null,
  warehouse_id uuid not null references public.warehouses (id),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  coupon_code text,
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  total numeric(14,2) not null check (total >= 0),
  customer_note text,
  staff_note text,
  invoice_id uuid references public.invoices (id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  check (total = subtotal - discount + delivery_fee)
);
create unique index if not exists orders_number_key on public.orders (number);
create index if not exists orders_profile_idx on public.orders (profile_id, created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid not null references public.product_variants (id),
  name text not null,
  variant_title text,
  sku text not null,
  image_key text,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_variant_idx on public.order_items (variant_id);

-- إضافة على العقد: توزيع حجز الطلب على المخازن (قد يُحجز جزء من المخزن وجزء من صالة العرض)
create table if not exists public.order_reservations (
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  warehouse_id uuid not null references public.warehouses (id),
  qty numeric(14,3) not null check (qty > 0),
  primary key (order_id, variant_id, warehouse_id)
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status,
  note text,
  is_customer_visible boolean not null default true,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  provider_ref text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'IQD',
  status public.payment_tx_status not null default 'created',
  checkout_url text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_order_idx on public.payment_transactions (order_id, created_at desc);
create unique index if not exists payment_transactions_ref_key on public.payment_transactions (provider, provider_ref) where provider_ref is not null;
drop trigger if exists set_updated_at on public.payment_transactions;
create trigger set_updated_at before update on public.payment_transactions for each row execute function public.set_updated_at();

create table if not exists public.cart_items (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  qty numeric(14,3) not null check (qty > 0 and qty <= 1000),
  updated_at timestamptz not null default now(),
  primary key (profile_id, variant_id)
);
drop trigger if exists set_updated_at on public.cart_items;
create trigger set_updated_at before update on public.cart_items for each row execute function public.set_updated_at();

create table if not exists public.favorites (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, product_id)
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind public.coupon_kind not null,
  value numeric(14,2) not null default 0 check (value >= 0),
  min_subtotal numeric(14,2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(14,2) check (max_discount is null or max_discount >= 0),
  usage_limit int check (usage_limit is null or usage_limit >= 0),
  per_customer_limit int check (per_customer_limit is null or per_customer_limit >= 0),
  used_count int not null default 0 check (used_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create unique index if not exists coupons_code_key on public.coupons (upper(code));

-- الكود يُحفظ بأحرف كبيرة بلا مسافات
create or replace function private.coupon_upper() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.code := upper(btrim(new.code));
  return new;
end $$;
drop trigger if exists code_upper on public.coupons;
create trigger code_upper before insert or update of code on public.coupons
  for each row execute function private.coupon_upper();

create table if not exists public.coupon_redemptions (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  order_id uuid not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coupon_id, order_id)
);
create index if not exists coupon_redemptions_profile_idx on public.coupon_redemptions (coupon_id, profile_id);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,
  image_key text,
  link_kind public.banner_link_kind not null default 'none',
  link_value text,
  placement public.banner_placement not null default 'home_hero',
  sort int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind public.home_section_kind not null,
  category_id uuid references public.categories (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  product_ids uuid[] not null default '{}',
  max_items int not null default 10 check (max_items between 1 and 50),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  customer_id uuid references public.customers (id),
  title text not null,
  details text,
  image_key text,
  link_url text,
  qty numeric(14,3) not null default 1 check (qty > 0),
  budget numeric(14,2) check (budget is null or budget >= 0),
  status public.request_status not null default 'new',
  staff_reply text,
  product_id uuid references public.products (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_requests_number_key on public.product_requests (number);
create index if not exists product_requests_profile_idx on public.product_requests (profile_id, created_at desc);
create index if not exists product_requests_status_idx on public.product_requests (status, created_at desc);
drop trigger if exists set_updated_at on public.product_requests;
create trigger set_updated_at before update on public.product_requests for each row execute function public.set_updated_at();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists reviews_product_profile_key on public.reviews (product_id, profile_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null default 'system',
  title text not null,
  body text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (profile_id) where read_at is null;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_key text,
  link_kind public.banner_link_kind not null default 'none',
  link_value text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  updated_at timestamptz not null default now()
);
create unique index if not exists push_tokens_token_key on public.push_tokens (token);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);
drop trigger if exists set_updated_at on public.push_tokens;
create trigger set_updated_at before update on public.push_tokens for each row execute function public.set_updated_at();

-- روابط مؤجلة بعد إنشاء الجداول (آمنة لإعادة التشغيل)
do $$ begin
  alter table public.invoices add constraint invoices_order_fk foreign key (order_id) references public.orders (id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.payments add constraint payments_order_fk foreign key (order_id) references public.orders (id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.serials add constraint serials_purchase_fk foreign key (purchase_invoice_id) references public.invoices (id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.serials add constraint serials_sale_fk foreign key (sale_invoice_id) references public.invoices (id);
exception when duplicate_object then null; end $$;
