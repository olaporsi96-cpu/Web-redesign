const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(
  root,
  'supabase',
  'migrations',
  '20261123000100_guest_course_entitlements_and_expiry.sql',
), 'utf8');
const followup = fs.readFileSync(path.join(
  root,
  'supabase',
  'migrations',
  '20261124000100_security_and_settings.sql',
), 'utf8');
const preflight = fs.readFileSync(path.join(
  root,
  'supabase',
  'preflight',
  '20261124000100_security_and_settings_preflight.sql',
), 'utf8');

test('paid approvals use a database approval timestamp and expire after exactly seven days', () => {
  assert.match(migration, /decision_time := clock_timestamp\(\)/i);
  assert.match(migration, /decision_time \+ interval '7 days'/i);
  assert.match(migration, /expires_at > now\(\)/i);
  assert.match(migration, /revoked_at is null/i);
});

test('lesson details fit the supplied content and exact client title without replacing existing lesson rows', () => {
  assert.match(migration, /add column if not exists description text not null default ''/i);
  assert.match(migration, /add column if not exists duration_minutes smallint/i);
  assert.match(migration, /check \(length\(btrim\(title\)\) between 1 and 140\)/i);
  assert.match(migration, /check \(length\(description\) <= 5000\)/i);
  assert.match(migration, /public\.save_lesson\(uuid, uuid, text, text, text, text, integer\)/i);
  assert.match(preflight, /READ-ONLY PREFLIGHT/i);
});

test('guest token verification is service-role-only and never grants authenticated access to its digest column', () => {
  assert.match(migration, /create or replace function public\.get_guest_course_access\(token_digest text\)/i);
  assert.match(migration, /and ga\.access_token_hash = token_digest/i);
  assert.match(migration, /and ga\.revoked_at is null\s+and ga\.expires_at > clock_timestamp\(\)/i);
  assert.match(migration, /revoke all on function public\.get_guest_course_access\(text\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_guest_course_access\(text\) to service_role/i);
  assert.match(migration, /grant select \(\s*id, order_id, course_id, buyer_name, buyer_email,/i);
  assert.doesNotMatch(migration, /grant select on public\.course_guest_access to authenticated/i);
  assert.doesNotMatch(migration, /grant select \([^)]*access_token_hash/i);
});

test('guest checkout requires a private receipt and disables the receipt-less legacy overload', () => {
  assert.match(migration, /create or replace function public\.submit_guest_course_order\([\s\S]*?submitted_proof_path text[\s\S]*?\)\s*returns uuid/i);
  assert.match(migration, /submitted_proof_path !~ '\^guest\//i);
  assert.match(migration, /revoke all on function public\.submit_guest_course_order\(uuid, text, text, text\)\s+from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.submit_guest_course_order\(uuid, text, text, text, text\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.submit_guest_course_order\(uuid, text, text, text, text\)\s+to service_role/i);
  assert.match(migration, /mimetype.*image\/jpeg.*image\/png.*application\/pdf/i);
  assert.match(migration, /10485760/i);
});

test('student and guest revocations retain audit fields and manual access remains re-grantable', () => {
  assert.match(followup, /revocation_reason text/i);
  assert.match(followup, /create or replace function public\.admin_revoke_guest_course_access/i);
  assert.match(followup, /create or replace function public\.revoke_manual_course_access/i);
  assert.match(followup, /revoke all on function public\.review_course_order\(uuid, boolean, text, uuid\)/i);
  assert.match(followup, /revoke all on function public\.submit_guest_course_order\(uuid, text, text, text\)/i);
});

test('read-only preflight checks both existing private storage bucket limits', () => {
  assert.match(preflight, /course-materials','course-payment-proofs','website-assets/i);
  assert.match(preflight, /No statement in this file modifies data/i);
  assert.match(preflight, /READ-ONLY PREFLIGHT/i);
});

test('follow-up migration revokes legacy approval and guest-submission ABI', () => {
  assert.match(migration, /revoke all on function public\.review_course_order\(uuid, boolean, text, uuid\)\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke all on function public\.submit_guest_course_order\(uuid, text, text, text\)\s+from public, anon, authenticated, service_role/i);
  assert.match(followup, /revoke all on function public\.submit_guest_course_order\(uuid, text, text, text\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(followup, /revoke all on function public\.review_course_order\(uuid, boolean, text, uuid\)[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.review_course_order\(uuid, boolean, text, uuid, text\)\s+to authenticated/i);
  assert.match(followup, /expires_at is null or expires_at > clock_timestamp/i);
  assert.match(followup, /clear_course_access_reactivation_reason/i);
});
