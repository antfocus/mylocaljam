import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

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
  const { submission_id, event_data, is_featured } = body;

  // Fetch the submission to get image_url for linking
  const { data: submission } = await supabase
    .from('submissions')
    .select('image_url')
    .eq('id', submission_id)
    .single();

  // Create the event with image_url from the submission's uploaded poster
  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      artist_name: event_data.artist_name,
      artist_bio: event_data.artist_bio || null,
      venue_name: event_data.venue_name,
      venue_id: event_data.venue_id || null,
      event_date: event_data.event_date,
      genre: event_data.genre || null,
      vibe: event_data.vibe || null,
      cover: event_data.cover || null,
      ticket_link: event_data.ticket_link || null,
      image_url: submission?.image_url || event_data.image_url || null,
      is_featured: is_featured || false,
      status: 'published',
      source: 'Community Submitted',
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  // Update submission status
  const { error: subError } = await supabase
    .from('submissions')
    .update({ status: 'approved' })
    .eq('id', submission_id);

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
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

// Duplicate check endpoint via query params
// GET /api/admin/queue?check_duplicate=true&venue=X&date=YYYY-MM-DD
