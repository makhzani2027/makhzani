-- تقرير سلامة البيانات (قراءة فقط): كل بند = مشكلة قد يقع فيها الزبون أو الموظف. الصفر = سليم.
with
pub as (select p.* from public.products p where p.is_published and p.archived_at is null),
act as (select v.*, p.name pname from public.product_variants v join pub p on p.id = v.product_id where v.is_active)
select jsonb_build_object(
  -- المتجر والتطبيق
  'store', (select value - 'about' from public.app_settings where key = 'store'),
  'store_missing_phone', (select (value ->> 'phone') is null and (value ->> 'whatsapp') is null from public.app_settings where key = 'store'),
  'delivery_zones_active', (select count(*) from public.delivery_zones where is_active),
  'delivery_zones_zero_fee', (select coalesce(jsonb_agg(governorate), '[]') from public.delivery_zones where is_active and fee = 0),
  -- المنتجات المنشورة في التطبيق
  'published_products', (select count(*) from pub),
  'published_without_active_variant', (select coalesce(jsonb_agg(name), '[]') from pub p where not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active)),
  'variants_price_zero', (select coalesce(jsonb_agg(pname || ' / ' || title), '[]') from act where price <= 0),
  'variants_wholesale_above_retail', (select coalesce(jsonb_agg(pname || ' / ' || title), '[]') from act where wholesale_price > price),
  'variants_compare_below_price', (select coalesce(jsonb_agg(pname || ' / ' || title), '[]') from act where compare_at_price is not null and compare_at_price <= price),
  'published_without_image', (select coalesce(jsonb_agg(name), '[]') from pub p where p.cover_key is null and not exists (select 1 from public.product_images i where i.product_id = p.id)),
  'published_without_category', (select coalesce(jsonb_agg(name), '[]') from pub where category_id is null),
  'published_in_hidden_category', (select coalesce(jsonb_agg(p.name), '[]') from pub p join public.categories c on c.id = p.category_id where not c.is_visible),
  'published_out_of_stock_no_request', (select coalesce(jsonb_agg(p.name), '[]') from pub p where not p.allow_request and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active and v.available_qty > 0)),
  'duplicate_barcodes', (select coalesce(jsonb_agg(barcode), '[]') from (select barcode from public.product_variants where barcode is not null and is_active group by barcode having count(*) > 1) d),
  'serial_products_stock_vs_serials', (select coalesce(jsonb_agg(p.name), '[]') from public.products p join public.product_variants v on v.product_id = p.id where p.track_serials and p.archived_at is null
      and (select coalesce(sum(qty),0) from public.stock_levels s where s.variant_id = v.id) <> (select count(*) from public.serials x where x.variant_id = v.id and x.status in ('in_stock','returned'))),
  'products_without_cost', (select coalesce(jsonb_agg(pname || ' / ' || title), '[]') from act a where not exists (select 1 from public.variant_costs c where c.variant_id = a.id and c.avg_cost > 0)),
  'price_below_cost', (select coalesce(jsonb_agg(a.pname || ' / ' || a.title || ': ' || a.price || ' < ' || c.avg_cost), '[]') from act a join public.variant_costs c on c.variant_id = a.id where c.avg_cost > 0 and a.price < c.avg_cost),
  -- المخزون
  'negative_stock', (select count(*) from public.stock_levels where qty < 0 or reserved < 0 or reserved > qty),
  'available_qty_mismatch', (select count(*) from public.product_variants v where v.available_qty <> (select coalesce(sum(s.qty - s.reserved),0) from public.stock_levels s join public.warehouses w on w.id = s.warehouse_id where s.variant_id = v.id and w.is_sellable and w.is_active)),
  'levels_vs_movements', (select count(*) from public.stock_levels s where s.qty <> (select coalesce(sum(m.qty),0) from public.stock_movements m where m.variant_id = s.variant_id and m.warehouse_id = s.warehouse_id)),
  'default_warehouse', (select jsonb_build_object('is_default', (select name from public.warehouses where is_default), 'setting', (select w.name from public.warehouses w where w.id::text = (select value ->> 'default_warehouse_id' from public.app_settings where key = 'inventory')))),
  -- الموظفون والأدوار
  'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', pr.full_name, 'owner', pr.is_owner, 'status', pr.status, 'role', r.name,
      'missing', (select coalesce(jsonb_agg(x), '[]') from unnest(array['pos.sell','quotations.manage','customers.view','invoices.view','inventory.view','products.view']) x
                  where not pr.is_owner and r.id is not null and x <> all(r.permissions) and (('pos.sell' = any(r.permissions)) or ('quotations.manage' = any(r.permissions)))))), '[]')
      from public.profiles pr left join public.staff_roles r on r.id = pr.role_id where pr.kind = 'staff'),
  'roles', (select jsonb_agg(jsonb_build_object('name', name, 'perms', permissions)) from public.staff_roles),
  -- الزبائن
  'customers', (select count(*) from public.customers),
  'customers_duplicate_phone', (select coalesce(jsonb_agg(phone), '[]') from (select phone from public.customers where phone is not null group by phone having count(*) > 1) d),
  'cash_customer_exists', (select exists (select 1 from public.customers where is_cash_customer)),
  -- الأقسام والعلامات
  'categories', (select count(*) from public.categories),
  'empty_visible_categories', (select coalesce(jsonb_agg(c.name), '[]') from public.categories c where c.is_visible and not exists (select 1 from pub p where p.category_id = c.id)
      and not exists (select 1 from public.categories k where k.parent_id = c.id)),
  'brands_without_logo', (select coalesce(jsonb_agg(name), '[]') from public.brands where logo_key is null),
  -- الحسابات
  'money_accounts', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'opening', opening_balance)), '[]') from public.money_accounts),
  'doc_counters', (select jsonb_object_agg(kind, last_value) from public.doc_counters),
  'counts', jsonb_build_object('invoices', (select count(*) from public.invoices), 'orders', (select count(*) from public.orders), 'quotations', (select count(*) from public.quotations), 'movements', (select count(*) from public.stock_movements))
) as report;
