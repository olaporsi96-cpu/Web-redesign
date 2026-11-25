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

  assert.match(migration, /add column if not exists description text not null default ''/i);
  assert.match(migration, /add column if not exists duration_minutes smallint/i);
  assert.match(migration, /lessons_description_length_check/i);
  assert.match(migration, /lessons_duration_minutes_check/i);
  assert.match(migration, /to_regclass\('public\.lessons'\)/i);
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
