import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * GET /api/admin/spotlight-history?date=YYYY-MM-DD&limit=10
 *
 * Returns the most-recent spotlight save events for `date`, with both the
 * previous and new event_id arrays so the admin UI can show a diff and
 * offer revert. Powers the "Recent changes" panel in the Spotlight tab
 * (May 5, 2026 — item #3 of the spotlight safety pass).
 *
 * Response: array of { id, saved_at, previous_event_ids, new_event_ids,
 *                     previous_event_titles, new_event_titles }
 *
 * The titles are joined in so revert UIs can render human-readable diffs
 * without a follow-up fetch ("Restore Joe Faronea + 4 others"). Joins
 * against the events table on each id; missing/deleted events fall back
 * to the bare UUID.
 */
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '10', 10));

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Load history rows newest-first
  const { data: rows, error } = await supabase
    .from('spotlight_history')
    .select('id, saved_at, previous_event_ids, new_event_ids')
    .eq('spotlight_date', date)
    .order('saved_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[spotlight-history] query failed:', error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message },
      { status: 500 }
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json([]);
  }

  // Collect every unique event_id referenced across all history rows so we
  // can do ONE batched lookup instead of N per-row queries.
  const allIds = new Set();
  for (const r of rows) {
    for (const id of (r.previous_event_ids || [])) allIds.add(id);
    for (const id of (r.new_event_ids || [])) allIds.add(id);
  }

  let titleById = {};
  if (allIds.size > 0) {
    const { data: events } = await supabase
      .from('events')
      .select('id, artist_name, venue_name')
      .in('id', Array.from(allIds));
    if (events) {
      titleById = Object.fromEntries(
        events.map(e => [e.id, `${e.artist_name || '?'} @ ${e.venue_name || '?'}`])
      );
    }
  }

  const idsToTitles = (ids) => (ids || []).map(id => ({
    id,
    title: titleById[id] || '(deleted event)',
  }));

  return NextResponse.json(
    rows.map(r => ({
      id: r.id,
      saved_at: r.saved_at,
      previous: idsToTitles(r.previous_event_ids),
      next: idsToTitles(r.new_event_ids),
    }))
  );
}
