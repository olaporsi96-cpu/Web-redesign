alter table public.students
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

alter table public.profiles
  add column if not exists sub_admin_archived_at timestamptz,
  add column if not exists sub_admin_archived_by uuid references auth.users (id) on delete set null;

revoke update (is_active) on public.students from authenticated;
grant update (name, student_number, email) on public.students to authenticated;

create index if not exists profiles_active_sub_admins_idx
  on public.profiles (role, display_name)
  where role = 'sub_admin' and sub_admin_archived_at is null;

create or replace function public.has_admin_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select required_permission is not null
    and auth.uid() is not null
    and (
      public.is_main_admin()
      or (
        required_permission in (
          'view_dashboard',
          'view_students',
          'manage_student_records',
          'manage_results',
          'release_results',
          'manage_courses',
          'manage_courses_lessons',
          'manage_lessons',
          'publish_unpublish_lessons',
          'manage_course_materials',
          'view_orders_payments',
          'manage_catalogue_settings'
        )
        and exists (
          select 1
          from public.profiles p
          join public.admin_permissions ap on ap.profile_id = p.id
          where p.id = auth.uid()
            and p.role = 'sub_admin'
            and p.sub_admin_archived_at is null
            and (
              ap.permission_key = required_permission
              or (
                required_permission = 'manage_courses'
                and ap.permission_key = 'manage_courses_lessons'
              )
              or (
                required_permission = 'manage_lessons'
                and ap.permission_key = 'manage_courses_lessons'
              )
            )
        )
      )
    );
$$;

revoke all on function public.has_admin_permission(text) from public, anon;
grant execute on function public.has_admin_permission(text) to authenticated;

create or replace function public.set_student_archive_state(
  target_student_id uuid,
  target_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  previous_is_active boolean;
  previous_archived_at timestamptz;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_student_records') then
    raise exception 'Student-management permission required';
  end if;
  if target_student_id is null or target_is_active is null then
    raise exception 'The student archive request is invalid';
  end if;

  select is_active, archived_at
    into previous_is_active, previous_archived_at
    from public.students
   where id = target_student_id
   for update;
  if not found then
    raise exception 'Student record not found';
  end if;

  if previous_is_active = target_is_active then
    return;
  end if;

  if target_is_active then
    update public.students
       set is_active = true,
           archived_at = null,
           archived_by = null,
           updated_at = statement_timestamp()
     where id = target_student_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      'student.restored',
      'student',
      target_student_id,
      jsonb_build_object('previous_archived_at', previous_archived_at)
    );
  else
    update public.students
       set is_active = false,
           archived_at = coalesce(archived_at, statement_timestamp()),
           archived_by = case when archived_at is null then auth.uid() else archived_by end,
           updated_at = statement_timestamp()
     where id = target_student_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      'student.archived',
      'student',
      target_student_id,
      jsonb_build_object(
        'archived_at', coalesce(previous_archived_at, statement_timestamp())
      )
    );
  end if;
end;
$$;

revoke all on function public.set_student_archive_state(uuid, boolean) from public, anon;
grant execute on function public.set_student_archive_state(uuid, boolean) to authenticated;

create or replace function public.set_sub_admin_archived(
  target_user_id uuid,
  requested_archived boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  previous_archived_at timestamptz;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Main Admin permission required';
  end if;
  if target_user_id is null or requested_archived is null then
    raise exception 'The Sub-Admin archive request is invalid';
  end if;

  select sub_admin_archived_at
    into previous_archived_at
    from public.profiles
   where id = target_user_id
     and role = 'sub_admin'
   for update;
  if not found then
    raise exception 'Sub-Admin profile not found';
  end if;
  if (previous_archived_at is not null) = requested_archived then
    return;
  end if;

  if requested_archived then
    update public.profiles
       set sub_admin_archived_at = coalesce(sub_admin_archived_at, statement_timestamp()),
           sub_admin_archived_by = case
             when sub_admin_archived_at is null then auth.uid()
             else sub_admin_archived_by
           end,
           updated_at = statement_timestamp()
     where id = target_user_id
       and role = 'sub_admin';
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      'sub_admin.archived',
      'profile',
      target_user_id,
      jsonb_build_object('archived_at', coalesce(previous_archived_at, statement_timestamp()))
    );
  else
    update public.profiles
       set sub_admin_archived_at = null,
           sub_admin_archived_by = null,
           updated_at = statement_timestamp()
     where id = target_user_id
       and role = 'sub_admin';
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(),
      'sub_admin.restored',
      'profile',
      target_user_id,
      jsonb_build_object('previous_archived_at', previous_archived_at)
    );
  end if;
end;
$$;

revoke all on function public.set_sub_admin_archived(uuid, boolean) from public, anon;
grant execute on function public.set_sub_admin_archived(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
