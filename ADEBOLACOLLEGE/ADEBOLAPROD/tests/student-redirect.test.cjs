const test = require('node:test');
const assert = require('node:assert/strict');
const { getStudentRedirectTarget } = require('../utils/student-redirect.cjs');

test('student login can return to a lesson viewer', () => {
  assert.equal(
    getStudentRedirectTarget('/e-learning/5fe7a1f9-aa5d-4465-ab12-6db7a5710d69'),
    '/e-learning/5fe7a1f9-aa5d-4465-ab12-6db7a5710d69',
  );
});

test('student login rejects external and unsupported return paths', () => {
  assert.equal(getStudentRedirectTarget('https://example.com'), '/student/results');
  assert.equal(getStudentRedirectTarget('//example.com'), '/student/results');
  assert.equal(getStudentRedirectTarget('/admin'), '/student/results');
  assert.equal(getStudentRedirectTarget(null), '/student/results');
});
