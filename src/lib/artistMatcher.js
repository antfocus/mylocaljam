/**
 * Smart Match — resolve a free-text artist string to a canonical artists row.
 *
 * Looks for an artist whose `name` matches (case-insensitive, trimmed) OR whose
 * `alias_names` array contains the input. Returns the single best match, or
 * null. Uses the GIN index on `alias_names` for O(log n) lookups at scale.
 *
 * This is the learning-system lookup: once an admin links a ghost event to
 * a canonical artist (appending the ghost name to alias_names), this matcher
 * will auto-resolve that string on every future sync.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * USAGE (server-side — Node, Supabase admin client):
 *   import { findArtistByNameOrAlias } from '@/lib/artistMatcher';
 *   const match = await findArtistByNameOrAlias(supabase, 'The Jukes');
 *   if (match) { event.artist_id = match.id; }
 *
 * USAGE (client-side — pass a pre-fetched artist pool, no network cost):
 *   import { matchArtistInPool } from '@/lib/artistMatcher';
 *   const match = matchArtistInPool(artists, 'the jukes');
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Normalize for comparison. Lowercase + trim + collapse internal whitespace.
 * NOT a fuzzy matcher — exact string equality after normalization.
 */
export function normalize(s) {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Server-side: query Supabase for an artist matching `input` by name OR alias.
 *
 * Two-pass strategy (cheaper than a union):
 *   1. Exact-name ilike match (uses the standard index on artists.name).
 *   2. If no hit, array-containment on alias_names (uses the GIN index).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} input — raw artist_name string (e.g. from a ghost event).
 * @returns {Promise<{id: string, name: string, alias_names: string[]} | null>}
 */
export async function findArtistByNameOrAlias(supabase, input) {
  const needle = normalize(input);
  if (!needle) return null;

  // ── Pass 1: canonical name (case-insensitive)
  {
    const { data } = await supabase
      .from('artists')
      .select('id, name, alias_names')
      .ilike('name', needle)
      .limit(1);
    if (data && data.length > 0) return data[0];
  }

  // ── Pass 2: alias array containment (GIN index)
  //    Try the input with its original casing first (aliases are stored
  //    as the admin typed them), then a lowercased fallback.
  {
    const variants = [input.trim(), needle];
    for (const v of variants) {
      const { data } = await supabase
        .from('artists')
        .select('id, name, alias_names')
        .contains('alias_names', [v])
        .limit(1);
      if (data && data.length > 0) return data[0];
    }
  }

  return null;
}

/**
 * Client-side: match against a pre-fetched artists array (no network).
 * Use this when you already have the admin artists pool in memory.
 *
 * @param {Array<{id: string, name: string, alias_names?: string[]}>} pool
 * @param {string} input
 * @returns {Object | null}
 */
export function matchArtistInPool(pool, input) {
  const needle = normalize(input);
  if (!needle || !Array.isArray(pool)) return null;

  for (const a of pool) {
    if (normalize(a?.name) === needle) return a;
  }
  for (const a of pool) {
    const aliases = Array.isArray(a?.alias_names) ? a.alias_names : [];
    if (aliases.some(x => normalize(x) === needle)) return a;
  }
  return null;
}

/**
 * Should `ghostName` be appended as an alias on `targetArtist`?
 *
 * Returns true only when the ghost name is a meaningful new alias: not
 * empty, not already the canonical name, not already in alias_names.
 * Comparison is case-insensitive but the raw `ghostName` is what gets
 * stored (preserves the admin's visible casing).
 */
export function shouldAppendAlias(targetArtist, ghostName) {
  const ghost = (ghostName || '').trim();
  if (!ghost) return false;
  if (normalize(ghost) === normalize(targetArtist?.name)) return false;
  const existing = Array.isArray(targetArtist?.alias_names) ? targetArtist.alias_names : [];
  return !existing.some(x => normalize(x) === normalize(ghost));
}
