/**
 * Charley's Ocean Bar & Grill scraper (Vision OCR)
 * Events page: https://www.charleysoceangrill.com/events.php
 *
 * The events.php page is a thin shell that loads content via JavaScript
 * from the WordPress JSON API at charleys.prime-cms.net. A plain fetch()
 * returns minimal HTML — the music lineup images are in the WP API response.
 *
 * Image naming pattern:
 *   music-lineup-MM-YYYY.png  (e.g. music-lineup-03-2026.png)
 *   Hosted via WordPress CMS at charleys.prime-cms.net
 *
 * This scraper:
 *   1. Fetches the WP JSON API directly (where the content actually lives)
 *   2. Falls back to the events page HTML if API fails
 *   3. Finds the music lineup image (pattern: music-lineup-*.png)
 *   4. Sends the image to Gemini 2.5 Flash for OCR extraction
 *   5. Returns structured events in the standard scraper format
 *
 * Address: 25 Ocean Ave N, Long Branch, NJ 07740
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = "Charley's Ocean Bar & Grill";
const PAGE_URL = 'https://www.charleysoceangrill.com/events.php';

/**
 * WordPress JSON API endpoints for the events page content.
 * The static site fetches from these endpoints via JavaScript.
 */
const WP_API_URLS = [
  'https://charleys.prime-cms.net/wp-json/wp/v2/pages/73',
  'https://charleys.prime-cms.net/wp-json/wp/v2/pages?slug=events',
];

/**
 * Find image URLs matching the music lineup pattern in any text content.
 */
function findFlyerInContent(content) {
  if (!content) return null;

  // Strategy 1: Known naming pattern — music-lineup-MM-YYYY.png
  const patternMatch = content.match(
    /https?:\/\/[^"'\s<>]*music-lineup[^"'\s<>]*\.(?:png|jpg|jpeg)/i
  );
  if (patternMatch) {
    console.log(`[CharleysOcean] Strategy 1 match: ${patternMatch[0]}`);
    return patternMatch[0];
  }

  // Strategy 2: Any image with music/lineup/schedule/entertainment in the name
  const musicImg = content.match(
    /https?:\/\/[^"'\s<>]*(?:music|lineup|schedule|entertainment)[^"'\s<>]*\.(?:png|jpg|jpeg)/i
  );
  if (musicImg) {
    console.log(`[CharleysOcean] Strategy 2 match: ${musicImg[0]}`);
    return musicImg[0];
  }

  // Strategy 3: Any image from prime-cms domain
  const wpImg = content.match(
    /https?:\/\/[^"'\s<>]*prime-cms[^"'\s<>]*\.(?:png|jpg|jpeg)/i
  );
  if (wpImg) {
    console.log(`[CharleysOcean] Strategy 3 match: ${wpImg[0]}`);
    return wpImg[0];
  }

  // Log a snippet of what we received for debugging
  const snippet = content.substring(0, 500);
  console.log(`[CharleysOcean] No image found in content. Snippet: ${snippet}`);

  return null;
}

/**
 * Fetch the WordPress JSON API to get the rendered events page content,
 * then extract the flyer image URL from it.
 */
async function findFlyerFromWpApi() {
  for (const apiUrl of WP_API_URLS) {
    try {
      console.log(`[CharleysOcean] Trying WP API: ${apiUrl}`);
      const res = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        console.warn(`[CharleysOcean] WP API ${res.status} from ${apiUrl}`);
        continue;
      }

      const data = await res.json();

      // Single page response (pages/73)
      if (data?.content?.rendered) {
        const url = findFlyerInContent(data.content.rendered);
        if (url) return url;
      }

      // Array response (pages?slug=events)
      if (Array.isArray(data)) {
        for (const page of data) {
          const url = findFlyerInContent(page?.content?.rendered);
          if (url) return url;
        }
      }
    } catch (err) {
      console.warn(`[CharleysOcean] WP API error: ${err.message}`);
    }
  }

  return null;
}

/**
 * Fallback: try to construct the image URL from the predictable naming pattern.
 * Pattern: https://charleys.prime-cms.net/wp-content/uploads/YYYY/MM/music-lineup-MM-YYYY.png
 */
function buildPredictedFlyerUrl() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `https://charleys.prime-cms.net/wp-content/uploads/${year}/${month}/music-lineup-${month}-${year}.png`;
}

export async function scrapeCharleysOceanGrill() {
  try {
    // Primary: fetch the WP JSON API directly (where the images actually live)
    let flyerUrl = await findFlyerFromWpApi();

    // Fallback 1: try the events page HTML in case it has inline images
    if (!flyerUrl) {
      console.log('[CharleysOcean] WP API had no flyer, trying page HTML...');
      const res = await fetch(PAGE_URL, { next: { revalidate: 0 } });
      if (res.ok) {
        const html = await res.text();
        flyerUrl = findFlyerInContent(html);
      }
    }

    // Fallback 2: try the predicted URL pattern directly (HEAD request)
    if (!flyerUrl) {
      const predicted = buildPredictedFlyerUrl();
      console.log(`[CharleysOcean] Trying predicted URL: ${predicted}`);
      try {
        const headRes = await fetch(predicted, { method: 'HEAD' });
        if (headRes.ok) {
          flyerUrl = predicted;
        }
      } catch (_) { /* predicted URL doesn't exist */ }
    }

    if (!flyerUrl) {
      console.warn("[CharleysOcean] No music lineup image found");
      return { events: [], error: 'No flyer image found' };
    }

    // Clean up HTML entities that WordPress may have injected
    flyerUrl = flyerUrl.replace(/&amp;/g, '&').replace(/&#038;/g, '&');
    console.log(`[CharleysOcean] Found flyer: ${flyerUrl}`);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year,
      month,
    });

    console.log(`[CharleysOcean] Gemini raw extraction: ${JSON.stringify(extracted.slice(0, 3))}${extracted.length > 3 ? '...' : ''}`);

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
        external_id: `charleys-${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
        image_url: null,
      }));

    console.log(`[CharleysOcean] ${extracted.length} extracted → ${events.length} after date filter (today=${todayStr})`);

    // If we found a flyer but got 0 events, surface diagnostic info
    if (events.length === 0 && extracted.length === 0) {
      return { events: [], error: `Flyer found (${flyerUrl}) but Gemini returned 0 events — image may not be a music lineup` };
    }
    if (events.length === 0 && extracted.length > 0) {
      return { events: [], error: `Gemini found ${extracted.length} events but all before ${todayStr}` };
    }

    return { events, error: null };

  } catch (err) {
    console.error("[CharleysOcean] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
