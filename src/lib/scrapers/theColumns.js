/**
 * The Columns NJ scraper
 * Entertainment schedule: https://thecolumnsnj.com/entertainment-schedule/
 *
 * WordPress site with a custom `entertainment_schedule_block` section.
 * Each event is a Bootstrap `.row` containing:
 *   - <h5> for the event title
 *   - <span class="bold-weight"> for the date/time ("May 1, 2026 8:00 pm")
 *
 * If it breaks:
 *   1. Go to https://thecolumnsnj.com/entertainment-schedule/
 *   2. Inspect the event rows — look for <h5> and <span class="bold-weight">
 *   3. Check if the section class changed from `entertainment_schedule_block`
 */

const VENUE = 'The Columns';
const VENUE_URL = 'https://thecolumnsnj.com/entertainment-schedule/';

export async function scrapeTheColumns() {
  try {
    const res = await fetch(VENUE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching The Columns schedule`);

    const html = await res.text();

    // Each event row contains:
    //   <h5>Event Title</h5>
    //   <span class="bold-weight">May 1, 2026 8:00 pm</span>
    // We match rows that have both an h5 and a bold-weight span
    const rowPattern = /<div[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

    // Simpler approach: find all h5 + span pairs in the entertainment_schedule_block
    // Extract the schedule block first
    const blockMatch = html.match(/entertainment_schedule_block([\s\S]*?)(?:<\/section>|<section)/i);
    if (!blockMatch) throw new Error('Could not find entertainment_schedule_block');

    const blockHtml = blockMatch[1];

    // Match each event: <h5>Title</h5> ... <span class="bold-weight">Date Time</span>
    // Use a pattern that finds h5 followed by a bold-weight span within the same row
    const eventPattern = /<h5>([\s\S]*?)<\/h5>[\s\S]*?<span[^>]*class="[^"]*bold-weight[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

    const events = [];
    const now = new Date();
    const seen = new Set();
    let match;

    while ((match = eventPattern.exec(blockHtml)) !== null) {
      const rawTitle = match[1].replace(/<[^>]*>/g, '').trim();
      const rawDate = match[2].replace(/<[^>]*>/g, '').trim();

      if (!rawTitle || !rawDate) continue;

      // Skip month headers (e.g. "May 2026") and non-event entries
      if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(rawTitle)) continue;

      // Parse date: "May 1, 2026 8:00 pm"
      const dateTimeMatch = rawDate.match(/(\w+\s+\d{1,2},\s*\d{4})\s+(\d{1,2}:\d{2}\s*[ap]m)/i);
      if (!dateTimeMatch) continue;

      const datePart = dateTimeMatch[1]; // "May 1, 2026"
      const timePart = dateTimeMatch[2]; // "8:00 pm"

      const dateObj = new Date(datePart);
      if (isNaN(dateObj.getTime())) continue;

      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Skip past events
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (dateStr < todayStr) continue;

      // Format time nicely
      const timeStr = timePart.replace(/\s+/g, ' ').toUpperCase();

      // Build external ID
      const titleSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `thecolumns-${dateStr}-${titleSlug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: rawTitle,
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: null,
      });
    }

    console.log(`[TheColumns] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[TheColumns] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
