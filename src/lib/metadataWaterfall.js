/**
 * Metadata Waterfall — Provenance resolution for event fields.
 *
 * Four tiers, highest-to-lowest priority:
 *   1. override  — admin-entered custom_* value on the event row
 *   2. template  — value inherited from the linked event_template
 *   3. artist    — value inherited from the linked artist profile
 *   4. scraper   — raw scraper-populated field on the event row (legacy)
 *
 * The top non-empty tier is the "active" layer shown in the UI and used
 * for all downstream rendering. `resolveTier` takes a `sources` object
 * with all four tiers and returns `{ tier, value }` of the top layer.
 *
 * Usage:
 *   const { tier, value } = resolveTier({
 *     override: form.custom_bio,
 *     template: event.event_templates?.bio,
 *     artist:   linkedArtist?.bio,
 *     scraper:  event.artist_bio,
 *   });
 *   // tier.label === 'Admin Override' | 'Inherited: Template' | ...
 */

export const TIERS = {
  override: {
    key: 'override',
    label: 'Admin Override',
    color: '#E8722A',
    bg: 'rgba(232,114,42,0.12)',
    border: 'rgba(232,114,42,0.30)',
  },
  template: {
    key: 'template',
    label: 'Inherited: Template',
    color: '#60A5FA',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.30)',
  },
  artist: {
    key: 'artist',
    label: 'Inherited: Artist Profile',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.12)',
    border: 'rgba(167,139,250,0.30)',
  },
  scraper: {
    key: 'scraper',
    label: 'Raw Scraper Data',
    color: '#9CA3AF',
    bg: 'rgba(156,163,175,0.10)',
    border: 'rgba(156,163,175,0.25)',
  },
  empty: {
    key: 'empty',
    label: 'No Data',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.20)',
  },
};

const hasText  = v => typeof v === 'string' && v.trim().length > 0;
const hasArray = v => Array.isArray(v) && v.length > 0;

/**
 * Walk the waterfall top-down and return the first non-empty tier.
 * @param {object} sources - { override, template, artist, scraper }
 * @param {'text'|'array'} type - how to decide "non-empty"
 * @returns {{ tier: object, value: any }}
 */
export function resolveTier(sources = {}, type = 'text') {
  const isFilled = type === 'array' ? hasArray : hasText;
  if (isFilled(sources.override)) return { tier: TIERS.override, value: sources.override };
  if (isFilled(sources.template)) return { tier: TIERS.template, value: sources.template };
  if (isFilled(sources.artist))   return { tier: TIERS.artist,   value: sources.artist };
  if (isFilled(sources.scraper))  return { tier: TIERS.scraper,  value: sources.scraper };
  return { tier: TIERS.empty, value: type === 'array' ? [] : '' };
}

/**
 * Return the "parent" tier value — i.e. the value that would be shown
 * if the override were cleared. Useful for seeding the override field
 * on click-in so the user edits rather than retypes.
 */
export function parentTierValue(sources = {}, type = 'text') {
  const isFilled = type === 'array' ? hasArray : hasText;
  if (isFilled(sources.template)) return sources.template;
  if (isFilled(sources.artist))   return sources.artist;
  if (isFilled(sources.scraper))  return sources.scraper;
  return type === 'array' ? [] : '';
}
