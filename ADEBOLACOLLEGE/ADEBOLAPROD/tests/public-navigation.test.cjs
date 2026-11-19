const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applyNowHref, publicNavigation } = require('../utils/public-navigation.cjs');

const appDirectory = path.join(__dirname, '..', 'app');

function routeSource(href) {
  const [pathname, fragment] = href.split('#');
  const routeDirectory = pathname === '/' ? '' : pathname.slice(1);
  return {
    file: path.join(appDirectory, routeDirectory, 'page.js'),
    fragment,
  };
}

function allNavigationLinks() {
  return publicNavigation.flatMap((item) => [item, ...(item.links || [])]);
}

test('public navigation points only to existing pages and section anchors', () => {
  const expectedPages = [
    '/',
    '/about-us',
    '/admissions',
    '/academics',
    '/student-life',
    '/families',
    '/e-learning',
    '/contact-us',
  ];
  assert.deepEqual(publicNavigation.map(({ href }) => href), expectedPages);

  for (const { href } of allNavigationLinks()) {
    const { file, fragment } = routeSource(href);
    assert.ok(fs.existsSync(file), `${href} must resolve to an App Router page`);
    if (fragment) {
      const source = fs.readFileSync(file, 'utf8');
      assert.match(source, new RegExp(`\\bid=["']${fragment}["']`), `${href} must have a matching section`);
    }
  }
});

test('Apply Now leads to the existing Admissions route', () => {
  const { file, fragment } = routeSource(applyNowHref);
  assert.equal(applyNowHref, '/admissions');
  assert.equal(fragment, undefined);
  assert.ok(fs.existsSync(file));
});
