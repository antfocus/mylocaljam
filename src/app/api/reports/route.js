import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { enforceRateLimit, capString } from '@/lib/publicPostGuards';

export const dynamic = 'force-dynamic';

// Allowlist of issue types that the flag-event button + admin queue
// understand. Anything outside this set falls back to 'other' rather
// than going through verbatim — prevents an attacker from injecting
// arbitrary strings into the reports table that the admin UI might
// later render unexpectedly.
const VALID_ISSUE_TYPES = new Set([
  'wrong_time', 'wrong_venue', 'wrong_date', 'wrong_artist',
  'wrong_image', 'inappropriate', 'cancelled', 'duplicate',
  'broken_link', 'other',
]);

export async function POST(request) {
  // Per-IP rate limit (30/hr). C3 audit fix May 2 2026.
  const limited = enforceRateLimit(request, NextResponse);
  if (limited) return limited;

  const supabase = getAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // event_id must be a UUID-ish string. Don't enforce strict UUID format
  // (a malformed id will fail the FK check anyway), but reject empty /
  // non-string / wildly-long values up front.
  const eventId = capString(body.event_id, 64);
  if (!eventId) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 });
  }

  const issueType = VALID_ISSUE_TYPES.has(body.issue_type) ? body.issue_type : 'other';

  const { error } = await supabase
    .from('reports')
    .insert({
      event_id: eventId,
      issue_type: issueType,
      description: capString(body.description, 1000),
      status: 'pending',
    });

  if (error) {
    console.error('[reports POST] DB error:', error.message);
    // Generic outward; details only in server logs.
    return NextResponse.json({ error: 'Report submission failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// UPDATE report status (resolve/reject/review)
export async function PUT(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id, status } = body;

  if (!id || !['fixed', 'rejected', 'reviewed'].includes(status)) {
    return NextResponse.json({ error: 'id and status (fixed/rejected/reviewed) required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reports')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('reports')
    .select('*, events(artist_name, venue_name, event_date)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
