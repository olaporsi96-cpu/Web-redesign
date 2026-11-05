const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createInvitationRedirect } = require('../utils/invitation-redirect.cjs');

test('invitation URLs use the configured local TEST origin', () => {
  assert.equal(
    createInvitationRedirect('http://localhost:3000', '/auth/confirm?next=accept-student'),
    'http://localhost:3000/auth/confirm?next=accept-student',
  );
});

test('invitation URLs use the configured HTTPS origin outside local development', () => {
  assert.equal(
    createInvitationRedirect('https://test.example.org', '/auth/confirm?next=accept-subadmin'),
    'https://test.example.org/auth/confirm?next=accept-subadmin',
  );
});

test('invitation origin rejects missing, insecure, or path-bearing configuration', () => {
  assert.throws(() => createInvitationRedirect('', '/auth/confirm'), /must be set/);
  assert.throws(() => createInvitationRedirect('http://example.org', '/auth/confirm'), /secure origin/);
  assert.throws(() => createInvitationRedirect('https://test.example.org/path', '/auth/confirm'), /secure origin/);
});
