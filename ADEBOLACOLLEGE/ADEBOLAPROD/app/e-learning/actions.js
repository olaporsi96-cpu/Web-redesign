'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '../../utils/supabase/server';
import { createAdminClient } from '../../utils/supabase/admin';
import guestAccess from '../../utils/guest-access.cjs';
import { sendBuyerOrderConfirmation, sendPendingOrderNotification } from '../../utils/course-email';

const PROOF_BUCKET = 'course-payment-proofs';
const { isAllowedReceiptSize, isAllowedReceiptType, isValidEmail, matchesReceiptSignature } = guestAccess;

function safeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150) || 'receipt';
}

function validStudentProofPath(path, userId) {
  return typeof path === 'string'
    && new RegExp(`^${userId}/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,150}$`, 'i').test(path);
}

function validGuestProofPath(path) {
  return typeof path === 'string'
    && /^guest\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,150}$/i.test(path);
}

async function verifyReceiptObject(admin, path) {
  const { data, error } = await admin.storage.from(PROOF_BUCKET).download(path);
  if (error) throw new Error('The uploaded payment receipt could not be verified.');
  if (!data || !isAllowedReceiptType(data.type) || !isAllowedReceiptSize(data.size)) {
    throw new Error('Payment proof must be a non-empty JPEG, PNG, or PDF no larger than 10 MB.');
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  if (!matchesReceiptSignature(data.type, bytes)) {
    throw new Error('The uploaded file content does not match its JPEG, PNG, or PDF type.');
  }
}

async function cleanUnsubmittedGuestProof(admin, path) {
  if (!validGuestProofPath(path)) return '';
  const { data, error } = await admin.from('course_orders').select('id')
    .eq('proof_path', path).maybeSingle();
  if (error) return ` The unused receipt could not be checked for cleanup: ${error.message}`;
  if (data) return '';
  const { error: removeError } = await admin.storage.from(PROOF_BUCKET).remove([path]);
  return removeError ? ` The unused receipt could not be removed: ${removeError.message}` : '';
}

async function notifyAdminOfOrder(admin, orderId) {
  let sendResult;
  try {
    sendResult = await sendPendingOrderNotification(admin, orderId);
  } catch (error) {
    sendResult = {
      ok: false,
      error: error instanceof Error ? error.message : 'The Admin email could not be sent.',
    };
  }
  const status = sendResult.ok
    ? { admin_email_sent_at: new Date().toISOString(), admin_email_error: null }
    : { admin_email_sent_at: null, admin_email_error: sendResult.error.slice(0, 1000) };
  const { error: updateError } = await admin.from('course_orders').update(status).eq('id', orderId);
  if (updateError) {
    return sendResult.ok
      ? 'The Admin email was sent, but its delivery status could not be saved.'
      : `${sendResult.error} Delivery status could not be saved.`;
  }
  return sendResult.ok ? '' : sendResult.error;
}

async function notifyBuyerOfOrder(admin, orderId, fallbackEmail = '') {
  const saveStatus = async (sent, message) => {
    const { error } = await admin.from('course_orders').update({
      buyer_email_sent_at: sent ? new Date().toISOString() : null,
      buyer_email_error: message ? message.slice(0, 1000) : null,
    }).eq('id', orderId);
    if (error) {
      return message
        ? `${message} Buyer email status could not be saved.`
        : 'The buyer confirmation was sent, but its delivery status could not be saved.';
    }
    return message;
  };

  const { data: order, error } = await admin.from('course_orders')
    .select('buyer_email,profile_id,amount,payment_reference,course_id')
    .eq('id', orderId).maybeSingle();
  if (error || !order) {
    return saveStatus(false, 'The order was saved, but buyer email details could not be loaded.');
  }
  let buyerEmail = order.buyer_email || fallbackEmail;
  if (!buyerEmail && order.profile_id) {
    const { data: userLookup, error: userError } = await admin.auth.admin.getUserById(order.profile_id);
    if (userError) return saveStatus(false, 'The order was saved, but the buyer account email could not be loaded.');
    buyerEmail = userLookup?.user?.email || '';
  }
  if (!buyerEmail) {
    return saveStatus(false, 'The order was saved, but the buyer email address was unavailable.');
  }
  const { data: course, error: courseError } = await admin.from('courses')
    .select('title').eq('id', order.course_id).maybeSingle();
  if (courseError || !course) {
    return saveStatus(false, 'The order was saved, but course email details could not be loaded.');
  }

  let delivery;
  try {
    delivery = await sendBuyerOrderConfirmation(
      buyerEmail,
      course.title,
      order.amount,
      order.payment_reference,
    );
  } catch (deliveryError) {
    delivery = {
      ok: false,
      error: deliveryError instanceof Error ? deliveryError.message : 'Buyer email delivery failed.',
    };
  }
  return saveStatus(delivery.ok, delivery.ok ? '' : delivery.error);
}

export async function createGuestProofUpload(fileName, mimeType, size) {
  try {
    if (typeof fileName !== 'string' || fileName.length > 255
      || !isAllowedReceiptType(mimeType) || !isAllowedReceiptSize(size)) {
      throw new Error('Choose a non-empty JPEG, PNG, or PDF receipt no larger than 10 MB.');
    }

    const path = `guest/${randomUUID()}/${safeFileName(fileName)}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(PROOF_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw new Error('Unable to prepare a private receipt upload.');
    if (!data?.token) throw new Error('The private receipt upload could not be initialized.');
    return { ok: true, path, token: data.token };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to prepare the guest receipt upload.' };
  }
}

export async function submitCourseOrder(courseId, reference, proofPath) {
  let createdOrderId = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(`Unable to verify the current session: ${authError.message}`);
    if (!user) throw new Error('Sign in with an active student account before submitting payment.');
    if (typeof reference !== 'string' || reference.trim().length < 1 || reference.trim().length > 120
      || !validStudentProofPath(proofPath, user.id)) {
      throw new Error('Payment reference or proof is invalid.');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError) throw new Error(`Unable to verify the student profile: ${profileError.message}`);
    if (profile?.role !== 'student') throw new Error('An active student account is required.');
    const { data: student, error: studentError } = await supabase
      .from('students').select('is_active').eq('profile_id', user.id).maybeSingle();
    if (studentError) throw new Error(`Unable to verify active student status: ${studentError.message}`);
    if (!student?.is_active) throw new Error('An active student account is required.');

    const admin = createAdminClient();
    await verifyReceiptObject(admin, proofPath);
    const { data, error } = await supabase.rpc('submit_course_order', {
      target_course_id: courseId,
      submitted_reference: reference.trim(),
      submitted_proof_path: proofPath,
    });
    if (error) throw new Error(error.message);
    createdOrderId = data;
    let notificationError = '';
    try {
      notificationError = await notifyAdminOfOrder(admin, data);
      const buyerEmailError = await notifyBuyerOfOrder(admin, data, user.email);
      if (!notificationError) notificationError = buyerEmailError;
      else if (buyerEmailError) notificationError = `${notificationError} ${buyerEmailError}`;
    } catch {
      notificationError = 'The order was saved, but its Admin email notification could not be completed.';
    }
    return { ok: true, orderId: createdOrderId, notificationError };
  } catch (error) {
    if (createdOrderId) {
      return {
        ok: true,
        orderId: createdOrderId,
        notificationError: 'The order was saved, but its Admin email notification could not be completed.',
      };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'The student order could not be completed.' };
  }
}

export async function submitGuestCourseOrder(courseId, name, email, reference, proofPath) {
  let admin;
  let orderCreated = false;
  let createdOrderId = null;
  try {
    admin = createAdminClient();
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100
      || typeof email !== 'string' || !isValidEmail(email.trim())
      || typeof reference !== 'string' || reference.trim().length < 1 || reference.trim().length > 120
      || !validGuestProofPath(proofPath)) {
      throw new Error('Enter a valid name, email, payment reference, and attach a receipt.');
    }

    await verifyReceiptObject(admin, proofPath);
    const { data, error } = await admin.rpc('submit_guest_course_order', {
      target_course_id: courseId,
      submitted_buyer_name: name.trim(),
      submitted_buyer_email: email.trim(),
      submitted_reference: reference.trim(),
      submitted_proof_path: proofPath,
    });
    if (error) throw new Error(error.message);
    orderCreated = true;
    createdOrderId = data;
    let notificationError = '';
    try {
      notificationError = await notifyAdminOfOrder(admin, data);
      const buyerEmailError = await notifyBuyerOfOrder(admin, data, email.trim());
      if (!notificationError) notificationError = buyerEmailError;
      else if (buyerEmailError) notificationError = `${notificationError} ${buyerEmailError}`;
    } catch {
      notificationError = 'The order was saved, but its Admin email notification could not be completed.';
    }
    return { ok: true, orderId: createdOrderId, notificationError };
  } catch (error) {
    if (orderCreated) {
      return {
        ok: true,
        orderId: createdOrderId,
        notificationError: 'The order was saved, but its Admin email notification could not be completed.',
      };
    }
    const cleanupError = admin && !orderCreated
      ? await cleanUnsubmittedGuestProof(admin, proofPath)
      : '';
    return {
      ok: false,
      error: `${error instanceof Error ? error.message : 'The guest order could not be completed.'}${cleanupError}`,
    };
  }
}
