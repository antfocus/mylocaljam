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
          {/* Orange highlight on "local" (May 5, 2026) — "Local" is the
              differentiator (we're not Bandsintown / Songkick / Ticketmaster
              aggregators, we're Jersey-Shore-specific) so that's the word the
              eye should land on. "All in one spot." kept intact because the
              idiom carries the comprehensiveness signal.

              Satori quirk: the column-flex parent measures each child's
              height to position the next one. A flex child whose contents are
              "single outer span containing text + nested color span" measures
              differently from a flex child whose contents are just plain text.
              When the nested-span line was the LAST child (the original
              shape), this didn't matter — no subsequent siblings to
              misposition. When it became the FIRST child, lines 2-3 collapsed
              onto line 1's Y because Satori miscalculated line 1's height.

              Workaround: normalize ALL three lines to the same outer-span
              shape (single outer span with whiteSpace:pre), so Satori
              measures them identically regardless of whether the inner
              content has a nested color span or not. */}
          <div style={{ display: 'flex' }}>
            <span style={{ whiteSpace: 'pre' }}>
              Your <span style={{ color: '#E8722A' }}>local</span>
            </span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ whiteSpace: 'pre' }}>music source,</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ whiteSpace: 'pre' }}>all in one spot.</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
