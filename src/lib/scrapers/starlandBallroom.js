/**
 * Starland Ballroom scraper
 * Events page: https://www.starlandballroom.com/events/all
 *
 * AXS-ticketed venue. Server-rendered HTML with `.entry.starland` divs.
 * Each entry has:
 *   - `.title h3` — headliner name
 *   - `.title h4` — support acts
 *   - `.title h5:first-child` — presenter (e.g. "WRAT and WDHA Present")
 *   - `.date` span — "Fri, Mar 20, 2026"
 *   - `.time` span — "Doors 7:00 PM"
 *   - `.thumb a` — detail page link (/events/detail/XXXXXXX)
 *   - `.thumb img` — event image from AXS CDN
 *   - `.buttons a` — buy tickets link (/events/XXXXXXX/slug)
 *
 * If it breaks:
 *   1. Go to https://www.starlandballroom.com/events/all
 *   2. Inspect event cards — look for div.entry.starland
 *   3. Check if the class names or structure changed
 */

const EVENTS_URL = 'https://www.starlandballroom.com/events/all';
const BASE_URL = 'https://www.starlandballroom.com';
const VENUE = 'Starland Ballroom';

// Month abbreviations used in the date strings
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export async function scrapeStarlandBallroom() {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Starland Ballroom events`);

    const html = await res.text();

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    // Match each entry div — entries alternate between "entry  starland" and "entry alt  starland"
    // Use a pattern that captures each entry block
    const entryPattern = /<div\s+class="entry\s+(?:alt\s+)?starland\s+clearfix\s*">([\s\S]*?)(?=<div\s+class="entry\s+(?:alt\s+)?starland\s+clearfix|<\/div>\s*<!--\s*end\s*event_list|$)/gi;

    let entryMatch;
    while ((entryMatch = entryPattern.exec(html)) !== null) {
      const block = entryMatch[1];

      // Extract headliner from h3
      const h3Match = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const headliner = h3Match ? h3Match[1].replace(/<[^>]*>/g, '').trim() : '';
      if (!headliner) continue;

      // Extract support acts from h4
      const h4Match = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const support = h4Match ? h4Match[1].replace(/<[^>]*>/g, '').trim() : '';

      // Build title: "Headliner" or "Headliner with Support Acts"
      const title = support ? `${headliner} with ${support}` : headliner;

      // Extract date from .date span — "Fri, Mar 20, 2026"
      const dateMatch = block.match(/<span\s+class="date"[^>]*>([\s\S]*?)<\/span>/i);
      const dateText = dateMatch ? dateMatch[1].replace(/<[^>]*>/g, '').trim() : '';

      // Parse date: "Fri, Mar 20, 2026" or "Sat, Mar 21, 2026"
      const dateParts = dateText.match(/(\w{3})\s+(\d{1,2}),?\s*(\d{4})/);
      if (!dateParts) continue;

      const monthAbbr = dateParts[1].toLowerCase();
      const day = parseInt(dateParts[2], 10);
      const year = parseInt(dateParts[3], 10);
      const month = MONTHS[monthAbbr];
      if (month === undefined) continue;

      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Extract time from .time span — "Doors 7:00 PM"
      const timeMatch = block.match(/<span\s+class="time"[^>]*>([\s\S]*?)<\/span>/i);
      const timeText = timeMatch ? timeMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
      // Extract just the time portion
      const clockMatch = timeText.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
      const time = clockMatch ? clockMatch[1].trim() : '7:00 PM';

      // Extract detail page link — /events/detail/XXXXXXX
      const detailMatch = block.match(/href="(\/events\/detail\/\d+)"/i);
      const detailUrl = detailMatch ? `${BASE_URL}${detailMatch[1]}` : EVENTS_URL;

      // Extract ticket link — /events/XXXXXXX/slug
      const ticketMatch = block.match(/href="(\/events\/\d+\/[^"]+)"/i);
      const ticketUrl = ticketMatch ? `${BASE_URL}${ticketMatch[1]}` : null;

      // Extract image URL
      const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i);
      let imageUrl = null;
      if (imgMatch) {
        imageUrl = imgMatch[1].split('?')[0]; // Strip query params
      }

      // Extract event ID from detail link for external_id
      const idMatch = detailMatch ? detailMatch[1].match(/\/(\d+)$/) : null;
      const eventId = idMatch ? idMatch[1] : dateStr;
      const externalId = `starland-${dateStr}-${eventId}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title,
        venue: VENUE,
        date: dateStr,
        time,
        description: support ? `Support: ${support}` : null,
        ticket_url: ticketUrl,
        price: null,
        source_url: EVENTS_URL,
        external_id: externalId,
        image_url: imageUrl,
      });
    }

    console.log(`[StarlandBallroom] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[StarlandBallroom] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
