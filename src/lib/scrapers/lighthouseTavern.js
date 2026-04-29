/**
 * Lighthouse Tavern scraper (Vision OCR — multi-flyer)
 * Site: https://www.lighthousetavernnj.com/entertainment-2
 *
 * Wix site. The entertainment page has NO text-based event listings —
 * the only content beside hours-of-operation and contact info is a grid
 * of event flyer JPG/PNG images hosted on the Wix CDN. Each flyer is
 * typically one single event (artist + date + time) but the venue may
 * occasionally post a monthly-schedule multi-event poster.
 *
 * ── STRATEGY (Vision OCR — every flyer) ──
 * 1. Fetch the entertainment page HTML
 * 2. Extract every wixstatic.com image that looks like a flyer
 *    (medium-to-large, not a social/logo/banner)
 * 3. Run each through Gemini 2.5 Flash via @/lib/visionOCR — IN PARALLEL
 *    via Promise.all so total runtime stays ~5s instead of ~30s sequential
 * 4. Merge + dedupe the per-flyer event lists
 *
 * Cost: ~$0.0002 per OCR call × ~10 flyers = ~$0.002 per scrape. Weekly
 * cron + manual runs = pennies/year. Negligible.
 *
 * If it breaks:
 *   1. Visit https://www.lighthousetavernnj.com/entertainment-2 in a browser.
 *   2. Inspect a flyer image — confirm src points at static.wixstatic.com.
 *   3. If the URL pattern changed, update WIX_CDN_REGEX below.
 *   4. If Gemini stops parsing the flyer correctly, check whether Lighthouse
 *      changed flyer style (e.g., new typography or layout that Gemini reads
 *      as a watermark instead of event metadata).
 *
 * Address: 397 Route 9, Waretown, NJ 08758
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = 'Lighthouse Tavern';
const PAGE_URL = 'https://www.lighthousetavernnj.com/entertainment-2';

// Wix CDN URL pattern. Wix serves images from `static.wixstatic.com/media/{accountId}_{hash}~mv2.{ext}`
// followed by transform URLs (`/v1/fill/...`). We match the full URL up to the next quote.
const WIX_CDN_REGEX = /https?:\/\/static\.wixstatic\.com\/media\/[^"\s)]+\.(?:jpg|jpeg|png|webp)/gi;

// Hard-skip on URL patterns that signal social icons, logos, or
// decorative chrome. The 60×62 logo and the ~39×39 social icons sit on
// every page; we don't want to OCR those.
const SKIP_KEYWORDS = ['facebook', 'instagram', 'twitter', 'icon', 'logo', 'favicon', 'social'];

/**
 * Pull flyer-shaped image URLs out of the page HTML. Drops anything that
 * looks like a social icon, a tiny logo, or a wide thin banner.
 *
 * The aspect-ratio filter is best-effort — Wix encodes the rendered size
 * in the `/fill/w_NNN,h_NNN/` segment of the transform URL, so we read
 * those numbers and reject extreme ratios (>3.5:1 — typical hero banners
 * are ~5:1, real flyers are ~16:9 or square).
 */
function extractFlyerUrls(html) {
  const matches = [...html.matchAll(WIX_CDN_REGEX)];
  const seen = new Set();
  const flyers = [];

  for (const m of matches) {
    const url = m[0];
    // Dedupe by the canonical media-id portion — same image often appears
    // multiple times via different transform sizes.
    const baseMatch = url.match(/\/media\/([^/?]+)\.(?:jpg|jpeg|png|webp)/i);
    const baseId = baseMatch ? baseMatch[1] : url;
    if (seen.has(baseId)) continue;
    seen.add(baseId);

    const lower = url.toLowerCase();
    if (SKIP_KEYWORDS.some(k => lower.includes(k))) continue;

    // Aspect-ratio filter via Wix's /fill/w_N,h_N/ transform segment.
    const dims = url.match(/\/fill\/w_(\d+),h_(\d+)/);
    if (dims) {
      const w = parseInt(dims[1], 10);
      const h = parseInt(dims[2], 10);
      if (w && h) {
        // Skip tiny (logos / social icons render at ~40-120px)
        if (w < 250 || h < 250) continue;
        // Skip extreme widescreen (hero banners are usually 4-5:1)
        const ratio = w / h;
        if (ratio > 3.5 || ratio < 0.3) continue;
      }
    }

    flyers.push(url);
  }

  return flyers;
}

export async function scrapeLighthouseTavern() {
  try {
    // ── Step 1: Fetch the entertainment page ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(PAGE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Lighthouse Tavern entertainment page`);

    const html = await res.text();
    const flyerUrls = extractFlyerUrls(html);
    console.log(`[LighthouseTavern] Page fetched (${html.length} chars), ${flyerUrls.length} flyer candidates`);

    if (flyerUrls.length === 0) {
      console.warn('[LighthouseTavern] No flyer images on page — bot filtering or layout change?');
      return { events: [], error: 'No flyer images found' };
    }

    // ── Step 2: Run Vision OCR on every flyer in parallel ──
    // Per-flyer failures don't kill the run — we want partial results when
    // some flyers OCR cleanly and others don't.
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const ocrResults = await Promise.all(
      flyerUrls.map(async (url) => {
        try {
          const extracted = await extractEventsFromFlyer(url, {
            venueName: VENUE,
            year, month,
          });
          return Array.isArray(extracted) ? extracted : [];
        } catch (err) {
          console.warn(`[LighthouseTavern] OCR failed for ${url}: ${err.message}`);
          return [];
        }
      })
    );

    // Flatten + dedupe by (date, normalized-artist) so a multi-event poster
    // and a per-event flyer for the same date+artist don't double-count.
    const seen = new Set();
    const merged = [];
    for (const list of ocrResults) {
      for (const e of list) {
        if (!e || !e.date || !e.artist) continue;
        const key = `${e.date}-${e.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(e);
      }
    }
    console.log(`[LighthouseTavern] OCR'd ${flyerUrls.length} flyers → ${merged.length} unique events`);

    // ── Step 3: Format to the standard scraper output shape ──
    const events = merged
      .filter(e => e.date >= todayStr)
      .map(e => ({
        title: e.artist,
        venue: VENUE,
        date: e.date,
        time: e.time || null, // venue.default_start_time fills via waterfall when null
        description: null,
        ticket_url: PAGE_URL,
        price: null,
        source_url: PAGE_URL,
        external_id: `lighthousetavern-${e.date}-${e.artist
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40)}`,
        image_url: null, // could surface the flyer URL here if you want it on the card
      }));

    console.log(`[LighthouseTavern] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[LighthouseTavern] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
