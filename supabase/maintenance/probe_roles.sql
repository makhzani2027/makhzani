-- فحص قراءة فقط: إمكانيات دور postgres (لتصميم عزل المتاجر)
select jsonb_build_object(
  'version', current_setting('server_version'),
  'current_user', current_user,
  'roles', (select jsonb_agg(jsonb_build_object('r', rolname, 'super', rolsuper, 'bypassrls', rolbypassrls, 'createrole', rolcreaterole)) from pg_roles where rolname in ('postgres','authenticated','anon','service_role','supabase_admin','authenticator')),
  'auth_usage_grant', has_schema_privilege('postgres', 'auth', 'USAGE WITH GRANT OPTION'),
  'auth_usage', has_schema_privilege('postgres', 'auth', 'USAGE'),
  'ext_owner', (select nspowner::regrole::text from pg_namespace where nspname = 'extensions'),
  'auth_owner', (select nspowner::regrole::text from pg_namespace where nspname = 'auth'),
  'memberships', (select jsonb_agg(jsonb_build_object('role', r.rolname, 'admin', m.admin_option)) from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = 'postgres'),
  'fn_owners', (select jsonb_object_agg(o, n) from (select p.proowner::regrole::text o, count(*) n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname in ('public','private') group by 1) x),
  'table_owners', (select jsonb_object_agg(o, n) from (select tableowner o, count(*) n from pg_tables where schemaname = 'public' group by 1) x),
  'uid_def', (select pg_get_functiondef('auth.uid()'::regprocedure))
) as probe;
