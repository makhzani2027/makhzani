-- =============================================================================
-- رقيم — ٨: قلب المخزون — الدالة الوحيدة التي تغيّر الرصيد، والحجز، ومتوسط التكلفة
-- ترتيب الأقفال الثابت لكل العمليات: صفوف product_variants حسب id أولاً، ثم stock_levels، ثم variant_costs.
-- هذا يمنع الجمود (deadlock) بين بيعين أو نقلين متعاكسين على نفس المنتج.
-- =============================================================================

-- يقفل النسخ بترتيب ثابت (FOR NO KEY UPDATE لا يعطّل إدراج سطور تشير إليها)
create or replace function private.lock_variants(ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.product_variants v where v.id = any (ids) order by v.id for no key update;
end $$;

-- المتوفر للمتجر = Σ(الكمية − المحجوز) في المخازن الفعّالة القابلة للبيع
create or replace function private.refresh_available(p_variant uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v numeric;
begin
  select coalesce(sum(sl.qty - sl.reserved), 0) into v
  from public.stock_levels sl join public.warehouses w on w.id = sl.warehouse_id
  where sl.variant_id = p_variant and w.is_sellable and w.is_active;
  update public.product_variants set available_qty = v where id = p_variant and available_qty is distinct from v;
  return v;
end $$;

-- متوسط التكلفة المرجّح — نفس weightedAvgCost في pricing.ts
create or replace function private.weighted_avg_cost(old_qty numeric, old_cost numeric, in_qty numeric, in_cost numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when greatest(old_qty, 0) + in_qty <= 0 then in_cost
    else round((greatest(old_qty, 0) * old_cost + in_qty * in_cost) / (greatest(old_qty, 0) + in_qty), 2) end
$$;

-- كمية للعرض في رسائل الخطأ: 3 لا 3.000
create or replace function private.fmt_qty(n numeric) returns text
language sql immutable set search_path = '' as $$
  select case when n = trunc(n) then trunc(n)::text else rtrim(rtrim(n::text, '0'), '.') end
$$;

create or replace function private.variant_label(p_variant uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.name || case when v.title is null or v.title = 'افتراضي' then '' else ' — ' || v.title end
  from public.product_variants v join public.products p on p.id = v.product_id where v.id = p_variant
$$;

-- الحركة المخزنية الوحيدة: تقفل الرصيد، تمنع السالب، تكتب الحركة بالرصيد بعدها، تحدّث المتوفر ومتوسط التكلفة.
-- p_qty موجب = دخول، سالب = خروج. تعيد الرصيد الجديد في هذا المخزن.
create or replace function private.apply_movement(
  p_variant uuid, p_warehouse uuid, p_qty numeric, p_kind public.movement_kind, p_unit_cost numeric,
  p_ref_type text, p_ref_id uuid, p_note text
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  sl public.stock_levels;
  c public.variant_costs;
  v_new numeric;
  v_total numeric;
  v_cost numeric;
begin
  if p_qty is null or p_qty = 0 then
    raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001';
  end if;
  perform 1 from public.product_variants v where v.id = p_variant for no key update;
  if not found then
    raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
  end if;
  perform 1 from public.warehouses w where w.id = p_warehouse and w.is_active;
  if not found then
    raise exception using message = 'المخزن غير موجود أو معطّل.', errcode = 'P0001';
  end if;

  insert into public.stock_levels (variant_id, warehouse_id) values (p_variant, p_warehouse) on conflict do nothing;
  select * into sl from public.stock_levels s where s.variant_id = p_variant and s.warehouse_id = p_warehouse for update;
  v_new := sl.qty + p_qty;

  if p_qty < 0 and not coalesce((private.setting('inventory') ->> 'allow_negative_stock')::boolean, false) then
    -- البيع لا يأخذ من الكمية المحجوزة لطلبات التطبيق؛ الجرد والتعديل يعكسان الواقع فيُسمح لهما بما دون المحجوز
    if v_new < 0 or (v_new < sl.reserved and p_kind not in ('stocktake', 'adjustment', 'damage')) then
      raise exception using errcode = 'P0001', message = format('الكمية غير متوفرة: «%s» — المتاح %s',
        private.variant_label(p_variant), private.fmt_qty(greatest(sl.qty - sl.reserved, 0)));
    end if;
  end if;

  insert into public.variant_costs (variant_id) values (p_variant) on conflict do nothing;
  select * into c from public.variant_costs vc where vc.variant_id = p_variant for update;
  if p_kind in ('purchase', 'opening') and p_qty > 0 and p_unit_cost is not null then
    if p_unit_cost < 0 then
      raise exception using message = 'التكلفة لا تكون سالبة.', errcode = 'P0001';
    end if;
    select coalesce(sum(s.qty), 0) into v_total from public.stock_levels s where s.variant_id = p_variant;
    update public.variant_costs set avg_cost = private.weighted_avg_cost(v_total, c.avg_cost, p_qty, p_unit_cost),
      last_cost = p_unit_cost where variant_id = p_variant;
    v_cost := p_unit_cost;
  else
    v_cost := coalesce(p_unit_cost, c.avg_cost);
  end if;

  insert into public.stock_movements (variant_id, warehouse_id, kind, qty, balance_after, unit_cost, ref_type, ref_id, note, created_by)
  values (p_variant, p_warehouse, p_kind, p_qty, v_new, v_cost, p_ref_type, p_ref_id, nullif(btrim(p_note), ''), auth.uid());

  update public.stock_levels set qty = v_new, updated_at = now() where variant_id = p_variant and warehouse_id = p_warehouse;
  perform private.refresh_available(p_variant);
  return v_new;
end $$;

-- يحجز كمية لطلب: من المخزن المفضّل أولاً ثم الافتراضي ثم باقي المخازن القابلة للبيع.
-- لا يبيع أكثر من الموجود أبداً (حتى لو سُمح بالسالب في نقطة البيع).
create or replace function private.reserve(p_order uuid, p_variant uuid, p_qty numeric, p_preferred uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  remaining numeric := p_qty;
  take numeric;
  avail numeric;
begin
  perform private.lock_variants(array[p_variant]);
  for r in
    select s.warehouse_id, s.qty, s.reserved
    from public.stock_levels s join public.warehouses w on w.id = s.warehouse_id
    where s.variant_id = p_variant and w.is_sellable and w.is_active and s.qty - s.reserved > 0
    order by (w.id = p_preferred) desc, w.is_default desc, w.code, w.id
    for update of s
  loop
    exit when remaining <= 0;
    take := least(remaining, r.qty - r.reserved);
    update public.stock_levels set reserved = reserved + take, updated_at = now()
      where variant_id = p_variant and warehouse_id = r.warehouse_id;
    insert into public.order_reservations (order_id, variant_id, warehouse_id, qty) values (p_order, p_variant, r.warehouse_id, take)
      on conflict (order_id, variant_id, warehouse_id) do update set qty = public.order_reservations.qty + excluded.qty;
    remaining := remaining - take;
  end loop;
  if remaining > 0 then
    avail := p_qty - remaining;
    raise exception using errcode = 'P0001', message = format('الكمية المطلوبة من «%s» غير متوفرة — المتوفر %s',
      private.variant_label(p_variant), private.fmt_qty(avail));
  end if;
  perform private.refresh_available(p_variant);
end $$;

-- يحرر كل حجز الطلب (إلغاء) — أو يستهلكه بحركات بيع (تسليم) إن مُرّر رقم الفاتورة
create or replace function private.release_order(p_order uuid, p_consume_invoice uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  perform private.lock_variants(array(select distinct x.variant_id from public.order_reservations x where x.order_id = p_order));
  for r in
    select x.variant_id, x.warehouse_id, x.qty from public.order_reservations x
    where x.order_id = p_order order by x.variant_id, x.warehouse_id
  loop
    update public.stock_levels set reserved = greatest(reserved - r.qty, 0), updated_at = now()
      where variant_id = r.variant_id and warehouse_id = r.warehouse_id;
    if p_consume_invoice is not null then
      perform private.apply_movement(r.variant_id, r.warehouse_id, -r.qty, 'sale', null, 'invoice', p_consume_invoice, null);
    else
      perform private.refresh_available(r.variant_id);
    end if;
  end loop;
  delete from public.order_reservations where order_id = p_order;
end $$;

-- تغيير «قابل للبيع/فعّال» لمخزن يعيد حساب المتوفر لكل نسخه
create or replace function private.warehouse_sellable_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  vid uuid;
begin
  for vid in select s.variant_id from public.stock_levels s where s.warehouse_id = new.id order by s.variant_id loop
    perform private.refresh_available(vid);
  end loop;
  return null;
end $$;
drop trigger if exists sellable_changed on public.warehouses;
create trigger sellable_changed after update of is_sellable, is_active on public.warehouses
  for each row when (old.is_sellable is distinct from new.is_sellable or old.is_active is distinct from new.is_active)
  execute function private.warehouse_sellable_changed();

revoke all on all functions in schema private from public;
