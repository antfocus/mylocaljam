/**
 * Crossroads scraper
 * Website: https://www.xxroads.com/calendar
 * Data source: Eventbrite organizer page (JSON-LD structured data)
 * URL: https://www.eventbrite.com/o/crossroads-18337279677
 *
 * The venue's own Wix site only has image posters, but they sell all tickets
 * through Eventbrite. The Eventbrite organizer page contains JSON-LD
 * (schema.org) structured data with an `itemListElement` array of all
 * upcoming events including title, startDate, endDate, url, and image.
 *
 * If it breaks:
 *   1. Go to https://www.eventbrite.com/o/crossroads-18337279677
 *   2. View source → search for "application/ld+json"
 *   3. Look for the script containing "itemListElement"
 *   4. If the organizer URL changed, search Eventbrite for "Crossroads Garwood"
 */

const EVENTBRITE_URL = 'https://www.eventbrite.com/o/crossroads-18337279677';
const VENUE = 'Crossroads';
const VENUE_URL = 'https://www.xxroads.com/calendar';

export async function scrapeCrossroads() {
  try {
    const res = await fetch(EVENTBRITE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Eventbrite organizer page`);

    const html = await res.text();

    // Extract JSON-LD scripts
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let itemList = null;

    while ((match = jsonLdPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (data.itemListElement) {
          itemList = data.itemListElement;
          break;
        }
      } catch { /* skip malformed JSON */ }
    }

    if (!itemList || !Array.isArray(itemList)) {
      throw new Error('Could not find itemListElement in JSON-LD');
    }

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    for (const entry of itemList) {
      const item = entry.item || entry;
      const title = item.name;
      if (!title) continue;

      const startDateStr = item.startDate;
      if (!startDateStr) continue;

      const startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) continue;

      // Format date in Eastern time
      const year = parseInt(startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York', year: 'numeric' }));
      const month = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York', month: '2-digit' });
      const day = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York', day: '2-digit' });
      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Skip past events
      if (dateStr < todayStr) continue;

      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      // Event URL from Eventbrite
      const eventUrl = item.url || EVENTBRITE_URL;

      // Image URL
      const imageUrl = item.image || null;

      // Description
      const description = item.description
        ? item.description.replace(/<[^>]*>/g, '').trim().slice(0, 500) || null
        : null;

      // Build external ID from URL slug or title+date
      const urlSlug = eventUrl.split('/').pop().split('?')[0] || '';
      const idBase = urlSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `crossroads-${dateStr}-${idBase.slice(0, 50)}`;

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
        image_url: imageUrl,
      });
    }

    console.log(`[Crossroads] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[Crossroads] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
