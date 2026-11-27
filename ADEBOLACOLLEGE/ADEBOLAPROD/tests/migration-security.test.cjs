const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const preflightDir = path.join(root, 'supabase', 'preflight');

test('Supabase migration runner contains unique migration versions and no preflight scripts', () => {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
  const versions = files.map((name) => name.match(/^(\d+)_/)?.[1]).filter(Boolean);
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(files.some((name) => /preflight/i.test(name)), false);
  assert.equal(files.includes('20261124000100_security_and_settings.sql'), true);
  assert.equal(files.includes('20261123000100_guest_course_entitlements_and_expiry.sql'), true);
  assert.equal(files.includes('20261125000200_course_lesson_metadata_alignment.sql'), true);
});

test('read-only preflight is outside the migration runner', () => {
  assert.equal(fs.existsSync(path.join(preflightDir, '20261124000100_security_and_settings_preflight.sql')), true);
  const preflight = fs.readFileSync(path.join(
    preflightDir,
    '20261124000100_security_and_settings_preflight.sql',
  ), 'utf8');
  assert.match(preflight, /READ-ONLY PREFLIGHT/i);
  assert.doesNotMatch(preflight, /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|call|do)\b/im);
});

test('revocation combines student and guest updates atomically and preserves repurchase audit history', () => {
  const migration = fs.readFileSync(path.join(
    migrationsDir,
    '20261124000100_security_and_settings.sql',
  ), 'utf8');
  assert.match(migration, /create or replace function public\.admin_revoke_all_course_entitlements\(\s*target_course_id uuid,\s*revoke_reason text\s*\)/i);
  assert.match(migration, /select public\.admin_revoke_all_course_access\(target_course_id, revoke_reason\)[\s\S]*select public\.admin_revoke_all_guest_course_access\(target_course_id, revoke_reason\)/i);
  assert.match(migration, /create table if not exists public\.course_access_revocation_history/i);
  assert.match(migration, /insert into public\.course_access_revocation_history/i);
  assert.match(migration, /OLD\.grant_source = 'manual'[\s\S]*NEW\.granted_at is distinct from OLD\.granted_at/i);
  assert.match(migration, /and \(ca\.expires_at is null or ca\.expires_at > now\(\)\)/i);
  assert.match(migration, /OLD\.grant_source = 'approved_order'[\s\S]*NEW\.order_id is distinct from OLD\.order_id/i);
  assert.match(migration, /create or replace function public\.save_course_payment_settings\(\s*configured_bank text,\s*configured_account_name text,\s*configured_account_number text\s*\)/i);
  assert.match(migration, /declare target_row tid/i);
  assert.match(migration, /where ctid = target_row/i);
  assert.doesNotMatch(migration, /id\s*=\s*true|delete from public\.course_payment_settings where id\s*=/i);

  const uuidSafeMigration = fs.readFileSync(path.join(
    migrationsDir,
    '20261125000100_uuid_safe_course_payment_settings.sql',
  ), 'utf8');
  assert.match(uuidSafeMigration, /effective_account_type := nullif\(btrim\(configured_account_type\), ''\)/i);
  assert.match(uuidSafeMigration, /effective_account_type := nullif\(btrim\(existing_account_type\), ''\)/i);
  assert.match(uuidSafeMigration, /account_type = effective_account_type/i);
});
