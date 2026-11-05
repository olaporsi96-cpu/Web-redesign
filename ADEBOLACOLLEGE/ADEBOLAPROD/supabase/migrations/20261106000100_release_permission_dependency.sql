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
  if target_user_id = auth.uid() then
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
  if target_display_name is null or length(btrim(target_display_name)) = 0 then
    raise exception 'Sub-Admin display name is required';
  end if;
  if assigned_permissions is null or exists (
    select 1
    from unnest(assigned_permissions) as assigned(permission_key)
    where permission_key is null or permission_key not in (
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
  if not found then
    raise exception 'The invited Auth user does not exist';
  end if;

  insert into public.profiles (id, display_name, email, role, admin_enabled)
  values (target_user.id, btrim(target_display_name), target_user.email, 'sub_admin', true)
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
