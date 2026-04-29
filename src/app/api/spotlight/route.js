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
 * Quality-First Waterfall — fills up to 5 spotlight slots:
 *   Tier 0 (sacred):    Admin-pinned events from `spotlight_events` (date-scoped).
 *                       Always respected, in the admin's chosen order.
 *   Tier 1 (hero):      Events with a hero-quality image — either an
 *                       `events.event_image` or a linked `artists.image_url`.
 *                       Ranked by favorite count (descending), then by start time.
 *   Tier 2 (venue):     Events with a `venues.photo_url` only (no hero image).
 *                       Still visually workable. Same within-tier ranking.
 *   Tier 3 (template):  Events with only a generic `event_templates.image_url`
 *                       (category-level stock art). Last resort.
 *   No-image events are SKIPPED entirely — we'd rather show fewer slots than a
 *   blank carousel card.
 *
 * De-dupe: the same artist never appears twice in the 5 slots. Manual pins
 * seed the seen-set (so a pin for Artist X blocks the autopilot from adding
 * another Artist X gig), but manual pins themselves are not blocked by the
 * de-dup — if the admin explicitly pinned two Artist X shows, we respect that.
 *
 * NOTE: the `device_id` param is accepted for backward compatibility but the
 * personalization tier (followed artists) has been removed in favor of a
 * single image-quality ranking. Restore it as a within-Tier-1 boost if that
 * behavior is wanted back.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  // deviceId accepted for backward compat — currently unused.
  // eslint-disable-next-line no-unused-vars
  const deviceId = searchParams.get('device_id') || null;

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  // `all_pins=true` → admin caller wants all saved pins (up to 10) so
  // runner-ups survive page loads. Public hero uses the default MAX_SLOTS=5.
  const allPins = searchParams.get('all_pins') === 'true';
  const MAX_SLOTS = allPins ? 8 : 5;
  const collected = [];          // event IDs in priority order
  const seen = new Set();        // dedup by event ID
  const seenArtists = new Set(); // dedup by artist (across tiers)

  // Eastern-aware UTC boundaries (handles EDT/EST automatically)
  const { start: dateStart, end: dateEnd } = getEasternDayBounds(date);

  // De-dup key for artists: prefer FK, fall back to normalized name so we
  // still catch duplicates on scraped-but-unlinked events.
  const artistKey = (e) => {
    if (!e) return null;
    if (e.artist_id) return `id:${e.artist_id}`;
    const n = normalizeName(e.artist_name);
    return n ? `name:${n}` : null;
  };

  // ── Tier 0: Admin-pinned (sacred) ──────────────────────────────────────
  let pinIds = [];
  try {
    const { data: pins } = await supabase
      .from('spotlight_events')
      .select('event_id, sort_order')
      .eq('spotlight_date', date)
      .order('sort_order', { ascending: true });
    if (pins && pins.length > 0) pinIds = pins.map(p => p.event_id);
  } catch { /* spotlight_events table may not exist */ }

  // Set of IDs that came from the admin-pin table. Used downstream to tag
  // each result with `source: 'manual' | 'suggested'` so the admin UI can
  // render autopilot picks as editable drafts (dashed border, DRAFT badge)
  // vs hard-committed manual pins (solid outline). Public consumers can
  // safely ignore the field.
  const pinIdSet = new Set(pinIds);

  // ── Fetch tonight's events with lean image-source embeds ───────────────
  // One round-trip pulls the data we need to classify quality tiers without
  // pre-hydrating the full waterfall. The later full-embed fetch still runs
  // for display rendering.
  //
  // IMPORTANT: `event_image` is a VIRTUAL column computed by `applyWaterfall`
  // at render time — it does NOT exist in the `events` table. The real image
  // sources on the row are `custom_image_url`, `event_image_url`, and the
  // legacy `image_url`. Selecting the non-existent `event_image` returns a
  // PostgREST error, which silently drops to `data === null` and leaves
  // `tonight = []`. That was the root cause of every future date returning
  // 0 suggested slots: the autopilot only runs if `tonight.length > 0`
  // (see the guard below), and Tier 0 pins are the only thing that survived.
  // Today's date "worked" any time there was at least one admin pin, masking
  // the bug — unpinned future dates always returned [].
  //
  // Also: we destructure `error` now and log it. The old `const { data } = ...`
  // pattern swallowed PostgREST errors as silent nulls, which is exactly how
  // this regression hid in production. If a column name drifts again, the log
  // line will surface it instead of a mystery empty carousel.
  let tonight = [];
  try {
    const { data, error } = await supabase
      .from('events')
      .select(`
        id,
        artist_id,
        artist_name,
        custom_image_url,
        event_image_url,
        image_url,
        event_date,
        artists(name, image_url, kind),
        venues(photo_url),
        event_templates(image_url)
      `)
      .eq('status', 'published')
      .gte('event_date', dateStart)
      .lte('event_date', dateEnd);
    if (error) {
      console.warn('[spotlight] tonight fetch error:', error.message);
    }
    tonight = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[spotlight] tonight fetch failed:', err.message);
  }

  const tonightById = Object.fromEntries(tonight.map(e => [e.id, e]));

  // Seed Tier 0 — preserve admin ordering, cap at MAX_SLOTS. Seed the
  // seenArtists set so the autopilot below can't repeat the pinned artists.
  for (const id of pinIds) {
    if (collected.length >= MAX_SLOTS) break;
    if (seen.has(id)) continue;
    seen.add(id);
    collected.push(id);
    const k = artistKey(tonightById[id]);
    if (k) seenArtists.add(k);
  }

  // ── Autopilot (Tiers 1–3) — runs only if Tier 0 didn't fill 5 ─────────
  // Autopilot always caps at 5 visible hero slots, even when the admin
  // requested all_pins (runner-ups are admin-curated, not auto-filled).
  const AUTOPILOT_CAP = 5;
  if (collected.length < AUTOPILOT_CAP && tonight.length > 0) {
    // Favorite counts — used as the within-tier ranker. Pulled in one bulk
    // call across all of tonight's events and aggregated in memory.
    const favCount = {};
    try {
      const { data: favs } = await supabase
        .from('favorites')
        .select('event_id')
        .in('event_id', tonight.map(e => e.id));
      if (favs) {
        for (const f of favs) {
          favCount[f.event_id] = (favCount[f.event_id] || 0) + 1;
        }
      }
    } catch {
      // favorites table may not exist — tier ranking degrades to start-time.
    }

    // Classify into quality tier. The image sources MUST match the columns
    // `applyWaterfall` considers (src/lib/waterfall.js) — `event_image` is a
    // COMPUTED virtual field and is never on the row. Real hero-quality
    // sources, in waterfall priority order:
    //     custom_image_url  (admin override)
    //     event_image_url   (scraper / admin)
    //     image_url         (legacy scraper column)
    //     artists.image_url (artist profile)
    //
    //   1 = any hero image source (the admin's "Ready" Green Badge matches
    //       this set — see AdminSpotlightTab `missingMetadataCount`).
    //   2 = only a venues.photo_url — workable visual anchor, not a hero.
    //   3 = only an event_templates.image_url — category stock art.
    //  99 = nothing usable — skip entirely.
    const classify = (e) => {
      if (
        e.custom_image_url ||
        e.event_image_url ||
        e.image_url ||
        e.artists?.image_url
      ) return 1;
      if (e.venues?.photo_url) return 2;
      if (e.event_templates?.image_url) return 3;
      return 99;
    };

    const candidates = tonight
      .filter(e => !seen.has(e.id))
      .map(e => ({ e, tier: classify(e), favs: favCount[e.id] || 0 }))
      .filter(c => c.tier < 99)
      // Primary sort:  tier (1 → 2 → 3).
      // Secondary:     favorite count desc (community hype within the tier).
      // Tertiary:      event_date asc (earlier shows win on ties).
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.favs !== b.favs) return b.favs - a.favs;
        const da = a.e.event_date || '';
        const db = b.e.event_date || '';
        return da.localeCompare(db);
      });

    for (const { e } of candidates) {
      if (collected.length >= AUTOPILOT_CAP) break;
      const k = artistKey(e);
      // Artist de-dup: skip if this artist is already represented.
      if (k && seenArtists.has(k)) continue;
      seen.add(e.id);
      if (k) seenArtists.add(k);
      collected.push(e.id);
    }
  }

  if (collected.length === 0) return NextResponse.json([]);

  const fallback = collected.map((id, i) => ({
    event_id: id,
    sort_order: i,
    source: pinIdSet.has(id) ? 'manual' : 'suggested',
  }));

  try {
    const { data: hydrated, error } = await supabase
      .from('events')
      .select('*, venues(name, address, color, latitude, longitude, venue_type, tags, photo_url, website, default_start_time), artists(name, bio, image_url, genres, vibes, is_tribute, kind), event_templates(template_name, bio, image_url, category, start_time, genres)')
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
          // 'manual' = came from spotlight_events admin pin table (Tier 0).
          // 'suggested' = filled by the Quality-First autopilot (Tiers 1–3).
          // Public consumers can ignore this field; the admin UI uses it to
          // render Suggested slots as editable DRAFT cards that auto-promote
          // to 'manual' on any user mutation.
          source: pinIdSet.has(id) ? 'manual' : 'suggested',
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

  if (event_ids.length > 8) {
    return NextResponse.json({ error: 'Maximum 8 spotlight events per day' }, { status: 400 });
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
