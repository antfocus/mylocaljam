/**
 * Boatyard 401 Scraper
 * URL: https://boatyard401.com/events/
 *
 * WordPress site with Simple Calendar plugin (simcal) wrapping a Google Calendar.
 * Events are rendered as HTML in the calendar grid with tooltip details.
 *
 * Approach:
 *   1. Fetch the /events/ page to get current month's events + AJAX nonce
 *   2. Use AJAX endpoint (admin-ajax.php) to load next 2 months
 *   3. Parse simcal HTML: .simcal-event elements contain title, start date,
 *      start time, end time, and description in tooltip content
 *
 * If it breaks:
 *   1. Go to boatyard401.com/events/ and check if the calendar still renders
 *   2. View source → search for "simcal_default_calendar" for AJAX config
 *   3. The AJAX action is "simcal_default_calendar_draw_grid"
 *   4. Calendar ID is 66 (from data-calendar-id attribute)
 */

const VENUE = 'Boatyard 401';
const EVENTS_URL = 'https://boatyard401.com/events/';
const AJAX_URL = 'https://boatyard401.com/wp-admin/admin-ajax.php';
const CALENDAR_ID = '66';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * Parse date string like "March 7, 2026" → "2026-03-07"
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize time: "10:00 pm" → "10:00 PM"
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  return `${parseInt(m[1])}:${m[2]} ${m[3].toUpperCase()}`;
}

/**
 * Extract events from simcal HTML (works for both initial page and AJAX responses).
 * Parses the tooltip content within each .simcal-event element.
 */
function parseSimcalEvents(html) {
  const events = [];

  // Match each simcal-event block with its tooltip content
  // The tooltip structure contains: title, start-date, start-time, end-date, end-time, description
  const eventRegex =
    /class="simcal-event[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/g;

  // Alternative: match the tooltip-content div which has all the details
  const tooltipRegex =
    /class="simcal-event-details simcal-tooltip-content"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div)/g;

  let match;
  while ((match = tooltipRegex.exec(html)) !== null) {
    const block = match[1];

    const titleMatch = block.match(
      /class="simcal-event-title"[^>]*>([^<]+)</
    );
    const startDateMatch = block.match(
      /class="simcal-event-start simcal-event-start-date"[^>]*>([^<]+)</
    );
    const startTimeMatch = block.match(
      /class="simcal-event-start simcal-event-start-time"[^>]*>([^<]+)</
    );
    const descMatch = block.match(
      /class="simcal-event-description"[^>]*>([\s\S]*?)<\/span>/
    );

    const title = titleMatch?.[1]?.trim();
    const startDate = startDateMatch?.[1]?.trim();
    const startTime = startTimeMatch?.[1]?.trim();
    const description = descMatch?.[1]
      ?.replace(/<[^>]+>/g, '')
      ?.trim() || null;

    if (title && startDate) {
      events.push({ title, startDate, startTime, description });
    }
  }

  return events;
}

/**
 * Fetch the events page HTML and extract nonce + current month events.
 */
async function fetchPageAndNonce() {
  const res = await fetch(EVENTS_URL, {
    headers: FETCH_HEADERS,
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTML fetch HTTP ${res.status}`);

  const html = await res.text();
  console.log(`[Boatyard401] HTML page fetched, ${html.length} bytes`);

  // Extract nonce from simcal_default_calendar JS variable
  const nonceMatch = html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/);
  const nonce = nonceMatch?.[1] || null;
  console.log(`[Boatyard401] Nonce: ${nonce ? 'found' : 'NOT FOUND'}`);

  const events = parseSimcalEvents(html);
  console.log(`[Boatyard401] Current month: ${events.length} events`);

  return { events, nonce, html };
}

/**
 * Fetch a specific month's events via AJAX.
 */
async function fetchMonth(year, month, nonce) {
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
      ...FETCH_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: EVENTS_URL,
    },
    body: body.toString(),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    console.log(`[Boatyard401] AJAX ${year}-${month} HTTP ${res.status}`);
    return [];
  }

  const json = await res.json();
  if (!json.success || !json.data) {
    console.log(`[Boatyard401] AJAX ${year}-${month} failed: ${JSON.stringify(json).substring(0, 100)}`);
    return [];
  }

  const events = parseSimcalEvents(json.data);
  console.log(`[Boatyard401] AJAX ${year}-${month}: ${events.length} events`);
  return events;
}

export async function scrapeBoatyard401() {
  try {
    const now = new Date();
    const todayET = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Step 1: Fetch initial page for current month events + nonce
    const { events: currentEvents, nonce } = await fetchPageAndNonce();

    let allRawEvents = [...currentEvents];

    // Step 2: Fetch next 2 months via AJAX (if we have a nonce)
    if (nonce) {
      const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      for (let i = 1; i <= 2; i++) {
        const futureDate = new Date(nowET.getFullYear(), nowET.getMonth() + i, 1);
        const year = futureDate.getFullYear();
        const month = futureDate.getMonth() + 1;
        const monthEvents = await fetchMonth(year, month, nonce);
        allRawEvents.push(...monthEvents);
      }
    }

    console.log(`[Boatyard401] Total raw events: ${allRawEvents.length}`);

    // Step 3: Map to standard format
    const events = [];
    const seen = new Set();

    for (const ev of allRawEvents) {
      const date = parseDate(ev.startDate);
      if (!date || date < todayET) continue;

      const title = ev.title.trim();
      if (!title) continue;

      // Generate external ID
      const titleSlug = title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 30);
      const externalId = `boatyard401-${date}-${titleSlug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      const time = normalizeTime(ev.startTime);

      events.push({
        title,
        venue: VENUE,
        date,
        time,
        description: ev.description || null,
        ticket_url: EVENTS_URL,
        price: null,
        source_url: EVENTS_URL,
        image_url: null,
        external_id: externalId,
      });
    }

    console.log(`[Boatyard401] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[Boatyard401] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
