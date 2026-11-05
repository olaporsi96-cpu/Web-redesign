-- Read-only TEST inspection only.
-- Before running: verify the SQL Editor project reference is
-- jmxuffazlpcdwcpqnjau (adebola-college-development).
-- Every executable statement below is a SELECT. Run each numbered query
-- separately and retain each result grid; some SQL Editor views show only one.
-- Do not run any migration or bootstrap function as part of this inspection.

-- 1. Check whether the conventional migration ledger exists and inspect its shape.
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'supabase_migrations'
order by table_name, ordinal_position;

-- 2. Inventory all application tables in public.
select table_schema, table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 3. Inspect columns and defaults for all workflow tables, including any
-- unexpected extra columns. Empty output means the named table is absent.
select table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles', 'students', 'results', 'result_subjects',
    'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings',
    'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
  )
order by table_name, ordinal_position;

-- 4. Report whether each expected workflow table exists and its RLS flags.
with expected_tables(table_name) as (
  values
    ('profiles'), ('students'), ('results'), ('result_subjects'),
    ('admin_permissions'), ('audit_logs'),
    ('course_catalogue_settings'), ('course_payment_settings'),
    ('courses'), ('lessons'), ('course_materials'), ('course_access'),
    ('course_orders')
)
select 'public' as schema_name, expected_tables.table_name,
       relation.oid is not null as exists,
       coalesce(relation.relrowsecurity, false) as rls_enabled,
       coalesce(relation.relforcerowsecurity, false) as rls_forced
from expected_tables
left join pg_namespace as namespace on namespace.nspname = 'public'
left join pg_class as relation
  on relation.relnamespace = namespace.oid
 and relation.relname = expected_tables.table_name
 and relation.relkind in ('r', 'p')
order by expected_tables.table_name;

-- Also verify RLS is enabled on Storage's object metadata table. Bucket
-- privacy and Storage policies must be reviewed separately below.
select namespace.nspname as schema_name, relation.relname as table_name,
       relation.relrowsecurity as rls_enabled,
       relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'storage'
  and relation.relname = 'objects'
  and relation.relkind in ('r', 'p');

-- 5. Inspect policies on core student/results/admin tables and E-Learning
-- tables. This also reports policies on storage.objects.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
    'profiles', 'students', 'results', 'result_subjects',
    'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings',
    'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
  ))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 6. Inspect primary keys, foreign keys, unique/check constraints, and their
-- exact definitions for workflow tables.
select namespace.nspname as schema_name, relation.relname as table_name,
       constraint_entry.conname as constraint_name,
       constraint_entry.contype as constraint_type,
       pg_get_constraintdef(constraint_entry.oid, true) as definition,
       constraint_entry.convalidated as is_validated
from pg_constraint as constraint_entry
join pg_class as relation on relation.oid = constraint_entry.conrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects',
    'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings',
    'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
  )
order by relation.relname, constraint_entry.contype, constraint_entry.conname;

-- 7. Inspect indexes for the same tables.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'profiles', 'students', 'results', 'result_subjects',
    'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings',
    'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
  )
order by tablename, indexname;

-- 8. Inspect required helpers/RPCs, including SECURITY DEFINER settings,
-- search_path, definitions, and execute privileges. Definitions may include
-- implementation details; share the result only with authorized reviewers.
with required_functions(signature) as (
  values
    ('public.is_main_admin()'),
    ('public.is_active_student_profile()'),
    ('public.has_admin_permission(text)'),
    ('public.bootstrap_main_admin(uuid)'),
    ('public.assign_sub_admin(uuid,text,text[])'),
    ('public.set_sub_admin_enabled(uuid,boolean)'),
    ('public.create_invited_student(uuid,text,text)'),
    ('public.transition_result_status(uuid,text)'),
    ('public.save_result_with_subjects(uuid,uuid,text,text,text,text,jsonb)'),
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
    ('public.submit_guest_course_order(uuid,text,text,text)'),
    ('public.review_course_order(uuid,boolean,text,uuid)'),
    ('public.manually_grant_course_access(uuid,uuid)'),
    ('public.revoke_manual_course_access(uuid,uuid)')
)
select required_functions.signature,
       function_entry.oid is not null as exists,
       function_entry.prosecdef as security_definer,
       function_entry.proconfig as function_settings,
       has_function_privilege('anon', function_entry.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', function_entry.oid, 'EXECUTE')
         as authenticated_can_execute,
       pg_get_functiondef(function_entry.oid) as definition
from required_functions
left join pg_proc as function_entry
  on function_entry.oid = to_regprocedure(required_functions.signature)
order by required_functions.signature;

-- 9. Find every SECURITY DEFINER routine in the application schema, so an
-- unexpected or differently named privileged function is not missed.
select namespace.nspname as schema_name,
       procedure_entry.oid::regprocedure::text as signature,
       procedure_entry.proconfig as function_settings,
       has_function_privilege('anon', procedure_entry.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', procedure_entry.oid, 'EXECUTE')
         as authenticated_can_execute,
       pg_get_functiondef(procedure_entry.oid) as definition
from pg_proc as procedure_entry
join pg_namespace as namespace on namespace.oid = procedure_entry.pronamespace
where namespace.nspname = 'public'
  and procedure_entry.prosecdef
order by signature;

-- 10. Inspect triggers on workflow tables, including trigger definitions.
select namespace.nspname as schema_name, relation.relname as table_name,
       trigger_entry.tgname as trigger_name,
       pg_get_triggerdef(trigger_entry.oid, true) as definition,
       trigger_entry.tgenabled as enabled_state
from pg_trigger as trigger_entry
join pg_class as relation on relation.oid = trigger_entry.tgrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where not trigger_entry.tgisinternal
  and namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects',
    'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings',
    'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
  )
order by relation.relname, trigger_entry.tgname;

-- 11. Inspect expected Storage bucket configuration. No file/object names
-- or contents are queried.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('course-materials', 'course-payment-proofs')
order by id;

-- 12. Inspect table privileges granted to API roles. RLS policies are
-- separate from these SQL privileges.
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
  and (
    table_name in (
      'profiles', 'students', 'results', 'result_subjects',
      'admin_permissions', 'audit_logs',
      'course_catalogue_settings', 'course_payment_settings',
      'courses', 'lessons', 'course_materials', 'course_access', 'course_orders'
    )
    or (table_schema = 'storage' and table_name = 'objects')
  )
order by table_schema, table_name, grantee, privilege_type;
