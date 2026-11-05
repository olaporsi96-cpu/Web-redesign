'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../../utils/supabase/server';
import { getStudentRedirectTarget } from '../../../utils/student-redirect.cjs';

export async function signInStudent(email, password, requestedNext) {
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return { ok: false, error: 'Enter your email address and password.' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { ok: false, error: error.message };
    if (!data.user) return { ok: false, error: 'Supabase did not return an authenticated student account.' };

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      await supabase.auth.signOut();
      throw new Error(`Unable to verify the student profile: ${profileError.message}`);
    }
    if (profile?.role !== 'student') {
      await supabase.auth.signOut();
      return { ok: false, error: 'This account does not have student portal access.' };
    }

    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('profile_id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (studentError) {
      await supabase.auth.signOut();
      throw new Error(`Unable to verify the student record: ${studentError.message}`);
    }
    if (!student) {
      await supabase.auth.signOut();
      return { ok: false, error: 'This student account is inactive or is not linked to a student record.' };
    }

    return { ok: true, next: getStudentRedirectTarget(requestedNext) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to sign in to the student portal.',
    };
  }
}

export async function signOutStudent() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
  redirect('/student/login');
}
