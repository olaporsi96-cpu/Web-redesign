-- Adebola College TEST only. Run after an explicitly approved migration plan.
-- Read-only metadata verification. No application, Auth, payment, or Storage object data is read.

-- 1. Confirm required relations and columns exist.
with required_columns(table_name, column_name) as (
  values
    ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'admin_enabled'),
    ('students', 'id'), ('students', 'profile_id'), ('students', 'is_active'),
    ('results', 'id'), ('results', 'student_id'), ('results', 'result_status'),
    ('result_subjects', 'id'), ('result_subjects', 'result_id'), ('result_subjects', 'sort_order'),
    ('admin_permissions', 'profile_id'), ('admin_permissions', 'permission_key'),
    ('audit_logs', 'id'), ('audit_logs', 'actor_id'), ('audit_logs', 'details'),
    ('course_catalogue_settings', 'category'), ('course_catalogue_settings', 'code_prefix'),
    ('course_catalogue_settings', 'code_start'), ('course_catalogue_settings', 'code_end'),
    ('course_payment_settings', 'id'), ('course_payment_settings', 'bank_name'),
    ('course_payment_settings', 'account_name'), ('course_payment_settings', 'account_number'),
    ('courses', 'id'), ('courses', 'title'), ('courses', 'category'), ('courses', 'description'),
    ('courses', 'price'), ('courses', 'status'),
    ('lessons', 'id'), ('lessons', 'course_id'), ('lessons', 'title'),
    ('lessons', 'lesson_code'), ('lessons', 'status'),
    ('course_materials', 'id'), ('course_materials', 'course_id'),
    ('course_materials', 'lesson_id'), ('course_materials', 'storage_path'),
    ('course_materials', 'file_name'), ('course_materials', 'mime_type'),
    ('course_access', 'profile_id'), ('course_access', 'course_id'),
    ('course_access', 'grant_source'), ('course_access', 'order_id'),
    ('course_orders', 'id'), ('course_orders', 'profile_id'), ('course_orders', 'buyer_name'),
    ('course_orders', 'buyer_email'), ('course_orders', 'course_id'),
    ('course_orders', 'amount'), ('course_orders', 'payment_reference'), ('course_orders', 'proof_path'),
    ('course_orders', 'status'), ('course_orders', 'reviewed_by'), ('course_orders', 'reviewed_at')
)
select required_columns.table_name, required_columns.column_name,
  case when columns.column_name is null then 'FAIL: missing' else 'present' end as status
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
  and columns.table_name = required_columns.table_name
  and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

-- 2. Confirm required RPC signatures and expected caller grants.
with expected_functions(signature, anon_expected, authenticated_expected) as (
  values
    ('public.is_main_admin()', false, true),
    ('public.is_active_student_profile()', false, true),
    ('public.has_admin_permission(text)', false, true),
    ('public.transition_result_status(uuid,text)', false, true),
    ('public.save_result_with_subjects(uuid,uuid,text,text,text,text,jsonb)', false, true),
    ('public.create_invited_student(uuid,text,text)', false, true),
    ('public.has_course_access(uuid)', false, true),
    ('public.save_course(uuid,text,text,text,numeric,text)', false, true),
    ('public.archive_course(uuid)', false, true),
    ('public.save_lesson(uuid,uuid,text,text,text)', false, true),
    ('public.archive_lesson(uuid)', false, true),
    ('public.save_course_catalogue_settings(jsonb)', false, true),
    ('public.save_course_payment_settings(text,text,text)', false, true),
    ('public.save_course_material(uuid,text,text,text)', false, true),
    ('public.remove_course_material(uuid)', false, true),
    ('public.submit_course_order(uuid,text,text)', false, true),
    ('public.submit_guest_course_order(uuid,text,text,text)', true, false),
    ('public.review_course_order(uuid,boolean,text,uuid)', false, true),
    ('public.manually_grant_course_access(uuid,uuid)', false, true),
    ('public.revoke_manual_course_access(uuid,uuid)', false, true),
    ('public.assign_sub_admin(uuid,text,text[])', false, true),
    ('public.set_sub_admin_enabled(uuid,boolean)', false, true),
    ('public.bootstrap_main_admin(uuid)', false, false)
)
select expected_functions.signature,
  function_entry.oid is not null as exists,
  case when function_entry.oid is null then null
    else has_function_privilege('anon', function_entry.oid, 'EXECUTE') end as anon_can_execute,
  case when function_entry.oid is null then null
    else has_function_privilege('authenticated', function_entry.oid, 'EXECUTE') end as authenticated_can_execute,
  expected_functions.anon_expected,
  expected_functions.authenticated_expected,
  coalesce(function_entry.prosecdef, false) as security_definer
from expected_functions
left join pg_proc as function_entry
  on function_entry.oid = to_regprocedure(expected_functions.signature)
order by expected_functions.signature;

-- 3. Verify RLS is enabled on application data relations.
select namespace.nspname as schema_name, relation.relname as relation_name,
  relation.relrowsecurity as rls_enabled, relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
  and relation.relkind in ('r', 'p')
order by relation.relname;

-- 4. Review the installed policies and compare them with the migration definitions.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  ))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 5. Confirm constraints and indexes exist after migration and retain their definitions.
select namespace.nspname as schema_name, relation.relname as table_name,
  constraint_entry.conname as object_name, 'constraint' as object_type,
  pg_get_constraintdef(constraint_entry.oid, true) as definition
from pg_constraint as constraint_entry
join pg_class as relation on relation.oid = constraint_entry.conrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
union all
select namespace.nspname, relation.relname, index_entry.indexrelid::regclass::text,
  'index', pg_get_indexdef(index_entry.indexrelid)
from pg_index as index_entry
join pg_class as relation on relation.oid = index_entry.indrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
order by schema_name, table_name, object_type, object_name;

-- 6. Review effective grants after migration.
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and table_name in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, column_name, grantee, privilege_type;

-- 5. Confirm the required buckets are private and retain the intended restrictions.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('course-materials', 'course-payment-proofs')
order by id;

-- 6. The standard migration ledger was absent at preflight. Check again, but do not
-- infer migration application history if this remains NULL; record the approved run separately.
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;
