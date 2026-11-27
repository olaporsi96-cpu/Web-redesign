import 'server-only';

import guestAccess from './guest-access.cjs';
import { sendResendEmail } from './resend-email';

export async function sendPendingOrderNotification(admin, orderId) {
  const recipient = process.env.E_LEARNING_ADMIN_EMAIL;
  if (!recipient) {
    return { ok: false, error: 'Email delivery is not configured. Set E_LEARNING_ADMIN_EMAIL.' };
  }

  const { data: order, error: orderError } = await admin.from('course_orders')
    .select('buyer_name,buyer_email,amount,payment_reference,course_id,status')
    .eq('id', orderId).maybeSingle();
  if (orderError || !order) {
    return { ok: false, error: 'Unable to load order details for the Admin email notification.' };
  }
  if (order.status !== 'pending') {
    return { ok: false, error: 'Admin email notifications are only sent for pending orders.' };
  }
  const { data: course, error: courseError } = await admin.from('courses')
    .select('title').eq('id', order.course_id).maybeSingle();
  if (courseError || !course) {
    return { ok: false, error: 'Unable to load the course name for the Admin email notification.' };
  }

  return sendResendEmail({
    to: recipient,
    subject: `Pending E-Learning payment: ${course.title}`,
    text: [
      'A new E-Learning payment order is pending Admin review.',
      `Buyer: ${order.buyer_name || order.buyer_email}`,
      `Email: ${order.buyer_email || 'signed-in student'}`,
      `Course: ${course.title}`,
      `Amount: NGN ${Number(order.amount).toLocaleString('en-NG')}`,
      `Payment reference: ${order.payment_reference}`,
      'Open the Admin Orders and Payments screen to review the private receipt.',
    ].join('\n'),
  });
}

export async function sendBuyerOrderConfirmation(email, courseTitle, amount, paymentReference) {
  if (!email) return { ok: false, error: 'Buyer email is unavailable.' };
  return sendResendEmail({
    to: email,
    subject: `Adebola College payment submitted: ${courseTitle}`,
    text: [
      `Thank you. Your payment submission for ${courseTitle} has been received for review.`,
      `Amount: NGN ${Number(amount).toLocaleString('en-NG')}`,
      `Payment reference: ${paymentReference}`,
      'Course access is granted only after an Admin approves the payment.',
    ].join('\n'),
  });
}

export async function sendPaymentStatusEmail(email, courseTitle, approved, decisionNote = '') {
  if (!email) return { ok: false, error: 'Buyer email is unavailable.' };
  const approvedText = approved
    ? 'Your payment was approved and course access has been granted.'
    : 'Your payment was rejected. Please contact Adebola College for assistance.';
  return sendResendEmail({
    to: email,
    subject: `Adebola College course payment ${approved ? 'approved' : 'rejected'}: ${courseTitle}`,
    text: [
      approvedText,
      `Course: ${courseTitle}`,
      decisionNote ? `Admin note: ${decisionNote}` : '',
      'Official website: https://adebolacollege.org',
    ].filter(Boolean).join('\n'),
  });
}

export async function sendGuestCourseAccessLink(email, courseTitle, rawToken) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { ok: false, error: 'Email delivery requires NEXT_PUBLIC_SITE_URL to be configured.' };
  }
  let origin;
  try {
    const parsedUrl = new URL(siteUrl);
    if (parsedUrl.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      return { ok: false, error: 'NEXT_PUBLIC_SITE_URL must use HTTPS in production.' };
    }
    origin = parsedUrl.origin;
  } catch {
    return { ok: false, error: 'NEXT_PUBLIC_SITE_URL is not a valid website URL.' };
  }
  if (!guestAccess.isGuestAccessToken(rawToken)) {
    return { ok: false, error: 'Unable to create a valid guest course-access link.' };
  }
  const accessUrl = new URL('/e-learning/access', origin);
  accessUrl.searchParams.set('token', rawToken);
  const safeCourseTitle = guestAccess.escapeHtml(courseTitle);
  const safeUrl = guestAccess.escapeHtml(accessUrl.toString());
  return sendResendEmail({
    to: email,
    subject: `Your Adebola College course access: ${courseTitle}`,
    text: `Your payment has been approved for ${courseTitle}.\nOpen this secure course-access link: ${accessUrl.toString()}\nThe link expires seven days after payment approval. Do not share it with anyone.`,
    html: `<p>Your payment has been approved for <strong>${safeCourseTitle}</strong>.</p><p><a href="${safeUrl}">Open your course</a></p><p>The link expires seven days after payment approval. Do not share it with anyone.</p>`,
  });
}
