import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';
import { enrichArtist } from '@/lib/enrichArtist';
import { safeHref } from '@/lib/safeHref';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// GET — fetch all pending submissions
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST — approve a submission (creates event + updates submission status)
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { submission_id, event_data } = body;

  // Fetch the submission to get image_url, event_name, and AI classification for linking
  const { data: submission } = await supabase
    .from('submissions')
    .select('image_url, event_name, category, confidence_score')
    .eq('id', submission_id)
    .single();

  // ── Series / festival linkage (admin-gated) ─────────────────────────────
  // Old behavior: any OCR-extracted event_name auto-promoted the event into
  // the "Festivals" bucket. That polluted the admin UI with every flyer
  // title (e.g. "Kevin Hill and Sandy Mack"). Now the admin must explicitly
  // tick the "Part of a series / festival" checkbox in the approval modal,
  // which sets event_data.is_series = true.
  const seriesName = (event_data.event_name || '').trim() || null;
  const isSeries = !!event_data.is_series && !!seriesName;
  const seriesCategory = isSeries ? (event_data.series_category || 'festival') : null;

  // ── Pre-resolve the artist row BEFORE the event insert ───────────────────
  // Why: when a community submission matches an existing artist that already
  // has a canonical photo (e.g. enjoy! → gigsalad image), the submitter's
  // uploaded poster (often an Instagram screenshot) should NOT override the
  // artist's image on the card. The legacy `events.image_url` column sits at
  // Tier 3 of the image waterfall (above `artist.image_url` at Tier 4) — so
  // if we always stamp the submission poster onto the event row, the card
  // ends up showing the wrong image.
  //
  // Strategy: look up the artist by name first. If a row exists with an
  // image_url, we DON'T stamp the submission poster — the waterfall falls
  // through to the canonical artist image. If no artist match (or no artist
  // image), the submission poster is kept so community-only events still
  // have their flyer.
  //
  // Note: enrichArtist runs AFTER the event insert (below) and may create or
  // update an artist row. We do a best-effort lookup here for the common
  // case where the artist already exists; new artists go through the
  // post-publish enrichment path and a follow-up image-clear if needed.
  const submittedArtistName = event_data.artist_name?.trim() || '';
  let preExistingArtist = null;
  if (submittedArtistName) {
    const { data: a } = await supabase
      .from('artists')
      .select('id, image_url')
      .ilike('name', submittedArtistName)
      .maybeSingle();
    preExistingArtist = a || null;
  }

  // Resolve image source: skip the submission poster when a matched artist
  // already has a canonical image. Admin can still stamp custom_image_url
  // later via the edit modal (Tier 0) to override either source.
  const candidatePoster = submission?.image_url || event_data.image_url || null;
  const useArtistImage = !!(preExistingArtist?.image_url);
  const resolvedImageUrl = useArtistImage ? null : candidatePoster;

  // Create the event. image_url is conditionally null when the matched
  // artist already has a canonical photo (waterfall falls through to
  // artist.image_url). artist_id is set inline when we have a pre-existing
  // match; otherwise the post-publish enrichment hook below sets it.
  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      artist_name: event_data.artist_name,
      artist_bio: event_data.artist_bio || null,
      artist_id: preExistingArtist?.id || null,
      venue_name: event_data.venue_name,
      venue_id: event_data.venue_id || null,
      event_date: event_data.event_date,
      genre: event_data.genre || null,
      vibe: event_data.vibe || null,
      category: event_data.category || submission?.category || 'Live Music',
      triage_status: (submission?.confidence_score >= 90 || event_data.confidence_score >= 90) ? 'reviewed' : 'pending',
      cover: event_data.cover || null,
      // safeHref strips javascript:/data:/etc. (security audit H4).
      ticket_link: safeHref(event_data.ticket_link),
      image_url: resolvedImageUrl,
      // NOTE: `is_featured` retired Phase 5 — Spotlight curation lives
      // exclusively in the `spotlight_events` table.
      // Only stamp event_title / is_festival when admin opted in via the
      // series checkbox. series_id is set in the follow-up step below.
      ...(isSeries ? { event_title: seriesName } : {}),
      ...(isSeries && seriesCategory === 'festival' ? { is_festival: true } : {}),
      status: 'published',
      source: 'Community Submitted',
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  // ── Find-or-create the parent event_series row ──────────────────────────
  // Slug is the stable unique key used for dedup across approvals. If a
  // series with the same slug already exists (case-insensitive name match),
  // we reuse it; otherwise we insert a new row with the admin-picked
  // category. Failures are logged but don't block the approval — the event
  // is already published, so series linkage is a best-effort follow-up.
  if (isSeries && newEvent?.id) {
    try {
      const slug = seriesName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);

      let seriesId = null;
      if (slug) {
        const { data: existing } = await supabase
          .from('event_series')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        seriesId = existing?.id || null;

        if (!seriesId) {
          const { data: created, error: seriesErr } = await supabase
            .from('event_series')
            .insert({ name: seriesName, slug, category: seriesCategory })
            .select('id')
            .single();
          if (seriesErr) {
            console.warn('[queue] event_series insert failed:', seriesErr.message);
          } else {
            seriesId = created?.id || null;
          }
        }
      }

      if (seriesId) {
        await supabase
          .from('events')
          .update({ series_id: seriesId })
          .eq('id', newEvent.id);
      }
    } catch (seriesErr) {
      console.warn('[queue] Series linkage error:', seriesErr.message);
    }
  }

  // Update submission status
  const { error: subError } = await supabase
    .from('submissions')
    .update({ status: 'approved' })
    .eq('id', submission_id);

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  // Universal Enrichment Hook: MusicBrainz → Discogs → Last.fm
  // Runs after approval so artist bio/image appear on the live feed immediately
  try {
    const artistName = event_data.artist_name?.trim();
    if (artistName) {
      await enrichArtist(artistName, supabase).catch(err =>
        console.warn(`[queue] Enrichment failed for "${artistName}":`, err.message)
      );

      // Link the new event to the artist row if one exists. Also re-check
      // the artist's image: if enrichment populated one (or one already
      // existed but we missed it in the pre-insert lookup), clear the rogue
      // `events.image_url` so the waterfall falls through to artist.image_url
      // instead of the submitter's IG-screenshot poster.
      const { data: artist } = await supabase
        .from('artists')
        .select('id, image_url')
        .ilike('name', artistName)
        .single();

      if (artist?.id && newEvent?.id) {
        const updates = { artist_id: artist.id };
        if (artist.image_url && newEvent.image_url) {
          updates.image_url = null;
        }
        await supabase
          .from('events')
          .update(updates)
          .eq('id', newEvent.id);
      }
    }
  } catch (enrichErr) {
    console.warn('[queue] Post-publish enrichment error:', enrichErr.message);
  }

  // Invalidate the live feed cache so the new event appears immediately
  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({ success: true, event: newEvent });
}

// PUT — reject a submission
export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { submission_id, action } = body;

  if (action === 'reject') {
    // Step A: Fetch submission to get image_url for storage cleanup
    const { data: sub } = await supabase
      .from('submissions')
      .select('image_url')
      .eq('id', submission_id)
      .single();

    // Delete the poster from storage bucket (permanent)
    if (sub?.image_url && sub.image_url.includes('/posters/')) {
      try {
        const fileName = sub.image_url.split('/posters/').pop();
        if (fileName) {
          await supabase.storage.from('posters').remove([fileName]);
        }
      } catch (storageErr) {
        console.error('Failed to delete poster from storage:', storageErr);
      }
    }

    // Step B: Hard DELETE the submission row (no soft-delete)
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', submission_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, hard_deleted: true });
  }

  if (action === 'archive') {
    const { error } = await supabase
      .from('submissions')
      .update({ status: 'archived' })
      .eq('id', submission_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'block') {
    // Mark submission as rejected
    const { error: rejectError } = await supabase
      .from('submissions')
      .update({ status: 'rejected', blocked: true })
      .eq('id', submission_id);

    if (rejectError) {
      return NextResponse.json({ error: rejectError.message }, { status: 500 });
    }

    // Get the submitter email and block them if available
    const { data: sub } = await supabase
      .from('submissions')
      .select('submitter_email')
      .eq('id', submission_id)
      .single();

    if (sub?.submitter_email) {
      await supabase
        .from('blocked_submitters')
        .upsert({ email: sub.submitter_email, blocked_at: new Date().toISOString() });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// PATCH — batch update fields on multiple submissions (Queue Memory)
export async function PATCH(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { submission_ids, updates } = body;

  if (!Array.isArray(submission_ids) || submission_ids.length === 0) {
    return NextResponse.json({ error: 'submission_ids required' }, { status: 400 });
  }

  // Whitelist allowed fields for batch update
  const ALLOWED_FIELDS = ['event_name', 'venue_name', 'category', 'event_date'];
  const safeUpdates = {};
  for (const [k, v] of Object.entries(updates || {})) {
    if (ALLOWED_FIELDS.includes(k)) safeUpdates[k] = v;
  }

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('submissions')
    .update(safeUpdates)
    .in('id', submission_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: submission_ids.length });
}

// Duplicate check endpoint via query params
// GET /api/admin/queue?check_duplicate=true&venue=X&date=YYYY-MM-DD
