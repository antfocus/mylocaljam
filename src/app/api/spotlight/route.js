import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * GET /api/spotlight?date=YYYY-MM-DD[&device_id=xxx]
 *
 * Waterfall logic to fill up to 5 spotlight slots:
 *   Tier 0: Events for tonight where is_featured = true
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

  // ── Tier 0b: Fallback — Featured events (is_featured = true)
  try {
    const { data } = await supabase
      .from('events')
      .select('id, spotlight_order')
      .eq('is_featured', true)
      .eq('status', 'published')
      .gte('event_date', dateStart)
      .lte('event_date', dateEnd)
      .order('spotlight_order', { ascending: true, nullsFirst: false })
      .order('event_date', { ascending: true })
      .limit(MAX_SLOTS);
    if (data) addIds(data.map(e => e.id));
  } catch {}

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
      .select('*, venues(name, address, color, latitude, longitude, venue_type, tags), artists(name, bio, image_url, genres, vibes, is_tribute), event_templates(template_name, bio, image_url, category)')
      .in('id', collected);

    if (error || !hydrated || hydrated.length === 0) return NextResponse.json(fallback);

    const byId = Object.fromEntries(hydrated.map(e => [e.id, e]));
    // Title ladder:
    //   1. event.custom_title             — manual override (column may not exist yet)
    //   2. event_templates.template_name  — clean name from master library
    //   3. event.event_title              — raw scraper title fallback
    const result = collected
      .map((id, i) => {
        const e = byId[id];
        if (!e) return null;
        return {
          event_id: id,
          ...e,
          event_title: e.custom_title || e.event_templates?.template_name || e.event_title || '',
          // Category ladder: template category > scraper category > 'Other'
          category: e.event_templates?.category || e.category || 'Other',
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

  return NextResponse.json({ success: true });
}
