const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_WEBSITE_SETTINGS,
  matchesHeroImageSignature,
  validateWebsiteSettings,
} = require('../utils/website-settings.cjs');
const { hasAdminRouteAccess } = require('../utils/admin-authorization.cjs');

test('default website settings satisfy the shared server-side validation', () => {
  assert.equal(validateWebsiteSettings(DEFAULT_WEBSITE_SETTINGS), '');
});

test('website settings reject external button destinations and malformed email addresses', () => {
  assert.match(validateWebsiteSettings({
    ...DEFAULT_WEBSITE_SETTINGS,
    primaryButtonHref: 'https://example.com',
  }), /destinations/i);
  assert.match(validateWebsiteSettings({
    ...DEFAULT_WEBSITE_SETTINGS,
    contactEmail: 'not-an-email',
  }), /email/i);
});

test('homepage image validation checks supported file signatures', () => {
  assert.equal(matchesHeroImageSignature('image/jpeg', Buffer.from([0xff, 0xd8, 0xff])), true);
  assert.equal(matchesHeroImageSignature('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesHeroImageSignature('image/webp', Buffer.from('RIFF0000WEBP')), true);
  assert.equal(matchesHeroImageSignature('image/png', Buffer.from('not an image')), false);
  assert.equal(matchesHeroImageSignature('image/svg+xml', Buffer.from('<svg/>')), false);
});

test('website settings remain Main-Admin-only without adding a Sub-Admin permission', () => {
  assert.equal(hasAdminRouteAccess(
    { role: 'main_admin', admin_enabled: true },
    '/admin/website-settings',
  ), true);
  assert.equal(hasAdminRouteAccess(
    { role: 'sub_admin', admin_enabled: true },
    '/admin/website-settings',
    ['manage_admin_users'],
  ), false);
});

test('website settings migration stores public content with private, bounded image storage', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const migration = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261124000100_security_and_settings.sql',
  ), 'utf8');
  const preflight = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'preflight',
    '20261124000100_security_and_settings_preflight.sql',
  ), 'utf8');

  assert.match(migration, /create table if not exists public\.website_settings/i);
  assert.match(migration, /public\.is_main_admin\(\)/i);
  assert.match(migration, /file_size_limit.*5242880/i);
  assert.match(migration, /values\s*\('website-assets',\s*'website-assets',\s*false,\s*5242880/i);
  assert.match(migration, /revoke all on public\.website_settings from public, anon, authenticated/i);
  assert.match(migration, /grant select on public\.website_settings to anon, authenticated, service_role/i);
  assert.match(migration, /create or replace function public\.save_website_settings[\s\S]*public\.is_main_admin\(\)/i);
  assert.match(migration, /website_assets_main_admin_insert[\s\S]*public\.is_main_admin\(\)/i);
  assert.match(migration, /website_assets_main_admin_update[\s\S]*public\.is_main_admin\(\)/i);
  assert.match(migration, /website_assets_main_admin_delete[\s\S]*public\.is_main_admin\(\)/i);
  assert.doesNotMatch(migration, /create policy website_assets[^;]*for select/i);
  assert.match(preflight, /READ-ONLY PREFLIGHT/i);
  assert.match(preflight, /website-assets/i);
  assert.match(preflight, /course_access_revocation_history/i);
  assert.match(preflight, /course-materials/i);
  assert.match(preflight, /course-payment-proofs/i);
  assert.match(preflight, /Legacy overloads must not be executable by API roles/i);
  assert.doesNotMatch(preflight, /^\s*(?:insert|update|delete|create|alter|drop|do|call|grant|revoke|truncate)\b/im);
});
