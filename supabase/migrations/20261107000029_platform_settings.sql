-- =============================================================================
-- إعدادات منصة رقيم (الموقع التعريفي العام): بيانات التواصل وغيرها
--  • جدول عام للمنصة، ليس لأي متجر (بلا store_id): يقرؤه الجميع (الموقع يعرضه).
--  • التعديل لمدير المنصة وحده عبر set_platform_setting — لا يستطيع أي صاحب متجر،
--    ولا مالك المتجر الأول، تغيير الموقع التعريفي من إعدادات متجره.
--  • أول تشغيل: نسخ بيانات التواصل الحالية من المتجر ١ حتى لا يتغير الموقع فجأة.
-- =============================================================================

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant select, insert, update on public.platform_settings to raqeem_fn;

drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (true);
drop policy if exists platform_settings_write on public.platform_settings;
create policy platform_settings_write on public.platform_settings for all to raqeem_fn
  using (private.is_platform_admin()) with check (private.is_platform_admin());

-- مدير المنصة فقط. contact: الهاتف، واتساب، البريد، العنوان، الدوام، الخريطة، حسابات التواصل
create or replace function public.set_platform_setting(key text, value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb := coalesce(set_platform_setting.value, '{}'::jsonb);
begin
  if not private.is_platform_admin() then raise exception using message = 'لا تملك صلاحية هذه العملية.', errcode = 'P0001'; end if;
  if set_platform_setting.key not in ('contact') then raise exception using message = 'إعداد غير معروف.', errcode = 'P0001'; end if;
  if jsonb_typeof(v) <> 'object' then raise exception using message = 'قيمة غير صالحة.', errcode = 'P0001'; end if;
  if set_platform_setting.key = 'contact' then
    -- حقول معروفة فقط، نصوص قصيرة
    select coalesce(jsonb_object_agg(k, to_jsonb(left(btrim(x), 300))), '{}'::jsonb) into v
    from jsonb_each_text(v - 'socials') as e(k, x)
    where k in ('phone', 'whatsapp', 'email', 'address', 'city', 'hours', 'map_url') and btrim(coalesce(x, '')) <> '';
    v := v || jsonb_build_object('socials', coalesce((
      select jsonb_object_agg(k, to_jsonb(left(btrim(x), 300)))
      from jsonb_each_text(case when jsonb_typeof(set_platform_setting.value -> 'socials') = 'object' then set_platform_setting.value -> 'socials' else '{}'::jsonb end) as e(k, x)
      where k in ('instagram', 'facebook', 'tiktok', 'telegram') and btrim(coalesce(x, '')) ~ '^https://'), '{}'::jsonb));
  end if;
  insert into public.platform_settings as t (key, value, updated_at, updated_by)
  values (set_platform_setting.key, v, now(), auth.uid())
  on conflict on constraint platform_settings_pkey do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return v;
end $$;
revoke all on function public.set_platform_setting(text, jsonb) from public, anon;
grant execute on function public.set_platform_setting(text, jsonb) to authenticated;

-- البداية: نفس بيانات التواصل المعروضة الآن (من المتجر ١)
insert into public.platform_settings (key, value)
select 'contact', coalesce((
  select jsonb_strip_nulls(jsonb_build_object(
    'phone', s.value ->> 'phone', 'whatsapp', s.value ->> 'whatsapp', 'email', s.value ->> 'email',
    'address', s.value ->> 'address', 'city', s.value ->> 'city', 'hours', s.value ->> 'hours',
    'map_url', s.value ->> 'map_url', 'socials', coalesce(s.value -> 'socials', '{}'::jsonb)))
  from public.app_settings s where s.key = 'store' and s.store_id = private.store1()), '{}'::jsonb)
on conflict (key) do nothing;

select private.sync_fn_owners();
