'use server';

import { createClient } from '../../../../utils/supabase/server';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';
import supabaseError from '../../../../utils/supabase-error.cjs';
import accountArchiving from '../../../../utils/account-archiving.cjs';

const { effectiveAdminPermissions, hasAdminPermission, isMainAdminProfile } = adminAuthorization;
const { formatSupabaseError } = supabaseError;
const { profileSelectColumns } = accountArchiving;

const resultStatuses = ['Draft', 'Ready for review', 'Released'];

async function getResultsAdminClient(requiredPermission) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Sign in is required to manage results.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(profileSelectColumns('role'))
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw new Error(`Unable to verify the Admin profile: ${profileError.message}`);
  if (!profile || (!isMainAdminProfile(profile) && profile.role !== 'sub_admin')) {
    throw new Error('An authorized Admin account is required to manage results.');
  }

  if (!['manage_results', 'release_results'].includes(requiredPermission)) {
    throw new Error(`Unsupported result permission: ${requiredPermission}.`);
  }

  let permissions = [];
  if (!isMainAdminProfile(profile)) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from('admin_permissions')
      .select('permission_key')
      .eq('profile_id', user.id);
    if (permissionsError) throw new Error(`Unable to verify Admin permissions: ${permissionsError.message}`);
    permissions = permissionRows.map((row) => row.permission_key);
  }
  permissions = effectiveAdminPermissions(permissions);
  if (!hasAdminPermission(profile, permissions, requiredPermission)) {
    throw new Error(`The ${requiredPermission} permission is required to manage results.`);
  }

  return supabase;
}

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export async function saveResult(record) {
  if (!record || (record.id && !/^[0-9a-f-]{36}$/i.test(record.id))) {
    return { ok: false, error: 'The result identifier is invalid.' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(record.studentId || '')) {
    return { ok: false, error: 'Choose a valid student account.' };
  }

  const fields = [
    ['examinationNumber', 60],
    ['candidateNumber', 60],
    ['school', 100],
    ['examYear', 30],
  ];
  for (const [field, maxLength] of fields) {
    if (!isNonEmptyString(record[field], maxLength)) {
      return { ok: false, error: `Enter a valid ${field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}.` };
    }
  }

  if (!Array.isArray(record.subjects) || record.subjects.length < 1 || record.subjects.length > 100) {
    return { ok: false, error: 'A result must contain between 1 and 100 subjects.' };
  }
  if (record.subjects.some((subject) => (
    !subject
    || !isNonEmptyString(subject.name, 80)
    || (subject.score != null && typeof subject.score !== 'string')
    || (subject.grade != null && typeof subject.grade !== 'string')
    || (subject.remark != null && typeof subject.remark !== 'string')
    || (subject.score || '').length > 30
    || (subject.grade || '').length > 20
    || (subject.remark || '').length > 80
  ))) {
    return { ok: false, error: 'Check the subject names, scores, grades, and remarks.' };
  }

  try {
    const supabase = await getResultsAdminClient('manage_results');
    const { error } = await supabase.rpc('save_result_with_subjects', {
      target_result_id: record.id || null,
      target_student_id: record.studentId,
      target_examination_number: record.examinationNumber.trim(),
      target_candidate_number: record.candidateNumber.trim(),
      target_school: record.school.trim(),
      target_exam_year: record.examYear.trim(),
      target_subjects: record.subjects.map((subject) => ({
        name: subject.name.trim(),
        score: (subject.score || '').trim(),
        grade: (subject.grade || '').trim(),
        remark: (subject.remark || '').trim(),
      })),
    });

    if (error) return { ok: false, error: formatSupabaseError(error, 'Saving the result') };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatSupabaseError(error, 'Saving the result') };
  }
}

export async function updateResultStatus(id, nextStatus) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '') || !resultStatuses.includes(nextStatus)) {
    return { ok: false, error: 'The result or requested status is invalid.' };
  }

  try {
    const requiredPermission = nextStatus === 'Released' ? 'release_results' : 'manage_results';
    const supabase = await getResultsAdminClient(requiredPermission);
    const { error } = await supabase.rpc('transition_result_status', {
      target_result_id: id,
      next_status: nextStatus,
    });

    if (error) return { ok: false, error: formatSupabaseError(error, 'Updating the result status') };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatSupabaseError(error, 'Updating the result status') };
  }
}
