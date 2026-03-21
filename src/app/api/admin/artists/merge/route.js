import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/artists/merge
 * Body: { masterId: string, duplicateIds: string[] }
 *
 * Transaction:
 *   1. Re-point all events from duplicate artists → master artist
 *   2. Delete the duplicate artist rows
 *   3. Revalidate cache
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { masterId, duplicateIds } = await request.json();

  if (!masterId || !duplicateIds?.length) {
    return NextResponse.json({ error: 'masterId and duplicateIds[] are required' }, { status: 400 });
  }

  // Validate master exists
  const { data: master, error: masterErr } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', masterId)
    .single();

  if (masterErr || !master) {
    return NextResponse.json({ error: 'Master artist not found' }, { status: 404 });
  }

  // Fetch duplicate artist names (needed for artist_name text matching)
  const { data: duplicates, error: dupErr } = await supabase
    .from('artists')
    .select('id, name')
    .in('id', duplicateIds);

  if (dupErr || !duplicates?.length) {
    return NextResponse.json({ error: 'Duplicate artists not found' }, { status: 404 });
  }

  let totalEventsTransferred = 0;

  // Step A+B: For each duplicate, transfer events to master
  for (const dup of duplicates) {
    // Transfer events linked by artist_id
    const { data: byId } = await supabase
      .from('events')
      .update({ artist_id: masterId, artist_name: master.name })
      .eq('artist_id', dup.id)
      .select('id');

    totalEventsTransferred += byId?.length || 0;

    // Also transfer events matched only by artist_name (no artist_id set)
    const { data: byName } = await supabase
      .from('events')
      .update({ artist_id: masterId, artist_name: master.name })
      .ilike('artist_name', dup.name)
      .is('artist_id', null)
      .select('id');

    totalEventsTransferred += byName?.length || 0;
  }

  // Step C: Save duplicate names as aliases on the master profile
  for (const dup of duplicates) {
    if (dup.name.toLowerCase().trim() !== master.name.toLowerCase().trim()) {
      await supabase
        .from('artist_aliases')
        .upsert(
          { artist_id: masterId, alias: dup.name, alias_lower: dup.name.toLowerCase().trim() },
          { onConflict: 'alias_lower' }
        );
    }
  }

  // Step D: Delete the duplicate artist rows
  const { error: deleteErr } = await supabase
    .from('artists')
    .delete()
    .in('id', duplicateIds);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({
    success: true,
    master: master.name,
    merged: duplicates.map(d => d.name),
    eventsTransferred: totalEventsTransferred,
  });
}
