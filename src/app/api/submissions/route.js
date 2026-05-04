import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { enforceRateLimit, capString, capEmail, capUrl } from '@/lib/publicPostGuards';

export async function POST(request) {
  // Per-IP rate limit (10/hr/route). C3 audit fix May 2 2026.
  const limited = enforceRateLimit(request, NextResponse);
  if (limited) return limited;

  const supabase = getAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Photo upload path — image_url + pending_ai_parse
  if (body.image_url) {
    // Validate the image URL is http(s) and ≤1000 chars. Without this an
    // attacker could submit a 10MB string OR a `javascript:` URL that
    // lands in the admin's review queue UI.
    const safeImageUrl = capUrl(body.image_url, 1000);
    if (!safeImageUrl) {
      return NextResponse.json({ error: 'Invalid image_url' }, { status: 400 });
    }

    const { error } = await supabase
      .from('submissions')
      .insert({
        image_url: safeImageUrl,
        artist_name: 'Flyer Upload — Pending Review',
        status: 'pending',
      });

    if (error) {
      console.error('[submissions POST] Photo upload DB error:', error.message, error.details, error.hint);
      // Generic message to caller; full error logged server-side.
      return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Manual entry path — artist/venue/date + pending_admin
  // Normalize event_date to ISO timestamp if it's just YYYY-MM-DD
  let eventDate = null;
  if (body.event_date) {
    try {
      eventDate = body.event_time
        ? new Date(`${body.event_date}T${body.event_time}`).toISOString()
        : new Date(`${body.event_date}T00:00:00`).toISOString();
    } catch {
      eventDate = null;
    }
  }

  // DB constraint only allows: pending, approved, rejected
  const safeStatus = 'pending';

  // Cap every user-supplied string at column-friendly lengths. Prevents
  // attackers from filling rows with multi-MB blobs and stops scraper-
  // style copy from blowing past sane review-UI display widths.
  const { error } = await supabase
    .from('submissions')
    .insert({
      artist_name:     capString(body.artist_name, 200),
      venue_name:      capString(body.venue_name, 200),
      event_date:      eventDate,
      genre:           capString(body.genre, 100),
      vibe:            capString(body.vibe, 100),
      cover:           capString(body.cover, 100),
      artist_bio:      capString(body.artist_bio, 2000),
      notes:           capString(body.notes, 2000),
      submitter_email: capEmail(body.submitter_email),
      status: safeStatus,
    });

  if (error) {
    console.error('[submissions POST] DB error:', error.message, error.details, error.hint);
    // Generic outward message; details only in server logs.
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request) {
  // Admin only — get all submissions
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
