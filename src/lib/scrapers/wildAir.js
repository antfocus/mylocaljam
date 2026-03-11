/**
 * Wild Air Beerworks Scraper
 * URL: https://www.wildairbeer.com/upcoming-events
 *
 * Square Online platform. Events are stored as "products" with product_type=event.
 *
 * How it works:
 *   1. Fetch the HTML page at wildairbeer.com/upcoming-events
 *   2. Extract featuredEventIds from the inline __BOOTSTRAP_STATE__ object
 *      (these are the event IDs the page is configured to display)
 *   3. Fetch each event's details by ID from the Square Online Store API
 *      (individual product endpoint: /products/{id})
 *
 * NOTE: The Store API's product_type=event query param does NOT actually filter —
 * it returns ALL product types (food, physical, event). That's why we use the
 * featuredEventIds approach instead of paginating through all products.
 *
 * If it breaks:
 *   1. Go to wildairbeer.com/upcoming-events → View Source
 *   2. Search for "featuredEventIds" — it's in __BOOTSTRAP_STATE__
 *   3. Verify the userId (131268749) and siteId haven't changed
 *      (look for classicSiteID in __BOOTSTRAP_STATE__.siteData)
 */

const VENUE = 'Wild Air Beerworks';
const EVENTS_URL = 'https://www.wildairbeer.com/upcoming-events';
const BASE_URL = 'https://www.wildairbeer.com';

const USER_ID = '131268749';
const SITE_ID = '275806222903239352';
const PRODUCT_API = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${USER_ID}/sites/${SITE_ID}/products`;

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const BATCH_SIZE = 5; // Parallel fetches at a time

/**
 * Normalize time from "6:00 PM" → "6:00 PM"
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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

/**
 * Step 1: Fetch the HTML page and extract featuredEventIds from __BOOTSTRAP_STATE__.
 */
async function fetchEventIds() {
  const res = await fetch(EVENTS_URL, {
    headers: FETCH_HEADERS,
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTML fetch HTTP ${res.status}`);

  const html = await res.text();
  console.log(`[WildAir] HTML page fetched, ${html.length} bytes`);

  // Extract featuredEventIds array from the bootstrap state
  const idsMatch = html.match(/"featuredEventIds"\s*:\s*\[([^\]]+)\]/);
  if (!idsMatch) {
    console.log('[WildAir] No featuredEventIds found in HTML');
    return [];
  }

  // Parse the array of string IDs: ["1438","2003","1977",...]
  const ids = idsMatch[1]
    .match(/"([^"]+)"/g)
    ?.map((s) => s.replace(/"/g, '')) || [];

  console.log(`[WildAir] Found ${ids.length} featuredEventIds: ${ids.join(', ')}`);
  return ids;
}

/**
 * Step 2: Fetch a single event's details by product ID.
 */
async function fetchEventById(id) {
  try {
    const res = await fetch(`${PRODUCT_API}/${id}?include=images,media_files`, {
      headers: {
        ...FETCH_HEADERS,
        Accept: 'application/json',
        Referer: 'https://www.wildairbeer.com/',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.log(`[WildAir] Event ${id}: HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.log(`[WildAir] Event ${id} fetch error: ${err.message}`);
    return null;
  }
}

/**
 * Step 2b: Fetch all events in parallel batches.
 */
async function fetchAllEvents(ids) {
  const results = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fetchEventById));
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

export async function scrapeWildAir() {
  try {
    const todayET = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });

    // Step 1: Get event IDs from the HTML page
    const eventIds = await fetchEventIds();

    if (eventIds.length === 0) {
      console.log('[WildAir] No event IDs found, returning empty');
      return { events: [], error: null };
    }

    // Step 2: Fetch each event's details by ID
    const rawEvents = await fetchAllEvents(eventIds);
    console.log(`[WildAir] Fetched details for ${rawEvents.length}/${eventIds.length} events`);

    // Step 3: Map to our format
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

    console.log(`[WildAir] Found ${events.length} upcoming events (filtered from ${rawEvents.length} total)`);
    return { events, error: null };
  } catch (err) {
    console.error('[WildAir] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
