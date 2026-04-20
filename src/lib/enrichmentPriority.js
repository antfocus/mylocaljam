/**
 * Enrichment Priority Scoring
 *
 * Ranks unenriched artists by urgency for the backfill pipeline.
 * Priority factors:
 *   1. Day-of-week proximity — Thu–Sun events score highest (when people go out)
 *   2. Completeness — bare artists (no bio AND no image) rank above partial
 *   3. Soonest show date — events happening sooner get priority
 *   4. Artist-level dedup — one artist playing 4 venues = 1 enrichment call
 *
 * Returns a ranked list of artist names with their priority scores,
 * ready for the backfill endpoint to process in batches.
 *
 * EXCLUSION RULES (added 2026-04-20):
 *   - default_category ∈ {Trivia, Karaoke, Comedy, Food & Drink, Sports, Other}
 *     → these are events, not artists. Skip entirely.
 *   - field_status.bio === 'no_data' → AI already tried and failed. Don't retry.
 *   - field_status.image_url === 'no_data' → same, for images.
 *   The 'DJ/Dance Party' category is NOT skipped — DJs are artists.
 */

import { createClient } from '@supabase/supabase-js';

// Categories that are event-types, not artist-types. Rows tagged with these
// should not be fed to the AI enrichment loop — bios and images for them
// would either be fabricated or come from event templates instead.
const EVENT_ONLY_CATEGORIES = new Set([
  'Trivia',
  'Karaoke',
  'Comedy',
  'Food & Drink',
  'Sports',
  'Other',
]);

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Fetch unenriched artists ranked by priority.
 *
 * The query:
 *   1. Joins events → artists on artist_id (or fuzzy name match)
 *   2. Filters to future events only
 *   3. Filters to artists missing bio OR image_url
 *   4. Scores by day-of-week + completeness + recency
 *   5. Deduplicates at artist level (GROUP BY)
 *   6. Returns top N by priority score
 *
 * @param {object} [options]
 * @param {number} [options.limit=50] - Max artists to return
 * @param {boolean} [options.bareOnly=false] - Only completely bare artists (no bio AND no image)
 * @returns {Promise<Array<{ artist_name, artist_id, priority_score, soonest_date, missing_fields }>>}
 */
export async function fetchPrioritizedArtists({ limit = 50, bareOnly = false } = {}) {
  const supabase = getSupabase();

  // Use raw SQL via RPC for the complex priority scoring query.
  // This runs as a Postgres function we call via supabase.rpc().
  // But since we may not have an RPC function deployed, we'll use
  // the REST API with post-processing instead.

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Step 1: Get all future events with their artist info
  const { data: events, error } = await supabase
    .from('events')
    .select('id, artist_name, artist_id, event_date, venue_name')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(500);

  if (error) {
    console.error('[EnrichmentPriority] Events query error:', error.message);
    return [];
  }

  if (!events?.length) return [];

  // Step 2: Get all artist IDs referenced by these events
  const artistIds = [...new Set(events.filter(e => e.artist_id).map(e => e.artist_id))];
  const artistNames = [...new Set(events.filter(e => e.artist_name).map(e => e.artist_name.trim().toLowerCase()))];

  // Fetch existing artist records
  let existingArtists = new Map();
  if (artistIds.length > 0) {
    // Batch in chunks of 100 to avoid URL length limits
    for (let i = 0; i < artistIds.length; i += 100) {
      const chunk = artistIds.slice(i, i + 100);
      const { data: artists } = await supabase
        .from('artists')
        .select('id, name, bio, image_url, genres, is_human_edited, is_locked, last_fetched, default_category, field_status')
        .in('id', chunk);

      if (artists) {
        for (const a of artists) {
          existingArtists.set(a.id, a);
        }
      }
    }
  }

  // Step 3: Score and deduplicate at artist level
  const artistScores = new Map(); // key: normalized name → score object

  for (const event of events) {
    const name = (event.artist_name || '').trim();
    if (!name) continue;

    const normalizedName = name.toLowerCase();
    const artist = event.artist_id ? existingArtists.get(event.artist_id) : null;

    // Skip locked artists — human has taken ownership
    if (artist?.is_locked) continue;
    if (artist?.is_human_edited === true) continue; // boolean lock = entire row frozen

    // Skip event-category rows (Trivia / Karaoke / Comedy / etc). These are
    // not artists even though they live in the artists table — they got swept
    // in by the scraper ingesting event titles. Their bios come from event
    // templates, not AI per-artist enrichment. 'DJ/Dance Party' is NOT in
    // this list — DJs are artists and deserve bios.
    if (artist?.default_category && EVENT_ONLY_CATEGORIES.has(artist.default_category)) continue;

    // Determine what's missing. A 'no_data' sentinel in field_status means
    // the AI has already been asked for this field and came back empty — we
    // treat that as "effectively has data" for priority purposes so we don't
    // re-ask on every batch.
    const fieldStatus = artist?.field_status || {};
    const bioExhausted = fieldStatus.bio === 'no_data';
    const imageExhausted = fieldStatus.image_url === 'no_data';
    const hasBio = !!(artist?.bio) || bioExhausted;
    const hasImage = !!(artist?.image_url) || imageExhausted;

    // If fully enriched (or both fields exhausted by prior attempts), skip
    if (hasBio && hasImage) continue;

    // If bareOnly mode, skip partial enrichment
    if (bareOnly && (hasBio || hasImage)) continue;

    // Calculate priority score
    const eventDate = new Date(event.event_date + 'T12:00:00-04:00');
    const dayOfWeek = eventDate.getDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat

    // Day-of-week weight: Thu-Sun get bonus (these are the nights people go out)
    const dayWeight = (dayOfWeek >= 4 || dayOfWeek === 0) ? 2.0 : 1.0;

    // Completeness weight: completely bare = higher priority
    const completenessWeight = (!hasBio && !hasImage) ? 2.0 : 1.0;

    // Recency weight: events sooner get higher priority (inverse days-away)
    const daysAway = Math.max(1, Math.ceil((eventDate - new Date()) / (1000 * 60 * 60 * 24)));
    const recencyWeight = Math.max(0.1, 10 / daysAway); // Caps at 10 for tomorrow's events

    const score = dayWeight * completenessWeight * recencyWeight;

    // Deduplicate: keep highest score per artist
    const existing = artistScores.get(normalizedName);
    if (!existing || score > existing.priority_score) {
      const missingFields = [];
      if (!hasBio) missingFields.push('bio');
      if (!hasImage) missingFields.push('image_url');

      artistScores.set(normalizedName, {
        artist_name: name,
        artist_id: event.artist_id || null,
        priority_score: score,
        soonest_date: event.event_date,
        venue_name: event.venue_name,
        missing_fields: missingFields,
      });
    }
  }

  // Step 4: Sort by priority score descending, return top N
  const ranked = [...artistScores.values()]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, limit);

  console.log(`[EnrichmentPriority] Scored ${artistScores.size} unenriched artists, returning top ${ranked.length}`);
  return ranked;
}
