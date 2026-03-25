/**
 * Pagano's UVA Ristorante scraper (Vision OCR)
 * Music page: https://www.uvaonmain.com/live-music/
 *
 * WordPress/Divi site — live music schedule is posted as a monthly JPEG poster.
 * No structured data, no calendar widget, no API.
 *
 * Image URL pattern:
 *   https://www.uvaonmain.com/wp-content/uploads/music_YYYYMM.jpg
 *   e.g. .../music_202603.jpg
 *
 * This scraper:
 *   1. Fetches the live music page HTML
 *   2. Finds the music poster image (predictable naming pattern)
 *   3. Sends the image URL to Perplexity Sonar for OCR extraction
 *   4. Returns structured events in the standard scraper format
 *
 * Address: 800 Main St, Bradley Beach, NJ 07720
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = "Pagano's UVA Ristorante";
const PAGE_URL = 'https://www.uvaonmain.com/live-music/';

/**
 * Find the flyer image URL from the page HTML.
 * Strategy 1: Match the known `music_YYYYMM.jpg` naming pattern
 * Strategy 2: Find any large wp-content image that isn't a logo
 */
function findFlyerUrl(html) {
  // Strategy 1: Match the predictable naming pattern
  const patternMatch = html.match(
    /https?:\/\/[^"'\s]*\/music_\d{6}\.(?:jpg|jpeg|png)/i
  );
  if (patternMatch) return patternMatch[0];

  // Strategy 2: Find large content images in wp-content/uploads
  const imgMatches = [...html.matchAll(/<img[^>]*src="(https?:\/\/[^"]*wp-content\/uploads\/[^"]*\.(?:jpg|jpeg|png))"[^>]*/gi)];

  for (const match of imgMatches) {
    const src = match[1];
    if (src.includes('logo')) continue;
    return src;
  }

  return null;
}

export async function scrapePaganosUva() {
  try {
    const res = await fetch(PAGE_URL, { next: { revalidate: 0 } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Pagano's live music page`);
    }

    const html = await res.text();
    const flyerUrl = findFlyerUrl(html);

    if (!flyerUrl) {
      console.warn("[PaganosUva] No flyer image found on page");
      return { events: [], error: 'No flyer image found' };
    }

    console.log(`[PaganosUva] Found flyer: ${flyerUrl}`);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[PaganosUva] Perplexity extracted ${extracted.length} events`);

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
        external_id: `paganos-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[PaganosUva] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error("[PaganosUva] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
