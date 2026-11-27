const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(
  root, 'supabase', 'migrations', '20261123000100_guest_course_entitlements_and_expiry.sql',
), 'utf8');
const followup = fs.readFileSync(path.join(
  root, 'supabase', 'migrations', '20261124000100_security_and_settings.sql',
), 'utf8');
const catalogueActions = fs.readFileSync(path.join(
  root, 'app', 'admin', '(protected)', 'catalogue-actions.js',
), 'utf8');
const coursesPage = fs.readFileSync(path.join(
  root, 'app', 'admin', '(protected)', 'courses', 'page.js',
), 'utf8');
const lessonsPage = fs.readFileSync(path.join(
  root, 'app', 'admin', '(protected)', 'lessons', 'page.js',
), 'utf8');
const materialsPage = fs.readFileSync(path.join(
  root, 'app', 'admin', '(protected)', 'materials', 'page.js',
), 'utf8');

test('Admin course-management actions provide separate video, lesson and course deletion', () => {
  assert.match(catalogueActions, /removeMaterialAction/);
  assert.match(catalogueActions, /deleteLessonAction/);
  assert.match(catalogueActions, /deleteCourseAction/);
  assert.match(coursesPage, /Delete course/);
  assert.match(lessonsPage, /Delete lesson/);
  assert.match(materialsPage, /Delete video/);
  assert.match(coursesPage, /result\.warning/);
  assert.match(lessonsPage, /result\.warning/);
});

test('bulk and per-entitlement revocation require an audited reason', () => {
  assert.match(followup, /admin_revoke_all_course_access\(uuid, text\)/i);
  assert.match(followup, /admin_revoke_all_guest_course_access\(uuid, text\)/i);
  assert.match(followup, /admin_revoke_all_course_entitlements\(uuid, text\)/i);
  assert.match(followup, /course_access_revocation_history/i);
  assert.match(followup, /revocation_reason text/i);
  assert.match(followup, /A revocation reason is required/i);
  assert.match(followup, /revoked_by = auth\.uid\(\)/i);
  assert.match(catalogueActions, /revokeAllCourseAccessAction/);
  assert.match(catalogueActions, /rpc\('admin_revoke_all_course_entitlements'/i);
  assert.doesNotMatch(catalogueActions, /rpc\('admin_revoke_all_guest_course_access'/i);
  assert.match(catalogueActions, /revoke_reason: reason/);
});

test('course and lesson deletion preserve dependent payment and entitlement history', () => {
  assert.match(migration, /create or replace function public\.delete_course\(target_id uuid\)/i);
  assert.match(migration, /Course deletion is blocked because payment or entitlement history exists/i);
  assert.match(migration, /create or replace function public\.delete_lesson\(target_lesson_id uuid\)/i);
  assert.match(catalogueActions, /payment history exists/i);
  assert.match(catalogueActions, /entitlement history exists/i);
});
