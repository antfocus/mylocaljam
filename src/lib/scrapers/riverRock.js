/**
 * River Rock Restaurant & Marina Bar Scraper
 * URL: https://riverrockbricknj.com/events/
 *
 * WordPress + Elementor + EventPrime calendar plugin.
 * Calendar data loads via AJAX POST to admin-ajax.php with action
 * `ep_get_calendar_event`. No nonce required (unlike Brielle House).
 *
 * Required params: action, month, year, start (YYYY-MM-DD), end (YYYY-MM-DD)
 * Returns JSON: { success: true, data: [ { title, id, event_start_date, start_time, event_type, url, image, ... } ] }
 *
 * event_type values:
 *   "31" = Music/Entertainment (live bands, DJs, karaoke)
 *   "32" = Specials (happy hour, trivia, BOGO, family night)
 *   "34" = Themed nights (80s power hour, country night)
 *
 * No type filter — we take ALL events from the calendar.
 * Fetches current month + next 2 months to capture upcoming events.
 * Then fetches each detail page in parallel batches to get descriptions.
 *
 * If it breaks:
 *   1. Go to riverrockbricknj.com/events/
 *   2. Check if the AJAX action name or params have changed (inspect network tab)
 *   3. Check if nonce is now required (look for em_front_event_object._nonce usage)
 */

const AJAX_URL = 'https://riverrockbricknj.com/wp-admin/admin-ajax.php';
const VENUE = 'River Rock';
const EVENTS_URL = 'https://riverrockbricknj.com/events/';
const DETAIL_BATCH_SIZE = 5;

/**
 * Normalize time from "05:00 PM" → "5:00 PM"
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  return `${parseInt(m[1])}:${m[2]} ${m[3].toUpperCase()}`;
}

/**
 * Fetch one month of events from the EventPrime AJAX endpoint
 */
async function fetchMonth(year, month) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${lastDay}`;

  const body = new URLSearchParams({
    action: 'ep_get_calendar_event',
    month: String(month),
    year: String(year),
    start,
    end,
  });

  const res = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
    },
    body: body.toString(),
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching River Rock month ${year}-${mm}`);

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];
  return json.data;
}

/**
 * Fetch a detail page and extract the description from
 * the #ep_single_event_description element.
 * Returns empty string on failure (non-blocking).
 */
async function fetchDescription(eventId) {
  try {
    const res = await fetch(`${EVENTS_URL}?event=${eventId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match = html.match(/id="ep_single_event_description"[^>]*>([\s\S]*?)<\/div>/i);
    if (!match) return '';
    return match[1].replace(/<[^>]+>/g, '').trim();
  } catch {
    return '';
  }
}

/**
 * Fetch descriptions for a list of events in parallel batches.
 * Returns a Map of eventId → description.
 */
async function fetchDescriptions(eventIds) {
  const descMap = new Map();
  for (let i = 0; i < eventIds.length; i += DETAIL_BATCH_SIZE) {
    const batch = eventIds.slice(i, i + DETAIL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (id) => ({ id, desc: await fetchDescription(id) }))
    );
    for (const { id, desc } of results) {
      descMap.set(id, desc);
    }
  }
  return descMap;
}

export async function scrapeRiverRock() {
  try {
    const now = new Date();
    const todayET = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Fetch current month + next 2 months
    const months = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const allData = await Promise.all(
      months.map(({ year, month }) => fetchMonth(year, month))
    );

    // Collect future events from AJAX data
    const rawEvents = [];
    const seen = new Set();

    for (const monthEvents of allData) {
      for (const ev of monthEvents) {
        const date = ev.event_start_date; // YYYY-MM-DD
        if (!date || date < todayET) continue;

        const title = ev.title?.trim();
        if (!title) continue;

        const externalId = `riverrock-${ev.id}-${date}`;
        if (seen.has(externalId)) continue;
        seen.add(externalId);

        rawEvents.push({
          ...ev,
          _date: date,
          _externalId: externalId,
        });
      }
    }

    // Fetch detail pages for descriptions (batches of 5)
    const uniqueIds = [...new Set(rawEvents.map(e => e.id))];
    console.log(`[RiverRock] Fetching descriptions for ${uniqueIds.length} unique events...`);
    const descMap = await fetchDescriptions(uniqueIds);

    // Build final event objects
    const events = rawEvents.map(ev => ({
      title: ev.title?.trim(),
      venue: VENUE,
      date: ev._date,
      time: normalizeTime(ev.start_time),
      description: descMap.get(ev.id) || null,
      ticket_url: ev.url || EVENTS_URL,
      price: null,
      source_url: EVENTS_URL,
      image_url: ev.image || null,
      external_id: ev._externalId,
    }));

    console.log(`[RiverRock] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[RiverRock] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
