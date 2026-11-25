import 'server-only';

export async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: 'Email delivery is not configured. Set RESEND_API_KEY and CONTACT_FROM_EMAIL.',
    };
  }
  if (typeof to !== 'string' || !to.trim()) {
    return { ok: false, error: 'An email recipient is not configured.' };
  }

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
      cache: 'no-store',
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Email delivery failed: ${error.message}` : 'Email delivery failed.',
    };
  }
  if (!response.ok) {
    return { ok: false, error: `Email provider returned HTTP ${response.status}.` };
  }
  return { ok: true };
}
