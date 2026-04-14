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
    .select('*, venues(name, address, color), artists(name, bio, image_url, genres, vibes, is_tribute), event_templates(template_name, bio, image_url, category, start_time)')
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
  // Treat "" and "None" as null so the image waterfall keeps falling — mirrors
  // cleanImg in event/[id]/page.js and app/page.js.
  const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;

  // Category ladder:
  //   1. event_templates.category — from the master library
  //   2. event.category           — raw scraper category fallback
  //   3. 'Other'                  — ultimate default
  const ladderApplied = (data || []).map(e => ({
    ...e,
    event_title: e.custom_title || e.event_templates?.template_name || e.event_title || '',
    category: e.event_templates?.category || e.category || 'Other',
    // Start-time ladder: template Master Time > raw event start_time.
    // Downstream consumers still handle event_date / title-regex fallbacks
    // when both rungs are null, so we don't flatten those here.
    start_time: e.event_templates?.start_time || e.start_time || null,
    // Golden Ladder (bio) — admin manual override wins.
    //   1. custom_bio           — admin manual override (highest priority)
    //   2. event_templates.bio  — AI-enriched template bio
    //   3. artists.bio          — curated band bio
    //   4. artist_bio           — raw scraper description (lowest priority)
    description: e.custom_bio || e.event_templates?.bio || e.artists?.bio || e.artist_bio || '',
    // Golden Ladder (image) — same priority order for the image waterfall.
    event_image: cleanImg(e.custom_image_url) || cleanImg(e.event_templates?.image_url) || cleanImg(e.event_image_url) || cleanImg(e.image_url) || null,
  }));

  // Prevent Vercel edge/CDN from caching stale data
  const response = NextResponse.json(ladderApplied);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return response;
}
