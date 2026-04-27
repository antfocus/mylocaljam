'use client';

/**
 * ArtistMonogram — placeholder tile shown when an artist has no image_url.
 *
 * Renders a brand-cohesive gradient avatar with the artist's first letter in
 * Outfit Black, plus an always-orange accent stripe at the bottom. The
 * gradient is picked deterministically by hashing the artist name, so each
 * artist gets a stable color forever (no flicker between renders, no
 * "different shade every visit").
 *
 * Two sizes:
 *   - `sm` (default, 56px round) — list items, "My Locals" rows, etc.
 *   - `lg` (square 1:1, fills its container width) — empty-state hero on
 *      ArtistProfileScreen. Caller controls the actual rendered size by
 *      wrapping in a sized parent.
 *
 * Why a hash-by-name palette and not a genre map?  We tried the genre-mapped
 * version first and hit a wall of edge cases (null genres, multi-genre, not-
 * yet-tagged). Hash-by-name works for every artist, ships today, and any
 * artist row gets a consistent color forever. We can layer genre-aware
 * coloring later without changing the call site.
 */

// Eight brand-cohesive duotone gradients. Each entry is [from, to] hex pair.
// Order locked — the hash function indexes into this array, so reordering
// would shift every artist's color. Add new entries to the END if you ever
// want more variety.
const GRADIENTS = [
  ['#E8722A', '#8B3F0F'], // brand orange
  ['#3AADA0', '#1A5048'], // teal (mylocaljam secondary, retired but still on-brand)
  ['#1B6FAA', '#0E3A5C'], // deep blue
  ['#6B2C5F', '#2E1228'], // plum
  ['#2F6B40', '#16351F'], // forest
  ['#A8243C', '#50101C'], // crimson
  ['#B85431', '#5C2614'], // rust (sibling of brand orange)
  ['#4338CA', '#1E1A5E'], // indigo
];

function pickGradient(name) {
  if (!name) return GRADIENTS[0];
  // Simple sum-of-codepoints hash — stable, deterministic, fine for an
  // 8-bucket distribution. Not cryptographic.
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[idx];
}

function pickInitial(name) {
  if (!name) return '?';
  // Strip leading non-letter characters (asterisks, numbers, punctuation)
  // so "*Easter Sip & Shop*" → "E", not "*". Falls back to "?" if there's
  // no letter at all.
  const trimmed = name.replace(/^[^A-Za-z]+/, '');
  return (trimmed[0] || name[0] || '?').toUpperCase();
}

const ACCENT = '#E8722A';

/**
 * @param {object} props
 * @param {string} props.name        — Artist name. Used for hash + initial.
 * @param {'sm'|'lg'} [props.size]   — 'sm' = round avatar (56px). 'lg' = square fills container.
 * @param {object} [props.style]     — Inline override. Caller wins.
 */
export default function ArtistMonogram({ name = '', size = 'sm', style = {} }) {
  const [from, to] = pickGradient(name);
  const initial = pickInitial(name);
  const background = `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;

  // Common visual elements both sizes share: gradient bg, centered initial,
  // bottom orange accent stripe.
  const baseStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background,
    flexShrink: 0,
  };

  if (size === 'lg') {
    return (
      <div
        style={{
          ...baseStyle,
          width: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '14px',
          ...style,
        }}
      >
        <span style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 800,
          fontSize: 'clamp(96px, 30vw, 220px)',
          color: '#FFFFFF',
          letterSpacing: '-0.05em',
          textShadow: '0 8px 32px rgba(0,0,0,0.3)',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {initial}
        </span>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '4px',
          background: ACCENT,
        }} />
      </div>
    );
  }

  // Default: 'sm' round avatar, 56px.
  return (
    <div
      style={{
        ...baseStyle,
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        ...style,
      }}
    >
      <span style={{
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 800,
        fontSize: '24px',
        color: '#FFFFFF',
        letterSpacing: '-0.03em',
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        lineHeight: 1,
        userSelect: 'none',
      }}>
        {initial}
      </span>
      {/* Subtle 2px orange accent — sits along the bottom edge of the
          circle. Visible inside the circle's clip via `overflow: hidden`. */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '2px',
        background: ACCENT,
      }} />
    </div>
  );
}
