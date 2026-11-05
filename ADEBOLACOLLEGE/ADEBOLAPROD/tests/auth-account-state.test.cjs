const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getAccountEmailAction } = require('../utils/auth-account-state.cjs');

test('pending invitation accounts are identified without attempting signup resend', () => {
  assert.equal(getAccountEmailAction({
    id: 'auth-user-id',
    invited_at: '2026-11-09T12:00:00Z',
    email_confirmed_at: null,
  }), 'pending-invitation');
});

test('activated accounts use password recovery rather than another invitation', () => {
  assert.equal(getAccountEmailAction({
    id: 'auth-user-id',
    invited_at: '2026-11-09T12:00:00Z',
    email_confirmed_at: '2026-11-09T12:05:00Z',
  }), 'password-recovery');
});

test('missing and otherwise unconfirmed Auth users fail closed', () => {
  assert.equal(getAccountEmailAction(null), 'unavailable');
  assert.equal(getAccountEmailAction({ id: 'auth-user-id' }), 'unconfirmed');
});
