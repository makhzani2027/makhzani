-- =============================================================================
-- رقيم — ٢٦: تعديل عرض سعر قديم بعد تغيّر أسعار الكتالوج. آمن لإعادة التشغيل.
-- كان حفظ أي تعديل (ملاحظة، صلاحية، مميزات) على عرض قديم يُرفض بـ«لا تملك صلاحية» لمن لا يملك
-- pos.price_override، لأن اللوحة ترسل السعر المثبّت في العرض والخادم يقارنه بسعر اليوم.
-- الآن: السعر والخصم المحفوظان سابقاً في العرض نفسه (بنفس العملة) مقبولان بلا صلاحية؛
-- أي سعر جديد مختلف أو خصم أكبر ما زال يحتاج الصلاحية كما كان.
-- =============================================================================

create or replace function public.save_quotation(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
<<fn>>
declare
  qid uuid := nullif(p ->> 'id', '')::uuid;
  q public.quotations;
  cur public.currency_code := coalesce(nullif(p ->> 'currency', ''), 'IQD')::public.currency_code;
  rate numeric;
  rec record;
  it jsonb;
  v public.product_variants;
  pr public.products;
  tier public.price_tier;
  pz record;
  price numeric;
  qty numeric;
  disc numeric;
  lt numeric;
  subtotal numeric := 0;
  inv_disc numeric;
  st public.quotation_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.quotation_status;
  feats text[] := private.quotation_features(p);
  ttl text := left(nullif(btrim(p ->> 'title'), ''), 160);
  phone text := left(nullif(btrim(p ->> 'customer_phone'), ''), 40);
  -- أسعار وخصومات البنود المحفوظة سابقاً في هذا العرض (variant|tier ← السعر، الخصم)
  prev jsonb := '{}';
  prev_disc numeric := null;
  old jsonb;
begin
  perform private.require_perm('quotations.manage');
  if st = 'converted' then raise exception using message = 'التحويل لفاتورة عبر زر «تحويل لفاتورة».', errcode = 'P0001'; end if;
  -- تغيير الحالة فقط: {id, status} بلا بنود ← لا يُعاد التسعير ولا تُمس البنود
  if qid is not null and not (p ? 'items') and (p ? 'status') then
    select * into q from public.quotations x where x.id = qid for update;
    if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
    if q.status = 'converted' then raise exception using message = 'عرض السعر حُوّل لفاتورة ولا يُعدَّل.', errcode = 'P0001'; end if;
    update public.quotations set status = st where id = qid;
    return (select to_jsonb(x) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort, i.name)
              from public.quotation_items i where i.quotation_id = x.id), '[]'::jsonb))
            from public.quotations x where x.id = qid);
  end if;
  if not exists (select 1 from public.warehouses w where w.id = nullif(p ->> 'warehouse_id', '')::uuid and w.is_active) then
    raise exception using message = 'اختر المخزن.', errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception using message = 'أضف منتجاً واحداً على الأقل.', errcode = 'P0001';
  end if;
  if nullif(p ->> 'customer_id', '') is null and nullif(btrim(p ->> 'customer_name'), '') is null then
    raise exception using message = 'اختر الزبون أو اكتب اسمه.', errcode = 'P0001';
  end if;
  rate := private.doc_rate(p, cur);
  if qid is not null then
    select * into q from public.quotations x where x.id = qid for update;
    if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
    if q.status = 'converted' then raise exception using message = 'عرض السعر حُوّل لفاتورة ولا يُعدَّل.', errcode = 'P0001'; end if;
    -- السعر المثبّت سابقاً في العرض (بنفس العملة) يبقى مقبولاً بلا صلاحية تعديل الأسعار:
    -- الموظف يعدّل ملاحظة أو صلاحية عرض قديم بعد تغيّر سعر الكتالوج دون أن يُرفض الحفظ
    if q.currency = cur then
      select coalesce(jsonb_object_agg(i.variant_id::text || '|' || i.price_tier::text, jsonb_build_object('price', i.unit_price, 'disc', i.discount)), '{}')
        into prev from public.quotation_items i where i.quotation_id = qid;
      prev_disc := q.discount;
    end if;
    delete from public.quotation_items where quotation_id = qid;
    update public.quotations set customer_id = nullif(p ->> 'customer_id', '')::uuid, customer_name = nullif(btrim(p ->> 'customer_name'), ''),
      warehouse_id = (p ->> 'warehouse_id')::uuid, currency = cur, exchange_rate = rate, status = st,
      valid_until = nullif(p ->> 'valid_until', '')::date, note = left(nullif(btrim(p ->> 'note'), ''), 2000),
      title = case when p ? 'title' then ttl else q.title end,
      customer_phone = case when p ? 'customer_phone' then phone else q.customer_phone end,
      features = coalesce(feats, q.features)
    where id = qid;
  else
    insert into public.quotations (number, status, customer_id, customer_name, warehouse_id, currency, exchange_rate, valid_until, note,
      title, customer_phone, features, created_by)
    values (public.next_doc_number('quotation'), st, nullif(p ->> 'customer_id', '')::uuid, nullif(btrim(p ->> 'customer_name'), ''),
      (p ->> 'warehouse_id')::uuid, cur, rate, nullif(p ->> 'valid_until', '')::date, left(nullif(btrim(p ->> 'note'), ''), 2000),
      ttl, phone, coalesce(feats, '{}'), auth.uid())
    returning id into qid;
  end if;

  for rec in select t.x, t.n from jsonb_array_elements(p -> 'items') with ordinality t(x, n) loop
    it := rec.x;
    select * into v from public.product_variants x where x.id = nullif(it ->> 'variant_id', '')::uuid;
    select * into pr from public.products x where x.id = v.product_id;
    if v.id is null then raise exception using message = 'منتج غير موجود في العرض.', errcode = 'P0001'; end if;
    qty := coalesce(nullif(it ->> 'qty', '')::numeric, 0);
    if qty <= 0 then raise exception using message = 'الكمية يجب أن تكون أكبر من صفر.', errcode = 'P0001'; end if;
    tier := coalesce(nullif(it ->> 'price_tier', ''), 'retail')::public.price_tier;
    select * into pz from private.variant_price(v.id, tier, null, cur, rate);
    price := pz.unit_price;
    old := prev -> (v.id::text || '|' || tier::text);
    if nullif(it ->> 'unit_price', '') is not null and (it ->> 'unit_price')::numeric is distinct from price then
      if old is null or (it ->> 'unit_price')::numeric is distinct from (old ->> 'price')::numeric then
        perform private.require_perm('pos.price_override');
      end if;
      price := private.round_cur(greatest((it ->> 'unit_price')::numeric, 0), cur);
    end if;
    disc := least(greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0), price * qty);
    if disc > 0 and (old is null or disc > (old ->> 'disc')::numeric) then perform private.require_perm('pos.discount'); end if;
    lt := private.round_cur(price * qty - disc, cur);
    subtotal := subtotal + lt;
    insert into public.quotation_items (quotation_id, variant_id, name, variant_title, qty, unit_price, discount, line_total, price_tier, sort)
    values (qid, v.id, pr.name, nullif(v.title, 'افتراضي'), qty, price, private.round_cur(disc, cur), lt, tier, rec.n::int);
  end loop;
  subtotal := private.round_cur(subtotal, cur);
  inv_disc := private.round_cur(least(greatest(coalesce(nullif(p ->> 'discount', '')::numeric, 0), 0), subtotal), cur);
  if inv_disc > 0 and (prev_disc is null or inv_disc > prev_disc) then perform private.require_perm('pos.discount'); end if;
  update public.quotations set subtotal = fn.subtotal, discount = inv_disc, total = fn.subtotal - inv_disc where id = qid;
  return (select to_jsonb(x) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort, i.name)
            from public.quotation_items i where i.quotation_id = x.id), '[]'::jsonb))
          from public.quotations x where x.id = qid);
end $$;

