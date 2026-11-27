-- Adebola College TEST-only security and settings follow-up migration.
-- Apply only after 20261123000100_guest_course_entitlements_and_expiry.sql
-- and only after the matching read-only preflight passes.
begin;


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

commit;
