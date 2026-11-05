-- Adebola College TEST only. Run in Supabase Dashboard > SQL Editor.
-- Read-only metadata inspection. No student, payment, Auth, or Storage object data is read.

-- A NULL result means the standard Supabase migration ledger is not present at this path.
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

-- Required relations and exact columns declared by the six local migrations.
with required_columns(table_name, column_name) as (
  values
    ('profiles', 'id'), ('profiles', 'display_name'), ('profiles', 'email'),
    ('profiles', 'role'), ('profiles', 'admin_enabled'), ('profiles', 'created_at'),
    ('profiles', 'updated_at'),
    ('students', 'id'), ('students', 'profile_id'), ('students', 'name'),
    ('students', 'student_number'), ('students', 'email'), ('students', 'is_active'),
    ('students', 'created_at'), ('students', 'updated_at'),
    ('results', 'id'), ('results', 'student_id'), ('results', 'examination_number'),
    ('results', 'candidate_number'), ('results', 'school'), ('results', 'exam_year'),
    ('results', 'result_status'), ('results', 'created_at'), ('results', 'updated_at'),
    ('result_subjects', 'id'), ('result_subjects', 'result_id'), ('result_subjects', 'name'),
    ('result_subjects', 'score'), ('result_subjects', 'grade'), ('result_subjects', 'remark'),
    ('result_subjects', 'sort_order'), ('result_subjects', 'created_at'),
    ('result_subjects', 'updated_at'),
    ('admin_permissions', 'profile_id'), ('admin_permissions', 'permission_key'),
    ('admin_permissions', 'created_at'),
    ('audit_logs', 'id'), ('audit_logs', 'actor_id'), ('audit_logs', 'action'),
    ('audit_logs', 'entity_type'), ('audit_logs', 'entity_id'), ('audit_logs', 'details'),
    ('audit_logs', 'created_at'),
    ('course_catalogue_settings', 'category'), ('course_catalogue_settings', 'code_prefix'),
    ('course_catalogue_settings', 'code_start'), ('course_catalogue_settings', 'code_end'),
    ('course_catalogue_settings', 'updated_at'), ('course_catalogue_settings', 'updated_by'),
    ('course_payment_settings', 'id'), ('course_payment_settings', 'bank_name'),
    ('course_payment_settings', 'account_name'), ('course_payment_settings', 'account_number'),
    ('course_payment_settings', 'updated_at'), ('course_payment_settings', 'updated_by'),
    ('courses', 'id'), ('courses', 'title'), ('courses', 'category'),
    ('courses', 'description'), ('courses', 'price'), ('courses', 'status'),
    ('courses', 'created_by'), ('courses', 'created_at'), ('courses', 'updated_at'),
    ('lessons', 'id'), ('lessons', 'course_id'), ('lessons', 'title'),
    ('lessons', 'lesson_code'), ('lessons', 'status'), ('lessons', 'created_by'),
    ('lessons', 'created_at'), ('lessons', 'updated_at'),
    ('course_materials', 'id'), ('course_materials', 'course_id'),
    ('course_materials', 'lesson_id'), ('course_materials', 'storage_path'),
    ('course_materials', 'file_name'), ('course_materials', 'mime_type'),
    ('course_materials', 'updated_at'), ('course_materials', 'updated_by'),
    ('course_access', 'profile_id'), ('course_access', 'course_id'),
    ('course_access', 'granted_by'), ('course_access', 'grant_source'),
    ('course_access', 'order_id'), ('course_access', 'granted_at'),
    ('course_orders', 'id'), ('course_orders', 'profile_id'),
    ('course_orders', 'buyer_name'), ('course_orders', 'buyer_email'), ('course_orders', 'course_id'),
    ('course_orders', 'amount'), ('course_orders', 'payment_reference'),
    ('course_orders', 'proof_path'), ('course_orders', 'status'),
    ('course_orders', 'decision_note'), ('course_orders', 'reviewed_by'),
    ('course_orders', 'reviewed_at'), ('course_orders', 'created_at')
)
select
  required_columns.table_name,
  required_columns.column_name,
  case when columns.column_name is null then 'MISSING' else 'present' end as status,
  columns.data_type
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
  and columns.table_name = required_columns.table_name
  and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

-- Required RPC/function signatures. This checks presence and grants, not function bodies.
with required_functions(signature) as (
  values
    ('public.is_main_admin()'),
    ('public.is_active_student_profile()'),
    ('public.has_admin_permission(text)'),
    ('public.set_updated_at()'),
    ('public.bootstrap_main_admin(uuid)'),
    ('public.assign_sub_admin(uuid,text,text[])'),
    ('public.set_sub_admin_enabled(uuid,boolean)'),
    ('public.write_sensitive_audit_log()'),
    ('public.transition_result_status(uuid,text)'),
    ('public.save_result_with_subjects(uuid,uuid,text,text,text,text,jsonb)'),
    ('public.create_invited_student(uuid,text,text)'),
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
select
  required_functions.signature,
  function_entry.oid is not null as exists,
  coalesce(function_entry.prosecdef, false) as security_definer,
  case when function_entry.oid is null then null
    else has_function_privilege('anon', function_entry.oid, 'EXECUTE') end as anon_can_execute,
  case when function_entry.oid is null then null
    else has_function_privilege('authenticated', function_entry.oid, 'EXECUTE') end as authenticated_can_execute,
  case when function_entry.oid is null then null
    else has_function_privilege('service_role', function_entry.oid, 'EXECUTE') end as service_role_can_execute
from required_functions
left join pg_proc as function_entry
  on function_entry.oid = to_regprocedure(required_functions.signature)
order by required_functions.signature;

-- RLS enablement on the tables touched by the migrations.
select namespace.nspname as schema_name, relation.relname as relation_name,
  relation.relkind, relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class as relation
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  )
  and relation.relkind in ('r', 'p', 'v', 'm')
order by relation.relname;

-- Policies on the relevant tables. Policy expressions contain schema logic, not row data.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
    'profiles', 'students', 'results', 'result_subjects', 'admin_permissions', 'audit_logs',
    'course_catalogue_settings', 'course_payment_settings', 'courses', 'lessons',
    'course_materials', 'course_access', 'course_orders'
  ))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Constraints and indexes on the migration-owned application relations.
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

-- Effective table and column privileges relevant to anonymous/authenticated access.
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

-- Required trigger names; verifies presence and enabled status.
with required_triggers(table_name, trigger_name) as (
  values
    ('profiles', 'profiles_set_updated_at'),
    ('students', 'students_set_updated_at'),
    ('results', 'results_set_updated_at'),
    ('result_subjects', 'result_subjects_set_updated_at'),
    ('profiles', 'profiles_audit_log'),
    ('students', 'students_audit_log'),
    ('results', 'results_audit_log'),
    ('result_subjects', 'result_subjects_audit_log'),
    ('admin_permissions', 'admin_permissions_audit_log')
)
select required_triggers.table_name, required_triggers.trigger_name,
  trigger_entry.oid is not null as exists, trigger_entry.tgenabled
from required_triggers
left join pg_class as relation on relation.relname = required_triggers.table_name
  and relation.relnamespace = (
    select oid from pg_namespace where nspname = 'public'
  )
left join pg_trigger as trigger_entry on trigger_entry.tgrelid = relation.oid
  and trigger_entry.tgname = required_triggers.trigger_name
  and not trigger_entry.tgisinternal
order by required_triggers.table_name, required_triggers.trigger_name;

-- Buckets and their settings only; no object names or contents are selected.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('course-materials', 'course-payment-proofs')
order by id;
