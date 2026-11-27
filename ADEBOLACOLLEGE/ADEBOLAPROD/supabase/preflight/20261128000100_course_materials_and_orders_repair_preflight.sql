-- READ-ONLY FINAL-STATE PREFLIGHT for 20261128000100.
-- Returns PASS/FAIL rows only; it performs no DDL or data changes.
with checks as (
  select
    'required application and Storage tables exist' as check_name,
    to_regclass('public.course_payment_settings') is not null
    and to_regclass('public.course_orders') is not null
    and to_regclass('public.course_materials') is not null
    and to_regclass('public.courses') is not null
    and to_regclass('public.lessons') is not null
    and to_regclass('storage.objects') is not null
    and to_regclass('storage.buckets') is not null as passed
  union all
  select
    'course_payment_settings.id remains Boolean NOT NULL with a true default' as check_name,
    exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'course_payment_settings'
        and c.column_name = 'id'
        and c.data_type = 'boolean'
        and c.is_nullable = 'NO'
        and c.column_default like '%true%'
    ) as passed
  union all
  select
    'payment-settings table keeps its Boolean primary key and check',
    exists (
      select 1
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attname = 'id' and not att.attisdropped
      where con.conrelid = 'public.course_payment_settings'::regclass
        and con.contype = 'p'
        and con.conkey = array[att.attnum]::smallint[]
    )
    and exists (
      select 1
      from pg_constraint con
      where con.conrelid = 'public.course_payment_settings'::regclass
        and con.contype = 'c'
        and lower(pg_get_constraintdef(con.oid)) like '%check (id)%'
    )
  union all
  select
    'only the 3-text and 4-text payment-settings RPC overloads exist',
    (select count(*) = 2
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'save_course_payment_settings')
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text,text)')
        and p.proargnames[1:4] = array[
          'configured_bank',
          'configured_account_name',
          'configured_account_number',
          'configured_account_type'
        ]::text[]
        and pg_get_function_result(p.oid) = 'void'
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text)')
        and p.proargnames[1:3] = array[
          'configured_bank',
          'configured_account_name',
          'configured_account_number'
        ]::text[]
        and pg_get_function_result(p.oid) = 'void'
    )
  union all
  select
    'payment-settings RPC grants are restricted to authenticated callers',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text,text)')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text)')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  union all
  select
    'payment-settings function uses ctid and auth.uid without Boolean-id UUID conversion',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_payment_settings(text,text,text,text)')
        and position('where ctid = target_row' in lower(pg_get_functiondef(p.oid))) > 0
        and position('auth.uid()' in lower(pg_get_functiondef(p.oid))) > 0
        and position('id = true' in lower(pg_get_functiondef(p.oid))) = 0
    )
  union all
  select
    'course_orders has nullable email timestamps and text errors',
    (select count(*) = 4
     from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'course_orders'
       and (
         (c.column_name in ('admin_email_sent_at', 'buyer_email_sent_at')
           and c.data_type = 'timestamp with time zone' and c.is_nullable = 'YES')
         or
         (c.column_name in ('admin_email_error', 'buyer_email_error')
           and c.data_type = 'text' and c.is_nullable = 'YES')
       ))
  union all
  select
    'Orders and Payments query columns exist',
    (select count(*) = 15
     from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'course_orders'
       and c.column_name = any(array[
         'id','profile_id','buyer_name','buyer_email','course_id','amount',
         'payment_reference','proof_path','status','decision_note','created_at',
         'admin_email_sent_at','admin_email_error','buyer_email_sent_at','buyer_email_error'
       ]))
  union all
  select
    'guest access email delivery status columns exist',
    (select count(*) = 2
     from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'course_guest_access'
       and (
         (c.column_name = 'access_email_sent_at'
           and c.data_type = 'timestamp with time zone' and c.is_nullable = 'YES')
         or
         (c.column_name = 'access_email_error'
           and c.data_type = 'text' and c.is_nullable = 'YES')
       ))
  union all
  select
    'course_materials lesson_id is nullable and course_id remains required',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'course_materials'
        and column_name = 'lesson_id' and is_nullable = 'YES'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'course_materials'
        and column_name = 'course_id' and is_nullable = 'NO'
    )
  union all
  select
    'course_materials has no remaining unique key on lesson_id alone',
    not exists (
      select 1
      from pg_index i
      where i.indrelid = 'public.course_materials'::regclass
        and i.indisunique
        and i.indnkeyatts = 1
        and i.indkey[0] = (
          select attnum from pg_attribute
          where attrelid = 'public.course_materials'::regclass
            and attname = 'lesson_id' and not attisdropped
        )
    )
  union all
  select
    'course_materials storage_path uniqueness remains enforced',
    exists (
      select 1
      from pg_index i
      where i.indrelid = 'public.course_materials'::regclass
        and i.indisunique
        and i.indnkeyatts = 1
        and i.indkey[0] = (
          select attnum from pg_attribute
          where attrelid = 'public.course_materials'::regclass
            and attname = 'storage_path' and not attisdropped
        )
    )
  union all
  select
    'course_materials MIME type constraint permits only PDF and MP4',
    exists (
        select 1 from pg_constraint con
        where con.conrelid = 'public.course_materials'::regclass
          and con.contype = 'c'
          and lower(pg_get_constraintdef(con.oid)) like '%mime_type%'
          and lower(pg_get_constraintdef(con.oid)) like '%application/pdf%'
          and lower(pg_get_constraintdef(con.oid)) like '%video/mp4%'
    )
  union all
  select
    'course and composite course/lesson foreign keys are present',
    exists (
      select 1 from pg_constraint con
      where con.conrelid = 'public.course_materials'::regclass
        and con.confrelid = 'public.courses'::regclass
        and con.contype = 'f'
        and con.convalidated
        and con.conkey = array[(
          select attnum from pg_attribute
          where attrelid = 'public.course_materials'::regclass
            and attname = 'course_id' and not attisdropped
        )]::smallint[]
    )
    and exists (
      select 1 from pg_constraint con
      where con.conrelid = 'public.course_materials'::regclass
        and con.confrelid = 'public.lessons'::regclass
        and con.contype = 'f'
        and con.convalidated
        and con.confdeltype = 'c'
        and con.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.course_materials'::regclass and attname = 'course_id' and not attisdropped),
          (select attnum from pg_attribute where attrelid = 'public.course_materials'::regclass and attname = 'lesson_id' and not attisdropped)
        ]::smallint[]
    )
  union all
  select
    'all existing material associations and Storage paths are consistent',
    not exists (
      select 1
      from public.course_materials cm
      left join public.courses c on c.id = cm.course_id
      left join public.lessons l on l.id = cm.lesson_id
      where c.id is null
        or (cm.lesson_id is not null and (l.id is null or l.course_id is distinct from cm.course_id))
        or split_part(cm.storage_path, '/', 1) <> cm.course_id::text
        or (cm.lesson_id is null and split_part(cm.storage_path, '/', 2) <> 'course')
        or (cm.lesson_id is not null and split_part(cm.storage_path, '/', 2) <> cm.lesson_id::text)
    )
    and not exists (
      select 1 from public.course_materials
      group by storage_path having count(*) > 1
    )
  union all
  select
    'course-material RPC signatures, returns, and caller grants are correct',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_material_v2(uuid,uuid,text,text,text,uuid)')
        and pg_get_function_result(p.oid) = 'uuid'
        and p.proargnames[1:6] = array[
          'target_course_id','target_lesson_id','material_path',
          'material_name','material_mime','replace_material_id'
        ]::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_material(uuid,text,text,text)')
        and pg_get_function_result(p.oid) = 'void'
        and p.proargnames[1:4] = array[
          'target_lesson_id','material_path','material_name','material_mime'
        ]::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.save_course_material_record(uuid,text,text,text,uuid)')
        and pg_get_function_result(p.oid) = 'uuid'
        and p.proargnames[1:5] = array[
          'target_lesson_id','material_path','material_name','material_mime','replace_material_id'
        ]::text[]
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.remove_course_material_record(uuid)')
        and pg_get_function_result(p.oid) = 'text'
        and p.proargnames[1] = 'target_material_id'
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  union all
  select
    'legacy lesson removal rejects ambiguous multi-material requests',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.remove_course_material(uuid)')
        and pg_get_function_result(p.oid) = 'text'
        and p.proargnames[1] = 'target_lesson_id'
        and p.prosecdef
        and position('material_count > 1' in lower(pg_get_functiondef(p.oid))) > 0
        and position('select a specific material record' in lower(pg_get_functiondef(p.oid))) > 0
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
    )
  union all
  select
    'course and lesson deletion refuse to orphan Storage files',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.delete_lesson(uuid)')
        and pg_get_function_result(p.oid) = 'void'
        and p.proargnames[1] = 'target_lesson_id'
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
        and position('course_materials' in lower(pg_get_functiondef(p.oid))) > 0
        and position('storage.objects' in lower(pg_get_functiondef(p.oid))) > 0
        and position('storage.foldername' in lower(pg_get_functiondef(p.oid))) > 0
        and position('delete lesson materials' in lower(pg_get_functiondef(p.oid))) > 0
    )
    and exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.delete_course(uuid)')
        and pg_get_function_result(p.oid) = 'void'
        and p.proargnames[1] = 'target_id'
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')
        and position('course_materials' in lower(pg_get_functiondef(p.oid))) > 0
        and position('storage.objects' in lower(pg_get_functiondef(p.oid))) > 0
        and position('storage.foldername' in lower(pg_get_functiondef(p.oid))) > 0
        and position('delete all course materials' in lower(pg_get_functiondef(p.oid))) > 0
    )
  union all
  select
    'course-material table and Storage objects retain RLS',
    (select relrowsecurity from pg_class where oid = 'public.course_materials'::regclass)
    and (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass)
  union all
  select
    'learner material policies require entitlement and published content',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'course_materials'
        and policyname = 'materials_admin_or_access_read'
        and roles @> array['authenticated']::name[]
        and qual ilike '%has_admin_permission%'
        and qual ilike '%manage_course_materials%'
        and qual ilike '%has_course_access%'
        and qual ilike '%lesson_id is null%'
        and qual ilike '%published%'
    )
    and exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'course_material_objects_authorized_read'
        and roles @> array['authenticated']::name[]
        and qual ilike '%has_course_access%'
        and qual ilike '%course_materials%'
        and qual ilike '%lesson_id is null%'
        and qual ilike '%published%'
    )
  union all
  select
    'Main Admin and assigned Sub-Admins retain material permissions',
    exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure('public.has_admin_permission(text)')
        and position('is_main_admin()' in lower(p.prosrc)) > 0
        and position('role = ''sub_admin''' in lower(p.prosrc)) > 0
        and position('manage_course_materials' in lower(p.prosrc)) > 0
    )
  union all
  select
    'payment-settings audit trigger remains enabled and Boolean ids are guarded before UUID casts',
    exists (
      select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'public.course_payment_settings'::regclass
        and t.tgname = 'course_payment_settings_audit_log'
        and t.tgenabled in ('O', 'A')
        and t.tgtype = 29
        and t.tgnargs = 0
        and p.oid = to_regprocedure('public.write_sensitive_audit_log()')
        and p.prosecdef
        and p.proconfig @> array['search_path=pg_catalog, public, pg_temp']
        and position('case when (after_data ->> ''id'') ~* ''^[0-9a-f]{8}-' in regexp_replace(lower(p.prosrc), '[[:space:]]+', ' ', 'g')) > 0
        and position('then (after_data ->> ''id'')::uuid end' in regexp_replace(lower(p.prosrc), '[[:space:]]+', ' ', 'g')) > 0
        and position('case when (before_data ->> ''id'') ~* ''^[0-9a-f]{8}-' in regexp_replace(lower(p.prosrc), '[[:space:]]+', ' ', 'g')) > 0
        and position('then (before_data ->> ''id'')::uuid end' in regexp_replace(lower(p.prosrc), '[[:space:]]+', ' ', 'g')) > 0
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs'
        and column_name = 'entity_id' and data_type = 'uuid' and is_nullable = 'YES'
    )
  union all
  select
    'Admin Storage upload policy restricts course/lesson folder associations',
    exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'course_material_objects_admin_insert'
        and with_check ilike '%manage_course_materials%'
        and with_check ilike '%storage.foldername%'
        and with_check ilike '%course%'
    )
    and exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'course_material_objects_admin_update'
        and qual ilike '%manage_course_materials%'
        and with_check ilike '%manage_course_materials%'
    )
    and exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'course_material_objects_admin_delete'
        and qual ilike '%manage_course_materials%'
    )
  union all
  select
    'course-materials Storage bucket is private and permits only PDF/MP4',
    exists (
      select 1 from storage.buckets
      where id = 'course-materials'
        and public = false
        and file_size_limit = 52428800
        and allowed_mime_types = array['application/pdf', 'video/mp4']
    )
  union all
  select
    'course orders remain protected by RLS',
    (select relrowsecurity from pg_class where oid = 'public.course_orders'::regclass)
    and exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'course_orders'
        and policyname = 'course_orders_owner_or_payment_admin_read'
        and qual ilike '%auth.uid%'
        and qual ilike '%view_orders_payments%'
    )
)
select
  case when passed then 'PASS' else 'FAIL' end as result,
  check_name
from checks
order by result, check_name;
