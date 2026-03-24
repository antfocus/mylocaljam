import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

/**
 * POST /api/flag-event
 * Public — increments cancel_flag_count or cover_flag_count for an event.
 * Does NOT change the public UI. Flags route to admin queue for manual review.
 *
 * Rate limited: 1 flag per IP per event per 10 minutes.
 *
 * Body: { event_id: string, flag_type: 'cancel' | 'cover' }
 */

// ── In-memory rate limiter ──────────────────────────────────────────────────
// Key: "ip:event_id" → timestamp of last flag.
// Resets on cold start, but catches hot-path abuse within a single instance.
const FLAG_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const flagLog = new Map();

// Periodic cleanup so the Map doesn't grow unbounded
const CLEANUP_INTERVAL = 5 * 60 * 1000; // every 5 min
let lastCleanup = Date.now();

function pruneStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, ts] of flagLog) {
    if (now - ts > FLAG_WINDOW_MS) flagLog.delete(key);
  }
}

function getClientIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event_id, flag_type } = body;

  if (!event_id || !['cancel', 'cover'].includes(flag_type)) {
    return NextResponse.json({ error: 'Missing event_id or invalid flag_type (must be "cancel" or "cover")' }, { status: 400 });
  }

  // ── Rate limit check ────────────────────────────────────────────────────
  pruneStaleEntries();
  const ip = getClientIP(request);
  const rateKey = `${ip}:${event_id}`;
  const lastFlag = flagLog.get(rateKey);
  if (lastFlag && Date.now() - lastFlag < FLAG_WINDOW_MS) {
    return NextResponse.json(
      { error: 'You already flagged this event recently. Please wait before trying again.' },
      { status: 429 }
    );
  }
  flagLog.set(rateKey, Date.now());

  // ── Database update ─────────────────────────────────────────────────────
  const supabase = getAdminClient();
  const column = flag_type === 'cancel' ? 'cancel_flag_count' : 'cover_flag_count';

  // Fetch current count
  const { data: event, error: fetchErr } = await supabase
    .from('events')
    .select(column)
    .eq('id', event_id)
    .single();

  if (fetchErr || !event) {
    return NextResponse.json({ error: fetchErr?.message || 'Event not found' }, { status: 404 });
  }

  const currentCount = event[column] || 0;

  // Increment
  const { error: updateErr } = await supabase
    .from('events')
    .update({ [column]: currentCount + 1 })
    .eq('id', event_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    event_id,
    flag_type,
    new_count: currentCount + 1,
  });
}
