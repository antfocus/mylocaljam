import { NextResponse } from 'next/server';

// Prevent Next.js / Vercel from caching this route — always fetch fresh from PostHog
export const dynamic = 'force-dynamic';

// Allow up to 60s for the 9 parallel PostHog queries to complete before
// Vercel kills the function. Hobby plan caps at 10s; Pro+ honors this.
// Empty-body 500s on the admin dashboard May 5, 2026 traced to the new
// vs returning query exceeding Hobby's 10s cap. The maxDuration export
// lets Pro plan users see the full response while Hobby users get a
// faster degraded path (next fix below) for slow queries.
export const maxDuration = 60;

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

// Build the timestamp WHERE clause for a given range.
// 'today' → calendar day in America/New_York (was rolling 24h before May 5,
//   2026 — that didn't match what 'Today' implies on the admin chip).
// '7d' / '30d' / 'all' → rolling N-day window (unchanged).
//
// ClickHouse pattern: convert both sides to NY tz so the day boundary aligns
// with what the admin sees on their phone in NJ. Without toTimeZone the
// `toStartOfDay` would be UTC midnight, which is 7-8pm Eastern — events
// between 7pm-midnight last night would wrongly count as "today."
function buildTimeFilter(range) {
  if (range === 'today') {
    return `toTimeZone(timestamp, 'America/New_York') >= toStartOfDay(toTimeZone(now(), 'America/New_York'))`;
  }
  const days = rangeToDays(range);
  return `${timeFilter}`;
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
  const timeFilter = buildTimeFilter(range);

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

    // Run all queries in parallel via allSettled so one rejection can't
    // poison the whole response. Each entry below is a Promise<{data,error}>
    // from hogql(); allSettled gives us a Promise<{status,value|reason}> per
    // entry. Then we normalize back to the {data,error} shape so the parsing
    // code below doesn't have to know the difference. This is what was
    // returning empty-body 500s on Hobby (May 5 2026) — one slow query was
    // exceeding the 10s function cap and Vercel killed the whole process.
    const settled = await Promise.allSettled([
      // 1. Unique visitors — count distinct persons with a $pageview
      hogql(projectId,
        `SELECT count(DISTINCT person_id)
         FROM events
         WHERE event = '$pageview'
           AND ${timeFilter}`
      ),

      // 2. Device breakdown — use $device_type property on $pageview events
      hogql(projectId,
        `SELECT
           properties.$device_type AS device_type,
           count(DISTINCT person_id) AS visitors
         FROM events
         WHERE event = '$pageview'
           AND ${timeFilter}
         GROUP BY device_type
         ORDER BY visitors DESC`
      ),

      // 3. Total venue_link_clicked count — only saves count (not unsaves).
      // The May 5 audit added an `action` property to event_bookmarked. Old
      // events (pre-rename) have no `action` so a NULL check counts them as
      // saves to preserve historical totals; new events with action='unsaved'
      // are excluded.
      hogql(projectId,
        `SELECT count() AS clicks
         FROM events
         WHERE event = 'venue_link_clicked'
           AND ${timeFilter}`
      ),

      // 4. Top venue by venue_link_clicked → venue_name property
      hogql(projectId,
        `SELECT
           properties.venue_name AS venue,
           count() AS clicks
         FROM events
         WHERE event = 'venue_link_clicked'
           AND ${timeFilter}
           AND properties.venue_name IS NOT NULL
           AND properties.venue_name != ''
         GROUP BY venue
         ORDER BY clicks DESC
         LIMIT 5`
      ),

      // 5. Total event_bookmarked count — only count saves, not unsaves.
      // Pre-May-5 events have no `action` property — count those as saves
      // (the action column was added May 5; old data is save-only by design).
      hogql(projectId,
        `SELECT count() AS bookmarks
         FROM events
         WHERE event = 'event_bookmarked'
           AND ${timeFilter}
           AND (properties.action IS NULL OR properties.action = 'saved')`
      ),

      // 6. Spotlight CTR: taps / impressions for the time window. Both events
      // are deduped by (person_id, event_id) at impression time so the CTR
      // is meaningful even if the carousel auto-rotates many times for the
      // same viewer. Numerator and denominator both share the same dedup
      // shape so the ratio is honest. Uses concat() for the dedup key
      // because HogQL's tuple-DISTINCT support is iffy.
      hogql(projectId,
        `SELECT
           (SELECT count(DISTINCT concat(toString(person_id), '|', toString(properties.event_id)))
            FROM events
            WHERE event = 'spotlight_tapped'
              AND ${timeFilter}) AS taps,
           (SELECT count(DISTINCT concat(toString(person_id), '|', toString(properties.event_id)))
            FROM events
            WHERE event = 'spotlight_impression'
              AND ${timeFilter}) AS impressions`
      ),

      // 7. Top referring domain — where users came from. Empty / direct
      // visits show as ''. Strip mylocaljam.com self-referrals so internal
      // navigation doesn't dominate.
      hogql(projectId,
        `SELECT
           properties.$referring_domain AS domain,
           count(DISTINCT person_id) AS visitors
         FROM events
         WHERE event = '$pageview'
           AND ${timeFilter}
           AND properties.$referring_domain IS NOT NULL
           AND properties.$referring_domain != ''
           AND NOT (properties.$referring_domain LIKE '%mylocaljam.com%')
         GROUP BY domain
         ORDER BY visitors DESC
         LIMIT 5`
      ),

      // 8. % of traffic from NJ. PostHog's geo-IP autocaptures
      // $geoip_subdivision_1_code (state code, e.g. "NJ"). We compute NJ
      // visitors / total visitors with non-null geo (some browsers / VPNs
      // may have null geo; excluding them gives a more honest %).
      // One row per person (not per pageview) so heavy users don't skew.
      hogql(projectId,
        `SELECT
           countIf(subdivision_code = 'NJ') AS nj_visits,
           count() AS total_visits_with_geo
         FROM (
           SELECT person_id,
                  any(properties.$geoip_subdivision_1_code) AS subdivision_code
           FROM events
           WHERE event = '$pageview'
             AND ${timeFilter}
             AND properties.$geoip_subdivision_1_code IS NOT NULL
             AND properties.$geoip_subdivision_1_code != ''
           GROUP BY person_id
         )`
      ),

      // 9. New vs returning visitor split. For every person who had a
      // pageview in the current window, look at whether their FIRST
      // pageview within the last 90 days fell inside the window or
      // before it. The 90-day cap on the inner SELECT keeps the query
      // bounded — scanning the full pageview history was timing out
      // on Vercel Hobby's 10s function cap (May 5 2026).
      //
      // Trade-off: a "returning visitor" returning after a 90+ day
      // gap will be misclassified as "new" once. At launch this is a
      // non-issue (no one has 90 days of history yet). Worth revisiting
      // if returning_visitors looks artificially low post-launch.
      hogql(projectId,
        `SELECT
           countIf(first_ever >= cutoff) AS new_visitors,
           countIf(first_ever < cutoff) AS returning_visitors
         FROM (
           SELECT person_id,
                  min(timestamp) AS first_ever,
                  max(timestamp) AS last_ever,
                  ${range === 'today'
                    ? `toTimeZone(toStartOfDay(toTimeZone(now(), 'America/New_York')), 'UTC')`
                    : `now() - toIntervalDay(${days})`} AS cutoff
           FROM events
           WHERE event = '$pageview'
             AND timestamp >= now() - toIntervalDay(90)
           GROUP BY person_id
           HAVING last_ever >= cutoff
         )`
      ),
    ]);

    // Normalize allSettled output back to the {data,error} shape the rest
    // of the route expects. Rejected promises become {data:null, error:msg}
    // so the parsing code below treats them like a soft PostHog error.
    const normalize = (s, name) => {
      if (s.status === 'fulfilled') return s.value;
      console.error(`[Analytics] Query '${name}' rejected:`, s.reason);
      return { data: null, error: String(s.reason?.message || s.reason || 'rejected') };
    };
    const [
      visitorsRes,
      deviceRes,
      venueClicksRes,
      topVenueRes,
      bookmarksRes,
      spotlightRes,
      referrerRes,
      njRes,
      newReturningRes,
    ] = [
      normalize(settled[0], 'visitors'),
      normalize(settled[1], 'device'),
      normalize(settled[2], 'venueClicks'),
      normalize(settled[3], 'topVenue'),
      normalize(settled[4], 'bookmarks'),
      normalize(settled[5], 'spotlight'),
      normalize(settled[6], 'referrer'),
      normalize(settled[7], 'nj'),
      normalize(settled[8], 'newReturning'),
    ];

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

    // Parse Spotlight CTR — taps / impressions, with safe divide-by-zero
    let spotlightTaps = 0;
    let spotlightImpressions = 0;
    let spotlightCtr = 0;
    if (spotlightRes.data?.results?.[0]) {
      spotlightTaps = spotlightRes.data.results[0][0] || 0;
      spotlightImpressions = spotlightRes.data.results[0][1] || 0;
      spotlightCtr = spotlightImpressions > 0
        ? Math.round((spotlightTaps / spotlightImpressions) * 1000) / 10  // one decimal
        : 0;
    }

    // Parse top referring domain
    let topReferrer = '—';
    let topReferrerVisitors = 0;
    if (referrerRes.data?.results?.length > 0) {
      topReferrer = referrerRes.data.results[0][0] || '—';
      topReferrerVisitors = referrerRes.data.results[0][1] || 0;
    }

    // Parse % NJ traffic
    let njPct = 0;
    let njVisits = 0;
    let totalGeoVisits = 0;
    if (njRes.data?.results?.[0]) {
      njVisits = njRes.data.results[0][0] || 0;
      totalGeoVisits = njRes.data.results[0][1] || 0;
      njPct = totalGeoVisits > 0
        ? Math.round((njVisits / totalGeoVisits) * 100)
        : 0;
    }

    // Parse new vs returning split
    let newVisitors = 0;
    let returningVisitors = 0;
    if (newReturningRes.data?.results?.[0]) {
      newVisitors = newReturningRes.data.results[0][0] || 0;
      returningVisitors = newReturningRes.data.results[0][1] || 0;
    }

    const response = {
      uniqueVisitors,
      mobile,
      desktop,
      venueClicks,
      topVenue,
      topVenueClicks,
      bookmarks,
      // New tiles (May 5, 2026 — see ANALYTICS_PLAN.md item 8)
      spotlightTaps,
      spotlightImpressions,
      spotlightCtr,           // percent, one decimal
      topReferrer,
      topReferrerVisitors,
      njPct,                  // integer percent
      njVisits,
      totalGeoVisits,
      newVisitors,
      returningVisitors,
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
          spotlight: spotlightRes.error || spotlightRes.data?.results,
          referrer: referrerRes.error || referrerRes.data?.results,
          nj: njRes.error || njRes.data?.results,
          newReturning: newReturningRes.error || newReturningRes.data?.results,
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
