import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';
import { applyWaterfall, normalizeName } from '@/lib/waterfall';

// ── Cache guards ────────────────────────────────────────────────────────────
// The public hero polls this route by date. Without these exports:
//   • Next.js's Data Cache can capture the inner Supabase `fetch` responses
//     and keep replaying a stale answer even after the DB updates.
//   • Vercel's Full Route Cache can hold a successful GET response at the
//     edge for the life of the date string (24h in the worst case).
// Both were implicated in the 7:12 PM Mariel "Heisenbug": the image resolved
// correctly for hours, then silently reverted to a stale cached response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * GET /api/spotlight?date=YYYY-MM-DD[&device_id=xxx]
 *
 * Waterfall logic to fill up to 5 spotlight slots:
 *   Tier 0: Admin-pinned events from the `spotlight_events` table (date-scoped)
 *   Tier 1: Events for tonight featuring artists the user follows (needs device_id)
 *   Tier 2: Most-saved events tonight (by favorite count across all users)
 *   Tier 3: Random events tonight between 19:00–22:00 at high-activity venues
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const deviceId = searchParams.get('device_id') || null;

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const MAX_SLOTS = 5;
  const collected = [];         // array of event IDs in priority order
  const seen = new Set();       // dedup

  const addIds = (ids) => {
    for (const id of ids) {
      if (seen.has(id) || collected.length >= MAX_SLOTS) continue;
      seen.add(id);
      collected.push(id);
    }
  };

  // Eastern-aware UTC boundaries (handles EDT/EST automatically)
  const { start: dateStart, end: dateEnd, nextDateStr } = getEasternDayBounds(date);

  // ── Tier 0: Admin-pinned spotlight events from spotlight_events table
  try {
    const { data: pins } = await supabase
      .from('spotlight_events')
      .select('event_id, sort_order')
      .eq('spotlight_date', date)
      .order('sort_order', { ascending: true });
    if (pins && pins.length > 0) {
      addIds(pins.map(p => p.event_id));
    }
  } catch { /* spotlight_events table may not exist */ }

  // Tier 0b (legacy `events.is_featured` fallback) has been retired. Spotlight
  // curation is single-sourced from `spotlight_events` (see audit C3/M3).

  // ── Tier 1: Followed artists (personalized) ────────────────────────────
  if (collected.length < MAX_SLOTS && deviceId) {
    try {
      // Get artist names this device follows
      const { data: follows } = await supabase
        .from('follows')
        .select('entity_name')
        .eq('device_id', deviceId)
        .eq('entity_type', 'artist');

      if (follows && follows.length > 0) {
        const artistNames = follows.map(f => f.entity_name);
        const { data } = await supabase
          .from('events')
          .select('id')
          .eq('status', 'published')
          .gte('event_date', dateStart)
          .lte('event_date', dateEnd)
          .in('artist_name', artistNames)
          .order('event_date', { ascending: true })
          .limit(MAX_SLOTS);
        if (data) addIds(data.map(e => e.id));
      }
    } catch {}
  }

  // ── Tier 2: Most-saved events tonight (community hype) ─────────────────
  if (collected.length < MAX_SLOTS) {
    try {
      // Get all tonight's published event IDs
      const { data: tonightEvents } = await supabase
        .from('events')
        .select('id')
        .eq('status', 'published')
        .gte('event_date', dateStart)
        .lte('event_date', dateEnd);

      if (tonightEvents && tonightEvents.length > 0) {
        const tonightIds = tonightEvents.map(e => e.id);

        // Count favorites per event from the favorites table
        // If no favorites table exists, we'll catch the error and skip
        const { data: favCounts } = await supabase
          .from('favorites')
          .select('event_id')
          .in('event_id', tonightIds);

        if (favCounts && favCounts.length > 0) {
          // Count occurrences
          const countMap = {};
          favCounts.forEach(f => {
            countMap[f.event_id] = (countMap[f.event_id] || 0) + 1;
          });

          // Sort by count descending
          const sorted = Object.entries(countMap)
            .sort(([, a], [, b]) => b - a)
            .map(([id]) => id);
          addIds(sorted);
        }
      }
    } catch {
      // favorites table might not exist — skip
    }
  }

  // ── Tier 3: Random evening events at popular venues ────────────────────
  if (collected.length < MAX_SLOTS) {
    try {
      // Get events tonight between 7pm–10pm Eastern (offset-aware)
      const { offsetHours: oh } = getEasternDayBounds(date);
      const eveningStart = `${date}T${String(19 + oh).padStart(2, '0')}:00:00Z`;  // 7pm ET in UTC
      const eveningEnd   = `${nextDateStr}T${String(22 + oh - 24).padStart(2, '0')}:00:00Z`;  // 10pm ET in UTC

      const { data } = await supabase
        .from('events')
        .select('id')
        .eq('status', 'published')
        .gte('event_date', eveningStart)
        .lte('event_date', eveningEnd)
        .order('event_date', { ascending: true })
        .limit(20);

      if (data && data.length > 0) {
        // Shuffle and pick
        const shuffled = data
          .map(e => e.id)
          .filter(id => !seen.has(id))
          .sort(() => Math.random() - 0.5);
        addIds(shuffled);
      }
    } catch {}
  }

  if (collected.length === 0) return NextResponse.json([]);

  const fallback = collected.map((id, i) => ({ event_id: id, sort_order: i }));

  try {
    const { data: hydrated, error } = await supabase
      .from('events')
      .select('*, venues(name, address, color, latitude, longitude, venue_type, tags), artists(name, bio, image_url, genres, vibes, is_tribute), event_templates(template_name, bio, image_url, category, start_time, genres)')
      .in('id', collected);

    if (error || !hydrated || hydrated.length === 0) return NextResponse.json(fallback);

    const byId = Object.fromEntries(hydrated.map(e => [e.id, e]));

    // ── Server-side artist fallback (parity with AdminSpotlightTab) ───────
    // PostgREST's `artists(...)` embed is keyed on the `artist_id` FK. When
    // that FK is null — which happens for any scraped event we haven't
    // auto-linked yet — the embed returns null and `applyWaterfall` loses
    // its last rung for bio/image. The admin modal papers over this by
    // loading the full `artists` table and doing a normalized-name match.
    //
    // We mirror that logic here, but in a SINGLE batched query so we don't
    // pay N round-trips when every pin is an unlinked artist:
    //   1. Collect unique `artist_name` values from hydrated events where
    //      neither the FK-embed nor the FK itself produced an artist.
    //   2. `ilike`-fetch those names from `artists` in one call (ilike does
    //      a case-insensitive DB match; we re-filter client-side with the
    //      shared `normalizeName` to catch whitespace drift too).
    //   3. Build a normalized-name → artist map and feed it to the
    //      waterfall via `opts.artist`.
    // Keeps the hero on structural parity with the admin picker without
    // regressing latency: +1 DB read, always, regardless of pin count.
    const unlinkedNames = Array.from(new Set(
      hydrated
        .filter(e => !e.artists && !e.artist_id && e.artist_name)
        .map(e => e.artist_name)
    ));

    const artistByName = {};
    if (unlinkedNames.length > 0) {
      try {
        // ilike with comma-joined OR across names. `artists.name` is the
        // curator-controlled column, so the set is small (≲ thousands) and
        // this stays an index scan.
        const orClause = unlinkedNames
          .map(n => `name.ilike.${n.replace(/[,()]/g, ' ').trim()}`)
          .join(',');
        const { data: candidateArtists } = await supabase
          .from('artists')
          .select('name, bio, image_url, genres, vibes, is_tribute')
          .or(orClause);

        if (candidateArtists) {
          for (const a of candidateArtists) {
            const key = normalizeName(a.name);
            if (key && !artistByName[key]) artistByName[key] = a;
          }
        }
      } catch (err) {
        // Non-fatal — the waterfall will just fall through without the
        // artist tier, matching the pre-fix behavior.
        console.warn('[spotlight] Artist name-match fallback failed:', err.message);
      }
    }

    // Apply the full Data Inheritance Waterfall with Verified Lock +
    // Midnight Exception. See `applyWaterfall` at the top of this file.
    const result = collected
      .map((id, i) => {
        const e = byId[id];
        if (!e) return null;
        // If the FK embed missed but we resolved the artist by name, hand
        // it to the waterfall so bio/image can fall through to Tier 4.
        const fallbackArtist = (!e.artists && !e.artist_id && e.artist_name)
          ? artistByName[normalizeName(e.artist_name)] || null
          : null;
        const w = applyWaterfall(e, { artist: fallbackArtist });
        return {
          event_id: id,
          ...e,
          event_title: w.title,
          category: w.category,
          start_time: w.start_time,
          description: w.description,
          event_image: w.event_image,
          sort_order: i,
        };
      })
      .filter(Boolean);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(fallback);
  }
}

/**
 * POST /api/spotlight (admin only)
 * Body: { date: 'YYYY-MM-DD', event_ids: [uuid1, uuid2, ...] }
 * Replaces all spotlight pins for that date with the new list (max 5).
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { date, event_ids } = await request.json();

  if (!date || !Array.isArray(event_ids)) {
    return NextResponse.json({ error: 'date and event_ids[] required' }, { status: 400 });
  }

  if (event_ids.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 spotlight events per day' }, { status: 400 });
  }

  // Delete existing pins for this date
  await supabase
    .from('spotlight_events')
    .delete()
    .eq('spotlight_date', date);

  // Insert new pins
  if (event_ids.length > 0) {
    const rows = event_ids.map((id, i) => ({
      event_id: id,
      spotlight_date: date,
      sort_order: i,
    }));

    const { error } = await supabase
      .from('spotlight_events')
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Invalidate the hero carousel + homepage cache so the next fetch is fresh.
  try {
    revalidatePath('/api/spotlight');
    revalidatePath('/');
  } catch {}

  return NextResponse.json({ success: true, date, count: event_ids.length });
}

/**
 * DELETE /api/spotlight?date=YYYY-MM-DD (admin only)
 * Clears all spotlight pins for a given date (reverts to algorithmic fallback).
 */
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('spotlight_events')
    .delete()
    .eq('spotlight_date', date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    revalidatePath('/api/spotlight');
    revalidatePath('/');
  } catch {}

  return NextResponse.json({ success: true });
}
