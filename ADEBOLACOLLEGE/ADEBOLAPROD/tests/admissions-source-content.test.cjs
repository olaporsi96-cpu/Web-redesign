const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Admissions page includes the supplied admission, sample-paper and CBT facts in its FAQ', () => {
  const page = fs.readFileSync(path.join(root, 'app', 'admissions', 'page.js'), 'utf8');

  for (const text of [
    'What is the expected age for admission?',
    'Which year groups are listed for admission?',
    'Which sample entrance examination papers are available?',
    'Which computer-based examinations does the College facilitate?',
    'The supplied Admissions information lists the JAMB enrollment registration fee as #40,000',
    'The supplied Admissions information lists GTB Bank, account number 0008456903',
    'contactus@adebola.org',
    'Frequently asked questions',
  ]) {
    assert.ok(page.includes(text), `Admissions content must include: ${text}`);
  }
});

test('dark theme forces dark feature-band surfaces with readable light foregrounds', () => {
  const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
  assert.match(css, /:root\[data-theme='dark'\] \.pathways-section[\s\S]*background: #0b1832 !important/i);
  assert.match(css, /:root\[data-theme='dark'\] \.curriculum-section[\s\S]*color: #edf3ff !important/i);
});
