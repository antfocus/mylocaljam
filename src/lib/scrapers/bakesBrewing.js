/**
 * Bakes Brewing Co scraper (HTML text parsing)
 * URL: https://www.bakesbrewing.com/events
 *
 * Webflow CMS site — events are rendered as structured HTML blocks
 * with consistent CSS classes for date, time, title, description, and price.
 *
 * ── DOM STRUCTURE (as of April 2026) ──
 * div.event-info-container
 *   div.event-time
 *     div.text-block-12    → date ("April 23, 2026")
 *     div.start-time       → start time ("6:30pm")
 *     (last child div)     → end time ("8:30pm")
 *   a.link-block (href="/events/...")
 *     h1.heading-11        → event title
 *   div.rich-text-block-3  → description (may contain <p> tags)
 *   div.price-container
 *     div.text-block-14    → price value ("Free", "$50", etc.)
 *
 * ── PREVIOUS APPROACH (Vision OCR) ──
 * Used Gemini 2.5 Flash to OCR image posters. The site migrated from
 * image-based posters to structured HTML text, so OCR is no longer needed.
 *
 * If it breaks:
 *   1. Go to https://www.bakesbrewing.com/events
 *   2. Right-click an event → Inspect to check CSS class names
 *   3. Look for .event-info-container, .text-block-12, .start-time,
 *      .heading-11, .text-block-14
 *   4. If class names changed, update the regex patterns below
 *
 * Address: Bakes Brewing, Wall, NJ
 */

const VENUE = 'Bakes Brewing';
const PAGE_URL = 'https://www.bakesbrewing.com/events';

/**
 * Month name → 0-indexed month number.
 */
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse a date string like "April 25, 2026" into "2026-04-25".
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.trim().match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalise a time string like "6:30pm" → "6:30 PM".
 */
function normaliseTime(raw) {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  const m = t.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/);
  if (!m) return null;

  const hour = m[1];
  const mins = m[2] || '00';
  const ampm = m[3].toUpperCase();
  return `${hour}:${mins} ${ampm}`;
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract all event blocks from the HTML using the Webflow class structure.
 *
 * Each event lives inside a <div class="event-info-container"> with child
 * elements for date, time, title, description, and price.
 */
function extractEvents(html) {
  const events = [];

  // Split HTML on event-info-container boundaries
  const blocks = html.split(/class="event-info-container"/);

  // First element is everything before the first event — skip it
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // ── Date ──
    const dateMatch = block.match(/class="text-block-12"[^>]*>([\s\S]*?)<\/div>/);
    const dateStr = dateMatch ? stripHtml(dateMatch[1]) : null;
    const date = parseDate(dateStr);

    // ── Start time ──
    const startMatch = block.match(/class="start-time"[^>]*>([\s\S]*?)<\/div>/);
    const startTime = startMatch ? normaliseTime(stripHtml(startMatch[1])) : null;

    // ── End time — last div inside event-time, after the dash ──
    const endMatch = block.match(/class="dash"[^>]*>[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/);
    const endTime = endMatch ? normaliseTime(stripHtml(endMatch[1])) : null;

    // ── Title ──
    const titleMatch = block.match(/class="heading-11"[^>]*>([\s\S]*?)<\/h1>/);
    const title = titleMatch ? stripHtml(titleMatch[1]) : null;

    // ── Detail page link ──
    const linkMatch = block.match(/href="(\/events\/[^"]+)"/);
    const detailPath = linkMatch ? linkMatch[1] : null;

    // ── Description ──
    const descMatch = block.match(/class="rich-text-block-3[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const description = descMatch ? stripHtml(descMatch[1]) : null;

    // ── Price ──
    const priceMatch = block.match(/class="text-block-14"[^>]*>([\s\S]*?)<\/div>/);
    const price = priceMatch ? stripHtml(priceMatch[1]) : null;

    // ── Image — lives in sibling .event-image-container after the info container ──
    const imgMatch = block.match(/class="event-image-container"[\s\S]*?<img[^>]+src="([^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    if (!title || !date) continue;

    // Build combined time string
    let time = startTime;
    if (startTime && endTime) {
      time = `${startTime} - ${endTime}`;
    }

    events.push({ title, date, time, description, price, detailPath, imageUrl });
  }

  return events;
}

export async function scrapeBakesBrewing() {
  try {
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Bakes Brewing events page`);
    }

    const html = await res.text();
    const extracted = extractEvents(html);

    console.log(`[BakesBrewing] Parsed ${extracted.length} events from HTML`);

    // Filter to upcoming events only
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const events = extracted
      .filter(e => e.date >= todayStr)
      .map(e => ({
        title: e.title,
        venue: VENUE,
        date: e.date,
        time: e.time || null,
        description: e.description || null,
        ticket_url: e.detailPath ? `https://www.bakesbrewing.com${e.detailPath}` : PAGE_URL,
        price: e.price || null,
        source_url: PAGE_URL,
        external_id: `bakesbrew-${e.date}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: e.imageUrl || null,
      }));

    console.log(`[BakesBrewing] ${events.length} upcoming events after date filter`);
    return { events, error: null };

  } catch (err) {
    console.error('[BakesBrewing] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
