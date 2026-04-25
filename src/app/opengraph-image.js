import { ImageResponse } from 'next/og';

/**
 * Home OG image — link preview card for shared mylocaljam.com links.
 *
 * Wordmark top, tagline hero filling the rest. No custom fonts: the
 * earlier attempt loaded Outfit + IBM Plex Mono via Google Fonts CSS2
 * fetch, which silently failed on Vercel's edge runtime and produced
 * empty 200-OK responses. System sans-serif renders cleanly here. If
 * we want true brand typography on the card later, the fix is to
 * bundle the woff2 binary into /public and read it via fs at edge,
 * not fetch from Google.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam — Your local music source, all in one spot.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#13131C',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 80px',
          color: '#FFFFFF',
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
            marginBottom: 60,
          }}
        >
          <span>myLocal</span>
          <span style={{ color: '#E8722A' }}>Jam</span>
        </div>

        {/* Tagline hero — fills remaining space */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 124,
            fontWeight: 700,
            lineHeight: 0.95,
            textTransform: 'uppercase',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex' }}>Your local</div>
          <div style={{ display: 'flex' }}>music source,</div>
          <div style={{ display: 'flex' }}>
            <span>all in one </span>
            <span style={{ color: '#E8722A' }}>spot.</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
