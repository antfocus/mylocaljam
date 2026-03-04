// lib/scrapers/pigAndParrot.js
// Pig & Parrot Brielle — PopMenu GraphQL API
//
// If this scraper stops working, go to thepigandparrot.com/events-brielle,
// open DevTools → Network → Fetch/XHR, scroll to the Live Events section,
// and look for the calendarEventBySlug request. Check the Payload tab for
// an updated slug or operationId and update the constants below.

const GRAPHQL_URL = 'https://www.thepigandparrot.com/graphql';
const RESTAURANT_ID = 9325; // Brielle location
const CALENDAR_SLUG = 'burning-sun-db8b9cec'; // calendar section slug
const OPERATION_ID = 'PopmenuClient/7f4d92021ed75fb31ada391acac0a154';

function secondsToTime(seconds) {
  if (!seconds && seconds !== 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function scrapePigAndParrot() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.thepigandparrot.com',
        'Referer': 'https://www.thepigandparrot.com/brielle',
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)',
      },
      body: JSON.stringify({
        operationName: 'calendarEventBySlug',
        variables: {
          restaurantId: RESTAURANT_ID,
          slug: CALENDAR_SLUG,
        },
        extensions: {
          operationId: OPERATION_ID,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from PopMenu GraphQL`);
    }

    const json = await res.json();

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    const raw = json?.data?.calendarEventBySlug;

    // API may return a single event object or an array
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

    for (const ev of list) {
      // Skip past or cancelled events
      if (ev.isPastEvent || ev.status !== 'active') continue;

      events.push({
        title: ev.name,
        venue: 'Pig & Parrot Brielle',
        date: ev.startAt,           // "YYYY-MM-DD"
        time: secondsToTime(ev.startTime),
        end_time: secondsToTime(ev.endTime),
        description: ev.description || null,
        image_url: ev.photoUrl || null,
        ticket_url:
          ev.externalLinkUrl ||
          `https://www.thepigandparrot.com${ev.calendarEventPageUrl}`,
        source_url: 'https://www.thepigandparrot.com/brielle',
        external_id: `pigandparrot-${ev.id}`,
        approved: true,
      });
    }

    console.log(`[PigAndParrot] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[PigAndParrot] Scraper error:', err.message);
  }

  return { events, error };
}