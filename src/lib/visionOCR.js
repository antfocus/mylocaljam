/**
 * Vision OCR — Google Gemini image-to-structured-events pipeline
 *
 * Sends a venue flyer image to Gemini 2.5 Flash for OCR extraction.
 * Returns structured JSON: an array of { artist, date, time } objects.
 *
 * This module is ONLY for extraction. It does NOT write bios, fetch images,
 * or do any enrichment. That's handled downstream by the existing Last.fm
 * pipeline in sync-events (Phase 0 scraper enrichment → Phase 2 Last.fm).
 *
 * Uses Gemini's `response_mime_type: "application/json"` to force structured
 * output that maps directly to our database schema — no parsing needed.
 *
 * Required env var: GOOGLE_AI_KEY
 *
 * Gemini API docs: https://ai.google.dev/gemini-api/docs
 * Pricing: Free tier (gemini-2.5-flash)
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * The system instruction tells Gemini to act as a strict OCR extractor.
 * Handles both single-venue flyers and multi-day festival posters.
 * No web search, no bios, no creativity — just read the flyer and return JSON.
 */
const SYSTEM_INSTRUCTION = `You are an expert data extractor for a live music event database. I will provide an image of a concert or festival poster. Your job is to extract the event details and return a strict JSON array of objects.

Extraction Rules:
1. Identify the Event/Festival Name: (e.g., Sea.Hear.Now).
2. Identify the Venue/City: (e.g., Asbury Park, NJ).
3. Date Mapping: If the poster lists multiple days (e.g., Saturday vs. Sunday) and a general weekend date (e.g., Sept 19 & 20, 2026), you MUST map the correct specific date to the corresponding artists. Saturday artists get the first date; Sunday artists get the second date. Use the current month/year provided in the user message to calculate any relative dates.
4. Filter Non-Musical Acts: Ignore sponsors, vendors, or specific non-music categories. For example, if there is a "SURF" section, DO NOT extract those names as bands. Exclude drink specials, food events, trivia nights, karaoke, open mic, and non-live-music events.
5. For "artist": use the exact name as written on the poster. Do not modify capitalization or spelling.
6. For "time": use 12-hour format like "7:00 PM". If no time is shown, use null.
7. Do NOT invent, guess, or look up any information not on the poster.
8. Do NOT write bios or descriptions.
9. If the image is unreadable or contains no music events, return an empty array [].
10. JSON Schema: Return an array of objects matching this exact structure: [{"event_name": "string", "venue": "string", "date": "YYYY-MM-DD", "artist_name": "string"}]. Do not include any markdown formatting or explanations outside of the JSON array.`;

/**
 * Detect MIME type from URL extension or default to JPEG.
 */
function getMimeType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Download an image and convert to base64 for Gemini inline_data.
 * Gemini doesn't support direct image URLs — requires base64 inline_data.
 */
async function imageUrlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return base64;
}

/**
 * Extract events from a venue flyer image using Google Gemini 2.5 Flash.
 *
 * @param {string} imageUrl - Public URL of the flyer image (JPEG/PNG/WebP)
 * @param {object} options
 * @param {string} options.venueName - Name of the venue (for context)
 * @param {number} options.year - Current year (for date calculation)
 * @param {number} options.month - Current month 1-12 (for date calculation)
 * @returns {Promise<Array<{artist: string, date: string|null, time: string|null}>>}
 */
export async function extractEventsFromFlyer(imageUrl, { venueName, year, month } = {}) {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    throw new Error('[VisionOCR] GOOGLE_AI_KEY not set');
  }

  if (!imageUrl) {
    throw new Error('[VisionOCR] No image URL provided');
  }

  // Download image and convert to base64
  console.log(`[VisionOCR] Downloading flyer image: ${imageUrl}`);
  const base64Data = await imageUrlToBase64(imageUrl);
  const mimeType = getMimeType(imageUrl);
  console.log(`[VisionOCR] Image downloaded (${Math.round(base64Data.length * 0.75 / 1024)}KB, ${mimeType})`);

  // Build the current month context so Gemini can resolve day names to real dates
  const now = new Date();
  const currentYear = year || now.getFullYear();
  const currentMonth = month || (now.getMonth() + 1);
  const monthName = new Date(currentYear, currentMonth - 1).toLocaleString('en-US', { month: 'long' });

  const userMessage = `The current month is ${monthName} ${currentYear}. This is a live music event poster${venueName ? ` for ${venueName}` : ''}. Extract all live music events from this image.`;

  // Gemini REST API request
  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: userMessage },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              event_name: { type: 'STRING', description: 'Festival or event name (e.g. Sea.Hear.Now)' },
              venue: { type: 'STRING', description: 'Venue name or city (e.g. Asbury Park, NJ)' },
              date: { type: 'STRING', description: 'Event date in YYYY-MM-DD format' },
              artist_name: { type: 'STRING', description: 'Artist or band name exactly as written on the poster' },
              time: { type: 'STRING', nullable: true, description: 'Start time like "7:00 PM" or null if not shown' },
            },
            required: ['artist_name', 'date'],
          },
        },
        temperature: 0.1, // Low temperature for precise OCR extraction
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[VisionOCR] Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  // Extract the text content from Gemini's response
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    console.warn('[VisionOCR] Empty response from Gemini');
    return [];
  }

  // Parse the JSON — Gemini with response_mime_type should return clean JSON,
  // but strip markdown fences just in case
  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  let events;
  try {
    events = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[VisionOCR] Failed to parse Gemini response as JSON:', cleaned.slice(0, 300));
    return [];
  }

  if (!Array.isArray(events)) {
    console.warn('[VisionOCR] Gemini returned non-array:', typeof events);
    return [];
  }

  // Validate and normalize each event
  // Supports both old schema (artist) and new schema (artist_name, event_name, venue)
  const validated = events
    .filter(e => e && typeof (e.artist_name || e.artist) === 'string' && (e.artist_name || e.artist).trim())
    .map(e => ({
      artist: (e.artist_name || e.artist).trim(),
      date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null,
      time: typeof e.time === 'string' ? e.time.trim() : null,
      event_name: typeof e.event_name === 'string' ? e.event_name.trim() : null,
      venue: typeof e.venue === 'string' ? e.venue.trim() : null,
    }))
    .filter(e => e.date); // Drop events where we couldn't get a date

  console.log(`[VisionOCR] Extracted ${validated.length} events from flyer`);
  return validated;
}
