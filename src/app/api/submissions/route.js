import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export async function POST(request) {
  const supabase = getAdminClient();
  const body = await request.json();

  // Photo upload path — image_url + pending_ai_parse
  if (body.image_url) {
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        image_url: body.image_url,
        artist_name: 'Flyer Upload — Pending Review',
        status: 'pending',
      });

    if (error) {
      console.error('[submissions POST] Photo upload DB error:', error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // Manual entry path — artist/venue/date + pending_admin
  // Normalize event_date to ISO timestamp if it's just YYYY-MM-DD
  let eventDate = null;
  if (body.event_date) {
    eventDate = body.event_time
      ? new Date(`${body.event_date}T${body.event_time}`).toISOString()
      : new Date(`${body.event_date}T00:00:00`).toISOString();
  }

  // DB constraint only allows: pending, approved, rejected
  const safeStatus = 'pending';

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      artist_name: body.artist_name,
      venue_name: body.venue_name,
      event_date: eventDate,
      genre: body.genre || null,
      vibe: body.vibe || null,
      cover: body.cover || null,
      artist_bio: body.artist_bio || null,
      notes: body.notes || null,
      submitter_email: body.submitter_email || null,
      status: safeStatus,
    });

  if (error) {
    console.error('[submissions POST] DB error:', error.message, error.details, error.hint);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
