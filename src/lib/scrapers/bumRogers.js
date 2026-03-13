/**
 * Bum Rogers Crab House & Tavern scraper
 * Events page: https://bumrogerstavern.com/events
 *
 * Astro-based site (BentoBox/Mercury platform) — static HTML with
 * event cards rendered as <a class="event-card"> elements containing
 * <h3> for title and <p> for date/time text.
 *
 * If it breaks:
 *   1. Go to https://bumrogerstavern.com/events
 *   2. Inspect the event cards for class name changes
 *   3. Check if the date format in the <p> tag has changed
 */

const VENUE = 'Bum Rogers Tavern';
const VENUE_URL = 'https://bumrogerstavern.com/events';

export async function scrapeBumRogers() {
  try {
    const res = await fetch(VENUE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Bum Rogers events`);

    const html = await res.text();

    console.log(`[BumRogers] Fetched ${html.length} bytes, contains event-card: ${html.includes('event-card')}`);

    // Match event cards: <a href="..." class="event-card ..."> ... </a>
    // Note: href comes BEFORE class in the actual HTML
    const cardPattern = /<a[^>]*class="[^"]*event-card[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const events = [];
    const now = new Date();
    const seen = new Set();
    let match;

    while ((match = cardPattern.exec(html)) !== null) {
      const cardHtml = match[1];

      // Extract href from the full match (the <a> opening tag)
      const hrefMatch = match[0].match(/<a[^>]*href="([^"]*)"[^>]*/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const eventUrl = href.startsWith('http') ? href : `https://bumrogerstavern.com${href}`;

      // Extract title from <h3>
      const titleMatch = cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
      if (!title) continue;

      // Extract date/time text from <p>
      // Format: "Tuesday, March 17, 2026 7-10 PM, repeats"
      const dateMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (!dateMatch) continue;
      const dateText = dateMatch[1].replace(/<[^>]*>/g, '').trim();

      // Parse date: "Tuesday, March 17, 2026 7-10 PM, repeats" or "Wednesday, March 18, 2026 9 AM-12 PM, repeats"
      const datePattern = /(?:\w+,\s*)?(\w+\s+\d{1,2},\s*\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i;
      const parsed = dateText.match(datePattern);
      if (!parsed) continue;

      const datePart = parsed[1]; // "March 17, 2026"
      const timePart = parsed[2]; // "7" or "9 AM"

      // Parse the date
      const dateObj = new Date(datePart);
      if (isNaN(dateObj.getTime())) continue;

      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Skip past events
      const eventDateStr = dateStr;
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) continue;

      // Format time - extract the start time with AM/PM
      // "7-10 PM" → "7 PM", "9 AM-12 PM" → "9 AM"
      const timeRangeMatch = dateText.match(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)?[\s-]+(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i);
      let timeStr = timePart;
      if (timeRangeMatch) {
        const startHour = timeRangeMatch[1];
        const startAmPm = timeRangeMatch[2] || timeRangeMatch[4]; // if no AM/PM on start, use end's
        timeStr = `${startHour} ${startAmPm}`;
      }

      // Build external ID from slug in URL
      const slug = eventUrl.split('/').pop() || `${title}-${dateStr}`;
      const idClean = slug.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
      const externalId = `bumrogers-${dateStr}-${idClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: title,
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: null,
        ticket_url: eventUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: null,
      });
    }

    console.log(`[BumRogers] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BumRogers] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
