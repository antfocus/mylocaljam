/**
 * D'Jais (Belmar) Scraper
 * URL: https://djais.com/events/list/
 *
 * WordPress + The Events Calendar plugin (Modern Tribe). The plugin exposes
 * a clean public REST endpoint at /wp-json/tribe/events/v1/events — no
 * authentication, no nonce, no AJAX gymnastics. This is the canonical
 * "platform playbook" entry for any venue whose URL ends in /events/list/,
 * /events/day/<date>/, /events/month/, etc.
 *
 * Endpoint:
 *   /wp-json/tribe/events/v1/events?per_page=50&page=<N>
 *
 * Response shape (per Modern Tribe docs):
 *   {
 *     events: [ { id, url, title, description, excerpt, slug,
 *                 image: { url, sizes: {...} },
 *                 all_day, start_date, start_date_details: {year, month, day, hour, minutes},
 *                 end_date, timezone, cost, cost_details,
 *                 venue: { id, venue, ... }, organizer: [...] }, ... ],
 *     total, total_pages, next_rest_url, previous_rest_url, rest_url
 *   }
 *
 * Times: `start_date` is venue-local "YYYY-MM-DD HH:MM:SS" already in ET —
 * we split into date + 12h time directly, same pattern as Jenks Club.
 * Description: HTML from TinyMCE; strip tags, collapse whitespace, trim.
 * External ID: `djais-<wp-post-id>-<date>` (same day repeats are separate
 * Events Calendar post IDs, so the date suffix is belt-and-suspenders for
 * recurring events that share an ID).
 *
 * If it breaks:
 *   1. Hit https://djais.com/wp-json/tribe/events/v1/events?per_page=5 in a
 *      browser — confirm it returns JSON (not a 404 or WP REST disabled error).
 *   2. If the REST endpoint is gone (plugin update disabled it), fall back to
 *      HTML parsing of /events/list/ — events live in .tribe-events-calendar-list
 *      with .tribe-events-calendar-list__event-title, .tribe-events-calendar-list__event-datetime, etc.
 *   3. If pagination stops working, check `total_pages` vs `?page=N` param —
 *      Tribe uses 1-indexed pages.
 */

const VENUE = "D'Jais";
const PAGE_URL = 'https://djais.com/events/list/';
const API_BASE = 'https://djais.com/wp-json/tribe/events/v1/events';
const PER_PAGE = 50;
const MAX_PAGES = 6; // 300 events — well past anything D'Jais posts forward

/**
 * Convert "YYYY-MM-DD HH:mm:ss" (venue-local ET) → { date, time }
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

/** Decode common WP-REST HTML entities in titles/text. */
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Strip HTML from a TinyMCE description, collapse whitespace, decode entities,
 * and cap length. Returns null if nothing meaningful remains.
 */
function cleanDescription(html) {
  if (!html || typeof html !== 'string') return null;
  const text = decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\u00A0/g, ' ')    // nbsp
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text.length > 0 ? text.slice(0, 1000) : null;
}

export async function scrapeDjais() {
  try {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    const events = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${API_BASE}?per_page=${PER_PAGE}&page=${page}&start_date=${todayET}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
          'Accept': 'application/json',
        },
        next: { revalidate: 0 },
      });

      // Tribe returns 400 with { code: 'rest-no-results' } when we page past
      // the end — treat as "we're done" rather than an error.
      if (res.status === 400) break;
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching D'Jais events (page ${page})`);

      const json = await res.json();
      const batch = Array.isArray(json.events) ? json.events : [];
      if (batch.length === 0) break;

      for (const ev of batch) {
        const title = decodeEntities((ev.title || '').trim());
        if (!title) continue;

        // Prefer start_date_details when present — already split, ET-local.
        let date = null, time = null;
        if (ev.start_date_details && ev.start_date_details.year) {
          const d = ev.start_date_details;
          date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
          const hh = parseInt(d.hour, 10);
          const mm = String(d.minutes).padStart(2, '0');
          if (!isNaN(hh) && !ev.all_day) {
            const period = hh >= 12 ? 'PM' : 'AM';
            const h12 = hh % 12 === 0 ? 12 : hh % 12;
            time = `${h12}:${mm} ${period}`;
          }
        } else {
          const split = splitDateTime(ev.start_date);
          date = split.date;
          time = ev.all_day ? null : split.time;
        }

        if (!date || date < todayET) continue;

        const postId = ev.id ?? ev.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const externalId = `djais-${postId}-${date}`;
        if (seen.has(externalId)) continue;
        seen.add(externalId);

        events.push({
          title,
          venue: VENUE,
          date,
          time,
          description: cleanDescription(ev.description || ev.excerpt),
          ticket_url: ev.url || PAGE_URL,
          price: (ev.cost && typeof ev.cost === 'string' && ev.cost.trim()) ? ev.cost.trim() : null,
          source_url: PAGE_URL,
          image_url: ev.image && typeof ev.image === 'object' ? (ev.image.url || null) : (typeof ev.image === 'string' ? ev.image : null),
          external_id: externalId,
        });
      }

      // Stop early when we've pulled the last page.
      const totalPages = Number(json.total_pages) || 1;
      if (page >= totalPages) break;
    }

    console.log(`[Djais] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[Djais] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
