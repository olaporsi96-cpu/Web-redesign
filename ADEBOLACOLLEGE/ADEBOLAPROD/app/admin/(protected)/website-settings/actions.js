'use server';

import websiteSettings from '../../../../utils/website-settings.cjs';
import { createClient } from '../../../../utils/supabase/server';
import { createAdminClient } from '../../../../utils/supabase/admin';
import adminAuthorization from '../../../../utils/admin-authorization.cjs';

const { isAdminEnabledProfile, isMainAdminProfile } = adminAuthorization;
const { validateWebsiteSettings, matchesHeroImageSignature } = websiteSettings;
const MAX_HERO_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function getMainAdminContext() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Unable to verify the Admin session: ${authError.message}`);
  if (!user) throw new Error('Main Admin sign-in is required.');

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role,admin_enabled').eq('id', user.id).maybeSingle();
  if (profileError) throw new Error(`Unable to verify the Admin profile: ${profileError.message}`);
  if (!profile || !isMainAdminProfile(profile) || !isAdminEnabledProfile(profile)) {
    throw new Error('An enabled Main Admin account is required to manage website settings.');
  }
  return { supabase, user };
}

function actionFailure(error, operation) {
  return {
    ok: false,
    error: error instanceof Error ? `${operation}: ${error.message}` : `${operation} failed.`,
  };
}

export async function loadWebsiteSettings() {
  try {
    await getMainAdminContext();
    const admin = createAdminClient();
    const { data, error } = await admin.from('website_settings')
      .select('contact_phone_primary,contact_phone_secondary,contact_email,elearning_email,hero_title,hero_description,primary_button_label,primary_button_href,secondary_button_label,secondary_button_href,hero_image_path,hero_image_alt')
      .eq('id', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Website settings have not been initialized in the database.');

    let heroImageUrl = '';
    if (data.hero_image_path) {
      const { data: signedImage, error: imageError } = await admin.storage
        .from('website-assets').createSignedUrl(data.hero_image_path, 3600);
      if (imageError) throw imageError;
      heroImageUrl = signedImage.signedUrl;
    }
    return {
      ok: true,
      settings: {
        contactPhonePrimary: data.contact_phone_primary,
        contactPhoneSecondary: data.contact_phone_secondary,
        contactEmail: data.contact_email,
        elearningEmail: data.elearning_email,
        heroTitle: data.hero_title,
        heroDescription: data.hero_description,
        primaryButtonLabel: data.primary_button_label,
        primaryButtonHref: data.primary_button_href,
        secondaryButtonLabel: data.secondary_button_label,
        secondaryButtonHref: data.secondary_button_href,
        heroImagePath: data.hero_image_path,
        heroImageAlt: data.hero_image_alt,
        heroImageUrl,
      },
    };
  } catch (error) {
    return actionFailure(error, 'Loading website settings');
  }
}

async function verifyUploadedImage(admin, path) {
  const extension = path.split('.').pop().toLowerCase();
  const expectedType = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg' : extension === 'png' ? 'image/png' : 'image/webp';
  const { data, error } = await admin.storage.from('website-assets').download(path);
  if (error) throw new Error('The selected homepage image could not be verified in private storage.');
  if (!data || !IMAGE_TYPES.has(data.type) || data.type !== expectedType
    || data.size < 1 || data.size > MAX_HERO_IMAGE_BYTES) {
    throw new Error('Homepage images must be valid JPEG, PNG, or WebP files no larger than 5 MB.');
  }
  if (!matchesHeroImageSignature(data.type, Buffer.from(await data.arrayBuffer()))) {
    throw new Error('The uploaded image content does not match its file type.');
  }
}

export async function saveWebsiteSettings(input) {
  const validationError = validateWebsiteSettings(input);
  if (validationError) return { ok: false, error: validationError };

  try {
    const { supabase, user } = await getMainAdminContext();
    const admin = createAdminClient();
    const { data: previous, error: previousError } = await admin.from('website_settings')
      .select('hero_image_path').eq('id', true).maybeSingle();
    if (previousError) throw previousError;
    if (!previous) throw new Error('Website settings have not been initialized in the database.');

    if (input.heroImagePath && input.heroImagePath !== previous.hero_image_path) {
      await verifyUploadedImage(admin, input.heroImagePath);
    }

    const { error } = await supabase.rpc('save_website_settings', {
      configured_contact_phone_primary: input.contactPhonePrimary.trim(),
      configured_contact_phone_secondary: input.contactPhoneSecondary.trim(),
      configured_contact_email: input.contactEmail.trim(),
      configured_elearning_email: input.elearningEmail.trim(),
      configured_hero_title: input.heroTitle.trim(),
      configured_hero_description: input.heroDescription.trim(),
      configured_primary_button_label: input.primaryButtonLabel.trim(),
      configured_primary_button_href: input.primaryButtonHref,
      configured_secondary_button_label: input.secondaryButtonLabel.trim(),
      configured_secondary_button_href: input.secondaryButtonHref,
      configured_hero_image_path: input.heroImagePath,
      configured_hero_image_alt: input.heroImageAlt.trim(),
    });
    if (error) throw error;

    let warning = '';
    if (previous.hero_image_path && previous.hero_image_path !== input.heroImagePath) {
      const { error: removeError } = await admin.storage.from('website-assets').remove([previous.hero_image_path]);
      if (removeError) warning = `Settings were saved, but the replaced private image could not be removed: ${removeError.message}`;
    }
    return { ok: true, warning, updatedBy: user.id };
  } catch (error) {
    return actionFailure(error, 'Saving website settings');
  }
}
