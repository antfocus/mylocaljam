/**
 * Asbury Lanes scraper
 * Concerts page: https://www.asburylanes.com/concerts/
 *
 * BentoBox (getbento.com) site — no API available.
 * Listing page has event cards with titles containing dates in MM.DD.YYYY format.
 * Detail pages have JSON-LD @type:Event with description containing door times.
 *
 * Approach:
 *   1. Fetch the /concerts/ listing page HTML
 *   2. Parse each .card__heading for title and date (MM.DD.YYYY)
 *   3. Extract event slug from .card__btn href for external_id
 *   4. Fetch each detail page and extract door time from JSON-LD description
 *
 * If it breaks:
 *   - Check if the card CSS class changed (currently .card__heading for title, a.card__btn for link)
 *   - Check if the JSON-LD format changed on detail pages
 *
 * Address: 209 4th Ave, Asbury Park, NJ 07712
 */

const VENUE = 'Asbury Lanes';
const LISTING_URL = 'https://www.asburylanes.com/concerts/';
const BASE_URL = 'https://www.asburylanes.com';

/**
 * Extract date (MM.DD.YYYY) from a title string.
 * Titles follow patterns like:
 *   "03.15.2026 | Rockit Academy Presents: ..."
 *   "CKY | 03.15.2026"
 *   "Pack The Bowl Fest VII | Cosmic Jerry Band | 04.18.2026"
 */
function extractDateFromTitle(title) {
  const match = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Clean the title by removing the date portion and pipe separators.
 * e.g. "03.15.2026 | Rockit Academy Presents: ..." → "Rockit Academy Presents: ..."
 *      "CKY | 03.15.2026" → "CKY"
 */
function cleanTitle(title) {
  return title
    .replace(/\d{2}\.\d{2}\.\d{4}/, '')  // remove date
    .replace(/^\s*\|\s*/, '')              // remove leading pipe
    .replace(/\s*\|\s*$/, '')              // remove trailing pipe
    .replace(/^\s*\|\s*/, '')              // remove any remaining leading pipe
    .trim();
}

/**
 * Extract door time from JSON-LD description text.
 * Descriptions often contain "Doors 7:30 PM" or "Doors 7 PM" or "Doors 8PM"
 */
function extractTimeFromDescription(desc) {
  if (!desc) return null;
  const match = desc.match(/Doors?\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  if (match) {
    let timeStr = match[1].trim();
    // Normalize: "7 PM" → "7:00 PM", "7PM" → "7:00 PM"
    if (!timeStr.includes(':')) {
      timeStr = timeStr.replace(/(\d+)\s*(AM|PM)/i, '$1:00 $2');
    }
    return timeStr;
  }
  return null;
}

/**
 * Fetch a detail page and extract time from JSON-LD description.
 */
async function fetchEventTime(eventPath) {
  try {
    const url = eventPath.startsWith('http') ? eventPath : `${BASE_URL}${eventPath}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract JSON-LD Event data
    const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldMatch) return null;

    for (const block of ldMatch) {
      const jsonStr = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      try {
        const data = JSON.parse(jsonStr);
        if (data['@type'] === 'Event' && data.description) {
          return extractTimeFromDescription(data.description);
        }
      } catch {
        // ignore parse errors
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function scrapeAsburyLanes() {
  try {
    const res = await fetch(LISTING_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching listing page`);

    const html = await res.text();

    // Parse event cards from HTML
    // Card structure: <div class="card ..."><a class="card__btn" href="/event/...">...<h3 class="... card__heading">TITLE</h3></a></div>
    const cardRegex = /<a[^>]*class="card__btn"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<h3[^>]*class="[^"]*card__heading[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;

    const rawEvents = [];
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const href = match[1];
      const rawTitle = match[2].replace(/<[^>]*>/g, '').trim();
      rawEvents.push({ href, rawTitle });
    }

    // If regex didn't find cards, try alternate pattern
    if (rawEvents.length === 0) {
      // Fallback: look for card__heading directly
      const altRegex = /<h3[^>]*card__heading[^>]*>([\s\S]*?)<\/h3>/gi;
      const hrefRegex = /href="(\/event\/[^"]*)"/gi;
      const headings = [];
      const hrefs = [];
      let m;
      while ((m = altRegex.exec(html)) !== null) {
        headings.push(m[1].replace(/<[^>]*>/g, '').trim());
      }
      while ((m = hrefRegex.exec(html)) !== null) {
        hrefs.push(m[1]);
      }
      // Pair them up
      const len = Math.min(headings.length, hrefs.length);
      for (let i = 0; i < len; i++) {
        rawEvents.push({ href: hrefs[i], rawTitle: headings[i] });
      }
    }

    if (rawEvents.length === 0) {
      console.log('[AsburyLanes] No event cards found on listing page');
      return { events: [], error: 'No event cards found' };
    }

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Filter to future events and extract dates
    const parsedEvents = [];
    for (const ev of rawEvents) {
      const dateStr = extractDateFromTitle(ev.rawTitle);
      if (!dateStr) continue;
      if (dateStr < todayStr) continue;

      const title = cleanTitle(ev.rawTitle);
      if (!title) continue;

      const slug = ev.href.replace(/^\/event\//, '').replace(/\/$/, '');
      const externalId = `asburylanes-${slug}`;

      parsedEvents.push({
        title,
        dateStr,
        href: ev.href,
        externalId,
      });
    }

    // Fetch detail pages in parallel to get door times (limit concurrency to 5)
    const CONCURRENCY = 5;
    const times = new Array(parsedEvents.length).fill(null);

    for (let i = 0; i < parsedEvents.length; i += CONCURRENCY) {
      const batch = parsedEvents.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(ev => fetchEventTime(ev.href))
      );
      for (let j = 0; j < results.length; j++) {
        times[i + j] = results[j];
      }
    }

    // Build final events array
    const events = parsedEvents.map((ev, idx) => ({
      title: ev.title,
      venue: VENUE,
      date: ev.dateStr,
      time: times[idx] || '8:00 PM', // default to 8 PM if no time found
      description: null,
      ticket_url: `${BASE_URL}${ev.href}`,
      price: null,
      source_url: LISTING_URL,
      external_id: ev.externalId,
    }));

    console.log(`[AsburyLanes] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[AsburyLanes] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
