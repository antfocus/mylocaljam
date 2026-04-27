import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-event OG image — the link preview card iMessage / Twitter / etc. show
 * when someone shares /event/[id].
 *
 * History:
 *  - v1: static `og:image` pointing at the event's raw poster URL. iMessage
 *        hard-cropped tall posters to a 1.91:1 banner, killing the top/bottom
 *        of the flyer (which usually has the date or venue name).
 *  - v2: 1200×630 dark canvas with the source `objectFit: contain`. Solved
 *        the cropping but portrait posters became a postage stamp with huge
 *        dark side-bars — looked dramatically worse than the original.
 *  - v3 (this version): 1200×1500 portrait canvas (4:5). Modern iMessage
 *        treats tall OG images as a "tall preview" and shows them at near-
 *        full size, which is ideal for the venue flyers we get from scrapers
 *        (almost all portrait). Landscape sources still fit via `contain`
 *        with small top/bottom bars, but that case is rare.
 *
 * Trade-off vs. landscape: Twitter's `summary_large_image` card is 1.91:1
 * and will letterbox a 4:5 image. Most shares from mylocaljam go to iMessage
 * or Messenger (which both honor portrait), so we optimize for that.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam event';
export const size = { width: 1200, height: 1500 };
export const contentType = 'image/png';

// Treat empty / sentinel values as missing so the waterfall keeps falling.
function clean(v) {
  return (v && v !== 'None' && v !== '') ? v : null;
}

// Reject image URLs that are too small/low-res to look good as a 1200×630
// link preview. gstatic `tbn:` URLs are Google search-result thumbnails,
// max ~200px wide — when piped through `objectFit: contain` they letterbox
// into a tiny postage stamp, which iMessage then compact-crops weirdly.
// (Pending DB cleanup of these is task #29 — this filter is defense in depth.)
const LOW_QUALITY_HOSTS = [
  /encrypted-tbn\d*\.gstatic\.com/i,
  /\.gstatic\.com\/.*tbn:/i,
];
function isLowQualityImage(url) {
  if (!url) return false;
  return LOW_QUALITY_HOSTS.some((pat) => pat.test(url));
}
function preferQuality(v) {
  const c = clean(v);
  return (c && !isLowQualityImage(c)) ? c : null;
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
    // Same waterfall priority as src/app/event/[id]/page.js, but each step
    // also rejects gstatic thumbnails so the OG preview never falls back to
    // a 200px image. (Snow Crabs template was the canary on 2026-04-27.)
    return (
      preferQuality(event.custom_image_url) ||
      preferQuality(event.event_templates?.image_url) ||
      preferQuality(event.event_image_url) ||
      preferQuality(event.image_url) ||
      preferQuality(event.artists?.image_url) ||
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
              fontSize: 140,
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
