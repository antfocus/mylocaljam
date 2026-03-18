/**
 * Starland Ballroom scraper
 * Events page: https://www.starlandballroom.com/events/all
 * Data source: AJAX endpoint at /events/events_ajax/{offset}
 *
 * AXS-ticketed venue (AEG/Carbonhouse platform). The main page is a shell
 * that loads events via AJAX. The AJAX endpoint returns JSON-encoded HTML
 * fragments with `.entry.starland` divs, 20 per page.
 *
 * Each entry has:
 *   - `.title h3` — headliner name
 *   - `.title h4` — support acts
 *   - `.date` span — "Fri, Mar 20, 2026"
 *   - `.time` span — "Doors 7:00 PM"
 *   - `a[href*=/events/detail/]` — detail page link
 *   - `img` — event image from AXS CDN
 *   - `.buttons a` — buy tickets link
 *
 * If it breaks:
 *   1. Go to https://www.starlandballroom.com/events/all
 *   2. Open Network tab, look for events_ajax requests
 *   3. Check if the endpoint or HTML structure changed
 */

const AJAX_URL = 'https://www.starlandballroom.com/events/events_ajax';
const EVENTS_URL = 'https://www.starlandballroom.com/events/all';
const VENUE = 'Starland Ballroom';

// Month abbreviations used in the date strings
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseEntries(html, todayStr, seen) {
  const events = [];

  // Split HTML by entry divs — class has double spaces: "entry  starland clearfix "
  const splitPattern = /<div\s+class="entry\s+(?:alt\s+)?\s*starland\s+clearfix\s*">/gi;
  const blocks = html.split(splitPattern).slice(1);

  for (const block of blocks) {
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

    // Parse date
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
    const clockMatch = timeText.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    const time = clockMatch ? clockMatch[1].trim() : '7:00 PM';

    // Extract detail page link — full URL to /events/detail/XXXXXXX
    const detailMatch = block.match(/href="([^"]*\/events\/detail\/(\d+))"/i);
    const detailUrl = detailMatch ? detailMatch[1] : EVENTS_URL;

    // Extract ticket link — /events/XXXXXXX/slug
    const ticketMatch = block.match(/href="([^"]*\/events\/\d+\/[^"]+)"/i);
    const ticketUrl = ticketMatch ? ticketMatch[1] : null;

    // Extract image URL
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i);
    let imageUrl = null;
    if (imgMatch) {
      imageUrl = imgMatch[1].split('?')[0];
    }

    // External ID from event detail ID
    const eventId = detailMatch ? detailMatch[2] : dateStr;
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

  return events;
}

export async function scrapeStarlandBallroom() {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.starlandballroom.com/events/all',
    };

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    const allEvents = [];

    // Fetch pages — 20 events per page, fetch up to 3 pages (60 events max)
    for (let offset = 0; offset < 60; offset += 20) {
      const url = `${AJAX_URL}/${offset}`;
      const res = await fetch(url, { headers, next: { revalidate: 0 } });

      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

      const raw = await res.text();

      // Response is JSON-encoded HTML string — parse it
      let html;
      try {
        html = JSON.parse(raw);
      } catch {
        // If not JSON, use raw text directly
        html = raw;
      }

      if (!html || html.length < 50) break; // empty page = no more events

      const pageEvents = parseEntries(html, todayStr, seen);
      allEvents.push(...pageEvents);

      // If we got fewer than 20 entries, no more pages
      if (pageEvents.length < 20) break;
    }

    console.log(`[StarlandBallroom] Found ${allEvents.length} upcoming events`);
    return { events: allEvents, error: null };

  } catch (err) {
    console.error('[StarlandBallroom] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
