/**
 * 10th Ave Burrito scraper (Vision OCR — High-Aggression)
 * Events page: https://tenthaveburrito.com/events/
 *
 * WordPress + Elementor site — the live music schedule is posted as an
 * IMAGE POSTER on the events page. The old JetEngine calendar widget
 * approach broke repeatedly due to widget ID changes and HTML structure
 * shifts.
 *
 * ── CURRENT APPROACH (Vision OCR) ──
 * 1. Fetch the events page HTML
 * 2. Scan for ALL candidate images: <img src>, data-src, data-lazy-src,
 *    AND background-image: url(...) in inline styles (the "background trap")
 * 3. Priority-sort: URLs containing "poster", "schedule", "calendar", the
 *    current month name, or "music" are tested first
 * 4. Try each candidate with a 10-second timeout + User-Agent header
 * 5. Skip images > 5MB (prevent Vercel function timeout)
 * 6. First successful download gets piped to Gemini 2.5 Flash via
 *    extractEventsFromFlyer()
 *
 * If it breaks:
 *   1. Go to https://tenthaveburrito.com/events/
 *   2. Right-click the music schedule poster → Copy Image Address
 *   3. Update PRIORITY_KEYWORDS or findAllCandidateUrls() below
 *
 * Address: 10th Avenue, Belmar, NJ
 */

// NOTE: This scraper calls Gemini directly (with pre-downloaded base64)
// instead of using extractEventsFromFlyer() to avoid double-downloading
// images that may timeout on the CDN.

const VENUE = '10th Ave Burrito';
const PAGE_URL = 'https://tenthaveburrito.com/events/';
const IMAGE_TIMEOUT_MS = 10_000;  // 10s per image attempt
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB ceiling

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Words that signal a non-content image */
const SKIP_WORDS = ['logo', 'favicon', 'icon', 'social', 'avatar', 'emoji', 'spinner', 'loading', 'placeholder', 'pixel', 'spacer'];

/** Priority keywords — images matching these sort to the top */
const PRIORITY_KEYWORDS = ['poster', 'schedule', 'calendar', 'lineup', 'flyer', 'music', 'live', 'entertainment'];

/**
 * Extract ALL candidate image URLs from the HTML.
 * Covers <img src/data-src/data-lazy-src>, srcset, AND
 * background-image: url(...) in inline styles.
 */
function findAllCandidateUrls(html) {
  const currentMonth = MONTH_NAMES[new Date().getMonth()];

  const allRefs = [
    // Standard img attributes
    ...html.matchAll(/(?:src|data-src|data-lazy-src|data-bg|data-background-image)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*"/gi),
    // Background images in inline styles (THE BACKGROUND TRAP)
    ...html.matchAll(/background-image\s*:\s*url\(\s*['"]?(https?:\/\/[^'")\s]+\.(?:jpg|jpeg|png|webp))[^'")\s]*/gi),
    // Elementor data-settings with background (JSON-encoded)
    ...html.matchAll(/"background_image"\s*:\s*\{\s*"url"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))[^"]*/gi),
  ];

  // Deduplicate by base URL (before query params)
  const seen = new Set();
  const urls = [];
  for (const m of allRefs) {
    const raw = m[1].split(' ')[0]; // strip srcset width descriptors
    const base = raw.split('?')[0];
    if (seen.has(base)) continue;
    seen.add(base);

    const lower = base.toLowerCase();

    // Skip known non-content images
    if (SKIP_WORDS.some(w => lower.includes(w))) continue;

    // Skip tiny WordPress thumbnails (-NNxNN suffix)
    if (/-\d{2,3}x\d{2,3}\./.test(lower)) continue;

    urls.push(raw);
  }

  // ── Priority sort ──
  // Score each URL: higher = more likely to be the schedule poster
  const scored = urls.map(url => {
    const decoded = decodeURIComponent(url).toLowerCase();
    let score = 0;

    // Priority keywords in the URL itself
    for (const kw of PRIORITY_KEYWORDS) {
      if (decoded.includes(kw)) score += 10;
    }

    // Current month name in URL
    if (decoded.includes(currentMonth)) score += 15;

    // WordPress uploads path (likely content, not theme)
    if (decoded.includes('/wp-content/uploads/')) score += 5;

    // Check surrounding HTML context for music-related terms
    const idx = html.indexOf(url);
    if (idx !== -1) {
      const context = html.slice(Math.max(0, idx - 500), idx + url.length + 500).toLowerCase();
      for (const kw of PRIORITY_KEYWORDS) {
        if (context.includes(kw)) score += 3;
      }
      if (context.includes(currentMonth)) score += 8;
    }

    return { url, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.url);
}

/**
 * Attempt to download an image with a timeout + User-Agent.
 * Returns { base64, mimeType, sizeBytes } or null on failure.
 */
async function tryDownloadImage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': PAGE_URL,
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[10thAveBurrito] Image HTTP ${res.status}: ${url}`);
      return null;
    }

    // Check Content-Length header first (cheap guard)
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      console.warn(`[10thAveBurrito] Image too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), skipping: ${url}`);
      return null;
    }

    const buffer = await res.arrayBuffer();

    // Double-check actual size (Content-Length can be missing/wrong)
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`[10thAveBurrito] Image body too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB), skipping: ${url}`);
      return null;
    }

    // Reject suspiciously small responses (likely error pages)
    if (buffer.byteLength < 2000) {
      console.warn(`[10thAveBurrito] Image too small (${buffer.byteLength}B), probably not a flyer: ${url}`);
      return null;
    }

    const lower = url.toLowerCase();
    let mimeType = 'image/jpeg';
    if (lower.includes('.png')) mimeType = 'image/png';
    else if (lower.includes('.webp')) mimeType = 'image/webp';

    const base64 = Buffer.from(buffer).toString('base64');
    return { base64, mimeType, sizeBytes: buffer.byteLength };
  } catch (err) {
    console.warn(`[10thAveBurrito] Image download failed (${err.name === 'AbortError' ? 'timeout' : err.message}): ${url}`);
    return null;
  }
}

/**
 * Build Gemini request directly with pre-downloaded base64 data.
 * This avoids double-downloading and lets us control timeouts end-to-end.
 */
async function callGeminiWithBase64(base64, mimeType, venueName, year, month) {
  // Delegate to extractEventsFromFlyer with a data-URI so the visionOCR
  // module can still parse it, OR we call it with the imageUrl and accept
  // the double-download. Since extractEventsFromFlyer doesn't support
  // base64 input, we'll create a temporary data URI approach.
  //
  // Actually — we call extractEventsFromFlyer with a synthetic data: URL.
  // The visionOCR module will try to fetch it and fail, so instead we
  // directly call the Gemini API here (same logic as visionOCR).
  const GEMINI_MODEL = 'gemini-2.5-flash';
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error('[10thAveBurrito] GOOGLE_AI_KEY not set');

  const now = new Date();
  const currentYear = year || now.getFullYear();
  const currentMonth = month || (now.getMonth() + 1);
  const currentDay = now.getDate();
  const monthName = new Date(currentYear, currentMonth - 1).toLocaleString('en-US', { month: 'long' });
  const dayName = now.toLocaleString('en-US', { weekday: 'long' });
  const todayISO = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

  const SYSTEM_INSTRUCTION = `You are an expert data extractor for a live music event database. I will provide an image of a concert or festival poster. Your job is to extract the event details and return a strict JSON array of objects.

Extraction Rules:
1. Identify the Event/Festival Name: (e.g., Sea.Hear.Now).
2. Identify the Venue/City: (e.g., Asbury Park, NJ).
3. Date Mapping & Normalization:
   - If the poster lists multiple days (e.g., Saturday vs. Sunday) and a general weekend date (e.g., Sept 19 & 20, 2026), you MUST map the correct specific date to the corresponding artists.
   - CRITICAL: Convert ALL date references into strict YYYY-MM-DD format.
   - Relative terms like "today", "tonight", "this Sunday" → resolve using the exact current date provided.
   - Incomplete dates like "3/29", "March 29" → assume the current year.
   - Day names like "Saturday", "Sunday" → resolve to the nearest upcoming date.
   - If you absolutely cannot determine the date, use null.
4. Filter Non-Musical Acts: Ignore sponsors, vendors, drink specials, food events, trivia nights, karaoke, open mic, and non-live-music events.
5. For "artist": use the exact name as written on the poster.
6. For "time": use strict 24-hour format HH:MM (e.g., "16:00"). If a time range is given, extract ONLY the start time. If no time is shown, use null.
7. Do NOT invent, guess, or look up any information not on the poster.
8. Do NOT write bios or descriptions.
9. If the image is unreadable or contains no music events, return an empty array [].
10. Smart Categorization: For each extracted artist, assign a "category" and "confidence_score".
11. JSON Schema: Return an array of objects matching: [{"event_name": "string", "venue": "string", "date": "YYYY-MM-DD", "artist_name": "string", "time": "HH:MM or null", "category": "string", "confidence_score": integer}].`;

  const userMessage = `Today is ${dayName}, ${monthName} ${currentDay}, ${currentYear} (${todayISO}). This is a live music event poster for ${venueName}. Extract all live music events from this image.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000); // 30s for Gemini

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{
        role: 'user',
        parts: [
          { text: userMessage },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              event_name: { type: 'STRING' },
              venue: { type: 'STRING' },
              date: { type: 'STRING' },
              artist_name: { type: 'STRING' },
              time: { type: 'STRING', nullable: true },
              category: { type: 'STRING' },
              confidence_score: { type: 'INTEGER' },
            },
            required: ['artist_name', 'date', 'category', 'confidence_score'],
          },
        },
        temperature: 0.1,
      },
    }),
  });

  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) return [];

  const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  let events;
  try {
    events = JSON.parse(cleaned);
  } catch {
    console.error('[10thAveBurrito] Failed to parse Gemini JSON:', cleaned.slice(0, 300));
    return [];
  }

  if (!Array.isArray(events)) return [];

  return events
    .filter(e => e && typeof (e.artist_name || e.artist) === 'string' && (e.artist_name || e.artist).trim())
    .map(e => ({
      artist: (e.artist_name || e.artist).trim(),
      date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
      time: typeof e.time === 'string' ? e.time.trim() : null,
      category: typeof e.category === 'string' ? e.category.trim() : 'Live Music',
      confidence_score: typeof e.confidence_score === 'number' ? e.confidence_score : 50,
    }))
    .filter(e => e.date);
}

export async function scrapeTenthAveBurrito() {
  try {
    // ── Step 1: Fetch the events page ──
    const pageController = new AbortController();
    const pageTimer = setTimeout(() => pageController.abort(), 15_000);

    const res = await fetch(PAGE_URL, {
      signal: pageController.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(pageTimer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching 10th Ave Burrito events page`);
    }

    const html = await res.text();
    console.log(`[10thAveBurrito] Page fetched (${html.length} chars)`);

    // ── Step 2: Find ALL candidate image URLs ──
    const candidates = findAllCandidateUrls(html);
    console.log(`[10thAveBurrito] Found ${candidates.length} candidate images`);

    if (candidates.length === 0) {
      return { events: [], error: 'No candidate images found on events page' };
    }

    // ── Step 3: Try each candidate until one downloads successfully ──
    let winnerBase64 = null;
    let winnerMime = null;
    let winnerUrl = null;

    for (const url of candidates) {
      console.log(`[10thAveBurrito] Trying image: ${url.slice(0, 120)}...`);
      const result = await tryDownloadImage(url);
      if (result) {
        console.log(`[10thAveBurrito] ✓ Image downloaded (${(result.sizeBytes / 1024).toFixed(0)}KB, ${result.mimeType})`);
        winnerBase64 = result.base64;
        winnerMime = result.mimeType;
        winnerUrl = url;
        break;
      }
      // Move to next candidate immediately
    }

    if (!winnerBase64) {
      return { events: [], error: `All ${candidates.length} candidate images failed to download` };
    }

    // ── Step 4: Send to Gemini (with pre-downloaded base64 — no double-fetch) ──
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const extracted = await callGeminiWithBase64(winnerBase64, winnerMime, VENUE, year, month);
    console.log(`[10thAveBurrito] Gemini extracted ${extracted.length} events from ${winnerUrl}`);

    // ── Step 5: Convert to standard scraper output ──
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
