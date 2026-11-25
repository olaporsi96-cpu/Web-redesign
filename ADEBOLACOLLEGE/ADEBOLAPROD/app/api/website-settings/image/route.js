import { createAdminClient } from '../../../../utils/supabase/admin';

export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: settings, error: settingsError } = await admin.from('website_settings')
      .select('hero_image_path').eq('id', true).maybeSingle();
    if (settingsError) throw new Error(`Unable to load the homepage image setting: ${settingsError.message}`);
    if (!settings?.hero_image_path) return new Response('Not found', { status: 404 });

    const { data, error } = await admin.storage.from('website-assets').download(settings.hero_image_path);
    if (error) throw new Error(`Unable to load the private homepage image: ${error.message}`);
    if (!data || !allowedTypes.has(data.type)) {
      throw new Error('The stored homepage image has an unsupported content type.');
    }

    return new Response(await data.arrayBuffer(), {
      headers: {
        'Content-Type': data.type,
        'Content-Length': String(data.size),
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Unable to serve the homepage image.', error);
    return new Response('Homepage image temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
}
