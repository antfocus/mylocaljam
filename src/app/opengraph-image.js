import { ImageResponse } from 'next/og';

/**
 * Home OG image — link preview card for shared mylocaljam.com links.
 *
 * Uses system sans-serif rather than Outfit. We tried two approaches to
 * loading custom fonts in this edge route — fetching from Google Fonts
 * CSS2 and fetching woff2 directly from jsdelivr — and both produced
 * empty 200-OK responses. Vercel's edge runtime appears to be blocking
 * or timing out outbound asset fetches in this function. The fix-it-
 * later path is to bundle the Outfit woff2 file inside the repo and
 * reference it via `new URL('./...', import.meta.url)` so Next.js
 * inlines the asset at build time and the function never has to make
 * an outbound fetch. Until then, system sans is acceptable — the card
 * renders, the design hierarchy is clear, and the brand color signals
 * the rest.
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

        {/* Tagline hero — fills remaining space, centered vertically */}
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
          {/* The space between "one" and "spot." kept getting collapsed by
              Satori. Every previous fix that touched the third div's flex
              children — trailing space, NBSP, gap on the parent, marginRight
              on the child — either lost the word break OR collapsed the
              parent's column-flex height calc and stacked all three lines
              at the same Y.
              Fix: keep the line as a single outer span (so the flex div has
              exactly one child and the column layout stays intact), and add
              `whiteSpace: 'pre'` so Satori preserves the literal space
              between "all in one " and the inline orange "spot." span.
              Verified locally with the og-preview Satori harness before
              deploying. */}
          <div style={{ display: 'flex' }}>
            <span style={{ whiteSpace: 'pre' }}>
              all in one <span style={{ color: '#E8722A' }}>spot.</span>
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
