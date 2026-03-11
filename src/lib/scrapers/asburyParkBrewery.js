/**
 * Asbury Park Brewery Scraper
 * URL: https://www.asburyparkbrewery.com/events
 *
 * Squarespace site — uses the built-in JSON API (?format=json) on the
 * /events collection. Events are in the `upcoming` array (not `items`).
 *
 * If it breaks:
 *   1. Go to https://www.asburyparkbrewery.com/events
 *   2. Click on an event and note the URL path (e.g. /events/2026/3/11/event-slug)
 *   3. Try https://www.asburyparkbrewery.com/events?format=json
 *   4. Events should be in json.upcoming[]
 */

const BASE_URL = 'https://www.asburyparkbrewery.com';
const COLLECTION = 'events';
const VENUE = 'Asbury Park Brewery';
const VENUE_URL = 'https://www.asburyparkbrewery.com/events';

export async function scrapeAsburyParkBrewery() {
  try {
    const url = `${BASE_URL}/${COLLECTION}?format=json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Squarespace JSON`);

    const data = await res.json();
    const items = data?.upcoming || data?.items || [];

    if (!Array.isArray(items)) throw new Error('Unexpected JSON shape — no items/upcoming array');

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

      // Skip if event date is before today in Eastern time
      const eventDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) continue;

      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      // Build event URL from slug
      const slug = item.fullUrl || item.urlId || '';
      const eventUrl = slug.startsWith('http')
        ? slug
        : slug
          ? `${BASE_URL}${slug.startsWith('/') ? '' : '/'}${slug}`
          : VENUE_URL;

      // External ID from Squarespace item ID
      const itemId = item.id || slug || `${title}-${eventDateStr}`;
      const idClean = String(itemId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `apbrewery-${eventDateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      // Clean HTML entities from title
      const cleanTitle = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();

      // Extract image from body HTML (squarespace-cdn.com URL)
      // The assetUrl field is a broken static1.squarespace.com path that doesn't resolve
      const bodyImgMatch = item.body?.match(/src="([^"]*squarespace-cdn[^"]*)"/);
      const imageUrl = bodyImgMatch ? bodyImgMatch[1] : null;

      events.push({
        title: cleanTitle,
        venue: VENUE,
        date: eventDateStr,
        time: timeStr,
        description: item.excerpt
          ? item.excerpt.replace(/<[^>]*>/g, '').trim() || null
          : null,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: imageUrl,
      });
    }

    console.log(`[AsburyParkBrewery] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[AsburyParkBrewery] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
