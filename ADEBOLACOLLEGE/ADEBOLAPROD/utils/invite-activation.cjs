const { createHmac, timingSafeEqual } = require('node:crypto');

const INVITE_ACTIVATION_COOKIE = 'adebola-invite-activation';
const INVITE_ACTIVATION_TTL_MS = 30 * 60 * 1000;

function createInviteActivationToken(userId, secret, now = Date.now()) {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error('A valid invited user ID is required.');
  }
  if (typeof secret !== 'string' || !secret) {
    throw new Error('Server invitation verification is not configured.');
  }

  const expiresAt = now + INVITE_ACTIVATION_TTL_MS;
  const payload = `${userId}:${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `${userId}:${expiresAt}:${signature}`;
}

function getInviteActivationUserId(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !secret) return null;
  const [userId, expiresAtValue, signature, ...extra] = token.split(':');
  if (extra.length || !/^[0-9a-f-]{36}$/i.test(userId || '')) return null;

  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + INVITE_ACTIVATION_TTL_MS) {
    return null;
  }

  const payload = `${userId}:${expiresAt}`;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'hex');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return userId;
}

module.exports = {
  INVITE_ACTIVATION_COOKIE,
  INVITE_ACTIVATION_TTL_MS,
  createInviteActivationToken,
  getInviteActivationUserId,
};
