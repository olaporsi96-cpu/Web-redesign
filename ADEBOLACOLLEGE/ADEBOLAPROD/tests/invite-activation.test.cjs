const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  INVITE_ACTIVATION_TTL_MS,
  createInviteActivationToken,
  getInviteActivationUserId,
} = require('../utils/invite-activation.cjs');

const userId = '5fe7a1f9-aa5d-4465-ab12-6db7a5710d69';
const secret = 'test-only-secret';
const now = 1_800_000_000_000;

test('invitation activation token is bound to the user and expires', () => {
  const token = createInviteActivationToken(userId, secret, now);
  assert.equal(getInviteActivationUserId(token, secret, now), userId);
  assert.equal(getInviteActivationUserId(token, secret, now + INVITE_ACTIVATION_TTL_MS), null);
});

test('invalid, modified, and differently signed activation tokens are rejected', () => {
  const token = createInviteActivationToken(userId, secret, now);
  const [id, expires, signature] = token.split(':');
  assert.equal(getInviteActivationUserId(`${id}:${expires}:${signature.slice(1)}`, secret, now), null);
  assert.equal(getInviteActivationUserId(token, 'other-secret', now), null);
  assert.equal(getInviteActivationUserId('not-a-token', secret, now), null);
});

test('activation token creation requires a server secret and valid user ID', () => {
  assert.throws(() => createInviteActivationToken(userId, ''), /not configured/);
  assert.throws(() => createInviteActivationToken('not-a-uuid', secret), /valid invited user ID/);
});
