create or replace function public.is_main_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'main_admin'
  );
$$;

revoke all on function public.is_main_admin() from public;
grant execute on function public.is_main_admin() to anon, authenticated;

create or replace function public.has_admin_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select required_permission is not null
    and auth.uid() is not null
    and public.is_main_admin();
$$;

revoke all on function public.has_admin_permission(text) from public, anon;
grant execute on function public.has_admin_permission(text) to authenticated;

drop function if exists public.create_invited_student(uuid, text, text);
create function public.create_invited_student(
  target_user_id uuid,
  target_name text,
  target_student_number text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  target_user auth.users%rowtype;
  saved_student_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_student_records') then
    raise exception 'Main Admin permission required to create a student record';
  end if;
  if target_user_id is null
     or target_name is null
     or length(btrim(target_name)) not between 1 and 100
     or target_student_number is null
     or length(btrim(target_student_number)) not between 1 and 50 then
    raise exception 'Valid student name and number are required';
  end if;

  select *
    into target_user
    from auth.users u
   where u.id = target_user_id;
  if not found or target_user.email is null then
    raise exception 'The invited Auth user does not exist';
  end if;
  if exists (
    select 1
      from public.profiles p
     where p.id = target_user_id
       and p.role <> 'student'
  ) then
    raise exception 'This Auth user already has a non-student role';
  end if;

  insert into public.profiles (id, display_name, email, role)
  values (target_user.id, btrim(target_name), target_user.email, 'student')
  on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        updated_at = now()
  where public.profiles.role = 'student';

  insert into public.students (profile_id, name, student_number, email)
  values (target_user.id, btrim(target_name), btrim(target_student_number), target_user.email)
  returning id into saved_student_id;

  return saved_student_id;
end;
$$;

revoke all on function public.create_invited_student(uuid, text, text) from public, anon;
grant execute on function public.create_invited_student(uuid, text, text) to authenticated;

create or replace function public.assign_sub_admin(
  target_user_id uuid,
  target_display_name text,
  assigned_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  target_user auth.users%rowtype;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Main Admin permission required';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'A Main Admin cannot change their own role';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = target_user_id and p.role = 'main_admin'
  ) then
    raise exception 'The Main Admin role cannot be reassigned';
  end if;
  if exists (
    select 1 from public.students s
    where s.profile_id = target_user_id
  ) then
    raise exception 'A student profile cannot be converted to a Sub-Admin';
  end if;
  if target_display_name is null or length(btrim(target_display_name)) not between 1 and 80 then
    raise exception 'Sub-Admin display name is required';
  end if;
  if assigned_permissions is null or exists (
    select 1
      from unnest(assigned_permissions) as assigned(permission_key)
     where permission_key is null
        or permission_key not in (
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
  ) then
    raise exception 'One or more Sub-Admin permissions are invalid';
  end if;
  if 'release_results' = any(assigned_permissions)
     and not ('manage_results' = any(assigned_permissions)) then
    raise exception 'Releasing results also requires manage_results permission';
  end if;

  select *
    into target_user
    from auth.users u
   where u.id = target_user_id;
  if not found or target_user.email is null then
    raise exception 'The invited Auth user does not exist';
  end if;

  insert into public.profiles (id, display_name, email, role)
  values (target_user.id, btrim(target_display_name), target_user.email, 'sub_admin')
  on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = 'sub_admin',
        updated_at = now();

  delete from public.admin_permissions
   where profile_id = target_user_id;

  insert into public.admin_permissions (profile_id, permission_key)
  select target_user_id, permission_key
    from (
      select distinct assigned.permission_key
        from unnest(assigned_permissions) as assigned(permission_key)
    ) selected_permissions;
end;
$$;

revoke all on function public.assign_sub_admin(uuid, text, text[]) from public, anon;
grant execute on function public.assign_sub_admin(uuid, text, text[]) to authenticated;

create table if not exists public.school_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  event_type text not null check (event_type in ('school_event', 'outing')),
  event_date date not null,
  start_time time,
  end_time time,
  location text not null default '' check (length(location) <= 200),
  description text not null default '' check (length(description) <= 2000),
  timezone text not null default 'Africa/Lagos' check (timezone = 'Africa/Lagos'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists school_calendar_events_public_date_idx
  on public.school_calendar_events (event_date, start_time)
  where status = 'published';
create index if not exists school_calendar_events_admin_date_idx
  on public.school_calendar_events (status, event_date, start_time);

drop trigger if exists school_calendar_events_set_updated_at on public.school_calendar_events;
create trigger school_calendar_events_set_updated_at
  before update on public.school_calendar_events
  for each row execute function public.set_updated_at();

alter table public.school_calendar_events enable row level security;
grant select on public.school_calendar_events to anon, authenticated;
grant insert, update, delete on public.school_calendar_events to authenticated;

drop policy if exists school_calendar_events_public_read on public.school_calendar_events;
create policy school_calendar_events_public_read on public.school_calendar_events
  for select to anon, authenticated
  using (status = 'published' or public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_insert on public.school_calendar_events;
create policy school_calendar_events_main_admin_insert on public.school_calendar_events
  for insert to authenticated
  with check (public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_update on public.school_calendar_events;
create policy school_calendar_events_main_admin_update on public.school_calendar_events
  for update to authenticated
  using (public.is_main_admin())
  with check (public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_delete on public.school_calendar_events;
create policy school_calendar_events_main_admin_delete on public.school_calendar_events
  for delete to authenticated
  using (public.is_main_admin());

notify pgrst, 'reload schema';
