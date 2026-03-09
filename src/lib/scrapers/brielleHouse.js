/**
 * Brielle House scraper
 * Events page: https://brielle-house.com/specials-events/
 *
 * WordPress site using the EventON (or similar) calendar plugin.
 * Events are loaded via admin-ajax.php with the action "ep_get_calendar_event".
 * A security nonce + session cookies are required.
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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function scrapeBrielleHouse() {
  try {
    // Step 1: Fetch the events page to get cookies + nonce
    const pageRes = await fetch(EVENTS_PAGE, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      next: { revalidate: 0 },
    });

    if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status} fetching events page`);

    // Capture cookies from the response
    const setCookieHeaders = pageRes.headers.getSetCookie?.() || [];
    const cookies = setCookieHeaders
      .map(c => c.split(';')[0]) // grab just "name=value" part
      .join('; ');

    const html = await pageRes.text();

    // Extract nonce from HTML
    let nonce = null;

    // Pattern 1: "security":"abc123" or "nonce":"abc123"
    const m1 = html.match(/"(?:security|nonce|ajax_nonce|ep_nonce)":\s*"([a-f0-9]+)"/i);
    if (m1) nonce = m1[1];

    // Pattern 2: security = 'abc123'
    if (!nonce) {
      const m2 = html.match(/security\s*[=:]\s*['"]([a-f0-9]+)['"]/i);
      if (m2) nonce = m2[1];
    }

    // Pattern 3: ep_event_obj or similar calendar config object
    if (!nonce) {
      const m3 = html.match(/ep_event_obj\s*=\s*\{[^}]*?"nonce"\s*:\s*"([a-f0-9]+)"/i);
      if (m3) nonce = m3[1];
    }

    // Pattern 4: broader search for hex nonce near calendar-related keywords
    if (!nonce) {
      const m4 = html.match(/(?:calendar|event|ep_)[\s\S]{0,200}?["']([a-f0-9]{8,12})["']/i);
      if (m4) nonce = m4[1];
    }

    if (!nonce) throw new Error('Could not extract security nonce from page');

    // Step 2: Make the AJAX request with cookies + nonce
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

    const ajaxHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': EVENTS_PAGE,
    };
    if (cookies) ajaxHeaders['Cookie'] = cookies;

    const res = await fetch(AJAX_URL, {
      method: 'POST',
      headers: ajaxHeaders,
      next: { revalidate: 0 },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from admin-ajax`);

    const raw = await res.json();

    // Handle different WordPress response shapes
    let data;
    if (Array.isArray(raw)) {
      data = raw;
    } else if (raw && Array.isArray(raw.data)) {
      data = raw.data;
    } else if (raw && typeof raw === 'object') {
      const arrayProp = Object.values(raw).find(v => Array.isArray(v));
      if (arrayProp) {
        data = arrayProp;
      } else {
        throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 300)}`);
      }
    } else {
      throw new Error(`Unexpected response (nonce may be invalid): ${JSON.stringify(raw).slice(0, 300)}`);
    }

    const events = [];
    const seen = new Set();

    for (const item of data) {
      const title = item.event_title || item.title || '';
      if (!title) continue;

      const dateStr = item.event_start_date || (item.start ? item.start.substring(0, 10) : null);
      if (!dateStr) continue;

      if (dateStr < todayStr) continue;

      const timeStr = item.display_start_time || item.start_time || '';

      const eventUrl = item.event_url || item.url || VENUE_URL;
      const cleanUrl = eventUrl.replace(/\\\//g, '/');

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
