/**
 * Black Swan Public House scraper
 * Page: https://www.theblackswanap.com/music-and-events
 *
 * Squarespace site — events live in a separate collection at /new-events-1.
 * The built-in JSON API (?format=json) returns an `upcoming` array with
 * structured event data (epoch-ms dates, title, excerpt, assetUrl, etc.).
 *
 * If it breaks:
 *   1. Visit https://www.theblackswanap.com/music-and-events in a browser
 *   2. Check if the calendar still loads events
 *   3. Try https://www.theblackswanap.com/new-events-1?format=json in browser
 *   4. If the collection slug changed, search page source for collectionId
 */

const BASE_URL = 'https://www.theblackswanap.com';
const COLLECTION = 'new-events-1';
const VENUE = 'The Black Swan';
const VENUE_URL = 'https://www.theblackswanap.com/music-and-events';

export async function scrapeBlackSwan() {
  try {
    const url = `${BASE_URL}/${COLLECTION}?format=json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Squarespace JSON`);

    const data = await res.json();
    const items = data?.upcoming || data?.items || [];

    if (!Array.isArray(items)) throw new Error('Unexpected JSON shape — no upcoming/items array');

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    for (const item of items) {
      const title = item.title;
      if (!title) continue;

      // Squarespace stores dates as epoch milliseconds in startDate
      const startMs = item.startDate;
      if (!startMs) continue;

      const startDate = new Date(startMs);
      if (isNaN(startDate.getTime())) continue;

      // Skip only if the event date is before today in Eastern time
      const eventDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) continue;

      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      // Build event URL from slug
      const slug = item.urlId || item.fullUrl || '';
      const eventUrl = slug.startsWith('http')
        ? slug
        : slug
          ? `${BASE_URL}/${COLLECTION}/${slug}`
          : VENUE_URL;

      // Description from excerpt (plain text) or body (HTML → strip tags)
      const description = item.excerpt
        ? item.excerpt.replace(/<[^>]*>/g, '').trim().slice(0, 500) || null
        : item.body
          ? item.body.replace(/<[^>]*>/g, '').trim().slice(0, 500) || null
          : null;

      // External ID from Squarespace item ID or slug
      const itemId = item.id || slug || `${title}-${dateStr}`;
      const idClean = String(itemId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `blackswan-${dateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: title.trim(),
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: item.assetUrl || null,
      });
    }

    console.log(`[BlackSwan] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[BlackSwan] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
