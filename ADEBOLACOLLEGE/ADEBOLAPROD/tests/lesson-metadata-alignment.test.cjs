const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('lesson metadata alignment adds only the fields used by Admin and E-Learning', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261125000200_course_lesson_metadata_alignment.sql',
  ), 'utf8');

  assert.ok(migration.includes("add column if not exists description text not null default ''"));
  assert.ok(migration.includes('add column if not exists duration_minutes smallint'));
  assert.ok(migration.includes('lessons_description_length_check'));
  assert.ok(migration.includes('lessons_duration_minutes_check'));
  assert.ok(migration.includes("to_regclass('public.lessons')"));
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from public\.lessons)\b/i);
});

test('Admin and public catalogue queries request the aligned lesson fields', () => {
  const adminActions = fs.readFileSync(path.join(
    root, 'app', 'admin', '(protected)', 'catalogue-actions.js',
  ), 'utf8');
  const publicCatalogue = fs.readFileSync(path.join(root, 'app', 'e-learning', 'page.js'), 'utf8');

  assert.match(adminActions, /from\('lessons'\)[\s\S]*description,duration_minutes/i);
  assert.match(publicCatalogue, /from\('lessons'\)[\s\S]*description,duration_minutes/i);
});

test('metadata-aware save_lesson overload delegates to permission-checked base function', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261125000200_course_lesson_metadata_alignment.sql',
  ), 'utf8');

  assert.ok(migration.includes('create or replace function public.save_lesson('));
  assert.ok(migration.includes('lesson_description text,'));
  assert.ok(migration.includes('requested_duration_minutes integer'));
  assert.match(migration, /public\.save_lesson\(\s*target_id,/);
  assert.ok(migration.includes('set description = btrim(lesson_description),'));
  assert.ok(migration.includes('duration_minutes = requested_duration_minutes,'));
  assert.match(migration, /grant execute on function public\.save_lesson\(uuid, uuid, text, text, text, text, integer\)\s+to authenticated;/);
});
