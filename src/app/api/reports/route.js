import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const supabase = getAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from('reports')
    .insert({
      event_id: body.event_id,
      issue_type: body.issue_type,
      description: body.description,
      status: 'pending',
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
