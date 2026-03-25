/**
 * Captain's Inn scraper (Vision OCR)
 * Calendar page: https://www.captainsinnnj.com/calendar
 *
 * Wix site — monthly event schedule posted as a single PNG flyer.
 * No structured data, no calendar widget, no API.
 *
 * Image naming pattern (Wix static media):
 *   The flyer filename contains the month name, e.g. "MARCH 2026 NEW.png"
 *   Hosted on Wix static media CDN. We find the largest non-logo image.
 *
 * This scraper:
 *   1. Fetches the calendar page HTML
 *   2. Finds the flyer image (largest non-logo image)
 *   3. Sends the image to Gemini 2.5 Flash for OCR extraction
 *   4. Returns structured events in the standard scraper format
 *
 * Address: 304 E. Lacey Rd, Forked River, NJ 08731
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = "Captain's Inn";
const PAGE_URL = 'https://www.captainsinnnj.com/calendar';

/**
 * Current month name for flyer matching.
 */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Find the flyer image URL from the page HTML.
 * On Wix, images are served from static.wixstatic.com with long hashes.
 *
 * Wix SSR quirks:
 *   - Images may use data-src or data-pin-media instead of src (lazy loading)
 *   - Stripping query params can break Wix image URLs — keep them intact
 *   - The flyer filename usually contains the month name (e.g. "MARCH 2026 NEW.png")
 */
function findFlyerUrl(html) {
  const now = new Date();
  const currentMonth = MONTH_NAMES[now.getMonth()];

  // Collect ALL image-like URLs (src, data-src, data-pin-media, href)
  const allImageRefs = [
    ...html.matchAll(/(?:src|data-src|data-pin-media|href)="(https?:\/\/[^"]*static\.wixstatic\.com\/media\/[^"]+)"/gi),
    ...html.matchAll(/(?:src|data-src|data-pin-media)="(https?:\/\/[^"]*wix[^"]*\/media\/[^"]+\.(?:png|jpg|jpeg|webp))[^"]*"/gi),
    ...html.matchAll(/(?:src|data-src)="(https?:\/\/[^"]+\.(?:png|jpg|jpeg|webp))"/gi),
  ];

  const urls = allImageRefs.map(m => m[1]);

  // Strategy 1: Prefer an image whose URL or decoded URL contains the current month name
  for (const url of urls) {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (decoded.includes(currentMonth)) {
      console.log(`[CaptainsInn] Month-match flyer: ${url}`);
      return url;
    }
  }

  // Strategy 2: Any Wix static media image that isn't a logo/icon
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (lower.includes('logo')) continue;
    if (lower.includes('favicon')) continue;
    if (lower.includes('icon')) continue;
    if (lower.includes('social')) continue;
    if (lower.includes('button')) continue;
    // Keep full URL including query params — Wix needs them for rendering
    return url;
  }

  // Strategy 3: Look in background-image CSS
  const bgImg = html.match(/background-image:\s*url\(['"]?(https?:\/\/[^'")\s]+\.(?:png|jpg|jpeg|webp))['"]?\)/i);
  if (bgImg) return bgImg[1];

  // Strategy 4: Any large image (width/height >= 500)
  const anyImg = html.match(/(?:src|data-src)="(https?:\/\/[^"]+\.(?:png|jpg|jpeg))"[^>]*(?:width|height)="[5-9]\d{2,}/i);
  if (anyImg) return anyImg[1];

  return null;
}

export async function scrapeCaptainsInn() {
  try {
    const res = await fetch(PAGE_URL, { next: { revalidate: 0 } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Captain's Inn calendar page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn("[CaptainsInn] No flyer image found on page");
      return { events: [], error: 'No flyer image found' };
    }

    console.log(`[CaptainsInn] Found flyer: ${flyerUrl}`);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[CaptainsInn] Gemini extracted ${extracted.length} events`);

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
        external_id: `captains-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[CaptainsInn] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error("[CaptainsInn] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
