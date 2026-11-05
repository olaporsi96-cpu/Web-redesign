const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..', 'app', 'admin', '(protected)');
const studentActions = fs.readFileSync(path.join(appRoot, 'students', 'actions.js'), 'utf8');
const subAdminActions = fs.readFileSync(path.join(appRoot, 'users', 'actions.js'), 'utf8');

test('invitation actions preflight existing records and never delete Auth users as compensation', () => {
  assert.match(studentActions, /\.from\('profiles'\)[\s\S]*?\.ilike\('email'/);
  assert.match(studentActions, /\.ilike\('student_number'/);
  assert.match(studentActions, /create_invited_student/);
  assert.match(subAdminActions, /\.from\('profiles'\)[\s\S]*?\.ilike\('email'/);
  assert.match(subAdminActions, /assign_sub_admin/);
  assert.doesNotMatch(studentActions, /deleteUser/);
  assert.doesNotMatch(subAdminActions, /deleteUser/);
});

test('partial invite persistence is returned as failure and blocks a second submission', () => {
  assert.match(studentActions, /invitationCreated: true/);
  assert.match(subAdminActions, /invitationCreated: true/);
  const studentForm = fs.readFileSync(path.join(appRoot, 'students', 'page.js'), 'utf8');
  const subAdminForm = fs.readFileSync(path.join(appRoot, 'users', 'page.js'), 'utf8');
  assert.match(studentForm, /response\.rateLimited \|\| response\.invitationCreated/);
  assert.match(subAdminForm, /response\.invitationCreated/);
});
