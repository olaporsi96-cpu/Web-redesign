import { NextResponse } from 'next/server';
import guestAccess from '../../../utils/guest-access.cjs';
import { createAdminClient } from '../../../utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!guestAccess.isGuestAccessToken(token)) {
    return NextResponse.redirect(new URL('/e-learning?access=invalid', request.url), {
      status: 303,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_guest_course_access', {
      token_digest: guestAccess.hashGuestAccessToken(token),
    });
    if (error) throw new Error('Unable to verify the guest access link.');
    const entitlement = data?.[0];
    if (!entitlement || !Number.isFinite(Date.parse(entitlement.expires_at))) {
      return NextResponse.redirect(new URL('/e-learning?access=invalid', request.url), {
        status: 303,
        headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
      });
    }

    const response = NextResponse.redirect(
      new URL(`/e-learning/guest/${encodeURIComponent(entitlement.course_id)}`, request.url),
      { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
    );
    response.cookies.set('adebola_guest_access', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/e-learning/guest',
      expires: new Date(entitlement.expires_at),
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch {
    return new NextResponse('Unable to verify this course-access link. Please try again later.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  }
}
