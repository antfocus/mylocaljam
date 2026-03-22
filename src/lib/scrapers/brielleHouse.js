/**
 * Brielle House scraper
 * Events page: https://brielle-house.com/specials-events/
 *
 * WordPress site using EventPrime calendar plugin.
 * Events are loaded via admin-ajax.php with action "ep_get_calendar_event".
 * Requires session cookies + nonce from em_front_event_object.
 *
 * If it breaks:
 *   1. Go to https://brielle-house.com/specials-events/
 *   2. View page source → search for em_front_event_object
 *   3. Check the nonce value and ajaxurl
 */

const EVENTS_PAGE = 'https://brielle-house.com/specials-events/';
const AJAX_URL = 'https://brielle-house.com/wp-admin/admin-ajax.php';
const VENUE = 'Brielle House';
const VENUE_URL = 'https://brielle-house.com/specials-events/';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function scrapeBrielleHouse() {
  try {
    // Step 1: Fetch the events page to get cookies + nonce together
    const pageRes = await fetch(EVENTS_PAGE, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      next: { revalidate: 0 },
    });

    if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status} fetching events page (likely IP block from hosting provider)`);

    // Capture ALL cookies from the response using multiple methods
    let cookies = '';

    // Method 1: getSetCookie (newer Node.js)
    if (typeof pageRes.headers.getSetCookie === 'function') {
      cookies = pageRes.headers.getSetCookie()
        .map(c => c.split(';')[0])
        .join('; ');
    }

    // Method 2: get('set-cookie') fallback
    if (!cookies) {
      const raw = pageRes.headers.get('set-cookie');
      if (raw) {
        cookies = raw.split(/,(?=\s*\w+=)/)
          .map(c => c.split(';')[0].trim())
          .join('; ');
      }
    }

    const html = await pageRes.text();

    // Extract nonce from em_front_event_object — key was renamed from "nonce" to "_nonce" in plugin update
    const nonceMatch = html.match(/em_front_event_object\s*=\s*\{[^}]*?"_nonce"\s*:\s*"([a-f0-9]+)"/)
                     || html.match(/em_front_event_object\s*=\s*\{[^}]*?"nonce"\s*:\s*"([a-f0-9]+)"/);
    if (!nonceMatch) throw new Error('Could not extract nonce (_nonce or nonce) from em_front_event_object');
    const nonce = nonceMatch[1];

    // Step 2: Make the AJAX request with cookies + nonce
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const end = new Date(now);
    end.setMonth(end.getMonth() + 3);
    const endStr = end.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const body = new URLSearchParams();
    body.append('action', 'ep_get_calendar_event');
    body.append('security', nonce);
    body.append('start', `${todayStr}T00:00:00-04:00`);
    body.append('end', `${endStr}T00:00:00-04:00`);
    body.append('args[]', '');
    body.append('search_param', '');

    const ajaxHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': EVENTS_PAGE,
      'Origin': 'https://brielle-house.com',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
    };
    if (cookies) ajaxHeaders['Cookie'] = cookies;

    const res = await fetch(AJAX_URL, {
      method: 'POST',
      headers: ajaxHeaders,
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from admin-ajax`);

    const rawText = await res.text();

    // Handle WordPress returning "0" for invalid nonce
    if (rawText === '0' || rawText === '-1') {
      throw new Error('WordPress returned 0 — nonce or action invalid');
    }

    // Handle WordPress critical error (PHP crash on their server)
    if (rawText.includes('critical error on this website')) {
      throw new Error('WordPress critical error — EventPrime plugin is broken on their server (not our bug)');
    }

    let raw;
    try {
      raw = JSON.parse(rawText);
    } catch {
      throw new Error(`Non-JSON response: ${rawText.slice(0, 200)}`);
    }

    // Handle different response shapes
    let data;
    if (Array.isArray(raw)) {
      data = raw;
    } else if (raw && raw.success === false) {
      throw new Error(`WP error: ${JSON.stringify(raw.data).slice(0, 200)}`);
    } else if (raw && Array.isArray(raw.data)) {
      data = raw.data;
    } else if (raw && typeof raw === 'object') {
      const arrayProp = Object.values(raw).find(v => Array.isArray(v));
      if (arrayProp) data = arrayProp;
      else throw new Error(`Unexpected shape: ${JSON.stringify(raw).slice(0, 300)}`);
    } else {
      throw new Error(`Unexpected response: ${rawText.slice(0, 200)}`);
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

      const eventUrl = (item.event_url || item.url || VENUE_URL).replace(/\\\//g, '/');

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
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: item.featured_image || item.event_image || item.image || null,
      });
    }

    console.log(`[BrielleHouse] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BrielleHouse] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
