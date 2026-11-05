const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261109000100_recoverable_account_archiving.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('student archive and restore preserve identity and record actor/time', () => {
  assert.match(migration, /add column if not exists archived_at timestamptz/i);
  assert.match(migration, /add column if not exists archived_by uuid references auth\.users/i);
  assert.match(migration, /public\.has_admin_permission\('manage_student_records'\)/i);
  assert.match(migration, /set is_active = false/i);
  assert.match(migration, /set is_active = true/i);
  assert.match(migration, /'student\.archived'/i);
  assert.match(migration, /'student\.restored'/i);
  assert.match(migration, /revoke update \(is_active\) on public\.students from authenticated/i);
  assert.doesNotMatch(migration, /delete from public\.(students|profiles|admin_permissions)/i);
});

test('Sub-Admin archival is Main Admin-only and does not alter assigned permissions', () => {
  assert.match(migration, /public\.is_main_admin\(\)/i);
  assert.match(migration, /p\.sub_admin_archived_at is null/i);
  assert.match(migration, /'sub_admin\.archived'/i);
  assert.match(migration, /'sub_admin\.restored'/i);
  assert.match(migration, /grant execute on function public\.set_sub_admin_archived\(uuid, boolean\) to authenticated/i);
  assert.doesNotMatch(migration, /delete from public\.admin_permissions/i);
});
