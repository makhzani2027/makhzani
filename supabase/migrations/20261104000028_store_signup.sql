-- =============================================================================
-- رقيم — ٢٨: تسجيل المتاجر الجديدة وموافقة مدير المنصة. آمن لإعادة التشغيل.
--
-- ١) صاحب المتجر ينشئ حساباً (بريد + كلمة سر) ثم request_store: اسم الشركة، الرابط، الهاتف، المحافظة، الشعار.
--    يصبح مالك متجر «بانتظار الموافقة» ولا يملك أي صلاحية حتى الموافقة.
-- ٢) مدير المنصة (مالك المتجر ١) يوافق: approve_store يجهّز المتجر كاملاً (فرع، مخزن رئيسي، صناديق،
--    زبون نقدي، أدوار الموظفين، عدادات المستندات، مناطق التوصيل، الإعدادات، أقسام الرئيسية).
--    أو يرفض/يوقف متجراً (set_store_status).
-- ٣) الصلاحيات تعمل فقط لمتجر فعّال: متجر موقوف أو بانتظار الموافقة = لا وصول للوحة.
-- ٤) login_email: الدخول برقم الهاتف (يحوّل الرقم لبريد الحساب)، يُستدعى من دالة الخادم فقط.
-- =============================================================================

-- الصلاحيات: موظف فعّال في متجر فعّال
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.stores s on s.id = p.store_id
    where p.id = auth.uid() and p.kind = 'staff' and p.status = 'active' and s.status = 'active'
  )
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles pr
    join public.stores s on s.id = pr.store_id
    left join public.staff_roles r on r.id = pr.role_id and r.store_id = pr.store_id
    where pr.id = auth.uid()
      and pr.kind = 'staff'
      and pr.status = 'active'
      and s.status = 'active'
      and (pr.is_owner or p = any (coalesce(r.permissions, '{}')))
  ) and private.aal_ok()
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_platform_admin and p.status = 'active') and private.aal_ok()
$$;

-- رابط المتجر من الاسم أو المدخل: حروف لاتينية صغيرة وأرقام وشرطة
create or replace function private.clean_slug(t text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'))
$$;

-- رقم هاتف عراقي بصيغة واحدة 07XXXXXXXXX (يقبل +964 و 964 و 7XXXXXXXXX)
create or replace function private.norm_phone(t text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g');
begin
  if d like '00964%' then d := substr(d, 6);
  elsif d like '964%' then d := substr(d, 4); end if;
  if d like '0%' then d := substr(d, 2); end if;
  if d ~ '^7[0-9]{9}$' then return '0' || d; end if;
  return null;
end $$;

-- ---------------------------------------------------------------- طلب متجر جديد
create or replace function public.request_store(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
  nm text := btrim(coalesce(p ->> 'name', ''));
  sl text := private.clean_slug(coalesce(nullif(btrim(p ->> 'slug'), ''), p ->> 'name'));
  ph text := private.norm_phone(p ->> 'phone');
  v_name text := nullif(btrim(p ->> 'full_name'), '');
  s public.stores;
begin
  if uid is null then raise exception using message = 'سجّل الدخول أولاً.', errcode = 'P0001'; end if;
  select * into me from public.profiles where id = uid for update;
  if me.id is null then raise exception using message = 'الحساب غير موجود.', errcode = 'P0001'; end if;
  if me.kind = 'staff' and me.store_id <> private.store1() then
    select * into s from public.stores where id = me.store_id;
    if me.is_owner and s.status in ('pending', 'rejected') then
      -- تعديل طلب سابق (قبل الموافقة أو بعد الرفض)
      null;
    else
      raise exception using message = 'حسابك مرتبط بمتجر مسبقاً.', errcode = 'P0001';
    end if;
  elsif me.kind = 'staff' then
    raise exception using message = 'هذا حساب موظف في متجر قائم. أنشئ حساباً جديداً لمتجرك.', errcode = 'P0001';
  end if;
  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception using message = 'اكتب اسم الشركة (حرفان على الأقل).', errcode = 'P0001'; end if;
  if sl is null or sl !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then
    raise exception using message = 'اكتب رابطاً للمتجر بالأحرف الإنجليزية والأرقام (٣ أحرف على الأقل)، مثل: alhulool', errcode = 'P0001';
  end if;
  if sl in ('raqeem', 'admin', 'dashboard', 'api', 'app', 'www', 'store', 'stores', 's', 'login', 'signup', 'support', 'help') then
    raise exception using message = 'هذا الرابط محجوز، اختر غيره.', errcode = 'P0001';
  end if;
  if ph is null then raise exception using message = 'اكتب رقم هاتف عراقي صحيح، مثل 07701234567.', errcode = 'P0001'; end if;
  if exists (select 1 from public.stores x where x.slug = sl and x.id is distinct from s.id) then
    raise exception using message = 'هذا الرابط مستعمل لمتجر آخر، اختر غيره.', errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles x where x.phone = ph and x.id <> uid) then
    raise exception using message = 'رقم الهاتف مستعمل لحساب آخر.', errcode = 'P0001';
  end if;

  perform set_config('raqeem.store_admin', 'on', true);
  if s.id is null then
    insert into public.stores (slug, name, logo_key, phone, email, governorate, status, owner_id)
    values (sl, nm, nullif(p ->> 'logo_key', ''), ph, me.email, nullif(p ->> 'governorate', ''), 'pending', uid)
    returning * into s;
  else
    update public.stores set slug = sl, name = nm, logo_key = coalesce(nullif(p ->> 'logo_key', ''), logo_key), phone = ph,
      governorate = nullif(p ->> 'governorate', ''), status = 'pending', note = null
    where id = s.id returning * into s;
  end if;
  -- يصبح مالك المتجر (بلا صلاحيات حتى الموافقة لأن المتجر غير فعّال)
  update public.profiles set store_id = s.id, kind = 'staff', is_owner = true, status = 'active', role_id = null, onboarded = true,
    phone = ph, full_name = coalesce(v_name, public.profiles.full_name)
  where id = uid;
  perform set_config('raqeem.store_admin', '', true);
  return to_jsonb(s) - 'note';
end $$;

-- ---------------------------------------------------------------- تجهيز متجر جديد
create or replace function private.seed_store(sid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  st public.stores;
  br uuid;
  wh uuid;
begin
  select * into st from public.stores where id = sid;
  if exists (select 1 from public.warehouses where store_id = sid) then return; end if;  -- مُجهّز سابقاً
  perform set_config('raqeem.store_admin', 'on', true);

  insert into public.staff_roles (store_id, name, description, permissions, is_system)
  select sid, r.name, r.description, r.permissions, true from public.staff_roles r where r.store_id = private.store1() and r.is_system
  on conflict (store_id, name) do nothing;

  insert into public.branches (store_id, name, is_default) values (sid, 'الفرع الرئيسي', true) returning id into br;
  insert into public.warehouses (store_id, name, code, branch_id, is_default, is_sellable)
  values (sid, 'المخزن الرئيسي', 'MAIN', br, true, true) returning id into wh;
  insert into public.money_accounts (store_id, name, kind, currency, branch_id, is_default) values
    (sid, 'الصندوق الرئيسي', 'cash', 'IQD', br, true),
    (sid, 'صندوق الدولار', 'cash', 'USD', br, false);
  insert into public.customers (store_id, name, is_cash_customer) values (sid, 'زبون نقدي', true);
  insert into public.doc_counters (store_id, kind, last_value)
  select sid, k, 0 from unnest(array['sale', 'sale_return', 'purchase', 'purchase_return', 'order', 'receipt', 'voucher', 'request',
    'transfer', 'stocktake', 'quotation', 'stock_voucher', 'account_transfer']) k
  on conflict (store_id, kind) do nothing;

  -- مناطق التوصيل: كل المحافظات، ومحافظة المتجر وحدها مفعّلة
  insert into public.delivery_zones (store_id, governorate, fee, eta_text, is_active, sort)
  select sid, z.governorate, z.fee, z.eta_text, z.governorate = coalesce(st.governorate, 'baghdad'), z.sort
  from public.delivery_zones z where z.store_id = private.store1()
  on conflict (store_id, governorate) do nothing;

  -- الإعدادات: نسخة من الافتراضي باسم المتجر وهاتفه، والمخزن الافتراضي مخزنه
  insert into public.app_settings (store_id, key, value, is_public) values
    (sid, 'store', jsonb_build_object('name', st.name, 'legal_name', null, 'phone', st.phone, 'whatsapp', st.phone, 'email', st.email,
      'city', null, 'address', null, 'map_url', null, 'hours', null, 'socials', '{}'::jsonb, 'currency', 'IQD', 'digits', 'arab',
      'logo_key', st.logo_key), true),
    (sid, 'checkout', jsonb_build_object('cod_enabled', true, 'office_enabled', true, 'online_enabled', false, 'pickup_enabled', true,
      'min_order_total', 0, 'free_delivery_over', null, 'office_instructions', null), true),
    (sid, 'inventory', jsonb_build_object('allow_negative_stock', false, 'default_warehouse_id', wh, 'low_stock_default', 3), false),
    (sid, 'invoice', jsonb_build_object('receipt_width', 80, 'show_logo', true, 'header_note', null, 'footer_note', 'شكراً لتسوقكم من ' || st.name,
      'return_policy', null, 'show_qr', true, 'label_size', jsonb_build_object('width_mm', 50, 'height_mm', 30)), false),
    (sid, 'app', jsonb_build_object('min_version', 1, 'latest_version', 1, 'maintenance', false, 'maintenance_message', null,
      'play_store_url', null, 'apk_url', null), true),
    (sid, 'currency', jsonb_build_object('base', 'IQD', 'usd_enabled', true, 'usd_rate', coalesce(
      (select (value ->> 'usd_rate')::numeric from public.app_settings where store_id = private.store1() and key = 'currency'), 1310),
      'usd_rate_updated_at', null), false),
    (sid, 'pos', jsonb_build_object('auto_print', true, 'require_cash_session', false, 'late_order_minutes', 30), false)
  on conflict (store_id, key) do nothing;

  insert into public.home_sections (store_id, title, kind, max_items, sort)
  select sid, s.title, s.kind::public.home_section_kind, 10, s.sort
  from (values ('عروض اليوم', 'on_sale', 1), ('الأكثر مبيعاً', 'best_sellers', 2), ('وصل حديثاً', 'new', 3), ('مختارات لك', 'featured', 4)) s(title, kind, sort);
  perform set_config('raqeem.store_admin', '', true);
end $$;

-- ---------------------------------------------------------------- إدارة المنصة
create or replace function public.platform_stores() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception using message = 'لا تملك صلاحية هذه العملية.', errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'owner_name', o.full_name, 'owner_email', o.email,
      'products', (select count(*) from public.products x where x.store_id = s.id and x.archived_at is null),
      'invoices', (select count(*) from public.invoices x where x.store_id = s.id),
      'staff', (select count(*) from public.profiles x where x.store_id = s.id and x.kind = 'staff'))
    order by (s.status = 'pending') desc, s.created_at desc)
    from public.stores s left join public.profiles o on o.id = s.owner_id), '[]'::jsonb);
end $$;

create or replace function public.set_store_status(id uuid, status text, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.stores;
begin
  if not private.is_platform_admin() then raise exception using message = 'لا تملك صلاحية هذه العملية.', errcode = 'P0001'; end if;
  if set_store_status.status not in ('active', 'suspended', 'rejected') then
    raise exception using message = 'حالة غير صالحة.', errcode = 'P0001';
  end if;
  select * into s from public.stores x where x.id = set_store_status.id for update;
  if s.id is null then raise exception using message = 'المتجر غير موجود.', errcode = 'P0001'; end if;
  if s.id = private.store1() and set_store_status.status <> 'active' then
    raise exception using message = 'لا يمكن إيقاف المتجر الرئيسي.', errcode = 'P0001';
  end if;
  if set_store_status.status = 'rejected' and s.status not in ('pending', 'rejected') then
    raise exception using message = 'الرفض للطلبات الجديدة فقط؛ استعمل الإيقاف للمتجر العامل.', errcode = 'P0001';
  end if;
  if set_store_status.status = 'active' then perform private.seed_store(s.id); end if;
  update public.stores x set status = set_store_status.status, note = nullif(btrim(set_store_status.note), ''),
    approved_at = case when set_store_status.status = 'active' then coalesce(x.approved_at, now()) else x.approved_at end
  where x.id = s.id returning * into s;
  return to_jsonb(s);
end $$;

-- ---------------------------------------------------------------- الدخول برقم الهاتف (لدالة الخادم فقط)
create or replace function public.login_email(phone text) returns text
language sql stable security definer set search_path = '' as $$
  select p.email from public.profiles p where p.phone = private.norm_phone(login_email.phone) and p.email is not null limit 1
$$;

-- حالة متجري (للوحة: بانتظار الموافقة / مرفوض / موقوف)
create or replace function public.my_store() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object('is_owner', p.is_owner, 'is_platform_admin', p.is_platform_admin)
  from public.profiles p join public.stores s on s.id = p.store_id where p.id = auth.uid()
$$;

revoke all on function public.request_store(jsonb) from public, anon;
grant execute on function public.request_store(jsonb) to authenticated;
revoke all on function public.platform_stores() from public, anon;
grant execute on function public.platform_stores() to authenticated;
revoke all on function public.set_store_status(uuid, text, text) from public, anon;
grant execute on function public.set_store_status(uuid, text, text) to authenticated;
revoke all on function public.my_store() from public, anon;
grant execute on function public.my_store() to authenticated;
revoke all on function public.login_email(text) from public, anon, authenticated;
grant execute on function public.login_email(text) to service_role;
revoke all on function private.seed_store(uuid) from public;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to raqeem_fn;

select private.sync_fn_owners();
