create or replace function public.create_invited_student(
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
    raise exception 'manage_student_records permission required';
  end if;
  if target_user_id is null
     or target_name is null
     or length(btrim(target_name)) = 0
     or length(target_name) > 100
     or target_student_number is null
     or length(btrim(target_student_number)) = 0
     or length(target_student_number) > 50 then
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
    select 1 from public.profiles p
    where p.id = target_user_id and p.role <> 'student'
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
