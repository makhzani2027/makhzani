-- =============================================================================
-- رقيم — ١٥: عمليات المخزون: التعديل، النقل، الجرد، السندات المخزنية اليدوية
-- كل تغيير للرصيد عبر private.apply_movement وبقفل النسخ بترتيب variant_id. آمن لإعادة التشغيل
-- =============================================================================

create or replace function private.qty_of(p_variant uuid, p_warehouse uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.qty from public.stock_levels s where s.variant_id = p_variant and s.warehouse_id = p_warehouse), 0)
$$;

-- {variant_id, warehouse_id, mode:'set'|'delta', qty, kind:'adjustment'|'damage'|'opening', note, unit_cost?, lot_code?, expiry_date?}
create or replace function public.adjust_stock(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  vid uuid := nullif(p ->> 'variant_id', '')::uuid;
  wid uuid := nullif(p ->> 'warehouse_id', '')::uuid;
  k text := coalesce(nullif(p ->> 'kind', ''), 'adjustment');
  m text := coalesce(nullif(p ->> 'mode', ''), 'delta');
  q numeric := nullif(p ->> 'qty', '')::numeric;
  delta numeric;
  newq numeric;
begin
  perform private.require_perm('inventory.adjust');
  if k not in ('adjustment', 'damage', 'opening') then
    raise exception using message = 'نوع التعديل غير صالح.', errcode = 'P0001';
  end if;
  if m not in ('set', 'delta') or q is null then
    raise exception using message = 'أدخل الكمية.', errcode = 'P0001';
  end if;
  if vid is null or wid is null then
    raise exception using message = 'اختر المنتج والمخزن.', errcode = 'P0001';
  end if;
  perform private.lock_variants(array[vid]);
  if m = 'set' then
    if q < 0 then raise exception using message = 'الكمية لا تكون سالبة.', errcode = 'P0001'; end if;
    delta := q - private.qty_of(vid, wid);
  else
    delta := q;
  end if;
  if k = 'damage' and delta > 0 then
    raise exception using message = 'التالف يُنقص الرصيد فقط.', errcode = 'P0001';
  end if;
  if delta = 0 then
    return jsonb_build_object('variant_id', vid, 'warehouse_id', wid, 'qty', private.qty_of(vid, wid), 'changed', false);
  end if;
  if k <> 'opening' and nullif(btrim(p ->> 'note'), '') is null then
    raise exception using message = 'اكتب سبب التعديل.', errcode = 'P0001';
  end if;
  newq := private.apply_movement(vid, wid, delta, k::public.movement_kind,
    case when k = 'opening' and public.has_perm('costs.view') then nullif(p ->> 'unit_cost', '')::numeric end,
    'adjustment', null, p ->> 'note', p ->> 'lot_code', nullif(p ->> 'expiry_date', '')::date);
  return jsonb_build_object('variant_id', vid, 'warehouse_id', wid, 'qty', newq, 'changed', true);
end $$;

-- نقل بين مخزنين: {from_warehouse_id, to_warehouse_id, items:[{variant_id, qty, serials?}], note?}
-- الدفعات (الصلاحية) تنتقل كما هي: الخروج FEFO ثم الدخول بنفس الدفعات
create or replace function public.transfer_stock(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fw uuid := nullif(p ->> 'from_warehouse_id', '')::uuid;
  tw uuid := nullif(p ->> 'to_warehouse_id', '')::uuid;
  it jsonb;
  vid uuid;
  q numeric;
  v_avg numeric;
  sers text[];
  lot jsonb;
  out_lots jsonb;
  tid uuid;
  num text;
begin
  perform private.require_perm('inventory.transfer');
  if fw is null or tw is null or fw = tw then
    raise exception using message = 'اختر مخزنين مختلفين.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = tw and w.is_active) then
    raise exception using message = 'المخزن غير موجود أو معطّل.', errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  perform private.lock_variants(array(select distinct (x ->> 'variant_id')::uuid from jsonb_array_elements(p -> 'items') x));
  num := public.next_doc_number('transfer');
  insert into public.transfers (number, from_warehouse_id, to_warehouse_id, note, created_by)
  values (num, fw, tw, left(nullif(btrim(p ->> 'note'), ''), 500), auth.uid()) returning id into tid;

  for it in select x from jsonb_array_elements(p -> 'items') x order by x ->> 'variant_id' loop
    vid := (it ->> 'variant_id')::uuid;
    q := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if q <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    if exists (select 1 from public.transfer_items ti where ti.transfer_id = tid and ti.variant_id = vid) then
      raise exception using message = 'منتج مكرر في سند النقل.', errcode = 'P0001';
    end if;
    sers := private.jtext_array(it -> 'serials');
    if (select pr.track_serials from public.product_variants v join public.products pr on pr.id = v.product_id where v.id = vid) then
      if cardinality(sers) <> q then
        raise exception using errcode = 'P0001', message = format('أدخل %s رقماً تسلسلياً لـ «%s».', private.fmt_qty(q), private.variant_label(vid));
      end if;
      update public.serials set warehouse_id = tw where variant_id = vid and serial = any (sers) and warehouse_id = fw and status in ('in_stock', 'returned');
      if (select count(*) from public.serials s where s.variant_id = vid and s.serial = any (sers) and s.warehouse_id = tw) <> cardinality(sers) then
        raise exception using message = 'رقم تسلسلي غير موجود في المخزن المصدر.', errcode = 'P0001';
      end if;
    end if;
    select coalesce(c.avg_cost, 0) into v_avg from public.variant_costs c where c.variant_id = vid;
    perform private.apply_movement(vid, fw, -q, 'transfer_out', v_avg, 'transfer', tid, num);
    out_lots := private.last_lots();
    if jsonb_array_length(out_lots) > 0 then
      for lot in select x from jsonb_array_elements(out_lots) x loop
        perform private.apply_movement(vid, tw, (lot ->> 'qty')::numeric, 'transfer_in', v_avg, 'transfer', tid, num,
          lot ->> 'lot_code', nullif(lot ->> 'expiry_date', '')::date);
      end loop;
      -- رصيد قديم بلا دفعات
      lot := (select jsonb_build_object('n', coalesce(sum((x ->> 'qty')::numeric), 0)) from jsonb_array_elements(out_lots) x);
      if (lot ->> 'n')::numeric < q then
        perform private.apply_movement(vid, tw, q - (lot ->> 'n')::numeric, 'transfer_in', v_avg, 'transfer', tid, num);
      end if;
    else
      perform private.apply_movement(vid, tw, q, 'transfer_in', v_avg, 'transfer', tid, num);
    end if;
    insert into public.transfer_items (transfer_id, variant_id, qty) values (tid, vid, q);
  end loop;
  return jsonb_build_object('transfer_id', tid, 'number', num);
end $$;

-- الجرد: مسودة ← عدّ ← تطبيق (الفرق حركة stocktake)
create or replace function public.create_stocktake(warehouse_id uuid, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.stocktakes;
begin
  perform private.require_perm('inventory.adjust');
  if not exists (select 1 from public.warehouses w where w.id = create_stocktake.warehouse_id and w.is_active) then
    raise exception using message = 'المخزن غير موجود أو معطّل.', errcode = 'P0001';
  end if;
  if exists (select 1 from public.stocktakes x where x.warehouse_id = create_stocktake.warehouse_id and x.status = 'draft') then
    raise exception using message = 'يوجد جرد مفتوح لهذا المخزن. أكمله أو ألغه أولاً.', errcode = 'P0001';
  end if;
  insert into public.stocktakes (number, warehouse_id, note, created_by)
  values (public.next_doc_number('stocktake'), create_stocktake.warehouse_id, nullif(btrim(create_stocktake.note), ''), auth.uid())
  returning * into s;
  return to_jsonb(s);
end $$;

-- counted = null يحذف البند من الجرد
create or replace function public.set_stocktake_count(id uuid, variant_id uuid, counted numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.stocktakes;
  r public.stocktake_items;
begin
  perform private.require_perm('inventory.adjust');
  select * into s from public.stocktakes x where x.id = set_stocktake_count.id for update;
  if s.id is null then raise exception using message = 'الجرد غير موجود.', errcode = 'P0001'; end if;
  if s.status <> 'draft' then raise exception using message = 'الجرد مطبّق أو ملغى؛ لا يُعدَّل.', errcode = 'P0001'; end if;
  if counted is not null and counted < 0 then raise exception using message = 'العدد لا يكون سالباً.', errcode = 'P0001'; end if;
  if not exists (select 1 from public.product_variants v where v.id = set_stocktake_count.variant_id) then
    raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
  end if;
  if counted is null then
    delete from public.stocktake_items x where x.stocktake_id = s.id and x.variant_id = set_stocktake_count.variant_id;
    return jsonb_build_object('stocktake_id', s.id, 'variant_id', set_stocktake_count.variant_id, 'removed', true);
  end if;
  insert into public.stocktake_items as x (stocktake_id, variant_id, expected_qty, counted_qty)
  values (s.id, set_stocktake_count.variant_id, private.qty_of(set_stocktake_count.variant_id, s.warehouse_id), counted)
  on conflict (stocktake_id, variant_id) do update set counted_qty = excluded.counted_qty
  returning * into r;
  return to_jsonb(r);
end $$;

create or replace function public.apply_stocktake(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.stocktakes;
  r record;
  delta numeric;
  n int := 0;
begin
  perform private.require_perm('inventory.adjust');
  select * into s from public.stocktakes x where x.id = apply_stocktake.id for update;
  if s.id is null then raise exception using message = 'الجرد غير موجود.', errcode = 'P0001'; end if;
  if s.status <> 'draft' then raise exception using message = 'الجرد مطبّق سابقاً.', errcode = 'P0001'; end if;
  perform private.lock_variants(array(select x.variant_id from public.stocktake_items x where x.stocktake_id = s.id));
  for r in select x.variant_id, x.counted_qty from public.stocktake_items x
           where x.stocktake_id = s.id and x.counted_qty is not null order by x.variant_id loop
    -- الفرق عن الرصيد الحالي (يشمل أي بيع حدث أثناء العد)
    delta := r.counted_qty - private.qty_of(r.variant_id, s.warehouse_id);
    if delta <> 0 then
      perform private.apply_movement(r.variant_id, s.warehouse_id, delta, 'stocktake', null, 'stocktake', s.id, s.number);
      n := n + 1;
    end if;
  end loop;
  update public.stocktakes set status = 'applied', applied_at = now() where stocktakes.id = s.id;
  return jsonb_build_object('stocktake_id', s.id, 'number', s.number, 'status', 'applied', 'adjusted', n);
end $$;

-- سند مخزني يدوي: {kind:'in'|'out'|'sample_out'|'sample_return'|'damage', warehouse_id, customer_id?, reason, note?,
-- items:[{variant_id, qty, unit_cost?, lot_code?, expiry_date?}]} ← حركات manual_in/manual_out/sample_out/sample_return/damage
create or replace function public.post_stock_voucher(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.stock_voucher_kind := nullif(p ->> 'kind', '')::public.stock_voucher_kind;
  wid uuid := nullif(p ->> 'warehouse_id', '')::uuid;
  mk public.movement_kind;
  sign int;
  it jsonb;
  vid uuid;
  q numeric;
  sid uuid;
  num text;
begin
  perform private.require_perm('inventory.adjust');
  if k is null then raise exception using message = 'اختر نوع السند.', errcode = 'P0001'; end if;
  if nullif(btrim(p ->> 'reason'), '') is null then raise exception using message = 'اكتب سبب السند.', errcode = 'P0001'; end if;
  if not exists (select 1 from public.warehouses w where w.id = wid and w.is_active) then
    raise exception using message = 'اختر المخزن.', errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  mk := case k when 'in' then 'manual_in' when 'out' then 'manual_out' else k::text end::public.movement_kind;
  sign := case when k in ('in', 'sample_return') then 1 else -1 end;
  perform private.lock_variants(array(select distinct (x ->> 'variant_id')::uuid from jsonb_array_elements(p -> 'items') x));
  num := public.next_doc_number('stock_voucher');
  insert into public.stock_vouchers (number, kind, warehouse_id, customer_id, reason, note, created_by)
  values (num, k, wid, nullif(p ->> 'customer_id', '')::uuid, btrim(p ->> 'reason'), left(nullif(btrim(p ->> 'note'), ''), 500), auth.uid())
  returning id into sid;
  for it in select x from jsonb_array_elements(p -> 'items') x order by x ->> 'variant_id' loop
    vid := nullif(it ->> 'variant_id', '')::uuid;
    q := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if q <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    perform private.apply_movement(vid, wid, sign * q, mk,
      case when public.has_perm('costs.view') then nullif(it ->> 'unit_cost', '')::numeric end, 'voucher', sid, num,
      it ->> 'lot_code', nullif(it ->> 'expiry_date', '')::date);
    insert into public.stock_voucher_items (voucher_id, variant_id, qty, unit_cost, lot_code, expiry_date)
    values (sid, vid, q, case when public.has_perm('costs.view') then nullif(it ->> 'unit_cost', '')::numeric end,
      coalesce(nullif(btrim(it ->> 'lot_code'), ''), (select string_agg(l ->> 'lot_code', '، ') from jsonb_array_elements(private.last_lots()) l)),
      coalesce(nullif(it ->> 'expiry_date', '')::date, (select min((l ->> 'expiry_date')::date) from jsonb_array_elements(private.last_lots()) l)));
  end loop;
  return jsonb_build_object('voucher_id', sid, 'number', num, 'kind', k);
end $$;

revoke all on all functions in schema private from public;
