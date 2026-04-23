import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/artists/merge
 * Body: { masterId: string, duplicateIds: string[] }
 *
 * Transaction:
 *   1. Re-point all events from duplicate artists → master artist
 *   2. Delete the duplicate artist rows
 *   3. Revalidate cache
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { masterId, duplicateIds } = await request.json();

  if (!masterId || !duplicateIds?.length) {
    return NextResponse.json({ error: 'masterId and duplicateIds[] are required' }, { status: 400 });
  }

  // Validate master exists (pull alias_names too so we can merge into the array)
  const { data: master, error: masterErr } = await supabase
    .from('artists')
    .select('id, name, alias_names')
    .eq('id', masterId)
    .single();

  if (masterErr || !master) {
    return NextResponse.json({ error: 'Master artist not found' }, { status: 404 });
  }

  // Fetch duplicate artist names + their existing aliases — the duplicate's
  // aliases must also move to the master so no learning gets lost on delete.
  const { data: duplicates, error: dupErr } = await supabase
    .from('artists')
    .select('id, name, alias_names')
    .in('id', duplicateIds);

  if (dupErr || !duplicates?.length) {
    return NextResponse.json({ error: 'Duplicate artists not found' }, { status: 404 });
  }

  let totalEventsTransferred = 0;

  // Step A+B: For each duplicate, transfer events to master
  for (const dup of duplicates) {
    // Transfer events linked by artist_id
    const { data: byId } = await supabase
      .from('events')
      .update({ artist_id: masterId, artist_name: master.name })
      .eq('artist_id', dup.id)
      .select('id');

    totalEventsTransferred += byId?.length || 0;

    // Also transfer events matched only by artist_name (no artist_id set)
    const { data: byName } = await supabase
      .from('events')
      .update({ artist_id: masterId, artist_name: master.name })
      .ilike('artist_name', dup.name)
      .is('artist_id', null)
      .select('id');

    totalEventsTransferred += byName?.length || 0;
  }

  // Step C: Save duplicate names AND any aliases they carried as aliases on
  // the master profile — write to BOTH stores so the array UI and the
  // lookup table stay symmetric.
  const masterLower = master.name.toLowerCase().trim();

  // ── C.1: artist_aliases (lookup table, read by sync pipeline) ────────────
  const aliasRows = [];
  for (const dup of duplicates) {
    // The duplicate's canonical name becomes an alias of the master.
    if (dup.name && dup.name.toLowerCase().trim() !== masterLower) {
      aliasRows.push({
        artist_id: masterId,
        alias: dup.name,
        alias_lower: dup.name.toLowerCase().trim(),
      });
    }
    // Any aliases the duplicate was already carrying must also transfer.
    const dupAliases = Array.isArray(dup.alias_names) ? dup.alias_names : [];
    for (const a of dupAliases) {
      const t = (a || '').trim();
      if (!t) continue;
      if (t.toLowerCase() === masterLower) continue;
      aliasRows.push({
        artist_id: masterId,
        alias: t,
        alias_lower: t.toLowerCase(),
      });
    }
  }
  if (aliasRows.length > 0) {
    await supabase
      .from('artist_aliases')
      .upsert(aliasRows, { onConflict: 'alias_lower' });
  }

  // ── C.2: artists.alias_names (array column, read by admin UI) ────────────
  // Union master's existing aliases + every incoming alias, deduped case-
  // insensitively, with the master's canonical name excluded.
  const existingMaster = Array.isArray(master.alias_names) ? master.alias_names : [];
  const seen = new Set();
  const mergedAliases = [];
  const addAlias = (raw) => {
    const t = (raw || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (k === masterLower) return;
    if (seen.has(k)) return;
    seen.add(k);
    mergedAliases.push(t);
  };
  for (const a of existingMaster) addAlias(a);
  for (const dup of duplicates) {
    addAlias(dup.name);
    for (const a of (Array.isArray(dup.alias_names) ? dup.alias_names : [])) addAlias(a);
  }
  if (mergedAliases.length !== existingMaster.length ||
      mergedAliases.some((v, i) => v !== existingMaster[i])) {
    try {
      await supabase
        .from('artists')
        .update({ alias_names: mergedAliases })
        .eq('id', masterId);
    } catch (arrErr) {
      console.error('alias_names array update on merge failed (non-fatal):', arrErr);
    }
  }

  // Step D: Delete the duplicate artist rows
  const { error: deleteErr } = await supabase
    .from('artists')
    .delete()
    .in('id', duplicateIds);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // Step E: Heal stale denormalized cache on merged events so the waterfall
  // falls through to the master artist's (now authoritative) bio + image.
  //
  // Every event that just got repointed to `masterId` may still carry
  // scraper-era values on FOUR cache columns that drift out of sync:
  //   • artist_name      — often a ghost string like "Mike Dalton 6pm"
  //                        that surfaces in autocomplete + card subtext
  //   • artist_bio       — the duplicate's AI-generated bio
  //   • image_url        — legacy column (early scraper snapshots)
  //   • event_image_url  — scraper/AI snapshot (new column)
  //
  // Pre-2026-04: this step only nulled event_image_url, which left
  // ghost bios + legacy images + stale artist_name displayed on the
  // public feed until the next scrape. The Mike Dalton / E-Boro merges
  // hit exactly this bug — Boatyard 401 showed a fireplace photo for a
  // week after the merge.
  //
  // Locks honored:
  //   • Event-level lock (events.is_human_edited = true) → row skipped
  //     entirely (admin intentionally pinned its fields).
  //   • custom_image_url / custom_bio never touched (higher tier than
  //     the scraper cache; admin override always wins).
  let staleCacheCleaned = 0;
  try {
    const { data: cleaned } = await supabase
      .from('events')
      .update({
        artist_name:     master.name,   // canonical label for autocomplete + waterfall fallback
        artist_bio:      null,           // let waterfall fall through to artists.bio
        image_url:       null,           // legacy column
        event_image_url: null,           // scraper/AI snapshot
      })
      .eq('artist_id', masterId)
      .eq('is_human_edited', false)     // never overwrite event-level locks
      .select('id');
    staleCacheCleaned = cleaned?.length || 0;
    if (staleCacheCleaned > 0) {
      console.log(`[Merge] Healed stale cache (artist_name/bio/image_url/event_image_url) on ${staleCacheCleaned} unlocked events for master ${master.name}`);
    }
  } catch (err) {
    console.warn('[Merge] Stale cache cleanup failed (non-fatal):', err.message);
  }

  revalidatePath('/');
  revalidatePath('/api/events');
  revalidatePath('/api/events/search');
  revalidatePath('/api/spotlight');

  return NextResponse.json({
    success: true,
    master: master.name,
    merged: duplicates.map(d => d.name),
    eventsTransferred: totalEventsTransferred,
    staleCacheCleaned,
  });
}
