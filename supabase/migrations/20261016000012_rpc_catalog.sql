-- =============================================================================
-- رقيم — ١٢: دوال الكتالوج للموظفين: حفظ المنتج كاملاً، الأرشفة، الباركود الداخلي. آمن لإعادة التشغيل
-- =============================================================================

-- رقم التحقق GS1 (EAN-13/8, UPC) — مثل gs1CheckDigit في barcode.ts
create or replace function private.gs1_check_digit(body text) returns int
language sql immutable set search_path = '' as $$
  select (10 - (sum(substr(body, length(body) - i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10)::int) % 10
  from generate_series(0, length(body) - 1) i
$$;

-- منتج كامل للوحة: الصف + النسخ (مع الوحدات، والتكلفة لمن يملك costs.view) + الصور
create or replace function private.product_full(pid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) - 'search_text' || jsonb_build_object(
    'variants', coalesce((
      select jsonb_agg(to_jsonb(v) || jsonb_build_object(
        'units', coalesce((select jsonb_agg(to_jsonb(u) order by u.factor) from public.variant_units u where u.variant_id = v.id), '[]'::jsonb),
        'cost', case when public.has_perm('costs.view') then (select to_jsonb(c) from public.variant_costs c where c.variant_id = v.id) end
      ) order by v.sort, v.created_at)
      from public.product_variants v where v.product_id = p.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort, i.created_at) from public.product_images i where i.product_id = p.id), '[]'::jsonb))
  from public.products p where p.id = pid
$$;

create or replace function private.jtext_array(j jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case when j is null or jsonb_typeof(j) <> 'array' then '{}'::text[]
    else array(select btrim(x) from jsonb_array_elements_text(j) x where btrim(x) <> '') end
$$;

-- يحفظ المنتج + النسخ + الوحدات + الصور (+ التكلفة إن costs.view) + الرصيد الافتتاحي للنسخ الجديدة، في معاملة واحدة.
-- p: {id?, name, slug?, description, category_id, brand_id, unit, tags[], specs[], warranty, option_names[], track_serials,
--     track_expiry, is_published, is_featured, allow_request,
--     variants?: [{id?, title, options, sku, barcode, price, compare_at_price, wholesale_price, min_stock, image_key, weight_g,
--                  is_active, sort, cost?, opening?: [{warehouse_id, qty, lot_code?, expiry_date?}],
--                  units?: [{id?, unit_name, factor, barcode, price}]}],
--     images?: [{id?, key, alt, sort}]}
-- الحقول الغائبة في التعديل تبقى كما هي. النسخ الغائبة من القائمة: تُحذف إن لم يكن لها أثر، وإلا تُعطَّل. يعيد المنتج كاملاً.
create or replace function public.upsert_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := nullif(p ->> 'id', '')::uuid;
  cur public.products;
  v_name text;
  v_slug text;
  base_slug text;
  n int := 1;
  can_cost boolean := public.has_perm('costs.view');
  v jsonb;
  o jsonb;
  u jsonb;
  vid uuid;
  keep_variants uuid[] := '{}';
  keep_units uuid[];
  keep_images uuid[] := '{}';
  is_new_variant boolean;
  cname text;
  img jsonb;
  iid uuid;
  wid uuid;
begin
  perform private.require_perm('products.write');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using message = 'بيانات المنتج غير صالحة.', errcode = 'P0001';
  end if;
  if pid is not null then
    select * into cur from public.products where id = pid for update;
    if cur.id is null then
      raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
    end if;
  end if;
  v_name := coalesce(nullif(btrim(p ->> 'name'), ''), cur.name);
  if v_name is null then
    raise exception using message = 'اسم المنتج مطلوب.', errcode = 'P0001';
  end if;
  if (p ? 'category_id') and nullif(p ->> 'category_id', '') is not null
     and not exists (select 1 from public.categories c where c.id = (p ->> 'category_id')::uuid) then
    raise exception using message = 'القسم غير موجود.', errcode = 'P0001';
  end if;
  if (p ? 'brand_id') and nullif(p ->> 'brand_id', '') is not null
     and not exists (select 1 from public.brands b where b.id = (p ->> 'brand_id')::uuid) then
    raise exception using message = 'العلامة التجارية غير موجودة.', errcode = 'P0001';
  end if;

  -- slug فريد: من المدخل أو من الاسم (مثل slugify في shared) مع لاحقة -2، -3…
  base_slug := left(replace(public.normalize_ar(coalesce(nullif(btrim(p ->> 'slug'), ''), case when pid is null then v_name end, cur.slug)), ' ', '-'), 80);
  if base_slug = '' then base_slug := 'item'; end if;
  v_slug := base_slug;
  while exists (select 1 from public.products x where x.slug = v_slug and x.id is distinct from pid) loop
    n := n + 1;
    v_slug := base_slug || '-' || n;
  end loop;

  if pid is null then
    if not (p ? 'variants') or jsonb_typeof(p -> 'variants') <> 'array' or jsonb_array_length(p -> 'variants') = 0 then
      raise exception using message = 'أضف نسخة واحدة على الأقل (السعر و SKU).', errcode = 'P0001';
    end if;
    insert into public.products (name, slug, created_by) values (v_name, v_slug, auth.uid()) returning * into cur;
    pid := cur.id;
  end if;

  update public.products set
    name = v_name,
    slug = v_slug,
    description = case when p ? 'description' then nullif(btrim(p ->> 'description'), '') else description end,
    category_id = case when p ? 'category_id' then nullif(p ->> 'category_id', '')::uuid else category_id end,
    brand_id = case when p ? 'brand_id' then nullif(p ->> 'brand_id', '')::uuid else brand_id end,
    unit = case when p ? 'unit' then coalesce(nullif(btrim(p ->> 'unit'), ''), 'قطعة') else unit end,
    tags = case when p ? 'tags' then private.jtext_array(p -> 'tags') else tags end,
    specs = case when p ? 'specs' and jsonb_typeof(p -> 'specs') = 'array' then p -> 'specs' else specs end,
    warranty = case when p ? 'warranty' then nullif(btrim(p ->> 'warranty'), '') else warranty end,
    option_names = case when p ? 'option_names' then private.jtext_array(p -> 'option_names') else option_names end,
    track_serials = coalesce((p ->> 'track_serials')::boolean, track_serials),
    track_expiry = coalesce((p ->> 'track_expiry')::boolean, track_expiry),
    is_published = coalesce((p ->> 'is_published')::boolean, is_published),
    is_featured = coalesce((p ->> 'is_featured')::boolean, is_featured),
    allow_request = coalesce((p ->> 'allow_request')::boolean, allow_request)
  where id = pid;

  if p ? 'variants' then
    if jsonb_typeof(p -> 'variants') <> 'array' or jsonb_array_length(p -> 'variants') = 0 then
      raise exception using message = 'أضف نسخة واحدة على الأقل (السعر و SKU).', errcode = 'P0001';
    end if;
    for v in select * from jsonb_array_elements(p -> 'variants') loop
      vid := nullif(v ->> 'id', '')::uuid;
      is_new_variant := vid is null;
      if coalesce((v ->> 'price')::numeric, 0) < 0 or coalesce((v ->> 'compare_at_price')::numeric, 0) < 0
         or coalesce((v ->> 'wholesale_price')::numeric, 0) < 0 or coalesce((v ->> 'min_stock')::numeric, 0) < 0 then
        raise exception using message = 'الأسعار والكميات لا تكون سالبة.', errcode = 'P0001';
      end if;
      begin
        if is_new_variant then
          insert into public.product_variants (product_id, title, options, sku, barcode, price, compare_at_price, wholesale_price,
            min_stock, image_key, weight_g, is_active, sort)
          values (pid, coalesce(nullif(btrim(v ->> 'title'), ''), 'افتراضي'), coalesce(v -> 'options', '{}'::jsonb),
            coalesce(nullif(upper(btrim(v ->> 'sku')), ''), 'SKU-' || lpad(nextval('private.sku_seq')::text, 6, '0')),
            nullif(btrim(v ->> 'barcode'), ''), coalesce((v ->> 'price')::numeric, 0), (v ->> 'compare_at_price')::numeric,
            (v ->> 'wholesale_price')::numeric, coalesce((v ->> 'min_stock')::numeric, 0), nullif(v ->> 'image_key', ''),
            (v ->> 'weight_g')::int, coalesce((v ->> 'is_active')::boolean, true), coalesce((v ->> 'sort')::int, 0))
          returning id into vid;
        else
          update public.product_variants set
            title = case when v ? 'title' then coalesce(nullif(btrim(v ->> 'title'), ''), 'افتراضي') else title end,
            options = case when v ? 'options' then coalesce(v -> 'options', '{}'::jsonb) else options end,
            sku = case when v ? 'sku' and nullif(btrim(v ->> 'sku'), '') is not null then upper(btrim(v ->> 'sku')) else sku end,
            barcode = case when v ? 'barcode' then nullif(btrim(v ->> 'barcode'), '') else barcode end,
            price = coalesce((v ->> 'price')::numeric, price),
            compare_at_price = case when v ? 'compare_at_price' then (v ->> 'compare_at_price')::numeric else compare_at_price end,
            wholesale_price = case when v ? 'wholesale_price' then (v ->> 'wholesale_price')::numeric else wholesale_price end,
            min_stock = coalesce((v ->> 'min_stock')::numeric, min_stock),
            image_key = case when v ? 'image_key' then nullif(v ->> 'image_key', '') else image_key end,
            weight_g = case when v ? 'weight_g' then (v ->> 'weight_g')::int else weight_g end,
            is_active = coalesce((v ->> 'is_active')::boolean, is_active),
            sort = coalesce((v ->> 'sort')::int, sort)
          where id = vid and product_id = pid;
          if not found then
            raise exception using message = 'نسخة المنتج غير موجودة.', errcode = 'P0001';
          end if;
        end if;
      exception when unique_violation then
        get stacked diagnostics cname = constraint_name;
        raise exception using errcode = 'P0001', message = case when cname like '%barcode%'
          then 'الباركود مستعمل لمنتج آخر: ' || coalesce(v ->> 'barcode', '') else 'رمز SKU مستعمل لمنتج آخر: ' || coalesce(v ->> 'sku', '') end;
      end;
      keep_variants := keep_variants || vid;

      if can_cost and (v ? 'cost') and nullif(v ->> 'cost', '') is not null then
        if (v ->> 'cost')::numeric < 0 then
          raise exception using message = 'التكلفة لا تكون سالبة.', errcode = 'P0001';
        end if;
        insert into public.variant_costs (variant_id, avg_cost, last_cost) values (vid, (v ->> 'cost')::numeric, (v ->> 'cost')::numeric)
        on conflict (variant_id) do update set avg_cost = excluded.avg_cost, last_cost = excluded.last_cost;
      end if;

      -- الرصيد الافتتاحي للنسخ الجديدة فقط (التعديل لاحقاً عبر adjust_stock)
      if is_new_variant then
        if jsonb_typeof(v -> 'opening') = 'array' then
          for o in select * from jsonb_array_elements(v -> 'opening') loop
            if coalesce((o ->> 'qty')::numeric, 0) > 0 then
              perform private.apply_movement(vid, (o ->> 'warehouse_id')::uuid, (o ->> 'qty')::numeric, 'opening',
                case when can_cost then (v ->> 'cost')::numeric end, 'adjustment', null, 'رصيد افتتاحي',
                o ->> 'lot_code', nullif(o ->> 'expiry_date', '')::date);
            end if;
          end loop;
        elsif coalesce((v ->> 'opening_qty')::numeric, 0) > 0 then
          wid := coalesce(nullif(v ->> 'opening_warehouse_id', '')::uuid,
            (select w.id from public.warehouses w where w.is_default and w.is_active limit 1));
          perform private.apply_movement(vid, wid, (v ->> 'opening_qty')::numeric, 'opening',
            case when can_cost then (v ->> 'cost')::numeric end, 'adjustment', null, 'رصيد افتتاحي');
        end if;
      end if;

      if jsonb_typeof(v -> 'units') = 'array' then
        keep_units := '{}';
        for u in select * from jsonb_array_elements(v -> 'units') loop
          if coalesce((u ->> 'factor')::numeric, 0) <= 0 or nullif(btrim(u ->> 'unit_name'), '') is null then
            raise exception using message = 'وحدة التعبئة تحتاج اسماً وعدد قطع أكبر من صفر.', errcode = 'P0001';
          end if;
          iid := null;
          begin
            if nullif(u ->> 'id', '') is null then
              insert into public.variant_units (variant_id, unit_name, factor, barcode, price)
              values (vid, btrim(u ->> 'unit_name'), (u ->> 'factor')::numeric, nullif(btrim(u ->> 'barcode'), ''), (u ->> 'price')::numeric)
              returning id into iid;
            else
              update public.variant_units set unit_name = btrim(u ->> 'unit_name'), factor = (u ->> 'factor')::numeric,
                barcode = nullif(btrim(u ->> 'barcode'), ''), price = (u ->> 'price')::numeric
              where id = (u ->> 'id')::uuid and variant_id = vid returning id into iid;
            end if;
          exception when unique_violation then
            raise exception using message = 'باركود الوحدة مستعمل مسبقاً: ' || coalesce(u ->> 'barcode', ''), errcode = 'P0001';
          end;
          if iid is not null then keep_units := keep_units || iid; end if;
        end loop;
        delete from public.variant_units where variant_id = vid and not (id = any (keep_units));
      end if;
    end loop;

    -- النسخ المحذوفة من النموذج: حذف إن لم يكن لها أثر، وإلا تعطيل
    update public.product_variants x set is_active = false
    where x.product_id = pid and not (x.id = any (keep_variants)) and x.is_active
      and (exists (select 1 from public.stock_movements m where m.variant_id = x.id)
        or exists (select 1 from public.order_items oi where oi.variant_id = x.id)
        or exists (select 1 from public.invoice_items ii where ii.variant_id = x.id)
        or exists (select 1 from public.quotation_items qi where qi.variant_id = x.id)
        or exists (select 1 from public.transfer_items ti where ti.variant_id = x.id)
        or exists (select 1 from public.stocktake_items si where si.variant_id = x.id));
    delete from public.product_variants x
    where x.product_id = pid and not (x.id = any (keep_variants))
      and not exists (select 1 from public.stock_movements m where m.variant_id = x.id)
      and not exists (select 1 from public.order_items oi where oi.variant_id = x.id)
      and not exists (select 1 from public.invoice_items ii where ii.variant_id = x.id)
      and not exists (select 1 from public.quotation_items qi where qi.variant_id = x.id)
      and not exists (select 1 from public.transfer_items ti where ti.variant_id = x.id)
      and not exists (select 1 from public.stocktake_items si where si.variant_id = x.id);
  end if;

  if jsonb_typeof(p -> 'images') = 'array' then
    for img in select * from jsonb_array_elements(p -> 'images') loop
      if nullif(btrim(img ->> 'key'), '') is null then continue; end if;
      iid := null;
      if nullif(img ->> 'id', '') is not null then
        update public.product_images set key = img ->> 'key', alt = nullif(btrim(img ->> 'alt'), ''), sort = coalesce((img ->> 'sort')::int, 0)
        where id = (img ->> 'id')::uuid and product_id = pid returning id into iid;
      else
        insert into public.product_images (product_id, key, alt, sort)
        values (pid, img ->> 'key', nullif(btrim(img ->> 'alt'), ''), coalesce((img ->> 'sort')::int, 0)) returning id into iid;
      end if;
      if iid is not null then keep_images := keep_images || iid; end if;
    end loop;
    delete from public.product_images where product_id = pid and not (id = any (keep_images));
  end if;

  update public.products set has_variants = (cardinality(option_names) > 0
    or (select count(*) from public.product_variants x where x.product_id = pid and x.is_active) > 1)
  where id = pid;

  return private.product_full(pid);
end $$;

-- أرشفة (يختفي من المتجر، لا يُحذف أبداً) واسترجاع
create or replace function public.archive_product(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.products;
begin
  perform private.require_perm('products.delete');
  update public.products p set archived_at = coalesce(p.archived_at, now()), is_published = false
  where p.id = archive_product.id returning * into r;
  if r.id is null then
    raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
  end if;
  delete from public.cart_items ci where ci.variant_id in (select v.id from public.product_variants v where v.product_id = r.id);
  return jsonb_build_object('id', r.id, 'archived_at', r.archived_at);
end $$;

create or replace function public.restore_product(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.products;
begin
  perform private.require_perm('products.delete');
  update public.products p set archived_at = null where p.id = restore_product.id returning * into r;
  if r.id is null then
    raise exception using message = 'المنتج غير موجود.', errcode = 'P0001';
  end if;
  return jsonb_build_object('id', r.id, 'archived_at', null, 'is_published', r.is_published);
end $$;

-- باركود داخلي EAN-13 تالٍ (2 + 0 + تسلسل ١٠ أرقام + رقم التحقق) — مثل internalEan13 في barcode.ts، ولا يتكرر
create or replace function public.next_barcode() returns text
language plpgsql security definer set search_path = '' as $$
declare
  body text;
  code text;
begin
  perform private.require_perm('products.write');
  loop
    body := '20' || lpad(nextval('private.barcode_seq')::text, 10, '0');
    code := body || private.gs1_check_digit(body)::text;
    exit when not exists (select 1 from public.product_variants v where v.barcode = code)
      and not exists (select 1 from public.variant_units u where u.barcode = code);
  end loop;
  return code;
end $$;

revoke all on all functions in schema private from public;
revoke all on function public.upsert_product(jsonb), public.archive_product(uuid), public.restore_product(uuid), public.next_barcode()
  from public, anon;
grant execute on function public.upsert_product(jsonb), public.archive_product(uuid), public.restore_product(uuid), public.next_barcode()
  to authenticated, service_role;
