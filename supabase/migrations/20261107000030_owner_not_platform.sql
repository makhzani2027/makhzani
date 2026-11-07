-- =============================================================================
-- صاحب المتجر الأول متجر عادي: make_owner لا يمنح إدارة منصة رقيم بعد الآن.
-- إدارة المنصة (الموافقة على المتاجر، موقع رقيم، مدراء المنصة) لحساب صاحب رقيم ومن يضيفهم فقط.
-- لا يغيّر أي حساب قائم.
-- وإصلاح أمني: لا يستطيع أي مستخدم منح نفسه أو غيره إدارة المنصة بتعديل ملفه (protect_profile).
-- =============================================================================
create or replace function public.make_owner(email text, full_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(make_owner.email)) limit 1;
  if uid is null then
    raise exception using message = 'لا يوجد مستخدم بهذا البريد. أنشئه أولاً من Authentication ← Users.', errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name, kind, is_owner, status, onboarded, store_id)
  values (uid, lower(btrim(make_owner.email)), nullif(btrim(make_owner.full_name), ''), 'staff', true, 'active', true, private.store1())
  on conflict (id) do update set kind = 'staff', is_owner = true, status = 'active', onboarded = true,
    full_name = coalesce(nullif(btrim(make_owner.full_name), ''), public.profiles.full_name),
    email = coalesce(public.profiles.email, excluded.email);
  return uid;
end $$;
revoke all on function public.make_owner(text, text) from public;
do $$ begin
  revoke all on function public.make_owner(text, text) from anon, authenticated;
exception when undefined_object then null; end $$;

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
  -- إدارة منصة رقيم: تُمنح من الخادم فقط (دالة platform بمفتاح الخادم أو Platform Admin)، لا من أي حساب
  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception using message = 'إدارة المنصة تُمنح من حساب صاحب رقيم فقط.', errcode = 'P0001';
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

select private.sync_fn_owners();
