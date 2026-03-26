import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

/**
 * POST /api/support
 * Unified help & feedback endpoint — stores support requests with optional vibe rating.
 * No auth required — anyone can submit.
 *
 * Supabase table required:
 *   CREATE TABLE IF NOT EXISTS support_requests (
 *     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
 *     category    TEXT DEFAULT 'general',  -- 'account', 'event', 'bug', 'feature', 'general'
 *     message     TEXT,
 *     email       TEXT,
 *     status      TEXT DEFAULT 'open',     -- 'open', 'in_progress', 'resolved', 'closed'
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
export async function POST(request) {
  const supabase = getAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rating, category, message, email } = body;

  // Need at least a rating or a message
  if (!rating && !message?.trim()) {
    return NextResponse.json({ error: 'Rating or message required' }, { status: 400 });
  }

  const validCategories = ['account', 'event', 'bug', 'feature', 'general'];
  const safeCategory = validCategories.includes(category) ? category : 'general';

  const safeRating = typeof rating === 'number' && rating >= 1 && rating <= 5
    ? rating : null;

  const { error } = await supabase
    .from('support_requests')
    .insert({
      rating: safeRating,
      category: safeCategory,
      message: message?.trim() || null,
      email: email || null,
    });

  if (error) {
    console.error('[support POST] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/support — Admin only, retrieve support requests
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // optional filter

  let query = supabase
    .from('support_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
