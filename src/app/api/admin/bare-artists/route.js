/**
 * GET /api/admin/bare-artists?limit=10
 *
 * Returns the next N artists that need bulk-enrichment, in priority order.
 * Used by the Queue sub-tab's "Run next N" button to pick the most useful
 * batch to send to /api/admin/bulk-enrich.
 *
 * Selection criteria:
 *   • Artist bio is null OR empty (definition of "bare").
 *   • Artist kind = 'musician' (skip event-row and billing-row entries —
 *     those don't need bios; they're admin-managed labels).
 *   • Not already locked (is_locked != true).
 *   • Not already in pending_enrichments with status='pending' (avoids
 *     re-queueing artists the admin hasn't reviewed yet).
 *
 * Priority ordering: artists with the soonest upcoming event come first
 * (highest leverage for pre-launch enrichment — these are the artists
 * users will see this week). Artists with no upcoming events come last.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let limit = parseInt(searchParams.get('limit'), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const supabase = getAdminClient();

  // Step 1: pull all bare-bio musicians that aren't currently locked.
  // We over-fetch slightly so the post-filter (excluding pending) still
  // leaves enough rows. 4× the limit is a reasonable buffer.
  const { data: candidates, error: candErr } = await supabase
    .from('artists')
    .select('id, name, kind, bio, is_locked, last_fetched')
    .or('bio.is.null,bio.eq.')
    .eq('kind', 'musician')
    .or('is_locked.is.null,is_locked.eq.false')
    .limit(limit * 4);

  if (candErr) {
    return NextResponse.json({ error: candErr.message }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ items: [], total: 0 });
  }

  // Step 2: filter out artists already in pending_enrichments (status='pending').
  const ids = candidates.map(a => a.id);
  const { data: pending, error: pendErr } = await supabase
    .from('pending_enrichments')
    .select('artist_id')
    .in('artist_id', ids)
    .eq('status', 'pending');

  if (pendErr) {
    return NextResponse.json({ error: pendErr.message }, { status: 500 });
  }
  const alreadyPending = new Set((pending || []).map(p => p.artist_id));
  const filtered = candidates.filter(a => !alreadyPending.has(a.id));

  // Step 3: enrich with next-event context for priority ordering. Pull the
  // soonest upcoming event per artist; use its date for sort. Artists
  // with no upcoming events sort last (after the dated ones).
  const nowIso = new Date().toISOString();
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('artist_id, event_date, venue_id, venues(name, city)')
    .in('artist_id', filtered.map(a => a.id))
    .gte('event_date', nowIso)
    .order('event_date', { ascending: true });

  if (evErr) {
    // Non-fatal — we can still return artists without event context.
    console.warn('[bare-artists] event lookup failed:', evErr.message);
  }

  const nextEventByArtist = new Map();
  for (const ev of events || []) {
    if (!nextEventByArtist.has(ev.artist_id)) {
      nextEventByArtist.set(ev.artist_id, ev);
    }
  }

  // Step 4: sort + slice to the requested limit. Soonest event first;
  // no-event artists sorted by last_fetched asc (longest-untouched first).
  const enriched = filtered.map(a => ({
    id: a.id,
    name: a.name,
    next_event_date: nextEventByArtist.get(a.id)?.event_date || null,
    next_event_venue: nextEventByArtist.get(a.id)?.venues?.name || null,
    next_event_city: nextEventByArtist.get(a.id)?.venues?.city || null,
  }));

  enriched.sort((x, y) => {
    if (x.next_event_date && y.next_event_date) {
      return x.next_event_date.localeCompare(y.next_event_date);
    }
    if (x.next_event_date) return -1;
    if (y.next_event_date) return 1;
    return (x.name || '').localeCompare(y.name || '');
  });

  const items = enriched.slice(0, limit);

  return NextResponse.json({
    items,
    total: items.length,
    pool_size: filtered.length,
  });
}
