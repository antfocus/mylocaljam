/**
 * POST /api/admin/enrich-date  (admin only)
 * Body: { date: 'YYYY-MM-DD' }
 *
 * The "Magic Wand" bulk enrichment endpoint. Given a calendar date, it:
 *   1. Finds every published event on that date (Eastern-aware bounds).
 *   2. Filters to events that are MISSING bio or image AND are NOT locked
 *      (is_human_edited=true or is_locked=true). Admin-protected rows are
 *      never touched.
 *   3. For each unique artist in that candidate set, calls the strict
 *      `aiLookupArtist` helper (src/lib/aiLookup.js) with `venue` + `city`
 *      context drawn from the FIRST candidate event we see for that artist.
 *      The helper uses Perplexity sonar-pro under the strict 2026-04-15
 *      prompt contract (500-char max, neutral tone, no hype, no venue/tour
 *      history), then Serper as an image fallback.
 *   4. Upserts the fresh data into the `artists` table AND copies the
 *      bio/image back onto each candidate event's denormalized columns,
 *      setting locks in both places:
 *        • `artists.is_human_edited` JSONB gets `{ bio: true, image_url: true }`
 *          for fields the AI filled — blocks future scraper overwrites.
 *        • `events.is_human_edited = true` (boolean) — blocks the
 *          twice-daily sync-events cron (see sync-events/route.js:501-506).
 *
 * Why the strict-helper pass is the right tool here (vs. the full waterfall):
 *   The full MusicBrainz → Discogs → Last.fm waterfall runs every time a
 *   scraper ingests a new event. If bios and images are still missing on
 *   the day's events, those databases don't have the artist — re-running
 *   them won't help. Magic Wand is the targeted "just use AI with venue
 *   context" tool; it's bounded, fast (~2s/artist), and expensive enough
 *   (Perplexity billing) that we want per-artist dedupe within a day.
 *
 * Returns:
 *   {
 *     ok: true,
 *     date,
 *     totalEvents,
 *     candidates,      // events considered (missing data + unlocked)
 *     lockedSkipped,   // events skipped because is_human_edited/is_locked
 *     uniqueArtists,
 *     artistsEnriched, // how many artists got any new data from the helper
 *     eventsUpdated,   // how many event rows we wrote fresh data onto
 *     errors?,
 *     duration,
 *   }
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';
import { aiLookupArtist } from '@/lib/aiLookup';
import { stripLockedFields } from '@/lib/writeGuards';

export const dynamic = 'force-dynamic';
// Long-running — the AI rung + rate-limited external APIs can easily push
// past the default Vercel hobby timeout. We don't set maxDuration here
// because it's a Pro-tier config; the caller should expect up to ~60s
// per 10 unique artists and batch accordingly via the ARTIST_LIMIT cap.
export const fetchCache = 'force-no-store';

const ARTIST_LIMIT = 40;              // hard cap per call; most days have <15 unique artists
const PERPLEXITY_THROTTLE_MS = 300;   // polite delay between AI calls

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * Extract a city name from a venue address string.
 * Handles the common "street, city, state zip" pattern used by our venues
 * table. Returns null if we can't confidently pull a city.
 *
 * Examples that parse correctly:
 *   "1200 Ocean Ave, Asbury Park, NJ 07712"  → "Asbury Park"
 *   "17 Mechanic St, Red Bank, NJ"           → "Red Bank"
 *   "Asbury Park, NJ"                        → "Asbury Park"
 *
 * Examples that return null (too ambiguous):
 *   "NJ"                                     → null
 *   ""                                       → null
 */
function extractCity(address) {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  // Walk backwards, skipping state codes / zip / country.
  // Most addresses end with "State ZIP" or just "State"; the part before
  // that is the city.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (/^(NJ|NY|PA|CT|DE|MD|US|USA|United States)(\s+\d{5}(-\d{4})?)?$/i.test(p)) continue;
    if (/^\d{5}(-\d{4})?$/.test(p)) continue;
    // Skip street-number-looking first parts ("1200 Ocean Ave")
    if (i === 0 && /^\d+\s/.test(p)) continue;
    return p;
  }
  return null;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json(
      { error: 'PERPLEXITY_API_KEY not configured — Magic Wand is disabled' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { date } = body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 });
  }

  const start = Date.now();
  const supabase = getAdminClient();
  const { start: dateStart, end: dateEnd } = getEasternDayBounds(date);

  // ── 1. Pull every published event on this Eastern calendar day ────────
  // We include venue_name + venues(address) so we can thread "venue" and
  // "city" into the AI helper's prompt. We also pull the artist join so we
  // can detect "bio already present on the linked artist row" as non-missing.
  const { data: events, error: fetchErr } = await supabase
    .from('events')
    .select(`
      id, artist_id, artist_name, event_title, venue_name,
      event_image, image_url, artist_bio,
      is_human_edited, is_locked,
      venues(name, address),
      artists(id, name, bio, image_url, is_human_edited)
    `)
    .eq('status', 'published')
    .gte('event_date', dateStart)
    .lte('event_date', dateEnd);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!events?.length) {
    return NextResponse.json({
      ok: true,
      date,
      totalEvents: 0,
      candidates: 0,
      lockedSkipped: 0,
      uniqueArtists: 0,
      artistsEnriched: 0,
      eventsUpdated: 0,
      duration: '0s',
    });
  }

  // ── 2. Partition events into candidates vs locked vs already-full ─────
  // A candidate is MISSING at least one of { event_image|image_url, bio }
  // AND is not locked at the row level.
  //
  // Why we check BOTH event.image_url AND event.event_image: legacy columns.
  // Some older rows denormalize onto `image_url`; newer code writes to
  // `event_image`. The waterfall reads both; we consider either sufficient.
  //
  // Similarly, bio can live on `event.artist_bio` OR inherit from the
  // linked `artists.bio` — if either is populated, the admin has a bio to
  // display, so we don't mark the event as a candidate.
  const candidateEvents = [];
  let lockedSkipped = 0;

  for (const ev of events) {
    const isLockedRow = ev.is_human_edited === true || ev.is_locked === true;
    const hasImage = !!(ev.event_image || ev.image_url || ev.artists?.image_url);
    const hasBio = !!(ev.artist_bio || ev.artists?.bio);
    const isMissing = !hasImage || !hasBio;

    if (!isMissing) continue;
    if (isLockedRow) { lockedSkipped++; continue; }

    candidateEvents.push(ev);
  }

  if (candidateEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      date,
      totalEvents: events.length,
      candidates: 0,
      lockedSkipped,
      uniqueArtists: 0,
      artistsEnriched: 0,
      eventsUpdated: 0,
      duration: ((Date.now() - start) / 1000).toFixed(2) + 's',
    });
  }

  // ── 3. Load blacklist so we never re-enrich a deleted/ignored artist ─
  let blacklistedNames = new Set();
  try {
    const { data: bl } = await supabase
      .from('ignored_artists')
      .select('name_lower')
      .limit(5000);
    blacklistedNames = new Set((bl || []).map(b => b.name_lower));
  } catch { /* table may not exist */ }

  // ── 4. Group candidates by lowercased artist name ─────────────────────
  // Keep the FIRST event's venue + derived city as the research context for
  // that artist — if the same band plays multiple venues on the same day,
  // we still only Perplexity-hit them once (using whichever venue we saw
  // first). The same AI result is then applied to every candidate event
  // with that artist_name.
  const byArtist = new Map();  // name_lower → { name, venue, city, events: [] }
  for (const ev of candidateEvents) {
    const raw = ev.artist_name?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (blacklistedNames.has(key)) continue;

    if (!byArtist.has(key)) {
      const venueName = ev.venues?.name || ev.venue_name || null;
      const city = extractCity(ev.venues?.address);
      byArtist.set(key, { name: raw, venue: venueName, city, events: [] });
    }
    byArtist.get(key).events.push(ev);
  }

  // Cap at ARTIST_LIMIT unique artists per call — guards against accidentally
  // triggering Perplexity billing on a freakishly large day.
  const artists = Array.from(byArtist.values()).slice(0, ARTIST_LIMIT);
  const uniqueArtists = artists.length;

  // ── 5. Run each artist through the strict AI helper ───────────────────
  let artistsEnriched = 0;
  let eventsUpdated = 0;
  const errors = [];

  for (const art of artists) {
    const ai = await aiLookupArtist({
      artistName: art.name,
      venue: art.venue,
      city: art.city,
      autoMode: true,
    });

    // Polite delay between Perplexity calls — even with per-day dedupe we
    // want to avoid burst-rate-limit on the sonar-pro endpoint.
    await new Promise(r => setTimeout(r, PERPLEXITY_THROTTLE_MS));

    if (!ai) continue;
    const gotBio = !!ai.bio;
    const gotImage = !!ai.image_url;
    if (!gotBio && !gotImage) continue;
    artistsEnriched++;

    // ── 5a. Upsert the artist row with per-field lock flags ─────────────
    // We only write fields we actually got — never overwrite existing data
    // with null. The `is_human_edited` JSONB is merged so other locks stay
    // intact; we only flip the keys for fields we just filled.
    //
    // NB: if the artists row already has `is_human_edited === true`
    // (boolean end-to-end lock), we leave it alone — the row is already
    // maximally locked, don't downgrade it to a per-field shape.
    let artistId = null;
    try {
      // Read current artist row (if any) so we can merge the JSONB lock map.
      const { data: existingArtist } = await supabase
        .from('artists')
        .select('id, name, bio, image_url, is_human_edited')
        .ilike('name', art.name)
        .maybeSingle();

      const artistUpdate = { name: existingArtist?.name || art.name };
      if (gotBio) {
        artistUpdate.bio = ai.bio;
        artistUpdate.bio_source = 'AI (Perplexity)';
      }
      if (gotImage) {
        artistUpdate.image_url = ai.image_url;
        artistUpdate.image_source = ai.image_source === 'perplexity'
          ? 'AI (Perplexity)'
          : 'AI (Serper)';
      }

      // Per-field lock flags — only if the existing shape isn't already
      // boolean-true (maximum lock).
      const existingLocks = existingArtist?.is_human_edited;
      if (existingLocks !== true) {
        const lockBase = (existingLocks && typeof existingLocks === 'object')
          ? { ...existingLocks }
          : {};
        if (gotBio) lockBase.bio = true;
        if (gotImage) lockBase.image_url = true;
        artistUpdate.is_human_edited = lockBase;
      }

      artistUpdate.last_fetched = new Date().toISOString();

      const { data: upserted } = await supabase
        .from('artists')
        .upsert(artistUpdate, { onConflict: 'name' })
        .select('id')
        .maybeSingle();

      artistId = upserted?.id || existingArtist?.id || null;
    } catch (err) {
      errors.push(`Artist "${art.name}" upsert: ${err?.message || err}`);
      // Don't abort — we can still write to the events below even if the
      // artist upsert flaked.
    }

    // ── 5b. Write enriched bio/image back to each candidate event + lock ─
    for (const ev of art.events) {
      const update = {};

      if (gotImage && !ev.event_image && !ev.image_url) {
        update.event_image = ai.image_url;
      }
      if (gotBio && !ev.artist_bio) {
        update.artist_bio = ai.bio;
      }
      // Link the FK if it wasn't set — lets the waterfall reach the full
      // artist profile on future reads without re-querying by name.
      if (!ev.artist_id && artistId) {
        update.artist_id = artistId;
      }

      if (Object.keys(update).length === 0) continue;

      // Final safety net: even though candidateEvents is already pre-filtered
      // to unlocked rows, run through stripLockedFields so a race (e.g. the
      // admin locked a field between query and write) can't slip through.
      const safeUpdate = stripLockedFields(ev, update);
      if (Object.keys(safeUpdate).length === 0) continue;

      // Promote the event to a locked row so the next scraper cron respects
      // this as admin intent. The scraper's split query at
      // sync-events/route.js:501-506 is:
      //   .or('is_human_edited.eq.true,is_locked.eq.true')
      // so flipping is_human_edited to true puts the row in the "protected"
      // bucket on the next sync-events run. The admin can still edit via
      // the normal admin UI; this flag only locks out automated writers.
      safeUpdate.is_human_edited = true;

      const { error: updateErr } = await supabase
        .from('events')
        .update(safeUpdate)
        .eq('id', ev.id);

      if (updateErr) {
        errors.push(`Event ${ev.id}: ${updateErr.message}`);
      } else {
        eventsUpdated++;
      }
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    date,
    totalEvents: events.length,
    candidates: candidateEvents.length,
    lockedSkipped,
    uniqueArtists,
    artistsEnriched,
    eventsUpdated,
    errors: errors.length ? errors : null,
    duration,
  });
}
