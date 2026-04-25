import { ImageResponse } from 'next/og';

/**
 * Home OG image — link preview card for iMessage, Twitter, WhatsApp, Slack.
 *
 * NOTE on the current version: previous attempt produced empty 200 responses
 * (Satori was silently bailing on `repeating-linear-gradient` and possibly
 * `radial-gradient`). This version sticks to features Satori reliably supports:
 * solid backgrounds, flex layout, custom Google Fonts, plain colors. We can
 * layer flair back in once this baseline confirms the route is healthy.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam — Your local music source, all in one spot.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadGoogleFont(family, text) {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  })).text();
  const match = css.match(/src: url\((.+?)\) format\('(woff2|woff|opentype|truetype)'\)/);
  if (!match) throw new Error(`Font load failed for ${family}`);
  const resp = await fetch(match[1]);
  if (!resp.ok) throw new Error(`Font fetch failed for ${family}`);
  return resp.arrayBuffer();
}

export default async function Image() {
  const SANS_TEXT = 'myLocalJamYOUR LOCAL MUSIC SOURCE,ALIN ONE SPOT.';
  const MONO_TEXT = 'JERSEY SHORE · MYLOCALJAM.COM';

  const [outfit900, plexMono500] = await Promise.all([
    loadGoogleFont('Outfit:wght@900', SANS_TEXT),
    loadGoogleFont('IBM+Plex+Mono:wght@500', MONO_TEXT),
  ]);

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
        {/* Top: wordmark */}
        <div
          style={{
            display: 'flex',
            fontFamily: 'Outfit',
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: '-0.035em',
            lineHeight: 1,
          }}
        >
          <span>myLocal</span>
          <span style={{ color: '#E8722A' }}>Jam</span>
        </div>

        {/* Hero tagline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Outfit',
            fontSize: 130,
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
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

        {/* Bottom meta line */}
        <div
          style={{
            display: 'flex',
            fontFamily: 'IBM Plex Mono',
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
    {
      ...size,
      fonts: [
        { name: 'Outfit', data: outfit900, weight: 900, style: 'normal' },
        { name: 'IBM Plex Mono', data: plexMono500, weight: 500, style: 'normal' },
      ],
    },
  );
}
