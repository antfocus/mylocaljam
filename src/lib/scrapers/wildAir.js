/**
 * Wild Air Beerworks Scraper
 * URL: https://www.wildairbeer.com/upcoming-events
 *
 * Square Online platform. Events are stored as "products" with product_type=event.
 *
 * PRIMARY approach: Fetch the HTML page and extract event data from the
 * embedded __BOOTSTRAP_STATE__ JSON (contains product/event data inline).
 *
 * FALLBACK: Square Online Store API at cdn5.editmysite.com (may be blocked
 * by some hosting providers' egress rules).
 *
 * If it breaks:
 *   1. Go to wildairbeer.com/upcoming-events
 *   2. View source → search for __BOOTSTRAP_STATE__
 *   3. The products/events are in the storeProducts or pageData sections
 *   4. If bootstrap approach fails, check network tab for the editmysite.com API call
 *   5. Verify the userId (131268749) and siteId (275806222903239352) haven't changed
 */

const VENUE = 'Wild Air Beerworks';
const EVENTS_URL = 'https://www.wildairbeer.com/upcoming-events';
const BASE_URL = 'https://www.wildairbeer.com';

// Fallback API constants
const USER_ID = '131268749';
const SITE_ID = '275806222903239352';
const API_BASE = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/${USER_ID}/sites/${SITE_ID}/products`;

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
 * PRIMARY: Fetch the HTML page and extract events from __BOOTSTRAP_STATE__ JSON.
 * Square Online embeds all product/event data in a large JSON blob in a <script> tag.
 */
async function fetchEventsFromPage() {
  const res = await fetch(EVENTS_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`HTML fetch HTTP ${res.status}`);

  const html = await res.text();
  console.log(`[WildAir] HTML page fetched, ${html.length} bytes`);

  // Strategy 1: Extract __BOOTSTRAP_STATE__ JSON
  const bootstrapMatch = html.match(
    /window\.__BOOTSTRAP_STATE__\s*=\s*JSON\.parse\(("[^"]+"|\\'[^']+\\'|'[^']+')\)/
  );

  if (bootstrapMatch) {
    console.log('[WildAir] Found __BOOTSTRAP_STATE__');
    // The value is a JSON-stringified string inside JSON.parse()
    // It's typically: JSON.parse("...escaped json...")
    let jsonStr = bootstrapMatch[1];
    // Remove outer quotes
    if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
      jsonStr = jsonStr.slice(1, -1);
    } else if (jsonStr.startsWith("'") && jsonStr.endsWith("'")) {
      jsonStr = jsonStr.slice(1, -1);
    }
    // Unescape: the string has escaped quotes, newlines, etc.
    jsonStr = jsonStr
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');

    try {
      const bootstrap = JSON.parse(jsonStr);
      // Navigate to products — they can be in multiple places
      const products =
        bootstrap?.storeState?.products?.data ||
        bootstrap?.storeState?.products ||
        [];

      if (Array.isArray(products) && products.length > 0) {
        console.log(`[WildAir] Bootstrap: found ${products.length} products`);
        return products.filter(
          (p) => p.product_type === 'event' || p.product_type_details?.start_date
        );
      }
    } catch (e) {
      console.log(`[WildAir] Bootstrap JSON parse error: ${e.message}`);
    }
  }

  // Strategy 2: Look for inline product JSON in other script patterns
  // Square Online sometimes uses different embedding patterns
  const productMatches = html.match(
    /"product_type"\s*:\s*"event"[^}]*"product_type_details"\s*:\s*\{[^}]*"start_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g
  );

  if (productMatches && productMatches.length > 0) {
    console.log(`[WildAir] Found ${productMatches.length} event product references in HTML`);
  }

  // Strategy 3: Parse event cards from rendered HTML
  // Square Online renders event cards with specific classes
  const events = [];
  const cardRegex =
    /<div[^>]*class="[^"]*(?:event-card|product-card|store-item)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const card = match[1];
    const nameMatch = card.match(
      /class="[^"]*(?:event-name|product-title|item-title)[^"]*"[^>]*>([^<]+)</
    );
    const dateMatch = card.match(
      /class="[^"]*(?:event-date|start-date)[^"]*"[^>]*>([^<]+)</
    );
    if (nameMatch) {
      events.push({ name: nameMatch[1].trim(), dateStr: dateMatch?.[1]?.trim() });
    }
  }

  if (events.length > 0) {
    console.log(`[WildAir] HTML card parsing found ${events.length} events`);
    return events;
  }

  // Strategy 4: Extract from any JSON blob containing event products
  // Search for the products API response that might be embedded
  const jsonBlobMatch = html.match(/"data"\s*:\s*(\[\s*\{[^]*?"product_type"\s*:\s*"event"[^]*?\]\s*})/);
  if (jsonBlobMatch) {
    try {
      const blob = JSON.parse(`{"data":${jsonBlobMatch[1]}}`);
      if (blob.data?.length > 0) {
        console.log(`[WildAir] Found embedded data blob with ${blob.data.length} items`);
        return blob.data;
      }
    } catch (e) {
      // Continue to fallback
    }
  }

  console.log('[WildAir] HTML parsing found no events, will try API fallback');
  return null; // Signal to use API fallback
}

/**
 * FALLBACK: Fetch events from Square Online Store API directly.
 */
async function fetchEventsFromAPI() {
  const allEvents = [];
  let page = 1;
  const maxPages = 3;

  while (page <= maxPages) {
    const qs = [
      `page=${page}`,
      `per_page=50`,
      `visibilities[]=visible`,
      `product_type=event`,
      `include=images,media_files`,
    ].join('&');

    const res = await fetch(`${API_BASE}?${qs}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.wildairbeer.com/',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.log(`[WildAir] API fallback HTTP ${res.status}`);
      throw new Error(`API HTTP ${res.status}`);
    }

    const text = await res.text();
    console.log(`[WildAir] API response: ${text.substring(0, 200)}`);

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.log(`[WildAir] API response not valid JSON`);
      break;
    }

    if (!json.data || !Array.isArray(json.data)) {
      console.log(`[WildAir] API response has no data array. Keys: ${Object.keys(json).join(', ')}`);
      break;
    }

    allEvents.push(...json.data);

    const totalPages = json.meta?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allEvents;
}

/**
 * Process raw event objects (from either HTML or API) into our standard format.
 */
function processEvents(rawEvents, todayET) {
  const events = [];
  const seen = new Set();

  for (const ev of rawEvents) {
    // Handle both API-style objects and simple HTML-parsed objects
    const details = ev.product_type_details || {};
    const date = details.start_date || ev.start_date;
    if (!date || date < todayET) continue;

    const name = (ev.name || ev.title)?.trim();
    if (!name) continue;

    const id = ev.id || ev.product_id || name.replace(/\s+/g, '-').toLowerCase();
    const externalId = `wildair-${id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const time = normalizeTime(details.start_time || ev.start_time);
    const description = stripHtml(ev.short_description || ev.description);

    const priceMatch = (ev.short_description || ev.description || '').match(/\$\d+/);
    const price = priceMatch ? priceMatch[0] : null;

    const imageUrl = ev.images?.data?.[0]?.absolute_url || ev.image_url || null;
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

  return events;
}

export async function scrapeWildAir() {
  try {
    const todayET = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });

    // Try HTML page first (more reliable from hosted environments)
    let rawEvents = null;
    try {
      rawEvents = await fetchEventsFromPage();
    } catch (htmlErr) {
      console.log(`[WildAir] HTML approach failed: ${htmlErr.message}`);
    }

    // If HTML didn't yield results, try the API
    if (!rawEvents || rawEvents.length === 0) {
      console.log('[WildAir] Trying API fallback...');
      try {
        rawEvents = await fetchEventsFromAPI();
      } catch (apiErr) {
        console.log(`[WildAir] API fallback also failed: ${apiErr.message}`);
        rawEvents = [];
      }
    }

    const events = processEvents(rawEvents, todayET);
    console.log(`[WildAir] Found ${events.length} upcoming events (from ${rawEvents.length} raw)`);
    return { events, error: null };
  } catch (err) {
    console.error('[WildAir] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
