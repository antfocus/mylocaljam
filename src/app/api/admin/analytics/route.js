import { NextResponse } from 'next/server';

// Prevent Next.js / Vercel from caching this route — always fetch fresh from PostHog
export const dynamic = 'force-dynamic';

// us.i.posthog.com = ingestion (client-side events)
// us.posthog.com   = API (server-side queries with Personal API Key)
const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST || 'https://us.posthog.com';
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;

// Map range param to number of days for HogQL
function rangeToDays(range) {
  switch (range) {
    case 'today': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case 'all': return 365;
    default: return 7;
  }
}

// Resolve PostHog project ID dynamically
// Supports environment switching: picks the project whose name includes the env hint
// If POSTHOG_PROJECT_ID is set explicitly, use that
let projectCache = null;
async function getProjectId(envHint) {
  // Allow explicit override via env var
  if (process.env.POSTHOG_PROJECT_ID) return process.env.POSTHOG_PROJECT_ID;

  if (!projectCache) {
    try {
      const res = await fetch(`${POSTHOG_API_HOST}/api/projects/`, {
        headers: { 'Authorization': `Bearer ${POSTHOG_API_KEY}` },
      });
      if (!res.ok) {
        console.error('[Analytics] Failed to list PostHog projects:', res.status);
        return null;
      }
      const data = await res.json();
      projectCache = data.results || data || [];
    } catch (err) {
      console.error('[Analytics] PostHog project lookup error:', err);
      return null;
    }
  }

  if (!projectCache.length) return null;

  // If envHint provided, try to match project name (e.g. "Dev" or "Production")
  if (envHint && projectCache.length > 1) {
    const hint = envHint.toLowerCase();
    const match = projectCache.find(p =>
      (p.name || '').toLowerCase().includes(hint)
    );
    if (match) return match.id;
  }

  // Default: first project (production)
  return projectCache[0].id;
}

// Run a HogQL query against PostHog
// Returns { data, error, status } for debug visibility
async function hogql(projectId, query) {
  const url = `${POSTHOG_API_HOST}/api/projects/${projectId}/query/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POSTHOG_API_KEY}`,
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[Analytics] HogQL error:', res.status, text.slice(0, 500));
    return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status };
  }
  const data = await res.json();
  return { data, error: null, status: res.status };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Auth: require admin password via Authorization header.
  // SECURITY (May 2 2026 audit C2): previously read from `?password=`
  // query param, which leaked the secret into Vercel access logs,
  // browser history, and any outbound Referer header on responses.
  // Switched to Bearer header — same pattern used by every other
  // admin route. The query-param branch is rejected outright (no
  // backward-compat) so an old client URL fails fast and obviously
  // rather than silently falling through to 401 with the password
  // already logged.
  const authHeader = request.headers.get('authorization') || '';
  const expected   = `Bearer ${process.env.ADMIN_PASSWORD}`;
  if (authHeader !== expected) {
    if (searchParams.get('password')) {
      // Caller is using the deprecated query-param shape. Tell them
      // explicitly so devtools don't waste time on a "wrong password"
      // hunt. The secret already leaked into logs at this point — the
      // only mitigation now is rotation + this hard rejection.
      return NextResponse.json(
        { error: 'Auth via ?password= query param has been removed. Send Authorization: Bearer <password> instead.' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Debug mode: ?debug=1 returns raw PostHog responses + config diagnostics.
  // Gated to non-production builds (security audit M8) so prod never leaks
  // err.stack, key prefixes, or internal config via the response body —
  // even with the right query string and a valid admin Bearer.
  const debug = searchParams.get('debug') === '1' && process.env.NODE_ENV !== 'production';

  // Key diagnostics
  const keyPrefix = POSTHOG_API_KEY ? POSTHOG_API_KEY.slice(0, 4) + '...' : 'MISSING';
  const projectIdEnv = process.env.POSTHOG_PROJECT_ID || 'NOT SET';

  if (!POSTHOG_API_KEY) {
    return NextResponse.json({
      error: 'PostHog API key not configured',
      debug: debug ? { keyPrefix, projectIdEnv, apiHost: POSTHOG_API_HOST } : undefined,
      uniqueVisitors: 0, mobile: 0, desktop: 0,
      venueClicks: 0, topVenue: '—', topVenueClicks: 0,
      bookmarks: 0,
    }, { status: 200 });
  }

  const range = searchParams.get('range') || '7d';
  const env = searchParams.get('env') || ''; // 'dev' | 'production' | '' (auto)
  const days = rangeToDays(range);

  try {
    const projectId = await getProjectId(env);
    if (!projectId) {
      return NextResponse.json({
        error: 'Could not resolve PostHog project',
        debug: debug ? { keyPrefix, projectIdEnv, apiHost: POSTHOG_API_HOST, envHint: env } : undefined,
        uniqueVisitors: 0, mobile: 0, desktop: 0,
        venueClicks: 0, topVenue: '—', topVenueClicks: 0,
        bookmarks: 0,
      });
    }

    console.log(`[Analytics] Querying PostHog — project: ${projectId}, range: ${range} (${days}d), key: ${keyPrefix}, host: ${POSTHOG_API_HOST}`);

    // Run all queries in parallel
    const [visitorsRes, deviceRes, venueClicksRes, topVenueRes, bookmarksRes] = await Promise.all([
      // 1. Unique visitors — count distinct persons with a $pageview
      hogql(projectId,
        `SELECT count(DISTINCT person_id)
         FROM events
         WHERE event = '$pageview'
           AND timestamp >= now() - toIntervalDay(${days})`
      ),

      // 2. Device breakdown — use $device_type property on $pageview events
      hogql(projectId,
        `SELECT
           properties.$device_type AS device_type,
           count(DISTINCT person_id) AS visitors
         FROM events
         WHERE event = '$pageview'
           AND timestamp >= now() - toIntervalDay(${days})
         GROUP BY device_type
         ORDER BY visitors DESC`
      ),

      // 3. Total venue_link_clicked count
      hogql(projectId,
        `SELECT count() AS clicks
         FROM events
         WHERE event = 'venue_link_clicked'
           AND timestamp >= now() - toIntervalDay(${days})`
      ),

      // 4. Top venue by venue_link_clicked → venue_name property
      hogql(projectId,
        `SELECT
           properties.venue_name AS venue,
           count() AS clicks
         FROM events
         WHERE event = 'venue_link_clicked'
           AND timestamp >= now() - toIntervalDay(${days})
           AND properties.venue_name IS NOT NULL
           AND properties.venue_name != ''
         GROUP BY venue
         ORDER BY clicks DESC
         LIMIT 5`
      ),

      // 5. Total event_bookmarked count
      hogql(projectId,
        `SELECT count() AS bookmarks
         FROM events
         WHERE event = 'event_bookmarked'
           AND timestamp >= now() - toIntervalDay(${days})`
      ),
    ]);

    // Log raw results for debugging
    console.log('[Analytics] visitors raw:', JSON.stringify(visitorsRes.data?.results || visitorsRes.error));
    console.log('[Analytics] device raw:', JSON.stringify(deviceRes.data?.results || deviceRes.error));
    console.log('[Analytics] venueClicks raw:', JSON.stringify(venueClicksRes.data?.results || venueClicksRes.error));
    console.log('[Analytics] bookmarks raw:', JSON.stringify(bookmarksRes.data?.results || bookmarksRes.error));

    // Parse unique visitors
    const uniqueVisitors = visitorsRes.data?.results?.[0]?.[0] || 0;

    // Parse device breakdown into mobile / desktop
    let mobile = 0;
    let desktop = 0;
    if (deviceRes.data?.results) {
      for (const [deviceType, count] of deviceRes.data.results) {
        const dt = (deviceType || '').toLowerCase();
        if (dt === 'mobile' || dt === 'tablet') {
          mobile += count;
        } else if (dt === 'desktop') {
          desktop += count;
        }
        // Other types (Spider, etc.) excluded
      }
    }

    // Parse venue clicks
    const venueClicks = venueClicksRes.data?.results?.[0]?.[0] || 0;

    // Parse top venue
    let topVenue = '—';
    let topVenueClicks = 0;
    if (topVenueRes.data?.results?.length > 0) {
      topVenue = topVenueRes.data.results[0][0] || '—';
      topVenueClicks = topVenueRes.data.results[0][1] || 0;
    }

    // Parse bookmarks
    const bookmarks = bookmarksRes.data?.results?.[0]?.[0] || 0;

    const response = {
      uniqueVisitors,
      mobile,
      desktop,
      venueClicks,
      topVenue,
      topVenueClicks,
      bookmarks,
      range,
      projectId,
    };

    // In debug mode, include raw PostHog responses + config info
    if (debug) {
      response.debug = {
        keyPrefix,
        projectIdEnv,
        apiHost: POSTHOG_API_HOST,
        resolvedProjectId: projectId,
        envHint: env,
        days,
        raw: {
          visitors: visitorsRes.error || visitorsRes.data?.results,
          device: deviceRes.error || deviceRes.data?.results,
          venueClicks: venueClicksRes.error || venueClicksRes.data?.results,
          topVenue: topVenueRes.error || topVenueRes.data?.results,
          bookmarks: bookmarksRes.error || bookmarksRes.data?.results,
        },
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    // Full error to Vercel runtime logs; generic message in prod response
    // (security audit M8). `debug` is now NODE_ENV-gated above, so the
    // stack-and-config payload is automatically suppressed in prod.
    console.error('[Analytics] API error:', err);
    return NextResponse.json({
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
      debug: debug ? { keyPrefix, projectIdEnv, apiHost: POSTHOG_API_HOST, stack: err.stack?.slice(0, 300) } : undefined,
      uniqueVisitors: 0, mobile: 0, desktop: 0,
      venueClicks: 0, topVenue: '—', topVenueClicks: 0,
      bookmarks: 0,
    }, { status: 200 }); // Degrade gracefully
  }
}
