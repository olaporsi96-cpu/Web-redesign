'use server';

import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '../../../utils/supabase/server';
import inviteActivation from '../../../utils/invite-activation.cjs';
import accountArchiving from '../../../utils/account-archiving.cjs';

const { INVITE_ACTIVATION_COOKIE, getInviteActivationUserId } = inviteActivation;
const { profileSelectColumns, isAccountArchivingEnabled } = accountArchiving;
const allowedTargets = {
  '/student/login': 'student',
  '/admin/login/sub-admin': 'sub_admin',
};

async function getInvitationContext(next) {
  const expectedRole = allowedTargets[next];
  if (!expectedRole) return { error: 'This invitation link has an invalid destination.' };

  const cookieStore = await cookies();
  const userId = getInviteActivationUserId(
    cookieStore.get(INVITE_ACTIVATION_COOKIE)?.value,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!userId) {
    return { error: 'This invitation session is missing or expired. Ask the Main Admin to check the existing pending account; do not create a duplicate invitation.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return { error: `Unable to verify the invitation session: ${authError.message}` };
  }
  if (!user || user.id !== userId) {
    return { error: 'This invitation session is invalid or expired. Ask the Main Admin to check the existing pending account; do not create a duplicate invitation.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('role'))
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    return { error: `Unable to verify the invited account profile: ${profileError.message}` };
  }
  if (profile?.role !== expectedRole) {
    return { error: 'This invitation does not match the account type. Ask the Main Admin to verify the invitation.' };
  }
  if (isAccountArchivingEnabled() && expectedRole === 'sub_admin' && profile.sub_admin_archived_at) {
    return { error: 'This Sub-Admin account is archived and cannot be activated. Ask the Main Admin to restore it.' };
  }

  return { supabase, cookieStore };
}

export async function checkInviteSession(next) {
  try {
    const context = await getInvitationContext(next);
    if (context.error) return { ok: false, error: context.error };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to verify this invitation session.',
    };
  }
}

export async function setInvitedAccountPassword(password, next) {
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, error: 'Use a password with at least 8 characters.' };
  }

  try {
    const context = await getInvitationContext(next);
    if (context.error) return { ok: false, error: context.error };

    const { error: updateError } = await context.supabase.auth.updateUser({ password });
    if (updateError) return { ok: false, error: `Unable to set your password: ${updateError.message}` };

    const { error: signOutError } = await context.supabase.auth.signOut();
    context.cookieStore.delete(INVITE_ACTIVATION_COOKIE);
    if (signOutError) {
      return {
        ok: true,
        warning: `Your password was set, but the invitation session could not be cleared: ${signOutError.message}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to set your password.',
    };
  }
}
