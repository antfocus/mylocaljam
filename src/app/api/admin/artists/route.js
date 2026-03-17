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
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}

// DELETE artist (supports ?action=convert-to-special to re-categorize linked events)
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const action = searchParams.get('action'); // 'convert-to-special' or null

  if (!id) {
    return NextResponse.json({ error: 'Missing artist id' }, { status: 400 });
  }

  // If converting to special, first get the artist name so we can find linked events
  if (action === 'convert-to-special') {
    // Get the artist record to find its name
    const { data: artist, error: fetchErr } = await supabase
      .from('artists')
      .select('name')
      .eq('id', id)
      .single();

    if (fetchErr || !artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Update any events with this artist_name to be a Drink/Food Special with null artist
    const { error: updateErr } = await supabase
      .from('events')
      .update({
        category: 'Drink/Food Special',
        artist_name: null,
        artist_bio: null,
      })
      .ilike('artist_name', artist.name);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to update events: ${updateErr.message}` }, { status: 500 });
    }
  }

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

  return NextResponse.json({ success: true, action: action || 'delete' });
}
