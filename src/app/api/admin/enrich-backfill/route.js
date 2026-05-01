/**
 * POST /api/admin/enrich-backfill  (admin only)
 *
 * Batch enrichment endpoint for the pre-launch backfill sprint.
 * Processes up to 20 unenriched artists per call, ranked by priority
 * (Thu–Sun proximity × completeness × soonest show date).
 *
 * Designed for a client-driven loop: the admin UI fires POST, gets back
 * a progress report, and re-fires until `remaining === 0`. This avoids
 * hitting Vercel's 60s hobby-tier function timeout.
 *
 * Body: { batchSize?: number, bareOnly?: boolean }
 *   - batchSize: max artists per batch (default 20, max 25)
 *   - bareOnly: only process artists missing BOTH bio AND image (default false)
 *
 * Uses the LLM Router (Gemini → Perplexity → Grok) via aiLookupArtist.
 * Pass 1 (bio/image) uses the web-grounded route; Pass 2 (genre/vibe) uses
 * the default route. See src/lib/llmRouter.js for provider details.
 *
 * PRE-WRITE SNAPSHOTS:
 *   Before any artist row is modified, its current state is captured into
 *   an in-memory snapshot array. The full snapshot is:
 *     1. Written to /tmp/mylocaljam-enrich-<ISO>.json on the server
 *        (Vercel /tmp is ephemeral but survives the request — useful for
 *         post-mortem via `vercel logs` when a batch goes sideways).
 *     2. Returned in the response body as `snapshot` so the admin UI can
 *        offer it as a downloadable JSON backup. This is the durable copy —
 *        the UI should save it before firing the next batch.
 *   Recovery: each snapshot entry has `pre_state` (what was there before)
 *   and `post_state` (what we wrote). A rollback script could replay
 *   pre_state via .upsert(pre_state, { onConflict: 'id' }).
 *
 * Returns:
 *   {
 *     ok: true,
 *     batch: number,        // artists attempted this batch
 *     enriched: number,     // artists that received new data
 *     remaining: number,    // unenriched artists still in queue
 *     errors: string[],     // per-artist error messages (if any)
 *     duration: number,     // ms
 *     usageStats: object,   // LLM provider usage breakdown
 *     snapshot: {           // pre-write backup (SAVE THIS!)
 *       batch_id: string,   // ISO timestamp uniquely identifying the batch
 *       tmp_path: string,   // server-side /tmp path (ephemeral)
 *       entries: Array<{artist_name, artist_id, pre_state, post_state}>
 *     }
 *   }
 */

import { NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdminClient } from '@/lib/supabase';
import { fetchPrioritizedArtists } from '@/lib/enrichmentPriority';
import { aiLookupArtist } from '@/lib/aiLookup';
import { getUsageStats } from '@/lib/llmRouter';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_BATCH = 25;
const DEFAULT_BATCH = 20;
const THROTTLE_MS = 400; // polite delay between AI calls

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * Extract city from venue address (same logic as enrich-date).
 */
function extractCity(address) {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (/^(NJ|NY|PA|CT|DE|MD|US|USA|United States)(\s+\d{5}(-\d{4})?)?$/i.test(p)) continue;
    if (/^\d{5}(-\d{4})?$/.test(p)) continue;
    if (i === 0 && /^\d+\s/.test(p)) continue;
    return p;
  }
  return null;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const batchSize = Math.min(Math.max(1, body.batchSize || DEFAULT_BATCH), MAX_BATCH);
  const bareOnly = body.bareOnly === true;

  // Step 1: Get prioritized artists
  // Fetch more than batchSize so we can report accurate `remaining`
  const allPrioritized = await fetchPrioritizedArtists({
    limit: 200,
    bareOnly,
  });

  if (allPrioritized.length === 0) {
    return NextResponse.json({
      ok: true,
      batch: 0,
      enriched: 0,
      remaining: 0,
      errors: [],
      duration: Date.now() - start,
      usageStats: getUsageStats(),
      message: 'All artists are enriched — nothing to do!',
    });
  }

  const batch = allPrioritized.slice(0, batchSize);
  const remaining = Math.max(0, allPrioritized.length - batchSize);

  // Step 2: Look up venue info for context
  const supabase = getAdminClient();
  const venueNames = [...new Set(batch.map(a => a.venue_name).filter(Boolean))];
  let venueMap = new Map();
  if (venueNames.length > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('name, address')
      .in('name', venueNames);
    if (venues) {
      for (const v of venues) {
        venueMap.set(v.name, v);
      }
    }
  }

  // Step 3: Process batch with throttling
  let enrichedCount = 0;
  const errors = [];

  // Pre-write snapshot log — captures each artist's state BEFORE we modify
  // it, so the batch is fully reversible. Durable copy is returned in the
  // response (admin UI must save it); ephemeral copy goes to /tmp for
  // server-side post-mortem.
  const batchId = new Date().toISOString().replace(/[:.]/g, '-');
  const tmpPath = path.join('/tmp', `mylocaljam-enrich-${batchId}.json`);
  const snapshotEntries = [];

  for (let i = 0; i < batch.length; i++) {
    const artist = batch[i];

    // Throttle between calls (skip first)
    if (i > 0) {
      await new Promise(r => setTimeout(r, THROTTLE_MS));
    }

    try {
      // ── Pre-write snapshot capture (moved up 2026-04-20) ─────────────
      // We read the pre-state BEFORE the AI call so that field_status is
      // available when we decide whether to write sentinels. The race
      // window expands to include the AI call duration, which is fine —
      // rollback backup, not a critical-section read.
      let preState = null;
      try {
        if (artist.artist_id) {
          const { data: current } = await supabase
            .from('artists')
            .select('*')
            .eq('id', artist.artist_id)
            .maybeSingle();
          preState = current || null;
        } else {
          const { data: current } = await supabase
            .from('artists')
            .select('*')
            .ilike('name', artist.artist_name)
            .maybeSingle();
          preState = current || null;
        }
      } catch (snapErr) {
        console.warn(`[EnrichBackfill] Snapshot failed for ${artist.artist_name}:`, snapErr.message);
        preState = { _snapshot_error: snapErr.message };
      }

      const venue = venueMap.get(artist.venue_name);
      const city = venue ? extractCity(venue.address) : null;

      // Use the existing aiLookupArtist which does:
      //   Pass 1: classify + bio + image (Perplexity)
      //   Pass 2: genre + vibe tagging
      //   Pass 3: Serper image fallback
      const result = await aiLookupArtist({
        artistName: artist.artist_name,
        venue: artist.venue_name || '',
        city: city || '',
        autoMode: true,
      });

      // NOTE: We no longer early-return on `!result`. A null AI response is
      // still information — it means we tried. Bump last_fetched + write
      // 'no_data' sentinels so this row drops out of the priority queue.

      // Build the upsert payload — only write fields the artist is MISSING.
      // This is belt-and-suspenders on top of enrichmentPriority.js's filter
      // (which already skips is_locked / is_human_edited === true rows). The
      // missing_fields gate ensures we never overwrite a partially enriched
      // row's existing data even if the AI returns new values for fields the
      // artist already has.
      //
      // Bugfix (2026-04-20): the old version of this block had a broken
      // `!artist.missing_fields?.includes('bio') === false` expression
      // immediately followed by an unconditional `if (result.bio)` that
      // overrode it. Net effect was "always write bio". Cleaned up here.
      // ── Per-field lock guard (added 2026-05-01 after DJ Bluiz incident) ──
      // The `missing_fields` array on the priority record is computed
      // upstream and CAN go stale if a human added a per-field lock
      // (`is_human_edited.bio = true` etc.) between when the row entered
      // the queue and when it's processed here. This guard is the
      // belt-and-suspenders re-check at write time using the live
      // pre-write snapshot. Mirrors the helper in enrichArtist.js so the
      // semantics stay consistent across both write paths.
      const isFieldLocked = (row, field) => {
        if (!row || row._snapshot_error) return false;
        if (row.is_locked === true) return true;        // row-level lock
        const he = row.is_human_edited;
        if (he === true) return true;                    // legacy boolean
        if (he && typeof he === 'object' && he[field] === true) return true;
        return false;
      };
      const bioLocked    = isFieldLocked(preState, 'bio');
      const imageLocked  = isFieldLocked(preState, 'image_url');
      const genresLocked = isFieldLocked(preState, 'genres');

      const upsertData = { name: artist.artist_name };
      const missing = artist.missing_fields || [];
      const canWriteBio    = missing.includes('bio')       && !bioLocked;
      const canWriteImage  = missing.includes('image_url') && !imageLocked;
      const canWriteGenres = !genresLocked;
      let hasNewData = false;

      if (result?.bio && canWriteBio) {
        upsertData.bio = result.bio;
        hasNewData = true;
      }
      if (result?.image_url && canWriteImage) {
        upsertData.image_url = result.image_url;
        // image_source tracks which provider produced the URL
        // (perplexity / serper / placeholder / gemini). Labelling it
        // "AI (Perplexity)" used to be hard-coded, which was wrong under
        // the new router — the image could've come from Gemini too.
        const provider = result.image_source === 'perplexity' ? 'AI (Perplexity)'
          : result.image_source === 'serper' ? 'AI (Serper)'
          : result.image_source ? `AI (${result.image_source})`
          : 'AI';
        upsertData.image_source = provider;
        hasNewData = true;
      }
      // Genres: fill only when the artist has none (i.e. bio was also
      // missing, which is how we got here via priority scoring) AND the
      // genres field isn't independently locked. Prevents an unlocked-bio
      // / locked-genres row from getting its genres clobbered alongside
      // a legitimate bio refresh.
      if (result?.genres?.length && canWriteBio && canWriteGenres) {
        upsertData.genres = result.genres;
      }
      // bio_source: record the source page the LLM used. Only relevant when
      // we actually wrote a new bio.
      if (result?.source_link && canWriteBio) {
        upsertData.bio_source = result.source_link;
      }

      // ── Field-status sentinels ───────────────────────────────────────
      // When the AI came back empty for a field the priority scorer flagged
      // as missing, write a 'no_data' sentinel into field_status.<field> so
      // the scorer won't pick this artist again for that field. This is
      // what drains the queue when names are too obscure for the AI to
      // ground (e.g., local Jersey Shore acts with no web presence).
      const prevFieldStatus = (preState && !preState._snapshot_error && preState.field_status)
        ? preState.field_status
        : {};
      const nextFieldStatus = { ...prevFieldStatus };
      let fieldStatusChanged = false;
      // Guard against re-writing an existing 'no_data' sentinel (idempotent)
      // but DO overwrite legacy 'live' markers. The original guard used
      // `!prevFieldStatus.bio` which treated ANY truthy prior value — 'live',
      // 'manual', etc. — as "already sentineled", blocking the no_data write
      // and leaving the row to re-enter the queue every batch (the James
      // Dalton loop trap from 2026-04-20 where field_status.image_url='live'
      // kept him in the priority pool even after repeated AI-null attempts).
      if (canWriteBio && !upsertData.bio && prevFieldStatus.bio !== 'no_data') {
        nextFieldStatus.bio = 'no_data';
        fieldStatusChanged = true;
      }
      if (canWriteImage && !upsertData.image_url && prevFieldStatus.image_url !== 'no_data') {
        nextFieldStatus.image_url = 'no_data';
        fieldStatusChanged = true;
      }
      if (fieldStatusChanged) {
        upsertData.field_status = nextFieldStatus;
      }

      // ── VENUE_EVENT classification persistence ───────────────────────
      // If the AI classified this row as a VENUE_EVENT (not a musician) and
      // we don't already have a default_category set, tag it 'Other'. This
      // drops the row out of the bio-enrichment queue permanently. Coarse
      // but correct — the SQL pre-classification handled obvious event
      // keywords; whatever the AI catches here is the long tail.
      const preCategory = preState && !preState._snapshot_error ? preState.default_category : null;
      if (result?.kind === 'VENUE_EVENT' && !preCategory) {
        upsertData.default_category = 'Other';
      }

      // Always bump last_fetched — successful OR failed attempts count as
      // "we tried this row." The priority scorer uses last_fetched as an
      // implicit cooldown; without this, a failed artist sits at the top of
      // the queue forever, retrying on every batch (the loop trap from the
      // 2026-04-20 test batch).
      upsertData.last_fetched = new Date().toISOString();

      // If we have NOTHING to write — no bio/image, no sentinel change, no
      // classification — skip. This should be rare (only when prior state
      // already recorded no_data and the AI still returned nothing).
      const willWrite = hasNewData || fieldStatusChanged || upsertData.default_category;
      if (!willWrite) {
        errors.push(`${artist.artist_name}: AI returned no data, no sentinel change`);
        continue;
      }
      if (!hasNewData) {
        // Record that we tried and got nothing, but don't count as enriched
        errors.push(`${artist.artist_name}: AI returned no usable bio/image${result?.kind === 'VENUE_EVENT' ? ' (classified as VENUE_EVENT)' : ''}`);
      }

      if (artist.artist_id) {
        // Update existing artist row — only fill blank fields
        const updates = {};
        for (const [key, val] of Object.entries(upsertData)) {
          if (key === 'name') continue;
          updates[key] = val;
        }

        const { error: updateErr } = await supabase
          .from('artists')
          .update(updates)
          .eq('id', artist.artist_id);

        if (updateErr) {
          errors.push(`${artist.artist_name}: DB update failed — ${updateErr.message}`);
          continue;
        }
      } else {
        // No artist_id — upsert by name
        const { error: upsertErr } = await supabase
          .from('artists')
          .upsert(upsertData, { onConflict: 'name', ignoreDuplicates: false });

        if (upsertErr) {
          errors.push(`${artist.artist_name}: DB upsert failed — ${upsertErr.message}`);
          continue;
        }
      }

      // Record snapshot entry AFTER successful write. Failed writes don't
      // get a snapshot entry because nothing actually changed. "Successful"
      // now includes sentinel-only writes (no bio/image, but field_status or
      // default_category changed) — those are still reversible state changes.
      snapshotEntries.push({
        artist_name: artist.artist_name,
        artist_id: artist.artist_id || null,
        kind: result?.kind,
        wrote_bio: !!upsertData.bio,
        wrote_image: !!upsertData.image_url,
        wrote_sentinel: fieldStatusChanged,
        wrote_category: !!upsertData.default_category,
        pre_state: preState,
        post_state: upsertData,
        written_at: new Date().toISOString(),
      });

      // Also backfill event-level denormalized columns — only when we have
      // real bio/image content. Sentinel-only writes don't touch events.
      //
      // CRITICAL: template_id IS NULL guard (added 2026-04-21). Without it,
      // the cascade shotgunned AI-fetched images onto every event sharing
      // this artist_name — including template-linked recurring events like
      // "Karaoke" at Jamian's and "Snow Crabs" at Sun Harbor. Those events
      // have an event_template with its own curated image; overwriting
      // event_image_url pushed the stale AI image above the template image
      // in the waterfall (because is_human_edited=true flips the ladder
      // priority in waterfall.js). Result: live site showed a "Live Band
      // Karaoke at Blind Owl" flyer on Karaoke-at-Jamian's events overnight.
      //
      // Template-linked events don't need the event-level bio/image
      // denormalization anyway — waterfall.js reads the template tier
      // first. So skipping them here is both safe and correct. For
      // template-less events (the common case — one-off shows by a named
      // artist), the cascade still runs as before.
      if (hasNewData && (result?.bio || result?.image_url)) {
        const eventUpdates = {};
        if (result.bio) eventUpdates.artist_bio = result.bio;
        if (result.image_url) eventUpdates.event_image_url = result.image_url;

        // Update events that reference this artist and have blank fields
        const { error: evErr } = await supabase
          .from('events')
          .update(eventUpdates)
          .eq('artist_name', artist.artist_name)
          .is('artist_bio', null)
          .is('template_id', null);

        if (evErr) {
          console.warn(`[EnrichBackfill] Event backfill warning for ${artist.artist_name}:`, evErr.message);
        }
      }

      // Only count as "enriched" when we actually wrote new bio/image. A
      // sentinel or category write is progress for the queue but not a
      // data enrichment — the stat card should reflect real fills, not
      // bookkeeping updates.
      if (hasNewData) {
        enrichedCount++;
      }
      console.log(`[EnrichBackfill] ✓ ${artist.artist_name} (enriched=${hasNewData}, sentinel=${fieldStatusChanged}, category=${upsertData.default_category || 'none'}, score: ${artist.priority_score?.toFixed(1)})`);

    } catch (err) {
      errors.push(`${artist.artist_name}: ${err.message}`);
      console.error(`[EnrichBackfill] ✗ ${artist.artist_name}:`, err.message);
    }
  }

  const duration = Date.now() - start;
  console.log(`[EnrichBackfill] Batch complete: ${enrichedCount}/${batch.length} enriched in ${duration}ms (${remaining} remaining)`);

  // Persist the snapshot to /tmp (ephemeral, survives the request). The
  // response carries the same data to the UI — the /tmp copy is only a
  // debugging convenience for reading via `vercel logs` or a local dev
  // filesystem inspection. Write failure is non-fatal.
  if (snapshotEntries.length > 0) {
    try {
      await writeFile(
        tmpPath,
        JSON.stringify({ batch_id: batchId, entries: snapshotEntries }, null, 2),
        'utf-8',
      );
      console.log(`[EnrichBackfill] Snapshot written to ${tmpPath} (${snapshotEntries.length} entries)`);
    } catch (e) {
      console.warn(`[EnrichBackfill] Snapshot file write failed (non-fatal):`, e.message);
    }
  }

  return NextResponse.json({
    ok: true,
    batch: batch.length,
    enriched: enrichedCount,
    remaining,
    errors: errors.length > 0 ? errors : undefined,
    duration,
    usageStats: getUsageStats(),
    snapshot: {
      batch_id: batchId,
      tmp_path: tmpPath,
      entries: snapshotEntries,
    },
  });
}
