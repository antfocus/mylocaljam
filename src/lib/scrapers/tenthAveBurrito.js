/**
 * 10th Ave Burrito scraper (Text-First Hybrid)
 * Events page: https://tenthaveburrito.com/events/
 *
 * WordPress + Elementor + JetEngine Listing Calendar.
 *
 * ── PRIMARY STRATEGY (Text Scrape) ──
 * The events page renders an "Upcoming Events" list below the calendar
 * widget. Each event is a JetEngine listing post block containing:
 *   - Artist name in an <h4> with class "elementor-heading-title"
 *   - Date in a ".jet-listing-dynamic-field__content" → "April 11, 2026 at"
 *   - Time in another ".jet-listing-dynamic-field__content" → "7:00 PM"
 *
 * The list entries are distinguished from calendar-cell entries because
 * they include a full date string ("Month Day, Year at").
 *
 * We parse these directly from the server-rendered HTML — no images,
 * no Gemini, no timeouts.
 *
 * ── SECONDARY STRATEGY (Vision OCR Fallback) ──
 * ONLY if the text scrape returns 0 events, we fall back to Vision OCR.
 * Images over 2MB are skipped to prevent Vercel function timeouts.
 *
 * If the text scraper breaks:
 *   1. Go to https://tenthaveburrito.com/events/
 *   2. View Page Source → search for "Upcoming Events"
 *   3. Check the HTML structure of event blocks below that heading
 *   4. Look for "jet-listing-dynamic-field__content" with date patterns
 *   5. Update parseUpcomingEvents() below
 *
 * Address: 801 Belmar Plaza, Belmar, NJ 07719
 */

import { extractEventsFromFlyer } from '@/lib/visionOCR';

const VENUE = '10th Ave Burrito';
const PAGE_URL = 'https://tenthaveburrito.com/events/';

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

const MONTH_NAMES_LOWER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Parse "April 11, 2026" → "2026-04-11"
 * Handles "April 11, 2026 at" (the "at" suffix from JetEngine)
 */
function parseDate(raw) {
  if (!raw) return null;
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

/**
 * Normalize "7:00 PM" → "7:00 PM" (passthrough, already clean)
 */
function normalizeTime(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}:\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  return `${m[1]} ${m[2].toUpperCase()}`;
}

// ═══════════════════════════════════════════════════════════════════
//  PRIMARY STRATEGY: Parse the "Upcoming Events" text list from HTML
// ═══════════════════════════════════════════════════════════════════

/**
 * Strategy 1A — Structured HTML parse.
 *
 * Splits on jet-listing-dynamic-post- blocks. For each block, checks
 * if it contains a full date string ("Month Day, Year"). If so, it's
 * an "Upcoming Events" list entry (not a calendar cell). Extracts
 * artist from heading, date and time from dynamic-field content.
 */
function parseUpcomingEventsStructured(html) {
  const events = [];

  // Split into JetEngine listing post blocks
  const blocks = html.split(/jet-listing-dynamic-post-\d+/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Only process blocks that contain a full date — these are the
    // "Upcoming Events" list entries, NOT calendar day cells.
    const datePattern = /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})\s*at/;
    if (!datePattern.test(block)) continue;

    // Extract artist name from heading
    const artistMatch = block.match(
      /elementor-heading-title[^>]*>([^<]+)</i
    );
    if (!artistMatch) continue;
    const artist = artistMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&#8217;/g, '\u2019')
      .replace(/&#8216;/g, '\u2018')
      .replace(/&#038;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (!artist) continue;

    // Extract date from dynamic field content
    const dateFieldMatch = block.match(
      /jet-listing-dynamic-field__content[^>]*>([^<]*\d{4}[^<]*)</i
    );
    const date = parseDate(dateFieldMatch ? dateFieldMatch[1] : null);
    if (!date) continue;

    // Extract time from dynamic field content (look for HH:MM AM/PM)
    const timeMatches = [...block.matchAll(
      /jet-listing-dynamic-field__content[^>]*>([^<]*\d{1,2}:\d{2}\s*(?:AM|PM)[^<]*)</gi
    )];
    let time = null;
    for (const tm of timeMatches) {
      const parsed = normalizeTime(tm[1]);
      if (parsed) { time = parsed; break; }
    }

    events.push({ artist, date, time });
  }

  return events;
}

/**
 * Strategy 1B — Plain-text regex fallback.
 *
 * If the structured HTML parse fails (e.g., class names changed),
 * fall back to scanning the raw HTML text for the pattern:
 *   [Artist Name] [Month] [Day], [Year] at [Time]
 *
 * This catches the "Upcoming Events" entries as rendered text even
 * if the Elementor/JetEngine markup changes.
 */
function parseUpcomingEventsRegex(html) {
  const events = [];

  // Strip HTML tags to get plain text
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#038;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // Find the "Upcoming Events" section
  const upcomingIdx = text.indexOf('Upcoming Events');
  if (upcomingIdx === -1) return events;

  const section = text.slice(upcomingIdx);

  // Match: [Artist Name] [Month] [Day], [Year] at [Time]
  // The artist name is whatever text appears between entries.
  // Pattern: "Artist Name April 11, 2026 at 7:00 PM"
  const entryPattern = /([A-Z][A-Za-z\s&''\-\.]+?)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/gi;

  let match;
  while ((match = entryPattern.exec(section)) !== null) {
    const artist = match[1].trim();
    const monthStr = match[2];
    const day = match[3].padStart(2, '0');
    const year = match[4];
    const time = normalizeTime(match[5]);

    const month = MONTHS[monthStr.toLowerCase()];
    if (!month || !artist || artist.length < 2) continue;

    const date = `${year}-${month}-${day}`;
    events.push({ artist, date, time });
  }

  return events;
}


// ═══════════════════════════════════════════════════════════════════
//  SECONDARY STRATEGY: Vision OCR fallback (only if text returns 0)
// ═══════════════════════════════════════════════════════════════════

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB ceiling (stricter for fallback)
const IMAGE_TIMEOUT_MS = 10_000;

/** Words that signal a non-content image */
const SKIP_WORDS = ['logo', 'favicon', 'icon', 'social', 'avatar', 'emoji', 'spinner', 'loading', 'placeholder', 'pixel', 'spacer'];

/**
 * Find the best flyer image URL from the page HTML.
 * Scans <img> tags, data-src, AND background-image: url(...).
 */
function findFlyerUrl(html) {
  const currentMonth = MONTH_NAMES_LOWER[new Date().getMonth()];

  const allRefs = [
    ...html.matchAll(/(?:src|data-src|data-lazy-src|data-bg)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    ...html.matchAll(/background-image\s*:\s*url\(\s*['"]?(https?:\/\/[^'")\s]+\.(?:jpg|jpeg|png|webp))[^'")\s]*/gi),
  ];

  const seen = new Set();
  const urls = [];
  for (const m of allRefs) {
    const base = m[1].split('?')[0].split(' ')[0];
    if (seen.has(base)) continue;
    seen.add(base);
    const lower = base.toLowerCase();
    if (SKIP_WORDS.some(w => lower.includes(w))) continue;
    if (/-\d{2,3}x\d{2,3}\./.test(lower)) continue;
    urls.push(m[1].split(' ')[0]);
  }

  // Priority: music/schedule/month keywords
  const priority = ['poster', 'schedule', 'calendar', 'lineup', 'flyer', 'music', 'live'];
  for (const url of urls) {
    const decoded = decodeURIComponent(url).toLowerCase();
    if (priority.some(kw => decoded.includes(kw)) || decoded.includes(currentMonth)) {
      return url;
    }
  }

  // Context match
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (SKIP_WORDS.some(w => lower.includes(w))) continue;
    const idx = html.indexOf(url);
    if (idx !== -1) {
      const context = html.slice(Math.max(0, idx - 400), idx + url.length + 400).toLowerCase();
      if (priority.some(kw => context.includes(kw)) || context.includes(currentMonth)) {
        return url;
      }
    }
  }

  // WordPress uploads fallback
  for (const url of urls) {
    if (url.toLowerCase().includes('/wp-content/uploads/')) return url;
  }

  return urls[0] || null;
}

/**
 * Try downloading a flyer image with timeout + User-Agent + 2MB guard.
 */
async function tryVisionFallback(html) {
  const flyerUrl = findFlyerUrl(html);
  if (!flyerUrl) {
    console.warn('[10thAveBurrito] Vision fallback: no flyer image found');
    return [];
  }

  console.log(`[10thAveBurrito] Vision fallback: trying ${flyerUrl}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    const imgRes = await fetch(flyerUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': PAGE_URL,
      },
    });
    clearTimeout(timer);

    if (!imgRes.ok) {
      console.warn(`[10thAveBurrito] Vision fallback: image HTTP ${imgRes.status}`);
      return [];
    }

    // Check size before downloading body
    const contentLength = parseInt(imgRes.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      console.warn(`[10thAveBurrito] Vision fallback: image too large (${(contentLength / 1024 / 1024).toFixed(1)}MB > 2MB), skipping`);
      return [];
    }

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`[10thAveBurrito] Vision fallback: image body too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB), skipping`);
      return [];
    }
    if (buffer.byteLength < 2000) {
      console.warn(`[10thAveBurrito] Vision fallback: image too small (${buffer.byteLength}B), skipping`);
      return [];
    }

    console.log(`[10thAveBurrito] Vision fallback: image downloaded (${(buffer.byteLength / 1024).toFixed(0)}KB)`);

    // extractEventsFromFlyer handles Gemini call
    const now = new Date();
    const extracted = await extractEventsFromFlyer(flyerUrl, {
      venueName: VENUE,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });

    return extracted;
  } catch (err) {
    console.warn(`[10thAveBurrito] Vision fallback failed: ${err.message}`);
    return [];
  }
}


// ═══════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export async function scrapeTenthAveBurrito() {
  try {
    // ── Step 1: Fetch the events page ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(PAGE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching 10th Ave Burrito events page`);
    }

    const html = await res.text();
    console.log(`[10thAveBurrito] Page fetched (${html.length} chars)`);

    // ── Step 2: PRIMARY — Parse text-based "Upcoming Events" list ──
    let parsed = parseUpcomingEventsStructured(html);
    console.log(`[10thAveBurrito] Structured text parse: ${parsed.length} events`);

    // If structured parse got nothing, try regex fallback on plain text
    if (parsed.length === 0) {
      parsed = parseUpcomingEventsRegex(html);
      console.log(`[10thAveBurrito] Regex text parse: ${parsed.length} events`);
    }

    // ── Step 3: If text parse succeeded, format and return ──
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    if (parsed.length > 0) {
      const events = parsed
        .filter(e => e.date >= todayStr)
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

      console.log(`[10thAveBurrito] ✓ Text scrape found ${events.length} upcoming events`);
      return { events, error: null };
    }

    // ── Step 4: FALLBACK — Vision OCR (only if text returned 0) ──
    console.warn('[10thAveBurrito] Text scrape found 0 events — trying Vision OCR fallback');
    const visionExtracted = await tryVisionFallback(html);
    console.log(`[10thAveBurrito] Vision fallback extracted ${visionExtracted.length} events`);

    const events = visionExtracted
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

    console.log(`[10thAveBurrito] Found ${events.length} upcoming events (via Vision fallback)`);
    return { events, error: events.length === 0 ? 'Both text and vision strategies returned 0 events' : null };

  } catch (err) {
    console.error('[10thAveBurrito] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
