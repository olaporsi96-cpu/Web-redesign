const { test } = require('node:test');
const assert = require('node:assert/strict');
const { invitationLinkErrorMessage } = require('../utils/invite-link-error.cjs');

test('invalid, expired, and already-used invitation links show a useful recovery message', () => {
  for (const code of ['invalid-invite', 'invite-verification']) {
    const message = invitationLinkErrorMessage(code);
    assert.match(message, /invalid, expired, or has already been used/);
    assert.match(message, /pending account/);
  }
});

test('unknown invitation error codes do not display a misleading error', () => {
  assert.equal(invitationLinkErrorMessage(null), '');
});
