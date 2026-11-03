-- فحص سلامة المخزون (قراءة فقط): المخازن، الكميات لكل مخزن، والتطابق بين stock_levels و available_qty وسجل الحركات
select jsonb_build_object(
  'warehouses', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_default', is_default, 'is_active', is_active, 'is_sellable', is_sellable, 'branch', branch_id, 'stock', (select coalesce(sum(qty),0) from public.stock_levels s where s.warehouse_id = w.id), 'reserved', (select coalesce(sum(reserved),0) from public.stock_levels s where s.warehouse_id = w.id))) from public.warehouses w),
  'levels_vs_available', (select count(*) from public.product_variants v where v.available_qty <> (select coalesce(sum(s.qty - s.reserved),0) from public.stock_levels s join public.warehouses w on w.id = s.warehouse_id where s.variant_id = v.id and w.is_sellable and w.is_active)),
  'levels_vs_movements', (select count(*) from public.stock_levels s where s.qty <> (select coalesce(sum(m.qty),0) from public.stock_movements m where m.variant_id = s.variant_id and m.warehouse_id = s.warehouse_id)),
  'inactive_variants_with_stock', (select count(*) from public.product_variants v where not v.is_active and exists (select 1 from public.stock_levels s where s.variant_id = v.id and s.qty > 0)),
  'branches', (select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_default', b.is_default)) from public.branches b),
  'inventory_settings', (select value from public.app_settings where key = 'inventory'),
  'pos_settings', (select value from public.app_settings where key = 'pos'),
  'stock_by_variant', (select jsonb_agg(jsonb_build_object('p', p.name, 'v_active', v.is_active, 'wh', w.name, 'qty', s.qty, 'res', s.reserved, 'avail', v.available_qty)) from public.stock_levels s join public.product_variants v on v.id = s.variant_id join public.products p on p.id = v.product_id join public.warehouses w on w.id = s.warehouse_id where s.qty <> 0 or s.reserved <> 0),
  'movements', (select count(*) from public.stock_movements)
) as health;
