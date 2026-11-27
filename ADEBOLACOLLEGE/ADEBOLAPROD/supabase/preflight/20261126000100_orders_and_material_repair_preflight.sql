-- READ-ONLY preflight for 20261126000100_orders_and_material_repair.sql.
-- Run only against the Adebola College development project.
-- All statements are SELECT-only. Existing rows and migration history are untouched.

with required_tables(table_name) as (
  values
    ('course_orders'),
    ('course_materials'),
    ('lessons'),
    ('courses')
)
select
  case when to_regclass('public.' || table_name) is not null
    then 'PASS' else 'FAIL' end as result,
  'Required table public.' || table_name as check_name
from required_tables;

with required_columns(table_name, column_name, required_type) as (
  values
    ('course_orders','id','uuid'),
    ('course_orders','course_id','uuid'),
    ('course_orders','admin_email_sent_at','timestamp with time zone'),
    ('course_orders','admin_email_error','text'),
    ('course_materials','id','uuid'),
    ('course_materials','course_id','uuid'),
    ('course_materials','lesson_id','uuid'),
    ('course_materials','storage_path','text'),
    ('course_materials','file_name','text'),
    ('course_materials','mime_type','text'),
    ('course_materials','updated_at','timestamp with time zone'),
    ('course_materials','updated_by','uuid'),
    ('lessons','id','uuid'),
    ('lessons','course_id','uuid')
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
  'Prerequisite column ' || r.table_name || '.' || r.column_name ||
    ' has type ' || r.required_type as check_name
from required_columns r;

with optional_buyer_columns(column_name, required_type) as (
  values
    ('buyer_email_sent_at','timestamp with time zone'),
    ('buyer_email_error','text')
)
select
  case when not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'course_orders'
      and c.column_name = r.column_name
  ) or exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'course_orders'
      and c.column_name = r.column_name
      and c.data_type = r.required_type
  ) then 'PASS' else 'FAIL' end as result,
  'Buyer email status column ' || r.column_name ||
    ' is absent (will be added) or already has type ' || r.required_type as check_name
from optional_buyer_columns r;

select
  case when expected.oid is not null
         and p.proargnames = array[
           'target_lesson_id','material_path','material_name','material_mime'
         ]::text[]
         and pg_catalog.format_type(p.prorettype, null) = 'void'
         and p.prosecdef
         and has_function_privilege('authenticated', p.oid, 'EXECUTE')
         and not has_function_privilege('anon', p.oid, 'EXECUTE')
    then 'PASS' else 'FAIL' end as result,
  'Existing save_course_material RPC has replace-compatible void signature and restricted grants' as check_name
from (select to_regprocedure(
  'public.save_course_material(uuid,text,text,text)'
) as oid) expected
left join pg_proc p on p.oid = expected.oid;

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
  'Required lessons(course_id, id) unique key exists for the follow-up association constraint' as check_name;

select
  'PASS' as result,
  'The migration dynamically removes any unique constraint containing lesson_id; current matching constraints: ' ||
    count(*)::text as check_name
from pg_constraint c
where c.conrelid = to_regclass('public.course_materials')
  and c.contype = 'u'
  and (select attnum from pg_attribute
       where attrelid = to_regclass('public.course_materials')
         and attname = 'lesson_id'
         and not attisdropped) = any(c.conkey);

select
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'course_materials'
      and policyname = 'materials_admin_or_access_read'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
      and qual ilike '%has_admin_permission%'
      and qual ilike '%has_course_access%'
  ) then 'PASS' else 'FAIL' end as result,
  'Existing course-material Admin and learner read policy is present' as check_name;

select
  case when exists (
    select 1 from storage.buckets
    where id = 'course-materials'
      and public = false
      and file_size_limit = 52428800
      and allowed_mime_types @> array['application/pdf','video/mp4']::text[]
  ) then 'PASS' else 'FAIL' end as result,
  'Existing course-material bucket is private and allows PDF/MP4 uploads' as check_name;

select
  case when exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity
  ) then 'PASS' else 'FAIL' end as result,
  'Storage.objects RLS is enabled' as check_name;
