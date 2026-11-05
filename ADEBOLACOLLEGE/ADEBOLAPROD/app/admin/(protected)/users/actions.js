'use server';

import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../../../../utils/supabase/server';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';
import invitationRedirect from '../../../../utils/invitation-redirect.cjs';
import invitationErrors from '../../../../utils/invitation-error.cjs';
import accountEmailState from '../../../../utils/auth-account-state.cjs';
import accountArchiving from '../../../../utils/account-archiving.cjs';

const { isMainAdminProfile } = adminAuthorization;
const { createInvitationRedirect } = invitationRedirect;
const { invitationFailure } = invitationErrors;
const { getAccountEmailAction } = accountEmailState;
const { profileSelectColumns, isAccountArchivingEnabled } = accountArchiving;

const subAdminPermissions = [
  'view_dashboard',
  'manage_courses',
  'manage_courses_lessons',
  'manage_lessons',
  'publish_unpublish_lessons',
  'manage_course_materials',
  'view_students',
  'manage_student_records',
  'view_orders_payments',
  'manage_results',
  'release_results',
  'manage_catalogue_settings',
];

async function getMainAdminClient() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Main Admin session: ${authError.message}`);
  if (!user) throw new Error('Main Admin sign-in is required.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Unable to verify the Main Admin profile: ${profileError.message}`);
  if (!profile || !isMainAdminProfile(profile)) throw new Error('A Main Admin account is required to manage Sub-Admin accounts.');
  return { supabase, user };
}

function getAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Sub-Admin invitations require server-only SUPABASE_SERVICE_ROLE_KEY configuration.');
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function validateAccount(name, email, permissions) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return 'Enter a name of 1 to 80 characters.';
  }
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  if (!Array.isArray(permissions) || permissions.some((permission) => !subAdminPermissions.includes(permission))) {
    return 'One or more selected permissions are not allowed.';
  }
  if (permissions.includes('release_results') && !permissions.includes('manage_results')) {
    return 'Releasing results also requires the Create and update student results permission.';
  }
  return null;
}

export async function listSubAdmins() {
  try {
    const { supabase } = await getMainAdminClient();
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select(profileSelectColumns('id, display_name, email, role'))
      .eq('role', 'sub_admin')
      .order('display_name');
    if (profileError) throw new Error(`Unable to load Sub-Admin profiles: ${profileError.message}`);

    const ids = profiles.map((profile) => profile.id);
    let rows = [];
    if (ids.length) {
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('profile_id, permission_key')
        .in('profile_id', ids);
      if (error) throw new Error(`Unable to load Sub-Admin permissions: ${error.message}`);
      rows = data;
    }

    const permissionsByProfile = new Map();
    for (const row of rows) {
      const permissions = permissionsByProfile.get(row.profile_id) || [];
      permissions.push(row.permission_key);
      permissionsByProfile.set(row.profile_id, permissions);
    }

    return {
      ok: true,
      archivingEnabled: isAccountArchivingEnabled(),
      accounts: profiles.map((profile) => ({
        id: profile.id,
        name: profile.display_name,
        email: profile.email,
        permissions: permissionsByProfile.get(profile.id) || [],
        archivedAt: profile.sub_admin_archived_at,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to load Sub-Admin accounts.' };
  }
}

export async function inviteSubAdmin({ name, email, permissions }) {
  const validationError = validateAccount(name, email, permissions);
  if (validationError) return { ok: false, error: validationError };

  try {
    const { supabase } = await getMainAdminClient();
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email.trim())
      .limit(1)
      .maybeSingle();
    if (profileLookupError) throw new Error(`Unable to check for an existing account: ${profileLookupError.message}`);
    if (existingProfile) {
      return { ok: false, error: 'An account already uses this email. Do not create another invitation; manage the existing account instead.' };
    }

    const authAdmin = getAuthAdminClient();
    const redirectTo = createInvitationRedirect(
      process.env.NEXT_PUBLIC_SITE_URL,
      '/auth/confirm?next=accept-subadmin',
    );
    const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { name: name.trim() },
      redirectTo,
    });
    if (error) return invitationFailure(error, 'Sub-Admin');
    if (!data.user?.id) throw new Error('The invitation did not return a user identifier.');

    const { error: assignmentError } = await supabase.rpc('assign_sub_admin', {
      target_user_id: data.user.id,
      target_display_name: name.trim(),
      assigned_permissions: [...new Set(permissions)],
    });

    if (assignmentError) {
      return {
        ok: false,
        invitationCreated: true,
        error: `Supabase accepted the invitation, but the Sub-Admin profile and permissions could not be saved: ${assignmentError.message}. No account was deleted. Do not retry with this email; ask an administrator to reconcile this pending account.`,
      };
    }

    return { ok: true };
  } catch (error) {
    return invitationFailure(error, 'Sub-Admin');
  }
}

export async function saveSubAdminPermissions({ id, name, email, permissions }) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The Sub-Admin identifier is invalid.' };
  const validationError = validateAccount(name, email, permissions);
  if (validationError) return { ok: false, error: validationError };

  try {
    const { supabase } = await getMainAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(profileSelectColumns('role'))
      .eq('id', id)
      .maybeSingle();
    if (profileError) throw new Error(`Unable to verify the Sub-Admin account: ${profileError.message}`);
    if (!profile || profile.role !== 'sub_admin') return { ok: false, error: 'The Sub-Admin account was not found.' };
    if (profile.sub_admin_archived_at) return { ok: false, error: 'Restore this Sub-Admin before editing assigned permissions.' };

    const { error } = await supabase.rpc('assign_sub_admin', {
      target_user_id: id,
      target_display_name: name.trim(),
      assigned_permissions: [...new Set(permissions)],
    });
    if (error) throw new Error(`Unable to save Sub-Admin permissions: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save Sub-Admin permissions.' };
  }
}

export async function setSubAdminArchived(id, archived) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || typeof archived !== 'boolean') {
    return { ok: false, error: 'The Sub-Admin identifier or requested archive state is invalid.' };
  }
  if (!isAccountArchivingEnabled()) {
    return { ok: false, error: 'Sub-Admin archiving is not enabled. Review and apply the account-archiving migration, then enable SUB_ADMIN_ARCHIVING_ENABLED on the TEST deployment.' };
  }
  try {
    const { supabase } = await getMainAdminClient();
    const { error } = await supabase.rpc('set_sub_admin_archived', {
      target_user_id: id,
      requested_archived: archived,
    });
    if (error) throw new Error(`Unable to ${archived ? 'archive' : 'restore'} the Sub-Admin: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to update the Sub-Admin account.' };
  }
}

export async function sendSubAdminAccessEmail(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The Sub-Admin identifier is invalid.' };
  try {
    const { supabase } = await getMainAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(profileSelectColumns('email,role'))
      .eq('id', id)
      .maybeSingle();
    if (profileError) throw new Error(`Unable to retrieve the Sub-Admin account: ${profileError.message}`);
    if (!profile || profile.role !== 'sub_admin') return { ok: false, error: 'The Sub-Admin account was not found.' };
    if (isAccountArchivingEnabled() && profile.sub_admin_archived_at) return { ok: false, error: 'Restore this Sub-Admin before sending an account email.' };

    const authAdmin = getAuthAdminClient();
    const { data, error } = await authAdmin.auth.admin.getUserById(id);
    if (error) throw new Error(`Unable to check the Sub-Admin Auth account: ${error.message}`);
    const emailAction = getAccountEmailAction(data.user);
    if (emailAction === 'pending-invitation' || emailAction === 'unconfirmed') {
      return {
        ok: false,
        unavailable: true,
        error: 'This account has not activated. Supabase Auth does not provide a safe resend operation for an existing invitation through the current app. No email was sent and no account was recreated. Normal resend requires the TEST project email provider to be configured.',
      };
    }
    if (emailAction !== 'password-recovery' || data.user.email?.toLowerCase() !== profile.email.toLowerCase()) {
      return { ok: false, error: 'The Auth account could not be safely matched to this Sub-Admin profile.' };
    }

    const redirectTo = createInvitationRedirect(
      process.env.NEXT_PUBLIC_SITE_URL,
      '/admin/password-recovery?next=subadmin',
    );
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, { redirectTo });
    if (resetError) return invitationErrors.recoveryEmailFailure(resetError);
    return { ok: true };
  } catch (error) {
    return invitationErrors.recoveryEmailFailure(error);
  }
}
