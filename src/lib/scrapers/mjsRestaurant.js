/**
 * MJ's Restaurant Bar & Grill scraper (Vision OCR)
 * Music page: https://www.mjsrestaurant.com/Neptune/live-music/
 *
 * WordPress site — live music schedule is posted as a single monthly JPEG
 * flyer. No structured data, no calendar widget, no API.
 *
 * Image URL pattern (WordPress uploads):
 *   /Neptune/wp-content/uploads/YYYY/MM/MJS-NEPTUNE-LIVE-MUSIC-MONTH-YYYY.jpg
 *   e.g. .../2026/03/MJS-NEPTUNE-LIVE-MUSIC-MARCH-2026.jpg
 *
 * This scraper:
 *   1. Fetches the live music page HTML
 *   2. Finds the largest content image (the flyer)
 *   3. Sends the image URL to Perplexity Sonar for OCR extraction
 *   4. Returns structured events in the standard scraper format
 *
 * The existing sync pipeline handles the rest:
 *   - mapEvent() creates event rows with artist_name
 *   - Phase 0 enrichment seeds the artists table (no bio/image from this scraper)
 *   - Phase 2 Last.fm enrichment tries to find official bios/images
 *
 * Address: 3205 Rt 66, Neptune, NJ 07753
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = "MJ's Restaurant Bar & Grill";
const PAGE_URL = 'https://www.mjsrestaurant.com/Neptune/live-music/';
const ADDRESS = '3205 Rt 66, Neptune, NJ 07753';

/**
 * Months array for URL pattern matching
 */
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/**
 * Find the flyer image URL from the page HTML.
 * Strategy 1: Look for the predictable WordPress upload URL pattern
 * Strategy 2: Find the largest image that isn't a logo/icon
 */
function findFlyerUrl(html) {
  // Strategy 1: Match the known naming pattern
  // e.g. /Neptune/wp-content/uploads/2026/03/MJS-NEPTUNE-LIVE-MUSIC-MARCH-2026.jpg
  const patternMatch = html.match(
    /https?:\/\/[^"'\s]*wp-content\/uploads\/\d{4}\/\d{2}\/MJS[^"'\s]*LIVE-MUSIC[^"'\s]*\.(?:jpg|jpeg|png)/i
  );
  if (patternMatch) return patternMatch[0];

  // Strategy 2: Find large content images (likely a flyer)
  // Look for img tags with src containing wp-content/uploads and large dimensions
  const imgMatches = [...html.matchAll(/<img[^>]*src="(https?:\/\/[^"]*wp-content\/uploads\/[^"]*\.(?:jpg|jpeg|png))"[^>]*/gi)];

  // Filter out small images (logos, icons)
  for (const match of imgMatches) {
    const src = match[1];
    // Skip known non-flyer images
    if (src.includes('logo') || src.includes('facebook') || src.includes('twiter') || src.includes('icon')) continue;
    return src;
  }

  return null;
}

export async function scrapeMjsRestaurant() {
  try {
    // Fetch the live music page
    const res = await fetch(PAGE_URL, { next: { revalidate: 0 } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching MJ's live music page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn("[MjsRestaurant] No flyer image found on page");
      return { events: [], error: 'No flyer image found' };
    }

    console.log(`[MjsRestaurant] Found flyer: ${flyerUrl}`);

    // Send to Perplexity Sonar for OCR extraction
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[MjsRestaurant] Perplexity extracted ${extracted.length} events`);

    // Convert to standard scraper output format
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const events = extracted
      .filter(e => e.date && e.date >= todayStr)
      .map(e => ({
        title: e.artist,
        venue: VENUE,
        date: e.date,
        time: e.time || null,
        description: null, // No bios from OCR — Last.fm handles this
        ticket_url: null,
        price: null,
        source_url: PAGE_URL,
        external_id: `mjs-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null, // No per-event images from a single flyer
      }));

    console.log(`[MjsRestaurant] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error("[MjsRestaurant] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
