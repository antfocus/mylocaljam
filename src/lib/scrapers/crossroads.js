/**
 * Crossroads scraper
 * Website: https://www.xxroads.com/calendar
 * Data source: Eventbrite organizer JSON API
 * API: https://www.eventbrite.com/org/{orgId}/showmore/?type=future&page_size=50&page=1
 *
 * The venue's own Wix site only has image posters, but they sell all tickets
 * through Eventbrite. The Eventbrite "showmore" API returns all future events
 * as JSON with name, start/end times, URL, image, price, and event ID.
 *
 * Previously used JSON-LD which only returned the first 12 of 24 events.
 * The showmore API returns all events in one request (page_size=50).
 *
 * If it breaks:
 *   1. Go to https://www.eventbrite.com/o/crossroads-18337279677
 *   2. Open Network tab, click "Show more" on upcoming events
 *   3. Look for /org/{id}/showmore/ requests
 *   4. If the organizer ID changed, search Eventbrite for "Crossroads Garwood"
 */

const ORG_ID = '18337279677';
const API_URL = `https://www.eventbrite.com/org/${ORG_ID}/showmore/`;
const VENUE = 'Crossroads';
const VENUE_URL = 'https://www.xxroads.com/calendar';

export async function scrapeCrossroads() {
  try {
    const url = `${API_URL}?type=future&page_size=50&page=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.eventbrite.com/o/crossroads-18337279677',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Eventbrite showmore API`);

    const json = await res.json();
    const items = json?.data?.events || [];

    if (!items.length) {
      throw new Error('No events returned from Eventbrite API');
    }

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    for (const item of items) {
      const title = item.name?.text;
      if (!title) continue;

      // Use local start time (already in Eastern)
      const localStart = item.start?.local;
      if (!localStart) continue;

      // localStart format: "2026-03-20T20:00:00"
      const dateStr = localStart.slice(0, 10);

      // Skip past events
      if (dateStr < todayStr) continue;

      // Extract time from formatted_time or parse from local
      const time = item.start?.formatted_time || (() => {
        const [, timeStr] = localStart.split('T');
        if (!timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        const hour12 = h % 12 || 12;
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
      })();

      // Event URL
      const eventUrl = item.url || `https://www.eventbrite.com/e/${item.id}`;

      // Image URL — use the logo URL from Eventbrite
      const imageUrl = item.logo?.url || null;

      // Description
      const description = item.summary
        ? item.summary.replace(/<[^>]*>/g, '').trim().slice(0, 500) || null
        : null;

      // Price
      const price = item.is_free ? 'Free' : (item.price_range || null);

      // External ID using Eventbrite event ID
      const externalId = `crossroads-${dateStr}-${item.id}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: title.trim(),
        venue: VENUE,
        date: dateStr,
        time,
        description,
        ticket_url: eventUrl,
        price,
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
