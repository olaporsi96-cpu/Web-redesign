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

alter table storage.objects enable row level security;
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
