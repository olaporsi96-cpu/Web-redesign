-- Adebola College forward-only database correction.
-- Apply after the applied 20261125000200 lesson-metadata migration and the
-- 20261126000100 order/material repair migration.
-- Supersedes the UUID-safe payment-settings implementation from 20261125000100;
-- do not execute that older migration after 20261125000200.
-- This migration is additive/idempotent and preserves existing records.
begin;

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

commit;
