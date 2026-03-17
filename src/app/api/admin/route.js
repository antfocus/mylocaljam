import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// GET events with pagination support
// Query params: page (1-based), limit (default 100), sort (column), order (asc/desc)
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));
  const sort = searchParams.get('sort') || 'event_date';
  const order = searchParams.get('order') === 'desc' ? false : true; // ascending by default
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = getAdminClient();

  // Get total count
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true });

  const { data, error } = await supabase
    .from('events')
    .select('*, venues(name, address, color)')
    .order(sort, { ascending: order })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: data,
    pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
  });
}

// CREATE event
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('events')
    .insert({
      artist_name: body.artist_name,
      artist_bio: body.artist_bio || null,
      venue_id: body.venue_id || null,
      venue_name: body.venue_name,
      event_date: body.event_date,
      genre: body.genre || null,
      vibe: body.vibe || null,
      cover: body.cover || null,
      ticket_link: body.ticket_link || null,
      recurring: body.recurring || false,
      is_spotlight: body.is_spotlight || false,
      status: body.status || 'published',
      source: body.source || 'Admin',
      verified_at: new Date().toISOString(),
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}

// UPDATE event
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id, ...updates } = body;

  updates.verified_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate live feed cache after any event update
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// DELETE event
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true });
}
