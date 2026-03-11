/**
 * Bakes Brewing Co Scraper
 * URL: https://www.bakesbrewing.co/events
 *
 * Webflow CMS site. Events are server-rendered in a dynamic list
 * (.w-dyn-items > .w-dyn-item). Each item has:
 *   .text-block-12  → date ("March 13, 2026")
 *   .start-time     → start time ("6:00pm")
 *   .heading-11     → title ("LIVE MUSIC: Quincy Mumford")
 *   .rich-text-block-3 → description
 *   .text-block-14  → price ("Free")
 *   img             → event image
 *   a.link-block    → detail page link (slug for external_id)
 *
 * Filters to LIVE MUSIC events only (title starts with "LIVE MUSIC").
 * Also includes COMEDY SHOW events for completeness.
 *
 * If it breaks:
 *   1. Go to bakesbrewing.co/events
 *   2. Check if class names or structure have changed
 *   3. Update selectors below
 */

const EVENTS_URL = 'https://www.bakesbrewing.co/events';
const VENUE = 'Bakes Brewing';
const BASE_URL = 'https://www.bakesbrewing.co';

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

/**
 * Parse "March 13, 2026" → "2026-03-13"
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = m[2].padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

/**
 * Normalize time strings like "6:00pm", "05:00 pm", "6:00 PM" → "6:00 PM"
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  const hour = parseInt(m[1]);
  const min = m[2];
  const period = m[3].toUpperCase();
  return `${hour}:${min} ${period}`;
}

/**
 * Check if a title indicates a live music or entertainment event
 */
function isMusicEvent(title) {
  if (!title) return false;
  const t = title.toUpperCase();
  return t.startsWith('LIVE MUSIC') || t.startsWith('COMEDY SHOW');
}

/**
 * Extract event data from the Webflow HTML
 */
function parseEvents(html) {
  const events = [];
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Webflow wraps each collection item in <div role="listitem" class="... w-dyn-item">
  // Split on role="listitem" to isolate each event block
  const parts = html.split(/role="listitem"/);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    // Title from heading-11
    const titleMatch = block.match(/<h1[^>]*class="heading-11"[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // Only live music / comedy events
    if (!isMusicEvent(title)) continue;

    // Date from text-block-12
    const dateMatch = block.match(/class="text-block-12"[^>]*>([\s\S]*?)<\/div>/i);
    const rawDate = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : null;
    const date = parseDate(rawDate);
    if (!date || date < todayET) continue;

    // Start time from start-time class
    const timeMatch = block.match(/class="start-time"[^>]*>([\s\S]*?)<\/div>/i);
    const rawTime = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, '').trim() : null;
    const time = normalizeTime(rawTime);

    // Slug from link-block href for external_id
    const slugMatch = block.match(/href="(\/events\/[^"]+)"/i);
    const slug = slugMatch ? slugMatch[1].replace('/events/', '') : null;

    // Image URL
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // Description from rich-text-block-3
    const descMatch = block.match(/class="rich-text-block-3[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, '').trim()
      : null;

    // Price from text-block-14 (inside price-container)
    const priceMatch = block.match(/class="text-block-14"[^>]*>([\s\S]*?)<\/div>/i);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // Clean the title: strip "LIVE MUSIC: " / "LIVE MUSIC - " prefix for artist name
    let artistName = title;
    artistName = artistName.replace(/^LIVE\s+MUSIC\s*[:\-–—]\s*/i, '').trim();
    artistName = artistName.replace(/^COMEDY\s+SHOW\s*[:\-–—]\s*/i, '').trim();

    const externalId = `bakesbrew-${slug || date + '-' + artistName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    events.push({
      title: artistName,
      venue: VENUE,
      date,
      time,
      description: description || null,
      ticket_url: slug ? `${BASE_URL}/events/${slug}` : EVENTS_URL,
      price: price || null,
      source_url: EVENTS_URL,
      image_url: imageUrl || null,
      external_id: externalId,
    });
  }

  // Deduplicate by external_id
  const seen = new Set();
  return events.filter(ev => {
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });
}

export async function scrapeBakesBrewing() {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Bakes Brewing events`);

    const html = await res.text();
    const events = parseEvents(html);

    console.log(`[BakesBrewing] Found ${events.length} upcoming live music events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BakesBrewing] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
