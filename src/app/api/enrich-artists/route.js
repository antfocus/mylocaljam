/**
 * /api/enrich-artists
 *
 * Enriches events with artist images and bios from Last.fm.
 *
 * How it works:
 *   1. Gets unique artist names from events that are missing image_url or artist_bio
 *   2. Checks the `artists` cache table — skips any artist already looked up
 *   3. For uncached artists, calls Last.fm and caches the result (even "not found")
 *   4. Updates matching events with any new image/bio data
 *
 * Supports two modes:
 *   POST /api/enrich-artists          → enrich new artists (up to limit)
 *   POST /api/enrich-artists?dry=true → count only, no writes
 *
 * Auth: same SYNC_SECRET Bearer token as sync-events.
 *
 * Supabase setup required (run once in SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS artists (
 *     id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     name         TEXT UNIQUE NOT NULL,
 *     image_url    TEXT,
 *     bio          TEXT,
 *     tags         TEXT,
 *     last_fetched TIMESTAMPTZ,
 *     created_at   TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 *   ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
 *
 * Also add LASTFM_API_KEY to Vercel environment variables.
 * Get a free key at: https://www.last.fm/api/account/create
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { enrichWithLastfm } from '@/lib/enrichLastfm';

export const dynamic = 'force-dynamic';

// Max NEW artists to look up per run (keeps within Vercel timeout)
const ARTIST_LIMIT = 20;

function isAuthorized(request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const isDry = searchParams.get('dry') === 'true';

  const start = Date.now();
  const supabase = getAdminClient();

  // --- 1. Get all unique artist names from unenriched events ---
  const { data: events, error: fetchErr } = await supabase
    .from('events')
    .select('id, artist_name, image_url, artist_bio')
    .eq('status', 'published')
    .not('artist_name', 'is', null)
    .or('image_url.is.null,artist_bio.is.null')
    .limit(500);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!events?.length) {
    return NextResponse.json({ ok: true, message: 'All events already enriched', processed: 0, duration: '0s' });
  }

  // Deduplicate artist names
  const uniqueArtists = [...new Set(events.map(e => e.artist_name.trim()))];

  // --- 2. Check which artists are already cached ---
  const { data: cachedArtists } = await supabase
    .from('artists')
    .select('name, image_url, bio')
    .in('name', uniqueArtists.slice(0, 200)); // Supabase IN limit

  const cachedMap = {};
  for (const a of (cachedArtists || [])) {
    cachedMap[a.name.toLowerCase()] = a;
  }

  // Split into cached vs uncached
  const uncachedNames = uniqueArtists.filter(n => !cachedMap[n.toLowerCase()]);
  const cachedWithData = uniqueArtists.filter(n => {
    const c = cachedMap[n.toLowerCase()];
    return c && (c.image_url || c.bio);
  });

  // Dry run
  if (isDry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      totalUnenrichedEvents: events.length,
      uniqueArtists: uniqueArtists.length,
      alreadyCached: Object.keys(cachedMap).length,
      uncachedToLookUp: uncachedNames.length,
      cachedWithUsefulData: cachedWithData.length,
    });
  }

  // --- 3. Look up uncached artists on Last.fm ---
  let lookedUp = 0;
  const artistsToProcess = uncachedNames.slice(0, ARTIST_LIMIT);
  const errors = [];

  for (const name of artistsToProcess) {
    try {
      await enrichWithLastfm(name, supabase);
      lookedUp++;
      // Small delay to not hammer Last.fm
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  // Reload cache after lookups
  const { data: allCached } = await supabase
    .from('artists')
    .select('name, image_url, bio')
    .in('name', uniqueArtists.slice(0, 200));

  const freshMap = {};
  for (const a of (allCached || [])) {
    freshMap[a.name.toLowerCase()] = a;
  }

  // --- 4. Update events with enriched data ---
  let enriched = 0;
  let skipped = 0;

  for (const ev of events) {
    const artistData = freshMap[ev.artist_name.trim().toLowerCase()];
    if (!artistData) { skipped++; continue; }

    const update = {};
    if (!ev.image_url  && artistData.image_url) update.image_url  = artistData.image_url;
    if (!ev.artist_bio && artistData.bio)       update.artist_bio = artistData.bio;

    if (Object.keys(update).length === 0) { skipped++; continue; }

    const { error: updateErr } = await supabase
      .from('events')
      .update(update)
      .eq('id', ev.id);

    if (updateErr) {
      errors.push(`Event ${ev.id}: ${updateErr.message}`);
    } else {
      enriched++;
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    duration,
    artistsLookedUp: lookedUp,
    artistsRemaining: Math.max(0, uncachedNames.length - ARTIST_LIMIT),
    eventsEnriched: enriched,
    eventsSkipped: skipped,
    errors: errors.length ? errors : null,
  });
}

// Allow GET for easy browser/cron triggering
export async function GET(request) {
  return POST(request);
}
