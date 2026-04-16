import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// GET all artists (with optional search + needsInfo filter)
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const needsInfo = searchParams.get('needsInfo') === 'true';

  let query = supabase
    .from('artists')
    .select('*')
    .order('name', { ascending: true })
    .limit(5000);

  if (search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let results = data || [];

  // ── Ghost Hunt Blacklist: drop any artists whose name is on the
  //    ignored_artists list. Prevents noise rows ("Pizza Night", "Trivia
  //    Tuesday") from rematerializing in the admin UI if the scraper briefly
  //    re-creates them between sync runs.
  try {
    const { data: ignored } = await supabase
      .from('ignored_artists')
      .select('name_lower');
    if (Array.isArray(ignored) && ignored.length > 0) {
      const blocklist = new Set(ignored.map(r => r.name_lower).filter(Boolean));
      results = results.filter(a => !blocklist.has((a.name || '').toLowerCase().trim()));
    }
  } catch (blErr) {
    // Non-fatal — if the table doesn't exist yet, just skip the filter.
    console.error('ignored_artists filter failed (non-fatal):', blErr);
  }

  // Filter to artists missing at least one key field
  if (needsInfo) {
    results = results.filter(a =>
      !a.bio ||
      !a.image_url ||
      (!a.genres || a.genres.length === 0)
    );
  }

  // Attach next_event_date for each artist (closest upcoming published event)
  // Query ALL future published events with an artist_id (no .in() filter — avoids URL length limit)
  const now = new Date().toISOString();

  if (results.length > 0) {
    const { data: upcoming } = await supabase
      .from('events')
      .select('artist_id, event_date')
      .not('artist_id', 'is', null)
      .gte('event_date', now)
      .eq('status', 'published')
      .order('event_date', { ascending: true })
      .limit(5000);

    // Build map: artist_id → earliest event_date (first seen = earliest due to sort)
    const nextEventMap = {};
    for (const ev of (upcoming || [])) {
      if (ev.artist_id && !nextEventMap[ev.artist_id]) {
        nextEventMap[ev.artist_id] = ev.event_date;
      }
    }

    for (const artist of results) {
      artist.next_event_date = nextEventMap[artist.id] || null;
    }
  }

  return NextResponse.json(results);
}

// CREATE artist
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();

  // ── Manual Add Artist guardrails ──────────────────────────────────────
  // The Artists tab now has a "+ Add Artist" button that hits this route
  // with just `{ name }`. Validate, dedupe (case-insensitive), and refuse
  // names sitting on the ignored_artists blacklist so an admin can't
  // accidentally re-create a ghost we just blacklisted.
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'Artist name is too long (max 200 chars)' }, { status: 400 });
  }

  const nameLower = name.toLowerCase();

  // Block names on the ignored_artists list — non-fatal if table missing.
  try {
    const { data: ignoredRow } = await supabase
      .from('ignored_artists')
      .select('name_lower')
      .eq('name_lower', nameLower)
      .maybeSingle();
    if (ignoredRow) {
      return NextResponse.json(
        { error: `"${name}" is on the ignored-artists blacklist. Remove it from the blacklist before re-adding.` },
        { status: 409 }
      );
    }
  } catch (blErr) {
    console.error('ignored_artists check failed (non-fatal):', blErr);
  }

  // Case-insensitive duplicate check
  const { data: existing } = await supabase
    .from('artists')
    .select('id, name')
    .ilike('name', name)
    .limit(1);
  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json(
      { error: `Artist "${existing[0].name}" already exists.`, existing: existing[0] },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('artists')
    .insert({
      name,
      bio: body.bio || null,
      genres: body.genres || null,
      vibes: body.vibes || null,
      image_url: body.image_url || null,
      is_claimed: body.is_claimed || false,
      is_tribute: body.is_tribute || false,
      metadata_source: body.metadata_source || 'manual',
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json(data[0]);
}

// UPDATE artist
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id, old_name, ...updates } = body;

  // ── Confidence Cascade: default_category enum guard ───────────────────
  // Tier-1 bypass column. Must stay inside this enum prison or the
  // sync-events route will write garbage categories to event rows.
  const ALLOWED_DEFAULT_CATEGORIES = [
    'Live Music', 'Trivia', 'Karaoke', 'DJ/Dance Party',
    'Comedy', 'Food & Drink', 'Sports', 'Other',
  ];
  if (updates.default_category !== undefined && updates.default_category !== null) {
    if (!ALLOWED_DEFAULT_CATEGORIES.includes(updates.default_category)) {
      return NextResponse.json(
        { error: `Invalid default_category. Must be one of: ${ALLOWED_DEFAULT_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }
  }

  // Backend lock validation: strip any fields that are locked via is_human_edited
  // This prevents locked fields from being overwritten even if the frontend is bypassed
  if (id) {
    const { data: existing } = await supabase
      .from('artists')
      .select('is_human_edited')
      .eq('id', id)
      .single();

    if (existing?.is_human_edited && typeof existing.is_human_edited === 'object') {
      const locks = existing.is_human_edited;
      const lockableFields = ['name', 'bio', 'genres', 'vibes', 'image_url'];
      for (const field of lockableFields) {
        // If the field is locked in the DB and the incoming update isn't explicitly unlocking it,
        // strip it from the update payload
        if (locks[field] && updates[field] !== undefined) {
          // Allow the update if is_human_edited is also being sent and the field is being unlocked
          const incomingLocks = updates.is_human_edited;
          const isUnlocking = incomingLocks && typeof incomingLocks === 'object' && !incomingLocks[field];
          if (!isUnlocking) {
            delete updates[field];
          }
        }
      }
    }
  }

  // If name was changed, save the old name as an alias in BOTH stores so
  // the array UI and the lookup table stay symmetric.
  if (old_name && updates.name && old_name !== updates.name) {
    // 1. Log into artist_aliases (lookup table, read by the sync pipeline).
    await supabase
      .from('artist_aliases')
      .upsert(
        { artist_id: id, alias: old_name, alias_lower: old_name.toLowerCase().trim() },
        { onConflict: 'alias_lower' }
      );

    // 2. Append to artists.alias_names (array column, read by the admin UI).
    //    Merge with any admin-supplied alias_names on the same request so a
    //    concurrent rename + tag-input edit doesn't clobber either source.
    try {
      const { data: aRow } = await supabase
        .from('artists')
        .select('alias_names')
        .eq('id', id)
        .single();
      const existing = Array.isArray(aRow?.alias_names) ? aRow.alias_names : [];
      const incoming = Array.isArray(updates.alias_names) ? updates.alias_names : [];
      const seen = new Set();
      const merged = [];
      for (const a of [...existing, ...incoming, old_name]) {
        const t = (a || '').trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (k === updates.name.trim().toLowerCase()) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(t);
      }
      updates.alias_names = merged;
    } catch (mergeErr) {
      console.error('alias_names merge on rename failed (non-fatal):', mergeErr);
    }

    // 3. Update events that reference the old artist_name
    await supabase
      .from('events')
      .update({ artist_name: updates.name })
      .eq('artist_id', id);
  }

  // If meaningful fields are being updated from admin, stamp metadata_source as 'manual'
  // (unless explicitly passed — e.g. bulk AI enrich passes 'ai_generated')
  if (!updates.metadata_source) {
    const manualFields = ['bio', 'image_url', 'genres', 'vibes'];
    const hasManualEdit = manualFields.some(f => updates[f] !== undefined);
    if (hasManualEdit) {
      updates.metadata_source = 'manual';
    }
  }

  const { data, error } = await supabase
    .from('artists')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Sync bio to events table so the stale events.artist_bio doesn't
  //    override the fresh artists.bio in the waterfall
  //    (page.js uses: e.artist_bio || e.artists?.bio || '')
  if (updates.bio !== undefined) {
    await supabase
      .from('events')
      .update({ artist_bio: updates.bio })
      .eq('artist_id', id);
  }

  // ── Mirror alias_names into the artist_aliases reverse-FK table ──────────
  // The sync pipeline matches incoming scraper names via artist_aliases.alias_lower
  // (see src/app/api/sync-events/route.js ~line 808). To make the manually-
  // entered aliases from the tag-input UI actually resolve on future syncs,
  // we upsert each alias here. Non-fatal — missing mirror shouldn't block
  // the save, just degrade learning.
  if (Array.isArray(updates.alias_names)) {
    try {
      const rows = updates.alias_names
        .filter(a => typeof a === 'string' && a.trim().length > 0)
        .map(a => ({
          artist_id: id,
          alias: a.trim(),
          alias_lower: a.trim().toLowerCase(),
        }));
      if (rows.length > 0) {
        await supabase
          .from('artist_aliases')
          .upsert(rows, { onConflict: 'alias_lower' });
      }
    } catch (aliasErr) {
      console.error('Alias mirror to artist_aliases failed (non-fatal):', aliasErr);
    }
  }

  // Invalidate live feed cache so artist changes reflect immediately
  revalidatePath('/');
  revalidatePath('/api/events');
  revalidatePath('/api/spotlight');

  return NextResponse.json(data[0]);
}

// DELETE artist
// ?action=hide-events   → Delete artist, archive/hide all linked upcoming events
// ?action=unlink-events → Delete artist, keep events as "Other / Special Event" with null artist_id
// ?action=count-events  → Just return the count of linked upcoming events (no delete)
// (no action)           → Simple delete, no event handling
export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const action = searchParams.get('action');

  if (!id) {
    return NextResponse.json({ error: 'Missing artist id' }, { status: 400 });
  }

  // Get the artist record
  const { data: artist, error: fetchErr } = await supabase
    .from('artists')
    .select('name')
    .eq('id', id)
    .single();

  if (fetchErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  // Count linked upcoming events
  const now = new Date().toISOString();
  const { data: linkedEvents } = await supabase
    .from('events')
    .select('id')
    .or(`artist_id.eq.${id},artist_name.ilike.${artist.name}`)
    .gte('event_date', now)
    .eq('status', 'published');
  const eventCount = linkedEvents?.length || 0;

  // If just counting, return without deleting
  if (action === 'count-events') {
    return NextResponse.json({ artist_name: artist.name, upcoming_event_count: eventCount });
  }

  // Option A: Delete artist & hide/archive all linked upcoming events
  if (action === 'hide-events') {
    if (eventCount > 0) {
      const eventIds = linkedEvents.map(e => e.id);
      await supabase
        .from('events')
        .update({ status: 'archived', artist_id: null, artist_bio: null, is_human_edited: true })
        .in('id', eventIds);
    }
  }

  // Option B: Delete artist, keep events as "Other / Special Event"
  if (action === 'unlink-events') {
    if (eventCount > 0) {
      const eventIds = linkedEvents.map(e => e.id);
      await supabase
        .from('events')
        .update({
          category: 'Other / Special Event',
          artist_id: null,
          artist_bio: null,
          is_human_edited: true,
        })
        .in('id', eventIds);
    }
  }

  // Legacy: convert-to-special (keep for backward compat)
  // Scoped to the same upcoming-published set used everywhere else in this
  // handler. The old implementation used an unscoped .ilike('artist_name',
  // artist.name) which reached into past rows and future rows at other
  // dates — exact shape of the 2026-04-14 "7:12 PM Ghost" that falsely
  // locked 5 April 21 rows. See HANDOVER 2026-04-16 postmortem.
  if (action === 'convert-to-special' && eventCount > 0) {
    const eventIds = linkedEvents.map(e => e.id);
    await supabase
      .from('events')
      .update({ category: 'Drink/Food Special', artist_name: null, artist_bio: null, is_human_edited: true })
      .in('id', eventIds);
  }

  // Cleanup sweep — flip the lock on every linked upcoming event so the
  // scraper/enrichment pipeline can't immediately re-recreate the deleted
  // artist profile from tomorrow's sync. SCOPED to `eventIds` (the upcoming
  // published set from linkedEvents above) rather than the fuzzy
  // `.ilike('artist_name', artist.name)` it used to use. The old shape was
  // the smoking gun for the 7:12 PM Ghost (2026-04-14) — an artist delete
  // would stamp `is_human_edited=true` on past events AND on future events
  // at unrelated dates that happened to share a fuzzy-matching name. With
  // the scoped set:
  //   • Today + future: lock flipped correctly (these ids are already the
  //     upcoming-published rows linkedEvents returned).
  //   • Past: untouched — archived history stays as-is.
  //   • Other venues / other dates matching by name coincidence: untouched
  //     unless they're also upcoming-published-linked (which is the whole
  //     point — that's when they'd be legitimately affected).
  if (eventCount > 0) {
    const eventIds = linkedEvents.map(e => e.id);
    await supabase
      .from('events')
      .update({ artist_id: null, is_human_edited: true })
      .in('id', eventIds);
  }

  // Add to ignored_artists blacklist so the scraper never re-creates this profile
  await supabase
    .from('ignored_artists')
    .upsert(
      { name: artist.name, name_lower: artist.name.toLowerCase().trim(), reason: action || 'admin_deleted' },
      { onConflict: 'name_lower' }
    );

  // Delete the artist row
  const { error } = await supabase
    .from('artists')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true, action: action || 'delete', eventsAffected: eventCount });
}
