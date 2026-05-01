/**
 * POST /api/admin/bulk-enrich
 * Body: { artist_ids: string[] }   (max 10 per call)
 *
 * Runs the existing AI Enhance pipeline against a batch of artists and
 * INSERTS proposals into the pending_enrichments table. Does NOT write to
 * artists.bio / image_url / etc. — that happens separately via the
 * approve endpoint after admin review.
 *
 * Why staged writes:
 *   • The DJ Bluiz incident (Apr 30) showed automated bio writes hitting
 *     locked rows. Staging puts the admin in the loop on every change.
 *   • For the pre-launch enrichment push (172 bare artists), every approval
 *     becomes a deliberate "yes, this is good" rather than a surprise on
 *     the live site.
 *   • Same workflow will host the post-launch local-agent output (Qwen on
 *     Mac mini writing here, admin reviewing via the same UI).
 *
 * Sync, ~50s for 10 artists. Client batches the 172-artist backlog by
 * calling this endpoint repeatedly with batches of 10 IDs at a time.
 *
 * Behavior:
 *   • For each artist_id, look up the artist row + their next upcoming
 *     event (for venue/city context that improves disambiguation).
 *   • Call aiLookupArtist with autoMode=true (strict — refuses placeholder
 *     images and rejects hype-word bios).
 *   • UPSERT into pending_enrichments. If a pending row already exists for
 *     the artist, update it with fresh proposals (the partial unique index
 *     enforces one-pending-per-artist).
 *   • Throttle 400ms between calls to be respectful of LLM provider quotas
 *     (matches the enrich-backfill pattern).
 *   • Per-artist try/catch — a single bad artist doesn't block the batch.
 *     Failures are recorded as `status='error'` rows so the UI can show
 *     them without blocking the rest.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { aiLookupArtist } from '@/lib/aiLookup';

const MAX_BATCH = 10;
const THROTTLE_MS = 400;

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body?.artist_ids) ? body.artist_ids : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'artist_ids array is required' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BATCH} artists per batch (got ${ids.length})` },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  // Pull artist rows + their next upcoming event for venue/city context.
  // We need name (the LLM input), and venue + city help disambiguate
  // common names like "Vinyl" or "DJ Mike". The event join is left-outer
  // so artists with no upcoming events still get processed (just with
  // empty venue context).
  const { data: artists, error: fetchError } = await supabase
    .from('artists')
    .select(`
      id, name, kind,
      events!events_artist_id_fkey (
        event_date,
        venues ( name, city, address )
      )
    `)
    .in('id', ids);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!artists || artists.length === 0) {
    return NextResponse.json({ error: 'No matching artists found' }, { status: 404 });
  }

  // Pick the soonest upcoming event per artist for venue context. Falls
  // through to empty strings when no upcoming events exist.
  const nowIso = new Date().toISOString();
  const ctxByArtist = new Map();
  for (const a of artists) {
    const upcoming = (a.events || [])
      .filter(e => e.event_date && e.event_date >= nowIso)
      .sort((x, y) => x.event_date.localeCompare(y.event_date));
    const firstEvent = upcoming[0];
    ctxByArtist.set(a.id, {
      name: a.name,
      kind: a.kind,
      venue: firstEvent?.venues?.name || '',
      city: firstEvent?.venues?.city || '',
    });
  }

  const results = [];
  let processed = 0;
  let queued = 0;
  let failed = 0;

  for (const artistId of ids) {
    const ctx = ctxByArtist.get(artistId);
    if (!ctx) {
      failed++;
      results.push({ artist_id: artistId, status: 'error', error: 'Artist not found' });
      continue;
    }

    try {
      const ai = await aiLookupArtist({
        artistName: ctx.name,
        venue: ctx.venue,
        city: ctx.city,
        autoMode: true,
      });

      processed++;

      // Build the upsert payload. If aiLookup returned null (env keys
      // missing) we still record an 'error' row so the UI surfaces the
      // problem instead of silently dropping.
      if (!ai) {
        await upsertPending(supabase, artistId, {
          status: 'error',
          error_message: 'AI lookup returned null (env or provider issue)',
          source: 'bulk-enrich',
        });
        failed++;
        results.push({ artist_id: artistId, status: 'error', error: 'AI returned null' });
        continue;
      }

      const payload = {
        proposed_bio: ai.bio || null,
        proposed_image_url: ai.image_url || null,
        proposed_image_candidates: ai.image_candidates || null,
        proposed_genres: ai.genres || null,
        proposed_vibes: ai.vibes || null,
        proposed_kind: ai.kind || null,
        proposed_is_tribute: ai.is_tribute ?? null,
        bio_source: ai.source_link || null,
        image_source: ai.image_source || null,
        status: ai.needs_review ? 'pending' : 'pending',  // both → pending; admin sees needs_review flag via notes below
        notes: ai.needs_review ? 'LLM flagged as unknown — review carefully' : null,
        source: 'bulk-enrich',
      };

      const { error: upsertError } = await upsertPending(supabase, artistId, payload);
      if (upsertError) {
        failed++;
        results.push({ artist_id: artistId, status: 'error', error: upsertError.message });
        continue;
      }

      queued++;
      results.push({
        artist_id: artistId,
        status: 'queued',
        bio_preview: ai.bio ? ai.bio.slice(0, 80) : null,
        needs_review: !!ai.needs_review,
      });
    } catch (err) {
      console.error(`[bulk-enrich] ${artistId} failed:`, err);
      failed++;
      // Record the failure in the queue so admin sees it; helps debugging
      // (e.g., a specific artist name that consistently breaks the LLM).
      try {
        await upsertPending(supabase, artistId, {
          status: 'error',
          error_message: String(err.message || err).slice(0, 500),
          source: 'bulk-enrich',
        });
      } catch { /* best-effort */ }
      results.push({ artist_id: artistId, status: 'error', error: err.message });
    }

    // Throttle between LLM calls. Skip after the last to shave latency.
    if (ids.indexOf(artistId) < ids.length - 1) {
      await sleep(THROTTLE_MS);
    }
  }

  return NextResponse.json({
    processed,
    queued,
    failed,
    results,
  });
}

/**
 * Upsert a pending_enrichments row keyed by artist_id + status='pending'.
 * Two paths:
 *   • If a pending row exists for this artist, UPDATE it with fresh values.
 *     Resets reviewed_at + reviewer to null so it looks like a new proposal.
 *   • Else INSERT a new row.
 *
 * Doesn't use Supabase's `.upsert()` because the unique constraint is a
 * partial index (status='pending' only) which Supabase's onConflict
 * handling doesn't natively understand. Manual two-step instead.
 */
async function upsertPending(supabase, artistId, payload) {
  // Find existing pending row, if any.
  const { data: existing, error: lookupError } = await supabase
    .from('pending_enrichments')
    .select('id')
    .eq('artist_id', artistId)
    .eq('status', 'pending')
    .maybeSingle();

  if (lookupError) return { error: lookupError };

  if (existing?.id) {
    const { error } = await supabase
      .from('pending_enrichments')
      .update({
        ...payload,
        reviewed_at: null,
        reviewer: null,
        created_at: new Date().toISOString(),  // refresh so newest-first ordering surfaces it
      })
      .eq('id', existing.id);
    return { error };
  }

  const { error } = await supabase
    .from('pending_enrichments')
    .insert({ artist_id: artistId, ...payload });
  return { error };
}
