import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/submissions/mine
 * Returns the 10 most recent submissions for the history table.
 * No auth required — returns recent submissions globally (limited fields).
 */
export async function GET() {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('submissions')
    .select('id, artist_name, venue_name, image_url, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
