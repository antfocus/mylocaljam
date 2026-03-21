/**
 * Last.fm Artist Enrichment
 *
 * Looks up artist info (bio, image, tags) from Last.fm and caches results
 * in the `artists` Supabase table to avoid repeat API calls.
 *
 * Required env var: LASTFM_API_KEY
 * Get a free key at: https://www.last.fm/api/account/create
 *
 * Last.fm API docs: https://www.last.fm/api/show/artist.getInfo
 */

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

// How long to consider a cached artist "fresh" (7 days)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Strip HTML tags and the "Read more" link Last.fm appends to bios.
 */
function cleanBio(raw) {
  if (!raw) return null;
  let cleaned = raw
    .replace(/<a[^>]*>.*?<\/a>/gi, '') // remove anchor links (incl. "Read more")
    .replace(/<[^>]+>/g, '')            // strip remaining HTML
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim()
    || null;
  if (!cleaned) return null;
  // Reject Last.fm disambiguation pages and garbage bios
  const lower = cleaned.toLowerCase();
  if (lower.startsWith('there are numerous artists')
    || lower.startsWith('there are multiple artists')
    || lower.startsWith('there are several artists')
    || lower.includes('artists with this name')) {
    return null;
  }
  // Cap bio at 300 chars — truncate at last sentence boundary
  if (cleaned.length > 300) {
    const truncated = cleaned.substring(0, 300);
    const lastPeriod = truncated.lastIndexOf('.');
    cleaned = lastPeriod > 100 ? truncated.substring(0, lastPeriod + 1) : truncated + '…';
  }
  return cleaned;
}

/**
 * Pick the best available image from Last.fm's image array.
 * Returns null if no valid (non-placeholder) URL is found.
 */
function bestImage(images) {
  if (!Array.isArray(images)) return null;
  // Prefer large → extralarge → medium → small
  const sizeOrder = ['extralarge', 'large', 'medium', 'small'];
  for (const size of sizeOrder) {
    const img = images.find(i => i.size === size);
    if (img?.['#text'] && !img['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
      // The hash above is Last.fm's placeholder "no image" URL — skip it
      return img['#text'];
    }
  }
  return null;
}

/**
 * Fetch artist info from Last.fm API.
 * Returns { name, image_url, bio, tags } or null on failure.
 */
async function fetchFromLastfm(artistName) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.warn('[enrichLastfm] LASTFM_API_KEY not set — skipping enrichment');
    return null;
  }

  const url =
    `${LASTFM_BASE}?method=artist.getinfo` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&api_key=${apiKey}` +
    `&format=json` +
    `&autocorrect=1`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MyLocalJam/1.0 (mylocaljam.com)' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    if (json.error || !json.artist) return null;

    const a = json.artist;

    return {
      name: a.name || artistName,
      image_url: bestImage(a.image),
      bio: cleanBio(a.bio?.content || a.bio?.summary),
      tags: (a.tags?.tag || []).map(t => t.name).join(',') || null,
    };
  } catch {
    return null;
  }
}

/**
 * Main enrichment function.
 *
 * Checks the `artists` Supabase cache first; fetches from Last.fm only when
 * the artist is missing or the cache is stale (>7 days old).
 *
 * @param {string}  artistName  The artist/band name to look up
 * @param {object}  supabase    An initialised Supabase client
 * @returns {object|null}  { name, image_url, bio, tags } or null
 */
export async function enrichWithLastfm(artistName, supabase, { blacklist } = {}) {
  if (!artistName?.trim()) return null;

  const name = artistName.trim();

  // Check blacklist — never create profiles for deleted/ignored artists
  if (blacklist && blacklist.has(name.toLowerCase())) return null;

  // --- 1. Check cache (primary name OR alias) ---
  let cached = null;

  // First: exact name match in artists table
  const { data: directMatch } = await supabase
    .from('artists')
    .select('*')
    .ilike('name', name)
    .single();

  if (directMatch) {
    cached = directMatch;
  } else {
    // Second: check artist_aliases for a known alias → master artist
    try {
      const { data: aliasMatch } = await supabase
        .from('artist_aliases')
        .select('artist_id')
        .eq('alias_lower', name.toLowerCase().trim())
        .single();

      if (aliasMatch?.artist_id) {
        const { data: master } = await supabase
          .from('artists')
          .select('*')
          .eq('id', aliasMatch.artist_id)
          .single();
        if (master) cached = master;
      }
    } catch { /* artist_aliases table may not exist yet */ }
  }

  if (cached) {
    const age = Date.now() - new Date(cached.last_fetched || 0).getTime();
    if (age < CACHE_TTL_MS) return cached; // still fresh
  }

  // --- 2. Fetch from Last.fm ---
  const fresh = await fetchFromLastfm(name);

  // Cache the result even if Last.fm returned nothing ("not found").
  // This prevents re-querying the same unknown local band every run.
  // Convert Last.fm tags to genres array (top 3, capitalized)
  const genresFromTags = fresh?.tags
    ? fresh.tags.split(',').slice(0, 3).map(t => t.trim()).filter(Boolean)
        .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    : null;

  const record = {
    name: fresh?.name || name,
    image_url: fresh?.image_url || null,
    bio: fresh?.bio || null,
    tags: fresh?.tags || null,
    last_fetched: new Date().toISOString(),
  };

  // Only set genres from Last.fm tags if the artist doesn't already have curated genres
  if (genresFromTags && genresFromTags.length > 0) {
    if (!cached?.genres || cached.genres.length === 0) {
      record.genres = genresFromTags;
    }
  }

  // --- 3. Upsert into artists cache ---
  await supabase
    .from('artists')
    .upsert(record, { onConflict: 'name' });

  // Return the record (may have null fields if artist wasn't found)
  return record;
}

/**
 * Batch-enrich a list of unique artist names.
 * Returns a map: { "Artist Name" → { image_url, bio, tags } }
 *
 * Adds a small delay between calls to avoid hammering the Last.fm API.
 */
export async function batchEnrichArtists(artistNames, supabase, { delayMs = 250 } = {}) {
  const results = {};
  const unique = [...new Set(artistNames.map(n => n?.trim()).filter(Boolean))];

  for (const name of unique) {
    results[name] = await enrichWithLastfm(name, supabase);
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  return results;
}
