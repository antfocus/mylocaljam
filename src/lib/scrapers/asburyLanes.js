/**
 * Asbury Lanes scraper
 * Concerts page: https://www.asburylanes.com/concerts/
 *
 * BentoBox (getbento.com) site on nginx — no API available.
 * Listing page has event cards with titles containing dates in MM.DD.YYYY format.
 * Detail pages have JSON-LD @type:Event with description containing door times.
 * Images are served from images.getbento.com via background-image styles on .card__image divs.
 *
 * Approach:
 *   1. Fetch the /concerts/ listing page HTML with browser-like headers
 *      (BentoBox nginx blocks or serves empty pages to bare bot User-Agents from server IPs)
 *   2. Parse each .card__heading for title and date (M.DD.YYYY or MM.DD.YYYY)
 *   3. Extract event slug from .card__btn href for external_id
 *   4. Extract image URLs from listing page background-image styles where possible
 *   5. Fetch each detail page and extract door time from JSON-LD description
 *
 * If it breaks:
 *   - Check if the card CSS class changed (currently .card__heading for title, a.card__btn for link)
 *   - Check if the JSON-LD format changed on detail pages
 *   - Check if BentoBox/nginx started blocking requests (look for HTTP 403 or empty HTML)
 *
 * Address: 209 4th Ave, Asbury Park, NJ 07712
 */

const VENUE = 'Asbury Lanes';
const LISTING_URL = 'https://www.asburylanes.com/concerts/';
const BASE_URL = 'https://www.asburylanes.com';

/**
 * Standard browser-like headers to avoid being blocked by BentoBox nginx.
 * The site serves empty/different responses to bare bot User-Agents from server IPs.
 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

/**
 * Extract date (MM.DD.YYYY or M.DD.YYYY) from a title string.
 * Titles follow patterns like:
 *   "03.15.2026 | Rockit Academy Presents: ..."
 *   "CKY | 03.15.2026"
 *   "Pack The Bowl Fest VII | Cosmic Jerry Band | 04.18.2026"
 *   "A Benefit for Sweet Relief | Danny Clinch x Rachel Ana Dobken | 4.19.2026"
 */
function extractDateFromTitle(title) {
  const match = title.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd}`;
}

/**
 * Clean the title by removing the date portion and pipe separators.
 * e.g. "03.15.2026 | Rockit Academy Presents: ..." → "Rockit Academy Presents: ..."
 *      "CKY | 03.15.2026" → "CKY"
 */
function cleanTitle(title) {
  return title
    .replace(/\s*\|?\s*\d{1,2}\.\d{2}\.\d{4}\s*\|?\s*/g, ' | ')  // remove date + surrounding pipes
    .replace(/^\s*\|\s*/, '')                // remove leading pipe
    .replace(/\s*\|\s*$/, '')                // remove trailing pipe
    .replace(/\|\s*\|/g, '|')               // collapse double pipes
    .replace(/^\s*\|\s*/, '')                // remove any remaining leading pipe
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
 * Fetch a detail page and extract time + image from JSON-LD.
 * Returns { time: string|null, imageUrl: string|null }
 */
async function fetchEventDetails(eventPath) {
  try {
    const url = eventPath.startsWith('http') ? eventPath : `${BASE_URL}${eventPath}`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) return { time: null, imageUrl: null };

    const html = await res.text();

    // Extract JSON-LD Event data
    const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldMatch) return { time: null, imageUrl: null };

    for (const block of ldMatch) {
      const jsonStr = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      try {
        const data = JSON.parse(jsonStr);
        if (data['@type'] === 'Event') {
          const time = data.description ? extractTimeFromDescription(data.description) : null;
          const imageUrl = data.image?.url || null;
          return { time, imageUrl };
        }
      } catch {
        // ignore parse errors
      }
    }

    return { time: null, imageUrl: null };
  } catch {
    return { time: null, imageUrl: null };
  }
}

/**
 * Extract image URLs from listing page HTML.
 * Images live in .card__image divs as background-image: url('https://images.getbento.com/...')
 * Returns a Map of href → imageUrl for quick lookup.
 */
function extractListingImages(html) {
  const imageMap = new Map();
  // Match each <li> card block: find the background-image URL and the card__btn href together
  // Pattern: card__image ... background-image: url('URL') ... card__btn href="HREF"
  // Since card__image comes BEFORE card__btn in the DOM, we match them per card <li> block.
  const cardBlockRegex = /<li[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let block;
  while ((block = cardBlockRegex.exec(html)) !== null) {
    const content = block[1];
    const bgMatch = content.match(/background-image:\s*url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/i);
    const hrefMatch = content.match(/class="card__btn"[^>]*href="([^"]*)"/);
    if (bgMatch && hrefMatch) {
      imageMap.set(hrefMatch[1], bgMatch[1]);
    }
  }
  return imageMap;
}

/**
 * Parse event cards from an HTML string (works on both full page and AJAX fragments).
 * Returns array of { href, rawTitle }.
 */
function parseCardsFromHTML(html) {
  const cards = [];

  // Primary regex: <a class="card__btn" href="...">...<h2 class="card__heading">TITLE</h2></a>
  const cardRegex = /<a[^>]*class="card__btn"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<(?:h2|h3|h4)[^>]*class="[^"]*card__heading[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/gi;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    cards.push({ href: match[1], rawTitle: match[2].replace(/<[^>]*>/g, '').trim() });
  }
  if (cards.length > 0) return cards;

  // Fallback 1: separate heading + href matching
  const altRegex = /<(?:h2|h3|h4)[^>]*card__heading[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/gi;
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
  const uniqueHrefs = [...new Set(hrefs)];
  const len = Math.min(headings.length, uniqueHrefs.length);
  for (let i = 0; i < len; i++) {
    cards.push({ href: uniqueHrefs[i], rawTitle: headings[i] });
  }
  if (cards.length > 0) return cards;

  // Fallback 2: aria-label attributes
  const ariaRegex = /<a[^>]*class="card__btn"[^>]*href="([^"]*)"[^>]*aria-label="([^"]*)"/gi;
  while ((m = ariaRegex.exec(html)) !== null) {
    cards.push({ href: m[1], rawTitle: m[2] });
  }
  if (cards.length === 0) {
    const revRegex = /<a[^>]*href="(\/event\/[^"]*)"[^>]*class="card__btn"[^>]*aria-label="([^"]*)"/gi;
    while ((m = revRegex.exec(html)) !== null) {
      cards.push({ href: m[1], rawTitle: m[2] });
    }
  }

  return cards;
}

export async function scrapeAsburyLanes() {
  try {
    // ── Page 1: fetch the full listing page ──
    const res = await fetch(LISTING_URL, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching listing page`);

    const html = await res.text();
    console.log(`[AsburyLanes] Listing page fetched: ${html.length} bytes`);

    const page1Cards = parseCardsFromHTML(html);
    console.log(`[AsburyLanes] Page 1: ${page1Cards.length} cards`);

    if (page1Cards.length === 0) {
      const hasCardBtn = html.includes('card__btn');
      const hasCardHeading = html.includes('card__heading');
      const hasEventHref = html.includes('/event/');
      console.log(`[AsburyLanes] No event cards found. Diagnostics: html=${html.length}b, card__btn=${hasCardBtn}, card__heading=${hasCardHeading}, /event/=${hasEventHref}`);
      return { events: [], error: 'No event cards found' };
    }

    // ── Paginate: BentoBox uses ?p=N with X-Requested-With header ──
    // The "Load More Events" button (paginator__ajax) sends GET /concerts/?p=2
    // with X-Requested-With: XMLHttpRequest. The response is an HTML fragment
    // containing the next batch of <li class="card"> elements.
    // When pages run out, the server wraps around and returns duplicates.
    const seenHrefs = new Set(page1Cards.map(c => c.href));
    const allCards = [...page1Cards];
    const MAX_PAGES = 5; // safety limit to avoid infinite loops

    for (let page = 2; page <= MAX_PAGES; page++) {
      try {
        const pageRes = await fetch(`${LISTING_URL}?p=${page}`, {
          headers: {
            ...BROWSER_HEADERS,
            'X-Requested-With': 'XMLHttpRequest',
          },
          next: { revalidate: 0 },
        });

        if (!pageRes.ok) {
          console.log(`[AsburyLanes] Page ${page}: HTTP ${pageRes.status}, stopping pagination`);
          break;
        }

        const pageHtml = await pageRes.text();
        const pageCards = parseCardsFromHTML(pageHtml);

        if (pageCards.length === 0) {
          console.log(`[AsburyLanes] Page ${page}: 0 cards, stopping pagination`);
          break;
        }

        // Check for duplicates — BentoBox wraps around when pages run out
        const newCards = pageCards.filter(c => !seenHrefs.has(c.href));
        if (newCards.length === 0) {
          console.log(`[AsburyLanes] Page ${page}: all ${pageCards.length} cards are duplicates, stopping pagination`);
          break;
        }

        for (const c of newCards) {
          seenHrefs.add(c.href);
          allCards.push(c);
        }
        console.log(`[AsburyLanes] Page ${page}: ${newCards.length} new cards (${pageCards.length - newCards.length} dupes)`);

      } catch (err) {
        console.log(`[AsburyLanes] Page ${page} fetch error: ${err.message}, stopping pagination`);
        break;
      }
    }

    console.log(`[AsburyLanes] Total unique cards across all pages: ${allCards.length}`);

    // Extract image URLs from all HTML (page 1 full HTML + fragments would need combining,
    // but listing images are best-effort — detail pages are the primary image source)
    const listingImages = extractListingImages(html);

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Filter to future events and extract dates
    const parsedEvents = [];
    for (const ev of allCards) {
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
        listingImageUrl: listingImages.get(ev.href) || null,
      });
    }

    // Fetch detail pages in parallel to get door times + images (limit concurrency to 3)
    const CONCURRENCY = 3;
    const details = new Array(parsedEvents.length).fill({ time: null, imageUrl: null });

    for (let i = 0; i < parsedEvents.length; i += CONCURRENCY) {
      const batch = parsedEvents.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(ev => fetchEventDetails(ev.href))
      );
      for (let j = 0; j < results.length; j++) {
        details[i + j] = results[j];
      }
    }

    // Build final events array
    // Prefer detail page image (from JSON-LD) but fall back to listing page background-image
    const events = parsedEvents.map((ev, idx) => ({
      title: ev.title,
      venue: VENUE,
      date: ev.dateStr,
      time: details[idx].time || '8:00 PM', // default to 8 PM if no time found
      description: null,
      ticket_url: `${BASE_URL}${ev.href}`,
      price: null,
      source_url: LISTING_URL,
      external_id: ev.externalId,
      image_url: details[idx].imageUrl || ev.listingImageUrl,
    }));

    console.log(`[AsburyLanes] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[AsburyLanes] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
