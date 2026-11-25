import 'server-only';

import { cookies } from 'next/headers';
import guestAccess from './guest-access.cjs';
import { createAdminClient } from './supabase/admin';

export async function getGuestCourseAccess(courseId) {
  const token = (await cookies()).get('adebola_guest_access')?.value;
  if (!guestAccess.isGuestAccessToken(token)) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_guest_course_access', {
    token_digest: guestAccess.hashGuestAccessToken(token),
  });
  if (error) throw new Error('Unable to verify guest course access.');
  const entitlement = data?.[0];
  if (!entitlement || entitlement.course_id !== courseId
    || !Number.isFinite(Date.parse(entitlement.expires_at))) return null;
  return { admin, entitlement };
}
