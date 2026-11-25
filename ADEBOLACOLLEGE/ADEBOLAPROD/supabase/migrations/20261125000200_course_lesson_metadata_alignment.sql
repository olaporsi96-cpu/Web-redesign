-- Adebola College TEST/staging lesson metadata schema alignment.
-- Add only the fields already expected by the application. This is intentionally
-- repeat-safe and preserves every existing lesson record and attached material.
-- Run only in the approved TEST Supabase project, never against LIVE.

begin;

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
as $
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
$;

revoke all on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  from public, anon;
grant execute on function public.save_lesson(uuid, uuid, text, text, text, text, integer)
  to authenticated;

commit;

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
