import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { enforceRateLimit, capString, capEmail } from '@/lib/publicPostGuards';

/**
 * POST /api/feedback
 * Stores user app feedback (rating, type, message).
 * No auth required — anyone can submit feedback.
 *
 * Supabase table required:
 *   CREATE TABLE IF NOT EXISTS app_feedback (
 *     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
 *     type        TEXT DEFAULT 'general',   -- 'general', 'bug', 'feature'
 *     message     TEXT,
 *     email       TEXT,
 *     created_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
export async function POST(request) {
  // Per-IP rate limit (20/hr). C3 audit fix May 2 2026.
  const limited = enforceRateLimit(request, NextResponse);
  if (limited) return limited;

  const supabase = getAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rating, type, message, email } = body;

  // Basic validation — need at least a rating or a message
  const safeMessage = capString(message, 2000);
  const safeRating  = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : null;
  if (!safeRating && !safeMessage) {
    return NextResponse.json({ error: 'Rating or message required' }, { status: 400 });
  }

  // Type allowlist — anything else falls back to 'general'.
  const validTypes = ['general', 'bug', 'feature'];
  const safeType = validTypes.includes(type) ? type : 'general';

  const { error } = await supabase
    .from('app_feedback')
    .insert({
      rating: safeRating,
      type: safeType,
      message: safeMessage,
      email: capEmail(email),
    });

  if (error) {
    console.error('[feedback POST] DB error:', error.message);
    // Generic outward; details only in server logs.
    return NextResponse.json({ error: 'Feedback submission failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * GET /api/feedback — Admin only, retrieve all feedback
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('app_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
