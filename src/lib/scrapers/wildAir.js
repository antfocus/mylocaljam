/**
 * Wild Air Beerworks Scraper
 * URL: https://www.wildairbeer.com/upcoming-events
 *
 * Square Online platform. Events are stored as "products" with product_type=event.
 * The page loads event cards via the Square Online Store API:
 *   cdn5.editmysite.com/app/store/api/v28/editor/users/{userId}/sites/{siteId}/products
 *
 * The page HTML contains a featuredEventIds array in the bootstrap JSON, but we
 * can also just query all visible events and filter by date.
 *
 * API returns rich data: name, start_date, start_time, end_time, short_description,
 * images, price, address, and site_link.
 *
 * No auth required — public API.
 *
 * If it breaks:
 *   1. Go to wildairbeer.com/upcoming-events
 *   2. Check network tab for the editmysite.com API call
 *   3. Verify the userId (131268749) and siteId (275806222903239352) haven't changed
 *   4. These IDs can also be found in window.__BOOTSTRAP_STATE__.siteData
 */

const USER_ID = '131268749';
const SITE_ID = '275806222903239352';
const API_BASE = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${USER_ID}/sites/${SITE_ID}/products`;
const VENUE = 'Wild Air Beerworks';
const EVENTS_URL = 'https://www.wildairbeer.com/upcoming-events';
const BASE_URL = 'https://www.wildairbeer.com';

/**
 * Normalize time from "6:00 PM" → "6:00 PM" (already clean from API)
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  return `${parseInt(m[1])}:${m[2]} ${m[3].toUpperCase()}`;
}

/**
 * Strip HTML tags from description
 */
function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

/**
 * Fetch events from Square Online Store API.
 * Paginates if needed (50 per page).
 */
async function fetchEvents() {
  const allEvents = [];
  let page = 1;
  const maxPages = 3; // Safety limit

  while (page <= maxPages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: '50',
      'visibilities[]': 'visible',
      product_type: 'event',
      include: 'images,media_files',
    });

    const res = await fetch(`${API_BASE}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Wild Air events page ${page}`);

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) break;

    allEvents.push(...json.data);

    const totalPages = json.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allEvents;
}

export async function scrapeWildAir() {
  try {
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const rawEvents = await fetchEvents();

    const events = [];
    const seen = new Set();

    for (const ev of rawEvents) {
      const details = ev.product_type_details || {};
      const date = details.start_date; // YYYY-MM-DD
      if (!date || date < todayET) continue;

      const name = ev.name?.trim();
      if (!name) continue;

      const externalId = `wildair-${ev.id}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      const time = normalizeTime(details.start_time);
      const description = stripHtml(ev.short_description);

      // Price from description (often listed there, e.g. "$10")
      // The API price is sometimes $0 for door-pay events
      const priceMatch = (ev.short_description || '').match(/\$\d+/);
      const price = priceMatch ? priceMatch[0] : null;

      // Image URL
      const imageUrl = ev.images?.data?.[0]?.absolute_url || null;

      // Event detail page link
      const siteLink = ev.site_link ? `${BASE_URL}/${ev.site_link}` : EVENTS_URL;

      events.push({
        title: name,
        venue: VENUE,
        date,
        time,
        description,
        ticket_url: siteLink,
        price,
        source_url: EVENTS_URL,
        image_url: imageUrl,
        external_id: externalId,
      });
    }

    console.log(`[WildAir] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[WildAir] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
