const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261108000100_enable_assigned_sub_admin_permissions.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('Sub-Admin database permissions use role and assigned permission rows without an enabled column', () => {
  assert.doesNotMatch(migration, /admin_enabled/i);
  assert.match(migration, /p\.role = 'sub_admin'/i);
  assert.match(migration, /ap\.permission_key = required_permission/i);
  assert.match(migration, /grant execute on function public\.has_admin_permission\(text\) to authenticated/i);
  assert.doesNotMatch(migration, /'manage_admin_users'/i);
});

test('lesson publishing is separately permission-checked in the database', () => {
  assert.match(migration, /public\.has_admin_permission\('publish_unpublish_lessons'\)/i);
  assert.match(migration, /create or replace function public\.set_lesson_publish_status/i);
  assert.match(migration, /grant execute on function public\.set_lesson_publish_status\(uuid, text\) to authenticated/i);
  assert.match(migration, /public\.has_admin_permission\('manage_lessons'\)\s+or public\.has_admin_permission\('publish_unpublish_lessons'\)/i);
});
