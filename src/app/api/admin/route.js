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

  const triageFilter = searchParams.get('triage');
  const statusFilter = searchParams.get('status'); // 'upcoming' | 'past' | 'hidden'
  const missingTime = searchParams.get('missingTime') === 'true';
  const recentlyAdded = searchParams.get('recentlyAdded') === 'true';

  const pageFrom = from;
  const pageTo = to;

  let query = supabase
    .from('events')
    .select('*, venues(name, address, color), artists(name, image_url)')
    .order(sort, { ascending: order })
    .range(pageFrom, pageTo);

  // If triage=pending, only show un-reviewed events that the auto-sorter couldn't categorize
  if (triageFilter === 'pending') {
    query = query.eq('triage_status', 'pending');
    query = query.gte('event_date', new Date().toISOString());
  }

  // Server-side status filtering for Event Feed views
  const nowIso = new Date().toISOString();
  if (statusFilter === 'upcoming') {
    query = query.eq('status', 'published').gte('event_date', nowIso);
  } else if (statusFilter === 'past') {
    query = query.eq('status', 'published').lt('event_date', nowIso);
  } else if (statusFilter === 'hidden') {
    query = query.neq('status', 'published');
  }

  // Filter to events created in last 24h (for "New Events" click-through)
  if (recentlyAdded) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', since);
  }

  // Filter for missing time — uses boolean flag instead of UTC timestamp math
  if (missingTime) {
    query = query.eq('is_time_tbd', true);
  }

  const { data, error } = await query;

  let filtered = data || [];

  // Compute count
  let count;
  let countQuery = supabase.from('events').select('id', { count: 'exact', head: true });
  if (statusFilter === 'upcoming') countQuery = countQuery.eq('status', 'published').gte('event_date', nowIso);
  else if (statusFilter === 'past') countQuery = countQuery.eq('status', 'published').lt('event_date', nowIso);
  else if (statusFilter === 'hidden') countQuery = countQuery.neq('status', 'published');
  if (recentlyAdded) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    countQuery = countQuery.gte('created_at', since);
  }
  if (missingTime) countQuery = countQuery.eq('is_time_tbd', true);
  const countResult = await countQuery;
  count = countResult.count;

  const paginatedData = filtered;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Quick count: events created in last 24 hours (for dashboard velocity card)
  let newEvents24h = 0;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    newEvents24h = recentCount || 0;
  } catch { /* ignore */ }

  const total = count || 0;
  return NextResponse.json({
    events: paginatedData,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    newEvents24h,
  });
}

// CREATE event
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  // Auto-compute is_custom_metadata for new events
  const newHasCustom = !!(body.custom_bio || body.custom_genres?.length || body.custom_vibes?.length || body.custom_image_url);

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_title: body.event_title || null,
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
      category: body.category || 'Live Music',
      triage_status: 'reviewed',
      status: body.status || 'published',
      source: body.source || 'Admin',
      event_image_url: body.event_image_url || null,
      verified_at: new Date().toISOString(),
      // ── Custom metadata fields (Phase 3: Unified Visual CMS) ──────────────
      custom_bio: body.custom_bio || null,
      custom_genres: body.custom_genres || null,
      custom_vibes: body.custom_vibes || null,
      custom_image_url: body.custom_image_url || null,
      is_custom_metadata: newHasCustom,
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate live feed cache so new event appears immediately
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// UPDATE event
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id } = body;

  // ── Bulk festival rename: update event_title across all matching events ────
  if (body.bulk_rename_festival) {
    const { old_name, new_name } = body;
    if (!old_name || !new_name) return NextResponse.json({ error: 'Missing old_name or new_name' }, { status: 400 });
    const { data, error } = await supabase
      .from('events')
      .update({ event_title: new_name, is_human_edited: true })
      .eq('event_title', old_name)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath('/');
    return NextResponse.json({ renamed: data?.length || 0 });
  }

  // ── Bulk festival delete: clear event_title from all matching events ───────
  if (body.bulk_clear_festival) {
    const { festival_name } = body;
    if (!festival_name) return NextResponse.json({ error: 'Missing festival_name' }, { status: 400 });
    const { data, error } = await supabase
      .from('events')
      .update({ event_title: null, is_festival: false, is_human_edited: true })
      .eq('event_title', festival_name)
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath('/');
    return NextResponse.json({ cleared: data?.length || 0 });
  }

  // Only include known database columns — extra fields like event_time would cause PostgREST errors
  const updates = {
    ...(body.event_title !== undefined && { event_title: body.event_title || null }),
    ...(body.artist_name !== undefined && { artist_name: body.artist_name }),
    ...(body.artist_bio !== undefined && { artist_bio: body.artist_bio || null }),
    ...(body.venue_id !== undefined && { venue_id: body.venue_id || null }),
    ...(body.venue_name !== undefined && { venue_name: body.venue_name }),
    ...(body.event_date !== undefined && { event_date: body.event_date }),
    ...(body.genre !== undefined && { genre: body.genre || null }),
    ...(body.vibe !== undefined && { vibe: body.vibe || null }),
    ...(body.cover !== undefined && { cover: body.cover || null }),
    ...(body.ticket_link !== undefined && { ticket_link: body.ticket_link || null }),
    ...(body.recurring !== undefined && { recurring: body.recurring }),
    ...(body.is_spotlight !== undefined && { is_spotlight: body.is_spotlight }),
    ...(body.is_featured !== undefined && { is_featured: body.is_featured }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.source !== undefined && { source: body.source }),
    ...(body.image_url !== undefined && { image_url: body.image_url }),
    ...(body.event_image_url !== undefined && { event_image_url: body.event_image_url || null }),
    ...(body.category !== undefined && { category: body.category }),
    ...(body.triage_status !== undefined && { triage_status: body.triage_status }),
    ...(body.artist_id !== undefined && { artist_id: body.artist_id }),
    // template_id: null clears a link (use case: "unlink from template"),
    // a UUID sets the "Safe Link" from the Discovery / Event Feed matchmaker UI.
    ...(body.template_id !== undefined && { template_id: body.template_id || null }),
    // ── Custom metadata fields (Phase 3: Unified Visual CMS) ──────────────
    ...(body.custom_bio !== undefined && { custom_bio: body.custom_bio || null }),
    ...(body.custom_genres !== undefined && { custom_genres: body.custom_genres || null }),
    ...(body.custom_vibes !== undefined && { custom_vibes: body.custom_vibes || null }),
    ...(body.custom_image_url !== undefined && { custom_image_url: body.custom_image_url || null }),
    // Always mark as human-edited on any admin save — protects from scraper overwrites
    is_human_edited: true,
    verified_at: new Date().toISOString(),
  };

  // Auto-compute is_custom_metadata flag: true if ANY custom_* field is populated
  const hasAnyCustom = !!(
    (body.custom_bio !== undefined ? body.custom_bio : null) ||
    (body.custom_genres !== undefined ? body.custom_genres?.length : null) ||
    (body.custom_vibes !== undefined ? body.custom_vibes?.length : null) ||
    (body.custom_image_url !== undefined ? body.custom_image_url : null)
  );
  // Only set the flag when the client sends at least one custom_* field
  const clientSendsCustom = body.custom_bio !== undefined ||
    body.custom_genres !== undefined ||
    body.custom_vibes !== undefined ||
    body.custom_image_url !== undefined;
  if (clientSendsCustom) {
    updates.is_custom_metadata = hasAnyCustom;
  }

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
