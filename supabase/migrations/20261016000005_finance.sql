-- =============================================================================
-- رقيم — ٥: الصناديق والحسابات، الفواتير، الدفعات، المصروفات، جلسات الصندوق، عروض الأسعار، التحويل بين الصناديق
-- لا حذف للمستندات: الإلغاء بقيد عكسي. العملتان (القرار ١٨): المبالغ بعملة المستند + سعر صرف محفوظ فيه،
-- والتكلفة والأرباح بالدينار دائماً. آمن لإعادة التشغيل
-- =============================================================================

create table if not exists public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  kind public.money_account_kind not null default 'cash',
  currency public.currency_code not null default 'IQD',
  branch_id uuid references public.branches (id) on delete set null,
  opening_balance numeric(14,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists money_accounts_name_key on public.money_accounts (name);
-- الصندوق الافتراضي لنقطة البيع (بالدينار) واحد فقط
create unique index if not exists money_accounts_default_key on public.money_accounts (is_default) where is_default;

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
  branch_id uuid references public.branches (id),
  quotation_id uuid,
  currency public.currency_code not null default 'IQD',
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
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
  check (total = subtotal - discount + delivery_fee),
  check (currency <> 'IQD' or exchange_rate = 1)
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
  -- تكلفة الوحدة المباعة بالدينار (للكرتونة = متوسط تكلفة القطعة × factor)
  unit_cost numeric(14,2) not null default 0,
  serials text[] not null default '{}',
  price_tier public.price_tier not null default 'retail',
  unit_name text,
  unit_factor numeric(14,3) not null default 1 check (unit_factor > 0),
  lot_code text,
  expiry_date date,
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
  currency public.currency_code not null default 'IQD',
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  amount_iqd numeric(14,2) generated always as (case when currency = 'IQD' then amount else round(amount * exchange_rate, 0) end) stored,
  account_id uuid references public.money_accounts (id),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  invoice_id uuid references public.invoices (id),
  order_id uuid,
  cash_session_id uuid references public.cash_sessions (id),
  reference text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  check (currency <> 'IQD' or exchange_rate = 1)
);
create unique index if not exists payments_number_key on public.payments (number);
create index if not exists payments_customer_idx on public.payments (customer_id, created_at desc);
create index if not exists payments_supplier_idx on public.payments (supplier_id, created_at desc);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_session_idx on public.payments (cash_session_id);
create index if not exists payments_account_idx on public.payments (account_id);
create index if not exists payments_created_idx on public.payments (created_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency public.currency_code not null default 'IQD',
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  account_id uuid references public.money_accounts (id),
  method public.payment_method not null default 'cash',
  note text,
  spent_at timestamptz not null default now(),
  cash_session_id uuid references public.cash_sessions (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (currency <> 'IQD' or exchange_rate = 1)
);
create index if not exists expenses_spent_idx on public.expenses (spent_at desc);
create index if not exists expenses_session_idx on public.expenses (cash_session_id);
create index if not exists expenses_account_idx on public.expenses (account_id);

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  from_account_id uuid not null references public.money_accounts (id),
  to_account_id uuid not null references public.money_accounts (id),
  amount numeric(14,2) not null check (amount > 0),
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create unique index if not exists account_transfers_number_key on public.account_transfers (number);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  status public.quotation_status not null default 'draft',
  customer_id uuid references public.customers (id),
  customer_name text,
  warehouse_id uuid not null references public.warehouses (id),
  currency public.currency_code not null default 'IQD',
  exchange_rate numeric(14,4) not null default 1 check (exchange_rate > 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  valid_until date,
  note text,
  invoice_id uuid references public.invoices (id),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists quotations_number_key on public.quotations (number);
create index if not exists quotations_customer_idx on public.quotations (customer_id, created_at desc);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id),
  name text not null,
  variant_title text,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  price_tier public.price_tier not null default 'retail'
);
create index if not exists quotation_items_quotation_idx on public.quotation_items (quotation_id);

do $$ begin
  alter table public.invoices add constraint invoices_quotation_fk foreign key (quotation_id) references public.quotations (id);
exception when duplicate_object then null; end $$;

-- رصيد كل صندوق/حساب بعملته وبالدينار المكافئ بسعر اليوم
create or replace view public.money_account_balances with (security_invoker = true) as
select
  a.id as account_id,
  b.balance::numeric(14,2) as balance,
  (case when a.currency = 'IQD' then b.balance
    else round(b.balance * coalesce(nullif((select s.value ->> 'usd_rate' from public.app_settings s where s.key = 'currency'), '')::numeric, 0), 0)
   end)::numeric(14,2) as balance_iqd
from public.money_accounts a
cross join lateral (
  select a.opening_balance
    + coalesce((select sum(case when p.direction = 'in' then p.amount else -p.amount end)
                from public.payments p where p.account_id = a.id and p.voided_at is null), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id), 0)
    - coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id = a.id), 0)
    + coalesce((select sum(case when fa.currency = a.currency then t.amount
                                when a.currency = 'IQD' then round(t.amount * t.exchange_rate, 0)
                                else round(t.amount / t.exchange_rate, 2) end)
                from public.account_transfers t join public.money_accounts fa on fa.id = t.from_account_id
                where t.to_account_id = a.id), 0) as balance
) b;

-- المدفوع المخزّن = الدفعات بالاتجاه الطبيعي للفاتورة ناقص المعاكسة (غير الملغاة)، محوّلة لعملة الفاتورة
create or replace function private.refresh_invoice_paid(inv uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  natural_dir public.payment_direction;
  v numeric;
begin
  select * into i from public.invoices x where x.id = inv;
  if i.id is null then return 0; end if;
  natural_dir := case when i.kind in ('sale', 'purchase_return') then 'in' else 'out' end::public.payment_direction;
  select coalesce(sum((case when p.direction = natural_dir then 1 else -1 end) *
    case when p.currency = i.currency then p.amount
         when i.currency = 'IQD' then p.amount_iqd
         else round(p.amount_iqd / i.exchange_rate, 2) end), 0) into v
  from public.payments p where p.invoice_id = inv and p.voided_at is null;
  update public.invoices set paid = v where id = inv and paid is distinct from v;
  return v;
end $$;

-- الجلسة المفتوحة لموظف (أو null)
create or replace function private.open_session_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.cash_sessions s where s.opened_by = uid and s.status = 'open' limit 1
$$;

-- الحساب المالي للدفعة: المحدد (بنفس العملة) أو الصندوق الافتراضي للنقد بهذه العملة
create or replace function private.resolve_account(p_account uuid, p_method public.payment_method, p_currency public.currency_code)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.money_accounts;
begin
  if p_account is not null then
    select * into a from public.money_accounts x where x.id = p_account;
    if a.id is null or not a.is_active then
      raise exception using message = 'الصندوق أو الحساب غير موجود أو معطّل.', errcode = 'P0001';
    end if;
    if a.currency <> p_currency then
      raise exception using message = 'عملة الدفعة لا تطابق عملة الصندوق «' || a.name || '».', errcode = 'P0001';
    end if;
    return a.id;
  end if;
  if p_method = 'cash' then
    return (select x.id from public.money_accounts x where x.is_active and x.kind = 'cash' and x.currency = p_currency
            order by x.is_default desc, x.created_at limit 1);
  end if;
  return null;
end $$;

-- يسجّل دفعة (سند قبض RC / صرف PV) — داخلية، تستعملها كل الدوال المالية. سعر الصرف null ← سعر اليوم
create or replace function private.add_payment(
  p_direction public.payment_direction, p_method public.payment_method, p_amount numeric,
  p_customer uuid, p_supplier uuid, p_invoice uuid, p_order uuid, p_reference text, p_note text,
  p_currency public.currency_code default 'IQD', p_rate numeric default null, p_account uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  cur public.currency_code := coalesce(p_currency, 'IQD');
  rate numeric;
begin
  if p_amount is null or p_amount <= 0 then return null; end if;
  rate := case when cur = 'IQD' then 1 else coalesce(p_rate, private.usd_rate()) end;
  insert into public.payments (number, direction, method, amount, currency, exchange_rate, account_id, customer_id, supplier_id,
    invoice_id, order_id, cash_session_id, reference, note, created_by)
  values (public.next_doc_number(case when p_direction = 'in' then 'receipt' else 'voucher' end), p_direction, p_method,
    private.round_cur(p_amount, cur), cur, rate, private.resolve_account(p_account, p_method, cur),
    p_customer, p_supplier, p_invoice, p_order,
    case when p_method = 'cash' and auth.uid() is not null then private.open_session_of(auth.uid()) end,
    nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid())
  returning id into pid;
  if p_invoice is not null then perform private.refresh_invoice_paid(p_invoice); end if;
  return pid;
end $$;

revoke all on all functions in schema private from public;
