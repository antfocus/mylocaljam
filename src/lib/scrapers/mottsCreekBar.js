/**
 * Mott's Creek Bar (Galloway, NJ) scraper
 * Site: https://www.mottscreekbar.com/events
 *
 * Squarespace site — uses the built-in JSON API (?format=json) on the
 * /events collection. Same pattern as marinaGrille.js, anchorTavern.js,
 * rBar.js, etc. Squarespace returns a JSON envelope with the upcoming
 * events under `upcoming[]` (older sites used `items[]` — we read both).
 *
 * Endpoint:
 *   /events?format=json  →  { upcoming: [...], past: [...], items: [...],
 *                            collection: {...}, pagination: {...} }
 *
 * Per-event shape (the bits we use):
 *   { id, title, urlId, fullUrl, assetUrl,
 *     startDate (epoch ms), endDate, excerpt, body, location, ... }
 *
 * Notes:
 *   - Times come in as epoch ms. Squarespace renders them venue-local on
 *     the page; we format with America/New_York to be safe.
 *   - The per-event location block on this site has NYC coordinates
 *     (40.72,-74.00) — we ignore it. The venue's actual address comes from
 *     /contact: "Motts Creek Inn, Galloway, NJ 08205" (lat 39.5182,-74.4363,
 *     i.e. 110 Mott's Creek Rd, Galloway).
 *   - Fast-tier scraper — single fetch, ~50ms.
 *
 * If it breaks:
 *   1. Open https://www.mottscreekbar.com/events?format=json in a browser.
 *   2. Confirm the response is JSON (not HTML) and has `upcoming` / `items`.
 *   3. If Squarespace renames the collection (e.g. /calendar instead of
 *      /events), update COLLECTION below.
 */

const BASE_URL = 'https://www.mottscreekbar.com';
const COLLECTION = 'events';
const VENUE = "Mott's Creek Bar";
const VENUE_URL = 'https://www.mottscreekbar.com/events';

export async function scrapeMottsCreekBar() {
  try {
    const url = `${BASE_URL}/${COLLECTION}?format=json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Squarespace JSON`);

    const data = await res.json();

    // Squarespace event collections expose upcoming events under one of
    // two keys depending on the site's age / template. We union both, then
    // dedupe below by external_id.
    const candidates = [
      ...(Array.isArray(data?.upcoming) ? data.upcoming : []),
      ...(Array.isArray(data?.items) ? data.items : []),
    ];

    if (candidates.length === 0 && !Array.isArray(data?.upcoming) && !Array.isArray(data?.items)) {
      throw new Error('Unexpected JSON shape — no upcoming[] or items[] array');
    }

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    for (const item of candidates) {
      const title = (item.title || '').trim();
      if (!title) continue;

      const startMs = item.startDate;
      if (!startMs || typeof startMs !== 'number') continue;

      const startDate = new Date(startMs);
      if (isNaN(startDate.getTime())) continue;

      const eventDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) continue;

      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      const slug = item.urlId || '';
      const fullUrl = item.fullUrl || (slug ? `/${COLLECTION}/${slug}` : '');
      const eventUrl = fullUrl
        ? (fullUrl.startsWith('http') ? fullUrl : `${BASE_URL}${fullUrl}`)
        : VENUE_URL;

      const itemId = item.id || slug || `${title}-${eventDateStr}`;
      const idClean = String(itemId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `mottscreekbar-${eventDateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      // Excerpt → strip any stray HTML, trim, cap. Body is sometimes a
      // structured-content array; we leave it null if excerpt is empty
      // rather than trying to flatten the rich-text tree.
      let description = null;
      if (typeof item.excerpt === 'string' && item.excerpt.trim()) {
        description = item.excerpt.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
      }

      events.push({
        title,
        venue: VENUE,
        date: eventDateStr,
        time: timeStr,
        description,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: typeof item.assetUrl === 'string' ? item.assetUrl : null,
      });
    }

    console.log(`[MottsCreekBar] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[MottsCreekBar] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
