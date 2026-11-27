import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('website_settings')
      .select('contact_phone_primary,contact_phone_secondary,contact_email,elearning_email,hero_title,hero_description,primary_button_label,primary_button_href,secondary_button_label,secondary_button_href,hero_image_path,hero_image_alt')
      .eq('id', true)
      .maybeSingle();
    if (error) throw new Error(`Unable to load public website settings: ${error.message}`);
    if (!data) throw new Error('Public website settings have not been initialized.');

    return NextResponse.json({
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
        heroImageAlt: data.hero_image_alt,
        heroImageUrl: data.hero_image_path ? '/api/website-settings/image' : '',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to load website settings for the public site.', error);
    return NextResponse.json(
      { error: 'Website settings are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
