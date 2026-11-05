const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20261107000100_admin_workflows_and_calendar.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');

test('forward migration exposes the exact student-invite RPC contract', () => {
  assert.match(migration, /create function public\.create_invited_student\(\s*target_user_id uuid,\s*target_name text,\s*target_student_number text\s*\)/i);
  assert.match(migration, /grant execute on function public\.create_invited_student\(uuid, text, text\) to authenticated/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
});

test('Main Admin authorization does not rely on an unsupported enabled field', () => {
  assert.doesNotMatch(migration, /admin_enabled/i);
  assert.match(migration, /where p\.id = auth\.uid\(\)\s+and p\.role = 'main_admin'/i);
  assert.match(migration, /select required_permission is not null\s+and auth\.uid\(\) is not null\s+and public\.is_main_admin\(\)/i);
});

test('calendar reads only published records publicly and restricts writes to Main Admin', () => {
  assert.match(migration, /using \(status = 'published' or public\.is_main_admin\(\)\)/i);
  assert.match(migration, /for insert to authenticated\s+with check \(public\.is_main_admin\(\)\)/i);
  assert.match(migration, /for update to authenticated\s+using \(public\.is_main_admin\(\)\)\s+with check \(public\.is_main_admin\(\)\)/i);
  assert.match(migration, /for delete to authenticated\s+using \(public\.is_main_admin\(\)\)/i);
  assert.match(migration, /timezone text not null default 'Africa\/Lagos'/i);
});
