import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-event OG image — the link preview card iMessage / Twitter / etc. show
 * when someone shares /event/[id].
 *
 * Aspect history:
 *   v1 — declared a static `og:image` pointing at the raw poster URL.
 *        iMessage hard-cropped portrait flyers to a 1.91:1 banner, lopping
 *        off the top (artist name) and bottom (date/venue).
 *   v2 — switched to a dynamic 1200×630 dark canvas with the poster
 *        letterboxed via objectFit:contain. Fixed portrait flyers, but
 *        iMessage's *compact* preview crops to a square (~630×630 from
 *        the center of the 1200×630), which chopped the left and right
 *        off any landscape image (e.g. an artist photo at 1080×586).
 *   v3 (current) — 1200×1200 square canvas. iMessage's square crop now
 *        equals our whole frame, so nothing is cropped further.
 *        Platforms that force 1.91:1 (Twitter) crop the dark padding off
 *        first, leaving the image content (centered) intact. Verified
 *        locally with the og-preview Satori harness before deploying.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam event';
export const size = { width: 1200, height: 1200 };
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
