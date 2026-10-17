-- =============================================================================
-- رقيم — ٤: المخزون (الأرصدة، الحركات، الأرقام التسلسلية، النقل، الجرد)
-- الرصيد لا يُكتب مباشرة: private.apply_movement() فقط. آمن لإعادة التشغيل
-- =============================================================================

create table if not exists public.stock_levels (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  qty numeric(14,3) not null default 0,
  reserved numeric(14,3) not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, warehouse_id)
);
create index if not exists stock_levels_warehouse_idx on public.stock_levels (warehouse_id);

create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  kind public.movement_kind not null,
  qty numeric(14,3) not null check (qty <> 0),
  balance_after numeric(14,3) not null,
  unit_cost numeric(14,2),
  ref_type text check (ref_type is null or ref_type in ('invoice', 'order', 'adjustment', 'transfer', 'stocktake')),
  ref_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index if not exists stock_movements_ref_idx on public.stock_movements (ref_type, ref_id);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);

-- سجل الحركات لا يُعدَّل ولا يُحذف (الأثر المحاسبي)
create or replace function private.movements_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using message = 'سجل حركات المخزون لا يُعدَّل ولا يُحذف.', errcode = 'P0001';
end $$;
drop trigger if exists immutable on public.stock_movements;
create trigger immutable before update or delete on public.stock_movements
  for each row execute function private.movements_immutable();

create table if not exists public.serials (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  serial text not null check (length(btrim(serial)) > 0),
  status public.serial_status not null default 'in_stock',
  warehouse_id uuid references public.warehouses (id) on delete set null,
  purchase_invoice_id uuid,
  sale_invoice_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists serials_variant_serial_key on public.serials (variant_id, serial);
create index if not exists serials_serial_idx on public.serials (serial);
drop trigger if exists set_updated_at on public.serials;
create trigger set_updated_at before update on public.serials for each row execute function public.set_updated_at();

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  from_warehouse_id uuid not null references public.warehouses (id),
  to_warehouse_id uuid not null references public.warehouses (id),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_warehouse_id <> to_warehouse_id)
);
create unique index if not exists transfers_number_key on public.transfers (number);

create table if not exists public.transfer_items (
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  qty numeric(14,3) not null check (qty > 0),
  primary key (transfer_id, variant_id)
);

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  warehouse_id uuid not null references public.warehouses (id),
  status public.doc_status not null default 'draft',
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create unique index if not exists stocktakes_number_key on public.stocktakes (number);

create table if not exists public.stocktake_items (
  stocktake_id uuid not null references public.stocktakes (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  expected_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3) check (counted_qty is null or counted_qty >= 0),
  primary key (stocktake_id, variant_id)
);
