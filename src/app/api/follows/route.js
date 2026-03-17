import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/follows?device_id=xxx
 * Returns all follows for a device, with "next gig" data hydrated from events.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id');

  if (!deviceId) {
    return NextResponse.json({ error: 'device_id required' }, { status: 400 });
  }

  // Get all follows for this device
  const { data: follows, error } = await supabase
    .from('user_follows')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching follows:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Hydrate with "next gig" from events table
  const now = new Date().toISOString();
  const hydrated = await Promise.all(
    (follows || []).map(async (follow) => {
      let nextGig = null;

      if (follow.entity_type === 'venue') {
        const { data: events } = await supabase
          .from('events')
          .select('id, artist_name, event_date, venue_name')
          .eq('venue_name', follow.entity_name)
          .eq('status', 'published')
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(1);
        if (events?.length) nextGig = events[0];
      } else {
        // artist
        const { data: events } = await supabase
          .from('events')
          .select('id, artist_name, event_date, venue_name')
          .ilike('artist_name', follow.entity_name)
          .eq('status', 'published')
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(1);
        if (events?.length) nextGig = events[0];
      }

      return { ...follow, next_gig: nextGig };
    })
  );

  return NextResponse.json(hydrated);
}

/**
 * POST /api/follows
 * Body: { device_id, entity_type, entity_name, entity_id? }
 * Creates a follow relationship.
 */
export async function POST(request) {
  const body = await request.json();
  const { device_id, entity_type, entity_name, entity_id } = body;

  if (!device_id || !entity_type || !entity_name) {
    return NextResponse.json({ error: 'device_id, entity_type, entity_name required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_follows')
    .upsert(
      {
        device_id,
        entity_type,
        entity_name,
        entity_id: entity_id || null,
        receives_notifications: true,
      },
      { onConflict: 'device_id,entity_type,entity_name' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error creating follow:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/follows
 * Body: { device_id, entity_type, entity_name }
 * Removes a follow relationship.
 */
export async function DELETE(request) {
  const body = await request.json();
  const { device_id, entity_type, entity_name } = body;

  if (!device_id || !entity_type || !entity_name) {
    return NextResponse.json({ error: 'device_id, entity_type, entity_name required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('device_id', device_id)
    .eq('entity_type', entity_type)
    .eq('entity_name', entity_name);

  if (error) {
    console.error('Error deleting follow:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PATCH /api/follows
 * Body: { device_id, entity_type, entity_name, receives_notifications }
 * Toggles notification preference for a follow.
 */
export async function PATCH(request) {
  const body = await request.json();
  const { device_id, entity_type, entity_name, receives_notifications } = body;

  if (!device_id || !entity_type || !entity_name || receives_notifications === undefined) {
    return NextResponse.json({ error: 'device_id, entity_type, entity_name, receives_notifications required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_follows')
    .update({ receives_notifications })
    .eq('device_id', device_id)
    .eq('entity_type', entity_type)
    .eq('entity_name', entity_name)
    .select()
    .single();

  if (error) {
    console.error('Error updating notification pref:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
