/**
 * Palmetto Southern Kitchen + Bar scraper (Vision OCR)
 * Music page: https://www.palmettoasburypark.com/music
 *
 * Squarespace site — the music schedule is posted as an IMAGE POSTER only.
 * There is no structured data, no calendar embed, no events feed.
 *
 * ── PREVIOUS APPROACH ──
 * This scraper used a hardcoded MONTHLY_EVENTS array that required manual
 * updates each month. When the schedule went stale (SCHEDULE_MONTH was in
 * the past), ALL events were filtered out by the date check → 0 events.
 *
 * ── CURRENT APPROACH (Vision OCR) ──
 * Fetches the /music page, locates the poster image, and sends it to
 * Gemini 2.5 Flash for OCR extraction — same pipeline as MJ's, Pagano's,
 * Captain's Inn, and Charley's Ocean Grill.
 *
 * If it breaks:
 *   1. Go to https://www.palmettoasburypark.com/music
 *   2. Right-click the poster image → Copy Image Address
 *   3. Check if the URL still contains images.squarespace-cdn.com
 *   4. If the poster structure changed, update findFlyerUrl() below
 *
 * Address: 1000 Ocean Ave N, Asbury Park, NJ 07712
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = 'Palmetto';
const PAGE_URL = 'https://www.palmettoasburypark.com/music';

/**
 * Month names for matching poster images by month context.
 */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Find the music poster image URL from the Squarespace page HTML.
 *
 * Squarespace image hosting patterns:
 *   - images.squarespace-cdn.com/content/v1/SITE_ID/HASH/image.jpg
 *   - Sometimes served via data-src for lazy loading
 *   - Often include ?format=WxH query params
 *
 * Strategy 1: Image whose URL or context mentions "music" or the month.
 * Strategy 2: Any large Squarespace CDN image that isn't a logo.
 * Strategy 3: Fallback to any large non-logo image.
 */
function findFlyerUrl(html) {
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];

  // Collect all image URLs from src, data-src, and data-image attributes
  const allImageRefs = [
    ...html.matchAll(/(?:src|data-src|data-image)="(https?:\/\/images\.squarespace-cdn\.com\/content\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    ...html.matchAll(/data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    ...html.matchAll(/src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
  ];

  // Deduplicate by base URL (before query params)
  const seen = new Set();
  const urls = [];
  for (const m of allImageRefs) {
    const base = m[1].split('?')[0];
    if (!seen.has(base)) {
      seen.add(base);
      urls.push(m[1]);
    }
  }

  // Strategy 1: Image whose URL mentions music, schedule, or the month name
  for (const url of urls) {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (decoded.includes('music') || decoded.includes('live') || decoded.includes('schedule') || decoded.includes(currentMonth)) {
      console.log(`[Palmetto] Context-match flyer: ${url}`);
      return url;
    }
  }

  // Also check surrounding HTML context near each image
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social')) continue;

    const idx = html.indexOf(url);
    if (idx !== -1) {
      const context = html.slice(Math.max(0, idx - 300), idx + url.length + 300).toLowerCase();
      if (context.includes('music') || context.includes('live') || context.includes('entertainment') || context.includes(currentMonth)) {
        console.log(`[Palmetto] Nearby-context flyer: ${url}`);
        return url;
      }
    }
  }

  // Strategy 2: Any Squarespace CDN image that isn't a logo
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social')) continue;
    if (lower.includes('squarespace-cdn.com')) {
      console.log(`[Palmetto] Squarespace CDN fallback: ${url}`);
      return url;
    }
  }

  // Strategy 3: Any non-logo image (last resort)
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social')) continue;
    console.log(`[Palmetto] Generic fallback: ${url}`);
    return url;
  }

  return null;
}

export async function scrapePalmetto() {
  try {
    // Fetch the music page directly
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Palmetto music page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn('[Palmetto] No flyer image found on page');
      return { events: [], error: 'No flyer image found — poster may have moved or site structure changed' };
    }

    console.log(`[Palmetto] Found flyer: ${flyerUrl}`);

    // Send to Gemini 2.5 Flash for OCR extraction
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[Palmetto] Gemini extracted ${extracted.length} events`);

    // Convert to standard scraper output format
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const events = extracted
      .filter(e => e.date && e.date >= todayStr)
      .map(e => ({
        title: e.artist,
        venue: VENUE,
        date: e.date,
        time: e.time || null,
        description: null,
        ticket_url: null,
        price: null,
        source_url: PAGE_URL,
        external_id: `palmetto-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[Palmetto] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[Palmetto] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
