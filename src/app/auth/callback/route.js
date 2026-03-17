import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Auth callback route — handles the redirect from Supabase Auth
 * (OAuth providers + Magic Link both redirect here)
 *
 * The Supabase JS client automatically exchanges the code in the URL
 * fragment for a session on the client side. This route just needs
 * to redirect the user back to the app.
 *
 * For server-side code exchange (PKCE flow), Supabase sends `code`
 * as a query param.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const origin = new URL(request.url).origin;

  if (code) {
    // Exchange the code for a session server-side
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
      },
    });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect back to home — the client-side onAuthStateChange will pick up the session
  return NextResponse.redirect(origin);
}
