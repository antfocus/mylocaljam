import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds, getVenueColor } from '@/lib/utils';
import { applyWaterfall, cleanImg, extractTimeFromDate } from '@/lib/waterfall';

/**
 * GET /api/events/search
 *
 * Public paginated + searchable event feed endpoint.
 * Replaces the 80-event client-side Supabase fetch with server-side search,
 * filtering, waterfall resolution, and pagination.
 *
 * Query parameters:
 *   q          — search string (fuzzy trigram match across event_title,
 *                artist_name, and venue_name). Optional.
 *   page       — 1-indexed page number (default: 1)
 *   limit      — results per page (default: 20, max: 100)
 *   date_from  — ISO date string YYYY-MM-DD (default: today Eastern)
 *   date_to    — ISO date string YYYY-MM-DD (optional upper bound)
 *   venues     — comma-separated venue IDs (UUID) to filter by
 *   category   — category string to filter by (e.g. 'Live Music')
 *
 * Auth: public (no Bearer token). Uses service role key server-side
 * so RLS doesn't interfere with joined selects.
 *
 * Response shape:
 *   { data: [...], page, limit, total, hasMore }
 *
 * Each event in `data` is a fully-resolved, display-ready object matching
 * the shape the frontend currently expects from the client-side fetch in
 * src/app/page.js — including waterfall-resolved title, category, start_time,
 * description, and event_image.
 *
 * ARCHITECTURAL DECISIONS:
 * ────────────────────────
 * 1. OFFSET-BASED PAGINATION (not cursor/keyset):
 *    - The feed is ordered by (event_date ASC, id ASC). event_date has many
 *      ties (20+ events on a Saturday night), so a cursor would need a
 *      composite (event_date, id) tuple — complex for the client and fragile
 *      when events are inserted mid-page.
 *    - The client needs `total` count for UI ("showing 20 of 347 events").
 *      Cursor pagination can't provide exact totals without a separate COUNT.
 *    - At our scale (1,500–10K rows after the WHERE filter), OFFSET is cheap.
 *      Postgres skips rows in the index scan — no sequential table scan.
 *    - Trade-off: deep pages (page 50+) are slower. Acceptable — users
 *      scrolling that far is rare, and infinite scroll resets the page chain.
 *
 * 2. SEARCH STRATEGY:
 *    - When `q` is provided, we use ILIKE with pg_trgm GIN indexes for
 *      fuzzy partial matching. This lets "stone po" match "The Stone Pony"
 *      and "jazz ri" match "Jazz at River Rock".
 *    - The search checks 3 real DB columns: event_title, artist_name,
 *      venue_name. custom_title does not exist as a column — the title
 *      waterfall is resolved post-query by applyWaterfall.
 *    - The search term is matched as a single ILIKE '%term%' substring
 *      against each column. PostgREST's `.or()` generates an OR across
 *      the conditions, which Postgres satisfies with a BitmapOr of the
 *      trigram GIN indexes.
 *    - Commas and parentheses in the query are replaced with spaces to
 *      prevent breaking PostgREST's .or() filter syntax (same strategy
 *      as /api/spotlight/route.js).
 *
 * 3. SERVER-SIDE WATERFALL:
 *    - Uses the shared `applyWaterfall` from src/lib/waterfall.js so the
 *      title/category/time/bio/image resolution is identical to the
 *      Spotlight route and admin preview.
 *    - The start_time extraction (event_date fallback + title-regex fallback)
 *      is replicated here from page.js to produce the same client-ready shape.
 *
 * SAFETY LOCKS RESPECTED:
 *   • event_image is VIRTUAL — never SELECTed from DB (Safety Lock §0.4)
 *   • events.start_time is NOT selected — it doesn't exist as a real column
 *     (start_time lives on event_templates only). We get time from event_date
 *     extraction and the template join.
 *   • Waterfall priority preserved (Safety Lock §0.5)
 *   • Ladder output keys: event_title, category, start_time, description,
 *     event_image (Safety Lock §0.8)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decode HTML entities leaked through scrapers (parity with page.js) */
function decodeEntities(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Extract a start time from the event, replicating page.js logic:
 *   1. Template Master Time (event_templates.start_time)
 *   2. event_date timestamp → Eastern HH:MM
 *   3. Title-regex fallback for midnight values
 */
function resolveStartTime(e) {
  // The template's master time is already in the waterfall via applyWaterfall,
  // but we need the raw extraction for the title-regex fallback.
  let time = e.event_templates?.start_time || null;

  // Fall back to event_date extraction if template didn't provide a time
  if (!time) {
    time = extractTimeFromDate(e.event_date);
  }

  // Title-regex fallback: if time is midnight (00:00), try parsing from title
  if (time === '00:00' || time === '24:00' || !time) {
    const title = e.artist_name || e.name || '';
    const tm = title.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (tm) {
      let hr = parseInt(tm[1]);
      const mn = tm[2] ? parseInt(tm[2]) : 0;
      const per = tm[3].toLowerCase();
      if (per === 'pm' && hr !== 12) hr += 12;
      if (per === 'am' && hr === 12) hr = 0;
      time = `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
    }
  }

  return time;
}

/**
 * Transform a raw Supabase event row (with joins) into the display-ready
 * shape the frontend expects. Mirrors the mapping in page.js lines ~796-876.
 */
function transformEvent(e) {
  const w = applyWaterfall(e);
  const startTime = w.start_time || resolveStartTime(e);

  return {
    // Pass through the raw row so the frontend can access any field it needs
    ...e,
    // Resolved display fields (waterfall output keys — Safety Lock §0.8)
    name:          decodeEntities(e.artists?.name || e.artist_name || e.name || ''),
    event_title:   w.title,
    category:      w.category,
    start_time:    startTime,
    description:   w.description,
    event_image:   w.event_image,
    // Artist data
    artist_image:  cleanImg(e.artists?.image_url) || null,
    artist_genres: e.custom_genres?.length ? e.custom_genres : (e.genre ? [e.genre] : (e.artists?.genres || [])),
    artist_vibes:  e.custom_vibes?.length  ? e.custom_vibes  : (e.vibe  ? [e.vibe]  : (e.artists?.vibes  || [])),
    is_tribute:    e.artists?.is_tribute || false,
    // Venue data (denormalized for the card)
    venue:         e.venues?.name    || e.venue_name || '',
    venue_name:    e.venues?.name    || e.venue_name || '',
    venue_address: e.venues?.address || '',
    venue_city:    e.venues?.city || '',
    venue_color:   e.venues?.color   || getVenueColor(e.venues?.name || e.venue_name),
    venue_photo:   e.venues?.photo_url || null,
    venue_lat:     e.venues?.latitude  || null,
    venue_lng:     e.venues?.longitude || null,
    venue_type:    e.venues?.venue_type || null,
    venue_tags:    e.venues?.tags || [],
    // Date as YYYY-MM-DD in Eastern time (parity with page.js)
    date: (() => {
      const raw = e.event_date || '';
      if (!raw) return '';
      if (raw.includes('T')) {
        const d = new Date(raw);
        return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      }
      return raw.substring(0, 10);
    })(),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const q        = (searchParams.get('q') || '').trim();
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const dateFrom = searchParams.get('date_from') || null;
  const dateTo   = searchParams.get('date_to') || null;
  const venues   = searchParams.get('venues') || null;     // comma-separated UUIDs
  const category = searchParams.get('category') || null;

  const supabase = getAdminClient();

  // ── Compute date floor ──────────────────────────────────────────────────
  // Default to today Eastern if no date_from is provided.
  // Never go earlier than today — no point showing past events on the public feed.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const effectiveDateFrom = (dateFrom && dateFrom >= todayET) ? dateFrom : todayET;
  const { start: dateFloorUTC } = getEasternDayBounds(effectiveDateFrom);

  // ── Build the base select ───────────────────────────────────────────────
  // Joins: venues, artists, event_templates — same shape as the existing
  // /api/events/route.js and the client-side fetch in page.js.
  // IMPORTANT: Do NOT select `event_image` (virtual) or `events.start_time`
  // (doesn't exist as a column). The start_time join comes from event_templates.
  // IMPORTANT: Single-line string — newlines in template literals get URL-
  // encoded (%0A) and break PostgREST's parser.
  //
  // The `!fk_events_template_id` hint tells PostgREST exactly which FK
  // constraint to traverse for the event_templates join. Without this hint,
  // PostgREST relies on auto-detection from its schema cache, which fails
  // when the cache hasn't reloaded after the FK migration (NOTIFY pgrst
  // doesn't always stick on local/staging instances). The hint syntax
  // bypasses the cache entirely — works regardless of reload state.
  // Ref: https://postgrest.org/en/stable/references/api/resource_embedding.html
  const selectColumns = '*, venues(name, address, city, color, photo_url, latitude, longitude, venue_type, tags, default_start_time), artists(name, bio, genres, vibes, is_tribute, image_url), event_templates!fk_events_template_id(template_name, bio, image_url, category, start_time, genres)';

  // ── Search: build the ILIKE filter ──────────────────────────────────────
  // When q is provided, construct an OR filter across the searchable columns.
  // pg_trgm GIN indexes accelerate these ILIKE '%term%' patterns.
  //
  // The full search term is matched as a single substring — so "stone po"
  // matches "The Stone Pony" because the string contains "stone po".
  // This is a simple ILIKE '%term%' across the 3 indexed columns.
  //
  // Template names (event_templates.template_name) are NOT searchable at
  // the DB level because PostgREST .or() can't filter across relations.
  // The sync route copies template category onto events.category and
  // template_name often matches event_title, so coverage is near-complete.
  let searchFilter = null;
  if (q) {
    // Sanitize for PostgREST .or() syntax:
    //   • % and _ are ILIKE wildcards — escape them so user-typed '%' is literal
    //   • Commas separate conditions in .or() — a comma in the value would
    //     split the filter string and produce a malformed condition
    //   • Parentheses are used for grouping in PostgREST filters
    // The Spotlight route in /api/spotlight/route.js uses the same strategy:
    //     .replace(/[,()]/g, ' ')
    const escaped = q
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/[,()]/g, ' ')    // strip chars that break .or() syntax
      .trim();

    if (escaped) {
      searchFilter = [
        `event_title.ilike.%${escaped}%`,
        `artist_name.ilike.%${escaped}%`,
        `venue_name.ilike.%${escaped}%`,
      ].join(',');
    }
  }

  try {
    // ── Count query (for pagination metadata) ─────────────────────────────
    // Runs in parallel with the data query for efficiency.
    let countQuery = supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('event_date', dateFloorUTC);

    let dataQuery = supabase
      .from('events')
      .select(selectColumns)
      .eq('status', 'published')
      .gte('event_date', dateFloorUTC)
      .order('event_date', { ascending: true })
      .order('id', { ascending: true });  // tiebreaker for stable pagination

    // ── Apply optional filters ────────────────────────────────────────────

    // Date upper bound
    if (dateTo) {
      const { end: dateCeilUTC } = getEasternDayBounds(dateTo);
      countQuery = countQuery.lte('event_date', dateCeilUTC);
      dataQuery  = dataQuery.lte('event_date', dateCeilUTC);
    }

    // Venue filter (comma-separated UUIDs)
    if (venues) {
      const venueIds = venues.split(',').map(v => v.trim()).filter(Boolean);
      if (venueIds.length > 0) {
        countQuery = countQuery.in('venue_id', venueIds);
        dataQuery  = dataQuery.in('venue_id', venueIds);
      }
    }

    // Category filter
    if (category) {
      countQuery = countQuery.eq('category', category);
      dataQuery  = dataQuery.eq('category', category);
    }

    // Search filter (ILIKE across searchable columns)
    if (searchFilter) {
      countQuery = countQuery.or(searchFilter);
      dataQuery  = dataQuery.or(searchFilter);
    }

    // ── Pagination via .range() ───────────────────────────────────────────
    const from = (page - 1) * limit;
    const to   = from + limit - 1;
    dataQuery = dataQuery.range(from, to);

    // ── Execute both queries in parallel ──────────────────────────────────
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    if (countResult.error) {
      console.error('[events/search] count error:', countResult.error.message);
      return NextResponse.json(
        { error: 'Failed to count events', detail: countResult.error.message },
        { status: 500 }
      );
    }

    if (dataResult.error) {
      console.error('[events/search] data error:', dataResult.error.message);
      return NextResponse.json(
        { error: 'Failed to fetch events', detail: dataResult.error.message },
        { status: 500 }
      );
    }

    const total = countResult.count || 0;
    const events = (dataResult.data || []).map(transformEvent);

    // ── Response ──────────────────────────────────────────────────────────
    const response = NextResponse.json({
      data:    events,
      page,
      limit,
      total,
      hasMore: from + events.length < total,
    });

    // Prevent stale caching (parity with /api/events)
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store');

    return response;

  } catch (err) {
    console.error('[events/search] unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
