#!/usr/bin/env bash
# يبني SQL «تجربة جافة» لـ migrations جديدة على البيانات الحقيقية: كل شيء داخل معاملة تنتهي بخطأ مقصود
# فلا يُحفظ أي تغيير مهما حدث. يقارن قبل/بعد: محتوى كل جدول (بلا الأعمدة الجديدة) ونتائج تقارير المالك والزائر.
# الاستعمال: bash supabase/maintenance/dryrun.sh supabase/migrations/2026...27_x.sql ... > dry.sql
set -euo pipefail
cat <<'SQL'
begin;
create temporary table _dry_snap (phase text, k text, v text);
grant all on _dry_snap to public;

create or replace function pg_temp.snap(phase text) returns void language plpgsql as $f$
declare t text; v text; own uuid := (select id from public.profiles where is_owner order by created_at limit 1);
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('stores') order by 1 loop
    execute format($q$select count(*)::text || ':' || coalesce(md5(string_agg(x, '|' order by x)), '-')
      from (select (to_jsonb(t) - 'store_id' - 'is_platform_admin' - case when %L = 'profiles' then 'updated_at' else '' end)::text x from public.%I t) s$q$, t, t) into v;
    insert into _dry_snap values (phase, 'table:' || t, v);
  end loop;
  -- تقارير كما يراها المالك
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  insert into _dry_snap values (phase, 'owner:dashboard', public.dashboard_summary()::text);
  insert into _dry_snap values (phase, 'owner:low_stock', public.low_stock()::text);
  insert into _dry_snap values (phase, 'owner:valuation', public.inventory_valuation()::text);
  insert into _dry_snap values (phase, 'owner:stagnant', public.stagnant_products()::text);
  insert into _dry_snap values (phase, 'owner:products', (select count(*)::text from public.products));
  insert into _dry_snap values (phase, 'owner:stock', (select coalesce(sum(qty), 0)::text from public.stock_levels));
  insert into _dry_snap values (phase, 'owner:customers', (select count(*)::text from public.customers));
  insert into _dry_snap values (phase, 'owner:settings', (select string_agg(key || '=' || value::text, ',' order by key) from public.app_settings));
  insert into _dry_snap values (phase, 'owner:perm', public.has_perm('products.write')::text);
  reset role;
  -- كما يراها التطبيق الحالي (زائر بلا رابط)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  insert into _dry_snap values (phase, 'anon:home', public.store_home()::text);
  insert into _dry_snap values (phase, 'anon:products', (select count(*)::text from public.products));
  insert into _dry_snap values (phase, 'anon:settings', (select string_agg(key, ',' order by key) from public.app_settings));
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $f$;

select pg_temp.snap('before');
SQL
for f in "$@"; do echo "-- ===== $f"; cat "$f"; echo; done
cat <<'SQL'
reset role;
select pg_temp.snap('after');

-- اختبار كتابة بعد التغيير (يُلغى مع المعاملة): عرض سعر، بيع نقدي لقطعة، ثم إلغاء الفاتورة — كمالك المتجر ١
create temporary table _dry_smoke (k text, v text);
grant all on _dry_smoke to public;
do $f$
declare own uuid := (select id from public.profiles where is_owner order by created_at limit 1);
  wh uuid; vid uuid; r jsonb; q jsonb; inv uuid; before numeric; after numeric;
begin
  select (value ->> 'default_warehouse_id')::uuid into wh from public.app_settings where key = 'inventory' and store_id = private.store1();
  select s.variant_id into vid from public.stock_levels s join public.product_variants v on v.id = s.variant_id join public.products p on p.id = v.product_id
    where s.warehouse_id = wh and s.qty - s.reserved >= 1 and v.is_active and p.archived_at is null and not p.track_serials and not p.track_expiry limit 1;
  select qty into before from public.stock_levels where variant_id = vid and warehouse_id = wh;
  perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    q := public.save_quotation(jsonb_build_object('warehouse_id', wh, 'customer_name', 'تجربة', 'items', jsonb_build_array(jsonb_build_object('variant_id', vid, 'qty', 1))));
    insert into _dry_smoke values ('quotation', 'ok ' || (q ->> 'number'));
  exception when others then insert into _dry_smoke values ('quotation', 'ERR ' || sqlerrm); end;
  begin
    r := public.pos_checkout(jsonb_build_object('warehouse_id', wh, 'items', jsonb_build_array(jsonb_build_object('variant_id', vid, 'qty', 1)),
      'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 999999999))));
    inv := (r ->> 'invoice_id')::uuid;
    insert into _dry_smoke values ('sale', 'ok ' || (r ->> 'number'));
  exception when others then insert into _dry_smoke values ('sale', 'ERR ' || sqlerrm); end;
  begin
    if inv is not null then perform public.void_invoice(inv, 'تجربة'); insert into _dry_smoke values ('void', 'ok'); end if;
  exception when others then insert into _dry_smoke values ('void', 'ERR ' || sqlerrm); end;
  begin
    perform public.sellable_stock(); insert into _dry_smoke values ('sellable_stock', 'ok');
  exception when others then insert into _dry_smoke values ('sellable_stock', 'ERR ' || sqlerrm); end;
  reset role;
  select qty into after from public.stock_levels where variant_id = vid and warehouse_id = wh;
  insert into _dry_smoke values ('stock_restored_after_void', (before = after)::text);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.store_home(); insert into _dry_smoke values ('anon_home', 'ok');
  exception when others then insert into _dry_smoke values ('anon_home', 'ERR ' || sqlerrm); end;
  reset role;
end $f$;
do $f$
declare diff jsonb; extra jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('k', b.k, 'before', left(b.v, 200), 'after', left(a.v, 200))), '[]') into diff
  from _dry_snap b join _dry_snap a on a.k = b.k and a.phase = 'after' where b.phase = 'before' and a.v is distinct from b.v;
  extra := jsonb_build_object(
    'stores', (select jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'status', status)) from public.stores),
    'platform_admins', (select jsonb_agg(full_name) from public.profiles where is_platform_admin),
    'rows_not_store1', (select count(*) from public.products where store_id <> private.store1()),
    'fn_on_raqeem_fn', (select count(*) from pg_proc p where pg_get_userbyid(p.proowner) = 'raqeem_fn'),
    'checked', (select count(*) from _dry_snap where phase = 'after'),
    'smoke', (select jsonb_object_agg(k, v) from _dry_smoke));
  raise exception 'DRYRUN_RESULT %', jsonb_build_object('ok', jsonb_array_length(diff) = 0
    and not exists (select 1 from _dry_smoke where v like 'ERR%' or v = 'false'), 'diff', diff) || extra;
end $f$;
SQL
