import { NextResponse } from 'next/server';

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Helper: build date filter for PostHog queries
function getDateRange(range) {
  const now = new Date();
  switch (range) {
    case 'today': return '-1d';
    case '7d': return '-7d';
    case '30d': return '-30d';
    case 'all': return '-180d'; // 6 months back
    default: return '-7d';
  }
}

// Query PostHog's Query API (HogQL)
async function queryPostHog(query, dateFrom) {
  const projectId = await getProjectId();
  if (!projectId) return null;

  const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POSTHOG_API_KEY}`,
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('PostHog query error:', res.status, text);
    return null;
  }

  return res.json();
}

// Get project ID from PostHog using the API key
let cachedProjectId = null;
async function getProjectId() {
  if (cachedProjectId) return cachedProjectId;

  try {
    const res = await fetch(`${POSTHOG_HOST}/api/projects/`, {
      headers: { 'Authorization': `Bearer ${POSTHOG_API_KEY}` },
    });
    if (!res.ok) {
      console.error('Failed to fetch PostHog projects:', res.status);
      return null;
    }
    const data = await res.json();
    const projects = data.results || data;
    if (projects.length > 0) {
      cachedProjectId = projects[0].id;
      return cachedProjectId;
    }
  } catch (err) {
    console.error('PostHog getProjectId error:', err);
  }
  return null;
}

export async function GET(request) {
  // Verify admin password
  const { searchParams } = new URL(request.url);
  const password = searchParams.get('password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!POSTHOG_API_KEY) {
    return NextResponse.json({ error: 'PostHog API key not configured' }, { status: 500 });
  }

  const range = searchParams.get('range') || '7d';
  const dateFrom = getDateRange(range);

  try {
    // Run all queries in parallel
    const [uniqueVisitors, deviceBreakdown, venueClicks] = await Promise.all([
      // 1. Unique visitors
      queryPostHog(
        `SELECT count(DISTINCT person_id) as unique_visitors
         FROM events
         WHERE event = '$pageview'
         AND timestamp >= now() - toIntervalDay(${range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 180})`
      ),

      // 2. Device breakdown (mobile vs desktop)
      queryPostHog(
        `SELECT
           countIf(DISTINCT person_id, properties.$device_type = 'Mobile') as mobile,
           countIf(DISTINCT person_id, properties.$device_type = 'Desktop') as desktop
         FROM events
         WHERE event = '$pageview'
         AND timestamp >= now() - toIntervalDay(${range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 180})`
      ),

      // 3. Venue link clicks (autocapture on outbound links or custom events)
      queryPostHog(
        `SELECT
           count() as total_clicks,
           properties.$current_url as url
         FROM events
         WHERE (event = '$autocapture' AND properties.$event_type = 'click' AND properties.tag_name = 'a' AND properties.$current_url LIKE '%mylocaljam%')
            OR event = 'venue_link_clicked'
         AND timestamp >= now() - toIntervalDay(${range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 180})
         GROUP BY url
         ORDER BY total_clicks DESC
         LIMIT 20`
      ),
    ]);

    // Parse results
    const visitors = uniqueVisitors?.results?.[0]?.[0] || 0;
    const mobile = deviceBreakdown?.results?.[0]?.[0] || 0;
    const desktop = deviceBreakdown?.results?.[0]?.[1] || 0;

    // Parse venue clicks — total and top venue
    let totalVenueClicks = 0;
    let topVenue = '—';
    if (venueClicks?.results?.length > 0) {
      for (const row of venueClicks.results) {
        totalVenueClicks += (row[0] || 0);
      }
      // Try to extract venue name from the top URL
      const topUrl = venueClicks.results[0]?.[1] || '';
      topVenue = topUrl || '—';
    }

    return NextResponse.json({
      uniqueVisitors: visitors,
      mobile,
      desktop,
      venueClicks: totalVenueClicks,
      topVenue,
      range,
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
