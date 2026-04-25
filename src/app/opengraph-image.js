import { ImageResponse } from 'next/og';

/**
 * Home OG image — link preview card for shared mylocaljam.com links.
 *
 * Uses Outfit 900 (the brand display face) loaded from jsdelivr's
 * @fontsource mirror. Earlier attempt loaded fonts via the Google
 * Fonts CSS2 API and silently failed on Vercel's edge runtime —
 * fetching the woff2 binary directly avoids the CSS-parsing layer
 * that was breaking. jsdelivr is on Vercel's egress allowlist and
 * the file is ~13KB so the fetch is near-instant at request time.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam — Your local music source, all in one spot.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const OUTFIT_900_URL =
  'https://cdn.jsdelivr.net/npm/@fontsource/outfit@5.2.6/files/outfit-latin-900-normal.woff2';

export default async function Image() {
  const outfit900 = await fetch(OUTFIT_900_URL).then((r) => {
    if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
    return r.arrayBuffer();
  });

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
            fontFamily: 'Outfit',
            fontWeight: 900,
            fontSize: 56,
            letterSpacing: '-0.035em',
            marginBottom: 60,
          }}
        >
          <span>myLocal</span>
          <span style={{ color: '#E8722A' }}>Jam</span>
        </div>

        {/* Tagline hero — fills remaining space, centered vertically */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Outfit',
            fontWeight: 900,
            fontSize: 130,
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
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
    {
      ...size,
      fonts: [
        { name: 'Outfit', data: outfit900, weight: 900, style: 'normal' },
      ],
    },
  );
}
