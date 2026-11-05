'use server';

import { createClient } from '../../utils/supabase/server';

export async function submitCourseOrder(courseId, reference, proofPath) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, error: 'Sign in with an active student account before submitting payment.' };
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'student') {
      return { ok: false, error: 'An active student account is required.' };
    }
    const { data: student, error: studentError } = await supabase
      .from('students').select('is_active').eq('profile_id', user.id).maybeSingle();
    if (studentError || !student?.is_active) {
      return { ok: false, error: 'An active student account is required.' };
    }
    const { data, error } = await supabase.rpc('submit_course_order', {
      target_course_id: courseId,
      submitted_reference: reference,
      submitted_proof_path: proofPath,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, orderId: data };
  } catch {
    return { ok: false, error: 'The payment submission could not be completed.' };
  }
}

export async function submitGuestCourseOrder(courseId, name, email, reference) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) return { ok: false, error: `Unable to verify the current session: ${authError.message}` };
    if (user) return { ok: false, error: 'Sign out before placing a guest order.' };

    const { data, error } = await supabase.rpc('submit_guest_course_order', {
      target_course_id: courseId,
      submitted_buyer_name: name,
      submitted_buyer_email: email,
      submitted_reference: reference,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, orderId: data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The guest order could not be completed.',
    };
  }
}
