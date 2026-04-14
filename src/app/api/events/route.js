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
    .select('*, venues(name, address, color), artists(name, bio, image_url, genres, vibes, is_tribute), event_templates(template_name, bio, image_url)')
    .gte('event_date', start)
    .eq('status', 'published')
    .order('event_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Title ladder:
  //   1. event.custom_title             — manual override (column may not exist yet; undefined falls through)
  //   2. event_templates.template_name  — clean name from the master library
  //   3. event.event_title              — raw scraper title fallback
  // Output is re-written into `event_title` so EventCardV2 / SiteEventCard
  // pick it up with no component changes.
  const ladderApplied = (data || []).map(e => ({
    ...e,
    event_title: e.custom_title || e.event_templates?.template_name || e.event_title || '',
  }));

  // Prevent Vercel edge/CDN from caching stale data
  const response = NextResponse.json(ladderApplied);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return response;
}
