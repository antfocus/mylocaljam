import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

/**
 * POST /api/admin/artists/backfill
 *
 * One-time backfill: extracts every unique artist_name from the events table
 * and upserts them into the artists table. Also maps over image_url and
 * artist_bio from events where available.
 *
 * Safe to re-run — uses ON CONFLICT (name) DO UPDATE so existing rows get
 * their image/bio filled in without overwriting manually-entered data.
 */

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const start = Date.now();

  // 1. Fetch ALL events with artist names (paginate in 1000-row chunks)
  let events = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error: evErr } = await supabase
      .from('events')
      .select('artist_name, artist_bio, image_url, genre')
      .not('artist_name', 'is', null)
      .neq('artist_name', '')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    events = events.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    page++;
  }

  if (!events.length) {
    return NextResponse.json({ ok: true, message: 'No events with artist names found', inserted: 0 });
  }

  // 2. Build a map of unique artist names, picking the best available data
  const artistMap = {};
  for (const ev of events) {
    const name = ev.artist_name.trim();
    if (!name) continue;

    // Normalize to lowercase key for dedup, but keep original casing
    const key = name.toLowerCase();
    if (!artistMap[key]) {
      artistMap[key] = { name, image_url: null, bio: null, genres: null };
    }

    // Fill in data from events — prefer non-null values
    const entry = artistMap[key];
    if (!entry.image_url && ev.image_url) entry.image_url = ev.image_url;
    if (!entry.bio && ev.artist_bio) entry.bio = ev.artist_bio;
    if (!entry.genres && ev.genre) entry.genres = [ev.genre];
  }

  const uniqueArtists = Object.values(artistMap);

  // 3. Fetch existing artists to know what we already have (paginated)
  let existing = [];
  let aPage = 0;
  while (true) {
    const { data } = await supabase
      .from('artists')
      .select('name, image_url, bio, genres')
      .range(aPage * PAGE_SIZE, (aPage + 1) * PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    existing = existing.concat(data);
    if (data.length < PAGE_SIZE) break;
    aPage++;
  }

  const existingMap = {};
  for (const a of (existing || [])) {
    existingMap[a.name.toLowerCase()] = a;
  }

  // 4. Split into inserts (new) and updates (fill gaps on existing)
  const toInsert = [];
  const toUpdate = [];

  for (const artist of uniqueArtists) {
    const key = artist.name.toLowerCase();
    const ex = existingMap[key];

    if (!ex) {
      // New artist — insert
      toInsert.push({
        name: artist.name,
        image_url: artist.image_url || null,
        bio: artist.bio || null,
        genres: artist.genres || null,
      });
    } else {
      // Existing — only update fields that are currently null
      const updates = {};
      if (!ex.image_url && artist.image_url) updates.image_url = artist.image_url;
      if (!ex.bio && artist.bio) updates.bio = artist.bio;
      if ((!ex.genres || ex.genres.length === 0) && artist.genres) updates.genres = artist.genres;

      if (Object.keys(updates).length > 0) {
        toUpdate.push({ name: ex.name, ...updates });
      }
    }
  }

  // 5. Batch insert new artists (50 per batch)
  let inserted = 0;
  let insertErrors = [];
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error } = await supabase.from('artists').insert(batch);
    if (error) {
      insertErrors.push(`Batch ${Math.floor(i/50)}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  // 6. Update existing artists with missing data
  let updated = 0;
  let updateErrors = [];
  for (const upd of toUpdate) {
    const { name, ...fields } = upd;
    const { error } = await supabase
      .from('artists')
      .update(fields)
      .eq('name', name);
    if (error) {
      updateErrors.push(`${name}: ${error.message}`);
    } else {
      updated++;
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    duration,
    eventsScanned: events.length,
    uniqueArtistsFound: uniqueArtists.length,
    existingArtists: Object.keys(existingMap).length,
    newArtistsInserted: inserted,
    existingArtistsUpdated: updated,
    insertErrors: insertErrors.length ? insertErrors : null,
    updateErrors: updateErrors.length ? updateErrors : null,
  });
}
