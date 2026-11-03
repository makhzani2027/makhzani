-- =============================================================================
-- رقيم — ٢٥: الكميات المتاحة للبيع لمن يبيع أو يكتب العروض. آمن لإعادة التشغيل.
-- قراءة stock_levels تحتاج «عرض المخزون» (inventory.view)، فالموظف الذي يملك البيع أو العروض فقط
-- كان يرى كل المنتجات «غير متوفرة» في نقطة البيع ومنشئ العروض رغم وجود الكميات.
-- هذه الدالة تعيد المتاح فقط (الكمية − المحجوز) لكل نسخة في المخازن الفعّالة القابلة للبيع،
-- بلا تكاليف ولا حركات، لمن يملك pos.sell أو quotations.manage أو inventory.view.
-- =============================================================================

create or replace function public.sellable_stock()
returns table (variant_id uuid, warehouse_id uuid, available numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_perm('pos.sell') or public.has_perm('quotations.manage') or public.has_perm('inventory.view')) then
    raise exception using message = 'لا تملك صلاحية هذه العملية.', errcode = 'P0001';
  end if;
  return query
    select s.variant_id, s.warehouse_id, (s.qty - s.reserved)::numeric
    from public.stock_levels s
    join public.warehouses w on w.id = s.warehouse_id
    where w.is_active and w.is_sellable and s.qty - s.reserved <> 0
    order by s.variant_id, s.warehouse_id;
end $$;

revoke all on function public.sellable_stock() from public, anon;
grant execute on function public.sellable_stock() to authenticated;
