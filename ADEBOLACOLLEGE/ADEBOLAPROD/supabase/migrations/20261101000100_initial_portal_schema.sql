create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  role text not null default 'student'
    check (role in ('student', 'sub_admin', 'main_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_key on public.profiles (lower(email));
create unique index profiles_single_main_admin_key
  on public.profiles ((role))
  where role = 'main_admin';

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  student_number text not null check (length(btrim(student_number)) > 0),
  email text not null check (length(btrim(email)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index students_student_number_lower_key on public.students (lower(student_number));
create unique index students_email_lower_key on public.students (lower(email));

create table public.results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  examination_number text not null check (length(btrim(examination_number)) > 0),
  candidate_number text not null check (length(btrim(candidate_number)) > 0),
  school text not null check (length(btrim(school)) > 0),
  exam_year text not null check (length(btrim(exam_year)) > 0),
  result_status text not null default 'Draft'
    check (result_status in ('Draft', 'Ready for review', 'Released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.result_subjects (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.results (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  score text not null default '',
  grade text not null default '',
  remark text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null check (permission_key in (
    'view_dashboard',
    'view_students',
    'manage_student_records',
    'manage_results',
    'release_results',
    'manage_courses',
    'manage_lessons',
    'manage_admin_users'
  )),
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index students_profile_id_idx on public.students (profile_id);
create index results_student_status_idx on public.results (student_id, result_status);
create index results_exam_year_idx on public.results (exam_year);
create index results_examination_number_idx on public.results (examination_number);
create index results_candidate_number_idx on public.results (candidate_number);
create index result_subjects_result_order_idx on public.result_subjects (result_id, sort_order);
create index admin_permissions_key_profile_idx on public.admin_permissions (permission_key, profile_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create function public.is_main_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'main_admin'
  );
$$;

create function public.is_active_student_profile()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.students s on s.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'student'
      and s.is_active
  );
$$;

create function public.has_admin_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.is_main_admin()
    or exists (
      select 1
      from public.profiles p
      join public.admin_permissions ap on ap.profile_id = p.id
      where p.id = auth.uid()
        and p.role = 'sub_admin'
        and ap.permission_key = required_permission
    );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.is_main_admin() from public, anon;
revoke all on function public.is_active_student_profile() from public, anon;
revoke all on function public.has_admin_permission(text) from public, anon;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.is_main_admin() to authenticated;
grant execute on function public.is_active_student_profile() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;

-- One-time bootstrap: create the verified Auth user first, then call this function
-- once from a trusted server using a service-role credential. Drop the function
-- after success. The service-role key must never be shipped to a browser.
create function public.bootstrap_main_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  admin_user auth.users%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Main Admin bootstrap requires service_role';
  end if;

  if exists (select 1 from public.profiles where role = 'main_admin') then
    raise exception 'A Main Admin is already configured';
  end if;

  select *
    into admin_user
    from auth.users
   where id = target_user_id
     and lower(email) = 'admin@adebolacollege.org'
     and email_confirmed_at is not null;

  if not found then
    raise exception 'The target must be the verified planned Main Admin Auth user';
  end if;
  if exists (
    select 1 from public.students s
    where s.profile_id = target_user_id
  ) then
    raise exception 'A student account cannot be promoted through bootstrap';
  end if;

  insert into public.profiles (id, display_name, email, role)
  values (
    admin_user.id,
    coalesce(nullif(btrim(admin_user.raw_user_meta_data ->> 'name'), ''), 'Adebola Main Admin'),
    admin_user.email,
    'main_admin'
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        role = 'main_admin',
        updated_at = now();
end;
$$;

revoke all on function public.bootstrap_main_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_main_admin(uuid) to service_role;

create function public.assign_sub_admin(
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
      'manage_lessons'
    )
  ) then
    raise exception 'One or more Sub-Admin permissions are invalid';
  end if;

  select *
    into target_user
    from auth.users u
   where u.id = target_user_id
     and u.email_confirmed_at is not null;
  if not found then
    raise exception 'The Sub-Admin must be an existing verified Auth user';
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

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();
create trigger results_set_updated_at
  before update on public.results
  for each row execute function public.set_updated_at();
create trigger result_subjects_set_updated_at
  before update on public.result_subjects
  for each row execute function public.set_updated_at();

create function public.write_sensitive_audit_log()
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
    (after_data ->> 'id')::uuid,
    (before_data ->> 'id')::uuid,
    (after_data ->> 'profile_id')::uuid,
    (before_data ->> 'profile_id')::uuid
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

revoke all on function public.write_sensitive_audit_log() from public, anon, authenticated;

create trigger profiles_audit_log
  after insert or update or delete on public.profiles
  for each row execute function public.write_sensitive_audit_log();
create trigger students_audit_log
  after insert or update or delete on public.students
  for each row execute function public.write_sensitive_audit_log();
create trigger results_audit_log
  after insert or update or delete on public.results
  for each row execute function public.write_sensitive_audit_log();
create trigger result_subjects_audit_log
  after insert or update or delete on public.result_subjects
  for each row execute function public.write_sensitive_audit_log();
create trigger admin_permissions_audit_log
  after insert or update or delete on public.admin_permissions
  for each row execute function public.write_sensitive_audit_log();

create function public.transition_result_status(target_result_id uuid, next_status text)
returns public.results
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_result public.results%rowtype;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_results') then
    raise exception 'manage_results permission required';
  end if;

  select *
    into current_result
    from public.results
   where id = target_result_id
   for update;

  if not found then
    raise exception 'Result not found';
  end if;

  if current_result.result_status = 'Draft'
     and next_status = 'Ready for review' then
    null;
  elsif current_result.result_status = 'Ready for review'
        and next_status = 'Draft' then
    null;
  elsif current_result.result_status = 'Ready for review'
        and next_status = 'Released'
        and public.has_admin_permission('release_results') then
    null;
  elsif current_result.result_status = 'Released'
        and next_status = 'Draft'
        and public.is_main_admin() then
    null;
  else
    raise exception 'Status transition is not permitted';
  end if;

  update public.results
     set result_status = next_status,
         updated_at = now()
   where id = target_result_id
   returning * into current_result;

  return current_result;
end;
$$;

revoke all on function public.transition_result_status(uuid, text) from public, anon;
grant execute on function public.transition_result_status(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.results enable row level security;
alter table public.result_subjects enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_or_main_admin
  on public.profiles for select to authenticated
  using (
    public.is_main_admin()
    or (
      id = auth.uid()
      and (
        role <> 'student'
        or public.is_active_student_profile()
      )
    )
    or (
      role = 'student'
      and (
        public.has_admin_permission('view_students')
        or public.has_admin_permission('manage_student_records')
        or public.has_admin_permission('manage_results')
      )
    )
  );

create policy students_select_own_or_authorized_admin
  on public.students for select to authenticated
  using (
    (profile_id = auth.uid() and public.is_active_student_profile())
    or public.has_admin_permission('view_students')
    or public.has_admin_permission('manage_student_records')
    or public.has_admin_permission('manage_results')
  );

create policy students_insert_authorized_admin
  on public.students for insert to authenticated
  with check (
    public.has_admin_permission('manage_student_records')
    and exists (
      select 1 from public.profiles p
      where p.id = students.profile_id
        and p.role = 'student'
    )
  );

create policy students_update_authorized_admin
  on public.students for update to authenticated
  using (public.has_admin_permission('manage_student_records'))
  with check (
    public.has_admin_permission('manage_student_records')
    and exists (
      select 1 from public.profiles p
      where p.id = students.profile_id
        and p.role = 'student'
    )
  );

create policy results_select_own_released_or_authorized_admin
  on public.results for select to authenticated
  using (
    public.has_admin_permission('manage_results')
    or (
      result_status = 'Released'
      and public.is_active_student_profile()
      and exists (
        select 1
        from public.students s
        where s.id = results.student_id
          and s.profile_id = auth.uid()
          and s.is_active
      )
    )
  );

create policy results_insert_authorized_admin
  on public.results for insert to authenticated
  with check (
    public.has_admin_permission('manage_results')
    and result_status = 'Draft'
  );

create policy results_update_authorized_admin
  on public.results for update to authenticated
  using (public.has_admin_permission('manage_results'))
  with check (public.has_admin_permission('manage_results'));

create policy result_subjects_select_visible_result
  on public.result_subjects for select to authenticated
  using (
    exists (
      select 1
      from public.results r
      where r.id = result_subjects.result_id
        and (
          public.has_admin_permission('manage_results')
          or (
            r.result_status = 'Released'
            and public.is_active_student_profile()
            and exists (
              select 1
              from public.students s
              where s.id = r.student_id
                and s.profile_id = auth.uid()
                and s.is_active
            )
          )
        )
    )
  );

create policy result_subjects_insert_authorized_admin
  on public.result_subjects for insert to authenticated
  with check (public.has_admin_permission('manage_results'));

create policy result_subjects_update_authorized_admin
  on public.result_subjects for update to authenticated
  using (public.has_admin_permission('manage_results'))
  with check (public.has_admin_permission('manage_results'));

create policy result_subjects_delete_authorized_admin
  on public.result_subjects for delete to authenticated
  using (public.has_admin_permission('manage_results'));

create policy admin_permissions_select_own_or_main_admin
  on public.admin_permissions for select to authenticated
  using (profile_id = auth.uid() or public.is_main_admin());

create policy admin_permissions_insert_main_admin_for_sub_admin
  on public.admin_permissions for insert to authenticated
  with check (
    public.is_main_admin()
    and profile_id <> auth.uid()
    and permission_key <> 'manage_admin_users'
    and exists (
      select 1 from public.profiles p
      where p.id = admin_permissions.profile_id
        and p.role = 'sub_admin'
    )
  );

create policy admin_permissions_update_main_admin_for_sub_admin
  on public.admin_permissions for update to authenticated
  using (
    public.is_main_admin()
    and profile_id <> auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = admin_permissions.profile_id
        and p.role = 'sub_admin'
    )
  )
  with check (
    public.is_main_admin()
    and profile_id <> auth.uid()
    and permission_key <> 'manage_admin_users'
    and exists (
      select 1 from public.profiles p
      where p.id = admin_permissions.profile_id
        and p.role = 'sub_admin'
    )
  );

create policy admin_permissions_delete_main_admin_for_sub_admin
  on public.admin_permissions for delete to authenticated
  using (
    public.is_main_admin()
    and profile_id <> auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = admin_permissions.profile_id
        and p.role = 'sub_admin'
    )
  );

create policy audit_logs_select_authorized_admin
  on public.audit_logs for select to authenticated
  using (public.is_main_admin());

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.students from public, anon, authenticated;
revoke all on public.results from public, anon, authenticated;
revoke all on public.result_subjects from public, anon, authenticated;
revoke all on public.admin_permissions from public, anon, authenticated;
revoke all on public.audit_logs from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.students to authenticated;
grant insert (profile_id, name, student_number, email) on public.students to authenticated;
grant update (name, student_number, email, is_active) on public.students to authenticated;
grant select on public.results to authenticated;
grant insert (student_id, examination_number, candidate_number, school, exam_year)
  on public.results to authenticated;
grant update (student_id, examination_number, candidate_number, school, exam_year)
  on public.results to authenticated;
grant select on public.result_subjects to authenticated;
grant insert (result_id, name, score, grade, remark, sort_order)
  on public.result_subjects to authenticated;
grant update (name, score, grade, remark, sort_order)
  on public.result_subjects to authenticated;
grant delete on public.result_subjects to authenticated;
grant select, insert, update, delete on public.admin_permissions to authenticated;
grant select on public.audit_logs to authenticated;
