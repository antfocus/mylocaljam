/**
 * Jenks Club (Point Pleasant Beach) Scraper
 * URL: https://jenksclub.com/events-calendar-mobile/
 *
 * WordPress + Divi child theme "jenks" + Calendarize It! plugin.
 * Calendarize It exposes a public, no-nonce GET endpoint:
 *   /?rhc_action=get_calendar_events&post_type[]=events
 *      &start=<unix>&end=<unix>&view=rhc_event
 *
 * Response shape:
 *   { R: "OK", EVENTS: [ {id, local_id, title, start, end, url, image, terms, ...}, ... ], ... }
 *
 * Fields we use:
 *   local_id        — numeric WP post ID, used for external_id stability
 *   title           — event name
 *   start           — "YYYY-MM-DD HH:mm:ss" in venue local time (ET)
 *   end             — same shape; often midnight-of-start (no real end set)
 *   url             — detail page (/happenings/<slug>/)
 *   image[0]        — full-res poster URL
 *   terms[].name    — categories like "Performances"
 *
 * Description handling: detail pages are Divi-built poster shells with no
 * prose body — empty string in the AJAX `description` field, and the only
 * text on detail pages is title + date echoed in an et_pb_text module.
 * So we don't fetch detail pages; description stays null and downstream
 * AI categorization will key off the title.
 *
 * Time window: current day → +90 days (covers River Rock-style 3 months).
 *
 * If it breaks:
 *   1. Go to jenksclub.com/events-calendar-mobile/ in a browser
 *   2. Open DevTools → Network → reload, look for `rhc_action=get_calendar_events`
 *   3. Check if the param names changed (some Calendarize It versions
 *      require a `view` value other than `rhc_event`, or rename `start/end`)
 *   4. Confirm the response still has an EVENTS array of objects with
 *      `local_id`, `title`, `start`, `url`, `image`, `terms` keys.
 */

const VENUE = 'Jenks Club';
const PAGE_URL = 'https://jenksclub.com/events-calendar-mobile/';
const AJAX_BASE = 'https://jenksclub.com/';

/**
 * Convert "YYYY-MM-DD HH:mm:ss" (venue-local) → { date: 'YYYY-MM-DD', time: 'h:mm AM/PM' }
 */
function splitDateTime(dt) {
  if (!dt || typeof dt !== 'string') return { date: null, time: null };
  const m = dt.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return { date: dt.slice(0, 10) || null, time: null };
  const [, date, hhStr, mm] = m;
  const hh = parseInt(hhStr, 10);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { date, time: `${h12}:${mm} ${period}` };
}

/**
 * Decode common HTML entities that come back from WP REST/AJAX responses
 * (titles like "Suit &#038; Mai Tai" → "Suit & Mai Tai").
 */
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export async function scrapeJenksClub() {
  try {
    // 90-day window starting at the top of today (UTC seconds is fine — the
    // endpoint just needs a window that covers the events we care about).
    const now = Math.floor(Date.now() / 1000);
    const ninetyDays = 90 * 24 * 60 * 60;
    const start = now;
    const end = now + ninetyDays;

    const url =
      `${AJAX_BASE}?rhc_action=get_calendar_events` +
      `&post_type[]=events` +
      `&start=${start}` +
      `&end=${end}` +
      `&view=rhc_event`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': PAGE_URL,
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Jenks Club calendar`);

    const json = await res.json();
    if (json.R !== 'OK' || !Array.isArray(json.EVENTS)) {
      throw new Error(`Unexpected response shape (R=${json.R}, EVENTS=${typeof json.EVENTS})`);
    }

    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    const events = [];

    for (const ev of json.EVENTS) {
      const title = decodeEntities((ev.title || '').trim());
      if (!title) continue;

      const { date, time } = splitDateTime(ev.start);
      if (!date || date < todayET) continue;

      const externalId = `jenks-${ev.local_id}-${date}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      // image is [url, w, h, isPlaceholder]
      const imageUrl =
        Array.isArray(ev.image) && ev.image[3] === false ? ev.image[0] :
        Array.isArray(ev.image_full) && ev.image_full[3] === false ? ev.image_full[0] :
        null;

      events.push({
        title,
        venue: VENUE,
        date,
        time,
        description: null,                              // detail pages have no prose
        ticket_url: ev.url || PAGE_URL,
        price: null,
        source_url: PAGE_URL,
        image_url: imageUrl,
        external_id: externalId,
      });
    }

    console.log(`[JenksClub] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[JenksClub] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
