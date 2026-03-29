import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { getEasternDayBounds } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = getAdminClient();
  // Use Eastern midnight (not UTC) so today's evening events aren't excluded
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { start } = getEasternDayBounds(todayET);

  const { data, error } = await supabase
    .from('events')
    .select('*, venues(name, address, color), artists(name, bio, image_url, genres, vibes, is_tribute)')
    .gte('event_date', start)
    .eq('status', 'published')
    .order('event_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Prevent Vercel edge/CDN from caching stale data
  const response = NextResponse.json(data);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return response;
}
