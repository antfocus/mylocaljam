import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export async function POST(request) {
  const supabase = getAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      artist_name: body.artist_name,
      venue_name: body.venue_name,
      event_date: body.event_date && body.event_time
        ? new Date(`${body.event_date}T${body.event_time}`).toISOString()
        : null,
      genre: body.genre || null,
      vibe: body.vibe || null,
      cover: body.cover || null,
      artist_bio: body.artist_bio || null,
      notes: body.notes || null,
      submitter_email: body.submitter_email || null,
      status: 'pending',
    });

  if (error) {
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
