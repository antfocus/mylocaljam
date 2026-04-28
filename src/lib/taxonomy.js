// ─────────────────────────────────────────────────────────────────────────
// Category Taxonomy — single source of truth.
//
// Every part of the system that reads or writes a category string MUST
// import from this file. No local CATEGORY_OPTIONS / ALLOWED_CATEGORIES /
// CATEGORY_CONFIG arrays anywhere else.
//
// Why this file exists:
//   Before this constant landed, six different writers used four different
//   vocabularies. events.category drifted to 11 distinct values; templates
//   to 10; many were near-duplicates ("Food & Drink" vs "Food & Drink Special"
//   vs "Drink/Food Special"). The home-page filter pills did strict-string
//   match on the canonical value, so any drift silently dropped events from
//   the feed. See the 2026-04-27 audit (the "Snow Crabs" zero-results bug)
//   for the user-facing failure mode this fixes.
//
// Read the comments — DO NOT add a new category casually. Every category
// here must have:
//   1. A row in CATEGORIES (the canonical key)
//   2. An entry in CATEGORY_LABELS (the human-readable label, often the
//      same as the key but sometimes shortened for UI)
//   3. An entry in CATEGORY_DESCRIPTIONS (one-line "what fits here")
//   4. An entry in CATEGORY_CONFIG (color + emoji for cards)
//   5. Whatever inputs you want to map TO it added to NORMALIZE_MAP
//      (lower-cased keys; map to the exact canonical string)
//   6. A matching string in any home-page filter pill that targets it
//      (src/app/page.js — search for `filter_type: 'category'`)
//
// If you're writing a new scraper / enrichment writer / admin form, call
// `normalizeCategory(input)` before persisting. Anything outside this list
// is a bug — surface it; don't paper over it.
// ─────────────────────────────────────────────────────────────────────────

/** Canonical category keys — order matters for UI dropdowns. */
export const CATEGORIES = Object.freeze([
  'Live Music',
  'DJ/Dance Party',
  'Comedy',
  'Trivia',
  'Karaoke',
  'Food & Drink Special',
  'Sports / Watch Party',
  'Community',
  'Other / Special Event',
]);

/** Fast membership check. */
export const CATEGORY_SET = new Set(CATEGORIES);

/** Default category for unrecognized / blank values. */
export const DEFAULT_CATEGORY = 'Other / Special Event';

/**
 * Human-readable labels for UI dropdowns. In most cases this equals the
 * canonical key; we shorten the long ones (e.g. "Other / Special Event"
 * displays as "Other") to keep dropdowns tidy. The STORED value is always
 * the canonical key — never the label.
 */
export const CATEGORY_LABELS = Object.freeze({
  'Live Music':            'Live Music',
  'DJ/Dance Party':        'DJ / Dance Party',
  'Comedy':                'Comedy',
  'Trivia':                'Trivia',
  'Karaoke':               'Karaoke',
  'Food & Drink Special':  'Food & Drink',
  'Sports / Watch Party':  'Sports',
  'Community':             'Community',
  'Other / Special Event': 'Other',
});

/**
 * One-line descriptions — used as dropdown helper text and as the LLM
 * prompt's per-category guidance in eventClassifier.js. Keep them short.
 */
export const CATEGORY_DESCRIPTIONS = Object.freeze({
  'Live Music':            'Bands, solo artists, open mics, jam nights, tribute acts.',
  'DJ/Dance Party':        'DJ-driven dance events, club nights, silent disco.',
  'Comedy':                'Stand-up, improv, comedy shows.',
  'Trivia':                'Pub trivia, bar trivia, quiz night, bingo.',
  'Karaoke':               'Karaoke nights.',
  'Food & Drink Special':  'Pint nights, wing nights, AYCE, happy hour, drink specials.',
  'Sports / Watch Party':  'NFL/NBA/UFC watch parties, big-game viewings.',
  'Community':             'Markets, fundraisers, paint nights, brunches, yoga.',
  'Other / Special Event': 'Anything that genuinely fits nowhere else.',
});

/**
 * Display config for cards (color + emoji). Mirrored in EventCardV2 and
 * SiteEventCard via CATEGORY_CONFIG — they should both import from here
 * and drop their local copies.
 */
export const CATEGORY_CONFIG = Object.freeze({
  'Live Music':            { color: '#FF6B35', emoji: '🎵' },
  'DJ/Dance Party':        { color: '#8B5CF6', emoji: '🎧' },
  'Comedy':                { color: '#F472B6', emoji: '🎤' },
  'Trivia':                { color: '#A855F7', emoji: '❓' },
  'Karaoke':               { color: '#EC4899', emoji: '🎙️' },
  'Food & Drink Special':  { color: '#F59E0B', emoji: '🍹' },
  'Sports / Watch Party':  { color: '#3B82F6', emoji: '🏈' },
  'Community':             { color: '#10B981', emoji: '🤝' },
  'Other / Special Event': { color: '#6B7280', emoji: '⭐' },
});

export const DEFAULT_CONFIG = { color: '#6B7280', emoji: '⭐' };

/**
 * Normalization map — every historical / synonym variant we've seen in
 * the wild, lower-cased, mapped to its canonical key. When you see a new
 * variant produced by a scraper or admin form, ADD a row here rather than
 * silently letting it through.
 *
 * Keys are lower-case for case-insensitive lookup.
 */
const NORMALIZE_MAP = Object.freeze({
  // Live Music
  'live music': 'Live Music',
  'music': 'Live Music',
  'concert': 'Live Music',
  'show': 'Live Music',

  // DJ / Dance Party
  'dj/dance party': 'DJ/Dance Party',
  'dj / dance party': 'DJ/Dance Party',
  'dj': 'DJ/Dance Party',
  'dance party': 'DJ/Dance Party',
  'club night': 'DJ/Dance Party',

  // Comedy
  'comedy': 'Comedy',
  'stand up': 'Comedy',
  'stand-up': 'Comedy',
  'comedy show': 'Comedy',

  // Trivia
  'trivia': 'Trivia',
  'trivia & games': 'Trivia',
  'trivia/games': 'Trivia',
  'trivia / games': 'Trivia',
  'quiz': 'Trivia',
  'quiz night': 'Trivia',
  'bingo': 'Trivia',

  // Karaoke
  'karaoke': 'Karaoke',

  // Food & Drink Special
  'food & drink special': 'Food & Drink Special',
  'food & drink': 'Food & Drink Special',
  'food and drink': 'Food & Drink Special',
  'food and drink special': 'Food & Drink Special',
  'drink/food special': 'Food & Drink Special',
  'drink / food special': 'Food & Drink Special',
  'drink and food special': 'Food & Drink Special',
  'happy hour': 'Food & Drink Special',
  'happy hours': 'Food & Drink Special',
  'daily special': 'Food & Drink Special',
  'daily specials': 'Food & Drink Special',
  'food special': 'Food & Drink Special',
  'drink special': 'Food & Drink Special',

  // Sports / Watch Party
  'sports / watch party': 'Sports / Watch Party',
  'sports/watch party': 'Sports / Watch Party',
  'sports': 'Sports / Watch Party',
  'watch party': 'Sports / Watch Party',
  'game day': 'Sports / Watch Party',

  // Community
  'community': 'Community',
  'community event': 'Community',
  'fundraiser': 'Community',
  'market': 'Community',

  // Other / Special Event
  'other / special event': 'Other / Special Event',
  'other/special event': 'Other / Special Event',
  'other': 'Other / Special Event',
  'special event': 'Other / Special Event',
  'misc': 'Other / Special Event',
});

/**
 * Coerce any input string to a canonical category, or return null if we
 * don't recognize it. Returns null (NOT the default) for unknown inputs
 * so callers can decide whether to fall back to a default, flag for review,
 * or reject the write. Trims and lower-cases before lookup.
 *
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeCategory(input) {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  // Already canonical? Fast-path.
  if (CATEGORY_SET.has(trimmed)) return trimmed;
  // Try the lower-cased map.
  return NORMALIZE_MAP[trimmed.toLowerCase()] || null;
}

/**
 * Strict membership check — true iff input EXACTLY matches a canonical key
 * (case-sensitive, no trim). Use this for invariant checks; use
 * normalizeCategory for incoming data coercion.
 */
export function isCanonical(input) {
  return typeof input === 'string' && CATEGORY_SET.has(input);
}
