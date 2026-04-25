import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-event OG image — the link preview card iMessage / Twitter / etc. show
 * when someone shares /event/[id].
 *
 * The previous implementation declared a static `og:image` pointing at the
 * event's raw poster URL. iMessage then hard-cropped that poster to the
 * 1.91:1 banner aspect — so any portrait poster lost its top and bottom
 * (every venue uses a portrait flyer; the matinée date you cared about
 * was the first thing to disappear).
 *
 * This dynamic version renders a 1200×630 dark canvas at the edge and
 * letterboxes the original poster inside it via maxWidth/maxHeight. The
 * platforms get a 1.91:1 image they don't need to crop, and the user
 * sees the full poster framed in brand-orange-on-dark.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam event';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Treat empty / sentinel values as missing so the waterfall keeps falling.
function clean(v) {
  return (v && v !== 'None' && v !== '') ? v : null;
}

async function fetchEventImage(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key || !id) return null;

  try {
    const supabase = createClient(url, key);
    const { data: event } = await supabase
      .from('events')
      .select(`
        custom_image_url,
        event_image_url,
        image_url,
        artists ( image_url ),
        event_templates ( image_url )
      `)
      .eq('id', id)
      .single();
    if (!event) return null;
    // Same waterfall priority as src/app/event/[id]/page.js
    return (
      clean(event.custom_image_url) ||
      clean(event.event_templates?.image_url) ||
      clean(event.event_image_url) ||
      clean(event.image_url) ||
      clean(event.artists?.image_url) ||
      null
    );
  } catch {
    return null;
  }
}

export default async function Image({ params }) {
  const { id } = await params;
  const imageUrl = await fetchEventImage(id);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#13131C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={imageUrl}
            style={{
              // Letterbox: image fits inside the 1200x630 frame at its native
              // aspect, with brand-dark bars filling whatever direction is
              // shorter. iMessage gets a 1.91:1 image so it has nothing to
              // crop further.
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          // Fallback when no event image is available — show the brand
          // wordmark on the same dark canvas so the share doesn't look
          // broken.
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.035em',
            }}
          >
            <span>myLocal</span>
            <span style={{ color: '#E8722A' }}>Jam</span>
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
