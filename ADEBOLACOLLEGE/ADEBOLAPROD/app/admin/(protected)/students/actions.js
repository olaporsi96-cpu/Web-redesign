'use server';

import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../../../../utils/supabase/server';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';
import invitationRedirect from '../../../../utils/invitation-redirect.cjs';
import invitationErrors from '../../../../utils/invitation-error.cjs';
import accountEmailState from '../../../../utils/auth-account-state.cjs';
import accountArchiving from '../../../../utils/account-archiving.cjs';

const {
  effectiveAdminPermissions,
  hasAdminPermission,
  isAdminEnabledProfile,
  isMainAdminProfile,
} = adminAuthorization;
const { createInvitationRedirect } = invitationRedirect;
const { invitationFailure } = invitationErrors;
const { getAccountEmailAction } = accountEmailState;
const { profileSelectColumns, isAccountArchivingEnabled } = accountArchiving;
const studentPermissions = new Set(['view_students', 'manage_student_records', 'manage_results']);

async function getAdminClient(requiredPermission) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Admin sign-in is required.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('role, admin_enabled'))
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Unable to verify the Admin profile: ${profileError.message}`);
  if (!profile || !isAdminEnabledProfile(profile)
    || (!isMainAdminProfile(profile) && profile.role !== 'sub_admin')) {
    throw new Error('An authorized Admin account is required.');
  }

  const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  if (requiredPermissions.some((permission) => !studentPermissions.has(permission))) {
    throw new Error('The requested student-management permission is not supported.');
  }
  if (!requiredPermissions.length) {
    throw new Error(`One of these permissions is required: ${requiredPermissions.join(', ')}.`);
  }
  let permissions = [];
  if (isMainAdminProfile(profile)) {
    permissions = [...studentPermissions];
  } else {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from('admin_permissions')
      .select('permission_key')
      .eq('profile_id', user.id);
    if (permissionsError) throw new Error(`Unable to verify Admin permissions: ${permissionsError.message}`);
    permissions = permissionRows.map((row) => row.permission_key);
  }
  permissions = effectiveAdminPermissions(permissions);
  if (!requiredPermissions.some((permission) => hasAdminPermission(profile, permissions, permission))) {
    throw new Error(`You need one of these permissions to perform this action: ${requiredPermissions.join(', ')}.`);
  }
  return { supabase, permissions };
}

function getAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Student invitations require server-only SUPABASE_SERVICE_ROLE_KEY configuration.');
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function listStudents() {
  try {
    const { supabase, permissions } = await getAdminClient(['view_students', 'manage_student_records']);
    const { data: students, error } = await supabase
      .from('students')
      .select('id, profile_id, name, student_number, email, is_active, created_at')
      .order('name');
    if (error) throw new Error(`Unable to load student records: ${error.message}`);

    const canViewResults = permissions.includes('manage_results');

    let counts = new Map();
    if (canViewResults && students.length) {
      const { data: resultRows, error: resultError } = await supabase
        .from('results')
        .select('student_id')
        .eq('result_status', 'Released');
      if (resultError) throw new Error(`Unable to load released-result counts: ${resultError.message}`);
      counts = resultRows.reduce((map, row) => {
        map.set(row.student_id, (map.get(row.student_id) || 0) + 1);
        return map;
      }, new Map());
    }

    return {
      ok: true,
      canManage: permissions.includes('manage_student_records'),
      canViewResults,
      students: students.map((student) => ({
        ...student,
        releasedResults: counts.get(student.id) || 0,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to load students.' };
  }
}

export async function inviteStudent({ name, studentNumber, email }) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return { ok: false, error: 'Enter a student name of 1 to 100 characters.' };
  }
  if (typeof studentNumber !== 'string' || !studentNumber.trim() || studentNumber.trim().length > 50) {
    return { ok: false, error: 'Enter a student number of 1 to 50 characters.' };
  }
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  try {
    const { supabase } = await getAdminClient('manage_student_records');
    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();
    if (profileLookupError) throw new Error(`Unable to check for an existing account: ${profileLookupError.message}`);
    if (existingProfile) {
      return { ok: false, error: 'An account already uses this email. Do not send another invitation; check the existing student or profile record.' };
    }

    const { data: existingStudent, error: studentLookupError } = await supabase
      .from('students')
      .select('id')
      .ilike('student_number', studentNumber.trim())
      .limit(1)
      .maybeSingle();
    if (studentLookupError) throw new Error(`Unable to check for an existing student number: ${studentLookupError.message}`);
    if (existingStudent) return { ok: false, error: 'A student record already uses this student number.' };

    const { data: existingStudentEmail, error: studentEmailLookupError } = await supabase
      .from('students')
      .select('id')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();
    if (studentEmailLookupError) throw new Error(`Unable to check for an existing student email: ${studentEmailLookupError.message}`);
    if (existingStudentEmail) return { ok: false, error: 'A student record already uses this email address.' };

    const authAdmin = getAuthAdminClient();
    const redirectTo = createInvitationRedirect(
      process.env.NEXT_PUBLIC_SITE_URL,
      '/auth/confirm?next=accept-student',
    );
    const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { name: name.trim() },
      redirectTo,
    });
    if (error) return invitationFailure(error, 'student');
    if (!data.user?.id) throw new Error('The invitation did not return a user identifier.');

    const { error: studentError } = await supabase.rpc('create_invited_student', {
      target_user_id: data.user.id,
      target_name: name.trim(),
      target_student_number: studentNumber.trim(),
    });
    if (studentError) {
      return {
        ok: false,
        invitationCreated: true,
        error: `Supabase accepted the invitation, but the student record could not be saved: ${studentError.message}. No account was deleted. Do not retry with this email; ask an administrator to reconcile this pending account.`,
      };
    }
    return { ok: true };
  } catch (error) {
    return invitationFailure(error, 'student');
  }
}

export async function updateStudentRecord({ id, name, studentNumber }) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The student identifier is invalid.' };
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return { ok: false, error: 'Enter a valid student name.' };
  }
  if (typeof studentNumber !== 'string' || !studentNumber.trim() || studentNumber.trim().length > 50) {
    return { ok: false, error: 'Enter a valid student number.' };
  }

  try {
    const { supabase } = await getAdminClient('manage_student_records');
    const { error } = await supabase
      .from('students')
      .update({ name: name.trim(), student_number: studentNumber.trim() })
      .eq('id', id);
    if (error) throw new Error(`Unable to update the student record: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to update the student record.' };
  }
}

export async function setStudentActive(id, active) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || typeof active !== 'boolean') {
    return { ok: false, error: 'The student or requested account status is invalid.' };
  }

  try {
    const { supabase } = await getAdminClient('manage_student_records');
    const result = isAccountArchivingEnabled()
      ? await supabase.rpc('set_student_archive_state', {
        target_student_id: id,
        target_is_active: active,
      })
      : await supabase.from('students').update({ is_active: active }).eq('id', id);
    const { error } = result;
    if (error) throw new Error(`Unable to update student access: ${error.message}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to update student access.' };
  }
}

export async function sendStudentAccessEmail(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return { ok: false, error: 'The student identifier is invalid.' };
  try {
    const { supabase } = await getAdminClient('manage_student_records');
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('profile_id,email,is_active')
      .eq('id', id)
      .maybeSingle();
    if (studentError) throw new Error(`Unable to retrieve the student account: ${studentError.message}`);
    if (!student) return { ok: false, error: 'The student record was not found.' };
    if (!student.is_active) return { ok: false, error: 'Restore this student before sending an account email.' };

    const authAdmin = getAuthAdminClient();
    const { data, error } = await authAdmin.auth.admin.getUserById(student.profile_id);
    if (error) throw new Error(`Unable to check the student Auth account: ${error.message}`);
    const emailAction = getAccountEmailAction(data.user);
    if (emailAction === 'pending-invitation' || emailAction === 'unconfirmed') {
      return {
        ok: false,
        unavailable: true,
        error: 'This account has not activated. Supabase Auth does not provide a safe resend operation for an existing invitation through the current app. No email was sent and no account was recreated. Normal resend requires the TEST project email provider to be configured.',
      };
    }
    if (emailAction !== 'password-recovery' || data.user.email?.toLowerCase() !== student.email.toLowerCase()) {
      return { ok: false, error: 'The Auth account could not be safely matched to this student record.' };
    }

    const redirectTo = createInvitationRedirect(
      process.env.NEXT_PUBLIC_SITE_URL,
      '/admin/password-recovery?next=student',
    );
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(data.user.email, { redirectTo });
    if (resetError) return invitationErrors.recoveryEmailFailure(resetError);
    return { ok: true };
  } catch (error) {
    return invitationErrors.recoveryEmailFailure(error);
  }
}
