-- =============================================================================
-- رقيم — ٢٤: عروض الأسعار كعروض متكاملة (منظومات الطاقة وغيرها). آمن لإعادة التشغيل.
-- ١) عنوان العرض («منظومة طاقة شمسية ٥ ك.واط») وهاتف الزبون غير المسجّل.
-- ٢) مميزات العرض: قائمة نقاط تُطبع بارزة («تجهيزك بـ ١٠ أمبير نهاراً و٥ ليلاً»، الضمانات…).
-- ٣) ترتيب البنود كما أدخلها الموظف (كانت تعود مرتبة أبجدياً).
-- ٤) التحويل لفاتورة يحافظ على ترتيب البنود.
-- العملاء القدامى (نسخة لوحة لا ترسل الحقول الجديدة) لا يمسحون العنوان والمميزات عند الحفظ.
-- =============================================================================

alter table public.quotations add column if not exists title text;
alter table public.quotations add column if not exists customer_phone text;
alter table public.quotations add column if not exists features text[] not null default '{}';
alter table public.quotation_items add column if not exists sort int not null default 0;

do $$ begin
  alter table public.quotations add constraint quotations_title_len check (title is null or char_length(title) <= 160);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.quotations add constraint quotations_features_len check (coalesce(array_length(features, 1), 0) <= 40);
exception when duplicate_object then null; end $$;

create index if not exists quotation_items_sort_idx on public.quotation_items (quotation_id, sort);

-- مميزات من الطلب: نصوص غير فارغة، ٤٠ بنداً كحد أقصى، ٣٠٠ حرف للبند. null = المفتاح غير مرسل
create or replace function private.quotation_features(p jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p -> 'features') = 'array' then coalesce((
    select array_agg(left(btrim(t.x), 300) order by t.n)
    from jsonb_array_elements_text(p -> 'features') with ordinality t(x, n)
    where btrim(t.x) <> '' and t.n <= 40), '{}'::text[]) end
$$;

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
    if nullif(it ->> 'unit_price', '') is not null and (it ->> 'unit_price')::numeric is distinct from price then
      perform private.require_perm('pos.price_override');
      price := private.round_cur(greatest((it ->> 'unit_price')::numeric, 0), cur);
    end if;
    disc := least(greatest(coalesce(nullif(it ->> 'discount', '')::numeric, 0), 0), price * qty);
    if disc > 0 then perform private.require_perm('pos.discount'); end if;
    lt := private.round_cur(price * qty - disc, cur);
    subtotal := subtotal + lt;
    insert into public.quotation_items (quotation_id, variant_id, name, variant_title, qty, unit_price, discount, line_total, price_tier, sort)
    values (qid, v.id, pr.name, nullif(v.title, 'افتراضي'), qty, price, private.round_cur(disc, cur), lt, tier, rec.n::int);
  end loop;
  subtotal := private.round_cur(subtotal, cur);
  inv_disc := private.round_cur(least(greatest(coalesce(nullif(p ->> 'discount', '')::numeric, 0), 0), subtotal), cur);
  if inv_disc > 0 then perform private.require_perm('pos.discount'); end if;
  update public.quotations set subtotal = fn.subtotal, discount = inv_disc, total = fn.subtotal - inv_disc where id = qid;
  return (select to_jsonb(x) || jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort, i.name)
            from public.quotation_items i where i.quotation_id = x.id), '[]'::jsonb))
          from public.quotations x where x.id = qid);
end $$;

-- التحويل لفاتورة: نفس الدالة مع الحفاظ على ترتيب البنود
create or replace function public.convert_quotation(id uuid, payments jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotations;
  valid boolean;
  r jsonb;
begin
  perform private.require_perm('quotations.manage');
  select * into q from public.quotations x where x.id = convert_quotation.id for update;
  if q.id is null then raise exception using message = 'عرض السعر غير موجود.', errcode = 'P0001'; end if;
  if q.status in ('converted', 'cancelled') then
    raise exception using message = 'عرض السعر محوّل أو ملغى سابقاً.', errcode = 'P0001';
  end if;
  valid := q.valid_until is null or q.valid_until >= (now() at time zone 'Asia/Baghdad')::date;
  r := private.post_sale(jsonb_build_object(
    'warehouse_id', q.warehouse_id, 'customer_id', q.customer_id, 'currency', q.currency,
    'exchange_rate', case when valid and q.currency = 'USD' then q.exchange_rate end,
    'discount', q.discount, 'note', concat_ws(' — ', 'عرض السعر ' || q.number, q.note), 'payments', coalesce(payments, '[]'),
    'items', (select jsonb_agg(jsonb_build_object('variant_id', i.variant_id, 'qty', i.qty, 'discount', i.discount,
      'price_tier', i.price_tier, 'unit_price', case when valid then i.unit_price end) order by i.sort, i.name)
      from public.quotation_items i where i.quotation_id = q.id)
  ), 'manual', q.id, true);
  update public.quotations set status = 'converted', invoice_id = (r ->> 'invoice_id')::uuid where quotations.id = q.id;
  return r || jsonb_build_object('quotation_id', q.id);
end $$;

revoke all on function private.quotation_features(jsonb) from public;
