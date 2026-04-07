/**
 * 10th Ave Burrito scraper (Vision OCR)
 * Events page: https://tenthaveburrito.com/events/
 *
 * WordPress + Elementor site — the live music schedule is posted as an
 * IMAGE POSTER on the events page. The old JetEngine calendar widget
 * approach broke repeatedly due to widget ID changes and HTML structure
 * shifts.
 *
 * ── PREVIOUS APPROACH ──
 * POST to JetEngine calendar endpoint with widget settings → parse
 * calendar HTML cells. Broke when widget IDs changed or Elementor updated.
 *
 * ── CURRENT APPROACH (Vision OCR) ──
 * Fetches the events page, locates the music poster/schedule image, and
 * sends it to Gemini 2.5 Flash for OCR extraction — same pipeline as
 * Eventide Grille, Palmetto, MJ's, Captain's Inn, etc.
 *
 * If it breaks:
 *   1. Go to https://tenthaveburrito.com/events/
 *   2. Right-click the music schedule poster → Copy Image Address
 *   3. Check if the URL pattern is still wp-content/uploads/...
 *   4. If the poster location changed, update findFlyerUrl() below
 *
 * Address: 10th Avenue, Belmar, NJ
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = '10th Ave Burrito';
const PAGE_URL = 'https://tenthaveburrito.com/events/';

/**
 * Month names for matching poster images by month context.
 */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Find the music poster/schedule image URL from the WordPress events page.
 *
 * WordPress image hosting patterns:
 *   - /wp-content/uploads/YYYY/MM/filename.jpg
 *   - Sometimes served via Elementor background or data-src for lazy loading
 *   - CDN variants: i0.wp.com, cdn.tenthaveburrito.com, etc.
 *
 * Strategy 1: Image whose URL or surrounding context mentions "music",
 *             "schedule", "events", "live", "calendar", or the current month.
 * Strategy 2: Any WordPress uploads image that isn't a logo/icon.
 * Strategy 3: Any non-logo content image on the page.
 */
function findFlyerUrl(html) {
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];

  // Collect all image URLs from src, data-src, data-lazy-src, data-bg, and srcset
  const allImageRefs = [
    // WordPress uploads
    ...html.matchAll(/(?:src|data-src|data-lazy-src|data-bg)="(https?:\/\/[^"]*\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    // Generic image src/data-src
    ...html.matchAll(/(?:src|data-src|data-lazy-src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    // Elementor background images in inline styles
    ...html.matchAll(/background-image:\s*url\(['"]?(https?:\/\/[^'")\s]+\.(?:jpg|jpeg|png|webp))[^'")\s]*/gi),
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

  // Strategy 1: Image whose URL mentions music, schedule, events, live, or current month
  for (const url of urls) {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (
      decoded.includes('music') || decoded.includes('schedule') ||
      decoded.includes('live') || decoded.includes('calendar') ||
      decoded.includes('lineup') || decoded.includes('flyer') ||
      decoded.includes('poster') || decoded.includes(currentMonth)
    ) {
      console.log(`[10thAveBurrito] URL-match flyer: ${url}`);
      return url;
    }
  }

  // Strategy 1b: Check surrounding HTML context (~500 chars) for music-related terms
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar')) continue;

    const idx = html.indexOf(url);
    if (idx !== -1) {
      const context = html.slice(Math.max(0, idx - 400), idx + url.length + 400).toLowerCase();
      if (
        context.includes('music') || context.includes('live') ||
        context.includes('entertainment') || context.includes('schedule') ||
        context.includes('lineup') || context.includes(currentMonth)
      ) {
        console.log(`[10thAveBurrito] Context-match flyer: ${url}`);
        return url;
      }
    }
  }

  // Strategy 2: Any WordPress uploads image that isn't a logo/icon/thumbnail
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar')) continue;
    // Skip tiny thumbnails (WordPress generates -NNxNN suffix)
    if (/-\d{2,3}x\d{2,3}\./.test(lower)) continue;
    if (lower.includes('/wp-content/uploads/')) {
      console.log(`[10thAveBurrito] WP uploads fallback: ${url}`);
      return url;
    }
  }

  // Strategy 3: Any non-logo content image
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar')) continue;
    if (/-\d{2,3}x\d{2,3}\./.test(lower)) continue;
    console.log(`[10thAveBurrito] Generic fallback: ${url}`);
    return url;
  }

  return null;
}

export async function scrapeTenthAveBurrito() {
  try {
    // Fetch the events page
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching 10th Ave Burrito events page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn('[10thAveBurrito] No flyer image found on page');
      return { events: [], error: 'No flyer image found — poster may have moved or site structure changed' };
    }

    console.log(`[10thAveBurrito] Found flyer: ${flyerUrl}`);

    // Send to Gemini 2.5 Flash for OCR extraction
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[10thAveBurrito] Gemini extracted ${extracted.length} events`);

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
        ticket_url: PAGE_URL,
        price: null,
        source_url: PAGE_URL,
        external_id: `10thaveburrito-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[10thAveBurrito] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[10thAveBurrito] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
