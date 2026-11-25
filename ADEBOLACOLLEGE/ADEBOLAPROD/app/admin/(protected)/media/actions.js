'use server';

import { createClient } from '../../../../utils/supabase/server';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';

const { isAdminEnabledProfile, isMainAdminProfile } = adminAuthorization;

async function getMainAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Main Admin sign-in is required.');
  const { data: profile, error } = await supabase.from('profiles')
    .select('role, admin_enabled').eq('id', user.id).maybeSingle();
  if (error) throw new Error(`Unable to verify the Admin profile: ${error.message}`);
  if (!profile || !isMainAdminProfile(profile) || !isAdminEnabledProfile(profile)) {
    throw new Error('An enabled Main Admin account is required.');
  }
  return { supabase, user };
}

export async function loadEducationalVideo() {
  try {
    const { supabase } = await getMainAdmin();
    const { data, error } = await supabase.from('elearning_feature_settings')
      .select('video_path,video_file_name,published').eq('id', true).maybeSingle();
    if (error) throw error;
    return { ok: true, video: data || null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to load the educational video.' };
  }
}

export async function saveEducationalVideo({ path, fileName, published }) {
  if (typeof path !== 'string' || !path || path.length > 500
    || !path.startsWith('general/') || !path.toLowerCase().endsWith('.mp4')
    || typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255
    || !fileName.toLowerCase().endsWith('.mp4')
    || typeof published !== 'boolean') {
    return { ok: false, error: 'Choose a valid MP4 video and publication state.' };
  }
  try {
    const { supabase, user } = await getMainAdmin();
    const { error } = await supabase.from('elearning_feature_settings').upsert({
      id: true,
      video_path: path,
      video_file_name: fileName.trim(),
      published,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to save the educational video.' };
  }
}

export async function deleteEducationalVideo() {
  try {
    const { supabase, user } = await getMainAdmin();
    const { data: current, error: loadError } = await supabase.from('elearning_feature_settings')
      .select('video_path,video_file_name,published').eq('id', true).maybeSingle();
    if (loadError) throw loadError;
    if (!current?.video_path) return { ok: true, warning: '' };

    const { error: clearError } = await supabase.from('elearning_feature_settings').update({
      video_path: null,
      video_file_name: null,
      published: false,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', true);
    if (clearError) throw clearError;

    const { error: removeError } = await supabase.storage.from('elearning-public-media').remove([current.video_path]);
    if (!removeError) return { ok: true, warning: '' };

    const { error: restoreError } = await supabase.from('elearning_feature_settings').update({
      video_path: current.video_path,
      video_file_name: current.video_file_name,
      published: current.published,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', true);
    if (restoreError) {
      return {
        ok: false,
        error: `The video metadata was cleared, but its storage object could not be removed or restored: ${removeError.message}; ${restoreError.message}`,
      };
    }
    return { ok: false, error: `The video could not be removed. Its previous settings were restored: ${removeError.message}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to delete the educational video.' };
  }
}
