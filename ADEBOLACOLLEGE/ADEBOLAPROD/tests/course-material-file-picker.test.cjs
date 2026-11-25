const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const materialsPage = fs.readFileSync(path.join(root, 'app', 'admin', '(protected)', 'materials', 'page.js'), 'utf8');
const adminStyles = fs.readFileSync(path.join(root, 'app', 'admin', 'admin.css'), 'utf8');
const admissionsPage = fs.readFileSync(path.join(root, 'app', 'admissions', 'page.js'), 'utf8');

test('Course Materials uses an explicitly associated keyboard-accessible file picker', () => {
  assert.match(materialsPage, /id=\{fileInputId\} className="file-picker-input" type="file"/);
  assert.match(materialsPage, /htmlFor=\{fileInputId\} className="text-button file-action-label"/);
  assert.match(adminStyles, /\.file-picker-input:focus-visible \+ \.file-action-label/);
  assert.match(materialsPage, /accept="application\/pdf,video\/mp4,\.pdf,\.mp4"/);
  assert.match(materialsPage, /className="material-document-preview" src=\{selected\.previewUrl\}/);
  assert.match(materialsPage, /className="material-video-preview" controls preload="metadata" src=\{selected\.previewUrl\}/);
});

test('Admissions FAQ answers are visible and question anchors target them', () => {
  assert.match(admissionsPage, /<nav className="faq-navigation"/);
  assert.match(admissionsPage, /<article className="faq-item" id=\{item\.id\}/);
  assert.match(admissionsPage, /<h3>\{item\.question\}<\/h3>/);
  assert.match(admissionsPage, /<p>\{item\.answer\}<\/p>/);
  assert.match(admissionsPage, /href=\{`#\$\{item\.id\}`\}/);
  assert.match(admissionsPage, /id: 'faq-age'/);
});
