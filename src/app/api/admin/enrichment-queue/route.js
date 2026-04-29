/**
 * Enrichment Triage Queue
 *
 * GET /api/admin/enrichment-queue?from=YYYY-MM-DD&to=YYYY-MM-DD&missing=image|bio|genres|vibes
 *
 * Returns the list of events in the date range that are MISSING the specified
 * metadata field — using the metadata waterfall to determine "missing" rather
 * than just checking the event row directly. An event with NULL `image_url`
 * but a linked `artist.image_url` is NOT really missing image (the waterfall
 * fills it on render), so it doesn't surface in this triage view.
 *
 * Waterfall sources checked per field:
 *   image:  custom_image_url → event_image_url → image_url → artist.image_url
 *           → event_templates.image_url
 *   bio:    custom_bio → artist_bio → artist.bio → event_templates.bio
 *   genres: custom_genres[] → artist.genres[] → event_templates.genres[] → genre
 *   vibes:  custom_vibes[] → artist.vibes[] → vibe
 *
 * The triage UI uses this to drive the "click through events with no image
 * even after the waterfall" workflow — every row surfaced here is genuinely
 * blank in the user-facing render.
 */

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

const VALID_MISSING = new Set(['image', 'bio', 'genres', 'vibes']);

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = (searchParams.get('from') || '').trim();
  const toParam = (searchParams.get('to') || '').trim();
  const missingType = (searchParams.get('missing') || '').trim();

  // Validate date params (YYYY-MM-DD format)
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromParam) || !dateRe.test(toParam)) {
    return NextResponse.json(
      { error: 'Invalid from/to params — expected YYYY-MM-DD' },
      { status: 400 }
    );
  }
  if (!VALID_MISSING.has(missingType)) {
    return NextResponse.json(
      { error: `Invalid missing param — must be one of: ${[...VALID_MISSING].join(', ')}` },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  // Pull events in the date range with all waterfall sources joined. We
  // include the event_templates and artists embeds so the missing check
  // can walk the waterfall server-side and skip events that look blank
  // at the event row level but are actually populated by the joined tier.
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id, event_date, event_title, artist_name, artist_id, venue_id, status,
      image_url, event_image_url, custom_image_url,
      artist_bio, custom_bio,
      genre, custom_genres, vibe, custom_vibes,
      template_id,
      venues(name, city),
      artists(id, name, bio, image_url, genres, vibes),
      event_templates(image_url, bio, genres)
    `)
    .gte('event_date', `${fromParam}T00:00:00`)
    .lt('event_date', `${toParam}T23:59:59`)
    .eq('status', 'published')
    .order('event_date', { ascending: true });

  if (error) {
    console.error('[enrichment-queue]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Waterfall-aware missing check. Returns true if EVERY tier the renderer
  // walks is empty for the given field. An empty array counts as missing
  // for genres/vibes (no useful data to show on cards).
  const isArrayPopulated = (v) => Array.isArray(v) && v.length > 0;
  const isStringPopulated = (v) => typeof v === 'string' && v.trim().length > 0;

  function isMissing(ev) {
    switch (missingType) {
      case 'image':
        return (
          !isStringPopulated(ev.custom_image_url) &&
          !isStringPopulated(ev.event_image_url) &&
          !isStringPopulated(ev.image_url) &&
          !isStringPopulated(ev.artists?.image_url) &&
          !isStringPopulated(ev.event_templates?.image_url)
        );
      case 'bio':
        return (
          !isStringPopulated(ev.custom_bio) &&
          !isStringPopulated(ev.artist_bio) &&
          !isStringPopulated(ev.artists?.bio) &&
          !isStringPopulated(ev.event_templates?.bio)
        );
      case 'genres':
        return (
          !isArrayPopulated(ev.custom_genres) &&
          !isArrayPopulated(ev.artists?.genres) &&
          !isArrayPopulated(ev.event_templates?.genres) &&
          !isStringPopulated(ev.genre)
        );
      case 'vibes':
        return (
          !isArrayPopulated(ev.custom_vibes) &&
          !isArrayPopulated(ev.artists?.vibes) &&
          !isStringPopulated(ev.vibe)
        );
      default:
        return false;
    }
  }

  // Pass the full event row plus a few computed fields so the click handler
  // can populate the EventFormModal directly without a second fetch. The
  // `has_artist` flag is the click-routing signal; `missing` echoes back
  // the field that's missing for the red badge.
  const queue = (events || [])
    .filter(isMissing)
    .map((ev) => ({
      ...ev,
      has_artist: !!ev.artist_id,
      venue_name: ev.venues?.name || null,
      missing: missingType,
    }));

  return NextResponse.json({
    events: queue,
    total: queue.length,
    range: { from: fromParam, to: toParam },
    missing: missingType,
  });
}
