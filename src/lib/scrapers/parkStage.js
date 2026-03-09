/**
 * ParkStage scraper
 * Shows page: https://parkstage.org/shows/
 *
 * WordPress site with ACF custom fields (not exposed via REST API).
 * We scrape the HTML of the /shows/ page directly and parse event blocks.
 * Each event block has: day/date text (e.g. "FRI JUNE 19 • 5:30PM"),
 * title, optional description, and a "BUY TICKETS" link.
 *
 * If it breaks:
 *   1. Go to https://parkstage.org/shows/
 *   2. Inspect the HTML structure of event blocks
 *   3. Update the regex patterns below to match the new structure
 */

const SHOWS_URL = 'https://parkstage.org/shows/';
const VENUE = 'ParkStage';
const VENUE_URL = 'https://parkstage.org/shows/';

const MONTH_MAP = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Parse date text like "FRI JUNE 19 • 5:30PM" or "SAT JUNE 20 • 6PM"
 * Returns { dateStr: "2026-06-19", timeStr: "5:30 PM" } or null
 */
function parseDateText(text) {
  if (!text) return null;

  // Normalize: remove extra whitespace, convert bullet/dot separators
  const clean = text.replace(/\s+/g, ' ').trim();

  // Match patterns like: "FRI JUNE 19 • 5:30PM" or "JUNE 21 • 4PM" or "FRI JUNE 26 • 7PM"
  const match = clean.match(
    /(?:(?:MON|TUE|WED|THU|FRI|SAT|SUN)\w*\s+)?(\w+)\s+(\d{1,2})\s*[•·\-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i
  );
  if (!match) return null;

  const [, monthName, dayStr, rawTime] = match;
  const monthKey = monthName.toLowerCase();
  const month = MONTH_MAP[monthKey];
  if (!month) return null;

  const day = String(parseInt(dayStr)).padStart(2, '0');

  // Determine year: use current year, or next year if month is in the past
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based
  const eventMonth = parseInt(month);
  const year = eventMonth < currentMonth ? currentYear + 1 : currentYear;

  const dateStr = `${year}-${month}-${day}`;

  // Normalize time: "5:30PM" → "5:30 PM", "6PM" → "6:00 PM"
  let timeStr = rawTime.trim();
  // Add :00 if no minutes
  if (!timeStr.includes(':')) {
    timeStr = timeStr.replace(/(AM|PM)/i, ':00 $1');
  }
  // Add space before AM/PM if missing
  timeStr = timeStr.replace(/(\d)(AM|PM)/i, '$1 $2');

  return { dateStr, timeStr };
}

export async function scrapeParkStage() {
  try {
    const res = await fetch(SHOWS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching shows page`);

    const html = await res.text();

    const events = [];
    const seen = new Set();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Strategy: find date+time text patterns, then look for nearby title text.
    // The page structure shows date lines like "FRI JUNE 19 • 5:30PM" followed by title headings.

    // Match event blocks: look for date pattern followed by title
    // Pattern: date text (e.g., "FRI JUNE 19 • 5:30PM"), then an event title nearby
    const dateTimePattern = /(?:(?:MON|TUE|WED|THU|FRI|SAT|SUN)\w*\s+)?(\w+)\s+(\d{1,2})\s*[•·\-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi;

    // Find all date occurrences and their positions
    const dateMatches = [];
    let m;
    while ((m = dateTimePattern.exec(html)) !== null) {
      dateMatches.push({ match: m[0], index: m.index });
    }

    for (const dm of dateMatches) {
      const parsed = parseDateText(dm.match);
      if (!parsed) continue;
      if (parsed.dateStr < todayStr) continue;

      // Look for a title after this date match (within next 500 chars)
      const after = html.substring(dm.index, dm.index + 800);

      // Look for heading tags or strong tags containing the title
      // Pattern: <h2...>Title</h2> or <h3...>Title</h3> or <strong>Title</strong>
      const titleMatch = after.match(/<(?:h[1-4]|strong)[^>]*>([^<]+)<\/(?:h[1-4]|strong)>/i);
      if (!titleMatch) continue;

      let title = titleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .trim();
      if (!title || title.length < 2) continue;

      // Skip "BUY TICKETS" or similar button text
      if (/buy tickets|more info|learn more/i.test(title)) continue;

      // Look for description (e.g. "with special guest Wilderado")
      let description = null;
      const descMatch = after.match(/with\s+special\s+guests?\s+([^<]+)/i);
      if (descMatch) description = descMatch[0].trim();

      // Look for ticket link
      let ticketUrl = VENUE_URL;
      const linkMatch = after.match(/href=["']([^"']*(?:ticket|buy|event)[^"']*)["']/i);
      if (linkMatch) ticketUrl = linkMatch[1];
      // Also check for any link to the event page
      if (ticketUrl === VENUE_URL) {
        const eventLinkMatch = after.match(/href=["'](https?:\/\/parkstage\.org\/events\/[^"']*)["']/i);
        if (eventLinkMatch) ticketUrl = eventLinkMatch[1];
      }

      // Build external ID
      const titleClean = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `parkstage-${parsed.dateStr}-${titleClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title,
        venue: VENUE,
        date: parsed.dateStr,
        time: parsed.timeStr,
        description,
        ticket_url: ticketUrl,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
      });
    }

    console.log(`[ParkStage] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[ParkStage] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
