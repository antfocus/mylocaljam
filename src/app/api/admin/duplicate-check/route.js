import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const venue = searchParams.get('venue');
  const date = searchParams.get('date');

  if (!venue || !date) {
    return NextResponse.json({ duplicates: [] });
  }

  const supabase = getAdminClient();
  const { start, end } = getEasternDayBounds(date);

  // Find published events at the same venue on the same date (Eastern-aware)
  const { data, error } = await supabase
    .from('events')
    .select('id, artist_name, venue_name, event_date, status')
    .eq('status', 'published')
    .ilike('venue_name', venue)
    .gte('event_date', start)
    .lt('event_date', end);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ duplicates: data || [] });
}
