/**
 * The Cabin Restaurant scraper
 * Site: https://www.thecabinnj.com/music
 *
 * Squarespace site — events are displayed via a Summary Block on the /music page,
 * backed by a Squarespace events collection. The /music?format=json endpoint
 * returns type "page" (not "events"), so we use the Squarespace open API:
 *   /api/open/GetItemsByMonth?collectionId={id}&month={M-YYYY}
 *
 * This returns structured JSON with startDate, endDate, title, urlId, assetUrl, etc.
 *
 * Schedule: Thursdays 6-9pm, Friday & Saturday 8:30-11:30pm
 *
 * If it breaks:
 *   1. Go to https://www.thecabinnj.com/music
 *   2. Inspect the summary-v2-block element
 *   3. Look for data-block-json attribute → collectionId
 *   4. Update COLLECTION_ID below if it changed
 *
 * Address: 839 NJ-71, Spring Lake Heights, NJ 07762
 */

const BASE_URL = 'https://www.thecabinnj.com';
const COLLECTION_ID = '6504675f2416e6466afd5e87';
const VENUE = 'The Cabin';
const VENUE_URL = 'https://www.thecabinnj.com/music';

/**
 * Fetch events for a given month using the Squarespace open API.
 * month format: "M-YYYY" (e.g. "3-2026")
 */
async function fetchMonth(month) {
  const url = `${BASE_URL}/api/open/GetItemsByMonth?collectionId=${COLLECTION_ID}&month=${month}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function scrapeTheCabin() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const events = [];
    const seen = new Set();

    // Fetch current month + next 2 months
    for (let offset = 0; offset < 3; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const month = `${d.getMonth() + 1}-${d.getFullYear()}`;

      const items = await fetchMonth(month);

      for (const item of items) {
        const title = item.title;
        if (!title) continue;

        const startMs = item.startDate;
        if (!startMs) continue;

        const startDate = new Date(startMs);
        if (isNaN(startDate.getTime())) continue;

        const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (dateStr < todayStr) continue;

        const timeStr = startDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        });

        const slug = item.urlId || '';
        const eventUrl = slug
          ? `${BASE_URL}/music/${slug}`
          : VENUE_URL;

        const itemId = item.id || slug || `${title}-${dateStr}`;
        const idClean = String(itemId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
        const externalId = `cabin-${dateStr}-${idClean}`;

        if (seen.has(externalId)) continue;
        seen.add(externalId);

        events.push({
          title: title.trim(),
          venue: VENUE,
          date: dateStr,
          time: timeStr,
          description: item.excerpt
            ? item.excerpt.replace(/<[^>]*>/g, '').trim() || null
            : null,
          ticket_url: eventUrl,
          price: null,
          source_url: VENUE_URL,
          external_id: externalId,
          image_url: item.assetUrl || null,
        });
      }
    }

    console.log(`[The Cabin] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[The Cabin] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
