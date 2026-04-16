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
import { stripLockedFields } from '@/lib/writeGuards';

export const dynamic = 'force-dynamic';

// Max NEW artists to look up per run (keeps within Vercel timeout)
const ARTIST_LIMIT = 100;

function isAuthorized(request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false; // fail closed — SYNC_SECRET must be configured
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
  // Pulls `is_human_edited` and `is_locked` so the writeGuards pass below
  // can skip locked events entirely and strip per-field locked keys from
  // the update payload. Pre-fix, this query omitted those columns and the
  // update loop clobbered admin-edited bios/images on every run — the
  // primary source of the 7:12 PM Mariel Bildsten wipe.
  const { data: events, error: fetchErr } = await supabase
    .from('events')
    .select('id, artist_name, image_url, artist_bio, is_human_edited, is_locked')
    .eq('status', 'published')
    .not('artist_name', 'is', null)
    .or('image_url.is.null,artist_bio.is.null')
    .limit(1000);

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

  // --- 2b. Load blacklist (ignored artists) ---
  let blacklistedNames = new Set();
  try {
    const { data: bl } = await supabase.from('ignored_artists').select('name_lower').limit(5000);
    blacklistedNames = new Set((bl || []).map(b => b.name_lower));
  } catch { /* table may not exist yet */ }

  // --- 3. Look up uncached artists on Last.fm (skip blacklisted) ---
  let lookedUp = 0;
  let blacklisted = 0;
  const artistsToProcess = uncachedNames
    .filter(n => {
      if (blacklistedNames.has(n.toLowerCase().trim())) { blacklisted++; return false; }
      return true;
    })
    .slice(0, ARTIST_LIMIT);
  const errors = [];

  for (const name of artistsToProcess) {
    try {
      await enrichWithLastfm(name, supabase, { blacklist: blacklistedNames });
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
  //
  // VERIFIED-LOCK GATE (added post-7:12-PM-incident):
  //   1. Skip rows where `is_locked === true` — end-to-end admin lock.
  //   2. Run every candidate update through `stripLockedFields` so any
  //      per-field JSONB lock on `is_human_edited` is honored. This is
  //      the same pattern used in enrichArtist.js:406 for the artists
  //      table; we were the only remaining write path that bypassed it.
  let enriched = 0;
  let skipped = 0;
  let locked = 0;

  for (const ev of events) {
    if (ev.is_locked === true) { locked++; continue; }

    const artistData = freshMap[ev.artist_name.trim().toLowerCase()];
    if (!artistData) { skipped++; continue; }

    const update = {};
    if (!ev.image_url  && artistData.image_url) update.image_url  = artistData.image_url;
    if (!ev.artist_bio && artistData.bio)       update.artist_bio = artistData.bio;

    if (Object.keys(update).length === 0) { skipped++; continue; }

    // Belt-and-suspenders: even though the column list above gates on
    // `!ev.image_url && artistData.image_url`, a future bug (stale cache,
    // race with another writer) could still try to overwrite a manually-
    // set value. `stripLockedFields` will drop any key whose lock is set.
    const safeUpdate = stripLockedFields(ev, update);
    if (Object.keys(safeUpdate).length === 0) { locked++; continue; }

    const { error: updateErr } = await supabase
      .from('events')
      .update(safeUpdate)
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
    eventsLockedSkipped: locked,
    errors: errors.length ? errors : null,
  });
}

// Allow GET for easy browser/cron triggering
export async function GET(request) {
  return POST(request);
}
