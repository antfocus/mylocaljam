import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAuthClient(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * GET /api/notification-prefs
 * Returns user's notification preferences (or defaults if none set).
 */
export async function GET(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Return defaults if no row exists yet
  if (error || !data) {
    return NextResponse.json({
      email_enabled: true,
      in_app_enabled: true,
    });
  }

  return NextResponse.json({
    email_enabled: data.email_enabled,
    in_app_enabled: data.in_app_enabled,
  });
}

/**
 * PATCH /api/notification-prefs
 * Update notification preferences.
 * Body: { email_enabled?: boolean, in_app_enabled?: boolean }
 */
export async function PATCH(request) {
  const supabase = getAuthClient(request);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const update = { updated_at: new Date().toISOString() };
  if (typeof body.email_enabled === 'boolean') update.email_enabled = body.email_enabled;
  if (typeof body.in_app_enabled === 'boolean') update.in_app_enabled = body.in_app_enabled;

  // Upsert: create row if it doesn't exist, update if it does
  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert({
      user_id: user.id,
      email_enabled: body.email_enabled ?? true,
      in_app_enabled: body.in_app_enabled ?? true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
