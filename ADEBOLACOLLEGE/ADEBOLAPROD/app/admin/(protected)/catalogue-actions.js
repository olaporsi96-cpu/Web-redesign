'use server';

import { createClient } from '../../../utils/supabase/server';
import { createAdminClient } from '../../../utils/supabase/admin';
import adminAuthorization from '../../../utils/admin-authorization.cjs';
import supabaseError from '../../../utils/supabase-error.cjs';
import accountArchiving from '../../../utils/account-archiving.cjs';
import guestAccess from '../../../utils/guest-access.cjs';
import courseMaterialValidation from '../../../utils/course-material.cjs';
import paymentSettings from '../../../utils/payment-settings.cjs';
import { sendGuestCourseAccessLink, sendPendingOrderNotification } from '../../../utils/course-email';

const {
  effectiveAdminPermissions,
  hasAdminPermission,
  isAdminEnabledProfile,
  isMainAdminProfile,
} = adminAuthorization;
const { formatSupabaseError } = supabaseError;
const { profileSelectColumns } = accountArchiving;
const { MAX_COURSE_MATERIAL_BYTES, matchesCourseMaterialSignature } = courseMaterialValidation;
const { buildPaymentSettingsRpcArgs } = paymentSettings;

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
        .select('id,course_id,title,lesson_code,description,duration_minutes,status,created_at,updated_at')
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

export async function deleteCourseAction(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The course is invalid.' };
  try {
    const { supabase } = await getAdminContext('manage_courses');
    const { data: orderCheck, error: orderError } = await supabase.from('course_orders')
      .select('id').eq('course_id', id).limit(1);
    if (orderError) throw orderError;
    if (orderCheck?.length) throw new Error('The course cannot be deleted because payment history exists. Archive it instead.');
    const { data: accessCheck, error: accessError } = await supabase.from('course_access')
      .select('profile_id').eq('course_id', id).limit(1);
    if (accessError) throw accessError;
    if (accessCheck?.length) throw new Error('The course cannot be deleted because entitlement history exists. Archive it instead.');
    const { data: guestCheck, error: guestError } = await supabase.from('course_guest_access')
      .select('id').eq('course_id', id).limit(1);
    if (guestError) throw guestError;
    if (guestCheck?.length) throw new Error('The course cannot be deleted because guest entitlement history exists. Archive it instead.');
    const { error } = await supabase.rpc('delete_course', { target_id: id });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error, 'Deleting the course');
  }
}

export async function saveLessonAction(lesson) {
  if (!lesson || typeof lesson !== 'object'
    || (lesson.id && !/^[0-9a-f-]{36}$/i.test(lesson.id))
    || !/^[0-9a-f-]{36}$/i.test(lesson.courseId || '')
    || typeof lesson.title !== 'string'
    || typeof lesson.code !== 'string'
    || typeof lesson.description !== 'string'
    || lesson.description.length > 5000
    || (lesson.durationMinutes !== null && lesson.durationMinutes !== ''
      && (!Number.isInteger(Number(lesson.durationMinutes))
        || Number(lesson.durationMinutes) < 1 || Number(lesson.durationMinutes) > 600))
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
      lesson_description: lesson.description,
      requested_duration_minutes: lesson.durationMinutes === '' || lesson.durationMinutes === null
        ? null : Number(lesson.durationMinutes),
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

export async function deleteLessonAction(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The lesson is invalid.' };
  try {
    const { supabase } = await getAdminContext('manage_lessons');
    const { error } = await supabase.rpc('delete_lesson', { target_lesson_id: id });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error, 'Deleting the lesson');
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
        .select('bank_name,account_name,account_number,account_type')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
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
    const paymentArgs = buildPaymentSettingsRpcArgs(payments);
    const { supabase } = await getAdminContext('manage_catalogue_settings');
    const [categoryResult, paymentResult] = await Promise.all([
      supabase.rpc('save_course_catalogue_settings', { settings: settings.map(({ category, codePrefix, codeStart, codeEnd }) => ({
        category, codePrefix, codeStart, codeEnd,
      })) }),
      supabase.rpc('save_course_payment_settings', paymentArgs),
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
      supabase.from('course_materials').select('id,course_id,lesson_id,file_name,mime_type,storage_path'),
    ]);
    if (courses.error) throw courses.error;
    if (lessons.error) throw lessons.error;
    if (materials.error) throw materials.error;
    return { ok: true, data: { courses: courses.data, lessons: lessons.data, materials: materials.data } };
  } catch (error) {
    return failure(error);
  }
}

export async function saveMaterialAction(courseId, lessonId, path, fileName, mimeType, replaceMaterialId = null) {
  try {
    const { supabase } = await getAdminContext('manage_course_materials');
    if (!/^[0-9a-f-]{36}$/i.test(courseId || '')
      || (lessonId !== null && lessonId !== undefined && !/^[0-9a-f-]{36}$/i.test(lessonId))
      || (replaceMaterialId !== null && !/^[0-9a-f-]{36}$/i.test(replaceMaterialId))
      || typeof path !== 'string'
      || typeof fileName !== 'string'
      || !['application/pdf', 'video/mp4'].includes(mimeType)) {
      throw new Error('The uploaded course material is invalid.');
    }
    const { data: uploaded, error: downloadError } = await supabase.storage
      .from('course-materials').download(path);
    if (downloadError) throw new Error(`The uploaded file could not be verified: ${downloadError.message}`);
    if (!uploaded) throw new Error('The uploaded course material could not be verified.');
    if (uploaded.size < 1 || uploaded.size > MAX_COURSE_MATERIAL_BYTES) {
      throw new Error('The uploaded course material must be no larger than 50 MB.');
    }
    const signatureBytes = Buffer.from(await uploaded.arrayBuffer());
    if (!matchesCourseMaterialSignature(mimeType, signatureBytes)) {
      throw new Error('The uploaded file content does not match an allowed PDF or MP4 file.');
    }
    const extension = fileName.toLowerCase().split('.').pop();
    if ((mimeType === 'application/pdf' && extension !== 'pdf')
      || (mimeType === 'video/mp4' && extension !== 'mp4')) {
      throw new Error('The uploaded file name and content type do not match.');
    }
    const { data: previous, error: previousError } = replaceMaterialId
      ? await supabase.from('course_materials').select('storage_path,course_id,lesson_id').eq('id', replaceMaterialId).maybeSingle()
      : { data: null, error: null };
    if (previousError) throw previousError;
    if (replaceMaterialId && (!previous
      || previous.course_id !== courseId
      || previous.lesson_id !== (lessonId || null))) {
      throw new Error('The selected material does not belong to this course area.');
    }
    const { error } = await supabase.rpc('save_course_material_v2', {
      target_course_id: courseId,
      target_lesson_id: lessonId || null,
      material_path: path,
      material_name: fileName,
      material_mime: mimeType,
      replace_material_id: replaceMaterialId,
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

export async function removeMaterialAction(materialId) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(materialId || '')) {
      throw new Error('Select a specific course material to remove.');
    }
    const { supabase } = await getAdminContext('manage_course_materials');
    const { data: material, error: materialError } = await supabase.from('course_materials')
      .select('storage_path').eq('id', materialId).maybeSingle();
    if (materialError) throw materialError;
    if (!material) throw new Error('The selected course material no longer exists.');
    const { error: deleteError } = await supabase.storage.from('course-materials').remove([material.storage_path]);
    if (deleteError) {
      throw new Error(`The Storage file could not be deleted; its material record was preserved: ${deleteError.message}`);
    }
    const { error } = await supabase.rpc('remove_course_material_record', {
      target_material_id: materialId,
    });
    if (error) {
      throw new Error(`The Storage file was removed, but its material record could not be deleted. Retry the delete action: ${error.message}`);
    }
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function loadPaymentOrders() {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const [orders, courses, access, revocationHistory] = await Promise.all([
      supabase.from('course_orders')
        .select('id,profile_id,buyer_name,buyer_email,course_id,amount,payment_reference,proof_path,status,decision_note,created_at,admin_email_sent_at,admin_email_error,buyer_email_sent_at,buyer_email_error')
        .order('created_at', { ascending: false }),
      supabase.from('courses').select('id,title'),
      supabase.from('course_access')
        .select('profile_id,course_id,grant_source,granted_at,expires_at,revoked_at,revoked_by,revoked_reason,revocation_reason,order_id')
        .order('granted_at', { ascending: false }),
      supabase.from('course_access_revocation_history')
        .select('profile_id,course_id,order_id,revoked_at,revoked_by,revocation_reason,reactivated_at,reactivated_by')
        .order('reactivated_at', { ascending: false }),
    ]);
    if (orders.error) throw orders.error;
    if (courses.error) throw courses.error;
    if (access.error) throw access.error;
    if (revocationHistory.error) throw revocationHistory.error;
    const { data: guestAccess, error: guestAccessError } = await supabase.from('course_guest_access')
      .select('id,order_id,course_id,buyer_email,granted_at,expires_at,revoked_at,revoked_by,revoked_reason,revocation_reason,access_email_sent_at,access_email_error')
      .order('granted_at', { ascending: false });
    if (guestAccessError) throw guestAccessError;
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
      studentAccess: access.data, revocationHistory: revocationHistory.data, guestAccess, proofUrls: Object.fromEntries(proofUrls) } };
  } catch (error) {
    return failure(error);
  }
}

export async function reviewPaymentOrderAction(id, approve, note = '') {
  let reviewCompleted = false;
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { data: order, error: orderError } = await supabase.from('course_orders')
      .select('profile_id,buyer_email,course_id').eq('id', id).maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error('Payment order was not found.');
    const token = approve && !order.profile_id ? guestAccess.createGuestAccessToken() : null;
    const { error } = await supabase.rpc('review_course_order', {
      target_order_id: id, approve_order: approve, review_note: note || '',
      linked_profile_id: null,
      guest_token_hash: token ? guestAccess.hashGuestAccessToken(token) : null,
    });
    if (error) throw error;
    reviewCompleted = true;
    if (!token) return { ok: true };

    try {
      const admin = createAdminClient();
      const { data: entitlement, error: entitlementError } = await admin.from('course_guest_access')
        .select('id,buyer_email,course_id').eq('order_id', id).maybeSingle();
      if (entitlementError || !entitlement) {
        return { ok: true, emailError: 'The guest entitlement was created, but its email details could not be loaded.' };
      }
      const { data: course, error: courseError } = await admin.from('courses')
        .select('title').eq('id', entitlement.course_id).maybeSingle();
      if (courseError || !course) {
        return { ok: true, emailError: 'The guest entitlement was created, but its course details could not be loaded.' };
      }
      const delivery = await sendGuestCourseAccessLink(entitlement.buyer_email, course.title, token);
      const update = delivery.ok
        ? { access_email_sent_at: new Date().toISOString(), access_email_error: null }
        : { access_email_sent_at: null, access_email_error: delivery.error.slice(0, 1000) };
      const { error: statusError } = await admin.from('course_guest_access').update(update).eq('id', entitlement.id);
      const emailError = delivery.ok
        ? (statusError ? 'The guest access email was sent, but its delivery status could not be saved.' : '')
        : `${delivery.error}${statusError ? ' Delivery status could not be saved.' : ''}`;
      return emailError ? { ok: true, emailError } : { ok: true };
    } catch {
      return { ok: true, emailError: 'The guest entitlement was created, but its access email could not be completed. Retry the link from Orders and Payments.' };
    }
  } catch (error) {
    if (reviewCompleted) {
      return { ok: true, emailError: 'The order was reviewed, but its email notification could not be completed.' };
    }
    return failure(error);
  }
}

export async function retryOrderAdminEmailAction(orderId) {
  try {
    await getAdminContext('view_orders_payments');
    const admin = createAdminClient();
    const result = await sendPendingOrderNotification(admin, orderId);
    const update = result.ok
      ? { admin_email_sent_at: new Date().toISOString(), admin_email_error: null }
      : { admin_email_sent_at: null, admin_email_error: result.error.slice(0, 1000) };
    const { error } = await admin.from('course_orders').update(update).eq('id', orderId);
    if (error) throw error;
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  } catch (error) {
    return failure(error, 'Retrying the Admin email notification');
  }
}

export async function retryGuestCourseAccessEmailAction(guestAccessId) {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { data: entitlement, error: entitlementError } = await supabase.from('course_guest_access')
      .select('id,buyer_email,course_id,revoked_at,expires_at')
      .eq('id', guestAccessId).maybeSingle();
    if (entitlementError) throw entitlementError;
    if (!entitlement || entitlement.revoked_at) throw new Error('Active guest course access was not found.');

    const { data: course, error: courseError } = await supabase.from('courses')
      .select('title').eq('id', entitlement.course_id).maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new Error('The guest course was not found.');

    const token = guestAccess.createGuestAccessToken();
    const { error: rotateError } = await supabase.rpc('admin_rotate_guest_course_access_token', {
      target_guest_access_id: entitlement.id,
      replacement_token_hash: guestAccess.hashGuestAccessToken(token),
    });
    if (rotateError) throw rotateError;

    let delivery;
    try {
      delivery = await sendGuestCourseAccessLink(entitlement.buyer_email, course.title, token);
    } catch {
      delivery = { ok: false, error: 'The access link was rotated, but email delivery could not be completed.' };
    }
    const admin = createAdminClient();
    const update = delivery.ok
      ? { access_email_sent_at: new Date().toISOString(), access_email_error: null }
      : { access_email_sent_at: null, access_email_error: delivery.error.slice(0, 1000) };
    const { error: statusError } = await admin.from('course_guest_access').update(update).eq('id', entitlement.id);
    if (statusError) {
      return { ok: false, error: delivery.ok
        ? 'The new access email was sent, but its delivery status could not be saved.'
        : `${delivery.error} Delivery status could not be saved.` };
    }
    if (!delivery.ok) return { ok: false, error: delivery.error };
    return { ok: true };
  } catch (error) {
    return failure(error, 'Resending the guest course-access link');
  }
}

export async function revokePaidCourseAccessAction(profileId, courseId, reason = '') {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('admin_revoke_course_access', {
      target_profile_id: profileId,
      target_course_id: courseId,
      revoke_reason: reason,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error, 'Revoking payment-approved course access');
  }
}

export async function revokeGuestCourseAccessAction(guestAccessId, reason = '') {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('admin_revoke_guest_course_access', {
      target_guest_access_id: guestAccessId,
      revoke_reason: reason,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error, 'Revoking guest course access');
  }
}

export async function revokeAllCourseAccessAction(courseId, reason = '') {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { data, error } = await supabase.rpc('admin_revoke_all_course_entitlements', {
      target_course_id: courseId,
      revoke_reason: reason,
    });
    if (error) throw error;
    return { ok: true, count: Number(data || 0) };
  } catch (error) {
    return failure(error, 'Revoking all course access');
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

export async function revokeManualAccessAction(profileId, courseId, reason = '') {
  try {
    const { supabase } = await getAdminContext('view_orders_payments');
    const { error } = await supabase.rpc('revoke_manual_course_access', {
      target_profile_id: profileId,
      target_course_id: courseId,
      revoke_reason: reason,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
