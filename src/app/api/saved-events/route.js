import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client that forwards the user's auth token
function getAuthClient(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * GET /api/saved-events
 * Returns all saved event IDs for the authenticated user.
 */
export async function GET(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_saved_events')
    .select('event_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data || []).map(r => r.event_id));
}

/**
 * POST /api/saved-events
 * Body: { event_id }
 * Saves an event for the authenticated user.
 */
export async function POST(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { event_id } = await request.json();
  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_saved_events')
    .upsert(
      { user_id: user.id, event_id },
      { onConflict: 'user_id,event_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/saved-events
 * Body: { event_id }
 * Removes a saved event for the authenticated user.
 */
export async function DELETE(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { event_id } = await request.json();
  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_saved_events')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', event_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
