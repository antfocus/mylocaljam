import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client that forwards the user's auth token (respects RLS)
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
 * GET /api/follows
 * Returns all followed artists for the authenticated user, with "next gig" hydrated.
 */
export async function GET(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: follows, error } = await supabase
    .from('user_followed_artists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Hydrate with "next gig" from events table
  const now = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { getAdminClient } = await import('@/lib/supabase');
  const admin = getAdminClient();

  const hydrated = await Promise.all(
    (follows || []).map(async (follow) => {
      let next_gig = null;
      const { data: events } = await admin
        .from('events')
        .select('id, artist_name, event_date, venue_name')
        .ilike('artist_name', follow.artist_name)
        .eq('status', 'published')
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(1);
      if (events?.length) next_gig = events[0];

      return {
        entity_type: 'artist',
        entity_name: follow.artist_name,
        receives_notifications: follow.receives_notifications,
        created_at: follow.created_at,
        next_gig,
      };
    })
  );

  return NextResponse.json(hydrated);
}

/**
 * POST /api/follows
 * Body: { artist_name }
 * Follows an artist for the authenticated user.
 */
export async function POST(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artist_name } = await request.json();
  if (!artist_name) {
    return NextResponse.json({ error: 'artist_name required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_followed_artists')
    .upsert(
      { user_id: user.id, artist_name, receives_notifications: true },
      { onConflict: 'user_id,artist_name' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/follows
 * Body: { artist_name }
 * Unfollows an artist for the authenticated user.
 */
export async function DELETE(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artist_name } = await request.json();
  if (!artist_name) {
    return NextResponse.json({ error: 'artist_name required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_followed_artists')
    .delete()
    .eq('user_id', user.id)
    .eq('artist_name', artist_name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/follows
 * Body: { artist_name, receives_notifications }
 * Toggles notification preference for a followed artist.
 */
export async function PATCH(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artist_name, receives_notifications } = await request.json();
  if (!artist_name || receives_notifications === undefined) {
    return NextResponse.json({ error: 'artist_name, receives_notifications required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_followed_artists')
    .update({ receives_notifications })
    .eq('user_id', user.id)
    .eq('artist_name', artist_name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
