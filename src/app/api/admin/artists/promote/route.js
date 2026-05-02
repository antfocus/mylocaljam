/**
 * POST /api/admin/artists/promote
 * Body: { event_id: string }
 *
 * One-click "Promote to Artist" workflow used from the Event edit modal.
 * Solves the case where an event row has artist_name set but artist_id is
 * still null — the admin sees the blue "EVENT" badge in the Event Feed and
 * wants to convert it into a proper artist-linked listing without leaving
 * the modal.
 *
 * What it does, transactionally-ish (best-effort sequencing):
 *   1. Reads the event to get its artist_name. Bails if event already has
 *      artist_id (idempotent guard — caller sees a "linked" response).
 *   2. Looks for an existing artist row by name (case-insensitive). If one
 *      exists, just stamps event.artist_id and returns. No new row.
 *   3. Otherwise creates a new artist row with:
 *        kind = 'musician'         (most common case for the EVENT-badge
 *                                  rows the admin promotes; admin can
 *                                  re-classify later in the Artists tab)
 *        is_locked = false         (bare row — not curated yet)
 *        bio / image_url / etc = null    (will be filled by bulk-enrich)
 *   4. Stamps event.artist_id with the new artist's id so the badge flips
 *      to ARTIST immediately.
 *
 * Bare rows automatically appear in the bare-artists list, so the next
 * bulk-enrich batch will pick them up without any extra step. We don't
 * pre-create a pending_enrichments row here — that table holds AI
 * proposals after enrichment runs, not a queue of "to-be-enriched"
 * artists. The bare-artists endpoint is the work queue.
 *
 * Edge cases handled:
 *   • Existing artist by case-insensitive name match → linked, not duplicated.
 *   • Event already has artist_id → 200 with action='already-linked'.
 *   • Empty/missing artist_name on event → 400.
 *
 * Returns: {
 *   action: 'created' | 'linked' | 'already-linked',
 *   artist_id: string,
 *   artist_name: string,
 * }
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
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

  const eventId = body?.event_id;
  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'event_id is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // ── Step 1: Read the event row ──────────────────────────────────────────
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, artist_name, artist_id')
    .eq('id', eventId)
    .single();

  if (eventErr || !event) {
    return NextResponse.json(
      { error: eventErr?.message || 'Event not found' },
      { status: 404 }
    );
  }

  const artistName = (event.artist_name || '').trim();
  if (!artistName) {
    return NextResponse.json(
      { error: 'Event has no artist_name to promote' },
      { status: 400 }
    );
  }

  // Idempotency guard — if already linked, return without doing anything.
  // Lets the client be relaxed about duplicate clicks.
  if (event.artist_id) {
    return NextResponse.json({
      action: 'already-linked',
      artist_id: event.artist_id,
      artist_name: artistName,
    });
  }

  // ── Step 2: Try to match an existing artist by name (case-insensitive) ──
  // ilike with no wildcards is exact-match-case-insensitive in postgres, which
  // is exactly what we want — the bulk-enrich queue auto-creates artists for
  // recurring scraped names, so a row with the same display name often exists
  // already; promoting should reuse it instead of creating a duplicate.
  const { data: existing, error: lookupErr } = await supabase
    .from('artists')
    .select('id, name')
    .ilike('name', artistName)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  let artistId = existing?.id || null;
  let action = 'linked';

  // ── Step 3: Create a new artist row if no match ─────────────────────────
  if (!artistId) {
    const { data: created, error: createErr } = await supabase
      .from('artists')
      .insert({
        name: artistName,
        kind: 'musician',
        is_locked: false,
        // bio / image_url / genres / vibes left null — bulk-enrich will fill.
      })
      .select('id')
      .single();

    if (createErr || !created?.id) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create artist row' },
        { status: 500 }
      );
    }

    artistId = created.id;
    action = 'created';
  }

  // ── Step 4: Stamp event.artist_id ────────────────────────────────────────
  // If this fails after we created an artist, we have a small inconsistency
  // (orphan artist, unlinked event). The bulk-enrich queue will still pick
  // up the artist on its next pass, and the admin can re-click promote.
  // Not worth a transaction here — the failure mode is recoverable.
  const { error: stampErr } = await supabase
    .from('events')
    .update({ artist_id: artistId })
    .eq('id', eventId);

  if (stampErr) {
    return NextResponse.json(
      {
        error: `Artist ${action} but link failed: ${stampErr.message}`,
        artist_id: artistId,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    action,
    artist_id: artistId,
    artist_name: artistName,
  });
}
