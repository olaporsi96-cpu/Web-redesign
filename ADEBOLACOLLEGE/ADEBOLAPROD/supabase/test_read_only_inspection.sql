-- Run only in the Adebola College TEST project's Supabase SQL Editor.
-- Every executable statement in this file is read-only and returns schema metadata only.
-- Execute each SELECT separately and retain every result grid. If the editor
-- shows only one result set, a single statement may have been selected/run.

-- 1. Check whether Supabase's migration ledger is available and inspect its columns.
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

-- If the ledger query above confirms this table exists and it has a "version" column,
-- run this optional read-only comparison with local migration versions:
-- with expected_migrations(version, migration_file) as (
--   values
--     ('20261101000100', '20261101000100_initial_portal_schema.sql'),
--     ('20261103000100', '20261103000100_atomic_result_save.sql'),
--     ('20261104000100', '20261104000100_admin_rbac.sql'),
--     ('20261104000300', '20261104000300_student_invites.sql'),
--     ('20261105000100', '20261105000100_course_learning_payments.sql'),
--     ('20261106000100', '20261106000100_release_permission_dependency.sql')
-- )
-- select
--   expected_migrations.version,
--   expected_migrations.migration_file,
--   exists (
--     select 1
--     from supabase_migrations.schema_migrations as applied
--     where applied.version::text = expected_migrations.version
--   ) as applied
-- from expected_migrations
-- order by expected_migrations.version;

-- 2. Compare the E-Learning/payment tables and required columns with the local schema.
with required_columns(table_name, column_name) as (
  values
    ('profiles', 'id'),
    ('profiles', 'role'),
    ('profiles', 'admin_enabled'),
    ('students', 'id'),
    ('students', 'profile_id'),
    ('students', 'is_active'),
    ('course_catalogue_settings', 'category'),
    ('course_catalogue_settings', 'code_prefix'),
    ('course_catalogue_settings', 'code_start'),
    ('course_catalogue_settings', 'code_end'),
    ('course_catalogue_settings', 'updated_at'),
    ('course_catalogue_settings', 'updated_by'),
    ('course_payment_settings', 'id'),
    ('course_payment_settings', 'bank_name'),
    ('course_payment_settings', 'account_name'),
    ('course_payment_settings', 'account_number'),
    ('course_payment_settings', 'updated_at'),
    ('course_payment_settings', 'updated_by'),
    ('courses', 'id'),
    ('courses', 'title'),
    ('courses', 'category'),
    ('courses', 'description'),
    ('courses', 'price'),
    ('courses', 'status'),
    ('courses', 'created_by'),
    ('courses', 'created_at'),
    ('courses', 'updated_at'),
    ('lessons', 'id'),
    ('lessons', 'course_id'),
    ('lessons', 'title'),
    ('lessons', 'lesson_code'),
    ('lessons', 'status'),
    ('lessons', 'created_by'),
    ('lessons', 'created_at'),
    ('lessons', 'updated_at'),
    ('course_materials', 'id'),
    ('course_materials', 'course_id'),
    ('course_materials', 'lesson_id'),
    ('course_materials', 'storage_path'),
    ('course_materials', 'file_name'),
    ('course_materials', 'mime_type'),
    ('course_materials', 'updated_at'),
    ('course_materials', 'updated_by'),
    ('course_access', 'profile_id'),
    ('course_access', 'course_id'),
    ('course_access', 'granted_by'),
    ('course_access', 'grant_source'),
    ('course_access', 'order_id'),
    ('course_access', 'granted_at'),
    ('course_orders', 'id'),
    ('course_orders', 'profile_id'),
    ('course_orders', 'course_id'),
    ('course_orders', 'amount'),
    ('course_orders', 'payment_reference'),
    ('course_orders', 'proof_path'),
    ('course_orders', 'status'),
    ('course_orders', 'decision_note'),
    ('course_orders', 'reviewed_by'),
    ('course_orders', 'reviewed_at'),
    ('course_orders', 'created_at')
)
select
  required_columns.table_name,
  required_columns.column_name,
  case
    when columns.column_name is null then 'MISSING'
    else 'present'
  end as observed
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
  and columns.table_name = required_columns.table_name
  and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

-- 3. Check required RPC signatures, security-definer status, and execution grants.
with required_functions(signature) as (
  values
    ('public.is_main_admin()'),
    ('public.is_active_student_profile()'),
    ('public.has_admin_permission(text)'),
    ('public.has_course_access(uuid)'),
    ('public.save_course(uuid,text,text,text,numeric,text)'),
    ('public.archive_course(uuid)'),
    ('public.save_lesson(uuid,uuid,text,text,text)'),
    ('public.archive_lesson(uuid)'),
    ('public.save_course_catalogue_settings(jsonb)'),
    ('public.save_course_payment_settings(text,text,text)'),
    ('public.save_course_material(uuid,text,text,text)'),
    ('public.remove_course_material(uuid)'),
    ('public.submit_course_order(uuid,text,text)'),
    ('public.review_course_order(uuid,boolean,text)'),
    ('public.manually_grant_course_access(uuid,uuid)')
)
select
  required_functions.signature,
  function_entry.oid is not null as exists,
  coalesce(function_entry.prosecdef, false) as security_definer,
  has_function_privilege('anon', function_entry.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', function_entry.oid, 'EXECUTE') as authenticated_can_execute
from required_functions
left join pg_proc as function_entry
  on function_entry.oid = to_regprocedure(required_functions.signature)
order by required_functions.signature;

-- 4. Check RLS enablement on the required public tables.
select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles',
    'students',
    'course_catalogue_settings',
    'course_payment_settings',
    'courses',
    'lessons',
    'course_materials',
    'course_access',
    'course_orders'
  )
  and relation.relkind in ('r', 'p', 'v', 'm')
order by relation.relname;

-- 5. Inspect RLS policies for the relevant public tables and Storage objects.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public' and tablename in (
    'course_catalogue_settings',
    'course_payment_settings',
    'courses',
    'lessons',
    'course_materials',
    'course_access',
    'course_orders'
  ))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 6. Check the two required private Storage buckets. No object names are queried.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('course-materials', 'course-payment-proofs')
order by id;
