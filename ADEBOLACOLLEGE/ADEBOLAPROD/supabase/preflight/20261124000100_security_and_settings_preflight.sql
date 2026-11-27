-- READ-ONLY PREFLIGHT. Run only in Adebola College TEST/development SQL Editor.
-- Project ref: jmxuffazlpcdwcpqnjau. No statement in this file modifies data.

with required_tables(table_name) as (
  values ('course_access'), ('course_guest_access'), ('course_orders'),
         ('course_access_revocation_history'), ('website_settings'),
         ('course_payment_settings')
)
select 'PASS' as result, 'Required table ' || table_name as check_name
from required_tables
where to_regclass('public.' || table_name) is not null
union all
select 'FAIL', 'Required table ' || table_name
from required_tables
where to_regclass('public.' || table_name) is null;

with required_columns(table_name, column_name) as (
  values
    ('course_access','expires_at'), ('course_access','revoked_at'),
    ('course_access','revoked_by'), ('course_access','revoked_reason'),
    ('course_access','revocation_reason'), ('course_access','grant_source'),
    ('course_access','order_id'), ('course_guest_access','expires_at'),
    ('course_guest_access','revoked_at'), ('course_guest_access','revoked_by'),
    ('course_guest_access','revoked_reason'), ('course_guest_access','revocation_reason'),
    ('course_access_revocation_history','profile_id'),
    ('course_access_revocation_history','course_id'),
    ('course_access_revocation_history','order_id'),
    ('course_access_revocation_history','revoked_at'),
    ('course_access_revocation_history','revoked_by'),
    ('course_access_revocation_history','revocation_reason'),
    ('course_access_revocation_history','reactivated_at'),
    ('course_access_revocation_history','reactivated_by'),
    ('website_settings','hero_image_path'), ('website_settings','contact_email'),
    ('course_payment_settings','account_type')
)
select 'PASS' as result,
       'Required column ' || table_name || '.' || column_name as check_name
from required_columns c
where exists (
  select 1 from information_schema.columns i
  where i.table_schema = 'public'
    and i.table_name = c.table_name
    and i.column_name = c.column_name
)
union all
select 'FAIL',
       'Required column ' || table_name || '.' || column_name
from required_columns c
where not exists (
  select 1 from information_schema.columns i
  where i.table_schema = 'public'
    and i.table_name = c.table_name
    and i.column_name = c.column_name
);


-- Required functions: inspect existence, security and execute privileges.
with required_functions(signature) as (
  values
    ('public.review_course_order(uuid,boolean,text,uuid,text)'),
    ('public.submit_guest_course_order(uuid,text,text,text,text)'),
    ('public.has_course_access(uuid)'),
    ('public.admin_revoke_course_access(uuid,uuid,text)'),
    ('public.admin_revoke_guest_course_access(uuid,text)'),
    ('public.revoke_manual_course_access(uuid,uuid,text)'),
    ('public.admin_revoke_all_course_access(uuid,text)'),
    ('public.admin_revoke_all_guest_course_access(uuid,text)'),
    ('public.admin_revoke_all_course_entitlements(uuid,text)'),
    ('public.save_course_payment_settings(text,text,text,text)'),
    ('public.save_course_payment_settings(text,text,text)'),
    ('public.save_website_settings(text,text,text,text,text,text,text,text,text,text,text,text)')
),
checked as (
  select
    r.signature,
    p.oid is not null as function_exists,
    coalesce(p.prosecdef, false) as security_definer,
    case when p.oid is null then null
      else has_function_privilege('anon', p.oid, 'EXECUTE')
    end as anon_execute,
    case when p.oid is null then null
      else has_function_privilege('authenticated', p.oid, 'EXECUTE')
    end as authenticated_execute,
    case when p.oid is null then null
      else has_function_privilege('service_role', p.oid, 'EXECUTE')
    end as service_role_execute
  from required_functions r
  left join pg_proc p
    on p.oid = to_regprocedure(r.signature)
)
select
  case when function_exists then 'PRESENT' else 'MISSING' end as status,
  signature,
  security_definer,
  anon_execute,
  authenticated_execute,
  service_role_execute
from checked
order by signature;

-- Legacy overloads must not be executable by API roles.
with legacy_functions(signature) as (
  values
    ('public.submit_guest_course_order(uuid,text,text,text)'),
    ('public.review_course_order(uuid,boolean,text,uuid)')
),
checked as (
  select
    r.signature,
    p.oid is not null as function_exists,
    case when p.oid is null then false
      else has_function_privilege('anon', p.oid, 'EXECUTE')
    end as anon_execute,
    case when p.oid is null then false
      else has_function_privilege('authenticated', p.oid, 'EXECUTE')
    end as authenticated_execute,
    case when p.oid is null then false
      else has_function_privilege('service_role', p.oid, 'EXECUTE')
    end as service_role_execute
  from legacy_functions r
  left join pg_proc p
    on p.oid = to_regprocedure(r.signature)
)
select
  case
    when not function_exists
      or (
        not anon_execute
        and not authenticated_execute
        and not service_role_execute
      )
    then 'PASS'
    else 'FAIL'
  end as result,
  signature,
  anon_execute,
  authenticated_execute,
  service_role_execute
from checked;


select 'PASS' as result, 'RLS enabled: ' || table_name as check_name
from (
  select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('course_access','course_guest_access','course_orders',
                       'course_access_revocation_history','website_settings')
) t
where exists (
  select 1 from pg_tables p
  where p.schemaname = 'public'
    and p.tablename = t.table_name
    and p.rowsecurity
)
union all
select 'FAIL', 'RLS enabled: ' || table_name
from (
  select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('course_access','course_guest_access','course_orders',
                       'course_access_revocation_history','website_settings')
) t
where not exists (
  select 1 from pg_tables p
  where p.schemaname = 'public'
    and p.tablename = t.table_name
    and p.rowsecurity
);

with required_policies(table_name, policy_name) as (
  values
    ('website_settings','website_settings_public_read'),
    ('objects','website_assets_main_admin_insert'),
    ('objects','website_assets_main_admin_update'),
    ('objects','website_assets_main_admin_delete')
)
select 'PASS' as result, 'Required policy ' || table_name || '.' || policy_name as check_name
from required_policies r
where exists (
  select 1 from pg_policies p
  where p.policyname = r.policy_name
    and (p.tablename = r.table_name
         or (r.table_name = 'objects' and p.schemaname = 'storage'))
)
union all
select 'FAIL', 'Required policy ' || table_name || '.' || policy_name
from required_policies r
where not exists (
  select 1 from pg_policies p
  where p.policyname = r.policy_name
    and (p.tablename = r.table_name
         or (r.table_name = 'objects' and p.schemaname = 'storage'))
);

select 'PASS' as result,
       'Private Storage bucket ' || b.id as check_name
from storage.buckets b
where b.id in ('course-materials','course-payment-proofs','website-assets')
  and b.public = false
union all
select 'FAIL',
       'Private Storage bucket ' || b.id
from storage.buckets b
where b.id in ('course-materials','course-payment-proofs','website-assets')
  and b.public = true
union all
select 'FAIL', 'Missing private Storage bucket ' || required_id
from (values ('course-materials'), ('course-payment-proofs'), ('website-assets')) r(required_id)
where not exists (
  select 1 from storage.buckets b
  where b.id = r.required_id and b.public = false
);

select 'PASS' as result,
       'Website image bucket limits: ' || id as check_name
from storage.buckets
where id = 'website-assets'
  and public = false
  and file_size_limit = 5242880
  and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']::text[]
union all
select 'FAIL',
       'Website image bucket limits: ' || id
from storage.buckets
where id = 'website-assets'
  and (public = true
       or file_size_limit is distinct from 5242880
       or allowed_mime_types is distinct from
          array['image/jpeg','image/png','image/webp']::text[])
union all
select 'FAIL', 'Website image bucket limits: website-assets'
where not exists (
  select 1 from storage.buckets where id = 'website-assets'
);

select 'PASS' as result,
       'Course Materials private bucket limits: ' || id as check_name
from storage.buckets
where id = 'course-materials'
  and public = false
  and file_size_limit = 52428800
  and allowed_mime_types @> array['video/mp4','application/pdf']::text[]
union all
select 'FAIL',
       'Course Materials private bucket limits: ' || id
from storage.buckets
where id = 'course-materials'
  and (public = true
       or file_size_limit is distinct from 52428800
       or allowed_mime_types is not null
          and not (allowed_mime_types @> array['video/mp4','application/pdf']::text[]))
union all
select 'FAIL', 'Missing private bucket or limits: course-materials'
where not exists (
  select 1 from storage.buckets
  where id = 'course-materials'
    and public = false
    and file_size_limit = 52428800
);

select 'PASS' as result,
       'Payment Proof private bucket limits: ' || id as check_name
from storage.buckets
where id = 'course-payment-proofs'
  and public = false
  and file_size_limit = 10485760
  and allowed_mime_types @> array['image/jpeg','image/png','application/pdf']::text[]
union all
select 'FAIL',
       'Payment Proof private bucket limits: ' || id
from storage.buckets
where id = 'course-payment-proofs'
  and (public = true
       or file_size_limit is distinct from 10485760
       or allowed_mime_types is not null
          and not (allowed_mime_types @> array['image/jpeg','image/png','application/pdf']::text[]))
union all
select 'FAIL', 'Missing private bucket or limits: course-payment-proofs'
where not exists (
  select 1 from storage.buckets
  where id = 'course-payment-proofs'
    and public = false
    and file_size_limit = 10485760
);
