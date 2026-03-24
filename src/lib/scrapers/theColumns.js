/**
 * The Columns NJ scraper
 * Entertainment schedule: https://thecolumnsnj.com/entertainment-schedule/
 *
 * WordPress site with a custom `entertainment_schedule_block` section.
 * Each event is a Bootstrap `.row` containing:
 *   - <h5> for the event title (band name or event name like LOBSTERPALOOZA)
 *   - <span class="bold-weight"> for the date/time ("May 1, 2026 8:00 pm")
 *   - <p> (optional) for sub-info: duo name on LOBSTERPALOOZA nights, or notes
 *
 * LOBSTERPALOOZA pattern: The <h5> is "LOBSTERPALOOZA" but the actual
 * performing artist is in a <p> tag (e.g. "Jenny & Annie Duo").
 * We use the duo name as the artist and note LOBSTERPALOOZA in the title.
 *
 * If it breaks:
 *   1. Go to https://thecolumnsnj.com/entertainment-schedule/
 *   2. Inspect the event rows — look for <h5> and <span class="bold-weight">
 *   3. Check if the section class changed from `entertainment_schedule_block`
 */

const VENUE = 'The Columns';
const VENUE_URL = 'https://thecolumnsnj.com/entertainment-schedule/';

// Non-music events or section headers to skip entirely
const SKIP_TITLES = new Set([
  "mother's day",
  "may 2026",
  "june 2026",
  "july 2026",
  "august 2026",
  "september 2025",
  "september 2026",
  "october 2026",
]);

// Event names where the REAL artist is in the <p> tag
const EVENT_WITH_SUB_ARTIST = new Set([
  'lobsterpalooza',
  'lobster palooza bonus nite',
]);

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

    // Extract the schedule block
    const blockMatch = html.match(/entertainment_schedule_block([\s\S]*?)(?:<\/section>|$)/i);
    if (!blockMatch) throw new Error('Could not find entertainment_schedule_block');

    const blockHtml = blockMatch[1];

    // Split into rows — each .row div is one event
    const rowPattern = /<div[^>]*class="[^"]*\brow\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    let rowMatch;

    while ((rowMatch = rowPattern.exec(blockHtml)) !== null) {
      const rowHtml = rowMatch[1];

      // Extract title from <h5>
      const h5Match = rowHtml.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i);
      if (!h5Match) continue;
      const rawTitle = h5Match[1].replace(/<[^>]*>/g, '').trim();
      if (!rawTitle) continue;

      const titleLower = rawTitle.toLowerCase().trim();

      // Skip month headers and non-music events
      if (SKIP_TITLES.has(titleLower)) continue;
      if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(rawTitle)) continue;

      // Extract date from <span class="bold-weight">
      const spanMatch = rowHtml.match(/<span[^>]*class="[^"]*bold-weight[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!spanMatch) continue;
      const rawDate = spanMatch[1].replace(/<[^>]*>/g, '').trim();

      // Parse date: "May 1, 2026 8:00 pm"
      const dateTimeMatch = rawDate.match(/(\w+\s+\d{1,2},\s*\d{4})\s+(\d{1,2}:\d{2}\s*[ap]m)/i);
      if (!dateTimeMatch) continue;

      const datePart = dateTimeMatch[1];
      const timePart = dateTimeMatch[2];

      const dateObj = new Date(datePart);
      if (isNaN(dateObj.getTime())) continue;

      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Format time
      const timeStr = timePart.replace(/\s+/g, ' ').toUpperCase();

      // Extract optional <p> content (duo name, notes, etc.)
      const pMatch = rowHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const pText = pMatch ? pMatch[1].replace(/<[^>]*>/g, '').trim() : null;

      // Determine the actual artist name
      let artistName = rawTitle;
      let description = null;

      // Check if this is a LOBSTERPALOOZA-type event where the real artist is in <p>
      const isEventWithSubArtist = EVENT_WITH_SUB_ARTIST.has(titleLower) ||
        titleLower.includes('lobsterpalooza') || titleLower.includes('lobster palooza');

      if (isEventWithSubArtist && pText && !pText.match(/reserve|table|ticket|call/i)) {
        // The <p> has the actual performing artist (e.g. "Jenny & Annie Duo")
        artistName = `${pText} (${rawTitle})`;
        description = `${rawTitle} at The Columns featuring ${pText}`;
      } else if (pText && !pText.match(/reserve|table|ticket|call|happy|closing/i)) {
        // Some other note — might be useful as description
        description = pText;
      }

      // Build external ID
      const titleSlug = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `thecolumns-${dateStr}-${titleSlug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: artistName,
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description,
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
