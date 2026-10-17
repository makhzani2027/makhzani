-- =============================================================================
-- رقيم — ٧: العروض (views) بصلاحيات المستدعي (security_invoker) فتخضع لـ RLS الجداول تحتها
-- آمن لإعادة التشغيل (create or replace بنفس الأعمدة)
-- =============================================================================

-- رصيد الزبون: موجب = عليه دين لنا. المدفوع صافٍ (قبض − صرف/استرداد)، والملغى لا يُحسب
create or replace view public.customer_balances with (security_invoker = true) as
select
  c.id as customer_id,
  coalesce(s.sales_total, 0)::numeric(14,2) as sales_total,
  coalesce(s.returns_total, 0)::numeric(14,2) as returns_total,
  coalesce(p.paid_total, 0)::numeric(14,2) as paid_total,
  (coalesce(s.sales_total, 0) - coalesce(s.returns_total, 0) - coalesce(p.paid_total, 0))::numeric(14,2) as balance,
  greatest(s.last_at, p.last_at) as last_activity_at
from public.customers c
left join lateral (
  select
    sum(i.total) filter (where i.kind = 'sale') as sales_total,
    sum(i.total) filter (where i.kind = 'sale_return') as returns_total,
    max(i.created_at) as last_at
  from public.invoices i
  where i.customer_id = c.id and i.status = 'posted' and i.kind in ('sale', 'sale_return')
) s on true
left join lateral (
  select
    sum(case when pm.direction = 'in' then pm.amount else -pm.amount end) as paid_total,
    max(pm.created_at) as last_at
  from public.payments pm
  where pm.customer_id = c.id and pm.voided_at is null
) p on true;

-- رصيد المورد: موجب = علينا دين له
create or replace view public.supplier_balances with (security_invoker = true) as
select
  sp.id as supplier_id,
  coalesce(s.purchases_total, 0)::numeric(14,2) as purchases_total,
  coalesce(s.returns_total, 0)::numeric(14,2) as returns_total,
  coalesce(p.paid_total, 0)::numeric(14,2) as paid_total,
  (coalesce(s.purchases_total, 0) - coalesce(s.returns_total, 0) - coalesce(p.paid_total, 0))::numeric(14,2) as balance,
  greatest(s.last_at, p.last_at) as last_activity_at
from public.suppliers sp
left join lateral (
  select
    sum(i.total) filter (where i.kind = 'purchase') as purchases_total,
    sum(i.total) filter (where i.kind = 'purchase_return') as returns_total,
    max(i.created_at) as last_at
  from public.invoices i
  where i.supplier_id = sp.id and i.status = 'posted' and i.kind in ('purchase', 'purchase_return')
) s on true
left join lateral (
  select
    sum(case when pm.direction = 'out' then pm.amount else -pm.amount end) as paid_total,
    max(pm.created_at) as last_at
  from public.payments pm
  where pm.supplier_id = sp.id and pm.voided_at is null
) p on true;

-- أرصدة كل نسخة في كل مخزن فعّال (صف لكل نسخة × مخزن، بالأصفار إن لم يوجد رصيد) — للوحة التحكم
create or replace view public.variant_stock with (security_invoker = true) as
select
  v.id as variant_id,
  v.product_id,
  p.name as product_name,
  v.title as variant_title,
  v.sku,
  v.barcode,
  v.price,
  v.min_stock,
  v.is_active,
  p.archived_at,
  p.category_id,
  p.brand_id,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.code as warehouse_code,
  w.is_sellable,
  coalesce(sl.qty, 0)::numeric(14,3) as qty,
  coalesce(sl.reserved, 0)::numeric(14,3) as reserved,
  (coalesce(sl.qty, 0) - coalesce(sl.reserved, 0))::numeric(14,3) as available,
  sl.updated_at
from public.product_variants v
join public.products p on p.id = v.product_id
cross join public.warehouses w
left join public.stock_levels sl on sl.variant_id = v.id and sl.warehouse_id = w.id
where w.is_active;
