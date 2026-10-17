-- =============================================================================
-- رقيم — ١٠: دوال المتجر العامة (anon مسموح): التسعير من الخادم، البحث، الرئيسية، صفحة المنتج
-- التسعير مطابق لـ computeTotals في packages/shared/src/pricing.ts. آمن لإعادة التشغيل
-- =============================================================================

-- يتحقق من بنود السلة ويدمج المكرر: [{variant_id, qty}] ← صفوف (variant_id, qty)
create or replace function private.parse_items(items jsonb) returns table (variant_id uuid, qty numeric)
language plpgsql immutable set search_path = '' as $$
declare
  e jsonb;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception using message = 'السلة فارغة.', errcode = 'P0001';
  end if;
  if jsonb_array_length(items) > 100 then
    raise exception using message = 'عدد البنود كبير جداً (الحد ١٠٠).', errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(items) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'variant_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e -> 'qty') <> 'number'
       or (e ->> 'qty')::numeric <= 0 or (e ->> 'qty')::numeric > 1000
       or (e ->> 'qty')::numeric <> round((e ->> 'qty')::numeric, 3) then
      raise exception using message = 'بيانات السلة غير صالحة (المنتج أو الكمية).', errcode = 'P0001';
    end if;
  end loop;
  return query
    select (x ->> 'variant_id')::uuid, sum((x ->> 'qty')::numeric)
    from jsonb_array_elements(items) x group by 1 order by 1;
end $$;

-- خصم الكوبون — مثل couponDiscount في pricing.ts (يعيد المبلغ، التوصيل المجاني، الخطأ)
create or replace function private.coupon_discount(c public.coupons, subtotal numeric, out amount numeric, out free_delivery boolean, out error text)
language plpgsql stable set search_path = '' as $$
begin
  amount := 0; free_delivery := false; error := null;
  if subtotal < c.min_subtotal then
    error := 'لم يصل مجموع السلة للحد الأدنى لهذا الكوبون';
    return;
  end if;
  if c.kind = 'free_delivery' then
    free_delivery := true;
    return;
  end if;
  amount := case when c.kind = 'percent' then subtotal * least(greatest(c.value, 0), 100) / 100 else greatest(c.value, 0) end;
  if c.max_discount is not null then amount := least(amount, c.max_discount); end if;
  amount := private.round_money(least(amount, subtotal));
end $$;

-- التسعير الكامل للسلة (داخلي): يعيد CartQuote + حقول داخلية (coupon_id، zone_id، بيانات البنود)
-- p_governorate = null أو p_pickup = true ← بلا أجرة توصيل
create or replace function private.quote(p_items jsonb, p_governorate text, p_coupon text, p_profile uuid, p_pickup boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  chk jsonb := private.setting('checkout');
  lines jsonb := '[]'::jsonb;
  r record;
  v_sub numeric := 0;
  v_count numeric := 0;
  v_all_ok boolean := true;
  v_disc numeric := 0;
  v_free boolean := false;
  v_fee numeric := 0;
  v_cerr text;
  v_code text;
  v_derr text;
  v_zone uuid;
  v_min numeric := coalesce((chk ->> 'min_order_total')::numeric, 0);
  v_over numeric := (chk ->> 'free_delivery_over')::numeric;
  c public.coupons;
  cd record;
  lt numeric;
  v_ok boolean;
begin
  for r in
    select i.variant_id, i.qty, v.price, v.available_qty, v.product_id, v.title, v.sku, v.image_key,
      p.name, p.cover_key, (v.id is not null and v.is_active and p.is_published and p.archived_at is null) as sellable
    from private.parse_items(p_items) i
    left join public.product_variants v on v.id = i.variant_id
    left join public.products p on p.id = v.product_id
    order by i.variant_id
  loop
    lt := case when r.sellable then private.round_money(r.price * r.qty) else 0 end;
    v_ok := coalesce(r.sellable, false) and r.available_qty >= r.qty;
    v_all_ok := v_all_ok and v_ok;
    if r.sellable then
      v_sub := v_sub + lt;
      v_count := v_count + r.qty;
    end if;
    lines := lines || jsonb_build_object(
      'variant_id', r.variant_id, 'qty', r.qty,
      'unit_price', case when r.sellable then r.price else 0 end, 'line_total', lt,
      'available_qty', case when r.sellable then greatest(r.available_qty, 0) else 0 end, 'ok', v_ok,
      'product_id', r.product_id, 'name', r.name, 'variant_title', r.title, 'sku', r.sku,
      'image_key', coalesce(r.image_key, r.cover_key));
  end loop;
  v_sub := private.round_money(v_sub);

  if nullif(btrim(p_coupon), '') is not null then
    select * into c from public.coupons x where x.code = upper(btrim(p_coupon));
    if c.id is null or not c.is_active then
      v_cerr := 'الكوبون غير صالح';
    elsif c.starts_at is not null and c.starts_at > now() then
      v_cerr := 'الكوبون لم يبدأ بعد';
    elsif c.ends_at is not null and c.ends_at <= now() then
      v_cerr := 'انتهت صلاحية الكوبون';
    elsif c.usage_limit is not null and c.used_count >= c.usage_limit then
      v_cerr := 'نفدت مرات استخدام هذا الكوبون';
    elsif c.per_customer_limit is not null and p_profile is not null and
      (select count(*) from public.coupon_redemptions cr where cr.coupon_id = c.id and cr.profile_id = p_profile) >= c.per_customer_limit then
      v_cerr := 'استخدمت هذا الكوبون من قبل';
    else
      select * into cd from private.coupon_discount(c, v_sub);
      v_disc := cd.amount;
      v_free := cd.free_delivery;
      v_cerr := cd.error;
      if v_cerr is null then v_code := c.code; end if;
    end if;
  end if;

  if not coalesce(p_pickup, false) and p_governorate is not null then
    select z.id, z.fee into v_zone, v_fee from public.delivery_zones z where z.governorate = p_governorate and z.is_active;
    if v_zone is null then
      v_derr := 'التوصيل غير متاح لهذه المحافظة حالياً';
      v_fee := 0;
    end if;
  end if;
  v_fee := greatest(coalesce(v_fee, 0), 0);
  if v_free then v_fee := 0; end if;
  if v_over is not null and v_sub - v_disc >= v_over then v_fee := 0; end if;
  v_fee := private.round_money(v_fee);

  return jsonb_build_object(
    'lines', lines,
    'subtotal', v_sub,
    'discount', v_disc,
    'delivery_fee', v_fee,
    'total', private.round_money(v_sub - v_disc + v_fee),
    'coupon_code', v_code,
    'coupon_error', v_cerr,
    'min_order_total', v_min,
    'ok', v_all_ok and v_sub >= v_min and v_derr is null,
    'delivery_error', v_derr,
    'items_count', v_count,
    '_coupon_id', case when v_code is not null then c.id end,
    '_zone_id', v_zone);
end $$;

-- CartQuote (types.ts) + delivery_error + items_count. governorate = null ← استلام من المكتب (بلا أجرة)
create or replace function public.quote_cart(items jsonb, governorate text default null, coupon_code text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q jsonb;
begin
  q := private.quote(items, governorate, coupon_code, auth.uid(), governorate is null);
  q := q - '_coupon_id' - '_zone_id';
  return jsonb_set(q, '{lines}', coalesce((
    select jsonb_agg(jsonb_build_object('variant_id', l -> 'variant_id', 'qty', l -> 'qty', 'unit_price', l -> 'unit_price',
      'line_total', l -> 'line_total', 'available_qty', l -> 'available_qty', 'ok', l -> 'ok'))
    from jsonb_array_elements(q -> 'lines') l), '[]'::jsonb));
end $$;

-- بطاقة منتج للقوائم (بلا تكلفة ولا سعر جملة)
create or replace function private.product_card(pid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'slug', p.slug, 'cover_key', p.cover_key,
    'category_id', p.category_id, 'brand_id', p.brand_id, 'brand_name', b.name,
    'price_min', a.price_min, 'price_max', a.price_max,
    'compare_at_price', case when a.cmp > a.price_min then a.cmp end,
    'available_qty', greatest(a.avail, 0), 'in_stock', a.avail > 0,
    'rating_avg', p.rating_avg, 'rating_count', p.rating_count, 'sold_count', p.sold_count,
    'is_featured', p.is_featured, 'allow_request', p.allow_request, 'has_variants', p.has_variants,
    'variants_count', a.n, 'default_variant_id', case when a.n = 1 then a.first_id end, 'created_at', p.created_at)
  from public.products p
  left join public.brands b on b.id = p.brand_id
  cross join lateral (
    select min(v.price) as price_min, max(v.price) as price_max, coalesce(sum(v.available_qty), 0) as avail, count(*) as n,
      (array_agg(v.compare_at_price order by v.price, v.sort))[1] as cmp, (array_agg(v.id order by v.sort, v.created_at))[1] as first_id
    from public.product_variants v where v.product_id = p.id and v.is_active
  ) a
  where p.id = pid
$$;

-- البحث في المتجر. يعيد {total, items: [بطاقة]}. sort: relevance | newest | price_asc | price_desc | best
create or replace function public.store_search(
  q text default null, category uuid default null, brand uuid default null, min_price numeric default null,
  max_price numeric default null, in_stock boolean default false, sort text default 'relevance', lim int default 24, off int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  nq text := public.normalize_ar(q);
  toks text[] := case when public.normalize_ar(q) = '' then '{}'::text[] else string_to_array(public.normalize_ar(q), ' ') end;
  raw text := lower(btrim(coalesce(q, '')));
  v_lim int := least(greatest(coalesce(lim, 24), 1), 60);
  v_off int := greatest(coalesce(off, 0), 0);
  res jsonb;
begin
  with base as (
    select p.id, p.created_at, p.sold_count, p.search_text,
      a.price_min, a.avail,
      exists (select 1 from public.product_variants v2 where v2.product_id = p.id and v2.is_active
              and (lower(v2.sku) = raw or v2.barcode = raw)) as code_hit
    from public.products p
    cross join lateral (
      select min(v.price) as price_min, coalesce(sum(v.available_qty), 0) as avail
      from public.product_variants v where v.product_id = p.id and v.is_active
    ) a
    where p.is_published and p.archived_at is null and a.price_min is not null
      and (store_search.category is null or p.category_id = store_search.category
           or p.category_id in (select c.id from public.categories c where c.parent_id = store_search.category))
      and (store_search.brand is null or p.brand_id = store_search.brand)
  ), hits as (
    select b.*, count(*) over () as total_count,
      case when nq = '' then 0 else extensions.similarity(b.search_text, nq) end as sim
    from base b
    where (raw = '' or b.code_hit or (cardinality(toks) > 0 and not exists (
            select 1 from unnest(toks) t where b.search_text not like '%' || t || '%')))
      and (min_price is null or b.price_min >= min_price)
      and (max_price is null or b.price_min <= max_price)
      and (not coalesce(in_stock, false) or b.avail > 0)
    order by
      case when sort = 'newest' then extract(epoch from b.created_at) end desc nulls last,
      case when sort = 'price_asc' then b.price_min end asc nulls last,
      case when sort = 'price_desc' then b.price_min end desc nulls last,
      case when sort = 'best' then b.sold_count end desc nulls last,
      b.code_hit desc, sim desc, (b.avail > 0) desc, b.sold_count desc, b.created_at desc, b.id
    limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', coalesce(max(h.total_count), 0),
    'items', coalesce(jsonb_agg(private.product_card(h.id) order by h.ord), '[]'::jsonb))
  into res
  from (select hits.*, row_number() over () as ord from hits) h;
  if (res ->> 'total')::int = 0 and v_off > 0 then
    -- صفحة بعد النهاية: العدد الكلي يبقى صحيحاً
    select jsonb_set(res, '{total}', to_jsonb(count(*))) into res
    from public.products p where p.is_published and p.archived_at is null and false;
  end if;
  return res;
end $$;

-- منتجات قسم من أقسام الرئيسية حسب نوعه
create or replace function private.section_products(s public.home_sections) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.product_card(x.id) order by x.ord), '[]'::jsonb)
  from (
    select p.id, row_number() over (order by
      case when s.kind = 'manual' then array_position(s.product_ids, p.id) end,
      case when s.kind = 'best_sellers' then p.sold_count end desc nulls last,
      case when s.kind = 'on_sale' then (select max((v.compare_at_price - v.price) / nullif(v.compare_at_price, 0))
        from public.product_variants v where v.product_id = p.id and v.is_active) end desc nulls last,
      p.created_at desc) as ord
    from public.products p
    where p.is_published and p.archived_at is null
      and exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active)
      and case s.kind
        when 'featured' then p.is_featured
        when 'new' then true
        when 'best_sellers' then p.sold_count > 0
        when 'on_sale' then exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active
                                    and v.compare_at_price > v.price)
        when 'category' then p.category_id = s.category_id
          or p.category_id in (select c.id from public.categories c where c.parent_id = s.category_id)
        when 'brand' then p.brand_id = s.brand_id
        when 'manual' then p.id = any (s.product_ids)
        else false end
    order by 2
    limit s.max_items
  ) x
$$;

-- الرئيسية في استدعاء واحد: {banners, categories, sections: [{id,title,kind,category_id,brand_id,products}]}
create or replace function public.store_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'banners', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'image_key', b.image_key,
        'link_kind', b.link_kind, 'link_value', b.link_value, 'placement', b.placement, 'sort', b.sort) order by b.placement, b.sort, b.created_at)
      from public.banners b
      where b.is_active and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now())), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'name', c.name, 'slug', c.slug,
        'image_key', c.image_key, 'icon', c.icon, 'sort', c.sort) order by c.parent_id nulls first, c.sort, c.name)
      from public.categories c where c.is_visible), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'category_id', x.category_id,
        'brand_id', x.brand_id, 'products', x.products) order by x.sort, x.created_at)
      from (select s.*, private.section_products(s) as products from public.home_sections s where s.is_active) x
      where jsonb_array_length(x.products) > 0), '[]'::jsonb))
$$;

-- صفحة المنتج: {product, variants, images, brand, category, reviews, similar} أو null إن لم يكن منشوراً
create or replace function public.store_product(slug_or_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.products;
begin
  if slug_or_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into p from public.products x where x.id = slug_or_id::uuid;
  else
    select * into p from public.products x where x.slug = slug_or_id;
  end if;
  if p.id is null or not p.is_published or p.archived_at is not null then
    return null;
  end if;
  return jsonb_build_object(
    'product', to_jsonb(p) - 'created_by' - 'search_text',
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'options', v.options, 'sku', v.sku, 'barcode', v.barcode,
        'price', v.price, 'compare_at_price', v.compare_at_price, 'image_key', v.image_key,
        'available_qty', greatest(v.available_qty, 0), 'weight_g', v.weight_g, 'sort', v.sort) order by v.sort, v.created_at)
      from public.product_variants v where v.product_id = p.id and v.is_active), '[]'::jsonb),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'key', i.key, 'alt', i.alt, 'sort', i.sort) order by i.sort, i.created_at)
      from public.product_images i where i.product_id = p.id), '[]'::jsonb),
    'brand', (select jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'logo_key', b.logo_key)
      from public.brands b where b.id = p.brand_id),
    'category', (select jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'parent_id', c.parent_id)
      from public.categories c where c.id = p.category_id),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
        'author', r.author) order by r.created_at desc)
      from (select rv.*, coalesce(split_part(nullif(btrim(pr.full_name), ''), ' ', 1), 'زبون') as author
            from public.reviews rv left join public.profiles pr on pr.id = rv.profile_id
            where rv.product_id = p.id and rv.is_visible order by rv.created_at desc limit 10) r), '[]'::jsonb),
    'similar', coalesce((
      select jsonb_agg(private.product_card(s.id) order by s.sold_count desc, s.created_at desc)
      from (select x.id, x.sold_count, x.created_at from public.products x
            where x.id <> p.id and x.is_published and x.archived_at is null
              and ((p.category_id is not null and x.category_id = p.category_id) or (p.category_id is null and x.brand_id = p.brand_id))
              and exists (select 1 from public.product_variants v where v.product_id = x.id and v.is_active)
            order by x.sold_count desc, x.created_at desc limit 8) s), '[]'::jsonb));
end $$;

revoke all on all functions in schema private from public;
revoke all on function public.quote_cart(jsonb, text, text), public.store_search(text, uuid, uuid, numeric, numeric, boolean, text, int, int),
  public.store_home(), public.store_product(text) from public;
grant execute on function public.quote_cart(jsonb, text, text), public.store_search(text, uuid, uuid, numeric, numeric, boolean, text, int, int),
  public.store_home(), public.store_product(text) to anon, authenticated, service_role;
