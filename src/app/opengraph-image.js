import { ImageResponse } from 'next/og';

/**
 * Home OG image — diagnostic v3.
 *
 * v1 (gradients + fonts) and v2 (no gradients, fonts only) both returned
 * 200 OK with 0-byte bodies on Vercel. Stripping fonts entirely now to
 * isolate whether the Google Fonts fetch is the culprit. ImageResponse
 * falls back to system sans-serif when no custom fonts are provided.
 *
 * If THIS still returns empty, something more fundamental is wrong with
 * the route on Vercel and we'll need to look at function logs directly.
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
          justifyContent: 'space-between',
          padding: '64px 80px',
          color: '#FFFFFF',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
          }}
        >
          <span>myLocal</span>
          <span style={{ color: '#E8722A' }}>Jam</span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 110,
            fontWeight: 700,
            lineHeight: 0.95,
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex' }}>Your local</div>
          <div style={{ display: 'flex' }}>music source,</div>
          <div style={{ display: 'flex' }}>
            <span>all in one </span>
            <span style={{ color: '#E8722A' }}>spot.</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          JERSEY SHORE · MYLOCALJAM.COM
        </div>
      </div>
    ),
    { ...size },
  );
}
