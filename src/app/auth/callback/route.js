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

  // OAuth providers (Google, etc.) return here with `error` + `error_description`
  // query params when the user cancels consent, denies the scope, or the flow
  // otherwise fails upstream. Without this handling the user was silently
  // redirected home with no feedback. Forward the message so the client can
  // surface it to the user.
  const oauthError = searchParams.get('error');
  const oauthErrorDesc = searchParams.get('error_description');
  if (oauthError) {
    const msg = encodeURIComponent(oauthErrorDesc || oauthError);
    return NextResponse.redirect(`${origin}/?auth_error=${msg}`);
  }

  if (code) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { flowType: 'pkce' },
      });
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (err) {
      // Code exchange can fail if the link is expired, already used, or the
      // verifier cookie is missing. Surface to the client.
      const msg = encodeURIComponent(err?.message || 'Sign-in failed. Please try again.');
      return NextResponse.redirect(`${origin}/?auth_error=${msg}`);
    }
  }

  // Success — client-side onAuthStateChange will pick up the session
  return NextResponse.redirect(origin);
}
