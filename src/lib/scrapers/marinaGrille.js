/**
 * Marina Grille scraper
 * Music page: https://www.marinagrillenj.com/music
 *
 * Squarespace site — events are in static HTML.
 * Each event is inside a <div class="summary-thumbnail-outer-container">
 * with data-title on the <a> tag, date in <time class="...--date">,
 * and time in <span class="event-time-12hr">.
 *
 * If it breaks:
 *   1. Go to https://www.marinagrillenj.com/music
 *   2. Inspect a few events to check the class names haven't changed
 *   3. Update the regex patterns below
 */

const PAGE_URL = 'https://www.marinagrillenj.com/music';
const VENUE = 'Marina Grille';

export async function scrapeMarinaGrille() {
  try {
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const events = [];
    const now = new Date();
    const seen = new Set();

    // Match each event block: <a> with data-title, followed by date and time
    // We look for each summary-thumbnail-outer-container block
    const blockRegex = /<div[^>]*class="summary-thumbnail-outer-container"[^>]*>([\s\S]*?)<!\-\- Products: Quick View \-\->/g;

    let block;
    while ((block = blockRegex.exec(html)) !== null) {
      const content = block[1];

      // Extract title from data-title attribute
      const titleMatch = content.match(/data-title="([^"]+)"/);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim();

      // Extract link href
      const hrefMatch = content.match(/href="([^"]+)"/);
      const eventPath = hrefMatch ? hrefMatch[1] : null;

      // Extract date: <time class="summary-metadata-item summary-metadata-item--date">Mar 7, 2026</time>
      const dateMatch = content.match(/summary-metadata-item--date"[^>]*>([^<]+)<\/time>/);
      if (!dateMatch) continue;
      const dateText = dateMatch[1].trim(); // e.g. "Mar 7, 2026"

      // Parse the date string
      const parsedDate = new Date(dateText);
      if (isNaN(parsedDate.getTime())) continue;

      // Skip past events
      const dateOnly = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dateOnly < todayOnly) continue;

      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Extract time: <span class="event-time-12hr">8:00 PM &ndash; 11:00 PM</span>
      const timeMatch = content.match(/event-time-12hr"[^>]*>([^<]+)<\/span>/);
      let time = null;
      if (timeMatch) {
        // Clean up: get start time only (before dash/ndash)
        const raw = timeMatch[1]
          .replace(/&ndash;/g, '–')
          .replace(/&mdash;/g, '—')
          .trim();
        const startTime = raw.split(/\s*[–—-]\s*/)[0].trim();
        if (startTime) time = startTime;
      }

      // Build external_id from title + date
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `marinagrille-${dateStr}-${slug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title,
        venue: VENUE,
        date: dateStr,
        time,
        description: null,
        ticket_url: eventPath ? `https://www.marinagrillenj.com${eventPath}` : PAGE_URL,
        price: null,
        source_url: PAGE_URL,
        external_id: externalId,
      });
    }

    console.log(`[MarinaGrille] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[MarinaGrille] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
