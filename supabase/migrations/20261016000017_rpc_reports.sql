-- =============================================================================
-- رقيم — ١٧: التقارير ولوحة المؤشرات. المبالغ بالدينار (مستندات الدولار تُحوَّل بسعر صرف المستند).
-- الأيام والأسابيع والأشهر بتوقيت بغداد. آمن لإعادة التشغيل
-- =============================================================================

-- بداية اليوم الحالي بتوقيت بغداد
create or replace function private.baghdad_today() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Asia/Baghdad')) at time zone 'Asia/Baghdad'
$$;

-- مؤشرات اللوحة (DashboardSummary). المدى [from, to) — الافتراضي اليوم
create or replace function public.dashboard_summary("from" timestamptz default null, "to" timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f timestamptz := coalesce(dashboard_summary."from", private.baghdad_today());
  t timestamptz := coalesce(dashboard_summary."to", private.baghdad_today() + interval '1 day');
  costs boolean;
  s record;
  low_default numeric := coalesce(nullif(private.setting('inventory') ->> 'low_stock_default', '')::numeric, 0);
  rate numeric := coalesce(nullif(private.setting('currency') ->> 'usd_rate', '')::numeric, 0);
  r jsonb;
begin
  perform private.require_perm('dashboard.view');
  costs := public.has_perm('costs.view');
  select
    coalesce(sum(i.total * i.exchange_rate) filter (where i.kind = 'sale'), 0) as sales_total,
    count(*) filter (where i.kind = 'sale') as sales_count,
    coalesce(sum(i.total * i.exchange_rate) filter (where i.kind = 'sale_return'), 0) as returns_total,
    coalesce(sum(i.total * i.exchange_rate) filter (where i.kind = 'purchase'), 0)
      - coalesce(sum(i.total * i.exchange_rate) filter (where i.kind = 'purchase_return'), 0) as purchases_total,
    coalesce(sum((i.total - i.delivery_fee) * i.exchange_rate - i.cost_total) filter (where i.kind = 'sale'), 0)
      - coalesce(sum((i.total - i.delivery_fee) * i.exchange_rate - i.cost_total) filter (where i.kind = 'sale_return'), 0) as profit
  into s
  from public.invoices i where i.status = 'posted' and i.created_at >= f and i.created_at < t;

  r := jsonb_build_object(
    'sales_total', round(s.sales_total, 0),
    'sales_count', s.sales_count,
    'returns_total', round(s.returns_total, 0),
    'profit', case when costs then round(s.profit, 0) end,
    'purchases_total', round(s.purchases_total, 0),
    'orders_new', (select count(*) from public.orders o where o.status = 'pending'),
    'orders_open', (select count(*) from public.orders o where o.status in ('confirmed', 'preparing', 'ready', 'out_for_delivery')),
    'requests_new', (select count(*) from public.product_requests q where q.status = 'new'),
    'low_stock_count', (select count(*) from (
        select v.id, v.min_stock, coalesce(sum(sl.qty), 0) as q from public.product_variants v
        join public.products p on p.id = v.product_id and p.archived_at is null
        left join public.stock_levels sl on sl.variant_id = v.id
        where v.is_active group by v.id) x
      where x.q > 0 and x.q <= coalesce(nullif(x.min_stock, 0), low_default)),
    'out_of_stock_count', (select count(*) from (
        select v.id, coalesce(sum(sl.qty), 0) as q from public.product_variants v
        join public.products p on p.id = v.product_id and p.archived_at is null
        left join public.stock_levels sl on sl.variant_id = v.id
        where v.is_active group by v.id) x where x.q <= 0),
    'receivables', coalesce((select round(sum(greatest(b.balance + round(b.balance_usd * rate, 0), 0)), 0) from public.customer_balances b), 0),
    'payables', coalesce((select round(sum(greatest(b.balance + round(b.balance_usd * rate, 0), 0)), 0) from public.supplier_balances b), 0),
    'cash_balance', coalesce((select round(sum(b.balance_iqd), 0) from public.money_account_balances b
                              join public.money_accounts a on a.id = b.account_id where a.is_active), 0),
    'cash_in', coalesce((select sum(p.amount_iqd) from public.payments p where p.direction = 'in' and p.voided_at is null
                         and p.created_at >= f and p.created_at < t), 0),
    'cash_out', coalesce((select sum(p.amount_iqd) from public.payments p where p.direction = 'out' and p.voided_at is null
                          and p.created_at >= f and p.created_at < t), 0),
    'expenses_total', coalesce((select round(sum(e.amount * e.exchange_rate), 0) from public.expenses e
                                where e.spent_at >= f and e.spent_at < t), 0)
  );
  return r;
end $$;

-- سلسلة المبيعات (SalesPoint[]) بفترات day|week|month بتوقيت بغداد، مع الفترات الفارغة
create or replace function public.sales_series("from" timestamptz, "to" timestamptz, bucket text default 'day') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b text := coalesce(nullif(bucket, ''), 'day');
  costs boolean;
begin
  perform private.require_perm('reports.view');
  if b not in ('day', 'week', 'month') then
    raise exception using message = 'الفترة يجب أن تكون يوماً أو أسبوعاً أو شهراً.', errcode = 'P0001';
  end if;
  if sales_series."from" is null or sales_series."to" is null or sales_series."to" <= sales_series."from" then
    raise exception using message = 'حدد مدة صحيحة.', errcode = 'P0001';
  end if;
  if sales_series."to" - sales_series."from" > interval '800 days' then
    raise exception using message = 'المدة طويلة جداً.', errcode = 'P0001';
  end if;
  costs := public.has_perm('costs.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'bucket', g.k at time zone 'Asia/Baghdad',
      'sales', round(coalesce(x.sales, 0), 0),
      'returns', round(coalesce(x.returns, 0), 0),
      'profit', case when costs then round(coalesce(x.profit, 0), 0) end,
      'invoices', coalesce(x.n, 0)) order by g.k)
    from generate_series(date_trunc(b, sales_series."from" at time zone 'Asia/Baghdad'),
                         date_trunc(b, (sales_series."to" - interval '1 microsecond') at time zone 'Asia/Baghdad'),
                         ('1 ' || b)::interval) g(k)
    left join (
      select date_trunc(b, i.created_at at time zone 'Asia/Baghdad') as k,
        sum(i.total * i.exchange_rate) filter (where i.kind = 'sale') as sales,
        sum(i.total * i.exchange_rate) filter (where i.kind = 'sale_return') as returns,
        coalesce(sum((i.total - i.delivery_fee) * i.exchange_rate - i.cost_total) filter (where i.kind = 'sale'), 0)
          - coalesce(sum((i.total - i.delivery_fee) * i.exchange_rate - i.cost_total) filter (where i.kind = 'sale_return'), 0) as profit,
        count(*) filter (where i.kind = 'sale') as n
      from public.invoices i
      where i.status = 'posted' and i.kind in ('sale', 'sale_return')
        and i.created_at >= sales_series."from" and i.created_at < sales_series."to"
      group by 1
    ) x on x.k = g.k
  ), '[]'::jsonb);
end $$;

-- الأكثر مبيعاً (TopProductRow[]) — صافي بعد الإرجاع، الكمية بالقطع
create or replace function public.top_products("from" timestamptz, "to" timestamptz, lim int default 10) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  costs boolean;
begin
  perform private.require_perm('reports.view');
  costs := public.has_perm('costs.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', x.product_id, 'variant_id', x.variant_id, 'name', x.name,
      'variant_title', x.variant_title, 'qty', x.qty, 'revenue', round(x.revenue, 0),
      'profit', case when costs then round(x.revenue - x.cost, 0) end) order by x.revenue desc, x.qty desc)
    from (
      select ii.variant_id, min(ii.product_id::text)::uuid as product_id, min(ii.name) as name, min(ii.variant_title) as variant_title,
        sum(case when i.kind = 'sale' then 1 else -1 end * ii.qty * ii.unit_factor) as qty,
        sum(case when i.kind = 'sale' then 1 else -1 end * ii.line_total * i.exchange_rate
            * case when i.subtotal > 0 then (i.subtotal - i.discount) / i.subtotal else 1 end) as revenue,
        sum(case when i.kind = 'sale' then 1 else -1 end * ii.unit_cost * ii.qty) as cost
      from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id
      where i.status = 'posted' and i.kind in ('sale', 'sale_return')
        and i.created_at >= top_products."from" and i.created_at < top_products."to"
      group by ii.variant_id
      order by 6 desc
      limit least(greatest(coalesce(lim, 10), 1), 200)
    ) x
  ), '[]'::jsonb);
end $$;

-- تقييم المخزون لكل مخزن (InventoryValuationRow[]) بمتوسط التكلفة وسعر البيع
create or replace function public.inventory_valuation() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_perm('costs.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object('warehouse_id', w.id, 'items', coalesce(x.items, 0), 'units', coalesce(x.units, 0),
      'cost_value', round(coalesce(x.cost_value, 0), 0), 'retail_value', round(coalesce(x.retail_value, 0), 0)) order by w.is_default desc, w.code)
    from public.warehouses w
    left join (
      select sl.warehouse_id, count(*) filter (where sl.qty > 0) as items, sum(greatest(sl.qty, 0)) as units,
        sum(greatest(sl.qty, 0) * coalesce(c.avg_cost, 0)) as cost_value, sum(greatest(sl.qty, 0) * v.price) as retail_value
      from public.stock_levels sl join public.product_variants v on v.id = sl.variant_id
      left join public.variant_costs c on c.variant_id = sl.variant_id
      group by sl.warehouse_id
    ) x on x.warehouse_id = w.id
    where w.is_active
  ), '[]'::jsonb);
end $$;

-- النواقص (LowStockRow[]): الرصيد الكلي ≤ حد الطلب (أو الحد الافتراضي في الإعدادات)
create or replace function public.low_stock(lim int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  low_default numeric := coalesce(nullif(private.setting('inventory') ->> 'low_stock_default', '')::numeric, 0);
begin
  perform private.require_perm('inventory.view');
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.qty, x.name)
    from (
      select v.id as variant_id, v.product_id, p.name, nullif(v.title, 'افتراضي') as variant_title, v.sku,
        coalesce((select sum(sl.qty) from public.stock_levels sl where sl.variant_id = v.id), 0) as qty,
        coalesce(nullif(v.min_stock, 0), low_default) as min_stock
      from public.product_variants v join public.products p on p.id = v.product_id
      where v.is_active and p.archived_at is null
        and coalesce((select sum(sl.qty) from public.stock_levels sl where sl.variant_id = v.id), 0) <= coalesce(nullif(v.min_stock, 0), low_default)
        and coalesce(nullif(v.min_stock, 0), low_default) > 0
      order by 6, 3
      limit least(greatest(coalesce(lim, 50), 1), 1000)
    ) x
  ), '[]'::jsonb);
end $$;

-- الراكد: له رصيد ولم يُبع منذ N يوم ← [{variant_id, product_id, name, variant_title, sku, qty, last_sold_at, cost_value?}]
create or replace function public.stagnant_products(days int default 60, lim int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  costs boolean;
begin
  perform private.require_perm('reports.view');
  costs := public.has_perm('costs.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object('variant_id', x.variant_id, 'product_id', x.product_id, 'name', x.name,
      'variant_title', x.variant_title, 'sku', x.sku, 'qty', x.qty, 'last_sold_at', x.last_sold_at,
      'cost_value', case when costs then round(x.qty * x.avg_cost, 0) end) order by x.last_sold_at nulls first, x.qty desc)
    from (
      select v.id as variant_id, v.product_id, p.name, nullif(v.title, 'افتراضي') as variant_title, v.sku,
        (select sum(sl.qty) from public.stock_levels sl where sl.variant_id = v.id) as qty,
        (select max(m.created_at) from public.stock_movements m where m.variant_id = v.id and m.kind = 'sale') as last_sold_at,
        coalesce(c.avg_cost, 0) as avg_cost
      from public.product_variants v join public.products p on p.id = v.product_id
      left join public.variant_costs c on c.variant_id = v.id
      where v.is_active and p.archived_at is null and p.created_at < now() - make_interval(days => greatest(coalesce(days, 60), 1))
    ) x
    where x.qty > 0 and (x.last_sold_at is null or x.last_sold_at < now() - make_interval(days => greatest(coalesce(days, 60), 1)))
    limit least(greatest(coalesce(lim, 50), 1), 1000)
  ), '[]'::jsonb);
end $$;

-- دفعات تنتهي خلال N يوم (والمنتهية) ← [{lot_id, variant_id, product_id, name, variant_title, sku, warehouse_id, lot_code, expiry_date, qty, days_left}]
create or replace function public.near_expiry(days int default 30, lim int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  perform private.require_perm('inventory.view');
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.expiry_date, x.name)
    from (
      select l.id as lot_id, l.variant_id, v.product_id, p.name, nullif(v.title, 'افتراضي') as variant_title, v.sku, l.warehouse_id,
        l.lot_code, l.expiry_date, l.qty, (l.expiry_date - today) as days_left
      from public.stock_lots l join public.product_variants v on v.id = l.variant_id join public.products p on p.id = v.product_id
      where l.qty > 0 and l.expiry_date is not null and l.expiry_date <= today + greatest(coalesce(days, 30), 0)
      order by l.expiry_date
      limit least(greatest(coalesce(lim, 100), 1), 1000)
    ) x
  ), '[]'::jsonb);
end $$;

-- دفتر الطرف: debit يزيد الرصيد (دين الزبون علينا له/دين المورد لنا عليه)، credit ينقصه. بعملة المستند
create or replace function private.party_ledger(p_customer uuid, p_supplier uuid)
returns table (at timestamptz, doc_type text, doc_id uuid, number text, description text, currency public.currency_code, debit numeric, credit numeric)
language sql stable security definer set search_path = '' as $$
  select i.created_at, i.kind::text, i.id, i.number,
    case i.kind when 'sale' then 'فاتورة بيع' when 'sale_return' then 'إرجاع بيع' when 'purchase' then 'فاتورة شراء' else 'إرجاع شراء' end,
    i.currency,
    case when i.kind in ('sale', 'purchase') then i.total else 0 end,
    case when i.kind in ('sale_return', 'purchase_return') then i.total else 0 end
  from public.invoices i
  where i.status = 'posted' and ((p_customer is not null and i.customer_id = p_customer) or (p_supplier is not null and i.supplier_id = p_supplier))
  union all
  select pm.created_at, 'payment', pm.id, pm.number,
    case when pm.direction = 'in' then 'سند قبض' else 'سند صرف' end || coalesce(' — ' || i2.number, ''),
    coalesce(i2.currency, pm.currency),
    case when (p_customer is not null) = (pm.direction = 'out') then x.amt else 0 end,
    case when (p_customer is not null) = (pm.direction = 'in') then x.amt else 0 end
  from public.payments pm
  left join public.invoices i2 on i2.id = pm.invoice_id
  cross join lateral (select case when i2.id is null or pm.currency = i2.currency then pm.amount
    when i2.currency = 'IQD' then pm.amount_iqd else round(pm.amount_iqd / i2.exchange_rate, 2) end as amt) x
  where pm.voided_at is null and ((p_customer is not null and pm.customer_id = p_customer) or (p_supplier is not null and pm.supplier_id = p_supplier))
$$;

-- كشف حساب: {opening:{IQD,USD}, rows:[{at, doc_type, doc_id, number, description, currency, debit, credit, balance}], closing:{IQD,USD}}
create or replace function private.statement(p_customer uuid, p_supplier uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as (select * from private.party_ledger(p_customer, p_supplier)),
  op as (select l.currency, sum(l.debit - l.credit) as b from l where p_from is not null and l.at < p_from group by l.currency),
  rws as (
    select l.*, coalesce((select op.b from op where op.currency = l.currency), 0)
      + sum(l.debit - l.credit) over (partition by l.currency order by l.at, l.number rows unbounded preceding) as balance
    from l where (p_from is null or l.at >= p_from) and (p_to is null or l.at < p_to)
  )
  select jsonb_build_object(
    'opening', jsonb_build_object('IQD', coalesce((select op.b from op where op.currency = 'IQD'), 0), 'USD', coalesce((select op.b from op where op.currency = 'USD'), 0)),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.at, r.number) from rws r), '[]'::jsonb),
    'closing', jsonb_build_object(
      'IQD', coalesce((select sum(l.debit - l.credit) from l where l.currency = 'IQD' and (p_to is null or l.at < p_to)), 0),
      'USD', coalesce((select sum(l.debit - l.credit) from l where l.currency = 'USD' and (p_to is null or l.at < p_to)), 0)))
$$;

create or replace function public.customer_statement(customer_id uuid, "from" timestamptz default null, "to" timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_perm('finance.view');
  if not exists (select 1 from public.customers c where c.id = customer_statement.customer_id) then
    raise exception using message = 'الزبون غير موجود.', errcode = 'P0001';
  end if;
  return jsonb_build_object('customer_id', customer_statement.customer_id)
    || private.statement(customer_statement.customer_id, null, customer_statement."from", customer_statement."to");
end $$;

create or replace function public.supplier_statement(supplier_id uuid, "from" timestamptz default null, "to" timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_perm('finance.view');
  if not exists (select 1 from public.suppliers s where s.id = supplier_statement.supplier_id) then
    raise exception using message = 'المورد غير موجود.', errcode = 'P0001';
  end if;
  return jsonb_build_object('supplier_id', supplier_statement.supplier_id)
    || private.statement(null, supplier_statement.supplier_id, supplier_statement."from", supplier_statement."to");
end $$;

revoke all on all functions in schema private from public;
