import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// GET all artists (with optional search + needsInfo filter)
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const needsInfo = searchParams.get('needsInfo') === 'true';

  let query = supabase
    .from('artists')
    .select('*')
    .order('name', { ascending: true })
    .limit(5000);

  if (search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let results = data || [];

  // Filter to artists missing at least one key field
  if (needsInfo) {
    results = results.filter(a =>
      !a.bio ||
      !a.image_url ||
      (!a.genres || a.genres.length === 0) ||
      !a.instagram_url
    );
  }

  // Attach next_event_date for each artist (closest upcoming published event)
  // Query ALL future published events with an artist_id (no .in() filter — avoids URL length limit)
  const now = new Date().toISOString();

  if (results.length > 0) {
    const { data: upcoming } = await supabase
      .from('events')
      .select('artist_id, event_date')
      .not('artist_id', 'is', null)
      .gte('event_date', now)
      .eq('status', 'published')
      .order('event_date', { ascending: true })
      .limit(5000);

    // Build map: artist_id → earliest event_date (first seen = earliest due to sort)
    const nextEventMap = {};
    for (const ev of (upcoming || [])) {
      if (ev.artist_id && !nextEventMap[ev.artist_id]) {
        nextEventMap[ev.artist_id] = ev.event_date;
      }
    }

    for (const artist of results) {
      artist.next_event_date = nextEventMap[artist.id] || null;
    }
  }

  return NextResponse.json(results);
}

// CREATE artist
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('artists')
    .insert({
      name: body.name,
      bio: body.bio || null,
      genres: body.genres || null,
      vibes: body.vibes || null,
      image_url: body.image_url || null,
      instagram_url: body.instagram_url || null,
      is_claimed: body.is_claimed || false,
      is_tribute: body.is_tribute || false,
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}

// UPDATE artist
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id, old_name, ...updates } = body;

  // If name was changed, save the old name as an alias
  if (old_name && updates.name && old_name !== updates.name) {
    // Save old name as alias (ignore conflict if already exists)
    await supabase
      .from('artist_aliases')
      .upsert(
        { artist_id: id, alias: old_name, alias_lower: old_name.toLowerCase().trim() },
        { onConflict: 'alias_lower' }
      );

    // Update events that reference the old artist_name
    await supabase
      .from('events')
      .update({ artist_name: updates.name })
      .eq('artist_id', id);
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate live feed cache so artist changes reflect immediately
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// DELETE artist
// ?action=hide-events   → Delete artist, archive/hide all linked upcoming events
// ?action=unlink-events → Delete artist, keep events as "Other / Special Event" with null artist_id
// ?action=count-events  → Just return the count of linked upcoming events (no delete)
// (no action)           → Simple delete, no event handling
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const action = searchParams.get('action');

  if (!id) {
    return NextResponse.json({ error: 'Missing artist id' }, { status: 400 });
  }

  // Get the artist record
  const { data: artist, error: fetchErr } = await supabase
    .from('artists')
    .select('name')
    .eq('id', id)
    .single();

  if (fetchErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  // Count linked upcoming events
  const now = new Date().toISOString();
  const { data: linkedEvents } = await supabase
    .from('events')
    .select('id')
    .or(`artist_id.eq.${id},artist_name.ilike.${artist.name}`)
    .gte('event_date', now)
    .eq('status', 'published');
  const eventCount = linkedEvents?.length || 0;

  // If just counting, return without deleting
  if (action === 'count-events') {
    return NextResponse.json({ artist_name: artist.name, upcoming_event_count: eventCount });
  }

  // Option A: Delete artist & hide/archive all linked upcoming events
  if (action === 'hide-events') {
    if (eventCount > 0) {
      const eventIds = linkedEvents.map(e => e.id);
      await supabase
        .from('events')
        .update({ status: 'archived', artist_id: null, artist_bio: null, is_human_edited: true })
        .in('id', eventIds);
    }
  }

  // Option B: Delete artist, keep events as "Other / Special Event"
  if (action === 'unlink-events') {
    if (eventCount > 0) {
      const eventIds = linkedEvents.map(e => e.id);
      await supabase
        .from('events')
        .update({
          category: 'Other / Special Event',
          artist_id: null,
          artist_bio: null,
          is_human_edited: true,
        })
        .in('id', eventIds);
    }
  }

  // Legacy: convert-to-special (keep for backward compat)
  if (action === 'convert-to-special') {
    await supabase
      .from('events')
      .update({ category: 'Drink/Food Special', artist_name: null, artist_bio: null, is_human_edited: true })
      .ilike('artist_name', artist.name);
  }

  // Nuclear cleanup: also mark ALL events with this artist_name as human-edited
  // so the enrichment step never tries to re-create the artist from event data
  await supabase
    .from('events')
    .update({ artist_id: null, is_human_edited: true })
    .ilike('artist_name', artist.name);

  // Add to ignored_artists blacklist so the scraper never re-creates this profile
  await supabase
    .from('ignored_artists')
    .upsert(
      { name: artist.name, name_lower: artist.name.toLowerCase().trim(), reason: action || 'admin_deleted' },
      { onConflict: 'name_lower' }
    );

  // Delete the artist row
  const { error } = await supabase
    .from('artists')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true, action: action || 'delete', eventsAffected: eventCount });
}
