/**
 * Brielle House scraper
 * Events page: https://brielle-house.com/specials-events/
 *
 * WordPress site using the EventON (or similar) calendar plugin.
 * Events are loaded via admin-ajax.php with the action "ep_get_calendar_event".
 * A security nonce is required — we extract it from the page HTML first.
 *
 * If it breaks:
 *   1. Go to https://brielle-house.com/specials-events/
 *   2. Open DevTools → Network → click forward arrow on calendar
 *   3. Check the admin-ajax.php Payload for action name and security nonce
 *   4. Check the page source for the nonce variable name
 */

const EVENTS_PAGE = 'https://brielle-house.com/specials-events/';
const AJAX_URL = 'https://brielle-house.com/wp-admin/admin-ajax.php';
const VENUE = 'Brielle House';
const VENUE_URL = 'https://brielle-house.com/specials-events/';

/**
 * Fetch the events page and extract the security nonce from the HTML.
 * The nonce is typically embedded in a script tag as part of calendar config.
 */
async function extractNonce() {
  const res = await fetch(EVENTS_PAGE, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching events page`);

  const html = await res.text();

  // Look for nonce in various patterns used by WordPress calendar plugins
  // Pattern 1: "security":"abc123" or "nonce":"abc123"
  const nonceMatch = html.match(/"(?:security|nonce|ajax_nonce|ep_nonce)":\s*"([a-f0-9]+)"/i);
  if (nonceMatch) return nonceMatch[1];

  // Pattern 2: security = 'abc123'
  const nonceMatch2 = html.match(/security\s*[=:]\s*['"]([a-f0-9]+)['"]/i);
  if (nonceMatch2) return nonceMatch2[1];

  // Pattern 3: wp_create_nonce output in script
  const nonceMatch3 = html.match(/["']([a-f0-9]{8,12})["']\s*,?\s*\/?\/?.*?(?:nonce|security)/i);
  if (nonceMatch3) return nonceMatch3[1];

  throw new Error('Could not extract security nonce from page');
}

export async function scrapeBrielleHouse() {
  try {
    const nonce = await extractNonce();

    // Build date range: today to 3 months from now
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now);
    end.setMonth(end.getMonth() + 3);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const startISO = `${todayStr}T00:00:00-04:00`;
    const endISO = `${endStr}T00:00:00-04:00`;

    const body = new URLSearchParams({
      action: 'ep_get_calendar_event',
      security: nonce,
      start: startISO,
      end: endISO,
      'args[]': '',
      search_param: '',
    });

    const res = await fetch(AJAX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': EVENTS_PAGE,
      },
      next: { revalidate: 0 },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from admin-ajax`);

    const raw = await res.json();

    // Handle different WordPress response shapes:
    // Could be: array, { success: true, data: [...] }, { data: [...] }, or 0 (bad nonce)
    let data;
    if (Array.isArray(raw)) {
      data = raw;
    } else if (raw && Array.isArray(raw.data)) {
      data = raw.data;
    } else if (raw && typeof raw === 'object') {
      // Try to find any array property in the response
      const arrayProp = Object.values(raw).find(v => Array.isArray(v));
      if (arrayProp) {
        data = arrayProp;
      } else {
        throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 200)}`);
      }
    } else {
      throw new Error(`Unexpected response (nonce may be invalid): ${JSON.stringify(raw).slice(0, 200)}`);
    }

    const events = [];
    const seen = new Set();

    for (const item of data) {
      const title = item.event_title || item.title || '';
      if (!title) continue;

      // Parse date from event_start_date (YYYY-MM-DD) or start (ISO string)
      const dateStr = item.event_start_date || (item.start ? item.start.substring(0, 10) : null);
      if (!dateStr) continue;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Parse time from start_time or display_start_time
      const timeStr = item.display_start_time || item.start_time || '';

      // Event URL
      const eventUrl = item.event_url || item.url || VENUE_URL;
      // Clean escaped slashes
      const cleanUrl = eventUrl.replace(/\\\//g, '/');

      // External ID from event_id or title+date
      const eventId = item.event_id || item.id || `${title}-${dateStr}`;
      const idClean = String(eventId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `briellehouse-${dateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: title.trim(),
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: null,
        ticket_url: cleanUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
      });
    }

    console.log(`[BrielleHouse] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BrielleHouse] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
