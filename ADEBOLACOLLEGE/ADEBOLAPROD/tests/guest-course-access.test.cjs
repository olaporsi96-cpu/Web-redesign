const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const guestAccess = require('../utils/guest-access.cjs');

const root = path.join(__dirname, '..');

test('guest access tokens are high-entropy opaque values and only their SHA-256 digest is stored', () => {
  const first = guestAccess.createGuestAccessToken();
  const second = guestAccess.createGuestAccessToken();
  const digest = guestAccess.hashGuestAccessToken(first);

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, first);
  assert.throws(() => guestAccess.hashGuestAccessToken('not-a-token'), /Invalid guest access token/);
});

test('receipt validation accepts only bounded JPEG, PNG, and PDF data with matching signatures', () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdf = Buffer.from('%PDF-1.7');

  for (const type of ['image/jpeg', 'image/png', 'application/pdf']) {
    assert.equal(guestAccess.isAllowedReceiptType(type), true);
  }
  assert.equal(guestAccess.isAllowedReceiptType('video/mp4'), false);
  assert.equal(guestAccess.isAllowedReceiptSize(1), true);
  assert.equal(guestAccess.isAllowedReceiptSize(10 * 1024 * 1024), true);
  assert.equal(guestAccess.isAllowedReceiptSize(10 * 1024 * 1024 + 1), false);
  assert.equal(guestAccess.matchesReceiptSignature('image/jpeg', jpg), true);
  assert.equal(guestAccess.matchesReceiptSignature('image/png', png), true);
  assert.equal(guestAccess.matchesReceiptSignature('application/pdf', pdf), true);
  assert.equal(guestAccess.matchesReceiptSignature('application/pdf', jpg), false);
});

test('buyer email validation rejects malformed addresses and HTML is escaped for email output', () => {
  assert.equal(guestAccess.isValidEmail('learner@example.org'), true);
  assert.equal(guestAccess.isValidEmail('bad address'), false);
  assert.equal(guestAccess.isValidEmail(`${'a'.repeat(250)}@example.org`), false);
  assert.equal(guestAccess.escapeHtml('<script>"&</script>'), '&lt;script&gt;&quot;&amp;&lt;/script&gt;');
});

test('guest links become HttpOnly secure cookies and protected pages validate access server-side', () => {
  const route = fs.readFileSync(path.join(root, 'app', 'e-learning', 'access', 'route.js'), 'utf8');
  const accessHelper = fs.readFileSync(path.join(root, 'utils', 'guest-course-access.js'), 'utf8');
  const lessonPage = fs.readFileSync(path.join(root, 'app', 'e-learning', 'guest', '[courseId]', '[lessonId]', 'page.js'), 'utf8');

  assert.match(route, /httpOnly:\s*true/);
  assert.match(route, /secure:\s*process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /sameSite:\s*'lax'/);
  assert.match(accessHelper, /rpc\('get_guest_course_access'/);
  assert.match(lessonPage, /getGuestCourseAccess\(courseId\)/);
  assert.doesNotMatch(route + accessHelper + lessonPage, /localStorage|sessionStorage/);
});
