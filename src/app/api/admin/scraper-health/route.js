import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('scraper_health')
    .select('*')
    .order('venue_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function PUT(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const body = await request.json();
  const { id, platform } = body;

  if (!id || !platform) {
    return NextResponse.json({ error: 'id and platform are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('scraper_health')
    .update({ platform })
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}
