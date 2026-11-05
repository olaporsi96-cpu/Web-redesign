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

drop policy if exists courses_admin_read on public.courses;
create policy courses_admin_read on public.courses
  for select to authenticated using (
    public.has_admin_permission('manage_courses')
    or public.has_admin_permission('manage_lessons')
    or public.has_admin_permission('publish_unpublish_lessons')
    or public.has_admin_permission('manage_course_materials')
    or public.has_admin_permission('view_orders_payments')
  );

drop policy if exists lessons_admin_read on public.lessons;
create policy lessons_admin_read on public.lessons
  for select to authenticated using (
    public.has_admin_permission('manage_lessons')
    or public.has_admin_permission('publish_unpublish_lessons')
    or public.has_admin_permission('manage_course_materials')
  );

create or replace function public.set_lesson_publish_status(
  target_id uuid,
  requested_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  current_status text;
  course_status text;
begin
  if auth.uid() is null or not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Lesson publication permission required';
  end if;
  if target_id is null or requested_status is null or requested_status not in ('draft', 'published') then
    raise exception 'The lesson publication request is invalid';
  end if;

  select l.status, c.status
    into current_status, course_status
    from public.lessons l
    join public.courses c on c.id = l.course_id
   where l.id = target_id
   for update of l;
  if not found or current_status = 'archived' then
    raise exception 'Active lesson not found';
  end if;
  if requested_status = 'published' and course_status <> 'published' then
    raise exception 'Publish the course before publishing its lessons';
  end if;

  update public.lessons
     set status = requested_status,
         updated_at = now()
   where id = target_id;
end;
$$;

revoke all on function public.set_lesson_publish_status(uuid, text) from public, anon;
grant execute on function public.set_lesson_publish_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
