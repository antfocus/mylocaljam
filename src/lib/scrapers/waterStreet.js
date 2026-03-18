/**
 * Water Street Bar & Grill scraper
 * Music page: https://www.waterstreetnj.com/music
 * Events collection: https://www.waterstreetnj.com/schedule
 *
 * Squarespace site — the /music page embeds events from the /schedule
 * collection. Uses the built-in JSON API (?format=json) on /schedule
 * which returns structured event data in the `upcoming` array.
 *
 * If it breaks:
 *   1. Go to https://www.waterstreetnj.com/music
 *   2. Click on an event and note the URL path (e.g. /schedule/run-away-train)
 *   3. The collection name is "schedule"
 *   4. Try https://www.waterstreetnj.com/schedule?format=json
 *   5. Update COLLECTION below if the path changed
 */

const BASE_URL = 'https://www.waterstreetnj.com';
const COLLECTION = 'schedule';
const VENUE = 'Water Street Bar & Grill';
const VENUE_URL = 'https://www.waterstreetnj.com/music';

export async function scrapeWaterStreet() {
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
    const items = data?.upcoming || data?.items || [];

    if (!Array.isArray(items)) throw new Error('Unexpected JSON shape — no items array');

    const events = [];
    const now = new Date();
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
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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

      // External ID from Squarespace item ID or slug
      const itemId = item.id || slug || `${title}-${dateStr}`;
      const idClean = String(itemId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `waterstreet-${dateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: title.trim(),
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: item.excerpt ? item.excerpt.replace(/<[^>]*>/g, '').trim() || null : null,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: item.assetUrl || null,
      });
    }

    console.log(`[WaterStreet] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[WaterStreet] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
