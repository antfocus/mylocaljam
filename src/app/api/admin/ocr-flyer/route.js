import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { extractEventsFromFlyer } from '@/lib/visionOCR';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Allow up to 30s for Gemini processing

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/ocr-flyer
 * Admin-only endpoint: takes a flyer image URL, runs Gemini OCR,
 * and creates draft submissions for each extracted event.
 *
 * Body: { image_url: string, venue_name?: string }
 * Returns: { events: [...], drafts_created: number }
 */
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

  const { image_url, venue_name } = body;
  if (!image_url) {
    return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
  }

  const supabase = getAdminClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    // Run Gemini OCR extraction
    const extracted = await extractEventsFromFlyer(image_url, {
      venueName: venue_name || null,
      year,
      month,
    });

    if (!extracted || extracted.length === 0) {
      return NextResponse.json({
        events: [],
        drafts_created: 0,
        message: 'Gemini could not extract any events from this flyer',
      });
    }

    // Detect if this is a festival (multiple artists with the same event_name)
    const eventNames = [...new Set(extracted.map(e => e.event_name).filter(Boolean))];
    const isFestival = eventNames.length > 0 && extracted.length > 3;
    const festivalName = eventNames[0] || null;

    // Create a pending submission for each extracted event
    // IMPORTANT: image_url is set to the flyer poster for the EVENT record only.
    // We do NOT set artist image_url — leave it blank so the universal enrichment
    // pipeline (MusicBrainz → Discogs → Last.fm) finds official artist press photos.
    const drafts = extracted.map(e => ({
      artist_name: e.artist || 'Unknown Artist',
      venue_name: e.venue || venue_name || null,
      event_date: e.date ? new Date(`${e.date}T${e.time || '00:00'}:00`).toISOString() : null,
      image_url: image_url, // Poster image for the EVENT, not the artist
      event_name: e.event_name || festivalName || null,
      category: e.category || 'Live Music',
      confidence_score: e.confidence_score || 50,
      status: 'pending',
      notes: `[Admin AI Upload] Extracted via Gemini OCR${e.event_name ? ` — ${e.event_name}` : ''}${isFestival ? ' [Festival]' : ''}${e.time ? ` — Time: ${e.time}` : ''} [AI: ${e.category || 'Live Music'} @ ${e.confidence_score || 50}%]`,
    }));

    let { error: insertErr } = await supabase
      .from('submissions')
      .insert(drafts);

    // If insert fails (e.g. category/confidence_score columns don't exist yet),
    // retry without the new columns so the upload still works
    if (insertErr) {
      console.warn('[ocr-flyer] Insert failed, retrying without new columns:', insertErr.message);
      const fallbackDrafts = drafts.map(({ category, confidence_score, ...rest }) => rest);
      const { error: retryErr } = await supabase
        .from('submissions')
        .insert(fallbackDrafts);

      if (retryErr) {
        console.error('[ocr-flyer] Insert error (retry):', retryErr.message);
        return NextResponse.json({ error: retryErr.message }, { status: 500 });
      }
      // Succeeded with fallback — note this in response
      return NextResponse.json({
        events: extracted,
        drafts_created: drafts.length,
        message: `Created ${drafts.length} draft submissions (note: run SQL migration to enable Smart Categorization)`,
      });
    }

    return NextResponse.json({
      events: extracted,
      drafts_created: drafts.length,
      message: `Created ${drafts.length} draft submissions from flyer`,
    });

  } catch (err) {
    console.error('[ocr-flyer] Processing error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
