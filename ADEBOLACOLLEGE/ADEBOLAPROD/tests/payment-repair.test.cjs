const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('forward migration repairs every course-order email status column confirmed missing', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');

  assert.match(migration, /add column if not exists admin_email_sent_at timestamptz/i);
  assert.match(migration, /add column if not exists admin_email_error text/i);
  assert.match(migration, /add column if not exists buyer_email_sent_at timestamptz/i);
  assert.match(migration, /add column if not exists buyer_email_error text/i);
});

test('guest-entitlement repair adds email status columns to existing tables', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261129000100_guest_access_email_status_repair.sql',
  ), 'utf8');
  const preflight = fs.readFileSync(path.join(
    root,
    'supabase',
    'preflight',
    '20261128000100_course_materials_and_orders_repair_preflight.sql',
  ), 'utf8');

  assert.match(migration, /alter table public\.course_guest_access[\s\S]*add column if not exists access_email_sent_at timestamptz/i);
  assert.match(migration, /add column if not exists access_email_error text/i);
  assert.match(preflight, /guest access email delivery status columns exist/i);
  assert.match(preflight, /access_email_sent_at/);
  assert.match(preflight, /access_email_error/);
});

test('payment audit trigger accepts Boolean entity IDs without weakening UUID audits', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');
  const preflight = fs.readFileSync(path.join(
    root,
    'supabase',
    'preflight',
    '20261128000100_course_materials_and_orders_repair_preflight.sql',
  ), 'utf8');
  const auditFunction = migration.match(
    /create or replace function public\.write_sensitive_audit_log\(\)[\s\S]*?\n\$\$;/i,
  )?.[0] || '';

  assert.ok(auditFunction, 'forward migration must replace the existing trigger function');
  assert.match(auditFunction, /security definer/i);
  assert.match(auditFunction, /set search_path = pg_catalog, public, pg_temp/i);
  assert.match(auditFunction, /when \(after_data ->> 'id'\) ~\* '\^\[0-9a-f\]\{8\}-/i);
  assert.match(auditFunction, /when \(before_data ->> 'id'\) ~\* '\^\[0-9a-f\]\{8\}-/i);
  assert.match(auditFunction, /when \(after_data ->> 'profile_id'\) ~\*/i);
  assert.match(auditFunction, /when \(before_data ->> 'profile_id'\) ~\*/i);
  assert.match(auditFunction, /insert into public\.audit_logs \(actor_id, action, entity_type, entity_id, details\)/i);
  assert.match(auditFunction, /changed_fields/i);
  assert.match(auditFunction, /role_from/i);
  assert.match(auditFunction, /active_from/i);
  assert.match(auditFunction, /status_from/i);
  assert.match(auditFunction, /permission_key/i);
  assert.doesNotMatch(migration, /drop trigger[^;]*course_payment_settings_audit_log/i);

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(uuidPattern.test('true'), false);
  assert.equal(uuidPattern.test('6f8f5771-4f4f-4f4f-8f8f-123456789abc'), true);

  assert.match(preflight, /course_payment_settings_audit_log/i);
  assert.match(preflight, /tgenabled in \('O', 'A'\)/i);
  assert.match(preflight, /t\.tgtype = 29/i);
  assert.match(preflight, /t\.tgnargs = 0/i);
  assert.match(preflight, /payment-settings audit trigger remains enabled/i);
});

test('payment settings migration avoids Boolean UUID comparison and uses ctid', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261125000100_uuid_safe_course_payment_settings.sql',
  ), 'utf8');
  assert.match(migration, /declare[\s\S]*target_row tid/i);
  assert.match(migration, /where ctid = target_row/i);
  assert.doesNotMatch(migration, /id\s*=\s*true|values\s*\(\s*true\s*,/i);
});

test('Buy Now remains actionable and missing settings explain checkout availability', () => {
  const catalogue = fs.readFileSync(path.join(
    root,
    'components',
    'learning-catalogue.js',
  ), 'utf8');
  assert.doesNotMatch(catalogue, /disabled=\{!bankIsConfigured\}/i);
  assert.match(catalogue, /Bank-transfer details are not currently configured/i);
  assert.match(catalogue, /Checkout cannot be completed until all four payment fields are saved/i);
});

test('course materials support multiple resources and individual removal', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261126000100_orders_and_material_repair.sql',
  ), 'utf8');
  assert.match(migration, /lesson_attribute = any\(conkey\)/i);
  assert.match(migration, /save_course_material_record\(uuid, text, text, text, uuid\)/i);
  assert.match(migration, /remove_course_material_record\(uuid\)/i);
  assert.match(migration, /create or replace function public\.save_course_material\([\s\S]*?returns void/i);
  assert.match(migration, /select count\(\*\)[\s\S]*into material_count[\s\S]*if material_count > 1 then/i);
});

test('forward corrective migration is UUID-safe and fixes applied-migration gaps', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261127000100_forward_database_correction.sql',
  ), 'utf8');

  assert.match(migration, /create or replace function public\.save_course_payment_settings\(\s*configured_bank text,\s*configured_account_name text,\s*configured_account_number text,\s*configured_account_type text\s*\)/i);
  assert.match(migration, /create or replace function public\.save_course_payment_settings\(\s*configured_bank text,\s*configured_account_name text,\s*configured_account_number text\s*\)/i);
  assert.match(migration, /where ctid = target_row/i);
  assert.doesNotMatch(migration, /id\s*=\s*true|values\s*\(\s*true\s*,/i);

  assert.doesNotMatch(migration, /add column if not exists (?:admin|buyer)_email_/i);
  assert.doesNotMatch(migration, /drop constraint|create or replace function public\.save_course_material/i);
  assert.match(migration, /course_materials_course_lesson_fk/i);
  assert.match(migration, /revoke all on function public\.save_course_payment_settings\(text, text, text, text\)[\s\S]*from public, anon, service_role/i);
});

test('account settings action uses the four-argument RPC with no Boolean UUID values', () => {
  const actions = fs.readFileSync(path.join(
    root,
    'app',
    'admin',
    '(protected)',
    'catalogue-actions.js',
  ), 'utf8');
  const { buildPaymentSettingsRpcArgs } = require('../utils/payment-settings.cjs');
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');
  const args = buildPaymentSettingsRpcArgs({
    bankName: 'Example Bank',
    accountName: 'Adebola College',
    accountNumber: '0123456789',
    accountType: 'Current',
    id: true,
  });

  assert.deepEqual(args, {
    configured_bank: 'Example Bank',
    configured_account_name: 'Adebola College',
    configured_account_number: '0123456789',
    configured_account_type: 'Current',
  });
  assert.equal(Object.values(args).includes(true), false);
  assert.equal(Object.hasOwn(args, 'id'), false);
  assert.throws(() => buildPaymentSettingsRpcArgs({
    bankName: true, accountName: 'Adebola College', accountNumber: '0123456789', accountType: 'Current',
  }), /must be text/);
  assert.match(migration, /save_course_payment_settings\(\s*configured_bank text,\s*configured_account_name text,\s*configured_account_number text,\s*configured_account_type text/is);
  assert.match(migration, /where ctid = target_row/i);
  assert.match(migration, /updated_by = auth\.uid\(\)/i);
  assert.match(actions, /supabase\.rpc\('save_course_payment_settings', paymentArgs\)/);
  assert.doesNotMatch(actions, /configured_(?:bank|account_name|account_number|account_type):\s*true\b/i);
});

test('Orders and Payments query selects columns supplied by the forward migration', () => {
  const actions = fs.readFileSync(path.join(
    root,
    'app',
    'admin',
    '(protected)',
    'catalogue-actions.js',
  ), 'utf8');
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');
  const orderActions = fs.readFileSync(path.join(root, 'app', 'e-learning', 'actions.js'), 'utf8');

  assert.match(actions, /\.select\('id,profile_id,buyer_name,buyer_email,course_id,amount,payment_reference,proof_path,status,decision_note,created_at,admin_email_sent_at,admin_email_error,buyer_email_sent_at,buyer_email_error'\)/i);
  assert.match(migration, /admin_email_sent_at timestamptz[\s\S]*admin_email_error text[\s\S]*buyer_email_sent_at timestamptz[\s\S]*buyer_email_error text/i);
  assert.match(actions, /buyer_email_error/);
  assert.match(orderActions, /The order was saved, but its Admin email notification could not be completed/i);
});

test('final material repair supports nullable course-level material IDs without deleting existing objects', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');
  const preflight = fs.readFileSync(path.join(
    root,
    'supabase',
    'preflight',
    '20261128000100_course_materials_and_orders_repair_preflight.sql',
  ), 'utf8');
  const actions = fs.readFileSync(path.join(root, 'app', 'admin', '(protected)', 'catalogue-actions.js'), 'utf8');

  assert.match(migration, /alter column lesson_id drop not null/i);
  assert.match(migration, /save_course_material_v2\([\s\S]*target_course_id uuid,\s*target_lesson_id uuid/i);
  assert.match(migration, /if target_lesson_id is null[\s\S]*object_folders\[2\] <> 'course'/i);
  assert.match(migration, /or\s*\(\s*case\s+when coalesce\(object_metadata->>'size', ''\)/i);
  assert.match(migration, /lesson_id is not distinct from target_lesson_id/i);
  assert.match(migration, /if material_count > 1 then[\s\S]*select a specific material record/i);
  assert.match(migration, /for unique_item in[\s\S]*contype = 'u'[\s\S]*course_materials_lesson_attribute/i);
  assert.match(migration, /if replace_material_id is null then[\s\S]*insert into public\.course_materials/i);
  assert.match(migration, /material_mime not in \('application\/pdf', 'video\/mp4'\)/i);
  assert.match(migration, /course_materials_course_lesson_fk[\s\S]*references public\.lessons\(course_id, id\)/i);
  assert.match(migration, /course_materials_authorized_read|materials_admin_or_access_read/i);
  assert.match(actions, /save_course_material_v2/);
  assert.match(actions, /remove_course_material_record/);
  assert.match(preflight, /lesson_id is nullable/i);
  assert.match(preflight, /storage_path uniqueness remains enforced/i);
  assert.match(preflight, /course and composite course\/lesson foreign keys are present/i);
  assert.match(preflight, /payment-settings audit trigger remains enabled/i);
  assert.match(preflight, /case when \(after_data ->> ''id''\) ~\* ''\^\[0-9a-f\]\{8\}-/i);
  assert.match(preflight, /then \(after_data ->> ''id''\)::uuid end/i);
  assert.match(preflight, /case when \(before_data ->> ''id''\) ~\* ''\^\[0-9a-f\]\{8\}-/i);
  assert.match(preflight, /then \(before_data ->> ''id''\)::uuid end/i);
  assert.match(preflight, /regexp_replace\(lower\(p\.prosrc\), '\[\[:space:\]\]\+', ' ', 'g'\)/i);
  assert.doesNotMatch(preflight, /position\('\(after_data ->> ''id''\)::uuid' in lower\(p\.prosrc\)\) = 0/i);
  assert.doesNotMatch(preflight, /position\('\(before_data ->> ''id''\)::uuid' in lower\(p\.prosrc\)\) = 0/i);
  assert.match(preflight, /Main Admin and assigned Sub-Admins retain material permissions/i);
  assert.match(preflight, /qual ilike '%published%'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate)\b/i);
});

test('individual material deletion and parent deletion preserve dependency safety', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');
  const actions = fs.readFileSync(path.join(root, 'app', 'admin', '(protected)', 'catalogue-actions.js'), 'utf8');
  const removeAction = actions.match(/export async function removeMaterialAction[\s\S]*?\n\}/)?.[0] || '';

  assert.match(migration, /remove_course_material_record\(target_material_id uuid\)[\s\S]*has_admin_permission\('manage_course_materials'\)/i);
  assert.match(migration, /delete_lesson[\s\S]*Delete lesson materials from private Storage before deleting the lesson/i);
  assert.match(migration, /delete_course[\s\S]*Delete all course materials from private Storage before deleting the course/i);
  assert.match(migration, /delete_lesson[\s\S]*storage\.objects[\s\S]*storage\.foldername/i);
  assert.match(migration, /delete_course[\s\S]*storage\.objects[\s\S]*storage\.foldername/i);
  assert.match(actions, /export async function removeMaterialAction\(materialId\)[\s\S]*remove_course_material_record/);
  assert.match(actions, /export async function deleteLessonAction[\s\S]*rpc\('delete_lesson'/);
  assert.match(actions, /export async function deleteCourseAction[\s\S]*rpc\('delete_course'/);
  assert.ok(removeAction.indexOf(".storage.from('course-materials').remove") < removeAction.indexOf("rpc('remove_course_material_record'"));
});

test('private material delivery keeps student entitlement checks and short signed URLs', () => {
  const studentLesson = fs.readFileSync(path.join(root, 'app', 'e-learning', '[lessonId]', 'page.js'), 'utf8');
  const studentCourse = fs.readFileSync(path.join(root, 'app', 'e-learning', 'course', '[courseId]', 'page.js'), 'utf8');
  const guestCourse = fs.readFileSync(path.join(root, 'app', 'e-learning', 'guest', '[courseId]', 'page.js'), 'utf8');
  const guestLesson = fs.readFileSync(path.join(root, 'app', 'e-learning', 'guest', '[courseId]', '[lessonId]', 'page.js'), 'utf8');
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261128000100_course_materials_and_orders_repair.sql',
  ), 'utf8');

  assert.match(studentLesson, /rpc\('has_course_access'/);
  assert.match(studentCourse, /rpc\('has_course_access'/);
  assert.match(guestCourse, /getGuestCourseAccess\(courseId\)/);
  assert.match(guestLesson, /getGuestCourseAccess\(courseId\)/);
  for (const source of [studentLesson, studentCourse, guestCourse, guestLesson]) {
    assert.match(source, /createSignedUrl\([\s\S]*?, 300\)/);
  }
  assert.match(migration, /public = false/);
  assert.match(migration, /public\.has_course_access\(cm\.course_id\)/);
  assert.match(migration, /public\.has_admin_permission\('manage_course_materials'\)/);
  assert.match(migration, /c\.status = 'published'/);
  assert.match(migration, /l\.status = 'published'/);
  assert.match(migration, /course_material_objects_admin_insert[\s\S]*?with check/i);
});

test('student and guest order notifications cannot turn email failure into a lost order', () => {
  const actions = fs.readFileSync(path.join(root, 'app', 'e-learning', 'actions.js'), 'utf8');

  assert.match(actions, /async function notifyBuyerOfOrder\(admin, orderId, fallbackEmail = ''\)/);
  assert.match(actions, /buyer_email_sent_at: sent \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(actions, /buyer_email_error: message \? message\.slice\(0, 1000\) : null/);
  assert.match(actions, /const buyerEmailError = await notifyBuyerOfOrder\(admin, data/);
  assert.match(actions, /if \(createdOrderId\)[\s\S]*ok: true/);
  assert.match(actions, /if \(orderCreated\)[\s\S]*ok: true/);
});

test('forward migration supports multiple PDF and MP4 associations', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261127000100_forward_database_correction.sql',
  ), 'utf8');

  assert.match(migration, /update public\.course_materials cm[\s\S]*set course_id = l\.course_id/i);
  assert.match(migration, /course_materials_course_lesson_fk/i);
  assert.match(migration, /array\['application\/pdf', 'video\/mp4'\]/i);
  assert.doesNotMatch(migration, /drop policy|create policy/i);
});

test('applied lesson metadata migration is restored with the expected versioned RPC', () => {
  const migration = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20261125000200_course_lesson_metadata_alignment.sql',
  ), 'utf8');

  assert.match(migration, /add column if not exists description text not null default ''/i);
  assert.match(migration, /add column if not exists duration_minutes smallint/i);
  assert.match(migration, /create or replace function public\.save_lesson\([\s\S]*requested_duration_minutes integer/i);
  assert.match(migration, /revoke all on function public\.save_lesson\(uuid, uuid, text, text, text, text, integer\)/i);
  assert.match(migration, /commit;\s*select\s+'PASS' as result/i);
});

test('forward preflight checks signatures, types, associations, RLS and private Storage', () => {
  const preflight = fs.readFileSync(path.join(
    root,
    'supabase',
    'preflight',
    '20261127000100_forward_database_correction_preflight.sql',
  ), 'utf8');

  assert.match(preflight, /save_course_payment_settings\(text,text,text,text\)/i);
  assert.match(preflight, /buyer_email_sent_at','timestamp with time zone/i);
  assert.match(preflight, /Validated cascading course-material-to-lesson association/i);
  assert.match(preflight, /course_material_objects_authorized_read/i);
  assert.match(preflight, /course-materials bucket is private/i);
  assert.doesNotMatch(preflight, /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke|call|do)\b/im);
});
