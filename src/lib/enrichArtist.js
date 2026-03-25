/**
 * Universal Artist Enrichment Pipeline
 *
 * The single entry point for ALL artist data enrichment across the platform.
 * Triggered whenever a new artist row is created from any source:
 * scrapers, OCR, admin entries, or user submissions.
 *
 * Pipeline:
 *   1. MusicBrainz  → MBID identity + relations (image URLs)
 *   2. Discogs       → Artist image fallback (when MusicBrainz has none)
 *   3. Last.fm       → Biography, genre tags
 *
 * Respects the Manual Lock: if is_locked or is_human_edited fields are set,
 * those fields are NEVER overwritten.
 *
 * Rate limits:
 *   - MusicBrainz: 1 req/sec, User-Agent required
 *   - Discogs: 60 req/min with token
 *   - Last.fm: 5 req/sec (effectively unlimited for our scale)
 *
 * Required env vars: LASTFM_API_KEY, DISCOGS_TOKEN (optional)
 */

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_USER_AGENT = 'MyLocalJam/1.0.0 (antemail@gmail.com)';
const DISCOGS_BASE = 'https://api.discogs.com';
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN || 'cOcmOipnhRjrBntDWBTnUVKGgTLaqxYJGOQVbmsp';
const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

// Cache TTL — skip re-enriching artists looked up within 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── MusicBrainz ─────────────────────────────────────────────

/**
 * Search MusicBrainz for an artist MBID.
 * Returns { mbid, name, disambiguation } or null.
 */
async function fetchMusicBrainzId(artistName) {
  try {
    const url = `${MB_BASE}/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=3`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const artists = data.artists || [];
    if (artists.length === 0) return null;

    // Prefer exact name match (case-insensitive)
    const exact = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
    const best = exact || artists[0];
    if (best.score < 80) return null; // Low confidence — skip

    return {
      mbid: best.id,
      name: best.name,
      disambiguation: best.disambiguation || null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch artist image URL from MusicBrainz relationships.
 * MusicBrainz doesn't host images directly — we look for URL relations
 * pointing to image sources (Wikidata, official sites, etc).
 * Returns an image URL string or null.
 */
async function fetchMusicBrainzImage(mbid) {
  if (!mbid) return null;
  try {
    const url = `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const relations = data.relations || [];
    // Look for image relation types
    const imageRel = relations.find(r =>
      r.type === 'image' && r.url?.resource
    );
    if (imageRel?.url?.resource) return imageRel.url.resource;

    // Fallback: look for a Wikimedia Commons image via Wikidata relation
    // (This would require a second API call to Wikidata, so we skip for now
    //  and fall through to Discogs)
    return null;
  } catch {
    return null;
  }
}

// ─── Discogs ─────────────────────────────────────────────────

/**
 * Search Discogs for an artist image.
 * Returns the primary image URL or null.
 */
async function fetchDiscogsImage(artistName) {
  try {
    const searchUrl = `${DISCOGS_BASE}/database/search?q=${encodeURIComponent(artistName)}&type=artist&per_page=3&token=${DISCOGS_TOKEN}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': MB_USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return null;

    // Prefer exact name match
    const exact = results.find(r => r.title?.toLowerCase() === artistName.toLowerCase());
    const best = exact || results[0];

    // The search endpoint returns a cover_image or thumb
    if (best.cover_image && !best.cover_image.includes('spacer.gif')) {
      return best.cover_image;
    }

    // If search result has a resource_url, fetch the full artist profile for images
    if (best.resource_url) {
      const artistRes = await fetch(`${best.resource_url}?token=${DISCOGS_TOKEN}`, {
        headers: { 'User-Agent': MB_USER_AGENT },
      });
      if (artistRes.ok) {
        const artistData = await artistRes.json();
        const images = artistData.images || [];
        const primary = images.find(i => i.type === 'primary') || images[0];
        if (primary?.uri && !primary.uri.includes('spacer.gif')) {
          return primary.uri;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Last.fm ─────────────────────────────────────────────────

/**
 * Strip HTML and clean Last.fm bio text.
 */
function cleanBio(raw) {
  if (!raw) return null;
  let cleaned = raw
    .replace(/<a[^>]*>.*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower.startsWith('there are numerous artists')
    || lower.startsWith('there are multiple artists')
    || lower.startsWith('there are several artists')
    || lower.includes('artists with this name')) {
    return null;
  }
  if (cleaned.length > 300) {
    const truncated = cleaned.substring(0, 300);
    const lastPeriod = truncated.lastIndexOf('.');
    cleaned = lastPeriod > 100 ? truncated.substring(0, lastPeriod + 1) : truncated + '…';
  }
  return cleaned;
}

/**
 * Fetch bio, tags, and image from Last.fm.
 */
async function fetchFromLastfm(artistName) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${LASTFM_BASE}?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json&autocorrect=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MB_USER_AGENT },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error || !json.artist) return null;

    const a = json.artist;
    const sizeOrder = ['extralarge', 'large', 'medium', 'small'];
    let imageUrl = null;
    for (const size of sizeOrder) {
      const img = (a.image || []).find(i => i.size === size);
      if (img?.['#text'] && !img['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
        imageUrl = img['#text'];
        break;
      }
    }

    return {
      name: a.name || artistName,
      image_url: imageUrl,
      bio: cleanBio(a.bio?.content || a.bio?.summary),
      tags: (a.tags?.tag || []).map(t => t.name).join(',') || null,
    };
  } catch {
    return null;
  }
}

// ─── Universal Enrichment Pipeline ───────────────────────────

/**
 * The Universal Enrichment Hook.
 *
 * Call this whenever a new artist appears from ANY source.
 * Respects locked fields and existing high-quality data.
 *
 * @param {string} artistName - The artist/band name
 * @param {object} supabase   - Initialised Supabase admin client
 * @param {object} opts
 * @param {Set}    opts.blacklist - Names to skip (deleted artists)
 * @returns {object|null} The enriched artist record
 */
export async function enrichArtist(artistName, supabase, { blacklist } = {}) {
  if (!artistName?.trim()) return null;
  const name = artistName.trim();

  // Blacklist check
  if (blacklist?.has(name.toLowerCase())) return null;

  // ── 0. Check cache ─────────────────────────────────────────
  let cached = null;

  const { data: directMatch } = await supabase
    .from('artists')
    .select('*')
    .ilike('name', name)
    .single();

  if (directMatch) {
    cached = directMatch;
  } else {
    // Check aliases
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
    } catch { /* aliases table may not exist */ }
  }

  // Locked artist — never touch
  if (cached?.is_locked) return cached;

  // Determine which fields are locked (human-edited)
  const locks = cached?.is_human_edited || {};
  const bioLocked = !!locks.bio;
  const imageLocked = !!locks.image_url;

  // Fresh cache — skip enrichment
  if (cached?.bio && cached?.image_url) {
    const age = Date.now() - new Date(cached.last_fetched || 0).getTime();
    if (age < CACHE_TTL_MS) return cached;
  }

  // ── 1. MusicBrainz: Identity (MBID) ───────────────────────
  let mbid = cached?.mbid || null;
  if (!mbid) {
    const mbResult = await fetchMusicBrainzId(name);
    if (mbResult?.mbid) {
      mbid = mbResult.mbid;
    }
    // Rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100));
  }

  // ── 2. Image: MusicBrainz → Discogs → Last.fm fallback ────
  let imageUrl = cached?.image_url || null;
  if (!imageUrl && !imageLocked) {
    // Try MusicBrainz relations first
    if (mbid) {
      imageUrl = await fetchMusicBrainzImage(mbid);
      await new Promise(r => setTimeout(r, 1100)); // MB rate limit
    }

    // Discogs fallback
    if (!imageUrl) {
      imageUrl = await fetchDiscogsImage(name);
      await new Promise(r => setTimeout(r, 1100)); // Be polite to Discogs
    }
  }

  // ── 3. Last.fm: Bio + Tags + Image fallback ───────────────
  const lastfm = await fetchFromLastfm(name);

  // Use Last.fm image only if we still have nothing
  if (!imageUrl && !imageLocked && lastfm?.image_url) {
    imageUrl = lastfm.image_url;
  }

  const bio = (!bioLocked && !cached?.bio) ? (lastfm?.bio || null) : (cached?.bio || null);
  const tags = lastfm?.tags || cached?.tags || null;

  // Convert tags → genres (top 3, capitalized)
  const genresFromTags = tags
    ? tags.split(',').slice(0, 3).map(t => t.trim()).filter(Boolean)
        .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    : null;

  // ── 4. Determine metadata source ──────────────────────────
  let metadataSource = cached?.metadata_source || null;
  if (!metadataSource) {
    if (imageUrl && (imageUrl.includes('discogs') || imageUrl.includes('musicbrainz'))) {
      metadataSource = 'scraper'; // External API source
    } else if (lastfm?.bio || lastfm?.image_url) {
      metadataSource = 'lastfm';
    }
  }

  // ── 5. Build record & upsert ──────────────────────────────
  const record = {
    name: lastfm?.name || cached?.name || name,
    ...(mbid ? { mbid } : {}),
    // Respect locks — only set fields that aren't human-edited
    ...(!imageLocked ? { image_url: imageUrl || cached?.image_url || null } : {}),
    ...(!bioLocked ? { bio: bio || null } : {}),
    tags: tags || null,
    last_fetched: new Date().toISOString(),
    ...(metadataSource ? { metadata_source: metadataSource } : {}),
  };

  // Only set genres if artist doesn't already have curated ones
  if (genresFromTags?.length > 0 && (!cached?.genres || cached.genres.length === 0)) {
    record.genres = genresFromTags;
  }

  await supabase
    .from('artists')
    .upsert(record, { onConflict: 'name' });

  return { ...cached, ...record };
}

/**
 * Batch-enrich multiple artists with rate limiting.
 */
export async function batchEnrichArtists(artistNames, supabase, { delayMs = 300, blacklist } = {}) {
  const results = {};
  const unique = [...new Set(artistNames.map(n => n?.trim()).filter(Boolean))];

  for (const name of unique) {
    results[name] = await enrichArtist(name, supabase, { blacklist });
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  return results;
}
