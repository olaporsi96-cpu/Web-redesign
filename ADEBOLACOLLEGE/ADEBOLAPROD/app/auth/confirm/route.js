import { NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import inviteActivation from '../../../utils/invite-activation.cjs';

const { INVITE_ACTIVATION_COOKIE, createInviteActivationToken, INVITE_ACTIVATION_TTL_MS } = inviteActivation;

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const requestedNext = searchParams.get('next');
  const target = requestedNext === 'accept-student'
    ? '/student/login'
    : requestedNext === 'accept-subadmin'
      ? '/admin/login/sub-admin'
      : null;

  function invitationError(code) {
    if (!target) {
      return NextResponse.redirect(new URL('/admin/login/sub-admin?error=invalid-invite', origin));
    }
    const params = new URLSearchParams({ error: code, next: target });
    return NextResponse.redirect(new URL(`/auth/accept-invite?${params}`, origin));
  }

  if (!tokenHash || type !== 'invite' || !target) return invitationError('invalid-invite');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
  if (error) {
    return invitationError('invite-verification');
  }

  if (!data.user?.id) return invitationError('invite-verification');

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return invitationError('activation-unavailable');

  const response = NextResponse.redirect(new URL(
    `/auth/accept-invite?next=${encodeURIComponent(target)}`,
    origin,
  ));
  response.cookies.set(
    INVITE_ACTIVATION_COOKIE,
    createInviteActivationToken(data.user.id, secret),
    {
      httpOnly: true,
      maxAge: INVITE_ACTIVATION_TTL_MS / 1000,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  );
  return response;
}
