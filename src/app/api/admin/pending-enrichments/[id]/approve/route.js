/**
 * POST /api/admin/pending-enrichments/[id]/approve
 *
 * Promotes a pending enrichment proposal to the live artist row:
 *   1. Reads the pending row (must be status='pending').
 *   2. Writes proposed_* values to artists.bio / image_url / genres / vibes
 *      / kind / is_tribute. Whitelisted fields only.
 *   3. Flips the corresponding is_human_edited flags so future automated
 *      enrichment (enrich-backfill, sync, agent loops) skips these fields.
 *      This is the "lock" that prevents the DJ Bluiz incident class.
 *   4. Records bio_source / image_source on the artist row so we can audit
 *      where the curated value came from.
 *   5. Marks the pending row status='approved' with reviewed_at + reviewer.
 *
 * Optional body: { override?: { bio?, image_url?, genres?, vibes?, ... } }
 *   Lets the admin tweak the proposal before promoting (e.g., shorten the
 *   bio or pick a different image). Whitelisted to the same fields the
 *   pending row exposes; anything else is silently ignored.
 *
 * Returns the updated artist row so the UI can render the new state
 * without a refetch.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

const FIELD_MAP = [
  // [pending column,            artist column,    lock flag key]
  ['proposed_bio',               'bio',            'bio'],
  ['proposed_image_url',         'image_url',      'image_url'],
  ['proposed_genres',            'genres',         'genres'],
  ['proposed_vibes',             'vibes',          'vibes'],
  ['proposed_kind',              'kind',           'kind'],
  ['proposed_is_tribute',        'is_tribute',     'is_tribute'],
];

const OVERRIDE_ALLOWED = new Set(['bio', 'image_url', 'genres', 'vibes', 'kind', 'is_tribute']);

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request, { params }) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Pending enrichment id is required' }, { status: 400 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* body optional */
  }
  const override = (body && typeof body.override === 'object' && body.override) || {};

  const supabase = getAdminClient();

  // 1. Load the pending row. Must exist and be status='pending'.
  const { data: pending, error: loadError } = await supabase
    .from('pending_enrichments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!pending) {
    return NextResponse.json({ error: 'Pending enrichment not found' }, { status: 404 });
  }
  if (pending.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot approve — current status is "${pending.status}"` },
      { status: 409 }
    );
  }

  // 2. Build the artist update payload from proposed_* + override. Track
  //    which fields are actually changing so we only flip locks for those.
  const artistUpdates = {};
  const newLocks = {};
  for (const [pendingCol, artistCol, lockKey] of FIELD_MAP) {
    let val;
    if (Object.prototype.hasOwnProperty.call(override, lockKey) && OVERRIDE_ALLOWED.has(lockKey)) {
      val = override[lockKey];
    } else {
      val = pending[pendingCol];
    }
    // null/undefined skipped — we don't write empty values that would
    // wipe out existing artist data the LLM didn't propose for.
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === 'string' && val.trim() === '') continue;

    artistUpdates[artistCol] = val;
    newLocks[lockKey] = true;
  }

  // bio_source + image_source — record provenance so future debugging can
  // answer "where did this value come from?"
  if (artistUpdates.bio && pending.bio_source) {
    artistUpdates.bio_source = pending.bio_source;
  }
  if (artistUpdates.image_url && pending.image_source) {
    artistUpdates.image_source = pending.image_source;
  }
  // image_candidates — preserve the LLM's full candidate list on the
  // artist row so admin can swap to a different candidate later via the
  // existing carousel without re-running the search.
  if (Array.isArray(pending.proposed_image_candidates) && pending.proposed_image_candidates.length > 0) {
    artistUpdates.image_candidates = pending.proposed_image_candidates;
  }

  if (Object.keys(artistUpdates).length === 0) {
    return NextResponse.json(
      { error: 'Nothing to write — proposal has no usable fields' },
      { status: 400 }
    );
  }

  // 3. Merge the new locks into the existing is_human_edited jsonb. We
  //    UNION rather than replace so any previously-locked fields stay
  //    locked (e.g., admin manually locked vibes, bulk-enrich proposes a
  //    bio — only bio.lock gets added, vibes.lock stays).
  const { data: currentArtist, error: artistLoadError } = await supabase
    .from('artists')
    .select('is_human_edited')
    .eq('id', pending.artist_id)
    .maybeSingle();

  if (artistLoadError) {
    return NextResponse.json({ error: artistLoadError.message }, { status: 500 });
  }
  if (!currentArtist) {
    return NextResponse.json({ error: 'Linked artist no longer exists' }, { status: 404 });
  }

  const existingLocks = (currentArtist.is_human_edited && typeof currentArtist.is_human_edited === 'object')
    ? currentArtist.is_human_edited
    : {};
  artistUpdates.is_human_edited = { ...existingLocks, ...newLocks };
  artistUpdates.metadata_source = 'admin-approved';
  artistUpdates.last_fetched = new Date().toISOString();

  // 4. Write to artists.
  const { data: updatedArtist, error: updateError } = await supabase
    .from('artists')
    .update(artistUpdates)
    .eq('id', pending.artist_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 5. Mark the pending row approved.
  const { error: queueError } = await supabase
    .from('pending_enrichments')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewer: 'admin',
    })
    .eq('id', id);

  if (queueError) {
    // Artist update succeeded; queue mark failed. Log but return success
    // since the user-visible action (artist updated) did happen. The row
    // staying as 'pending' just means it'll show up in the queue again
    // until manually retried — minor friction, not data loss.
    console.error('[approve] artist updated but queue mark failed:', queueError);
  }

  return NextResponse.json({
    ok: true,
    artist: updatedArtist,
    fields_written: Object.keys(artistUpdates).filter(k => k !== 'is_human_edited' && k !== 'metadata_source' && k !== 'last_fetched'),
    locks_added: Object.keys(newLocks),
  });
}
