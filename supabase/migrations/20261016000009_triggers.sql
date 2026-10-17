-- =============================================================================
-- رقيم — ٩: المشغّلات — إنشاء الملف الشخصي، حماية الحقول الحساسة، سجل العمليات،
-- إشعارات الطلب، إرسال الإشعارات (pg_net ← دالة push)، عدّاد المبيعات، Realtime. آمن لإعادة التشغيل
-- =============================================================================

-- مستخدم auth جديد ← ملف شخصي (زبون)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, kind)
  values (new.id, lower(new.email),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''), 'customer')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id and email is distinct from lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function private.handle_user_email();

-- حماية النوع والدور والمالك والحالة: لا يغيّرها إلا staff.manage (والمالك لا يُمس إلا من SQL)
-- الدوال الداخلية (security definer) ومفتاح الخادم تعمل بدور غير authenticated فتمر.
-- (security invoker عمداً: يحتاج current_user الحقيقي للمستدعي)
create or replace function private.protect_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user::text not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email or new.phone is distinct from old.phone
     or new.onboarded is distinct from old.onboarded then
    raise exception using message = 'هذه البيانات تتغير من شاشة إكمال البيانات فقط.', errcode = 'P0001';
  end if;
  if new.is_owner is distinct from old.is_owner then
    raise exception using message = 'تعيين صاحب المتجر يتم من دليل الإعداد فقط.', errcode = 'P0001';
  end if;
  if (new.kind, new.role_id, new.status) is distinct from (old.kind, old.role_id, old.status) then
    if not public.has_perm('staff.manage') then
      raise exception using message = 'لا تملك صلاحية تغيير نوع الحساب أو الدور أو الحالة.', errcode = 'P0001';
    end if;
    if old.is_owner then
      raise exception using message = 'لا يمكن تغيير دور أو حالة صاحب المتجر.', errcode = 'P0001';
    end if;
    if new.id = auth.uid() then
      raise exception using message = 'لا يمكنك تغيير دورك أو حالتك بنفسك.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function private.protect_profile();

-- سجل العمليات: من غيّر ماذا (الحقول المتغيرة فقط قبل/بعد)
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  noise text[] := array['updated_at', 'search_text', 'available_qty', 'sold_count', 'rating_avg', 'rating_count', 'cover_key', 'used_count'];
  o jsonb;
  n jsonb;
  od jsonb;
  nd jsonb;
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'profiles' then return null; end if; -- تسجيل الزبائن ليس عملية موظف
    n := to_jsonb(new) - noise;
    nd := n;
  elsif tg_op = 'DELETE' then
    o := to_jsonb(old) - noise;
    od := o;
  else
    o := to_jsonb(old) - noise;
    n := to_jsonb(new) - noise;
    if o = n then return null; end if;
    select jsonb_object_agg(e.key, e.value) into nd from jsonb_each(n) e where o -> e.key is distinct from e.value;
    select jsonb_object_agg(e.key, o -> e.key) into od from jsonb_each(n) e where o -> e.key is distinct from e.value;
    if tg_table_name = 'profiles' and not (nd ?| array['kind', 'role_id', 'status', 'is_owner']) then
      return null;
    end if;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values (auth.uid(), lower(tg_op), tg_table_name,
    coalesce(n ->> 'id', o ->> 'id', n ->> 'key', o ->> 'key', n ->> 'variant_id', o ->> 'variant_id'),
    jsonb_strip_nulls(jsonb_build_object('old', od, 'new', nd)));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['products', 'product_variants', 'variant_costs', 'categories', 'brands', 'warehouses', 'customers',
    'suppliers', 'coupons', 'banners', 'home_sections', 'staff_roles', 'profiles', 'app_settings', 'delivery_zones']
  loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()', t);
  end loop;
end $$;

-- حدث طلب ظاهر للزبون ← إشعار له
create or replace function private.notify_order_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  t text;
begin
  if not new.is_customer_visible then return null; end if;
  select * into o from public.orders where id = new.order_id;
  if o.profile_id is null then return null; end if;
  t := case new.status
    when 'pending' then 'استلمنا طلبك'
    when 'confirmed' then 'تم تأكيد طلبك'
    when 'preparing' then 'طلبك قيد التجهيز'
    when 'ready' then case when o.fulfillment = 'pickup' then 'طلبك جاهز للاستلام' else 'طلبك جاهز وسيخرج للتوصيل' end
    when 'out_for_delivery' then 'طلبك في الطريق إليك'
    when 'delivered' then case when o.fulfillment = 'pickup' then 'تم استلام طلبك' else 'تم تسليم طلبك' end
    when 'cancelled' then 'أُلغي طلبك'
    when 'returned' then 'تم إرجاع طلبك'
    else 'تحديث على طلبك' end;
  insert into public.notifications (profile_id, kind, title, body, data)
  values (o.profile_id, 'order', t, 'الطلب ' || o.number || coalesce(' — ' || nullif(btrim(new.note), ''), ''),
    jsonb_build_object('order_id', o.id, 'number', o.number, 'status', new.status));
  return null;
end $$;
drop trigger if exists notify_order_change on public.order_events;
create trigger notify_order_change after insert on public.order_events
  for each row execute function private.notify_order_change();

-- إشعار جديد ← دالة push عبر pg_net (الرابط والسر في private.settings؛ بلا إعداد = لا شيء)
-- إشعارات الحملات لا تُرسل فرداً فرداً: الحملة تُرسل لموضوع all مرة واحدة
create or replace function private.push_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hook_url text;
  hook_secret text;
begin
  if new.data ? 'campaign_id' then return new; end if;
  select value into hook_url from private.settings where key = 'push_url';
  select value into hook_secret from private.settings where key = 'push_secret';
  if hook_url is null or hook_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := hook_url,
    body := jsonb_build_object('type', 'INSERT', 'table', tg_table_name, 'schema', tg_table_schema, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', hook_secret),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- فشل الإرسال لا يمنع حفظ الإشعار أبداً
  return new;
end $$;
drop trigger if exists push_notifications on public.notifications;
create trigger push_notifications after insert on public.notifications
  for each row execute function private.push_hook();

-- عدّاد المبيعات المخزّن على المنتج (البيع يزيد، الإرجاع ينقص)
create or replace function private.bump_sold_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k public.invoice_kind;
begin
  select i.kind into k from public.invoices i where i.id = new.invoice_id;
  if k = 'sale' then
    update public.products set sold_count = sold_count + new.qty where id = new.product_id;
  elsif k = 'sale_return' then
    update public.products set sold_count = greatest(sold_count - new.qty, 0) where id = new.product_id;
  end if;
  return null;
end $$;
drop trigger if exists sold_count on public.invoice_items;
create trigger sold_count after insert on public.invoice_items
  for each row execute function private.bump_sold_count();

-- Realtime: اللوحة تشترك في orders (صوت الطلب الجديد) والتطبيق في order_events (الخط الزمني)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'order_events'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

revoke all on all functions in schema private from public;
