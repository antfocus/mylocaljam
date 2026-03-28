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
async function hogql(projectId, query) {
  const res = await fetch(`${POSTHOG_API_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POSTHOG_API_KEY}`,
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[Analytics] HogQL error:', res.status, text.slice(0, 300));
    return null;
  }
  return res.json();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Auth: require admin password
  const password = searchParams.get('password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!POSTHOG_API_KEY) {
    return NextResponse.json({
      error: 'PostHog API key not configured',
      uniqueVisitors: 0, mobile: 0, desktop: 0,
      venueClicks: 0, topVenue: '—', topVenueClicks: 0,
      bookmarks: 0,
    }, { status: 200 }); // Return zeros so dashboard doesn't break
  }

  const range = searchParams.get('range') || '7d';
  const env = searchParams.get('env') || ''; // 'dev' | 'production' | '' (auto)
  const days = rangeToDays(range);

  try {
    const projectId = await getProjectId(env);
    if (!projectId) {
      return NextResponse.json({
        error: 'Could not resolve PostHog project',
        uniqueVisitors: 0, mobile: 0, desktop: 0,
        venueClicks: 0, topVenue: '—', topVenueClicks: 0,
        bookmarks: 0,
      });
    }

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

    // Parse unique visitors
    const uniqueVisitors = visitorsRes?.results?.[0]?.[0] || 0;

    // Parse device breakdown into mobile / desktop
    let mobile = 0;
    let desktop = 0;
    if (deviceRes?.results) {
      for (const [deviceType, count] of deviceRes.results) {
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
    const venueClicks = venueClicksRes?.results?.[0]?.[0] || 0;

    // Parse top venue
    let topVenue = '—';
    let topVenueClicks = 0;
    if (topVenueRes?.results?.length > 0) {
      topVenue = topVenueRes.results[0][0] || '—';
      topVenueClicks = topVenueRes.results[0][1] || 0;
    }

    // Parse bookmarks
    const bookmarks = bookmarksRes?.results?.[0]?.[0] || 0;

    return NextResponse.json({
      uniqueVisitors,
      mobile,
      desktop,
      venueClicks,
      topVenue,
      topVenueClicks,
      bookmarks,
      range,
      projectId,
    });
  } catch (err) {
    console.error('[Analytics] API error:', err);
    return NextResponse.json({
      error: err.message,
      uniqueVisitors: 0, mobile: 0, desktop: 0,
      venueClicks: 0, topVenue: '—', topVenueClicks: 0,
      bookmarks: 0,
    }, { status: 200 }); // Degrade gracefully
  }
}
