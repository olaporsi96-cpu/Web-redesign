const { randomBytes, createHash } = require('node:crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function createGuestAccessToken() {
  return randomBytes(32).toString('base64url');
}

function isGuestAccessToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function hashGuestAccessToken(token) {
  if (!isGuestAccessToken(token)) throw new Error('Invalid guest access token.');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email);
}

function isAllowedReceiptType(type) {
  return RECEIPT_TYPES.has(type);
}

function isAllowedReceiptSize(size) {
  return Number.isSafeInteger(size) && size > 0 && size <= MAX_RECEIPT_BYTES;
}

function matchesReceiptSignature(type, bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return false;
  const buffer = Buffer.from(bytes);
  if (type === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === 'image/png') return buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'application/pdf') return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  return false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

module.exports = {
  createGuestAccessToken,
  escapeHtml,
  hashGuestAccessToken,
  isAllowedReceiptSize,
  isAllowedReceiptType,
  isGuestAccessToken,
  isValidEmail,
  matchesReceiptSignature,
};
