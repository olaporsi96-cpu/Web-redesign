-- Adebola College TEST/staging repair migration.
-- Preserves existing course orders and uploaded course-material records.
begin;

alter table public.course_orders
  add column if not exists buyer_email_sent_at timestamptz,
  add column if not exists buyer_email_error text;

do $$
declare
  unique_constraint record;
  lesson_attribute smallint;
begin
  select attnum into lesson_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'lesson_id'
    and not attisdropped;

  for unique_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.course_materials'::regclass
      and contype = 'u'
      and lesson_attribute = any(conkey)
  loop
    execute format(
      'alter table public.course_materials drop constraint %I',
      unique_constraint.conname
    );
  end loop;
end;
$$;

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
declare
  target_course_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  if material_mime not in ('application/pdf', 'video/mp4')
     or material_name is null or length(btrim(material_name)) not between 1 and 255 then
    raise exception 'Material file is invalid';
  end if;
  select course_id into target_course_id
  from public.lessons
  where id = target_lesson_id and status <> 'archived';
  if not found then raise exception 'Lesson not found'; end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'course-materials'
      and name = material_path
      and (storage.foldername(name))[1] = target_course_id::text
      and (storage.foldername(name))[2] = target_lesson_id::text
  ) then
    raise exception 'Material upload is missing';
  end if;
  insert into public.course_materials (
    course_id, lesson_id, storage_path, file_name, mime_type, updated_by
  )
  values (
    target_course_id, target_lesson_id, material_path,
    btrim(material_name), material_mime, auth.uid()
  );
end;
$$;
revoke all on function public.save_course_material(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.save_course_material(uuid, text, text, text) to authenticated;

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
declare
  target_course_id uuid;
  saved_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  if material_mime not in ('application/pdf', 'video/mp4')
     or material_name is null or length(btrim(material_name)) not between 1 and 255 then
    raise exception 'Material file is invalid';
  end if;
  select course_id into target_course_id
  from public.lessons
  where id = target_lesson_id and status <> 'archived';
  if not found then raise exception 'Lesson not found'; end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'course-materials'
      and name = material_path
      and (storage.foldername(name))[1] = target_course_id::text
      and (storage.foldername(name))[2] = target_lesson_id::text
  ) then
    raise exception 'Material upload is missing';
  end if;
  if replace_material_id is not null then
    update public.course_materials
    set course_id = target_course_id,
        lesson_id = target_lesson_id,
        storage_path = material_path,
        file_name = btrim(material_name),
        mime_type = material_mime,
        updated_at = clock_timestamp(),
        updated_by = auth.uid()
    where id = replace_material_id
      and lesson_id = target_lesson_id
    returning id into saved_id;
    if saved_id is null then raise exception 'Existing course material not found'; end if;
  else
    insert into public.course_materials (
      course_id, lesson_id, storage_path, file_name, mime_type, updated_by
    )
    values (
      target_course_id, target_lesson_id, material_path,
      btrim(material_name), material_mime, auth.uid()
    )
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_course_material_record(uuid, text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.save_course_material_record(uuid, text, text, text, uuid) to authenticated;

create or replace function public.remove_course_material(target_lesson_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  material_count integer;
  target_material_id uuid;
  previous_path text;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;

  select count(*)
    into material_count
  from public.course_materials
  where lesson_id = target_lesson_id;

  if material_count > 1 then
    raise exception 'Select a specific material record to remove';
  end if;
  if material_count = 0 then
    return null;
  end if;

  select id into target_material_id
  from public.course_materials
  where lesson_id = target_lesson_id;

  delete from public.course_materials
  where id = target_material_id
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
  delete from public.course_materials
  where id = target_material_id
  returning storage_path into previous_path;
  if previous_path is null then raise exception 'Course material not found'; end if;
  return previous_path;
end;
$$;
revoke all on function public.remove_course_material_record(uuid)
  from public, anon, service_role;
grant execute on function public.remove_course_material_record(uuid) to authenticated;

commit;
