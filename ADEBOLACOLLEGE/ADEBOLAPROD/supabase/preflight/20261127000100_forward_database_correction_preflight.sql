-- READ-ONLY PREFLIGHT. Run only in Adebola College development SQL Editor.
-- All statements are SELECT-only and inspect schema metadata/data consistency.

with required_tables(table_name) as (
  values
    ('course_payment_settings'),
    ('course_orders'),
    ('course_materials'),
    ('lessons'),
    ('courses'),
    ('course_access'),
    ('course_guest_access')
)
select
  case when to_regclass('public.' || table_name) is not null
    then 'PASS' else 'FAIL' end as result,
  'Required table public.' || table_name as check_name
from required_tables
union all
select
  case when to_regclass('storage.buckets') is not null
         and to_regclass('storage.objects') is not null
    then 'PASS' else 'FAIL' end,
  'Storage bucket and object metadata tables';

with required_columns(table_name, column_name, required_type) as (
  values
    ('course_payment_settings','bank_name','text'),
    ('course_payment_settings','account_name','text'),
    ('course_payment_settings','account_number','text'),
    ('course_payment_settings','account_type','text'),
    ('course_payment_settings','updated_at','timestamp with time zone'),
    ('course_payment_settings','updated_by','uuid'),
    ('course_orders','admin_email_sent_at','timestamp with time zone'),
    ('course_orders','admin_email_error','text'),
    ('course_orders','buyer_email_sent_at','timestamp with time zone'),
    ('course_orders','buyer_email_error','text'),
    ('course_materials','id','uuid'),
    ('course_materials','course_id','uuid'),
    ('course_materials','lesson_id','uuid'),
    ('course_materials','storage_path','text'),
    ('course_materials','file_name','text'),
    ('course_materials','mime_type','text'),
    ('course_materials','updated_at','timestamp with time zone'),
    ('course_materials','updated_by','uuid'),
    ('lessons','id','uuid'),
    ('lessons','course_id','uuid'),
    ('courses','id','uuid'),
    ('courses','status','text')
)
select
  case when exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name = r.column_name
      and c.data_type = r.required_type
  ) then 'PASS' else 'FAIL' end as result,
  'Required column ' || r.table_name || '.' || r.column_name ||
    ' has type ' || r.required_type as check_name
from required_columns r;

with required_functions(
  signature,
  arg_names,
  return_type,
  anon_execute,
  authenticated_execute,
  service_role_execute
) as (
  values
    ('public.save_course_payment_settings(text,text,text,text)',
      array['configured_bank','configured_account_name','configured_account_number','configured_account_type']::text[],
      'void',false,true,false),
    ('public.save_course_payment_settings(text,text,text)',
      array['configured_bank','configured_account_name','configured_account_number']::text[],
      'void',false,true,false),
    ('public.submit_guest_course_order(uuid,text,text,text,text)',
      array['target_course_id','submitted_buyer_name','submitted_buyer_email','submitted_reference','submitted_proof_path']::text[],
      'uuid',false,false,true),
    ('public.review_course_order(uuid,boolean,text,uuid,text)',
      array['target_order_id','approve_order','review_note','linked_profile_id','guest_token_hash']::text[],
      'void',false,true,false),
    ('public.save_course_material(uuid,text,text,text)',
      array['target_lesson_id','material_path','material_name','material_mime']::text[],
      'void',false,true,false),
    ('public.save_course_material_record(uuid,text,text,text,uuid)',
      array['target_lesson_id','material_path','material_name','material_mime','replace_material_id']::text[],
      'uuid',false,true,false),
    ('public.remove_course_material(uuid)',
      array['target_lesson_id']::text[],
      'text',false,true,false),
    ('public.remove_course_material_record(uuid)',
      array['target_material_id']::text[],
      'text',false,true,false)
)
select
  case when p.oid is not null
         and p.proargnames = r.arg_names
         and pg_catalog.format_type(p.prorettype, null) = r.return_type
         and p.prosecdef
         and has_function_privilege('anon', p.oid, 'EXECUTE') = r.anon_execute
         and has_function_privilege('authenticated', p.oid, 'EXECUTE') = r.authenticated_execute
         and has_function_privilege('service_role', p.oid, 'EXECUTE') = r.service_role_execute
    then 'PASS' else 'FAIL' end as result,
  r.signature || ' has expected arguments, return type, security and grants' as check_name
from required_functions r
left join pg_proc p on p.oid = to_regprocedure(r.signature);

select
  case when count(*) = 2
         and count(*) filter (where pronargs = 3) = 1
         and count(*) filter (where pronargs = 4) = 1
    then 'PASS' else 'FAIL' end as result,
  'Payment settings has exactly the three- and four-argument overloads' as check_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'save_course_payment_settings';

select
  case when p.oid is not null
         and has_function_privilege('authenticated', p.oid, 'EXECUTE')
         and not has_function_privilege('anon', p.oid, 'EXECUTE')
         and not has_function_privilege('service_role', p.oid, 'EXECUTE')
         and pg_get_functiondef(p.oid) ilike '%ctid = target_row%'
         and pg_get_functiondef(p.oid) !~* 'id[[:space:]]*=[[:space:]]*true'
    then 'PASS' else 'FAIL' end as result,
  'Four-argument payment-settings RPC is UUID-safe and restricted' as check_name
from pg_proc p
where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text,text)');

select
  case when p.oid is not null
         and has_function_privilege('authenticated', p.oid, 'EXECUTE')
         and not has_function_privilege('anon', p.oid, 'EXECUTE')
         and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    then 'PASS' else 'FAIL' end as result,
  'Three-argument payment-settings wrapper is restricted' as check_name
from pg_proc p
where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text)');

select
  case when p.oid is null
         or (
           not has_function_privilege('anon', p.oid, 'EXECUTE')
           and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
           and not has_function_privilege('service_role', p.oid, 'EXECUTE')
         )
    then 'PASS' else 'FAIL' end as result,
  'Legacy receipt-less guest-order RPC is disabled' as check_name
from (select to_regprocedure(
  'public.submit_guest_course_order(uuid,text,text,text)'
) as oid) legacy;

select
  case when p.oid is null
         or (
           not has_function_privilege('anon', p.oid, 'EXECUTE')
           and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
           and not has_function_privilege('service_role', p.oid, 'EXECUTE')
         )
    then 'PASS' else 'FAIL' end as result,
  'Legacy four-argument order-review RPC is disabled' as check_name
from (select to_regprocedure(
  'public.review_course_order(uuid,boolean,text,uuid)'
) as oid) legacy
left join pg_proc p on p.oid = legacy.oid;

select
  case when to_regclass('public.course_materials') is not null
         and not exists (
           select 1
           from pg_constraint c
           where c.conrelid = to_regclass('public.course_materials')
             and c.contype = 'u'
             and (select attnum from pg_attribute
                  where attrelid = to_regclass('public.course_materials')
                    and attname = 'lesson_id'
                    and not attisdropped) = any(c.conkey)
         )
    then 'PASS' else 'FAIL' end as result,
  'No unique constraint blocks multiple materials per lesson' as check_name;

select
  case when exists (
    select 1
    from pg_constraint c
    where c.conrelid = to_regclass('public.course_materials')
      and c.contype = 'u'
      and (select attnum from pg_attribute
           where attrelid = to_regclass('public.course_materials')
             and attname = 'storage_path'
             and not attisdropped) = any(c.conkey)
  ) then 'PASS' else 'FAIL' end as result,
  'Course material storage paths remain unique' as check_name;

select
  case when exists (
    select 1
    from pg_constraint c
    where c.conrelid = to_regclass('public.lessons')
      and c.contype in ('u', 'p')
      and c.conkey = array[
        (select attnum from pg_attribute where attrelid = to_regclass('public.lessons') and attname = 'course_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = to_regclass('public.lessons') and attname = 'id' and not attisdropped)
      ]::smallint[]
  ) then 'PASS' else 'FAIL' end as result,
  'Referenced lessons(course_id, id) key exists' as check_name;

select
  case when exists (
    select 1
    from pg_constraint c
    where c.conrelid = to_regclass('public.course_materials')
      and c.confrelid = to_regclass('public.lessons')
      and c.contype = 'f'
      and c.convalidated
      and c.confdeltype = 'c'
      and c.conkey = array[
        (select attnum from pg_attribute where attrelid = to_regclass('public.course_materials') and attname = 'course_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = to_regclass('public.course_materials') and attname = 'lesson_id' and not attisdropped)
      ]::smallint[]
      and c.confkey = array[
        (select attnum from pg_attribute where attrelid = to_regclass('public.lessons') and attname = 'course_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = to_regclass('public.lessons') and attname = 'id' and not attisdropped)
      ]::smallint[]
  ) then 'PASS' else 'FAIL' end as result,
  'Validated cascading course-material-to-lesson association exists' as check_name;

select
  case when not exists (
    select 1
    from public.course_materials cm
    left join public.lessons l on l.id = cm.lesson_id
    where l.id is null or cm.course_id is distinct from l.course_id
  ) then 'PASS' else 'FAIL' end as result,
  'Existing material course IDs match their lesson course IDs' as check_name;

select
  case when exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.course_materials')
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%application/pdf%'
      and pg_get_constraintdef(c.oid) ilike '%video/mp4%'
  ) then 'PASS' else 'FAIL' end as result,
  'Course-material MIME constraint permits PDF and MP4' as check_name;

with required_rls(table_name) as (
  values
    ('course_materials'),
    ('course_access'),
    ('course_guest_access'),
    ('course_orders')
)
select
  case when t.rowsecurity then 'PASS' else 'FAIL' end as result,
  'RLS enabled on public.' || r.table_name as check_name
from required_rls r
left join pg_tables t
  on t.schemaname = 'public'
 and t.tablename = r.table_name;

with required_public_policies(tablename, policyname, required_text) as (
  values
    ('course_materials','materials_admin_or_access_read','has_course_access'),
    ('course_access','course_access_owner_or_payment_admin_read','has_admin_permission'),
    ('course_guest_access','course_guest_access_payment_admin_read','has_admin_permission'),
    ('course_orders','course_orders_owner_or_payment_admin_read','has_admin_permission')
)
select
  case when p.policyname is not null
         and p.cmd = 'SELECT'
         and p.roles @> array['authenticated']::name[]
         and coalesce(p.qual, '') ilike '%' || r.required_text || '%'
         and (
           r.tablename <> 'course_materials'
           or (
             p.qual ilike '%manage_course_materials%'
             and p.qual ilike '%published%'
           )
         )
    then 'PASS' else 'FAIL' end as result,
  'Public-table policy ' || r.tablename || '.' || r.policyname as check_name
from required_public_policies r
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = r.tablename
 and p.policyname = r.policyname;

with required_storage_policies(policyname, cmd) as (
  values
    ('course_material_objects_admin_insert','INSERT'),
    ('course_material_objects_authorized_read','SELECT'),
    ('course_material_objects_admin_update','UPDATE'),
    ('course_material_objects_admin_delete','DELETE')
)
select
  case when p.policyname is not null
         and p.roles @> array['authenticated']::name[]
         and (
           (r.cmd = 'INSERT'
             and p.with_check ilike '%course-materials%'
             and p.with_check ilike '%manage_course_materials%')
           or
           (r.cmd = 'SELECT'
             and p.qual ilike '%course-materials%'
             and p.qual ilike '%manage_course_materials%'
             and p.qual ilike '%has_course_access%')
           or
           (r.cmd = 'UPDATE'
             and p.qual ilike '%course-materials%'
             and p.qual ilike '%manage_course_materials%'
             and p.with_check ilike '%course-materials%'
             and p.with_check ilike '%manage_course_materials%')
           or
           (r.cmd = 'DELETE'
             and p.qual ilike '%course-materials%'
             and p.qual ilike '%manage_course_materials%')
         )
    then 'PASS' else 'FAIL' end as result,
  'Storage.objects policy ' || r.policyname || ' (' || r.cmd || ')' as check_name
from required_storage_policies r
left join pg_policies p
  on p.schemaname = 'storage'
 and p.tablename = 'objects'
 and p.policyname = r.policyname
 and p.cmd = r.cmd;

select
  case when exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity
  ) then 'PASS' else 'FAIL' end as result,
  'Storage.objects RLS remains enabled' as check_name;

select
  case when b.public = false
         and b.file_size_limit = 52428800
         and b.allowed_mime_types @> array['application/pdf','video/mp4']::text[]
         and cardinality(b.allowed_mime_types) = 2
    then 'PASS' else 'FAIL' end as result,
  'course-materials bucket is private and limited to PDF/MP4 (50 MiB)' as check_name
from storage.buckets b
where b.id = 'course-materials'
union all
select 'FAIL',
       'course-materials bucket is private and limited to PDF/MP4 (50 MiB)'
where not exists (
  select 1 from storage.buckets where id = 'course-materials'
);
