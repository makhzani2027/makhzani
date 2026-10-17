-- =============================================================================
-- رقيم — ١١: دوال الزبون (authenticated): الطلب، الإلغاء، إكمال البيانات، حذف الحساب، طلب توفير، التقييم، الإشعارات
-- كل شيء يُحسب ويُتحقق منه هنا: الزبون قد يستدعي الدوال مباشرة بقيم مصطنعة. آمن لإعادة التشغيل
-- =============================================================================

-- الهاتف العراقي ← +9647XXXXXXXXX أو null — مثل normalizeIraqiPhone في format.ts
create or replace function private.normalize_iq_phone(input text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  s text;
begin
  if input is null then return null; end if;
  s := regexp_replace(translate(input, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9+]', '', 'g');
  if left(s, 1) = '+' then s := substr(s, 2); end if;
  if left(s, 2) = '00' then s := substr(s, 3); end if;
  if left(s, 3) = '964' then s := substr(s, 4); end if;
  if left(s, 1) = '0' then s := substr(s, 2); end if;
  if s !~ '^7[3-9][0-9]{8}$' then return null; end if;
  return '+964' || s;
end $$;

-- مفاتيح المحافظات من iraq.ts
create or replace function private.is_governorate(k text) returns boolean
language sql immutable set search_path = '' as $$
  select k = any (array['baghdad', 'basra', 'nineveh', 'erbil', 'sulaymaniyah', 'duhok', 'kirkuk', 'anbar', 'babil', 'karbala',
    'najaf', 'wasit', 'maysan', 'dhi_qar', 'muthanna', 'qadisiyah', 'salahuddin', 'diyala', 'halabja'])
$$;

-- إلغاء طلب (للزبون والموظف): يحرر الحجز ويعيد الكوبون ويلغي محاولات الدفع المعلّقة
create or replace function private.cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order;
  perform private.release_order(p_order);
  update public.coupons c set used_count = greatest(c.used_count - 1, 0)
    where c.id in (select r.coupon_id from public.coupon_redemptions r where r.order_id = p_order);
  delete from public.coupon_redemptions where order_id = p_order;
  update public.payment_transactions set status = 'cancelled' where order_id = p_order and status in ('created', 'pending');
  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(p_reason), ''),
    payment_status = case when payment_status = 'pending' then 'unpaid' else payment_status end
  where id = p_order;
  insert into public.order_events (order_id, status, note, is_customer_visible, actor_id)
  values (p_order, 'cancelled', case when o.payment_status = 'paid'
    then concat_ws(' — ', nullif(btrim(p_reason), ''), 'المبلغ المدفوع إلكترونياً يُعاد لك') else nullif(btrim(p_reason), '') end,
    true, auth.uid());
end $$;

-- ينشئ الطلب بأسعار الخادم ويحجز المخزون. يعيد {order_id, number, total, status, payment_method}
create or replace function public.place_order(
  items jsonb, address_id uuid default null, fulfillment text default 'delivery', payment_method text default 'cod',
  coupon_code text default null, note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pr public.profiles;
  cust uuid;
  chk jsonb := private.setting('checkout');
  inv jsonb := private.setting('inventory');
  a public.addresses;
  q jsonb;
  l jsonb;
  oid uuid;
  num text;
  wh uuid;
  cid uuid;
begin
  if uid is null then
    raise exception using message = 'سجّل الدخول لإتمام الطلب.', errcode = 'P0001';
  end if;
  select * into pr from public.profiles where id = uid;
  if pr.id is null or pr.status <> 'active' then
    raise exception using message = 'حسابك موقوف، تواصل مع المتجر.', errcode = 'P0001';
  end if;
  cust := public.my_customer_id();
  if not pr.onboarded or cust is null or pr.phone is null then
    raise exception using message = 'أكمل بياناتك أولاً (الاسم ورقم الهاتف).', errcode = 'P0001';
  end if;
  if fulfillment is null or fulfillment not in ('delivery', 'pickup') then
    raise exception using message = 'طريقة الاستلام غير صالحة.', errcode = 'P0001';
  end if;
  if payment_method is null or payment_method not in ('cod', 'office', 'online') then
    raise exception using message = 'طريقة الدفع غير صالحة.', errcode = 'P0001';
  end if;
  if not coalesce((chk ->> (payment_method || '_enabled'))::boolean, false) then
    raise exception using message = 'طريقة الدفع هذه غير متاحة حالياً.', errcode = 'P0001';
  end if;
  if fulfillment = 'pickup' and not coalesce((chk ->> 'pickup_enabled')::boolean, false) then
    raise exception using message = 'الاستلام من المكتب غير متاح حالياً.', errcode = 'P0001';
  end if;
  if fulfillment = 'pickup' and payment_method = 'cod' then
    raise exception using message = 'الدفع عند الاستلام للتوصيل فقط؛ اختر الدفع في المكتب.', errcode = 'P0001';
  end if;
  if fulfillment = 'delivery' then
    select * into a from public.addresses x where x.id = place_order.address_id and x.profile_id = uid;
    if a.id is null then
      raise exception using message = 'اختر عنوان التوصيل.', errcode = 'P0001';
    end if;
  end if;
  -- حماية من حجز المخزون بطلبات وهمية كثيرة
  if (select count(*) from public.orders o where o.profile_id = uid and o.status = 'pending') >= 5 then
    raise exception using message = 'لديك طلبات كثيرة بانتظار التأكيد. انتظر تأكيدها أو ألغِ بعضها.', errcode = 'P0001';
  end if;

  -- قفل الكوبون قبل التسعير: استخدامان متزامنان لا يتجاوزان الحد
  if nullif(btrim(coupon_code), '') is not null then
    perform 1 from public.coupons c where c.code = upper(btrim(place_order.coupon_code)) for update;
  end if;

  q := private.quote(items, a.governorate, coupon_code, uid, fulfillment = 'pickup');
  for l in select * from jsonb_array_elements(q -> 'lines') loop
    if not (l ->> 'ok')::boolean then
      if not exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id
                     where v.id = (l ->> 'variant_id')::uuid and v.is_active and p.is_published and p.archived_at is null) then
        raise exception using message = 'منتج في السلة لم يعد متوفراً للبيع. حدّث السلة.', errcode = 'P0001';
      end if;
      raise exception using errcode = 'P0001', message = format('الكمية المطلوبة من «%s» غير متوفرة — المتوفر %s',
        private.variant_label((l ->> 'variant_id')::uuid), private.fmt_qty((l ->> 'available_qty')::numeric));
    end if;
  end loop;
  if q ->> 'delivery_error' is not null then
    raise exception using message = q ->> 'delivery_error', errcode = 'P0001';
  end if;
  if nullif(btrim(coupon_code), '') is not null and q ->> 'coupon_error' is not null then
    raise exception using message = q ->> 'coupon_error', errcode = 'P0001';
  end if;
  if (q ->> 'subtotal')::numeric < (q ->> 'min_order_total')::numeric then
    raise exception using errcode = 'P0001',
      message = 'أقل مبلغ للطلب ' || private.fmt_qty((q ->> 'min_order_total')::numeric) || ' دينار.';
  end if;

  wh := coalesce(
    (select w.id from public.warehouses w where w.id = nullif(inv ->> 'default_warehouse_id', '')::uuid and w.is_active and w.is_sellable),
    (select w.id from public.warehouses w where w.is_active and w.is_sellable order by w.is_default desc, w.code limit 1));
  if wh is null then
    raise exception using message = 'لا يوجد مخزن متاح للبيع أونلاين.', errcode = 'P0001';
  end if;

  num := public.next_doc_number('order');
  insert into public.orders (number, profile_id, customer_id, status, payment_method, payment_status, fulfillment, address,
    delivery_zone_id, warehouse_id, subtotal, discount, coupon_code, delivery_fee, total, customer_note)
  values (num, uid, cust, 'pending', payment_method::public.order_payment_method, 'unpaid', fulfillment::public.fulfillment,
    case when fulfillment = 'delivery' then jsonb_build_object('recipient_name', a.recipient_name, 'phone', a.phone,
      'governorate', a.governorate, 'city', a.city, 'area', a.area, 'street', a.street, 'landmark', a.landmark, 'lat', a.lat, 'lng', a.lng) end,
    nullif(q ->> '_zone_id', '')::uuid, wh, (q ->> 'subtotal')::numeric, (q ->> 'discount')::numeric, q ->> 'coupon_code',
    (q ->> 'delivery_fee')::numeric, (q ->> 'total')::numeric, left(nullif(btrim(note), ''), 500))
  returning id into oid;

  insert into public.order_items (order_id, product_id, variant_id, name, variant_title, sku, image_key, qty, unit_price, line_total)
  select oid, (x ->> 'product_id')::uuid, (x ->> 'variant_id')::uuid, x ->> 'name', x ->> 'variant_title', x ->> 'sku',
    x ->> 'image_key', (x ->> 'qty')::numeric, (x ->> 'unit_price')::numeric, (x ->> 'line_total')::numeric
  from jsonb_array_elements(q -> 'lines') x;

  -- الحجز بترتيب variant_id (البنود مرتبة) لتجنب الجمود
  for l in select * from jsonb_array_elements(q -> 'lines') loop
    perform private.reserve(oid, (l ->> 'variant_id')::uuid, (l ->> 'qty')::numeric, wh);
  end loop;

  cid := nullif(q ->> '_coupon_id', '')::uuid;
  if cid is not null then
    insert into public.coupon_redemptions (coupon_id, profile_id, order_id) values (cid, uid, oid);
    update public.coupons set used_count = used_count + 1 where id = cid;
  end if;

  delete from public.cart_items ci where ci.profile_id = uid
    and ci.variant_id in (select (x ->> 'variant_id')::uuid from jsonb_array_elements(q -> 'lines') x);

  insert into public.order_events (order_id, status, note, is_customer_visible, actor_id) values (oid, 'pending', null, true, uid);

  -- إشعار للموظفين المسؤولين عن الطلبات (واللوحة تسمع Realtime أيضاً)
  insert into public.notifications (profile_id, kind, title, body, data)
  select p.id, 'order', 'طلب جديد ' || num, 'المبلغ ' || private.fmt_qty((q ->> 'total')::numeric) || ' دينار',
    jsonb_build_object('order_id', oid, 'number', num, 'staff', true)
  from public.profiles p left join public.staff_roles r on r.id = p.role_id
  where p.kind = 'staff' and p.status = 'active' and (p.is_owner or 'orders.manage' = any (coalesce(r.permissions, '{}')));

  return jsonb_build_object('order_id', oid, 'number', num, 'total', (q ->> 'total')::numeric, 'status', 'pending',
    'payment_method', payment_method);
end $$;

-- الزبون يلغي طلبه قبل التجهيز فقط (customerCanCancel)
create or replace function public.cancel_my_order(order_id uuid, reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders x where x.id = cancel_my_order.order_id for update;
  if o.id is null or o.profile_id is distinct from auth.uid() or auth.uid() is null then
    raise exception using message = 'الطلب غير موجود.', errcode = 'P0001';
  end if;
  if o.status not in ('pending', 'confirmed') then
    raise exception using message = 'لا يمكن إلغاء الطلب بعد بدء تجهيزه. تواصل معنا.', errcode = 'P0001';
  end if;
  perform private.cancel_order(o.id, coalesce(nullif(btrim(reason), ''), 'ألغاه الزبون'));
  return jsonb_build_object('order_id', o.id, 'status', 'cancelled');
end $$;

-- إكمال البيانات بعد Google: الاسم، الهاتف (يُوحَّد ويُتحقق منه)، المحافظة ← onboarded + صف الزبون
create or replace function public.upsert_my_profile(full_name text, phone text, governorate text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ph text := private.normalize_iq_phone(phone);
  nm text := left(btrim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')), 80);
  pr public.profiles;
begin
  if uid is null then
    raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001';
  end if;
  if length(nm) < 2 then
    raise exception using message = 'اكتب الاسم كاملاً.', errcode = 'P0001';
  end if;
  if ph is null then
    raise exception using message = 'رقم الهاتف غير صحيح. اكتب رقماً عراقياً مثل 07701234567.', errcode = 'P0001';
  end if;
  if governorate is not null and not private.is_governorate(governorate) then
    raise exception using message = 'اختر المحافظة من القائمة.', errcode = 'P0001';
  end if;
  begin
    update public.profiles set full_name = nm, phone = ph, governorate = upsert_my_profile.governorate, onboarded = true
    where id = uid returning * into pr;
  exception when unique_violation then
    raise exception using message = 'رقم الهاتف مستعمل في حساب آخر.', errcode = 'P0001';
  end;
  if pr.id is null then
    raise exception using message = 'الحساب غير موجود.', errcode = 'P0001';
  end if;
  if pr.kind = 'customer' then
    -- لا نربط تلقائياً بزبون المحل بنفس الهاتف: الرقم غير موثَّق وقد يكشف حساب شخص آخر
    insert into public.customers (profile_id, name, phone, governorate)
    values (uid, nm, ph, upsert_my_profile.governorate)
    on conflict (profile_id) where profile_id is not null
    do update set name = excluded.name, phone = excluded.phone, governorate = excluded.governorate;
  end if;
  return to_jsonb(pr);
end $$;

-- حذف الحساب (شرط Google Play): يمسح البيانات الشخصية ويبقي الطلبات والفواتير مجهولة.
-- بعده يستدعي التطبيق دالة الخادم account لحذف مستخدم auth نفسه.
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pr public.profiles;
  oid uuid;
begin
  select * into pr from public.profiles where id = uid;
  if uid is null or pr.id is null then
    raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001';
  end if;
  if pr.kind <> 'customer' then
    raise exception using message = 'حسابات الموظفين تُحذف من لوحة التحكم.', errcode = 'P0001';
  end if;
  -- الطلبات المفتوحة تُلغى (يتحرر حجزها)
  for oid in select o.id from public.orders o where o.profile_id = uid and o.status in ('pending', 'confirmed', 'preparing', 'ready')
    order by o.id for update loop
    perform private.cancel_order(oid, 'حُذف الحساب');
  end loop;
  delete from public.addresses where profile_id = uid;
  delete from public.push_tokens where profile_id = uid;
  delete from public.cart_items where profile_id = uid;
  delete from public.favorites where profile_id = uid;
  delete from public.notifications where profile_id = uid;
  update public.orders set address = case when address is null then null else jsonb_build_object('governorate', address ->> 'governorate') end,
    customer_note = null where profile_id = uid;
  update public.product_requests set details = null, link_url = null, image_key = null where profile_id = uid;
  update public.customers set name = 'زبون محذوف', phone = null, phone2 = null, city = null, address = null, notes = null, tags = '{}'
    where profile_id = uid;
  update public.profiles set full_name = 'زبون محذوف', phone = null, email = null, avatar_key = null, prefs = '{}',
    governorate = null, status = 'blocked', onboarded = false where id = uid;
  return jsonb_build_object('ok', true, 'profile_id', uid);
end $$;

-- طلب توفير منتج غير موجود. image_key يجب أن يكون في مجلد الزبون: requests/<uid>/…
create or replace function public.create_product_request(
  title text, details text default null, image_key text default null, link_url text default null,
  qty numeric default 1, budget numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t text := left(btrim(coalesce(title, '')), 200);
  rid uuid;
  num text;
begin
  if uid is null then
    raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001';
  end if;
  if length(t) < 2 then
    raise exception using message = 'اكتب اسم المنتج المطلوب.', errcode = 'P0001';
  end if;
  if image_key is not null and image_key not like 'requests/' || uid::text || '/%' then
    raise exception using message = 'الصورة غير صالحة.', errcode = 'P0001';
  end if;
  if link_url is not null and btrim(link_url) <> '' and link_url !~* '^https?://[^\s]+$' then
    raise exception using message = 'الرابط غير صالح.', errcode = 'P0001';
  end if;
  if coalesce(qty, 1) <= 0 or coalesce(qty, 1) > 10000 or coalesce(budget, 0) < 0 then
    raise exception using message = 'الكمية أو الميزانية غير صحيحة.', errcode = 'P0001';
  end if;
  if (select count(*) from public.product_requests r where r.profile_id = uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception using message = 'وصلت للحد اليومي من الطلبات. حاول غداً.', errcode = 'P0001';
  end if;
  num := public.next_doc_number('request');
  insert into public.product_requests (number, profile_id, customer_id, title, details, image_key, link_url, qty, budget)
  values (num, uid, public.my_customer_id(), t, left(nullif(btrim(details), ''), 2000), image_key, nullif(btrim(link_url), ''),
    coalesce(qty, 1), budget)
  returning id into rid;
  return jsonb_build_object('id', rid, 'number', num, 'status', 'new');
end $$;

-- تقييم منتج: فقط بعد طلب مسلَّم يحويه (تقييم واحد لكل منتج يُحدَّث)
create or replace function public.submit_review(product_id uuid, rating int, comment text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  oid uuid;
  rid uuid;
begin
  if uid is null then
    raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001';
  end if;
  if rating is null or rating < 1 or rating > 5 then
    raise exception using message = 'التقييم من ١ إلى ٥.', errcode = 'P0001';
  end if;
  select o.id into oid from public.orders o join public.order_items oi on oi.order_id = o.id
  where o.profile_id = uid and o.status = 'delivered' and oi.product_id = submit_review.product_id
  order by o.delivered_at desc nulls last limit 1;
  if oid is null then
    raise exception using message = 'يمكنك تقييم المنتج بعد استلامه.', errcode = 'P0001';
  end if;
  insert into public.reviews (product_id, profile_id, order_id, rating, comment)
  values (submit_review.product_id, uid, oid, rating, left(nullif(btrim(comment), ''), 1000))
  on conflict (product_id, profile_id) do update set rating = excluded.rating, comment = excluded.comment, order_id = excluded.order_id
  returning id into rid;
  return jsonb_build_object('review_id', rid);
end $$;

-- متوسط التقييم وعدده من التقييمات الظاهرة (يتحدث عند الإضافة والإخفاء والإظهار)
create or replace function private.refresh_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(r.rating), 2) from public.reviews r where r.product_id = pid and r.is_visible), 0),
    rating_count = (select count(*) from public.reviews r where r.product_id = pid and r.is_visible)
  where p.id = pid;
  return null;
end $$;
drop trigger if exists refresh_rating on public.reviews;
create trigger refresh_rating after insert or delete or update of rating, is_visible on public.reviews
  for each row execute function private.refresh_rating();

-- يعلّم إشعاراتي مقروءة (ids = null ← الكل). يعيد العدد
create or replace function public.mark_notifications_read(ids uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set read_at = now()
  where profile_id = auth.uid() and read_at is null and (ids is null or id = any (ids));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on all functions in schema private from public;
revoke all on function public.place_order(jsonb, uuid, text, text, text, text), public.cancel_my_order(uuid, text),
  public.upsert_my_profile(text, text, text), public.delete_my_account(),
  public.create_product_request(text, text, text, text, numeric, numeric), public.submit_review(uuid, int, text),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.place_order(jsonb, uuid, text, text, text, text), public.cancel_my_order(uuid, text),
  public.upsert_my_profile(text, text, text), public.delete_my_account(),
  public.create_product_request(text, text, text, text, numeric, numeric), public.submit_review(uuid, int, text),
  public.mark_notifications_read(uuid[]) to authenticated, service_role;
