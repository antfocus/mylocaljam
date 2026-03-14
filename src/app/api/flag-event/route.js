import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

/**
 * POST /api/flag-event
 * Public — increments cancel_flag_count or cover_flag_count for an event.
 * Does NOT change the public UI. Flags route to admin queue for manual review.
 *
 * Body: { event_id: string, flag_type: 'cancel' | 'cover' }
 */
export async function POST(request) {
  const supabase = getAdminClient();

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
