-- Repair guest-entitlement email status columns when the table predates them.
begin;

alter table public.course_guest_access
  add column if not exists access_email_sent_at timestamptz,
  add column if not exists access_email_error text;

commit;
