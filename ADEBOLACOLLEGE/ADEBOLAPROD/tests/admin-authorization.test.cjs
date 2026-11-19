const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  effectiveAdminPermissions,
  getAdminLandingPath,
  hasAdminPermission,
  hasAdminRouteAccess,
  isAdminEnabledProfile,
  isMainAdminProfile,
  requiredPermissions,
} = require('../utils/admin-authorization.cjs');

test('Main Admin and Sub-Admin roles are distinguished', () => {
  assert.equal(isMainAdminProfile(null), false);
  assert.equal(isMainAdminProfile({ role: 'student' }), false);
  assert.equal(isMainAdminProfile({ role: 'main_admin' }), true);
  assert.equal(isMainAdminProfile({ role: 'sub_admin' }), false);
  assert.equal(isAdminEnabledProfile({ role: 'main_admin', admin_enabled: true }), true);
  assert.equal(isAdminEnabledProfile({ role: 'sub_admin', admin_enabled: false }), false);
});

test('Sub-Admins can access routes only through assigned permissions', () => {
  const mainAdmin = { role: 'main_admin', admin_enabled: true };
  const subAdmin = { role: 'sub_admin', admin_enabled: true };

  assert.equal(hasAdminRouteAccess(mainAdmin, '/admin/users'), true);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/results', ['manage_results']), true);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/results', ['release_results']), false);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/results', ['view_students']), false);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/users', ['view_dashboard']), false);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/activity', ['view_dashboard']), false);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/calendar', ['view_dashboard']), false);
});

test('unauthenticated and non-Admin profiles cannot access protected Admin routes', () => {
  for (const profile of [null, {}, { role: 'student', admin_enabled: true }]) {
    assert.equal(hasAdminRouteAccess(profile, '/admin', ['view_dashboard']), false);
    assert.equal(hasAdminRouteAccess(profile, '/admin/results', ['manage_results']), false);
  }
});

test('course and lesson permission aliases are honored without broadening unrelated access', () => {
  const subAdmin = { role: 'sub_admin', admin_enabled: true };

  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/courses', ['manage_courses_lessons']), true);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/lessons', ['manage_courses_lessons']), true);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/lessons', ['publish_unpublish_lessons']), true);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/courses', ['publish_unpublish_lessons']), false);
  assert.equal(hasAdminPermission(subAdmin, ['manage_courses_lessons'], 'manage_courses'), true);
  assert.equal(hasAdminPermission(subAdmin, ['publish_unpublish_lessons'], 'manage_lessons'), false);
  assert.equal(hasAdminPermission(subAdmin, ['manage_results'], 'release_results'), false);
  assert.deepEqual(effectiveAdminPermissions(['publish_unpublish_lessons']), ['publish_unpublish_lessons']);
});

test('unknown routes are denied, while the profile and first permitted route are available', () => {
  const subAdmin = { role: 'sub_admin', admin_enabled: true };

  assert.deepEqual(requiredPermissions('/admin/unmapped'), []);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/unmapped', ['view_dashboard']), false);
  assert.equal(hasAdminRouteAccess(subAdmin, '/admin/profile', []), true);
  assert.equal(getAdminLandingPath(subAdmin, ['manage_results']), '/admin/results');
  assert.equal(getAdminLandingPath(subAdmin, []), '/admin/profile');
});

test('archived Sub-Admins lose route and action authorization without deleting permissions', () => {
  const previous = process.env.SUB_ADMIN_ARCHIVING_ENABLED;
  try {
    process.env.SUB_ADMIN_ARCHIVING_ENABLED = 'true';
    const archived = {
      role: 'sub_admin',
      admin_enabled: true,
      sub_admin_archived_at: '2026-11-09T12:00:00Z',
    };
    const retainedPermissions = ['manage_results'];

    assert.equal(hasAdminRouteAccess(archived, '/admin/results', retainedPermissions), false);
    assert.equal(hasAdminRouteAccess(archived, '/admin/profile', retainedPermissions), false);
    assert.equal(hasAdminPermission(archived, retainedPermissions, 'manage_results'), false);
    assert.deepEqual(retainedPermissions, ['manage_results']);
  } finally {
    if (previous === undefined) delete process.env.SUB_ADMIN_ARCHIVING_ENABLED;
    else process.env.SUB_ADMIN_ARCHIVING_ENABLED = previous;
  }
});

test('Sub-Admin authorization remains backward-compatible before the archive migration is enabled', () => {
  const previous = process.env.SUB_ADMIN_ARCHIVING_ENABLED;
  try {
    delete process.env.SUB_ADMIN_ARCHIVING_ENABLED;
    const preMigrationProfile = {
      role: 'sub_admin',
      admin_enabled: true,
      sub_admin_archived_at: null,
    };
    assert.equal(hasAdminRouteAccess(preMigrationProfile, '/admin/results', ['manage_results']), true);
  } finally {
    if (previous !== undefined) process.env.SUB_ADMIN_ARCHIVING_ENABLED = previous;
  }
});

test('disabled Admin accounts cannot access routes, permissions, or sign-in landing paths', () => {
  const disabledMainAdmin = { role: 'main_admin', admin_enabled: false };
  const disabledSubAdmin = { role: 'sub_admin', admin_enabled: false };

  assert.equal(hasAdminRouteAccess(disabledMainAdmin, '/admin/users'), false);
  assert.equal(hasAdminPermission(disabledMainAdmin, [], 'manage_admin_users'), false);
  assert.equal(hasAdminRouteAccess(disabledSubAdmin, '/admin/results', ['manage_results']), false);
  assert.equal(hasAdminPermission(disabledSubAdmin, ['manage_results'], 'manage_results'), false);
  assert.equal(getAdminLandingPath(disabledSubAdmin, ['manage_results']), '/admin/login/sub-admin');
});
