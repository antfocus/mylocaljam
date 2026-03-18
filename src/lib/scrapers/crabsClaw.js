/**
 * The Crab's Claw Inn scraper
 * Events page: https://thecrabsclaw.com/events-calendar/
 *
 * The site embeds a RestaurantPassion calendar widget in an iframe.
 * We fetch the iframe URL directly to get the plain-text schedule.
 * Content is in `.custom_page_body` with one `<p>` per day:
 *   - First line: date (e.g. "Fri., Mar., 20")
 *   - Subsequent lines: events with optional times (e.g. "Mike Viscell 4 - 7")
 *
 * If it breaks:
 *   1. Go to https://thecrabsclaw.com/events-calendar/
 *   2. Right-click the calendar area → inspect → find the iframe src
 *   3. The iframe points to restaurantpassion.com/ext-page/13/332/27093/
 *   4. Update IFRAME_URL below if the path changed
 */

const IFRAME_URL = 'https://www.restaurantpassion.com/ext-page/13/332/27093/';
const VENUE = "The Crab's Claw Inn";
const VENUE_URL = 'https://thecrabsclaw.com/events-calendar/';

// Non-music events to skip
const SKIP_EVENTS = [
  'bingo', 'karaoke', 'texas hold', 'trivia',
  'lunch specials', 'dinner specials', 'happy hour',
  'brunch', 'burger specials',
];

export async function scrapeCrabsClaw() {
  try {
    const res = await fetch(IFRAME_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching RestaurantPassion page`);

    const html = await res.text();

    // Extract the custom_page_body content
    const bodyMatch = html.match(/class="custom_page_body"[^>]*>([\s\S]*?)(?:<\/div>\s*<script|<\/div>\s*$)/i);
    if (!bodyMatch) throw new Error('Could not find custom_page_body');

    const bodyHtml = bodyMatch[1];

    // Split into <p> blocks — each represents one day
    const pBlocks = bodyHtml.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];

    const events = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    // Month abbreviation mapping
    const MONTH_MAP = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };

    for (const pHtml of pBlocks) {
      // Strip HTML tags and split into lines
      const text = pHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) continue;

      // First line should be a date like "Fri., Mar., 20" or "Sun.,Mar . 1"
      // Very loose pattern to handle inconsistent formatting
      const dateLine = lines[0];
      const dateMatch = dateLine.match(/(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s.,]+([a-z]+)[a-z]*[\s.,]+(\d{1,2})/i);
      if (!dateMatch) continue;

      const monthStr = dateMatch[1].toLowerCase().slice(0, 3);
      const day = parseInt(dateMatch[2], 10);
      const month = MONTH_MAP[monthStr];
      if (month === undefined || isNaN(day)) continue;

      // Determine year — if month is far behind current month, assume next year
      let year = currentYear;
      const currentMonth = now.getMonth();
      if (month < currentMonth - 2) {
        year = currentYear + 1;
      }

      const monthPadded = String(month + 1).padStart(2, '0');
      const dayPadded = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthPadded}-${dayPadded}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Process event lines (everything after the date line)
      for (let i = 1; i < lines.length; i++) {
        const eventLine = lines[i].trim();
        if (!eventLine) continue;

        // Skip non-music events
        const lower = eventLine.toLowerCase();
        if (SKIP_EVENTS.some(skip => lower.includes(skip))) continue;

        // Extract performer name and time
        // Patterns: "Mike Viscell 4-7", "Jenny Barnes 8- 12", "The Snake 3-7 Bagpipers"
        // Try to separate name from time range
        const timeMatch = eventLine.match(/^(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2}(?::\d{2})?)\s*(.*)$/);

        let performer, time;
        if (timeMatch) {
          performer = timeMatch[1].trim();
          // Append any trailing text (like "Bagpipers") to performer
          if (timeMatch[4] && timeMatch[4].trim()) {
            performer += ' ' + timeMatch[4].trim();
          }
          let startHour = parseInt(timeMatch[2], 10);
          // Convert to 12h format — assume PM for hours < 12 for evening shows
          if (startHour < 12) {
            time = startHour + ':00 PM';
          } else {
            time = (startHour - 12 || 12) + ':00 PM';
          }
        } else {
          // No time found — use the full line as performer
          performer = eventLine;
          time = null;
        }

        if (!performer || performer.length < 2) continue;

        // Build external ID
        const titleSlug = performer.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        const externalId = `crabsclaw-${dateStr}-${titleSlug}`;

        if (seen.has(externalId)) continue;
        seen.add(externalId);

        events.push({
          title: performer,
          venue: VENUE,
          date: dateStr,
          time,
          description: null,
          ticket_url: VENUE_URL,
          price: null,
          source_url: VENUE_URL,
          external_id: externalId,
          image_url: null,
        });
      }
    }

    console.log(`[CrabsClaw] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[CrabsClaw] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
