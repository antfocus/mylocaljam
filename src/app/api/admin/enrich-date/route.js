/**
 * POST /api/admin/enrich-date  (admin only)
 * Body: { date?: 'YYYY-MM-DD', eventId?: string, preview?: boolean }
 *   — exactly one of `date` or `eventId` is required.
 *   — `preview: true` requires `eventId` (dry-run is single-event only).
 *
 * The "Magic Wand" enrichment endpoint — Smart Fill edition. Supports two
 * input modes that share the same write-side invariants:
 *
 *   • `date` (bulk)   — walk every published event on that Eastern calendar
 *                       day and rescue any missing bios/images.
 *   • `eventId` (one) — targeted single-row Magic Wand triggered from the
 *                       ✨ button on a DraggableEventCard. Skips the day
 *                       bounds fetch and processes only that one row, but
 *                       runs identical partition + Classification Fork +
 *                       blank-only write logic. This is the "quick-action"
 *                       path the admin hits when a single card is still
 *                       yellow after a bulk run, or when they don't want
 *                       to burn Perplexity credits on the rest of the day.
 *
 * Preview mode (`preview: true`, eventId only):
 *   The "AI Image Search" button inside the Edit Event modal wants to
 *   populate the form's image field WITHOUT committing to the database —
 *   the operator reviews the resolved image in the Mobile Preview, then
 *   clicks the orange "Update Event" button to commit through the normal
 *   save path. In preview mode we run the entire single-event pipeline
 *   (candidate fetch, Force Rescue partition, blacklist bypass, byArtist
 *   grouping, aiLookupArtist + Classification Fork) but SHORT-CIRCUIT
 *   before the DB writes in steps 5a (artists upsert) and 5b (events
 *   update). The AI-resolved `image_url`, `bio`, and `kind` are echoed
 *   back in the response body for the client to populate form state.
 *   Nothing is persisted — is_human_edited is not flipped, the artists
 *   row is untouched, the events row is untouched.
 *
 * Given its inputs, this endpoint:
 *   1. Fetches the candidate event set (one row for eventId mode, the whole
 *      day for date mode).
 *   2. SMART FILL — filters to events missing bio OR image, INCLUDING rows
 *      that carry a stale `is_human_edited=true` lock. The old behavior
 *      skipped any locked row unconditionally, which stranded rows that
 *      had been falsely locked by the 7:12 PM bug on 2026-04-14 with blank
 *      bio/image columns and no way to auto-refill. Smart Fill's rule:
 *      a lock means "don't clobber what's there," not "skip rows that
 *      have nothing." We look at each writable field individually and
 *      only fill blanks.
 *   3. For each unique artist in that candidate set, calls the strict
 *      `aiLookupArtist` helper (src/lib/aiLookup.js) with `venue` + `city`
 *      context drawn from the FIRST candidate event we see for that artist.
 *      The helper uses Perplexity sonar-pro under the strict 2026-04-15
 *      prompt contract (500-char max, neutral tone, no hype, no venue/tour
 *      history), then Serper as an image fallback.
 *   4. Upserts the fresh data into the `artists` table AND copies the
 *      bio/image back onto each candidate event's denormalized columns,
 *      with these PRESERVE-MANUAL-EDITS invariants:
 *        • event_image_url / artist_bio are ONLY written when they're
 *          currently blank on the event (and no linked artist.image_url /
 *          artists.bio is already filling them in either).
 *        • event_title and event_date are NEVER touched — those are the
 *          human-curated fields Magic Wand must not overwrite. (There is
 *          no `start_time` column on `events`; time-of-day lives inside
 *          event_date, which we still never write.)
 *        • `artists.is_human_edited` JSONB gets `{ bio: true, image_url: true }`
 *          for fields the AI filled — blocks future scraper overwrites.
 *        • `events.is_human_edited = true` (boolean) — blocks the
 *          twice-daily sync-events cron (see sync-events/route.js:501-506).
 *
 * Why we don't call `stripLockedFields` on the event update anymore:
 *   The whole point of Smart Fill is to RESCUE rows that carry a stale
 *   boolean lock but no data. `stripLockedFields` would see the boolean
 *   lock and zero our write — exactly the bug Smart Fill is designed to
 *   fix. The blank-only pre-check in 5b replaces it as the safety net.
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
 *     candidates,         // events considered (missing data — locked or not)
 *     lockedBlankFilled,  // of those, how many carried a stale lock that
 *                         // Smart Fill rescued (subset of `candidates`)
 *     lockedSkipped,      // kept in the response for back-compat; always
 *                         // 0 under Smart Fill since no locked row is
 *                         // skipped anymore
 *     uniqueArtists,
 *     artistsEnriched,    // how many artists got any new data from the helper
 *     eventsUpdated,      // how many event rows we wrote fresh data onto
 *     errors?,
 *     duration,
 *   }
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';
import { aiLookupArtist } from '@/lib/aiLookup';

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
  const { date, eventId, preview } = body || {};

  // Validation — exactly one mode must be supplied. We allow both to be
  // sent (single-event call from the admin UI may want to echo the
  // originating `date` for diagnostics) but require at least `eventId` or
  // a valid date string. The format check on `date` stays strict so a
  // mistyped "2026-4-16" fails loudly instead of silently widening the
  // day bounds.
  if (!eventId && !date) {
    return NextResponse.json(
      { error: 'Either `date` (YYYY-MM-DD) or `eventId` is required' },
      { status: 400 }
    );
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (eventId !== undefined && (typeof eventId !== 'string' || !eventId.trim())) {
    return NextResponse.json({ error: 'eventId must be a non-empty string' }, { status: 400 });
  }
  // Preview mode is a dry-run for the "AI Image Search" button inside the
  // Edit Event modal. It only makes sense on a single row — bulk preview
  // would burn Perplexity credits with no way for the operator to review
  // before commit. Reject bulk preview loudly instead of silently widening.
  if (preview === true && !eventId) {
    return NextResponse.json(
      { error: 'preview mode requires `eventId` — bulk preview is not supported' },
      { status: 400 }
    );
  }
  const isPreview = preview === true;

  const start = Date.now();
  const supabase = getAdminClient();

  // Single-event mode flag — gates the "Force Rescue" semantic below.
  // When the admin clicks ✨ on a specific card, they're asserting "I know
  // this row is missing data; fill it." That intent overrides the "inherit
  // from linked artists row" optimism that the bulk path uses to avoid
  // redundant Perplexity calls. In single-event mode we look ONLY at the
  // event's own denormalized columns (custom_image_url, event_image_url,
  // image_url, artist_bio) when deciding whether a field is blank — so
  // an event linked to an artists row with a bio still gets its OWN
  // event.artist_bio filled in, instead of the route silently returning
  // "Successful Nothing" (200 OK, 0 rows updated) because the joined
  // artist has data the operator can't see on the card they just clicked.
  const isSingleEvent = !!eventId;

  if (isSingleEvent) {
    console.log('[enrich-date] Processing Single Event ID:', eventId, isPreview ? '(preview — no DB writes)' : '');
  }

  // ── 1. Pull the candidate event set ──────────────────────────────────
  // We include venue_name + venues(address) so we can thread "venue" and
  // "city" into the AI helper's prompt. We also pull the artist join so we
  // can detect "bio already present on the linked artist row" as non-missing.
  //
  // NOTE on image columns: `event_image` is a VIRTUAL field computed by
  // applyWaterfall — it's NOT a real DB column. Selecting it silently
  // drops the whole row via PostgREST error mode. The real columns on
  // `events` are `custom_image_url`, `event_image_url`, and legacy
  // `image_url`.
  //
  // NOTE on time-of-day: the `events` table has NO `start_time` column —
  // time is baked into `event_date` (ISO timestamp, Eastern-aware via the
  // bounds pair below), with `is_time_tbd` flagging placeholders. The
  // `start_time` column lives on `event_templates` only; selecting
  // `events.start_time` raises `column events.start_time does not exist`
  // from PostgREST and fails the whole Magic Wand run (see 2026-04-16
  // postmortem). `event_title`, `event_date`, and `is_time_tbd` are pulled
  // only for readable debug traces — never written by this route, which
  // is the "preserve manual edits" invariant (enforced by omission in 5b).
  //
  // TWO FETCH MODES:
  //   • eventId → exact match on a single row. We still gate on
  //     status='published' so a soft-deleted row that slipped into the
  //     admin UI (shouldn't happen, but defense-in-depth) can't be
  //     enriched back into visibility.
  //   • date    → Eastern-day bounds span. Same select, larger set.
  const selectCols = `
    id, artist_id, artist_name, event_title, event_date, is_time_tbd, venue_name,
    custom_image_url, event_image_url, image_url, artist_bio,
    is_human_edited, is_locked,
    venues(name, address),
    artists(id, name, bio, image_url, is_human_edited)
  `;

  let events, fetchErr;
  if (eventId) {
    // Single-event Magic Wand. Skip getEasternDayBounds entirely — we're
    // target-fetching by PK, so the day-boundary context is irrelevant.
    // Everything downstream (Smart Fill partition, byArtist dedupe,
    // Classification Fork via aiLookupArtist, blank-only writes) runs
    // identically; it just happens to iterate over a 1-row candidate set.
    ({ data: events, error: fetchErr } = await supabase
      .from('events')
      .select(selectCols)
      .eq('status', 'published')
      .eq('id', eventId));
  } else {
    const { start: dateStart, end: dateEnd } = getEasternDayBounds(date);
    ({ data: events, error: fetchErr } = await supabase
      .from('events')
      .select(selectCols)
      .eq('status', 'published')
      .gte('event_date', dateStart)
      .lte('event_date', dateEnd));
  }

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!events?.length) {
    return NextResponse.json({
      ok: true,
      date: date || null,
      eventId: eventId || null,
      preview: isPreview,
      totalEvents: 0,
      candidates: 0,
      lockedBlankFilled: 0,
      lockedSkipped: 0,
      uniqueArtists: 0,
      artistsEnriched: 0,
      eventsUpdated: 0,
      updatedEventIds: [],
      rescuedEventIds: [],
      // Preview fields — always echoed so the client can rely on a stable
      // shape even when the AI lookup short-circuited (no candidate rows).
      image_url: null,
      bio: null,
      kind: null,
      duration: '0s',
    });
  }

  // ── 2. Smart Fill partition ───────────────────────────────────────────
  // A candidate is any event MISSING at least one of {image, bio} —
  // regardless of its lock state. This is the Smart Fill change: the old
  // logic skipped every locked row, but the 7:12 PM bug (2026-04-14) left
  // rows with a stale `is_human_edited=true` AND blank data, which the
  // old skip rule stranded forever. Smart Fill reinterprets the lock as
  // "don't clobber populated fields" rather than "skip row entirely" —
  // the actual preserve-manual-edits enforcement lives in 5b, where we
  // only write to fields that are still blank.
  //
  // Force Rescue (single-event mode, 2026-04-16 hotfix):
  //   When the admin clicks ✨ on ONE specific card, we look ONLY at that
  //   event's OWN denorm columns for the has-data check — the joined
  //   `artists.bio` / `artists.image_url` are intentionally ignored. The
  //   bug this fixes: a card like "Family Night" whose `artist_id`
  //   happened to link to a populated artists row was excluded from
  //   candidates (`hasBio = true` via the join), so the route returned
  //   200 OK / 0 rows updated — a confusing "Successful Nothing". In
  //   single-event mode the operator's click IS the intent signal; if
  //   the event's OWN artist_bio or event_image_url is blank, fill it,
  //   regardless of what a linked artist row has.
  //
  // Bulk mode (date-path) unchanged:
  //   We still check every real image column (custom_image_url,
  //   event_image_url, image_url) plus the linked artists.image_url, and
  //   bio can live on event.artist_bio OR inherit from artists.bio. The
  //   inherit-check is a cost optimization — don't Perplexity-hit an
  //   artist whose profile we already have — which makes sense when
  //   processing a whole day, but is exactly what the single-event
  //   click is trying to override.
  const candidateEvents = [];
  let lockedBlankFilled = 0;
  // Which candidate ids were in the "rescue" bucket at partition time — a
  // superset of the ones we'll actually successfully write to. Kept as a
  // Set so the write loop can O(1) check whether an updated row counts as
  // a rescue win for the response payload (used by Review Mode in the
  // admin UI to filter the event list to "only rescues from this run").
  const rescueSet = new Set();

  for (const ev of events) {
    // Helper: is there image data on the row? In single-event mode, look
    // only at the event's OWN columns. In bulk mode, also consider the
    // joined artists.image_url (so we don't over-enrich artists whose
    // canonical profile we already have).
    const hasImage = isSingleEvent
      ? !!(ev.custom_image_url || ev.event_image_url || ev.image_url)
      : !!(
        ev.custom_image_url
        || ev.event_image_url
        || ev.image_url
        || ev.artists?.image_url
      );
    const hasBio = isSingleEvent
      ? !!ev.artist_bio
      : !!(ev.artist_bio || ev.artists?.bio);
    const isMissing = !hasImage || !hasBio;

    if (!isMissing) continue;

    // Count the rescue cases: rows that would have been skipped by the
    // old logic but are now eligible because Smart Fill treats blanks
    // as fillable even on locked rows.
    if (ev.is_human_edited === true || ev.is_locked === true) {
      lockedBlankFilled++;
      rescueSet.add(ev.id);
    }

    candidateEvents.push(ev);
  }

  if (candidateEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      date: date || null,
      eventId: eventId || null,
      preview: isPreview,
      totalEvents: events.length,
      candidates: 0,
      lockedBlankFilled: 0,
      lockedSkipped: 0,
      uniqueArtists: 0,
      artistsEnriched: 0,
      eventsUpdated: 0,
      updatedEventIds: [],
      rescuedEventIds: [],
      image_url: null,
      bio: null,
      kind: null,
      duration: ((Date.now() - start) / 1000).toFixed(2) + 's',
    });
  }

  // ── 3. Load blacklist so we never re-enrich a deleted/ignored artist ─
  //
  // Blacklist Paradox (2026-04-16 hotfix):
  //   In bulk mode the blacklist is a guard against wasting Perplexity
  //   credits on artists the admin already deleted — the scraper may
  //   re-ingest the name, but we don't want the next bulk Auto-Fill run
  //   to resurrect the bio/image we just tossed.
  //
  //   But in single-event mode, the admin has EXPLICITLY clicked ✨ on a
  //   specific row. That click is an absolute override: it overrides the
  //   `is_human_edited` lock (via Force Rescue above) AND the blacklist.
  //   The canonical bug: admin deletes an "artist" that was actually a
  //   VENUE_EVENT (e.g. "Family Night") via "Delete Artist, Keep Events"
  //   → the name lands in `ignored_artists` → later the admin clicks ✨
  //   on one of the kept events to fill in a proper venue-style bio →
  //   the byArtist grouping silently drops the row because the name is
  //   on the blacklist → "Successful Nothing" (1-second 200 OK, no writes).
  //
  //   Fix: in single-event mode, skip the blacklist fetch entirely AND
  //   bypass the `.has()` check below. Skipping the fetch saves a
  //   round-trip; bypassing the check is the actual semantic guarantee.
  //   The operator's click is the intent; trust them.
  let blacklistedNames = new Set();
  if (isSingleEvent) {
    console.log('[enrich-date] Blacklist bypassed for single-event click (admin override).');
  } else {
    try {
      const { data: bl } = await supabase
        .from('ignored_artists')
        .select('name_lower')
        .limit(5000);
      blacklistedNames = new Set((bl || []).map(b => b.name_lower));
    } catch { /* table may not exist */ }
  }

  // ── 4. Group candidates by lowercased artist name ─────────────────────
  // Keep the FIRST event's venue + derived city as the research context for
  // that artist — if the same band plays multiple venues on the same day,
  // we still only Perplexity-hit them once (using whichever venue we saw
  // first). The same AI result is then applied to every candidate event
  // with that artist_name.
  //
  // Single-event fallback: if `artist_name` is blank (common for
  // VENUE_EVENT rows like "Family Night" or "Trivia Tuesday" where the
  // admin only set `event_title`), we fall back to `event_title` as the
  // AI lookup key. Without this, the operator would click ✨ on a
  // titled-but-artist-less card and get "Successful Nothing" because
  // the byArtist grouping silently dropped the row. The Classification
  // Fork inside aiLookupArtist handles the "this isn't a musician" case
  // by emitting kind === 'VENUE_EVENT' and generating a venue-style bio.
  const byArtist = new Map();  // name_lower → { name, venue, city, events: [] }
  for (const ev of candidateEvents) {
    let raw = ev.artist_name?.trim();
    if (!raw && isSingleEvent) {
      raw = ev.event_title?.trim() || null;
    }
    if (!raw) continue;
    const key = raw.toLowerCase();
    // Blacklist check — SKIPPED in single-event mode (see Blacklist
    // Paradox comment at step 3). The blacklistedNames Set is empty in
    // single-event mode anyway (we don't fetch), but we still gate this
    // explicitly on `isSingleEvent` so the intent is readable at the
    // call site and a future maintainer who moves the fetch back won't
    // silently re-introduce the paradox.
    if (!isSingleEvent && blacklistedNames.has(key)) continue;

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
  // Parallel id trackers — used by the admin UI's Review Mode to filter
  // the event list to "just the rows this run touched". `updatedEventIds`
  // is every event.id that got a successful UPDATE; `rescuedEventIds` is
  // the subset that were rescue candidates (locked-blank pre-write) AND
  // got updated. Arrays (not Sets) so they serialize cleanly as JSON.
  const updatedEventIds = [];
  const rescuedEventIds = [];
  const errors = [];
  // Preview result — captured from the first AI success in preview mode so
  // we can echo it back to the modal without persisting. Preview is always
  // single-event (validated above), so there's at most one artist in the
  // `artists` loop and this variable holds exactly one AI result.
  let previewResult = { image_url: null, bio: null, kind: null };

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

    if (!ai) {
      if (isSingleEvent) {
        console.log(`[enrich-date] Classification Result: (no AI result for "${art.name}")`);
      }
      continue;
    }
    // The Classification Fork inside aiLookupArtist tags each result with
    // a `kind` field ('MUSICIAN' | 'VENUE_EVENT') that drives the bio and
    // image prompts. Log it for single-event mode so the operator can
    // verify from the server logs that "Family Night" was classified
    // correctly as VENUE_EVENT (not mis-labeled as a band with a
    // hallucinated bio).
    if (isSingleEvent) {
      console.log(`[enrich-date] Classification Result: ${ai.kind || 'UNKNOWN'} (name="${art.name}", venue="${art.venue || '-'}", city="${art.city || '-'}")`);
    }
    const gotBio = !!ai.bio;
    const gotImage = !!ai.image_url;
    if (!gotBio && !gotImage) continue;
    artistsEnriched++;

    // Preview short-circuit — capture the AI result and skip BOTH DB
    // writes (5a artists upsert AND 5b events update). The client uses
    // the echoed `image_url` / `bio` / `kind` to populate form fields;
    // nothing is persisted until the user clicks the normal save button.
    if (isPreview) {
      previewResult = {
        image_url: ai.image_url || null,
        bio: ai.bio || null,
        kind: ai.kind || null,
      };
      console.log(`[enrich-date] Preview mode — no DB writes, returning AI-resolved fields (image=${gotImage}, bio=${gotBio}, kind=${ai.kind || 'UNKNOWN'}).`);
      continue;
    }

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

    // ── 5b. Smart Fill write: blanks only, never touch title/event_date ─
    // Per-event blank check — we re-evaluate each field on each event
    // because the same artist may play multiple rooms today, and one
    // venue may have a custom image while another doesn't. Writing
    // artist-level data uniformly would either clobber the custom image
    // or strand the blank venue.
    //
    // Invariants enforced here:
    //   • event_image_url is written ONLY if the event's image slot is
    //     blank. In bulk mode that means every real image column AND the
    //     linked artists.image_url are all blank (inherit-optimism). In
    //     single-event mode (Force Rescue) we ignore the joined artist
    //     entirely — if the event's own columns are blank, we fill,
    //     which is the whole point of the ✨-click.
    //   • artist_bio is written ONLY if event.artist_bio is blank (and
    //     in bulk mode, also the joined artists.bio is blank).
    //   • event_title and event_date are NEVER in the update object,
    //     so Magic Wand physically cannot overwrite them. That's the
    //     "preserve manual edits" invariant, enforced by omission. (The
    //     events table has no `start_time` column — time-of-day lives in
    //     event_date, which we also omit, so the invariant holds either
    //     way you look at it.)
    //
    // We do NOT call stripLockedFields here. Smart Fill's whole purpose
    // is to rescue rows that carry a stale boolean lock with blank data;
    // that guard would strip our write on exactly those rows and defeat
    // the feature. Our blank-only pre-check is the replacement safety net.
    for (const ev of art.events) {
      const update = {};

      const hasImage = isSingleEvent
        ? !!(ev.custom_image_url || ev.event_image_url || ev.image_url)
        : !!(
          ev.custom_image_url
          || ev.event_image_url
          || ev.image_url
          || ev.artists?.image_url
        );
      const hasBio = isSingleEvent
        ? !!ev.artist_bio
        : !!(ev.artist_bio || ev.artists?.bio);

      if (gotImage && !hasImage) {
        // Write to event_image_url — the real column. (event_image is a
        // virtual waterfall field, not a DB column; writing it would
        // silently no-op via PostgREST error mode.)
        update.event_image_url = ai.image_url;
      }
      if (gotBio && !hasBio) {
        update.artist_bio = ai.bio;
      }
      // Link the FK if it wasn't set — lets the waterfall reach the full
      // artist profile on future reads without re-querying by name.
      if (!ev.artist_id && artistId) {
        update.artist_id = artistId;
      }

      if (Object.keys(update).length === 0) continue;

      // Promote the event to a locked row so the next scraper cron
      // respects this as admin intent. The scraper's split query at
      // sync-events/route.js:501-506 is:
      //   .or('is_human_edited.eq.true,is_locked.eq.true')
      // so flipping is_human_edited to true puts the row in the
      // "protected" bucket on the next sync-events run. The admin can
      // still edit via the normal admin UI; this flag only locks out
      // automated writers. (If the row was already locked — e.g. a
      // rogue-locked rescue case — this is a no-op on the flag itself.)
      update.is_human_edited = true;

      const { error: updateErr } = await supabase
        .from('events')
        .update(update)
        .eq('id', ev.id);

      if (updateErr) {
        errors.push(`Event ${ev.id}: ${updateErr.message}`);
      } else {
        eventsUpdated++;
        updatedEventIds.push(ev.id);
        if (rescueSet.has(ev.id)) rescuedEventIds.push(ev.id);
      }
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  // Always log the final write count for single-event runs so the operator
  // can tell from the server logs whether a "nothing changed" UI came
  // from a 0-row write vs a downstream cache miss.
  if (isSingleEvent) {
    console.log(`[enrich-date] Rows actually updated: ${eventsUpdated} (event=${eventId}, candidates=${candidateEvents.length}, artistsEnriched=${artistsEnriched}, duration=${duration})`);
  }

  return NextResponse.json({
    ok: true,
    date: date || null,
    eventId: eventId || null,
    preview: isPreview,
    totalEvents: events.length,
    candidates: candidateEvents.length,
    lockedBlankFilled,
    // Kept in the response for back-compat with older clients; Smart
    // Fill never skips a locked row, so this is always 0 now.
    lockedSkipped: 0,
    uniqueArtists,
    artistsEnriched,
    eventsUpdated,
    // Review Mode — the admin UI banner makes these counts clickable to
    // filter the candidate list to "only rows this run touched". The ids
    // are the ONLY source of truth for that filter; don't derive it from
    // `updated_at` windows on the client (clock skew + other writes in
    // the same window would misattribute rows).
    updatedEventIds,
    rescuedEventIds,
    // Preview-mode payload — in commit mode these are null (the form
    // should re-fetch from the row on the next render); in preview mode
    // they carry the AI-resolved fields so the modal can populate the
    // image input and trigger the Mobile Preview without a DB round-trip.
    image_url: previewResult.image_url,
    bio: previewResult.bio,
    kind: previewResult.kind,
    errors: errors.length ? errors : null,
    duration,
  });
}
