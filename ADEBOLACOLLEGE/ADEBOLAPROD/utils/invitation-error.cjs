const TEST_EMAIL_LIMIT_MESSAGE = 'The TEST Supabase email service is restricted to 2 emails per hour and SMTP is not configured. No email was sent and no retry was attempted. Wait for the limit to clear before trying once more. For normal school delivery, configure a verified sending domain and SMTP provider in the TEST project.';

function isEmailRateLimited(error) {
  const message = error instanceof Error ? error.message : String(error?.message || error || '');
  return error?.status === 429
    || error?.statusCode === 429
    || error?.code === 'over_email_send_rate_limit'
    || /email rate limit exceeded|rate limit|too many requests/i.test(message);
}

function invitationFailure(error, accountType) {
  const message = error instanceof Error ? error.message : String(error?.message || error || '');
  if (isEmailRateLimited(error)) {
    return {
      ok: false,
      rateLimited: true,
      error: `${TEST_EMAIL_LIMIT_MESSAGE} The ${accountType} invitation was not sent.`,
    };
  }

  return {
    ok: false,
    error: `Unable to send the ${accountType} invitation: ${message || 'Supabase Auth returned an unknown error.'}`,
  };
}

function recoveryEmailFailure(error) {
  const message = error instanceof Error ? error.message : String(error?.message || error || '');
  if (isEmailRateLimited(error)) {
    return {
      ok: false,
      rateLimited: true,
      error: `${TEST_EMAIL_LIMIT_MESSAGE} The password-recovery email was not sent.`,
    };
  }
  return {
    ok: false,
    error: `Unable to send the password-recovery email: ${message || 'Supabase Auth returned an unknown error.'}`,
  };
}

module.exports = { invitationFailure, isEmailRateLimited, recoveryEmailFailure };
