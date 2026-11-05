const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatSupabaseError } = require('../utils/supabase-error.cjs');

test('Supabase failure messages retain safe diagnostic fields', () => {
  assert.equal(
    formatSupabaseError({
      message: 'permission denied',
      code: '42501',
      details: 'row policy denied the operation',
      hint: 'check the Main Admin policy',
    }, 'Saving the result'),
    'Saving the result: permission denied — code 42501 — row policy denied the operation — Hint: check the Main Admin policy',
  );
});
