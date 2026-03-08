/**
 * Joe's Surf Shack Scraper
 * URL: https://www.jss.surf/events-2/
 *
 * Uses the Simple Calendar WordPress plugin (simcal) which pulls from
 * Google Calendar and renders via admin-ajax.php.
 *
 * Key details:
 *   - Widget ID: 966
 *   - Action: simcal_default_calendar_draw_grid
 *   - Nonce: rotates per page load — fetched fresh each sync
 *   - Events have Unix timestamps (data-event-start) for reliable date parsing
 *
 * If it breaks:
 *   1. Go to jss.surf/events-2, open DevTools console
 *   2. Run: console.log(JSON.stringify(window.simcal_default_calendar))
 *   3. Check nonce value and update CALENDAR_ID if needed
 */

const PAGE_URL = 'https://www.jss.surf/events-2/';
const AJAX_URL = 'https://www.jss.surf/wp-admin/admin-ajax.php';
const CALENDAR_ID = '966';
const VENUE = "Joe's Surf Shack";
const VENUE_URL = PAGE_URL;

/**
 * Fetch the page HTML to extract a fresh nonce.
 * The nonce is required for the AJAX call and rotates each page load.
 */
async function fetchNonce() {
  const res = await fetch(PAGE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching page for nonce`);

  const html = await res.text();

  // Nonce is in: simcal_default_calendar = {"nonce":"XXXXXXXX",...}
  const match = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/);
  if (!match) throw new Error('Could not find simcal nonce in page HTML');

  return match[1];
}

/**
 * Fetch the calendar grid HTML for a given month/year via AJAX.
 */
async function fetchCalendarMonth(month, year, nonce) {
  const body = new URLSearchParams({
    action: 'simcal_default_calendar_draw_grid',
    month: String(month),
    year: String(year),
    id: CALENDAR_ID,
    nonce,
  });

  const res = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': PAGE_URL,
      'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} from simcal AJAX`);

  const json = await res.json();
  if (!json.success) throw new Error('simcal AJAX returned success:false');

  return json.data; // HTML string
}

/**
 * Parse event HTML from simcal calendar grid.
 * Extracts title, Unix timestamp, and event URL.
 */
function parseEvents(html) {
  const events = [];
  const seen = new Set();

  // Match each simcal-event block
  const blockRegex = /<li[^>]+class="[^"]*simcal-event[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let block;

  while ((block = blockRegex.exec(html)) !== null) {
    const content = block[1];

    // Title
    const titleMatch = content.match(/class="simcal-event-title"[^>]*>([^<]+)<\/span>/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();

    // Unix timestamp (seconds)
    const startMatch = content.match(/data-event-start="(\d+)"/);
    if (!startMatch) continue;
    const unixSeconds = parseInt(startMatch[1]);

    // Deduplicate by title + timestamp
    const key = `${title}-${unixSeconds}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Convert Unix timestamp to ISO date string in Eastern time
    const eventDate = new Date(unixSeconds * 1000);

    // Skip past events
    if (eventDate < new Date()) continue;

    // Event URL (schema.org itemid)
    const urlMatch = content.match(/itemid="([^"]+)"/);
    const ticketUrl = urlMatch ? urlMatch[1] : VENUE_URL;

    // Detect genre from title keywords
    let genre = 'Music';
    const lower = title.toLowerCase();
    if (lower.includes('happy hour')) genre = 'Happy Hour';
    else if (lower.includes('special') || lower.includes('$') || lower.includes('mil')) genre = 'Specials';
    else if (lower.includes('dj') || lower.includes('DJ')) genre = 'DJ';

    events.push({
      title,
      venue: VENUE,
      date: eventDate.toISOString().split('T')[0],
      time: eventDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      }),
      description: null,
      ticket_url: ticketUrl,
      price: null,
      source_url: VENUE_URL,
      external_id: `joessurfshack-${unixSeconds}`,
      genre,
    });
  }

  return events;
}

export async function scrapeJoesSurfShack() {
  const allEvents = [];
  let error = null;

  try {
    // Fetch fresh nonce from the page
    const nonce = await fetchNonce();

    // Fetch current month and next month to get a good window of events
    const now = new Date();
    const months = [
      { month: now.getMonth() + 1, year: now.getFullYear() },
      { month: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2, year: now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear() },
    ];

    for (const { month, year } of months) {
      const html = await fetchCalendarMonth(month, year, nonce);
      const events = parseEvents(html);
      allEvents.push(...events);
    }

    // Deduplicate across months
    const seen = new Set();
    const dedupedEvents = allEvents.filter(ev => {
      if (seen.has(ev.external_id)) return false;
      seen.add(ev.external_id);
      return true;
    });

    console.log(`[JoesSurfShack] Found ${dedupedEvents.length} upcoming events`);
    return { events: dedupedEvents, error: null };

  } catch (err) {
    error = err.message;
    console.error('[JoesSurfShack] Scraper error:', err.message);
    return { events: [], error };
  }
}