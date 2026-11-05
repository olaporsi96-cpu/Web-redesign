const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  invitationFailure,
  recoveryEmailFailure,
} = require('../utils/invitation-error.cjs');

test('rate-limited invitations are explicitly not sent and explain the TEST email restriction', () => {
  const result = invitationFailure(new Error('email rate limit exceeded'), 'Sub-Admin');
  assert.equal(result.ok, false);
  assert.equal(result.rateLimited, true);
  assert.match(result.error, /2 emails per hour/);
  assert.match(result.error, /SMTP is not configured/);
  assert.match(result.error, /verified sending domain and SMTP provider/);
  assert.match(result.error, /The Sub-Admin invitation was not sent/);
});

test('HTTP 429 Auth failures are classified as rate limited', () => {
  const result = invitationFailure({ status: 429, message: 'Too many requests' }, 'Sub-Admin');
  assert.equal(result.ok, false);
  assert.equal(result.rateLimited, true);
  assert.match(result.error, /The Sub-Admin invitation was not sent/);
});

test('rate-limited recovery emails are never reported as delivered', () => {
  const result = recoveryEmailFailure({ status: 429, message: 'Too many requests' });
  assert.equal(result.ok, false);
  assert.equal(result.rateLimited, true);
  assert.match(result.error, /password-recovery email was not sent/);
});

test('other Auth failures remain explicit', () => {
  assert.deepEqual(
    invitationFailure(new Error('SMTP server unavailable'), 'student'),
    { ok: false, error: 'Unable to send the student invitation: SMTP server unavailable' },
  );
});
