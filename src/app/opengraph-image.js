import { ImageResponse } from 'next/og';

/**
 * Home OG image — what shows up as the link preview card in iMessage,
 * Twitter, WhatsApp, Slack, etc. when someone shares mylocaljam.com
 *
 * Rendered dynamically at the edge via next/og (Satori under the hood).
 * Design follows the refreshed brand: Outfit 900 wordmark + hero tagline,
 * IBM Plex Mono meta line, orange accent on the final word, dashed orange
 * perforation line as the ticket-stub brand motif.
 *
 * Note on "Jam": the live site header uses italic "Jam" via browser faux-
 * italic, which Satori doesn't synthesize. The OG card differentiates with
 * color alone (orange upright) — acceptable inconsistency at thumbnail size
 * where the italic detail wouldn't survive anyway.
 *
 * Next.js auto-registers this file as the og:image AND twitter:image meta
 * tag for the root route — don't also declare openGraph.images in layout.js.
 */

export const runtime = 'edge';
export const alt = 'myLocalJam — Your local music source, all in one spot.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fetch a Google Font glyph subset at request time. Passing `text` makes the
// CSS2 API return only the glyphs we need — much faster than loading full font.
async function loadGoogleFont(family, text) {
  const url = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!match) throw new Error(`Font load failed for ${family}`);
  const resp = await fetch(match[1]);
  if (!resp.ok) throw new Error(`Font fetch failed for ${family}`);
  return resp.arrayBuffer();
}

export default async function Image() {
  // Only fetch glyphs we actually render — fast path.
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
          padding: '56px 72px',
          color: '#FFFFFF',
          position: 'relative',
        }}
      >
        {/* Warm orange ambient glow, lower-left — same atmosphere as the Spotlight card */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            background:
              'radial-gradient(ellipse at 0% 100%, rgba(232,114,42,0.28) 0%, transparent 55%)',
          }}
        />

        {/* Top: wordmark */}
        <div
          style={{
            display: 'flex',
            fontFamily: 'Outfit',
            fontSize: '52px',
            fontWeight: 900,
            letterSpacing: '-0.035em',
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          <span>myLocal</span>
          <span style={{ color: '#E8722A' }}>Jam</span>
        </div>

        {/* Middle: tagline hero — three stacked lines so the last word + orange
            accent land on their own line for maximum emphasis */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Outfit',
            fontSize: '130px',
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            textTransform: 'uppercase',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex' }}>Your local</div>
          <div style={{ display: 'flex' }}>music source,</div>
          <div style={{ display: 'flex' }}>
            <span>all in one </span>
            <span style={{ color: '#E8722A' }}>spot.</span>
          </div>
        </div>

        {/* Bottom: dashed perforation rule + mono meta line.
            Dashed borders render unreliably in Satori; using a repeating linear
            gradient instead — identical visual, always renders. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              flex: 1,
              height: '3px',
              display: 'flex',
              background:
                'repeating-linear-gradient(to right, rgba(232,114,42,0.42) 0 10px, transparent 10px 20px)',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'IBM Plex Mono',
              fontSize: '22px',
              fontWeight: 500,
              letterSpacing: '0.18em',
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            JERSEY SHORE · MYLOCALJAM.COM
          </div>
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
