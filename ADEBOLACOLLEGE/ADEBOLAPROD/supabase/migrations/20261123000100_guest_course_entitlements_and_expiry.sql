-- Adebola College STAGING / TEST only.
-- Follow-up migration for the existing course/payment schema.
-- Expected base migration: 20261105000100_course_learning_payments.sql
-- Do NOT run against the LIVE/production Supabase project.
--
-- IMPORTANT:
-- 1. Run the read-only staging preflight first and confirm the base tables,
--    columns, helper functions, buckets, and policies exist.
-- 2. This migration is designed to be applied once to the TEST project after
--    reviewing the current schema. It does not seed courses or alter student,
--    results, Admin, Sub-Admin, calendar, or featured-video data.
-- 3. App code must be deployed with the matching RPC argument names and guest
--    access flow described in the Copilot implementation brief.

begin;

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
    raise exception 'Required TEST schema objects are missing: %. Run the read-only preflight and review the schema first.',
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
    raise exception 'Expected lessons_title_check was not found; review the TEST schema before migrating';
  elsif position('140' in title_check) = 0 then
    if position('100' in title_check) = 0 then
      raise exception 'Unexpected lessons_title_check definition; review the TEST schema before migrating';
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
begin
  if auth.uid() is null or not public.has_admin_permission('manage_catalogue_settings') then
    raise exception 'Catalogue settings permission required';
  end if;

  if configured_bank is null and configured_account_name is null
     and configured_account_number is null and configured_account_type is null then
    delete from public.course_payment_settings where id = true;
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

  insert into public.course_payment_settings (
    id, bank_name, account_name, account_number, account_type, updated_by
  )
  values (
    true, btrim(configured_bank), btrim(configured_account_name),
    btrim(configured_account_number), btrim(configured_account_type), auth.uid()
  )
  on conflict (id) do update
    set bank_name = excluded.bank_name,
        account_name = excluded.account_name,
        account_number = excluded.account_number,
        account_type = excluded.account_type,
        updated_at = now(),
        updated_by = auth.uid();
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

commit;

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
