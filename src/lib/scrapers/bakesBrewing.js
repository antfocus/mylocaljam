/**
 * Bakes Brewing Co scraper (Vision OCR)
 * URL: https://www.bakesbrewing.co/events
 *
 * Webflow CMS site — the live music schedule is posted as IMAGE POSTERS
 * on the events page. The old Webflow dynamic-list approach returned 0
 * events when the CMS structure changed or the dynamic list was emptied.
 *
 * ── PREVIOUS APPROACH ──
 * Parsed Webflow w-dyn-items / role="listitem" HTML blocks for
 * headings, dates, and times. Broke when CMS was emptied or class
 * names changed.
 *
 * ── CURRENT APPROACH (Vision OCR) ──
 * Fetches the events page, locates the music poster/schedule image, and
 * sends it to Gemini 2.5 Flash for OCR extraction — same pipeline as
 * Eventide Grille, 10th Ave Burrito, Palmetto, MJ's, etc.
 *
 * If it breaks:
 *   1. Go to https://www.bakesbrewing.co/events
 *   2. Right-click the music schedule poster → Copy Image Address
 *   3. Check if the URL pattern is still uploads-ssl.webflow.com/...
 *   4. If the poster location changed, update findFlyerUrl() below
 *
 * Address: Bakes Brewing, Belmar, NJ
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = 'Bakes Brewing';
const PAGE_URL = 'https://www.bakesbrewing.co/events';

/**
 * Month names for matching poster images by month context.
 */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Find the music poster/schedule image URL from the Webflow events page.
 *
 * Webflow image hosting patterns:
 *   - uploads-ssl.webflow.com/SITE_ID/HASH_filename.jpg
 *   - assets-global.website-files.com/SITE_ID/HASH_filename.jpg
 *   - cdn.prod.website-files.com/SITE_ID/HASH_filename.jpg
 *   - Sometimes served via data-src for lazy loading
 *
 * Strategy 1: Image whose URL or surrounding context mentions "music",
 *             "schedule", "events", "live", or the current month.
 * Strategy 2: Any Webflow-hosted image that isn't a logo/icon.
 * Strategy 3: Any non-logo content image on the page.
 */
function findFlyerUrl(html) {
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];

  // Collect all image URLs from src, data-src, srcset, and background-image
  const allImageRefs = [
    // Webflow CDN images
    ...html.matchAll(/(?:src|data-src|srcset)="(https?:\/\/(?:uploads-ssl\.webflow\.com|assets-global\.website-files\.com|cdn\.prod\.website-files\.com)\/[^"\s]+\.(?:jpg|jpeg|png|webp))[^"\s]*/gi),
    // Generic image src/data-src
    ...html.matchAll(/(?:src|data-src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    // Background images in inline styles
    ...html.matchAll(/background-image:\s*url\(['"]?(https?:\/\/[^'")\s]+\.(?:jpg|jpeg|png|webp))[^'")\s]*/gi),
  ];

  // Deduplicate by base URL (before query params / srcset width descriptors)
  const seen = new Set();
  const urls = [];
  for (const m of allImageRefs) {
    const base = m[1].split('?')[0].split(' ')[0]; // strip ?params and srcset descriptors
    if (!seen.has(base)) {
      seen.add(base);
      urls.push(m[1].split(' ')[0]); // keep the clean URL
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
      console.log(`[BakesBrewing] URL-match flyer: ${url}`);
      return url;
    }
  }

  // Strategy 1b: Check surrounding HTML context for music-related terms
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar') || lower.includes('brand')) continue;

    const idx = html.indexOf(url);
    if (idx !== -1) {
      const context = html.slice(Math.max(0, idx - 400), idx + url.length + 400).toLowerCase();
      if (
        context.includes('music') || context.includes('live') ||
        context.includes('entertainment') || context.includes('schedule') ||
        context.includes('lineup') || context.includes(currentMonth)
      ) {
        console.log(`[BakesBrewing] Context-match flyer: ${url}`);
        return url;
      }
    }
  }

  // Strategy 2: Any Webflow CDN image that isn't a logo/icon
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar') || lower.includes('brand')) continue;
    if (lower.includes('webflow.com') || lower.includes('website-files.com')) {
      console.log(`[BakesBrewing] Webflow CDN fallback: ${url}`);
      return url;
    }
  }

  // Strategy 3: Any non-logo content image
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('social') || lower.includes('avatar') || lower.includes('brand')) continue;
    console.log(`[BakesBrewing] Generic fallback: ${url}`);
    return url;
  }

  return null;
}

export async function scrapeBakesBrewing() {
  try {
    // Fetch the events page
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Bakes Brewing events page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn('[BakesBrewing] No flyer image found on page');
      return { events: [], error: 'No flyer image found — poster may have moved or site structure changed' };
    }

    console.log(`[BakesBrewing] Found flyer: ${flyerUrl}`);

    // Send to Gemini 2.5 Flash for OCR extraction
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[BakesBrewing] Gemini extracted ${extracted.length} events`);

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
        external_id: `bakesbrew-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[BakesBrewing] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BakesBrewing] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
