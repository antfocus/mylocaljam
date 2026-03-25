import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

/**
 * POST /api/admin/venues
 * Quick-create a new venue from the admin queue triage card.
 * Body: { name: string, address?: string }
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

  const { name, address } = body;
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Venue name is required' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Check for duplicate
  const { data: existing } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', name.trim())
    .limit(1);

  if (existing?.length > 0) {
    return NextResponse.json({ error: `Venue "${existing[0].name}" already exists`, venue: existing[0] }, { status: 409 });
  }

  const { data: venue, error } = await supabase
    .from('venues')
    .insert({ name: name.trim(), address: address?.trim() || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(venue);
}
