const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app', 'admin', '(protected)', 'media', 'page.js'), 'utf8').replace(/\r\n/g, '\n');
const actions = fs.readFileSync(path.join(root, 'app', 'admin', '(protected)', 'media', 'actions.js'), 'utf8').replace(/\r\n/g, '\n');

test('featured-video delete handler is available to the confirmation dialog', () => {
  assert.match(page, /async function save\(event\)[\s\S]*?\n  }\n\n  async function removeVideo\(\)/);
  assert.match(page, /onConfirm=\{removeVideo\}/);
});

test('featured-video deletion is Main-Admin-only and clears metadata before object removal', () => {
  assert.match(actions, /isMainAdminProfile\(profile\)/);
  const clearMetadata = actions.indexOf('const { error: clearError }');
  const removeObject = actions.indexOf(".storage.from('elearning-public-media').remove([current.video_path])");
  assert.ok(clearMetadata >= 0);
  assert.ok(removeObject > clearMetadata);
});
