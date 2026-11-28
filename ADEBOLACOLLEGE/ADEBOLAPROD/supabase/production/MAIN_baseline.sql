-- ADEBOLA COLLEGE MAIN PRODUCTION BASELINE
-- Target project: wgixuojzjznktfbqelza
-- Creates production schema, authorization, RLS, RPCs and Storage infrastructure.
-- No TEST Auth users, students, results, courses, orders, audit rows or Storage files are imported.
-- Initial records are limited to required website-settings defaults and Storage bucket metadata.
-- No Main Admin Auth user or profile is created by this migration.
-- Derived from 18 reviewed source migrations. The future-dated 20261129000100 patch is excluded
-- because the guest email-status columns are already created by source 20261123000100.
BEGIN;

-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261101000100_initial_portal_schema.sql
-- Source blob: 8f469996eb29834c74e2393f915c59288083ef71
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261103000100_atomic_result_save.sql
-- Source blob: 76c132df6a68ee8734859192c1e58f2c1fb2f7ef
-- -----------------------------------------------------------------------------
create function public.save_result_with_subjects(
  target_result_id uuid,
  target_student_id uuid,
  target_examination_number text,
  target_candidate_number text,
  target_school text,
  target_exam_year text,
  target_subjects jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_result_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_results') then
    raise exception 'manage_results permission required';
  end if;

  if target_student_id is null
     or length(btrim(coalesce(target_examination_number, ''))) = 0
     or length(target_examination_number) > 60
     or length(btrim(coalesce(target_candidate_number, ''))) = 0
     or length(target_candidate_number) > 60
     or length(btrim(coalesce(target_school, ''))) = 0
     or length(target_school) > 100
     or length(btrim(coalesce(target_exam_year, ''))) = 0
     or length(target_exam_year) > 30 then
    raise exception 'Required result fields are missing';
  end if;

  if jsonb_typeof(target_subjects) is distinct from 'array'
     or jsonb_array_length(target_subjects) < 1
     or jsonb_array_length(target_subjects) > 100 then
    raise exception 'A result must contain between 1 and 100 subjects';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_subjects) as subject(value)
    where jsonb_typeof(subject.value) <> 'object'
       or jsonb_typeof(subject.value -> 'name') is distinct from 'string'
       or length(btrim(coalesce(subject.value ->> 'name', ''))) = 0
       or length(subject.value ->> 'name') > 80
       or jsonb_typeof(subject.value -> 'score') is distinct from 'string'
       or length(subject.value ->> 'score') > 30
       or jsonb_typeof(subject.value -> 'grade') is distinct from 'string'
       or length(subject.value ->> 'grade') > 20
       or jsonb_typeof(subject.value -> 'remark') is distinct from 'string'
       or length(subject.value ->> 'remark') > 80
  ) then
    raise exception 'Check subject names, scores, grades, and remarks';
  end if;

  if target_result_id is null then
    insert into public.results (
      student_id,
      examination_number,
      candidate_number,
      school,
      exam_year,
      result_status
    )
    values (
      target_student_id,
      btrim(target_examination_number),
      btrim(target_candidate_number),
      btrim(target_school),
      btrim(target_exam_year),
      'Draft'
    )
    returning id into saved_result_id;
  else
    update public.results
       set student_id = target_student_id,
           examination_number = btrim(target_examination_number),
           candidate_number = btrim(target_candidate_number),
           school = btrim(target_school),
           exam_year = btrim(target_exam_year),
           updated_at = now()
     where id = target_result_id
     returning id into saved_result_id;

    if saved_result_id is null then
      raise exception 'Result not found or update is not permitted';
    end if;

    delete from public.result_subjects
     where result_id = saved_result_id;
  end if;

  insert into public.result_subjects (
    result_id,
    name,
    score,
    grade,
    remark,
    sort_order
  )
  select
    saved_result_id,
    btrim(subject.value ->> 'name'),
    coalesce(subject.value ->> 'score', ''),
    coalesce(subject.value ->> 'grade', ''),
    coalesce(subject.value ->> 'remark', ''),
    (subject.ordinality - 1)::integer
  from jsonb_array_elements(target_subjects) with ordinality as subject(value, ordinality);

  return saved_result_id;
end;
$$;

revoke all on function public.save_result_with_subjects(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.save_result_with_subjects(
  uuid, uuid, text, text, text, text, jsonb
) to authenticated;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261104000100_admin_rbac.sql
-- Source blob: 15983b5547caf8a1f5fe40a09c869209fb8e79bd
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists admin_enabled boolean not null default true;

alter table public.admin_permissions
  drop constraint if exists admin_permissions_permission_key_check;

alter table public.admin_permissions
  add constraint admin_permissions_permission_key_check
  check (permission_key in (
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
    'manage_catalogue_settings',
    'manage_admin_users'
  ));

create or replace function public.has_admin_permission(required_permission text)
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
        and p.admin_enabled
        and ap.permission_key = required_permission
    )
    or (
      required_permission = 'manage_courses'
      and exists (
        select 1
        from public.profiles p
        join public.admin_permissions ap on ap.profile_id = p.id
        where p.id = auth.uid()
          and p.role = 'sub_admin'
          and p.admin_enabled
          and ap.permission_key = 'manage_courses_lessons'
      )
    )
    or (
      required_permission = 'manage_lessons'
      and exists (
        select 1
        from public.profiles p
        join public.admin_permissions ap on ap.profile_id = p.id
        where p.id = auth.uid()
          and p.role = 'sub_admin'
          and p.admin_enabled
          and ap.permission_key in ('manage_courses_lessons', 'publish_unpublish_lessons')
      )
    );
$$;

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

create or replace function public.set_sub_admin_enabled(
  target_profile_id uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Main Admin permission required';
  end if;

  update public.profiles
     set admin_enabled = enabled,
         updated_at = now()
   where id = target_profile_id
     and role = 'sub_admin';

  if not found then
    raise exception 'Sub-Admin profile not found';
  end if;
end;
$$;

revoke all on function public.has_admin_permission(text) from public, anon;
revoke all on function public.assign_sub_admin(uuid, text, text[]) from public, anon;
revoke all on function public.set_sub_admin_enabled(uuid, boolean) from public, anon, authenticated;

grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.assign_sub_admin(uuid, text, text[]) to authenticated;
grant execute on function public.set_sub_admin_enabled(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261104000300_student_invites.sql
-- Source blob: b685d540381f1e756a4d70b8daecd20617bec54d
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261104000400_enabled_main_admin.sql
-- Source blob: 075982eff18e90b7476aaabda73de1df298abcf7
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists admin_enabled boolean not null default true;
alter table public.profiles
  alter column admin_enabled set default true,
  alter column admin_enabled set not null;

create or replace function public.is_main_admin()
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
      and p.admin_enabled
  );
$$;

revoke all on function public.is_main_admin() from public, anon;
grant execute on function public.is_main_admin() to authenticated;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261105000100_course_learning_payments.sql
-- Source blob: 5100fe09771decf8bed6c0422354ee272859592c
-- -----------------------------------------------------------------------------
create table if not exists public.course_catalogue_settings (
  category text primary key check (category in (
    'JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests'
  )),
  code_prefix text not null default '' check (length(code_prefix) <= 20),
  code_start integer check (code_start is null or code_start > 0),
  code_end integer check (code_end is null or code_end > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check ((code_start is null and code_end is null) or
         (code_start is not null and code_end is not null and code_end >= code_start))
);

create table if not exists public.course_payment_settings (
  id boolean primary key default true check (id),
  bank_name text,
  account_name text,
  account_number text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (
    (bank_name is null and account_name is null and account_number is null)
    or (length(btrim(bank_name)) > 0 and length(btrim(account_name)) > 0
        and length(btrim(account_number)) > 0)
  )
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 100),
  category text not null check (category in (
    'JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests'
  )),
  description text not null default '' check (length(description) <= 500),
  price numeric(12, 2) not null check (price >= 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 100),
  lesson_code text check (lesson_code is null or length(btrim(lesson_code)) between 1 and 40),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, lesson_code)
);

create index if not exists lessons_course_status_idx on public.lessons(course_id, status);
create index if not exists courses_status_category_idx on public.courses(status, category);
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_course_id_id_key'
  ) then
    alter table public.lessons
      add constraint lessons_course_id_id_key unique (course_id, id);
  end if;
end;
$$;

create table if not exists public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'video/mp4')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  foreign key (course_id, lesson_id) references public.lessons(course_id, id)
    on delete cascade
);

create table if not exists public.course_access (
  profile_id uuid not null references public.profiles(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  grant_source text not null check (grant_source in ('approved_order', 'manual')),
  order_id uuid,
  granted_at timestamptz not null default now(),
  primary key (profile_id, course_id)
);

create table if not exists public.course_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete restrict,
  buyer_name text,
  buyer_email text,
  course_id uuid not null references public.courses(id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  payment_reference text not null check (length(btrim(payment_reference)) between 1 and 120),
  proof_path text unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_note text not null default '' check (length(decision_note) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint course_orders_guest_identity_check check (
    profile_id is not null
    or (
      length(btrim(coalesce(buyer_name, ''))) between 1 and 100
      and length(btrim(coalesce(buyer_email, ''))) between 3 and 254
    )
  )
);

alter table public.course_orders
  add column if not exists buyer_name text,
  add column if not exists buyer_email text;
alter table public.course_orders alter column profile_id drop not null;
alter table public.course_orders alter column proof_path drop not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.course_orders'::regclass
      and conname = 'course_orders_guest_identity_check'
  ) then
    alter table public.course_orders
      add constraint course_orders_guest_identity_check check (
        profile_id is not null
        or (
          length(btrim(coalesce(buyer_name, ''))) between 1 and 100
          and length(btrim(coalesce(buyer_email, ''))) between 3 and 254
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.course_access'::regclass
      and conname = 'course_access_order_fk'
  ) then
    alter table public.course_access
      add constraint course_access_order_fk foreign key (order_id)
      references public.course_orders(id) on delete restrict;
  end if;
end;
$$;
create unique index if not exists course_orders_one_pending_per_course
  on public.course_orders(profile_id, course_id) where status = 'pending';
create unique index if not exists course_orders_guest_pending_email_course
  on public.course_orders(lower(buyer_email), course_id)
  where profile_id is null and status = 'pending';
create index if not exists course_orders_review_idx on public.course_orders(status, created_at desc);
create index if not exists course_access_course_idx on public.course_access(course_id, profile_id);

alter table public.course_catalogue_settings enable row level security;
alter table public.course_payment_settings enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.course_materials enable row level security;
alter table public.course_access enable row level security;
alter table public.course_orders enable row level security;

create or replace function public.has_course_access(requested_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.course_access ca
    where ca.profile_id = auth.uid() and ca.course_id = requested_course_id
  ) and public.is_active_student_profile();
$$;
revoke all on function public.has_course_access(uuid) from public, anon;
grant execute on function public.has_course_access(uuid) to authenticated;

drop policy if exists course_settings_admin_read on public.course_catalogue_settings;
create policy course_settings_admin_read on public.course_catalogue_settings
  for select to authenticated using (public.has_admin_permission('manage_catalogue_settings'));
drop policy if exists payment_settings_public_read on public.course_payment_settings;
create policy payment_settings_public_read on public.course_payment_settings
  for select to anon, authenticated using (true);

drop policy if exists courses_public_catalogue_read on public.courses;
drop policy if exists courses_admin_read on public.courses;
create policy courses_public_catalogue_read on public.courses
  for select to anon, authenticated using (status = 'published');
create policy courses_admin_read on public.courses
  for select to authenticated using (
    public.has_admin_permission('manage_courses')
    or public.has_admin_permission('manage_lessons')
    or public.has_admin_permission('manage_course_materials')
    or public.has_admin_permission('view_orders_payments')
  );
drop policy if exists lessons_public_catalogue_read on public.lessons;
drop policy if exists lessons_admin_read on public.lessons;
create policy lessons_public_catalogue_read on public.lessons
  for select to anon, authenticated using (
    (status = 'published' and exists (
      select 1 from public.courses c where c.id = lessons.course_id and c.status = 'published'
    ))
  );
create policy lessons_admin_read on public.lessons
  for select to authenticated using (
    public.has_admin_permission('manage_lessons')
    or public.has_admin_permission('manage_course_materials')
  );
drop policy if exists materials_admin_or_access_read on public.course_materials;
create policy materials_admin_or_access_read on public.course_materials
  for select to authenticated using (
    public.has_admin_permission('manage_course_materials')
    or (
      public.has_course_access(course_id)
      and exists (
        select 1 from public.lessons l join public.courses c on c.id = l.course_id
        where l.id = course_materials.lesson_id and l.status = 'published' and c.status = 'published'
      )
    )
  );
drop policy if exists course_access_owner_or_payment_admin_read on public.course_access;
create policy course_access_owner_or_payment_admin_read on public.course_access
  for select to authenticated using (
    profile_id = auth.uid() or public.has_admin_permission('view_orders_payments')
  );
drop policy if exists course_orders_owner_or_payment_admin_read on public.course_orders;
create policy course_orders_owner_or_payment_admin_read on public.course_orders
  for select to authenticated using (
    profile_id = auth.uid() or public.has_admin_permission('view_orders_payments')
  );

revoke all on public.course_catalogue_settings, public.course_payment_settings,
  public.courses, public.lessons, public.course_materials,
  public.course_access, public.course_orders from public, anon, authenticated;
grant select on public.course_catalogue_settings, public.courses, public.lessons to anon, authenticated;
grant select on public.course_payment_settings to anon, authenticated;
grant select on public.course_materials, public.course_access, public.course_orders to authenticated;

create or replace function public.save_course(
  target_id uuid, course_title text, course_category text, course_description text,
  course_price numeric, requested_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare existing_status text; saved_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_courses') then
    raise exception 'Course management permission required';
  end if;
  if course_category not in ('JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests')
     or requested_status not in ('draft', 'published')
     or course_title is null or length(btrim(course_title)) not between 1 and 100
     or course_description is null or length(course_description) > 500
     or course_price is null or course_price < 0 then
    raise exception 'Course fields are invalid';
  end if;
  if target_id is not null then
    select status into existing_status from public.courses where id = target_id for update;
    if not found or existing_status = 'archived' then raise exception 'Course not found'; end if;
  end if;
  if requested_status is distinct from coalesce(existing_status, 'draft')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  if target_id is null then
    insert into public.courses(title, category, description, price, status, created_by)
    values (btrim(course_title), course_category, btrim(course_description), course_price,
      requested_status, auth.uid()) returning id into saved_id;
  else
    update public.courses set title = btrim(course_title), category = course_category,
      description = btrim(course_description), price = course_price, status = requested_status,
      updated_at = now() where id = target_id returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.archive_course(target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_courses') then
    raise exception 'Course management permission required';
  end if;
  if exists (select 1 from public.courses where id = target_id and status = 'published')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  update public.courses set status = 'archived', updated_at = now()
   where id = target_id and status <> 'archived';
  if not found then raise exception 'Course not found'; end if;
end;
$$;

create or replace function public.save_lesson(
  target_id uuid, target_course_id uuid, lesson_title text, requested_lesson_code text,
  requested_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare existing_status text; course_status text; saved_id uuid;
  course_category text; code_prefix text; code_start integer; code_end integer;
  code_number integer; generated_code text;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_lessons') then
    raise exception 'Lesson management permission required';
  end if;
  if exists (select 1 from public.lessons where id = target_id and status = 'published')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  if lesson_title is null or length(btrim(lesson_title)) not between 1 and 100
     or (requested_lesson_code is not null and length(btrim(requested_lesson_code)) > 40)
     or requested_status not in ('draft', 'published') then
    raise exception 'Lesson fields are invalid';
  end if;
  select status, category into course_status, course_category
    from public.courses where id = target_course_id;
  if not found or course_status = 'archived' then raise exception 'Active course required'; end if;
  if target_id is not null then
    select status into existing_status from public.lessons where id = target_id for update;
    if not found or existing_status = 'archived' then raise exception 'Lesson not found'; end if;
  end if;
  if requested_status is distinct from coalesce(existing_status, 'draft')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  if requested_status = 'published' and course_status <> 'published' then
    raise exception 'Publish the course before publishing its lessons';
  end if;
  if target_id is null then
    if nullif(btrim(requested_lesson_code), '') is null then
      select settings.code_prefix, settings.code_start, settings.code_end
        into code_prefix, code_start, code_end
        from public.course_catalogue_settings as settings
       where settings.category = course_category
       for update;
      if not found or code_start is null or code_end is null then
        raise exception 'Configure a lesson-code range for this course category first';
      end if;

      for code_number in
        select generate_series(code_start, code_end)
      loop
        generated_code := code_prefix || code_number::text;
        exit when not exists (
          select 1
          from public.lessons as existing_lesson
          join public.courses as existing_course on existing_course.id = existing_lesson.course_id
          where existing_course.category = course_category
            and existing_lesson.lesson_code = generated_code
        );
        generated_code := null;
      end loop;

      if generated_code is null then
        raise exception 'The configured lesson-code range is exhausted';
      end if;
      requested_lesson_code := generated_code;
    end if;

    insert into public.lessons(course_id, title, lesson_code, status, created_by)
    values (target_course_id, btrim(lesson_title), nullif(btrim(requested_lesson_code), ''),
      requested_status, auth.uid()) returning id into saved_id;
  else
    update public.lessons set course_id = target_course_id, title = btrim(lesson_title),
      lesson_code = nullif(btrim(requested_lesson_code), ''),
      status = requested_status, updated_at = now()
     where id = target_id returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.archive_lesson(target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_lessons') then
    raise exception 'Lesson management permission required';
  end if;
  if exists (select 1 from public.lessons where id = target_id and status = 'published')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  update public.lessons set status = 'archived', updated_at = now()
   where id = target_id and status <> 'archived';
  if not found then raise exception 'Lesson not found'; end if;
end;
$$;

create or replace function public.save_course_catalogue_settings(settings jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare item jsonb; category_name text; first_code integer; last_code integer;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;
  if jsonb_typeof(settings) <> 'array' then raise exception 'Settings must be an array'; end if;
  for item in select value from jsonb_array_elements(settings) loop
    category_name := item->>'category';
    if category_name not in ('JSS', 'SSS Commercial', 'SSS Science', 'SSS Arts', 'Standardized Tests') then
      raise exception 'Invalid category';
    end if;
    first_code := nullif(item->>'codeStart', '')::integer;
    last_code := nullif(item->>'codeEnd', '')::integer;
    if first_code <= 0 or last_code <= 0
       or (first_code is null) <> (last_code is null) or last_code < first_code then
      raise exception 'Catalogue setting values are invalid';
    end if;
    insert into public.course_catalogue_settings(category, code_prefix,
      code_start, code_end, updated_by)
    values (category_name, coalesce(item->>'codePrefix', ''), first_code,
      last_code, auth.uid())
    on conflict (category) do update set code_prefix = excluded.code_prefix, code_start = excluded.code_start,
      code_end = excluded.code_end, updated_at = now(), updated_by = auth.uid();
  end loop;
end;
$$;

create or replace function public.save_course_payment_settings(
  configured_bank text, configured_account_name text, configured_account_number text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;
  if (configured_bank is null and configured_account_name is null and configured_account_number is null)
    then
      delete from public.course_payment_settings where id = true;
      return;
  end if;
  if length(btrim(coalesce(configured_bank, ''))) = 0
     or length(btrim(coalesce(configured_account_name, ''))) = 0
     or length(btrim(coalesce(configured_account_number, ''))) = 0
     or length(configured_bank) > 100 or length(configured_account_name) > 100
     or length(configured_account_number) > 40 then
    raise exception 'All bank details are required';
  end if;
  insert into public.course_payment_settings(id, bank_name, account_name, account_number, updated_by)
  values (true, btrim(configured_bank), btrim(configured_account_name),
    btrim(configured_account_number), auth.uid())
  on conflict (id) do update set bank_name = excluded.bank_name,
    account_name = excluded.account_name, account_number = excluded.account_number,
    updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function public.save_course_material(
  target_lesson_id uuid, material_path text, material_name text, material_mime text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare target_course_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_course_materials') then
    raise exception 'Course materials permission required';
  end if;
  if material_mime not in ('application/pdf', 'video/mp4')
     or material_name is null or length(btrim(material_name)) not between 1 and 255 then
    raise exception 'Material file is invalid';
  end if;
  select course_id into target_course_id from public.lessons where id = target_lesson_id
    and status <> 'archived';
  if not found then raise exception 'Lesson not found'; end if;
  if not exists (
    select 1 from storage.objects where bucket_id = 'course-materials' and name = material_path
      and (storage.foldername(name))[1] = target_course_id::text
      and (storage.foldername(name))[2] = target_lesson_id::text
  ) then raise exception 'Material upload is missing'; end if;
  insert into public.course_materials(course_id, lesson_id, storage_path, file_name, mime_type, updated_by)
  values (target_course_id, target_lesson_id, material_path, btrim(material_name), material_mime, auth.uid())
  on conflict (lesson_id) do update set course_id = excluded.course_id,
    storage_path = excluded.storage_path, file_name = excluded.file_name,
    mime_type = excluded.mime_type, updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function public.remove_course_material(target_lesson_id uuid)
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
  delete from public.course_materials where lesson_id = target_lesson_id returning storage_path into previous_path;
  return previous_path;
end;
$$;

create or replace function public.submit_course_order(
  target_course_id uuid, submitted_reference text, submitted_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare course_price numeric; saved_order_id uuid; proof_metadata jsonb;
begin
  if auth.uid() is null or not public.is_active_student_profile() then
    raise exception 'An active student account is required';
  end if;
  if submitted_reference is null or length(btrim(submitted_reference)) not between 1 and 120
     or submitted_proof_path is null
     or split_part(submitted_proof_path, '/', 1) <> auth.uid()::text then
    raise exception 'Payment reference or proof is invalid';
  end if;
  select price into course_price from public.courses where id = target_course_id and status = 'published';
  if not found then raise exception 'Course is not available'; end if;
  select metadata into proof_metadata from storage.objects
   where bucket_id = 'course-payment-proofs' and name = submitted_proof_path
     and (storage.foldername(name))[1] = auth.uid()::text;
  if not found or coalesce(proof_metadata->>'mimetype', '') not in ('image/jpeg', 'image/png', 'application/pdf')
     or coalesce((proof_metadata->>'size')::bigint, 0) > 10485760 then
    raise exception 'Payment proof must be JPEG, PNG, or PDF and no larger than 10 MB';
  end if;
  if exists (select 1 from public.course_access where profile_id = auth.uid() and course_id = target_course_id) then
    raise exception 'Course access has already been granted';
  end if;
  insert into public.course_orders(profile_id, course_id, amount, payment_reference, proof_path)
  values (auth.uid(), target_course_id, course_price, btrim(submitted_reference), submitted_proof_path)
  returning id into saved_order_id;
  return saved_order_id;
end;
$$;

create or replace function public.submit_guest_course_order(
  target_course_id uuid,
  submitted_buyer_name text,
  submitted_buyer_email text,
  submitted_reference text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  course_price numeric;
  saved_order_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'Sign out before placing a guest order';
  end if;
  if submitted_buyer_name is null or length(btrim(submitted_buyer_name)) not between 1 and 100
     or submitted_buyer_email is null
     or length(btrim(submitted_buyer_email)) not between 3 and 254
     or submitted_buyer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     or submitted_reference is null
     or length(btrim(submitted_reference)) not between 1 and 120 then
    raise exception 'Enter a valid name, email address, and payment reference';
  end if;

  select price into course_price
  from public.courses
  where id = target_course_id and status = 'published';
  if not found then raise exception 'Course is not available'; end if;

  insert into public.course_orders (
    profile_id, buyer_name, buyer_email, course_id, amount, payment_reference
  )
  values (
    null, btrim(submitted_buyer_name), lower(btrim(submitted_buyer_email)),
    target_course_id, course_price, btrim(submitted_reference)
  )
  returning id into saved_order_id;

  return saved_order_id;
exception
  when unique_violation then
    raise exception 'A pending order for this course and email already exists';
end;
$$;

create or replace function public.review_course_order(
  target_order_id uuid,
  approve_order boolean,
  review_note text,
  linked_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  order_row public.course_orders%rowtype;
  access_profile_id uuid;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment review permission required';
  end if;
  if length(coalesce(review_note, '')) > 500 then raise exception 'Review note is too long'; end if;
  select * into order_row from public.course_orders where id = target_order_id for update;
  if not found or order_row.status <> 'pending' then raise exception 'Pending order not found'; end if;

  access_profile_id := order_row.profile_id;
  if approve_order and order_row.profile_id is null then
    if linked_profile_id is null or not exists (
      select 1
      from public.profiles p
      join public.students s on s.profile_id = p.id
      where p.id = linked_profile_id
        and p.role = 'student'
        and lower(p.email) = lower(order_row.buyer_email)
        and s.is_active
    ) then
      raise exception 'Link the guest order to an active student account with the same email before approval';
    end if;
    access_profile_id := linked_profile_id;
  elsif linked_profile_id is not null and linked_profile_id <> order_row.profile_id then
    raise exception 'The selected student does not match this order';
  end if;

  update public.course_orders set status = case when approve_order then 'approved' else 'rejected' end,
    profile_id = case when approve_order then access_profile_id else profile_id end,
    decision_note = btrim(coalesce(review_note, '')), reviewed_by = auth.uid(), reviewed_at = now()
   where id = target_order_id;
  if approve_order then
    insert into public.course_access(profile_id, course_id, granted_by, grant_source, order_id)
    values (access_profile_id, order_row.course_id, auth.uid(), 'approved_order', order_row.id)
    on conflict (profile_id, course_id) do nothing;
  end if;
end;
$$;

create or replace function public.manually_grant_course_access(
  target_profile_id uuid, target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if not exists (select 1 from public.profiles p join public.students s on s.profile_id = p.id
    where p.id = target_profile_id and p.role = 'student' and s.is_active) then
    raise exception 'Active student profile not found';
  end if;
  if not exists (select 1 from public.courses where id = target_course_id and status <> 'archived') then
    raise exception 'Course not found';
  end if;
  insert into public.course_access(profile_id, course_id, granted_by, grant_source)
  values (target_profile_id, target_course_id, auth.uid(), 'manual')
  on conflict (profile_id, course_id) do nothing;
end;
$$;

create or replace function public.revoke_manual_course_access(
  target_profile_id uuid,
  target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  delete from public.course_access
   where profile_id = target_profile_id
     and course_id = target_course_id
     and grant_source = 'manual';
  if not found then raise exception 'Manual course-access grant not found'; end if;
end;
$$;

revoke all on function public.save_course(uuid, text, text, text, numeric, text) from public, anon;
revoke all on function public.archive_course(uuid) from public, anon;
revoke all on function public.save_lesson(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.archive_lesson(uuid) from public, anon;
revoke all on function public.save_course_catalogue_settings(jsonb) from public, anon;
revoke all on function public.save_course_payment_settings(text, text, text) from public, anon;
revoke all on function public.save_course_material(uuid, text, text, text) from public, anon;
revoke all on function public.remove_course_material(uuid) from public, anon;
revoke all on function public.submit_course_order(uuid, text, text) from public, anon;
revoke all on function public.submit_guest_course_order(uuid, text, text, text) from public, authenticated;
revoke all on function public.review_course_order(uuid, boolean, text, uuid) from public, anon;
revoke all on function public.manually_grant_course_access(uuid, uuid) from public, anon;
revoke all on function public.revoke_manual_course_access(uuid, uuid) from public, anon;
grant execute on function public.save_course(uuid, text, text, text, numeric, text) to authenticated;
grant execute on function public.archive_course(uuid) to authenticated;
grant execute on function public.save_lesson(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.archive_lesson(uuid) to authenticated;
grant execute on function public.save_course_catalogue_settings(jsonb) to authenticated;
grant execute on function public.save_course_payment_settings(text, text, text) to authenticated;
grant execute on function public.save_course_material(uuid, text, text, text) to authenticated;
grant execute on function public.remove_course_material(uuid) to authenticated;
grant execute on function public.submit_course_order(uuid, text, text) to authenticated;
grant execute on function public.submit_guest_course_order(uuid, text, text, text) to anon;
grant execute on function public.review_course_order(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.manually_grant_course_access(uuid, uuid) to authenticated;
grant execute on function public.revoke_manual_course_access(uuid, uuid) to authenticated;

drop trigger if exists course_catalogue_settings_audit_log on public.course_catalogue_settings;
create trigger course_catalogue_settings_audit_log
  after insert or update or delete on public.course_catalogue_settings
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists course_payment_settings_audit_log on public.course_payment_settings;
create trigger course_payment_settings_audit_log
  after insert or update or delete on public.course_payment_settings
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists courses_audit_log on public.courses;
create trigger courses_audit_log
  after insert or update or delete on public.courses
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists lessons_audit_log on public.lessons;
create trigger lessons_audit_log
  after insert or update or delete on public.lessons
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists course_materials_audit_log on public.course_materials;
create trigger course_materials_audit_log
  after insert or update or delete on public.course_materials
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists course_access_audit_log on public.course_access;
create trigger course_access_audit_log
  after insert or update or delete on public.course_access
  for each row execute function public.write_sensitive_audit_log();
drop trigger if exists course_orders_audit_log on public.course_orders;
create trigger course_orders_audit_log
  after insert or update or delete on public.course_orders
  for each row execute function public.write_sensitive_audit_log();

-- Supabase Storage enables RLS on storage.objects by default.
-- Do not ALTER this managed table; define Storage access policies below.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 52428800, array['application/pdf', 'video/mp4'])
on conflict (id) do nothing;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('course-payment-proofs', 'course-payment-proofs', false, 10485760,
  array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'course-materials'
      and public = false
      and file_size_limit = 52428800
      and allowed_mime_types = array['application/pdf', 'video/mp4']
  ) then
    raise exception 'The existing course-materials bucket does not match the required private configuration';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'course-payment-proofs'
      and public = false
      and file_size_limit = 10485760
      and allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']
  ) then
    raise exception 'The existing course-payment-proofs bucket does not match the required private configuration';
  end if;
end;
$$;

drop policy if exists course_material_objects_admin_insert on storage.objects;
create policy course_material_objects_admin_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'course-materials'
    and public.has_admin_permission('manage_course_materials')
  );
drop policy if exists course_material_objects_authorized_read on storage.objects;
create policy course_material_objects_authorized_read on storage.objects
  for select to authenticated using (
    bucket_id = 'course-materials'
    and (
      public.has_admin_permission('manage_course_materials')
      or exists (
        select 1 from public.course_materials cm
        join public.lessons l on l.id = cm.lesson_id
        join public.courses c on c.id = cm.course_id
        where cm.storage_path = storage.objects.name
          and l.status = 'published' and c.status = 'published'
          and public.has_course_access(cm.course_id)
      )
    )
  );
drop policy if exists course_material_objects_admin_update on storage.objects;
create policy course_material_objects_admin_update on storage.objects
  for update to authenticated using (
    bucket_id = 'course-materials' and public.has_admin_permission('manage_course_materials')
  ) with check (
    bucket_id = 'course-materials' and public.has_admin_permission('manage_course_materials')
  );
drop policy if exists course_material_objects_admin_delete on storage.objects;
create policy course_material_objects_admin_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'course-materials' and public.has_admin_permission('manage_course_materials')
  );

drop policy if exists course_proofs_owner_insert on storage.objects;
create policy course_proofs_owner_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'course-payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_student_profile()
  );
drop policy if exists course_proofs_owner_or_admin_read on storage.objects;
create policy course_proofs_owner_or_admin_read on storage.objects
  for select to authenticated using (
    bucket_id = 'course-payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text
      or public.has_admin_permission('view_orders_payments'))
  );


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261105000200_public_calendar_and_learning_video.sql
-- Source blob: 24f4ba16c82ea04dbda02eb5ebb84442cb3c4c65
-- -----------------------------------------------------------------------------
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

alter table public.school_calendar_events enable row level security;
grant select on public.school_calendar_events to anon, authenticated;
grant insert, update, delete on public.school_calendar_events to authenticated;

drop policy if exists school_calendar_events_public_read on public.school_calendar_events;
create policy school_calendar_events_public_read on public.school_calendar_events
  for select to anon, authenticated using (status = 'published' or public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_insert on public.school_calendar_events;
create policy school_calendar_events_main_admin_insert on public.school_calendar_events
  for insert to authenticated with check (public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_update on public.school_calendar_events;
create policy school_calendar_events_main_admin_update on public.school_calendar_events
  for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());

drop policy if exists school_calendar_events_main_admin_delete on public.school_calendar_events;
create policy school_calendar_events_main_admin_delete on public.school_calendar_events
  for delete to authenticated using (public.is_main_admin());

create table if not exists public.elearning_feature_settings (
  id boolean primary key default true check (id),
  video_path text,
  video_file_name text,
  published boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (video_path is null and video_file_name is null)
    or (video_path is not null and length(btrim(video_path)) between 1 and 500
        and video_file_name is not null and length(btrim(video_file_name)) between 1 and 255)
  ),
  check (not published or video_path is not null)
);

alter table public.elearning_feature_settings enable row level security;
grant select on public.elearning_feature_settings to anon, authenticated;
grant insert, update on public.elearning_feature_settings to authenticated;

drop policy if exists elearning_feature_settings_public_read on public.elearning_feature_settings;
create policy elearning_feature_settings_public_read on public.elearning_feature_settings
  for select to anon, authenticated using (published or public.is_main_admin());

drop policy if exists elearning_feature_settings_main_admin_insert on public.elearning_feature_settings;
create policy elearning_feature_settings_main_admin_insert on public.elearning_feature_settings
  for insert to authenticated with check (public.is_main_admin());

drop policy if exists elearning_feature_settings_main_admin_update on public.elearning_feature_settings;
create policy elearning_feature_settings_main_admin_update on public.elearning_feature_settings
  for update to authenticated using (public.is_main_admin()) with check (public.is_main_admin());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('elearning-public-media', 'elearning-public-media', true, 262144000, array['video/mp4'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'elearning-public-media'
      and public = true
      and file_size_limit = 262144000
      and allowed_mime_types = array['video/mp4']
  ) then
    raise exception 'The elearning-public-media bucket does not match the required public video configuration';
  end if;
end;
$$;

drop policy if exists elearning_public_video_read on storage.objects;
create policy elearning_public_video_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'elearning-public-media');

drop policy if exists elearning_public_video_main_admin_insert on storage.objects;
create policy elearning_public_video_main_admin_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'elearning-public-media' and public.is_main_admin()
  );

drop policy if exists elearning_public_video_main_admin_update on storage.objects;
create policy elearning_public_video_main_admin_update on storage.objects
  for update to authenticated using (
    bucket_id = 'elearning-public-media' and public.is_main_admin()
  ) with check (
    bucket_id = 'elearning-public-media' and public.is_main_admin()
  );

drop policy if exists elearning_public_video_main_admin_delete on storage.objects;
create policy elearning_public_video_main_admin_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'elearning-public-media' and public.is_main_admin()
  );


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261106000100_release_permission_dependency.sql
-- Source blob: dae2d4d4befbc1e74e56d20717506407500e3888
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261107000100_admin_workflows_and_calendar.sql
-- Source blob: f81ae7d3ffe63fbe1b3cc8a6cba0018a4b686829
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261108000100_enable_assigned_sub_admin_permissions.sql
-- Source blob: 6a9c0fe6cdf320ec542b5622a9d0e5b7240eb2a5
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261109000100_recoverable_account_archiving.sql
-- Source blob: 2a60b861db2fabb932844eb323b4296b2a19bfed
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261123000100_guest_course_entitlements_and_expiry.sql
-- Source blob: 371159cf798ceb3e8523b93db910611f73043e9b
-- -----------------------------------------------------------------------------
-- Adebola College STAGING / TEST only.
-- Follow-up migration for the existing course/payment schema.
-- Expected base migration: 20261105000100_course_learning_payments.sql
-- Do NOT run against the LIVE/production Supabase project.
--
-- IMPORTANT:
-- 1. Run the read-only staging preflight first and confirm the base tables,
--    columns, helper functions, buckets, and policies exist.
-- 2. This migration is designed to be applied once to the production project after
--    reviewing the current schema. It does not seed courses or alter student,
--    results, Admin, Sub-Admin, calendar, or featured-video data.
-- 3. App code must be deployed with the matching RPC argument names and guest
--    access flow described in the Copilot implementation brief.



do $$
declare missing_relations text;
begin
  select string_agg(required.relation_name, ', ' order by required.relation_name)
    into missing_relations
  from (values
    ('public.profiles'),
    ('public.course_payment_settings'),
    ('public.courses'),
    ('public.lessons'),
    ('public.course_access'),
    ('public.course_orders'),
    ('storage.buckets'),
    ('storage.objects')
  ) as required(relation_name)
  where to_regclass(required.relation_name) is null;

  if missing_relations is not null then
    raise exception 'Required required schema objects are missing: %. Run the read-only preflight and review the schema first.',
      missing_relations;
  end if;

  if to_regprocedure('public.has_admin_permission(text)') is null
     or to_regprocedure('public.is_active_student_profile()') is null
     or to_regprocedure('public.is_main_admin()') is null
     or to_regprocedure('public.has_course_access(uuid)') is null then
    raise exception 'Required TEST authorization/course helper functions are missing. Run the read-only preflight and review the schema first.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A. Add expiry to student course entitlements, preserving existing records.
-- NULL expiry intentionally preserves historical/manual grants until manually
-- revoked. Every newly approved paid student order receives a 7-day expiry.
-- ---------------------------------------------------------------------------
alter table public.course_access
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null,
  add column if not exists revoked_reason text;

alter table public.course_orders
  add column if not exists admin_email_sent_at timestamptz,
  add column if not exists admin_email_error text;

alter table public.lessons
  add column if not exists description text not null default '',
  add column if not exists duration_minutes smallint;

do $$
declare title_check text;
begin
  select pg_get_constraintdef(oid) into title_check
  from pg_constraint
  where conrelid = 'public.lessons'::regclass
    and conname = 'lessons_title_check';
  if title_check is null then
    raise exception 'Expected lessons_title_check was not found; review the required schema before migrating';
  elsif position('140' in title_check) = 0 then
    if position('100' in title_check) = 0 then
      raise exception 'Unexpected lessons_title_check definition; review the required schema before migrating';
    end if;
    alter table public.lessons drop constraint lessons_title_check;
    alter table public.lessons
      add constraint lessons_title_check
      check (length(btrim(title)) between 1 and 140);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_description_length_check'
  ) then
    alter table public.lessons
      add constraint lessons_description_length_check
      check (length(description) <= 5000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_duration_minutes_check'
  ) then
    alter table public.lessons
      add constraint lessons_duration_minutes_check
      check (duration_minutes is null or duration_minutes between 1 and 600);
  end if;
end;
$$;

create index if not exists course_access_expiry_idx
  on public.course_access (expires_at)
  where expires_at is not null;

-- Bank account type is optional for compatibility with previously saved data.
alter table public.course_payment_settings
  add column if not exists account_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.course_payment_settings'::regclass
      and conname = 'course_payment_settings_account_type_check'
  ) then
    alter table public.course_payment_settings
      add constraint course_payment_settings_account_type_check
      check (account_type is null or length(btrim(account_type)) between 1 and 40);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. Guest entitlements.
-- Store only a SHA-256 digest of the random bearer token. The raw token is
-- generated by server-side application code and emailed to the buyer.
-- ---------------------------------------------------------------------------
create table if not exists public.course_guest_access (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.course_orders(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  buyer_name text not null check (length(btrim(buyer_name)) between 1 and 100),
  buyer_email text not null check (length(btrim(buyer_email)) between 3 and 254),
  access_token_hash char(64) not null unique
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  access_email_sent_at timestamptz,
  access_email_error text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default now(),
  check (expires_at > granted_at),
  check ((revoked_at is null and revoked_by is null) or revoked_at is not null)
);

alter table public.course_guest_access
  add column if not exists revoked_reason text;

create index if not exists course_guest_access_active_email_course_idx
  on public.course_guest_access (lower(buyer_email), course_id, expires_at desc)
  where revoked_at is null;

create index if not exists course_guest_access_expiry_idx
  on public.course_guest_access (expires_at)
  where revoked_at is null;

alter table public.course_guest_access enable row level security;
revoke all on public.course_guest_access from public, anon, authenticated;
grant select (
  id, order_id, course_id, buyer_name, buyer_email, access_email_sent_at,
  access_email_error, granted_at, expires_at, revoked_at, revoked_by, revoked_reason, created_at
) on public.course_guest_access to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'course_guest_access'
      and policyname = 'course_guest_access_payment_admin_read'
  ) then
    create policy course_guest_access_payment_admin_read
      on public.course_guest_access
      for select to authenticated
      using (public.has_admin_permission('view_orders_payments'));
  end if;
end;
$$;

create or replace function public.get_guest_course_access(token_digest text)
returns table(course_id uuid, expires_at timestamptz)
language sql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select ga.course_id, ga.expires_at
  from public.course_guest_access ga
  where token_digest ~ '^[0-9a-f]{64}$'
    and ga.access_token_hash = token_digest
    and ga.revoked_at is null
    and ga.expires_at > clock_timestamp()
  limit 1;
$$;
revoke all on function public.get_guest_course_access(text)
  from public, anon, authenticated;
grant execute on function public.get_guest_course_access(text) to service_role;

-- ---------------------------------------------------------------------------
-- C. Replace the student entitlement check with an expiry-aware check.
-- Manual grants and historical rows with NULL expires_at retain their current
-- behaviour. New approved paid purchases expire after seven days.
-- ---------------------------------------------------------------------------
create or replace function public.has_course_access(requested_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null
    and public.is_active_student_profile()
    and exists (
      select 1
      from public.course_access ca
      where ca.profile_id = auth.uid()
        and ca.course_id = requested_course_id
        and ca.revoked_at is null
        and (ca.expires_at is null or ca.expires_at > now())
    );
$$;
revoke all on function public.has_course_access(uuid) from public, anon;
grant execute on function public.has_course_access(uuid) to authenticated;

-- Extend the existing lesson title limit for the exact client-provided title.
create or replace function public.save_lesson(
  target_id uuid,
  target_course_id uuid,
  lesson_title text,
  requested_lesson_code text,
  requested_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare existing_status text; course_status text; saved_id uuid;
  course_category text; code_prefix text; code_start integer; code_end integer;
  code_number integer; generated_code text;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_lessons') then
    raise exception 'Lesson management permission required';
  end if;
  if exists (select 1 from public.lessons where id = target_id and status = 'published')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  if lesson_title is null or length(btrim(lesson_title)) not between 1 and 140
     or (requested_lesson_code is not null and length(btrim(requested_lesson_code)) > 40)
     or requested_status not in ('draft', 'published') then
    raise exception 'Lesson fields are invalid';
  end if;
  select status, category into course_status, course_category
    from public.courses where id = target_course_id;
  if not found or course_status = 'archived' then raise exception 'Active course required'; end if;
  if target_id is not null then
    select status into existing_status from public.lessons where id = target_id for update;
    if not found or existing_status = 'archived' then raise exception 'Lesson not found'; end if;
  end if;
  if requested_status is distinct from coalesce(existing_status, 'draft')
     and not public.has_admin_permission('publish_unpublish_lessons') then
    raise exception 'Publishing permission required';
  end if;
  if requested_status = 'published' and course_status <> 'published' then
    raise exception 'Publish the course before publishing its lessons';
  end if;
  if target_id is null then
    if nullif(btrim(requested_lesson_code), '') is null then
      select settings.code_prefix, settings.code_start, settings.code_end
        into code_prefix, code_start, code_end
        from public.course_catalogue_settings as settings
       where settings.category = course_category
       for update;
      if not found or code_start is null or code_end is null then
        raise exception 'Configure a lesson-code range for this course category first';
      end if;
      for code_number in select generate_series(code_start, code_end)
      loop
        generated_code := code_prefix || code_number::text;
        exit when not exists (
          select 1
          from public.lessons as existing_lesson
          join public.courses as existing_course on existing_course.id = existing_lesson.course_id
          where existing_course.category = course_category
            and existing_lesson.lesson_code = generated_code
        );
        generated_code := null;
      end loop;
      if generated_code is null then
        raise exception 'The configured lesson-code range is exhausted';
      end if;
      requested_lesson_code := generated_code;
    end if;
    insert into public.lessons(course_id, title, lesson_code, status, created_by)
    values (target_course_id, btrim(lesson_title), nullif(btrim(requested_lesson_code), ''),
      requested_status, auth.uid()) returning id into saved_id;
  else
    update public.lessons set course_id = target_course_id, title = btrim(lesson_title),
      lesson_code = nullif(btrim(requested_lesson_code), ''),
      status = requested_status, updated_at = now()
     where id = target_id returning id into saved_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_lesson(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.save_lesson(uuid, uuid, text, text, text) to authenticated;

create or replace function public.save_lesson(
  target_id uuid,
  target_course_id uuid,
  lesson_title text,
  requested_lesson_code text,
  requested_status text,
  lesson_description text,
  requested_duration_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare saved_id uuid;
begin
  if lesson_description is null or length(lesson_description) > 5000
     or (requested_duration_minutes is not null
       and requested_duration_minutes not between 1 and 600) then
    raise exception 'Lesson description or duration is invalid';
  end if;
  saved_id := public.save_lesson(
    target_id, target_course_id, lesson_title, requested_lesson_code, requested_status
  );
  update public.lessons
  set description = btrim(lesson_description),
      duration_minutes = requested_duration_minutes,
      updated_at = now()
  where id = saved_id;
  return saved_id;
end;
$$;
revoke all on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  from public, anon;
grant execute on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- D. Student payment submission: permit a new order only when a previous paid
-- entitlement has expired. Keep the existing 3-argument RPC signature.
-- ---------------------------------------------------------------------------
create or replace function public.submit_course_order(
  target_course_id uuid,
  submitted_reference text,
  submitted_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  course_price numeric;
  saved_order_id uuid;
  proof_metadata jsonb;
begin
  if auth.uid() is null or not public.is_active_student_profile() then
    raise exception 'An active student account is required';
  end if;
  if submitted_reference is null
     or length(btrim(submitted_reference)) not between 1 and 120
     or submitted_proof_path is null
     or split_part(submitted_proof_path, '/', 1) <> auth.uid()::text then
    raise exception 'Payment reference or proof is invalid';
  end if;

  select price into course_price
  from public.courses
  where id = target_course_id and status = 'published';
  if not found then raise exception 'Course is not available'; end if;

  select metadata into proof_metadata
  from storage.objects
  where bucket_id = 'course-payment-proofs'
    and name = submitted_proof_path
    and (storage.foldername(name))[1] = auth.uid()::text;
  if not found
     or coalesce(proof_metadata->>'mimetype', '') not in ('image/jpeg', 'image/png', 'application/pdf')
     or coalesce(proof_metadata->>'size', '') !~ '^[0-9]+$'
     or coalesce((case when proof_metadata->>'size' ~ '^[0-9]+$'
          then proof_metadata->>'size' else '0' end)::bigint, 0) not between 1 and 10485760 then
    raise exception 'Payment proof must be JPEG, PNG, or PDF and no larger than 10 MB';
  end if;

  if exists (
    select 1 from public.course_access ca
    where ca.profile_id = auth.uid()
      and ca.course_id = target_course_id
      and ca.revoked_at is null
      and (ca.expires_at is null or ca.expires_at > now())
  ) then
    raise exception 'Course access is already active';
  end if;

  insert into public.course_orders(profile_id, course_id, amount, payment_reference, proof_path)
  values (auth.uid(), target_course_id, course_price, btrim(submitted_reference), submitted_proof_path)
  returning id into saved_order_id;
  return saved_order_id;
end;
$$;
revoke all on function public.submit_course_order(uuid, text, text) from public, anon;
grant execute on function public.submit_course_order(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Guest bank-transfer submission with required receipt evidence.
-- The application must create a signed upload URL server-side using the
-- server-only service key, upload the proof to the private bucket under
-- guest/<random-id>/<safe-filename>, then call this RPC.
-- ---------------------------------------------------------------------------
create or replace function public.submit_guest_course_order(
  target_course_id uuid,
  submitted_buyer_name text,
  submitted_buyer_email text,
  submitted_reference text,
  submitted_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  course_price numeric;
  saved_order_id uuid;
  proof_metadata jsonb;
begin
  if auth.uid() is not null then
    raise exception 'Sign out before placing a guest order';
  end if;
  if submitted_buyer_name is null
     or length(btrim(submitted_buyer_name)) not between 1 and 100
     or submitted_buyer_email is null
     or length(btrim(submitted_buyer_email)) not between 3 and 254
     or submitted_buyer_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
     or submitted_reference is null
     or length(btrim(submitted_reference)) not between 1 and 120
     or submitted_proof_path is null
     or submitted_proof_path !~ '^guest/[0-9a-fA-F-]{36}/[A-Za-z0-9._-]{1,150}$' then
    raise exception 'Enter a valid name, email, payment reference, and proof of transfer';
  end if;

  select price into course_price
  from public.courses
  where id = target_course_id and status = 'published';
  if not found then raise exception 'Course is not available'; end if;

  if exists (
    select 1 from public.course_guest_access ga
    where lower(ga.buyer_email) = lower(btrim(submitted_buyer_email))
      and ga.course_id = target_course_id
      and ga.revoked_at is null
      and ga.expires_at > now()
  ) then
    raise exception 'Course access is already active for this email address';
  end if;

  select metadata into proof_metadata
  from storage.objects
  where bucket_id = 'course-payment-proofs'
    and name = submitted_proof_path
    and split_part(name, '/', 1) = 'guest'
    and (storage.foldername(name))[2] = split_part(submitted_proof_path, '/', 2);
  if not found
     or coalesce(proof_metadata->>'mimetype', '') not in ('image/jpeg', 'image/png', 'application/pdf')
     or coalesce(proof_metadata->>'size', '') !~ '^[0-9]+$'
     or coalesce((case when proof_metadata->>'size' ~ '^[0-9]+$'
          then proof_metadata->>'size' else '0' end)::bigint, 0) not between 1 and 10485760 then
    raise exception 'Payment proof must be JPEG, PNG, or PDF and no larger than 10 MB';
  end if;

  insert into public.course_orders (
    profile_id, buyer_name, buyer_email, course_id, amount,
    payment_reference, proof_path
  )
  values (
    null, btrim(submitted_buyer_name), lower(btrim(submitted_buyer_email)),
    target_course_id, course_price, btrim(submitted_reference), submitted_proof_path
  )
  returning id into saved_order_id;
  return saved_order_id;
exception
  when unique_violation then
    raise exception 'A pending order for this course and email, or this payment proof, already exists';
end;
$$;
revoke all on function public.submit_guest_course_order(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_guest_course_order(uuid, text, text, text, text)
  to service_role;
-- The legacy four-argument overload has no receipt path and must not remain
-- callable as a way to create an unverified guest order.
revoke all on function public.submit_guest_course_order(uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F. Admin payment approval. Five-argument overload is used by the updated
-- application. The legacy four-argument RPC is revoked below.
-- For guest approval, the app supplies only the SHA-256 token digest. The raw
-- token is never sent to or stored in the database.
-- ---------------------------------------------------------------------------
create or replace function public.review_course_order(
  target_order_id uuid,
  approve_order boolean,
  review_note text,
  linked_profile_id uuid,
  guest_token_hash text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  order_row public.course_orders%rowtype;
  access_profile_id uuid;
  proof_metadata jsonb;
  changed_rows integer;
  decision_time timestamptz;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment review permission required';
  end if;
  if length(coalesce(review_note, '')) > 500 then
    raise exception 'Review note is too long';
  end if;

  select * into order_row
  from public.course_orders
  where id = target_order_id
  for update;
  if not found or order_row.status <> 'pending' then
    raise exception 'Pending order not found';
  end if;

  if approve_order then
    if order_row.proof_path is null then
      raise exception 'A payment receipt is required before an order can be approved';
    end if;
    select metadata into proof_metadata
    from storage.objects
    where bucket_id = 'course-payment-proofs'
      and name = order_row.proof_path;
    if not found
       or coalesce(proof_metadata->>'mimetype', '') not in ('image/jpeg', 'image/png', 'application/pdf')
       or coalesce(proof_metadata->>'size', '') !~ '^[0-9]+$'
       or coalesce((case when proof_metadata->>'size' ~ '^[0-9]+$'
            then proof_metadata->>'size' else '0' end)::bigint, 0) not between 1 and 10485760 then
      raise exception 'A valid payment receipt must remain available before an order can be approved';
    end if;

    access_profile_id := order_row.profile_id;

    if order_row.profile_id is null and linked_profile_id is not null then
      raise exception 'Guest orders must remain guest orders; do not link them to a student profile';
    elsif order_row.profile_id is not null and linked_profile_id is not null
      and linked_profile_id <> order_row.profile_id then
      raise exception 'The selected student does not match this order';
    end if;

    if access_profile_id is not null and not exists (
      select 1
      from public.profiles p
      join public.students s on s.profile_id = p.id
      where p.id = access_profile_id
        and p.role = 'student'
        and s.is_active
    ) then
      raise exception 'The student account must be active before payment approval';
    end if;

    decision_time := clock_timestamp();
    if access_profile_id is null then
      if guest_token_hash is null or guest_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'A valid guest access token digest is required';
      end if;
      insert into public.course_guest_access (
        order_id, course_id, buyer_name, buyer_email, access_token_hash,
        granted_at, expires_at
      )
      values (
        order_row.id, order_row.course_id, order_row.buyer_name,
        lower(order_row.buyer_email), guest_token_hash,
        decision_time, decision_time + interval '7 days'
      );
      if guest_token_hash is not null then
        update public.course_guest_access
        set access_email_sent_at = null, access_email_error = null
        where order_id = order_row.id;
      end if;
    else
      insert into public.course_access (
        profile_id, course_id, granted_by, grant_source, order_id,
        granted_at, expires_at
      )
      values (
        access_profile_id, order_row.course_id, auth.uid(), 'approved_order',
        order_row.id, decision_time, decision_time + interval '7 days'
      )
      on conflict (profile_id, course_id) do update
        set granted_by = excluded.granted_by,
            grant_source = 'approved_order',
            order_id = excluded.order_id,
            granted_at = excluded.granted_at,
            expires_at = excluded.expires_at,
            revoked_at = null,
            revoked_by = null
      where course_access.grant_source = 'approved_order'
        and (course_access.revoked_at is not null
          or course_access.expires_at is null
          or course_access.expires_at <= now());
      get diagnostics changed_rows = row_count;
      if changed_rows = 0 then
        raise exception 'An active or manual course-access grant already exists';
      end if;
    end if;
  else
    if guest_token_hash is not null or linked_profile_id is not null then
      raise exception 'Do not provide a guest token when rejecting an order';
    end if;
  end if;

  update public.course_orders
  set status = case when approve_order then 'approved' else 'rejected' end,
      profile_id = case when approve_order then access_profile_id else profile_id end,
      decision_note = btrim(coalesce(review_note, '')),
      reviewed_by = auth.uid(),
      reviewed_at = coalesce(decision_time, clock_timestamp())
  where id = target_order_id;
end;
$$;
revoke all on function public.review_course_order(uuid, boolean, text, uuid, text)
  from public, anon;
grant execute on function public.review_course_order(uuid, boolean, text, uuid, text)
  to authenticated;
-- Disable the old approval ABI in this migration itself; it can otherwise
-- approve student orders without the seven-day expiry parameters.
revoke all on function public.review_course_order(uuid, boolean, text, uuid)
  from public, anon, authenticated, service_role;

-- Retain the old four-argument RPC for student orders and rejection only.
-- Guest approval without a token digest is deliberately refused.
create or replace function public.review_course_order(
  target_order_id uuid,
  approve_order boolean,
  review_note text,
  linked_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.review_course_order(
    target_order_id, approve_order, review_note, linked_profile_id, null
  );
end;
$$;
revoke all on function public.review_course_order(uuid, boolean, text, uuid)
  from public, anon;
grant execute on function public.review_course_order(uuid, boolean, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- G. Manual revocation for both student and guest purchases.
-- Retain manual-grant history while preserving the existing RPC contracts.
-- ---------------------------------------------------------------------------
create or replace function public.manually_grant_course_access(
  target_profile_id uuid,
  target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if not exists (
    select 1
    from public.profiles p
    join public.students s on s.profile_id = p.id
    where p.id = target_profile_id and p.role = 'student' and s.is_active
  ) then
    raise exception 'Active student profile not found';
  end if;
  if not exists (
    select 1 from public.courses
    where id = target_course_id and status <> 'archived'
  ) then
    raise exception 'Course not found';
  end if;
  insert into public.course_access(profile_id, course_id, granted_by, grant_source)
  values (target_profile_id, target_course_id, auth.uid(), 'manual')
  on conflict (profile_id, course_id) do update
    set granted_by = auth.uid(),
        granted_at = clock_timestamp(),
        expires_at = null,
        revoked_at = null,
        revoked_by = null
    where course_access.grant_source = 'manual'
      and course_access.revoked_at is not null;
end;
$$;
revoke all on function public.manually_grant_course_access(uuid, uuid) from public, anon;
grant execute on function public.manually_grant_course_access(uuid, uuid) to authenticated;

create or replace function public.revoke_manual_course_access(
  target_profile_id uuid,
  target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(), revoked_by = auth.uid()
  where profile_id = target_profile_id
    and course_id = target_course_id
    and grant_source = 'manual'
    and revoked_at is null;
  if not found then raise exception 'Active manual course-access grant not found'; end if;
end;
$$;
revoke all on function public.revoke_manual_course_access(uuid, uuid) from public, anon;
grant execute on function public.revoke_manual_course_access(uuid, uuid) to authenticated;

create or replace function public.admin_revoke_course_access(
  target_profile_id uuid,
  target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(), revoked_by = auth.uid()
  where profile_id = target_profile_id
    and course_id = target_course_id
    and grant_source = 'approved_order'
    and revoked_at is null;
  if not found then
    raise exception 'Active or historical course-access grant was not found';
  end if;
end;
$$;
revoke all on function public.admin_revoke_course_access(uuid, uuid) from public, anon;
grant execute on function public.admin_revoke_course_access(uuid, uuid) to authenticated;

create or replace function public.admin_revoke_guest_course_access(target_guest_access_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  update public.course_guest_access
  set revoked_at = clock_timestamp(), revoked_by = auth.uid()
  where id = target_guest_access_id and revoked_at is null;
  if not found then
    raise exception 'Active guest course-access grant was not found';
  end if;
end;
$$;
revoke all on function public.admin_revoke_guest_course_access(uuid) from public, anon;
grant execute on function public.admin_revoke_guest_course_access(uuid) to authenticated;

-- These legacy revocation functions do not require a reason. The follow-up
-- migration installs the audited signatures before the application is updated.
revoke all on function public.revoke_manual_course_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_course_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_guest_course_access(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_rotate_guest_course_access_token(
  target_guest_access_id uuid,
  replacement_token_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare new_expiry timestamptz;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if replacement_token_hash is null or replacement_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid replacement token digest is required';
  end if;
  update public.course_guest_access
  set access_token_hash = replacement_token_hash,
      access_email_sent_at = null,
      access_email_error = null
  where id = target_guest_access_id
    and revoked_at is null
    and expires_at > clock_timestamp()
  returning expires_at into new_expiry;
  if not found then
    raise exception 'Active, unexpired guest access was not found';
  end if;
  return new_expiry;
end;
$$;
revoke all on function public.admin_rotate_guest_course_access_token(uuid, text)
  from public, anon;
grant execute on function public.admin_rotate_guest_course_access_token(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- H. New four-argument settings RPC. The existing three-argument overload is
-- retained for old application compatibility.
-- ---------------------------------------------------------------------------
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
declare target_row tid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;
  perform pg_advisory_xact_lock(760501, 1);
  select ctid into target_row
  from public.course_payment_settings
  order by updated_at desc nulls last
  limit 1
  for update;
  if configured_bank is null and configured_account_name is null
     and configured_account_number is null and configured_account_type is null then
    if target_row is not null then
      update public.course_payment_settings
      set bank_name = null, account_name = null, account_number = null,
          account_type = null, updated_at = now(), updated_by = auth.uid()
      where ctid = target_row;
    end if;
    return;
  end if;

  if length(btrim(coalesce(configured_bank, ''))) = 0
     or length(btrim(coalesce(configured_account_name, ''))) = 0
     or length(btrim(coalesce(configured_account_number, ''))) = 0
     or length(btrim(coalesce(configured_account_type, ''))) = 0
     or length(configured_bank) > 100
     or length(configured_account_name) > 100
     or length(configured_account_number) > 40
     or length(configured_account_type) > 40 then
    raise exception 'Enter the bank name, account name, account number, and account type';
  end if;

  if target_row is null then
    insert into public.course_payment_settings (
      bank_name, account_name, account_number, account_type, updated_by
    )
    values (
      btrim(configured_bank), btrim(configured_account_name),
      btrim(configured_account_number), btrim(configured_account_type), auth.uid()
    );
  else
    update public.course_payment_settings
    set bank_name = btrim(configured_bank),
        account_name = btrim(configured_account_name),
        account_number = btrim(configured_account_number),
        account_type = btrim(configured_account_type),
        updated_at = now(),
        updated_by = auth.uid()
    where ctid = target_row;
  end if;
end;
$$;
revoke all on function public.save_course_payment_settings(text, text, text, text)
  from public, anon;
grant execute on function public.save_course_payment_settings(text, text, text, text)
  to authenticated;

-- J. Audited per-purchaser, bulk revocation, and safe content deletion.
create or replace function public.admin_revoke_course_access(
  target_profile_id uuid,
  target_course_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason)
  where profile_id = target_profile_id
    and course_id = target_course_id
    and revoked_at is null;
  if not found then raise exception 'Active course-access grant not found'; end if;
end;
$$;
revoke all on function public.admin_revoke_course_access(uuid, uuid, text) from public, anon;
grant execute on function public.admin_revoke_course_access(uuid, uuid, text) to authenticated;

create or replace function public.admin_revoke_guest_course_access(
  target_guest_access_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_guest_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason)
  where id = target_guest_access_id
    and revoked_at is null;
  if not found then raise exception 'Active guest course-access grant not found'; end if;
end;
$$;
revoke all on function public.admin_revoke_guest_course_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_guest_course_access(uuid, text) to authenticated;

create or replace function public.admin_revoke_all_course_access(
  target_course_id uuid,
  revoke_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare revoked_count integer := 0; guest_revoked_count integer := 0;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason)
  where course_id = target_course_id
    and revoked_at is null
    and (expires_at is null or expires_at > clock_timestamp());
  get diagnostics revoked_count = row_count;
  update public.course_guest_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason)
  where course_id = target_course_id
    and revoked_at is null
    and expires_at > clock_timestamp();
  get diagnostics guest_revoked_count = row_count;
  revoked_count := revoked_count + guest_revoked_count;
  return revoked_count;
end;
$$;
revoke all on function public.admin_revoke_all_course_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_all_course_access(uuid, text) to authenticated;

create or replace function public.revoke_manual_course_access(
  target_profile_id uuid,
  target_course_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason)
  where profile_id = target_profile_id
    and course_id = target_course_id
    and grant_source = 'manual'
    and revoked_at is null;
  if not found then raise exception 'Active manual course-access grant not found'; end if;
end;
$$;
revoke all on function public.revoke_manual_course_access(uuid, uuid, text) from public, anon;
grant execute on function public.revoke_manual_course_access(uuid, uuid, text) to authenticated;

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
  delete from public.course_materials where lesson_id = target_lesson_id;
  delete from public.lessons where id = target_lesson_id;
  if not found then raise exception 'Lesson not found'; end if;
end;
$$;
revoke all on function public.delete_lesson(uuid) from public, anon;
grant execute on function public.delete_lesson(uuid) to authenticated;

create or replace function public.delete_course(target_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare removed integer;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_courses') then
    raise exception 'Course management permission required';
  end if;
  if exists (select 1 from public.course_orders where course_id = target_id)
     or exists (select 1 from public.course_access where course_id = target_id)
     or to_regclass('public.course_guest_access') is not null
       and exists (select 1 from public.course_guest_access where course_id = target_id) then
    raise exception 'Course deletion is blocked because payment or entitlement history exists';
  end if;
  delete from public.course_materials cm
    using public.lessons l
    where cm.lesson_id = l.id and l.course_id = target_id;
  get diagnostics removed = row_count;
  delete from public.lessons where course_id = target_id;
  delete from public.courses where id = target_id;
  if not found then raise exception 'Course not found'; end if;
end;
$$;
revoke all on function public.delete_course(uuid) from public, anon;
grant execute on function public.delete_course(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- I. Publicly readable, Main-Admin-managed website settings and private image
-- storage. Direct browser writes are not granted; updates go through the RPC.
-- ---------------------------------------------------------------------------
create table if not exists public.website_settings (
  id boolean primary key default true check (id),
  contact_phone_primary text not null default '+2348035364720'
    check (length(contact_phone_primary) <= 40 and contact_phone_primary ~ '^[+0-9()[:space:]-]*$'),
  contact_phone_secondary text not null default '+2348033628755'
    check (length(contact_phone_secondary) <= 40 and contact_phone_secondary ~ '^[+0-9()[:space:]-]*$'),
  contact_email text not null default 'contactus@adebolacollege.org'
    check (length(contact_email) <= 254 and contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  elearning_email text not null default 'elearning@adebolacollege.org'
    check (length(elearning_email) <= 254 and elearning_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  hero_title text not null default 'Welcome to Adebola College'
    check (length(btrim(hero_title)) between 1 and 140),
  hero_description text not null default 'A private coeducational school offering Junior and Senior Secondary education and distance learning.'
    check (length(btrim(hero_description)) between 1 and 600),
  primary_button_label text not null default 'Explore admissions'
    check (length(btrim(primary_button_label)) between 1 and 40),
  primary_button_href text not null default '/admissions'
    check (primary_button_href in (
      '/about-us', '/academics', '/admissions', '/contact-us',
      '/e-learning', '/families', '/student-life'
    )),
  secondary_button_label text not null default 'About the College'
    check (length(btrim(secondary_button_label)) between 1 and 40),
  secondary_button_href text not null default '/about-us'
    check (secondary_button_href in (
      '/about-us', '/academics', '/admissions', '/contact-us',
      '/e-learning', '/families', '/student-life'
    )),
  hero_image_path text
    check (hero_image_path is null or hero_image_path ~* '^homepage/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp)$'),
  hero_image_alt text not null default 'Students playing on the school field in front of a College building.'
    check (length(btrim(hero_image_alt)) between 1 and 160),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.website_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.website_settings enable row level security;
revoke all on public.website_settings from public, anon, authenticated;
grant select on public.website_settings to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'website_settings'
      and policyname = 'website_settings_public_read'
  ) then
    create policy website_settings_public_read
      on public.website_settings
      for select to anon, authenticated
      using (true);
  end if;
end;
$$;

create or replace function public.save_website_settings(
  configured_contact_phone_primary text,
  configured_contact_phone_secondary text,
  configured_contact_email text,
  configured_elearning_email text,
  configured_hero_title text,
  configured_hero_description text,
  configured_primary_button_label text,
  configured_primary_button_href text,
  configured_secondary_button_label text,
  configured_secondary_button_href text,
  configured_hero_image_path text,
  configured_hero_image_alt text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Enabled Main Admin access is required to manage website settings';
  end if;

  insert into public.website_settings (
    id, contact_phone_primary, contact_phone_secondary, contact_email, elearning_email,
    hero_title, hero_description, primary_button_label, primary_button_href,
    secondary_button_label, secondary_button_href, hero_image_path, hero_image_alt,
    updated_at, updated_by
  )
  values (
    true, btrim(configured_contact_phone_primary), btrim(configured_contact_phone_secondary),
    lower(btrim(configured_contact_email)), lower(btrim(configured_elearning_email)),
    btrim(configured_hero_title), btrim(configured_hero_description),
    btrim(configured_primary_button_label), configured_primary_button_href,
    btrim(configured_secondary_button_label), configured_secondary_button_href,
    configured_hero_image_path, btrim(configured_hero_image_alt), now(), auth.uid()
  )
  on conflict (id) do update set
    contact_phone_primary = excluded.contact_phone_primary,
    contact_phone_secondary = excluded.contact_phone_secondary,
    contact_email = excluded.contact_email,
    elearning_email = excluded.elearning_email,
    hero_title = excluded.hero_title,
    hero_description = excluded.hero_description,
    primary_button_label = excluded.primary_button_label,
    primary_button_href = excluded.primary_button_href,
    secondary_button_label = excluded.secondary_button_label,
    secondary_button_href = excluded.secondary_button_href,
    hero_image_path = excluded.hero_image_path,
    hero_image_alt = excluded.hero_image_alt,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;
revoke all on function public.save_website_settings(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.save_website_settings(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

do $$
declare existing_bucket storage.buckets%rowtype;
begin
  select * into existing_bucket
  from storage.buckets
  where id = 'website-assets';

  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('website-assets', 'website-assets', false, 5242880,
      array['image/jpeg', 'image/png', 'image/webp']::text[]);
  elsif existing_bucket.public
     or existing_bucket.file_size_limit is distinct from 5242880
     or existing_bucket.allowed_mime_types is distinct from
       array['image/jpeg', 'image/png', 'image/webp']::text[] then
    raise exception 'The existing website-assets bucket has unexpected privacy or upload limits; review it before migrating';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'website_assets_main_admin_insert') then
    create policy website_assets_main_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'website-assets' and public.is_main_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'website_assets_main_admin_update') then
    create policy website_assets_main_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'website-assets' and public.is_main_admin())
      with check (bucket_id = 'website-assets' and public.is_main_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'website_assets_main_admin_delete') then
    create policy website_assets_main_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'website-assets' and public.is_main_admin());
  end if;
end;
$$;



notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- POST-DEPLOYMENT NOTES (not executable SQL):
-- - Update the Admin catalogue settings page to read/write account_type and use
--   the four-argument save_course_payment_settings RPC.
-- - Update guest checkout to upload receipt through a signed upload URL and call
--   the five-argument submit_guest_course_order RPC.
-- - Generate random guest tokens server-side; SHA-256 the raw token and pass the
--   lowercase 64-character digest as guest_token_hash when approving a guest.
-- - Send the raw token only in the email access URL. Never store it in a table,
--   browser localStorage, logs, or source control.
-- - Guest access checks must query course_guest_access by token hash and require
--   revoked_at IS NULL and expires_at > now() on every page/video request.
-- - Use short-lived signed URLs for private course-materials video playback.
-- - Student lesson pages must continue calling has_course_access; this function
--   now enforces expiry while keeping manual grants (NULL expiry) intact.
-- - Do not drop or rename existing tables, columns, policies, RPCs, storage
--   buckets, roles, permissions, or Admin workflows as part of this update.


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261124000100_security_and_settings.sql
-- Source blob: d8a34ca5243ea52feb329d196ba641978e485a7e
-- -----------------------------------------------------------------------------
-- Adebola College MAIN production security and settings follow-up migration.
-- Apply only after 20261123000100_guest_course_entitlements_and_expiry.sql
-- and only after the matching read-only preflight passes.



-- Add complete student entitlement revocation support.
alter table public.course_access
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists revoked_reason text,
  add column if not exists revocation_reason text;

-- Guest entitlements already have revoked_at and revoked_by
-- from the previous guest-entitlement migration.
alter table public.course_guest_access
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists revoked_reason text,
  add column if not exists revocation_reason text;


-- Legacy guest submission has no receipt path and must never be callable.
revoke all on function public.submit_guest_course_order(uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- Legacy payment review is application-disabled. It cannot be used to approve
-- guest or paid access through an older signature.
revoke all on function public.review_course_order(uuid, boolean, text, uuid)
  from public, anon, authenticated, service_role;

-- Existing 2-argument revoke overloads are revoked below so callers must provide
-- a reason and retain an auditable revocation.
revoke all on function public.revoke_manual_course_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_course_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_revoke_guest_course_access(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.has_course_access(requested_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null
    and public.is_active_student_profile()
    and exists (
      select 1
      from public.course_access ca
      where ca.profile_id = auth.uid()
        and ca.course_id = requested_course_id
        and ca.revoked_at is null
        and (ca.expires_at is null or ca.expires_at > now())
    );
$$;
revoke all on function public.has_course_access(uuid) from public, anon;
grant execute on function public.has_course_access(uuid) to authenticated;

-- Student and guest individual revocations retain the row and audit fields.
create or replace function public.admin_revoke_course_access(
  target_profile_id uuid,
  target_course_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason),
      revocation_reason = btrim(revoke_reason)
  where profile_id = target_profile_id
    and course_id = target_course_id
    and grant_source = 'approved_order'
    and revoked_at is null;
  if not found then raise exception 'Active payment-approved course access not found'; end if;
end;
$$;
revoke all on function public.admin_revoke_course_access(uuid, uuid, text) from public, anon;
grant execute on function public.admin_revoke_course_access(uuid, uuid, text) to authenticated;

create or replace function public.admin_revoke_guest_course_access(
  target_guest_access_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_guest_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason),
      revocation_reason = btrim(revoke_reason)
  where id = target_guest_access_id and revoked_at is null;
  if not found then raise exception 'Active guest course access not found'; end if;
end;
$$;
revoke all on function public.admin_revoke_guest_course_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_guest_course_access(uuid, text) to authenticated;

create or replace function public.revoke_manual_course_access(
  target_profile_id uuid,
  target_course_id uuid,
  revoke_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason),
      revocation_reason = btrim(revoke_reason)
  where profile_id = target_profile_id
    and course_id = target_course_id
    and grant_source = 'manual'
    and revoked_at is null;
  if not found then raise exception 'Active manual course access not found'; end if;
end;
$$;
revoke all on function public.revoke_manual_course_access(uuid, uuid, text) from public, anon;
grant execute on function public.revoke_manual_course_access(uuid, uuid, text) to authenticated;

create or replace function public.admin_revoke_all_course_access(
  target_course_id uuid,
  revoke_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare revoked_count integer := 0;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason),
      revocation_reason = btrim(revoke_reason)
  where course_id = target_course_id
    and revoked_at is null
    and (expires_at is null or expires_at > clock_timestamp());
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;
revoke all on function public.admin_revoke_all_course_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_all_course_access(uuid, text) to authenticated;

create or replace function public.admin_revoke_all_guest_course_access(
  target_course_id uuid,
  revoke_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare revoked_count integer := 0;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  update public.course_guest_access
  set revoked_at = clock_timestamp(),
      revoked_by = auth.uid(),
      revoked_reason = btrim(revoke_reason),
      revocation_reason = btrim(revoke_reason)
  where course_id = target_course_id
    and revoked_at is null
    and expires_at > clock_timestamp();
  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;
revoke all on function public.admin_revoke_all_guest_course_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_all_guest_course_access(uuid, text) to authenticated;

create or replace function public.admin_revoke_all_course_entitlements(
  target_course_id uuid,
  revoke_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  student_count integer;
  guest_count integer;
begin
  if auth.uid() is null or not public.has_admin_permission('view_orders_payments') then
    raise exception 'Payment management permission required';
  end if;
  if revoke_reason is null or length(btrim(revoke_reason)) not between 1 and 500 then
    raise exception 'A revocation reason is required';
  end if;
  select public.admin_revoke_all_course_access(target_course_id, revoke_reason)
    into student_count;
  select public.admin_revoke_all_guest_course_access(target_course_id, revoke_reason)
    into guest_count;
  return student_count + guest_count;
end;
$$;
revoke all on function public.admin_revoke_all_course_entitlements(uuid, text) from public, anon;
grant execute on function public.admin_revoke_all_course_entitlements(uuid, text) to authenticated;

create table if not exists public.course_access_revocation_history (
  id bigint generated always as identity primary key,
  profile_id uuid not null,
  course_id uuid not null,
  order_id uuid,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz not null,
  revoked_by uuid,
  revocation_reason text,
  reactivated_at timestamptz not null,
  reactivated_by uuid
);
alter table public.course_access_revocation_history enable row level security;
revoke all on public.course_access_revocation_history from public, anon, authenticated;
grant select on public.course_access_revocation_history to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'course_access_revocation_history'
      and policyname = 'course_access_revocation_history_admin_read'
  ) then
    create policy course_access_revocation_history_admin_read
      on public.course_access_revocation_history
      for select to authenticated
      using (public.has_admin_permission('view_orders_payments'));
  end if;
end;
$$;


-- Repurchase and manual re-grant clear the current revoked state
-- while preserving the previous revocation in audit history.

create or replace function public.clear_course_access_reactivation_reason()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if TG_OP = 'UPDATE'
    and OLD.revoked_at is not null
    and (
      (
        OLD.grant_source = 'approved_order'
        and NEW.grant_source = 'approved_order'
        and NEW.order_id is distinct from OLD.order_id
      )
      or
      (
        OLD.grant_source = 'manual'
        and NEW.grant_source = 'manual'
        and NEW.order_id is not distinct from OLD.order_id
        and NEW.granted_at is distinct from OLD.granted_at
      )
    )
  then
    insert into public.course_access_revocation_history (
      profile_id,
      course_id,
      order_id,
      granted_at,
      expires_at,
      revoked_at,
      revoked_by,
      revocation_reason,
      reactivated_at,
      reactivated_by
    )
    values (
      OLD.profile_id,
      OLD.course_id,
      OLD.order_id,
      OLD.granted_at,
      OLD.expires_at,
      OLD.revoked_at,
      OLD.revoked_by,
      coalesce(OLD.revocation_reason, OLD.revoked_reason),
      clock_timestamp(),
      auth.uid()
    );

    NEW.revoked_at := null;
    NEW.revoked_by := null;
    NEW.revoked_reason := null;
    NEW.revocation_reason := null;
  end if;

  return NEW;
end;
$$;

revoke all on function public.clear_course_access_reactivation_reason()
  from public, anon, authenticated, service_role;

drop trigger if exists course_access_reactivation_reason_clear
  on public.course_access;

create trigger course_access_reactivation_reason_clear
before insert or update on public.course_access
for each row
execute function public.clear_course_access_reactivation_reason();


-- Keep the legacy three-argument payment-settings RPC as a compatibility
-- wrapper. The application should use the four-argument function with account_type.
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
declare target_row tid;
begin
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;
  perform pg_advisory_xact_lock(760501, 1);
  select ctid into target_row
  from public.course_payment_settings
  order by updated_at desc nulls last
  limit 1
  for update;
  if configured_bank is null and configured_account_name is null
     and configured_account_number is null then
    if target_row is not null then
      update public.course_payment_settings
      set bank_name = null, account_name = null, account_number = null,
          account_type = null, updated_at = clock_timestamp(), updated_by = auth.uid()
      where ctid = target_row;
    end if;
    return;
  end if;
  if length(btrim(coalesce(configured_bank, ''))) = 0
     or length(btrim(coalesce(configured_account_name, ''))) = 0
     or length(btrim(coalesce(configured_account_number, ''))) = 0
     or length(configured_bank) > 100
     or length(configured_account_name) > 100
     or length(configured_account_number) > 40 then
    raise exception 'Enter the bank name, account name, and account number';
  end if;
  if target_row is null then
    insert into public.course_payment_settings (
      bank_name, account_name, account_number, updated_by
    )
    values (
      btrim(configured_bank), btrim(configured_account_name),
      btrim(configured_account_number), auth.uid()
    );
  else
    update public.course_payment_settings
    set bank_name = btrim(configured_bank),
        account_name = btrim(configured_account_name),
        account_number = btrim(configured_account_number),
        updated_at = clock_timestamp(),
        updated_by = auth.uid()
    where ctid = target_row;
  end if;
end;
$$;
revoke all on function public.save_course_payment_settings(text, text, text) from public, anon;
grant execute on function public.save_course_payment_settings(text, text, text) to authenticated;

-- Persistent public website content and Main-Admin-only save RPC.
create table if not exists public.website_settings (
  id boolean primary key default true check (id),
  contact_phone_primary text not null default '+2348035364720'
    check (length(contact_phone_primary) <= 40),
  contact_phone_secondary text not null default '+2348033628755'
    check (length(contact_phone_secondary) <= 40),
  contact_email text not null default 'contactus@adebolacollege.org'
    check (length(contact_email) <= 254),
  elearning_email text not null default 'elearning@adebolacollege.org'
    check (length(elearning_email) <= 254),
  hero_title text not null default 'Welcome to Adebola College'
    check (length(btrim(hero_title)) between 1 and 140),
  hero_description text not null default 'A private coeducational school offering Junior and Senior Secondary education and distance learning.'
    check (length(btrim(hero_description)) between 1 and 600),
  primary_button_label text not null default 'Explore admissions'
    check (length(btrim(primary_button_label)) between 1 and 40),
  primary_button_href text not null default '/admissions',
  secondary_button_label text not null default 'About the College'
    check (length(btrim(secondary_button_label)) between 1 and 40),
  secondary_button_href text not null default '/about-us',
  hero_image_path text,
  hero_image_alt text not null default 'Students playing on the school field in front of a College building.'
    check (length(btrim(hero_image_alt)) between 1 and 160),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.website_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.website_settings enable row level security;
revoke all on public.website_settings from public, anon, authenticated;
grant select on public.website_settings to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='website_settings'
      and policyname='website_settings_public_read'
  ) then
    create policy website_settings_public_read
      on public.website_settings
      for select to anon, authenticated
      using (true);
  end if;
end;
$$;

create or replace function public.save_website_settings(
  configured_contact_phone_primary text,
  configured_contact_phone_secondary text,
  configured_contact_email text,
  configured_elearning_email text,
  configured_hero_title text,
  configured_hero_description text,
  configured_primary_button_label text,
  configured_primary_button_href text,
  configured_secondary_button_label text,
  configured_secondary_button_href text,
  configured_hero_image_path text,
  configured_hero_image_alt text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Enabled Main Admin access is required';
  end if;
  insert into public.website_settings (
    id, contact_phone_primary, contact_phone_secondary, contact_email, elearning_email,
    hero_title, hero_description, primary_button_label, primary_button_href,
    secondary_button_label, secondary_button_href, hero_image_path, hero_image_alt,
    updated_at, updated_by
  )
  values (
    true, btrim(configured_contact_phone_primary), btrim(configured_contact_phone_secondary),
    lower(btrim(configured_contact_email)), lower(btrim(configured_elearning_email)),
    btrim(configured_hero_title), btrim(configured_hero_description),
    btrim(configured_primary_button_label), configured_primary_button_href,
    btrim(configured_secondary_button_label), configured_secondary_button_href,
    configured_hero_image_path, btrim(configured_hero_image_alt), clock_timestamp(), auth.uid()
  )
  on conflict (id) do update set
    contact_phone_primary=excluded.contact_phone_primary,
    contact_phone_secondary=excluded.contact_phone_secondary,
    contact_email=excluded.contact_email,
    elearning_email=excluded.elearning_email,
    hero_title=excluded.hero_title,
    hero_description=excluded.hero_description,
    primary_button_label=excluded.primary_button_label,
    primary_button_href=excluded.primary_button_href,
    secondary_button_label=excluded.secondary_button_label,
    secondary_button_href=excluded.secondary_button_href,
    hero_image_path=excluded.hero_image_path,
    hero_image_alt=excluded.hero_image_alt,
    updated_at=clock_timestamp(),
    updated_by=auth.uid();
end;
$$;
revoke all on function public.save_website_settings(
  text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
grant execute on function public.save_website_settings(
  text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

do $$
declare existing_bucket storage.buckets%rowtype;
begin
  select * into existing_bucket from storage.buckets where id='website-assets';
  if not found then
    insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
    values ('website-assets','website-assets',false,5242880,
      array['image/jpeg','image/png','image/webp']::text[]);
  elsif existing_bucket.public
    or existing_bucket.file_size_limit is distinct from 5242880
    or existing_bucket.allowed_mime_types is distinct from
       array['image/jpeg','image/png','image/webp']::text[] then
    raise exception 'Existing website-assets bucket has conflicting privacy or upload limits';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='website_assets_main_admin_insert'
  ) then
    create policy website_assets_main_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id='website-assets' and public.is_main_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='website_assets_main_admin_update'
  ) then
    create policy website_assets_main_admin_update on storage.objects
      for update to authenticated
      using (bucket_id='website-assets' and public.is_main_admin())
      with check (bucket_id='website-assets' and public.is_main_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='website_assets_main_admin_delete'
  ) then
    create policy website_assets_main_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id='website-assets' and public.is_main_admin());
  end if;
end;
$$;

create or replace function public.delete_lesson(target_lesson_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_lessons') then
    raise exception 'Lesson management permission required';
  end if;
  delete from public.course_materials where lesson_id=target_lesson_id;
  delete from public.lessons where id=target_lesson_id;
  if not found then raise exception 'Lesson not found'; end if;
end;
$$;
revoke all on function public.delete_lesson(uuid) from public, anon;
grant execute on function public.delete_lesson(uuid) to authenticated;

create or replace function public.delete_course(target_id uuid)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if auth.uid() is null or not public.has_admin_permission('manage_courses') then
    raise exception 'Course management permission required';
  end if;
  if exists (select 1 from public.course_orders where course_id=target_id)
    or exists (select 1 from public.course_access where course_id=target_id)
    or exists (select 1 from public.course_guest_access where course_id=target_id) then
    raise exception 'Course deletion is blocked because payment or entitlement history exists';
  end if;
  delete from public.course_materials cm
    using public.lessons l
    where cm.lesson_id=l.id and l.course_id=target_id;
  delete from public.lessons where course_id=target_id;
  delete from public.courses where id=target_id;
  if not found then raise exception 'Course not found'; end if;
end;
$$;
revoke all on function public.delete_course(uuid) from public, anon;
grant execute on function public.delete_course(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261125000100_uuid_safe_course_payment_settings.sql
-- Source blob: 7ed08db68866833764abecc875145e4c1e4e42bf
-- -----------------------------------------------------------------------------
-- Adebola College MAIN production rollout.
-- Preserve the existing course_payment_settings primary-key type and all existing rows.
-- The function addresses the singleton settings row by ctid so it works whether the
-- existing id column is UUID or the legacy boolean key. No table is recreated or reset.

alter table public.course_payment_settings
  add column if not exists account_type text;

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
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;

  -- Serialize settings writes so two first-time saves cannot create competing rows.
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

  -- Preserve the current type only for older three-argument callers.
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

-- Keep older three-argument clients working without reintroducing boolean/UUID comparisons.
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
  from public, anon;
grant execute on function public.save_course_payment_settings(text, text, text, text)
  to authenticated;

revoke all on function public.save_course_payment_settings(text, text, text)
  from public, anon;
grant execute on function public.save_course_payment_settings(text, text, text)
  to authenticated;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261125000200_course_lesson_metadata_alignment.sql
-- Source blob: d36b926f642ebb20d99713fd55d3da55d4bb4058
-- -----------------------------------------------------------------------------
-- Adebola College MAIN production lesson metadata schema alignment.
-- Add only the fields already expected by the application. This is intentionally
-- repeat-safe and preserves every existing lesson record and attached material.
-- Run only in the MAIN production baseline.



do $$
begin
  if to_regclass('public.lessons') is null then
    raise exception 'public.lessons does not exist. Apply and verify the course-learning base migration first.';
  end if;
end;
$$;

alter table public.lessons
  add column if not exists description text not null default '',
  add column if not exists duration_minutes smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_description_length_check'
  ) then
    alter table public.lessons
      add constraint lessons_description_length_check
      check (length(description) <= 5000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_duration_minutes_check'
  ) then
    alter table public.lessons
      add constraint lessons_duration_minutes_check
      check (duration_minutes is null or duration_minutes between 1 and 600);
  end if;
end;
$$;

-- Fail the migration if the application-facing metadata columns are still absent.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lessons'
      and column_name = 'description'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lessons'
      and column_name = 'duration_minutes'
  ) then
    raise exception 'Lesson metadata alignment failed: description/duration_minutes are not available.';
  end if;
end;
$$;

-- Ensure the metadata-aware lesson save RPC exists on TEST. It delegates to
-- the existing permission-checked save_lesson implementation, then updates only
-- the two additive metadata fields.
create or replace function public.save_lesson(
  target_id uuid,
  target_course_id uuid,
  lesson_title text,
  requested_lesson_code text,
  requested_status text,
  lesson_description text,
  requested_duration_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare saved_id uuid;
begin
  if lesson_description is null or length(lesson_description) > 5000
     or (requested_duration_minutes is not null
       and requested_duration_minutes not between 1 and 600) then
    raise exception 'Lesson description or duration is invalid';
  end if;

  saved_id := public.save_lesson(
    target_id,
    target_course_id,
    lesson_title,
    requested_lesson_code,
    requested_status
  );

  update public.lessons
  set description = btrim(lesson_description),
      duration_minutes = requested_duration_minutes,
      updated_at = now()
  where id = saved_id;

  return saved_id;
end;
$$;

revoke all on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  from public, anon;
grant execute on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  to authenticated;



select
  'PASS' as result,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lessons'
  and column_name in ('description', 'duration_minutes')
order by column_name;


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261126000100_orders_and_material_repair.sql
-- Source blob: 24ac3e8f6a8c74536b20779f7a58a51f522cf29b
-- -----------------------------------------------------------------------------
-- Adebola College MAIN production repair migration.
-- Preserves existing course orders and uploaded course-material records.


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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261127000100_forward_database_correction.sql
-- Source blob: 288e3edd268ccb4b4530ee59d0fbc96ff2550666
-- -----------------------------------------------------------------------------
-- Adebola College forward-only database correction.
-- Apply after the applied 20261125000200 lesson-metadata migration and the
-- 20261126000100 order/material repair migration.
-- Supersedes the UUID-safe payment-settings implementation from 20261125000100;
-- do not execute that older migration after 20261125000200.
-- This migration is additive/idempotent and preserves existing records.


update public.course_materials cm
set course_id = l.course_id
from public.lessons l
where cm.lesson_id = l.id
  and cm.course_id is distinct from l.course_id;

alter table public.course_materials
  alter column course_id set not null;

do $$
declare
  material_course_attribute smallint;
  material_lesson_attribute smallint;
  lesson_course_attribute smallint;
  lesson_id_attribute smallint;
  matching_constraint record;
begin
  select attnum into material_course_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'course_id'
    and not attisdropped;

  select attnum into material_lesson_attribute
  from pg_attribute
  where attrelid = 'public.course_materials'::regclass
    and attname = 'lesson_id'
    and not attisdropped;

  select attnum into lesson_course_attribute
  from pg_attribute
  where attrelid = 'public.lessons'::regclass
    and attname = 'course_id'
    and not attisdropped;

  select attnum into lesson_id_attribute
  from pg_attribute
  where attrelid = 'public.lessons'::regclass
    and attname = 'id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lessons'::regclass
      and contype in ('u', 'p')
      and conkey = array[lesson_course_attribute, lesson_id_attribute]::smallint[]
  ) then
    raise exception 'Required unique key lessons(course_id, id) is missing';
  end if;

  select conname, convalidated, confdeltype into matching_constraint
  from pg_constraint
  where conrelid = 'public.course_materials'::regclass
    and confrelid = 'public.lessons'::regclass
    and contype = 'f'
    and conkey = array[material_course_attribute, material_lesson_attribute]::smallint[]
    and confkey = array[lesson_course_attribute, lesson_id_attribute]::smallint[]
  limit 1;

  if not found then
    alter table public.course_materials
      add constraint course_materials_course_lesson_fk
      foreign key (course_id, lesson_id)
      references public.lessons(course_id, id)
      on delete cascade;
  elsif matching_constraint.confdeltype <> 'c' then
    raise exception 'Existing course-material association has incompatible delete behavior';
  elsif not matching_constraint.convalidated then
    execute format(
      'alter table public.course_materials validate constraint %I',
      matching_constraint.conname
    );
  end if;
end;
$$;

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

-- Legacy guest submission and student/guest approval signatures remain restricted.
revoke all on function public.submit_guest_course_order(uuid, text, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.review_course_order(uuid, boolean, text, uuid)
  from public, anon, authenticated, service_role;

alter table public.course_materials enable row level security;
alter table public.course_access enable row level security;
alter table public.course_guest_access enable row level security;
alter table public.course_orders enable row level security;

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


-- -----------------------------------------------------------------------------
-- Reviewed source section: 20261128000100_course_materials_and_orders_repair.sql
-- Source blob: 18a949a940631a84a0a2810861a84affad666f9e
-- -----------------------------------------------------------------------------
-- Forward-only repair for payment settings, audit logging, course materials, and order email status.
-- Existing course material rows and Storage objects are retained.


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

COMMIT;
