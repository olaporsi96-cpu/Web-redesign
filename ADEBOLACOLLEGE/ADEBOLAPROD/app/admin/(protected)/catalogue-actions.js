'use server';

import { createClient } from '../../../utils/supabase/server';
import adminAuthorization from '../../../utils/admin-authorization.cjs';
import supabaseError from '../../../utils/supabase-error.cjs';
import accountArchiving from '../../../utils/account-archiving.cjs';

const {
  effectiveAdminPermissions,
  hasAdminPermission,
  isAdminEnabledProfile,
  isMainAdminProfile,
} = adminAuthorization;
const { formatSupabaseError } = supabaseError;
const { profileSelectColumns } = accountArchiving;

const PERMISSIONS = [
  'manage_courses',
  'manage_courses_lessons',
  'manage_lessons',
  'publish_unpublish_lessons',
  'manage_course_materials',
  'view_orders_payments',
  'manage_catalogue_settings',
];

async function getAdminContext(requiredPermission) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Sign in as an Admin to continue.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('id, role, admin_enabled'))
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Unable to verify the Admin profile: ${profileError.message}`);
  if (!profile || !isAdminEnabledProfile(profile)
    || (!isMainAdminProfile(profile) && profile.role !== 'sub_admin')) {
    throw new Error('An authorized Admin account is required.');
  }

  let permissions = PERMISSIONS;
  if (!isMainAdminProfile(profile)) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from('admin_permissions')
      .select('permission_key')
      .eq('profile_id', user.id);
    if (permissionsError) throw new Error(`Unable to verify Admin permissions: ${permissionsError.message}`);
    permissions = permissionRows.map((row) => row.permission_key);
  }
  permissions = effectiveAdminPermissions(permissions);

  if (requiredPermission && (
    !PERMISSIONS.includes(requiredPermission)
    || !hasAdminPermission(profile, permissions, requiredPermission)
  )) {
    throw new Error('You do not have permission to perform this action.');
  }
  return { supabase, profile, permissions };
}

function failure(error, operation = 'Admin request') {
  return { ok: false, error: formatSupabaseError(error, operation) };
}

export async function loadCourseAdminData() {
  try {
    const { supabase, permissions } = await getAdminContext();
    const data = {};
    if (
      permissions.includes('manage_courses')
      || permissions.includes('manage_lessons')
      || permissions.includes('publish_unpublish_lessons')
    ) {
      const { data: courses, error } = await supabase.from('courses')
        .select('id,title,category,description,price,status,created_at,updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      data.courses = courses;
    }
    if (permissions.includes('manage_lessons') || permissions.includes('publish_unpublish_lessons')) {
      const { data: lessons, error } = await supabase.from('lessons')
        .select('id,course_id,title,lesson_code,status,created_at,updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      data.lessons = lessons;
    }
    data.permissions = permissions;
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

export async function saveCourseAction(course) {
  if (!course || typeof course !== 'object'
    || (course.id && !/^[0-9a-f-]{36}$/i.test(course.id))
    || typeof course.title !== 'string'
    || typeof course.category !== 'string'
    || typeof course.description !== 'string'
    || !Number.isFinite(Number(course.price))
    || Number(course.price) < 0
    || !['draft', 'published'].includes(course.status)) {
    return { ok: false, error: 'Check the course title, category, description, price, and status.' };
  }
  try {
    const { supabase } = await getAdminContext('manage_courses');
    const { data, error } = await supabase.rpc('save_course', {
      target_id: course.id || null,
      course_title: course.title,
      course_category: course.category,
      course_description: course.description || '',
      course_price: Number(course.price),
      requested_status: course.status,
    });
    if (error) throw error;
    return { ok: true, id: data };
  } catch (error) {
    return failure(error, 'Saving the course');
  }
}

export async function archiveCourseAction(id) {
  try {
    const { supabase } = await getAdminContext('manage_courses');
    const { error } = await supabase.rpc('archive_course', { target_id: id });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function saveLessonAction(lesson) {
  if (!lesson || typeof lesson !== 'object'
    || (lesson.id && !/^[0-9a-f-]{36}$/i.test(lesson.id))
    || !/^[0-9a-f-]{36}$/i.test(lesson.courseId || '')
    || typeof lesson.title !== 'string'
    || typeof lesson.code !== 'string'
    || !['draft', 'published'].includes(lesson.status)) {
    return { ok: false, error: 'Check the selected course, lesson title, lesson code, and status.' };
  }
  try {
    const { supabase } = await getAdminContext('manage_lessons');
    const { data, error } = await supabase.rpc('save_lesson', {
      target_id: lesson.id || null,
      target_course_id: lesson.courseId,
      lesson_title: lesson.title,
      requested_lesson_code: lesson.code || null,
      requested_status: lesson.status,
    });
    if (error) throw error;
    return { ok: true, id: data };
  } catch (error) {
    return failure(error, 'Saving the lesson');
  }
}

export async function archiveLessonAction(id) {
  try {
    const { supabase } = await getAdminContext('manage_lessons');
    const { error } = await supabase.rpc('archive_lesson', { target_id: id });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setLessonStatusAction(id, status) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !['draft', 'published'].includes(status)) {
    return { ok: false, error: 'The lesson or requested publication status is invalid.' };
  }
  try {
    const { supabase } = await getAdminContext('publish_unpublish_lessons');
    const { error } = await supabase.rpc('set_lesson_publish_status', {
      target_id: id,
      requested_status: status,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error, 'Updating the lesson publication status');
  }
}

export async function loadCatalogueSettings() {
  try {
    const { supabase } = await getAdminContext('manage_catalogue_settings');
    const [categories, payments] = await Promise.all([
      supabase.from('course_catalogue_settings')
        .select('category,code_prefix,code_start,code_end'),
      supabase.from('course_payment_settings')
        .select('bank_name,account_name,account_number').eq('id', true).maybeSingle(),
    ]);
    if (categories.error) throw categories.error;
    if (payments.error) throw payments.error;
    return { ok: true, data: { categories: categories.data, payments: payments.data } };
  } catch (error) {
    return failure(error);
  }
}

export async function saveCatalogueSettingsAction(settings, payments) {
  try {
    const { supabase } = await getAdminContext('manage_catalogue_settings');
    const [categoryResult, paymentResult] = await Promise.all([
      supabase.rpc('save_course_catalogue_settings', { settings: settings.map(({ category, codePrefix, codeStart, codeEnd }) => ({
        category, codePrefix, codeStart, codeEnd,
      })) }),
      supabase.rpc('save_course_payment_settings', {
        configured_bank: payments.bankName || null,
        configured_account_name: payments.accountName || null,
        configured_account_number: payments.accountNumber || null,
      }),
    ]);
    if (categoryResult.error) throw categoryResult.error;
    if (paymentResult.error) throw paymentResult.error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function loadMaterials() {
  try {
    const { supabase } = await getAdminContext('manage_course_materials');
    const [courses, lessons, materials] = await Promise.all([
      supabase.from('courses').select('id,title,category'),
      supabase.from('lessons').select('id,course_id,title,status'),
      supabase.from('course_materials').select('lesson_id,file_name,mime_type,storage_path'),
    ]);
    if (courses.error) throw courses.error;
    if (lessons.error) throw lessons.error;
    if (materials.error) throw materials.error;
    return { ok: true, data: { courses: courses.data, lessons: lessons.data, materials: materials.data } };
  } catch (error) {
    return failure(error);
  }
}

export async function saveMaterialAction(lessonId, path, fileName, mimeType) {
  try {
    const { supabase } = await getAdminContext('manage_course_materials');
    const { data: previous, error: previousError } = await supabase.from('course_materials')
      .select('storage_path').eq('lesson_id', lessonId).maybeSingle();
    if (previousError) throw previousError;
    const { error } = await supabase.rpc('save_course_material', {
      target_lesson_id: lessonId,
      material_path: path,
      material_name: fileName,
      material_mime: mimeType,
    });
    if (error) throw error;
    let warning = '';
    if (previous?.storage_path && previous.storage_path !== path) {
      const { error: deleteError } = await supabase.storage.from('course-materials').remove([previous.storage_path]);
      if (deleteError) warning = `The new material was saved, but the replaced file could not be removed: ${deleteError.message}`;
    }
    return { ok: true, warning };
  } catch (error) {
    return failure(error);
  }
}

export async function removeMaterialAction(lessonId) {
  try {
    const { supabase } = await getAdminContext('manage_course_materials');
    const { data: path, error } = await supabase.rpc('remove_course_material', { target_lesson_id: lessonId });
    if (error) throw error;
    if (path) {
      const { error: deleteError } = await supabase.storage.from('course-materials').remove([path]);
      if (deleteError) throw deleteError;
    }
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function loadPaymentOrders() {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const [orders, courses, access] = await Promise.all([
      supabase.from('course_orders')
        .select('id,profile_id,buyer_name,buyer_email,course_id,amount,payment_reference,proof_path,status,decision_note,created_at')
        .order('created_at', { ascending: false }),
      supabase.from('courses').select('id,title'),
      supabase.from('course_access').select('profile_id,course_id,grant_source,granted_at').eq('grant_source', 'manual'),
    ]);
    if (orders.error) throw orders.error;
    if (courses.error) throw courses.error;
    if (access.error) throw access.error;
    const { data: canViewStudents, error: studentPermissionError } = await supabase.rpc('has_admin_permission', {
      required_permission: 'view_students',
    });
    if (studentPermissionError) throw studentPermissionError;
    let students = [];
    if (canViewStudents) {
      const { data, error } = await supabase.from('students')
        .select('profile_id,name,student_number,email')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      students = data;
    }
    const proofUrls = await Promise.all(orders.data.map(async (order) => {
      if (!order.proof_path) return [order.id, null];
      const { data, error } = await supabase.storage.from('course-payment-proofs')
        .createSignedUrl(order.proof_path, 300);
      if (error) throw error;
      return [order.id, data.signedUrl];
    }));
    return { ok: true, data: { orders: orders.data, courses: courses.data, students, canViewStudents,
      manualAccess: access.data, proofUrls: Object.fromEntries(proofUrls) } };
  } catch (error) {
    return failure(error);
  }
}

export async function reviewPaymentOrderAction(id, approve, note, linkedProfileId = null) {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('review_course_order', {
      target_order_id: id, approve_order: approve, review_note: note || '',
      linked_profile_id: linkedProfileId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function manuallyGrantAccessAction(profileId, courseId) {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('manually_grant_course_access', {
      target_profile_id: profileId, target_course_id: courseId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function revokeManualAccessAction(profileId, courseId) {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('revoke_manual_course_access', {
      target_profile_id: profileId,
      target_course_id: courseId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
