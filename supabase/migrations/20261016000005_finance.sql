-- =============================================================================
-- رقيم — ٥: الفواتير والدفعات والمصروفات وجلسات الصندوق
-- لا حذف للمستندات: الإلغاء بقيد عكسي. آمن لإعادة التشغيل
-- =============================================================================

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status public.cash_session_status not null default 'open',
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  opening_float numeric(14,2) not null default 0 check (opening_float >= 0),
  closed_by uuid,
  closed_at timestamptz,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2) check (counted_cash is null or counted_cash >= 0),
  note text
);
-- جلسة مفتوحة واحدة لكل موظف
create unique index if not exists cash_sessions_open_key on public.cash_sessions (opened_by) where status = 'open';
create index if not exists cash_sessions_opened_idx on public.cash_sessions (opened_at desc);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  kind public.invoice_kind not null,
  channel public.invoice_channel not null default 'pos',
  status public.invoice_status not null default 'posted',
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  order_id uuid,
  return_of uuid references public.invoices (id),
  warehouse_id uuid not null references public.warehouses (id),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  paid numeric(14,2) not null default 0,
  due numeric(14,2) generated always as (total - paid) stored,
  cost_total numeric(14,2) not null default 0,
  note text,
  cash_session_id uuid references public.cash_sessions (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  check (customer_id is not null or supplier_id is not null or kind = 'sale'),
  check (total = subtotal - discount + delivery_fee)
);
create unique index if not exists invoices_number_key on public.invoices (number);
create index if not exists invoices_customer_idx on public.invoices (customer_id, created_at desc);
create index if not exists invoices_supplier_idx on public.invoices (supplier_id, created_at desc);
create index if not exists invoices_kind_created_idx on public.invoices (kind, created_at desc);
create index if not exists invoices_order_idx on public.invoices (order_id);
create index if not exists invoices_return_of_idx on public.invoices (return_of);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  product_id uuid not null references public.products (id),
  name text not null,
  variant_title text,
  sku text not null,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  unit_cost numeric(14,2) not null default 0,
  serials text[] not null default '{}',
  -- إضافة على العقد: بند الفاتورة الأصلية الذي يرجعه هذا البند (لمنع إرجاع أكثر مما بيع)
  return_of_item_id uuid references public.invoice_items (id)
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_variant_idx on public.invoice_items (variant_id);
create index if not exists invoice_items_return_of_idx on public.invoice_items (return_of_item_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  direction public.payment_direction not null,
  method public.payment_method not null,
  amount numeric(14,2) not null check (amount > 0),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  invoice_id uuid references public.invoices (id),
  order_id uuid,
  cash_session_id uuid references public.cash_sessions (id),
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create unique index if not exists payments_number_key on public.payments (number);
create index if not exists payments_customer_idx on public.payments (customer_id, created_at desc);
create index if not exists payments_supplier_idx on public.payments (supplier_id, created_at desc);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_session_idx on public.payments (cash_session_id);
create index if not exists payments_created_idx on public.payments (created_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null default 'cash',
  note text,
  spent_at timestamptz not null default now(),
  cash_session_id uuid references public.cash_sessions (id),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists expenses_spent_idx on public.expenses (spent_at desc);
create index if not exists expenses_session_idx on public.expenses (cash_session_id);

-- المدفوع المخزّن = الدفعات بالاتجاه الطبيعي للفاتورة ناقص المعاكسة (غير الملغاة)
create or replace function private.refresh_invoice_paid(inv uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  k public.invoice_kind;
  natural_dir public.payment_direction;
  v numeric;
begin
  select i.kind into k from public.invoices i where i.id = inv;
  if k is null then return 0; end if;
  natural_dir := case when k in ('sale', 'purchase_return') then 'in' else 'out' end::public.payment_direction;
  select coalesce(sum(case when p.direction = natural_dir then p.amount else -p.amount end), 0) into v
  from public.payments p where p.invoice_id = inv and p.voided_at is null;
  update public.invoices set paid = v where id = inv and paid is distinct from v;
  return v;
end $$;

-- الجلسة المفتوحة لموظف (أو null)
create or replace function private.open_session_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.cash_sessions s where s.opened_by = uid and s.status = 'open' limit 1
$$;

-- يسجّل دفعة (سند قبض RC / صرف PV) — داخلية، تستعملها كل الدوال المالية
create or replace function private.add_payment(
  p_direction public.payment_direction, p_method public.payment_method, p_amount numeric,
  p_customer uuid, p_supplier uuid, p_invoice uuid, p_order uuid, p_reference text, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  insert into public.payments (number, direction, method, amount, customer_id, supplier_id, invoice_id, order_id,
    cash_session_id, reference, note, created_by)
  values (public.next_doc_number(case when p_direction = 'in' then 'receipt' else 'voucher' end), p_direction, p_method,
    p_amount, p_customer, p_supplier, p_invoice, p_order,
    case when p_method = 'cash' and auth.uid() is not null then private.open_session_of(auth.uid()) end,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid())
  returning id into pid;
  if p_invoice is not null then perform private.refresh_invoice_paid(p_invoice); end if;
  return pid;
end $$;

revoke all on all functions in schema private from public;
