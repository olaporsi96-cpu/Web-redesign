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
