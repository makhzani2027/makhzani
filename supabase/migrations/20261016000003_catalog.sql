-- =============================================================================
-- رقيم — ٣: الكتالوج والمخازن (الأقسام، العلامات، المنتجات، النسخ، التكلفة، الصور، المخازن)
-- آمن لإعادة التشغيل
-- =============================================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  image_key text,
  icon text,
  sort int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create unique index if not exists categories_slug_key on public.categories (slug);
create index if not exists categories_parent_idx on public.categories (parent_id);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_key text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists brands_slug_key on public.brands (slug);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null,
  description text,
  category_id uuid references public.categories (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  unit text not null default 'قطعة',
  tags text[] not null default '{}',
  specs jsonb not null default '[]',
  warranty text,
  option_names text[] not null default '{}',
  has_variants boolean not null default false,
  track_serials boolean not null default false,
  track_expiry boolean not null default false,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  allow_request boolean not null default true,
  cover_key text,
  sold_count numeric(14,3) not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  search_text text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists products_slug_key on public.products (slug);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx on public.products (brand_id);
create index if not exists products_published_idx on public.products (is_published, archived_at);
create index if not exists products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  title text not null default 'افتراضي',
  options jsonb not null default '{}',
  sku text not null check (length(btrim(sku)) > 0),
  barcode text,
  price numeric(14,2) not null default 0 check (price >= 0),
  compare_at_price numeric(14,2) check (compare_at_price is null or compare_at_price >= 0),
  wholesale_price numeric(14,2) check (wholesale_price is null or wholesale_price >= 0),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  image_key text,
  available_qty numeric(14,3) not null default 0,
  weight_g int,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_variants_sku_key on public.product_variants (lower(sku));
create unique index if not exists product_variants_barcode_key on public.product_variants (barcode) where barcode is not null;
create index if not exists product_variants_product_idx on public.product_variants (product_id);

-- التكلفة في جدول منفصل: لا يقرؤه إلا costs.view
create table if not exists public.variant_costs (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  avg_cost numeric(14,2) not null default 0 check (avg_cost >= 0),
  last_cost numeric(14,2) not null default 0 check (last_cost >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  key text not null,
  alt text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id, sort);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  branch_id uuid references public.branches (id) on delete set null,
  address text,
  is_default boolean not null default false,
  is_sellable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists warehouses_code_key on public.warehouses (upper(code));
create unique index if not exists warehouses_default_key on public.warehouses (is_default) where is_default;

-- وحدات التعبئة (القرار ١٨): باركود الكرتونة = factor قطعة
create table if not exists public.variant_units (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  unit_name text not null check (length(btrim(unit_name)) > 0),
  factor numeric(14,3) not null check (factor > 0),
  barcode text,
  price numeric(14,2) check (price is null or price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists variant_units_variant_idx on public.variant_units (variant_id);
create unique index if not exists variant_units_barcode_key on public.variant_units (barcode) where barcode is not null;

-- الباركود فريد عبر النسخ ووحدات التعبئة معاً (قفل استشاري على الرمز يمنع سباق إدراجين متزامنين)
create or replace function private.check_barcode_unique() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.barcode is null then return new; end if;
  new.barcode := btrim(new.barcode);
  if new.barcode = '' then new.barcode := null; return new; end if;
  perform pg_advisory_xact_lock(hashtext('barcode:' || new.barcode));
  if tg_table_name = 'product_variants' then
    if exists (select 1 from public.variant_units u where u.barcode = new.barcode) then
      raise exception using message = 'الباركود ' || new.barcode || ' مستعمل لوحدة تعبئة أخرى.', errcode = 'P0001';
    end if;
  else
    if exists (select 1 from public.product_variants v where v.barcode = new.barcode) then
      raise exception using message = 'الباركود ' || new.barcode || ' مستعمل لمنتج آخر.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists barcode_unique on public.product_variants;
create trigger barcode_unique before insert or update of barcode on public.product_variants
  for each row execute function private.check_barcode_unique();
drop trigger if exists barcode_unique on public.variant_units;
create trigger barcode_unique before insert or update of barcode on public.variant_units
  for each row execute function private.check_barcode_unique();

-- تسلسلات الباركود الداخلي و SKU التلقائي
create sequence if not exists private.barcode_seq;
create sequence if not exists private.sku_seq;

drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.product_variants;
create trigger set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.variant_costs;
create trigger set_updated_at before update on public.variant_costs for each row execute function public.set_updated_at();

-- الأقسام: عمقان كحد أقصى (قسم رئيسي ← فرعي)
create or replace function private.check_category_depth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null) then
      raise exception using message = 'لا يمكن إضافة قسم تحت قسم فرعي (مستويان فقط).', errcode = 'P0001';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception using message = 'هذا القسم له أقسام فرعية فلا يمكن جعله فرعياً.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists check_depth on public.categories;
create trigger check_depth before insert or update of parent_id on public.categories
  for each row execute function private.check_category_depth();

-- نص البحث = الاسم + الوسوم + اسم العلامة + SKUs + الباركود (مطبّعاً)
create or replace function private.product_search_text(pid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.normalize_ar(concat_ws(' ', p.name, array_to_string(p.tags, ' '), b.name,
    (select string_agg(concat_ws(' ', v.sku, v.barcode, nullif(v.title, 'افتراضي')), ' ') from public.product_variants v where v.product_id = p.id)))
  from public.products p left join public.brands b on b.id = p.brand_id
  where p.id = pid
$$;

create or replace function private.products_search_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.search_text := public.normalize_ar(concat_ws(' ', new.name, array_to_string(new.tags, ' '),
    (select b.name from public.brands b where b.id = new.brand_id),
    (select string_agg(concat_ws(' ', v.sku, v.barcode, nullif(v.title, 'افتراضي')), ' ') from public.product_variants v where v.product_id = new.id)));
  return new;
end $$;
drop trigger if exists search_text on public.products;
create trigger search_text before insert or update of name, tags, brand_id on public.products
  for each row execute function private.products_search_before();

create or replace function private.variants_search_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products set search_text = coalesce(private.product_search_text(pid), '') where id = pid;
  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    update public.products set search_text = coalesce(private.product_search_text(old.product_id), '') where id = old.product_id;
  end if;
  return null;
end $$;
drop trigger if exists search_text on public.product_variants;
create trigger search_text after insert or delete or update of sku, barcode, title, product_id on public.product_variants
  for each row execute function private.variants_search_after();

create or replace function private.brands_search_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.products set search_text = coalesce(private.product_search_text(id), '') where brand_id = new.id;
  return null;
end $$;
drop trigger if exists search_text on public.brands;
create trigger search_text after update of name on public.brands
  for each row execute function private.brands_search_after();

-- غلاف المنتج = أول صورة بالترتيب
create or replace function private.product_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set cover_key = (
    select i.key from public.product_images i where i.product_id = pid order by i.sort, i.created_at limit 1
  ) where p.id = pid and p.cover_key is distinct from (
    select i.key from public.product_images i where i.product_id = pid order by i.sort, i.created_at limit 1
  );
  return null;
end $$;
drop trigger if exists cover_key on public.product_images;
create trigger cover_key after insert or update or delete on public.product_images
  for each row execute function private.product_cover();

-- مخزن افتراضي واحد: تعيين جديد يلغي القديم
create or replace function private.single_default_warehouse() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.warehouses set is_default = false where is_default and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists single_default on public.warehouses;
create trigger single_default before insert or update of is_default on public.warehouses
  for each row when (new.is_default) execute function private.single_default_warehouse();
