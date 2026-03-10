/**
 * /api/enrich-artists
 *
 * Enriches events with artist images and bios from Last.fm.
 * Processes events that are missing an image_url or artist_bio.
 *
 * Supports two modes:
 *   POST /api/enrich-artists          → enrich all unenriched events (up to limit)
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

// Max events to process per run (to stay within Vercel's 10s serverless timeout)
const BATCH_LIMIT = 30;

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

  // Fetch events that are missing image_url OR artist_bio, limited to BATCH_LIMIT
  const { data: events, error: fetchErr } = await supabase
    .from('events')
    .select('id, artist_name, image_url, artist_bio')
    .eq('status', 'published')
    .not('artist_name', 'is', null)
    .or('image_url.is.null,artist_bio.is.null')
    .limit(BATCH_LIMIT);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!events?.length) {
    return NextResponse.json({ ok: true, message: 'All events already enriched', processed: 0, duration: '0s' });
  }

  // Dry run: just report how many would be processed
  if (isDry) {
    // Count all unenriched events (not just the first BATCH_LIMIT)
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .not('artist_name', 'is', null)
      .or('image_url.is.null,artist_bio.is.null');

    return NextResponse.json({
      ok: true,
      dry: true,
      totalUnenriched: count,
      wouldProcess: events.length,
    });
  }

  // Process events
  let enriched = 0;
  let skipped  = 0;
  const errors = [];

  for (const ev of events) {
    try {
      const artistData = await enrichWithLastfm(ev.artist_name, supabase);
      if (!artistData) { skipped++; continue; }

      // Build update: only overwrite fields that are currently null
      const update = {};
      if (!ev.image_url   && artistData.image_url) update.image_url  = artistData.image_url;
      if (!ev.artist_bio  && artistData.bio)        update.artist_bio = artistData.bio;

      if (Object.keys(update).length === 0) { skipped++; continue; }

      const { error: updateErr } = await supabase
        .from('events')
        .update(update)
        .eq('id', ev.id);

      if (updateErr) {
        errors.push(`${ev.artist_name}: ${updateErr.message}`);
      } else {
        enriched++;
      }
    } catch (err) {
      errors.push(`${ev.artist_name}: ${err.message}`);
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    duration,
    processed: events.length,
    enriched,
    skipped,
    errors: errors.length ? errors : null,
  });
}

// Allow GET for easy browser/cron triggering
export async function GET(request) {
  return POST(request);
}
