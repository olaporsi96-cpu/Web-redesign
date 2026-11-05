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
