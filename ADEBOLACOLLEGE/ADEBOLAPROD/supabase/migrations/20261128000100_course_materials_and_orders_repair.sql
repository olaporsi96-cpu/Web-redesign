-- Forward-only repair for payment settings, audit logging, course materials, and order email status.
-- Existing course material rows and Storage objects are retained.
begin;

alter table public.course_orders
  add column if not exists admin_email_sent_at timestamptz,
  add column if not exists admin_email_error text,
  add column if not exists buyer_email_sent_at timestamptz,
  add column if not exists buyer_email_error text;

do $$
declare
  settings_id_type text;
  course_materials_course_attribute smallint;
  course_materials_lesson_attribute smallint;
  course_materials_path_attribute smallint;
  lessons_course_attribute smallint;
  lessons_id_attribute smallint;
  courses_id_attribute smallint;
  unique_item record;
  expected_fk record;
begin
  select data_type into settings_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'course_payment_settings'
    and column_name = 'id';
  if settings_id_type is distinct from 'boolean' then
    raise exception 'Expected course_payment_settings.id to remain Boolean; refusing table-shape changes';
  end if;

  select attnum into course_materials_course_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'course_id' and not attisdropped;
  select attnum into course_materials_lesson_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'lesson_id' and not attisdropped;
  select attnum into course_materials_path_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'storage_path' and not attisdropped;
  select attnum into lessons_course_attribute
  from pg_attribute
  where attrelid = 'public.lessons'::regclass
    and attname = 'course_id' and not attisdropped;
  select attnum into lessons_id_attribute
  from pg_attribute
  where attrelid = 'public.lessons'::regclass
    and attname = 'id' and not attisdropped;
  select attnum into courses_id_attribute
  from pg_attribute
  where attrelid = 'public.courses'::regclass
    and attname = 'id' and not attisdropped;

  if course_materials_course_attribute is null
     or course_materials_lesson_attribute is null
     or course_materials_path_attribute is null
     or lessons_course_attribute is null
     or lessons_id_attribute is null
     or courses_id_attribute is null then
    raise exception 'Required course-material relationship columns are missing';
  end if;

  if exists (
    select 1
    from public.course_materials cm
    left join public.courses c on c.id = cm.course_id
    where c.id is null
  ) then
    raise exception 'Orphaned course-material course associations exist; refusing to alter constraints';
  end if;
  if exists (
    select 1
    from public.course_materials cm
    left join public.lessons l on l.id = cm.lesson_id
    where cm.lesson_id is not null
      and (l.id is null or l.course_id is distinct from cm.course_id)
  ) then
    raise exception 'Invalid existing course/lesson associations exist; refusing to alter constraints';
  end if;
  if exists (
    select storage_path
    from public.course_materials
    group by storage_path
    having count(*) > 1
  ) then
    raise exception 'Duplicate course-material storage paths exist; refusing to alter uniqueness';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and contype in ('u', 'p')
      and conkey = array[lessons_course_attribute, lessons_id_attribute]::smallint[]
  ) then
    alter table public.lessons
      add constraint lessons_course_id_id_key unique (course_id, id);
  end if;

  select conname, convalidated, confdeltype into expected_fk
  from pg_constraint
  where conrelid = 'public.course_materials'::regclass
    and confrelid = 'public.lessons'::regclass
    and contype = 'f'
    and conkey = array[course_materials_course_attribute, course_materials_lesson_attribute]::smallint[]
    and confkey = array[lessons_course_attribute, lessons_id_attribute]::smallint[]
  limit 1;
  if not found then
    alter table public.course_materials
      add constraint course_materials_course_lesson_fk
      foreign key (course_id, lesson_id)
      references public.lessons(course_id, id)
      on delete cascade;
  elsif expected_fk.confdeltype <> 'c' then
    raise exception 'Existing course-material association has incompatible delete behavior';
  elsif not expected_fk.convalidated then
    execute format('alter table public.course_materials validate constraint %I', expected_fk.conname);
  end if;

  select conname, convalidated into expected_fk
  from pg_constraint
  where conrelid = 'public.course_materials'::regclass
    and confrelid = 'public.courses'::regclass
    and contype = 'f'
    and conkey = array[course_materials_course_attribute]::smallint[]
    and confkey = array[courses_id_attribute]::smallint[]
  limit 1;
  if not found then
    alter table public.course_materials
      add constraint course_materials_course_id_courses_fk
      foreign key (course_id) references public.courses(id) on delete cascade;
  elsif not expected_fk.convalidated then
    execute format('alter table public.course_materials validate constraint %I', expected_fk.conname);
  end if;

  if exists (
    select 1
    from public.course_materials
    where mime_type not in ('application/pdf', 'video/mp4')
  ) then
    raise exception 'Unsupported course-material MIME types exist; refusing to alter the MIME constraint';
  end if;
  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.course_materials'::regclass
      and con.contype = 'c'
      and lower(pg_get_constraintdef(con.oid)) like '%mime_type%'
      and lower(pg_get_constraintdef(con.oid)) like '%application/pdf%'
      and lower(pg_get_constraintdef(con.oid)) like '%video/mp4%'
  ) then
    alter table public.course_materials
      add constraint course_materials_mime_type_allowed_check
      check (mime_type in ('application/pdf', 'video/mp4')) not valid;
    alter table public.course_materials
      validate constraint course_materials_mime_type_allowed_check;
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.course_materials'::regclass
      and i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = course_materials_path_attribute
  ) then
    create unique index course_materials_storage_path_repair_uidx
      on public.course_materials(storage_path);
  end if;

  for unique_item in
    select conname, conindid
    from pg_constraint
    where conrelid = 'public.course_materials'::regclass
      and contype = 'u'
      and conkey = array[course_materials_lesson_attribute]::smallint[]
  loop
    if exists (
      select 1 from pg_constraint
      where contype = 'f'
        and confrelid = 'public.course_materials'::regclass
        and conindid = unique_item.conindid
    ) then
      raise exception 'Lesson-only uniqueness is referenced by a foreign key; refusing to drop it';
    end if;
    execute format('alter table public.course_materials drop constraint %I', unique_item.conname);
  end loop;

  for unique_item in
    select ns.nspname as schema_name, idx.relname as index_name, i.indexrelid
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    where i.indrelid = 'public.course_materials'::regclass
      and i.indisunique
      and not i.indisprimary
      and i.indnkeyatts = 1
      and i.indkey[0] = course_materials_lesson_attribute
      and not exists (
        select 1 from pg_constraint c where c.conindid = i.indexrelid
      )
  loop
    execute format('drop index %I.%I', unique_item.schema_name, unique_item.index_name);
  end loop;
end;
$$;

alter table public.course_materials
  alter column lesson_id drop not null;

create or replace function public.save_course_payment_settings(
  configured_bank text,
  configured_account_name text,
  configured_account_number text,
  configured_account_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_row tid;
  existing_account_type text;
  effective_account_type text;
begin
  if auth.uid() is null
     or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;

  perform pg_advisory_xact_lock(760501, 1);
  select ctid, account_type
    into target_row, existing_account_type
  from public.course_payment_settings
  order by updated_at desc nulls last
  limit 1
  for update;

  if configured_bank is null
     and configured_account_name is null
     and configured_account_number is null
     and configured_account_type is null then
    if target_row is not null then
      update public.course_payment_settings
      set bank_name = null,
          account_name = null,
          account_number = null,
          account_type = null,
          updated_at = now(),
          updated_by = auth.uid()
      where ctid = target_row;
    end if;
    return;
  end if;

  effective_account_type := nullif(btrim(configured_account_type), '');
  if effective_account_type is null then
    effective_account_type := nullif(btrim(existing_account_type), '');
  end if;
  if length(btrim(coalesce(configured_bank, ''))) = 0
     or length(btrim(coalesce(configured_account_name, ''))) = 0
     or length(btrim(coalesce(configured_account_number, ''))) = 0
     or effective_account_type is null
     or length(configured_bank) > 100
     or length(configured_account_name) > 100
     or length(configured_account_number) > 40
     or length(effective_account_type) > 40 then
    raise exception 'All four bank details are required';
  end if;

  if target_row is null then
    insert into public.course_payment_settings (
      bank_name, account_name, account_number, account_type, updated_by
    )
    values (
      btrim(configured_bank),
      btrim(configured_account_name),
      btrim(configured_account_number),
      effective_account_type,
      auth.uid()
    );
  else
    update public.course_payment_settings
    set bank_name = btrim(configured_bank),
        account_name = btrim(configured_account_name),
        account_number = btrim(configured_account_number),
        account_type = effective_account_type,
        updated_at = now(),
        updated_by = auth.uid()
    where ctid = target_row;
  end if;
end;
$$;

create or replace function public.save_course_payment_settings(
  configured_bank text,
  configured_account_name text,
  configured_account_number text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.save_course_payment_settings(
    configured_bank,
    configured_account_name,
    configured_account_number,
    null
  );
end;
$$;

revoke all on function public.save_course_payment_settings(text, text, text, text)
  from public, anon, service_role;
grant execute on function public.save_course_payment_settings(text, text, text, text)
  to authenticated;
revoke all on function public.save_course_payment_settings(text, text, text)
  from public, anon, service_role;
grant execute on function public.save_course_payment_settings(text, text, text)
  to authenticated;

do $$
begin
  if (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'save_course_payment_settings'
  ) <> 2 then
    raise exception 'Unexpected save_course_payment_settings overload found; refusing ambiguous RPC state';
  end if;
end;
$$;

create or replace function public.save_course_material_v2(
  target_course_id uuid,
  target_lesson_id uuid,
  material_path text,
  material_name text,
  material_mime text,
  replace_material_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  lesson_course_id uuid;
  object_metadata jsonb;
  saved_id uuid;
  object_folders text[];
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  if target_course_id is null
     or material_path is null
     or material_mime not in ('application/pdf', 'video/mp4')
     or material_name is null
     or length(btrim(material_name)) not between 1 and 255 then
    raise exception 'Material file is invalid';
  end if;
  if position('/' in btrim(material_name)) > 0 then
    raise exception 'Material filename is invalid';
  end if;
  if not exists (select 1 from public.courses where id = target_course_id) then
    raise exception 'Course not found';
  end if;

  object_folders := storage.foldername(material_path);
  if object_folders is null
     or cardinality(object_folders) <> 2
     or object_folders[1] <> target_course_id::text then
    raise exception 'Material Storage path does not match the selected course';
  end if;
  if target_lesson_id is null then
    if object_folders[2] <> 'course' then
      raise exception 'Course-level materials must use the course Storage folder';
    end if;
  else
    select course_id into lesson_course_id
    from public.lessons
    where id = target_lesson_id and status <> 'archived';
    if not found or lesson_course_id is distinct from target_course_id then
      raise exception 'Lesson does not belong to the selected course';
    end if;
    if object_folders[2] <> target_lesson_id::text then
      raise exception 'Lesson material Storage path does not match the selected lesson';
    end if;
  end if;

  select metadata into object_metadata
  from storage.objects
  where bucket_id = 'course-materials'
    and name = material_path;
  if not found
     or coalesce(object_metadata->>'mimetype', '') <> material_mime
     or (
       case
         when coalesce(object_metadata->>'size', '') ~ '^[0-9]+$'
           then (object_metadata->>'size')::bigint not between 1 and 52428800
         else true
       end
     ) then
    raise exception 'Uploaded material is missing or does not match its allowed type and size';
  end if;

  if replace_material_id is null then
    insert into public.course_materials (
      course_id, lesson_id, storage_path, file_name, mime_type, updated_by
    )
    values (
      target_course_id, target_lesson_id, material_path,
      btrim(material_name), material_mime, auth.uid()
    )
    returning id into saved_id;
  else
    update public.course_materials
    set storage_path = material_path,
        file_name = btrim(material_name),
        mime_type = material_mime,
        updated_at = clock_timestamp(),
        updated_by = auth.uid()
    where id = replace_material_id
      and course_id = target_course_id
      and lesson_id is not distinct from target_lesson_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Existing course material not found in the selected course area';
    end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_course_material_v2(uuid, uuid, text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.save_course_material_v2(uuid, uuid, text, text, text, uuid)
  to authenticated;

create or replace function public.save_course_material(
  target_lesson_id uuid,
  material_path text,
  material_name text,
  material_mime text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare target_course_id uuid;
begin
  if target_lesson_id is null then
    raise exception 'A lesson is required by the legacy material function';
  end if;
  select course_id into target_course_id
  from public.lessons
  where id = target_lesson_id;
  if not found then raise exception 'Lesson not found'; end if;
  perform public.save_course_material_v2(
    target_course_id, target_lesson_id, material_path, material_name, material_mime, null
  );
end;
$$;
revoke all on function public.save_course_material(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.save_course_material(uuid, text, text, text)
  to authenticated;

create or replace function public.save_course_material_record(
  target_lesson_id uuid,
  material_path text,
  material_name text,
  material_mime text,
  replace_material_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare target_course_id uuid;
begin
  if target_lesson_id is null then
    raise exception 'A lesson is required by the legacy material function';
  end if;
  select course_id into target_course_id
  from public.lessons
  where id = target_lesson_id;
  if not found then raise exception 'Lesson not found'; end if;
  return public.save_course_material_v2(
    target_course_id, target_lesson_id, material_path, material_name, material_mime, replace_material_id
  );
end;
$$;
revoke all on function public.save_course_material_record(uuid, text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.save_course_material_record(uuid, text, text, text, uuid)
  to authenticated;

create or replace function public.remove_course_material(target_lesson_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  material_count integer;
  previous_path text;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  select count(*) into material_count
  from public.course_materials
  where lesson_id = target_lesson_id;
  if material_count > 1 then
    raise exception 'Select a specific material record to remove';
  end if;
  if material_count = 0 then return null; end if;
  delete from public.course_materials
  where lesson_id = target_lesson_id
  returning storage_path into previous_path;
  return previous_path;
end;
$$;
revoke all on function public.remove_course_material(uuid)
  from public, anon, service_role;
grant execute on function public.remove_course_material(uuid) to authenticated;

create or replace function public.remove_course_material_record(target_material_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare previous_path text;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  select storage_path into previous_path
  from public.course_materials
  where id = target_material_id
  for update;
  if previous_path is null then raise exception 'Course material not found'; end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'course-materials' and name = previous_path
  ) then
    raise exception 'Delete the private Storage file before removing its material record';
  end if;
  delete from public.course_materials where id = target_material_id;
  return previous_path;
end;
$$;
revoke all on function public.remove_course_material_record(uuid)
  from public, anon, service_role;
grant execute on function public.remove_course_material_record(uuid) to authenticated;

create or replace function public.delete_lesson(target_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_lessons') then
    raise exception 'Lesson management permission required';
  end if;
  if exists (
    select 1 from public.course_materials where lesson_id = target_lesson_id
  ) then
    raise exception 'Delete lesson materials from private Storage before deleting the lesson';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'course-materials'
      and (storage.foldername(name))[2] = target_lesson_id::text
  ) then
    raise exception 'Delete all lesson files from private Storage before deleting the lesson';
  end if;
  delete from public.lessons where id = target_lesson_id;
  if not found then raise exception 'Lesson not found'; end if;
end;
$$;
revoke all on function public.delete_lesson(uuid) from public, anon, service_role;
grant execute on function public.delete_lesson(uuid) to authenticated;

create or replace function public.delete_course(target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_courses') then
    raise exception 'Course management permission required';
  end if;
  if exists (select 1 from public.course_orders where course_id = target_id)
     or exists (select 1 from public.course_access where course_id = target_id)
     or exists (select 1 from public.course_guest_access where course_id = target_id) then
    raise exception 'Course deletion is blocked because payment or entitlement history exists';
  end if;
  if exists (select 1 from public.course_materials where course_id = target_id) then
    raise exception 'Delete all course materials from private Storage before deleting the course';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'course-materials'
      and (storage.foldername(name))[1] = target_id::text
  ) then
    raise exception 'Delete all course files from private Storage before deleting the course';
  end if;
  delete from public.lessons where course_id = target_id;
  delete from public.courses where id = target_id;
  if not found then raise exception 'Course not found'; end if;
end;
$$;
revoke all on function public.delete_course(uuid) from public, anon, service_role;
grant execute on function public.delete_course(uuid) to authenticated;

create or replace function public.write_sensitive_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  before_data jsonb;
  after_data jsonb;
  target_id uuid;
  changed_fields text[];
  audit_details jsonb;
begin
  if tg_op <> 'INSERT' then
    before_data := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    after_data := to_jsonb(new);
  end if;

  target_id := coalesce(
    case
      when (after_data ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (after_data ->> 'id')::uuid
    end,
    case
      when (before_data ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (before_data ->> 'id')::uuid
    end,
    case
      when (after_data ->> 'profile_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (after_data ->> 'profile_id')::uuid
    end,
    case
      when (before_data ->> 'profile_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (before_data ->> 'profile_id')::uuid
    end
  );

  select coalesce(array_agg(changed.key order by changed.key), array[]::text[])
    into changed_fields
    from (
      select jsonb_object_keys(coalesce(before_data, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(after_data, '{}'::jsonb)) as key
    ) changed
   where changed.key not in ('created_at', 'updated_at')
     and (before_data -> changed.key) is distinct from (after_data -> changed.key);

  audit_details := jsonb_build_object('changed_fields', to_jsonb(changed_fields));
  if tg_table_name = 'profiles' and 'role' = any(changed_fields) then
    audit_details := audit_details || jsonb_build_object(
      'role_from', before_data ->> 'role',
      'role_to', after_data ->> 'role'
    );
  elsif tg_table_name = 'students' and 'is_active' = any(changed_fields) then
    audit_details := audit_details || jsonb_build_object(
      'active_from', before_data -> 'is_active',
      'active_to', after_data -> 'is_active'
    );
  elsif tg_table_name = 'results' and 'result_status' = any(changed_fields) then
    audit_details := audit_details || jsonb_build_object(
      'status_from', before_data ->> 'result_status',
      'status_to', after_data ->> 'result_status'
    );
  elsif tg_table_name = 'admin_permissions' then
    audit_details := audit_details || jsonb_build_object(
      'permission_key', coalesce(after_data ->> 'permission_key', before_data ->> 'permission_key')
    );
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    target_id,
    audit_details
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter table public.course_materials enable row level security;
drop policy if exists materials_admin_or_access_read on public.course_materials;
create policy materials_admin_or_access_read on public.course_materials
  for select to authenticated using (
    public.has_admin_permission('manage_course_materials')
    or (
      public.has_course_access(course_id)
      and exists (
        select 1
        from public.courses c
        left join public.lessons l
          on l.id = course_materials.lesson_id and l.course_id = course_materials.course_id
        where c.id = course_materials.course_id
          and c.status = 'published'
          and (
            course_materials.lesson_id is null
            or (l.id is not null and l.status = 'published')
          )
      )
    )
  );

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'course-materials',
  'course-materials',
  false,
  52428800,
  array['application/pdf', 'video/mp4']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = array['application/pdf', 'video/mp4'];

drop policy if exists course_material_objects_admin_insert on storage.objects;
create policy course_material_objects_admin_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'course-materials'
    and public.has_admin_permission('manage_course_materials')
    and cardinality(storage.foldername(name)) = 2
    and exists (
      select 1 from public.courses c
      where c.id::text = (storage.foldername(name))[1]
        and (
          (storage.foldername(name))[2] = 'course'
          or exists (
            select 1 from public.lessons l
            where l.course_id = c.id
              and l.id::text = (storage.foldername(name))[2]
              and l.status <> 'archived'
          )
        )
    )
  );

drop policy if exists course_material_objects_authorized_read on storage.objects;
create policy course_material_objects_authorized_read on storage.objects
  for select to authenticated using (
    bucket_id = 'course-materials'
    and (
      public.has_admin_permission('manage_course_materials')
      or exists (
        select 1
        from public.course_materials cm
        join public.courses c on c.id = cm.course_id
        left join public.lessons l
          on l.id = cm.lesson_id and l.course_id = cm.course_id
        where cm.storage_path = storage.objects.name
          and c.status = 'published'
          and (
            cm.lesson_id is null
            or (l.id is not null and l.status = 'published')
          )
          and public.has_course_access(cm.course_id)
      )
    )
  );

commit;
