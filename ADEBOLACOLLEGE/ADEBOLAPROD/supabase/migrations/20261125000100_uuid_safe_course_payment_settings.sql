-- Adebola College TEST/staging rollout.
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
