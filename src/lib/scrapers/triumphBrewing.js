/**
 * Triumph Brewing Red Bank scraper
 * Page: https://www.triumphbrewing.com/red-bank/live-music-events-red-bank/
 *
 * WordPress site using The Events Calendar plugin.
 * REST API is blocked by Shield Security, so we parse the HTML list view.
 *
 * Strategy:
 *   - Fetch the list view page for current month + next month
 *   - Extract Google Calendar links which contain structured data:
 *     dates (YYYYMMDDTHHMMSS), text (title), details (description)
 *   - Also extract event page URLs from preceding links
 *
 * Pagination: ?monthyear=YYYY-MM
 *
 * If it breaks:
 *   1. Visit the events page in a browser and check structure
 *   2. Google Calendar links may have changed format
 *   3. Shield Security may now block scraper User-Agent
 */

const VENUE = 'Triumph Brewing Red Bank';
const BASE_URL = 'https://www.triumphbrewing.com';
const EVENTS_PATH = '/red-bank/live-music-events-red-bank/';
const VENUE_URL = `${BASE_URL}${EVENTS_PATH}`;

/**
 * Fetch a single month's events page and return parsed events
 */
async function fetchMonth(monthYear) {
  const url = monthYear
    ? `${VENUE_URL}?monthyear=${monthYear}`
    : VENUE_URL;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/**
 * Parse event data from Google Calendar links embedded in the HTML.
 * Each event block has:
 *   <a href="/event/slug">              ← event page link
 *   <h2>Title</h2>                      ← heading with title
 *   <span>Thursday, March 5, 2026</span>← date text
 *   <span>8:00pm</span>                 ← time text
 *   <a href="google.com/calendar/...">  ← Google Calendar link with structured data
 */
function parseEventsFromHTML(html) {
  const events = [];

  // Match all Google Calendar links
  const gcalRegex = /href="(https:\/\/www\.google\.com\/calendar\/event\?[^"]+)"/g;
  let match;

  // Also build a map of event page URLs from /event/ links
  const eventUrlRegex = /href="(https?:\/\/www\.triumphbrewing\.com\/event\/[^"]+?)"/g;
  const eventUrls = [];
  let urlMatch;
  while ((urlMatch = eventUrlRegex.exec(html)) !== null) {
    const href = urlMatch[1];
    // Skip ical links
    if (!href.includes('ical=')) {
      eventUrls.push(href);
    }
  }

  let gcalIndex = 0;
  while ((match = gcalRegex.exec(html)) !== null) {
    try {
      const gcalUrl = match[1].replace(/&amp;/g, '&');
      const params = new URL(gcalUrl).searchParams;

      // Title from text param
      const rawTitle = params.get('text') || '';
      // Decode HTML entities like &#038;
      const title = rawTitle
        .replace(/&#0?38;/g, '&')
        .replace(/&amp;/g, '&')
        .trim();
      if (!title) continue;

      // Dates from dates param: YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS
      const dates = params.get('dates') || '';
      const [startStr] = dates.split('/');
      if (!startStr || startStr.length < 15) continue;

      // Parse YYYYMMDDTHHMMSS (local time, America/New_York)
      const year = startStr.slice(0, 4);
      const month = startStr.slice(4, 6);
      const day = startStr.slice(6, 8);
      const hour = startStr.slice(9, 11);
      const minute = startStr.slice(11, 13);

      const dateStr = `${year}-${month}-${day}`;

      // Convert to 12-hour time
      const h = parseInt(hour, 10);
      const m = minute;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      const time = `${hour12}:${m} ${ampm}`;

      // Description from details param (URL-encoded)
      const rawDetails = params.get('details') || '';
      const description = rawDetails
        .replace(/<[^>]*>/g, '')
        .replace(/\r\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500) || null;

      // Event page URL — Google Calendar links appear after the event page link
      // Each event has ~1 event page link followed by 1 Google Calendar link
      const eventUrl = eventUrls[gcalIndex] || VENUE_URL;

      // Build slug from event URL for external ID
      const slug = eventUrl
        .replace(/^.*\/event\//, '')
        .replace(/\/$/, '')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .slice(0, 60);

      const externalId = `triumphbrewing-${dateStr}-${slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;

      events.push({
        title,
        venue: VENUE,
        date: dateStr,
        time,
        description,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: null,
      });
    } catch (e) {
      // Skip malformed entries
    }

    gcalIndex++;
  }

  return events;
}

export async function scrapeTriumphBrewing() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Current month
    const currentMonth = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7);

    // Next month
    const nextDate = new Date(now);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextMonth = nextDate.toISOString().slice(0, 7);

    // Fetch current month and next month in parallel
    const [currentHtml, nextHtml] = await Promise.all([
      fetchMonth(null),
      fetchMonth(nextMonth),
    ]);

    // Parse events from both pages
    const currentEvents = parseEventsFromHTML(currentHtml);
    const nextEvents = parseEventsFromHTML(nextHtml);

    // Combine and deduplicate
    const seen = new Set();
    const events = [];

    for (const ev of [...currentEvents, ...nextEvents]) {
      // Skip past events
      if (ev.date < todayStr) continue;

      if (seen.has(ev.external_id)) continue;
      seen.add(ev.external_id);

      events.push(ev);
    }

    console.log(`[TriumphBrewing] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[TriumphBrewing] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
