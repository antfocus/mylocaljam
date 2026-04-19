/**
 * Heights 27 Bar & Grille scraper
 * Calendar page: https://www.heights27.com/calendar
 *
 * Wix site using the Wix Events app.
 * Events are rendered via Wix Thunderbolt SSR — the event data is embedded
 * in the initial HTML inside a <script id="wix-warmup-data"> JSON blob.
 *
 * Extraction strategy (ordered by reliability):
 *   1. Parse the wix-warmup-data JSON for structured event objects
 *   2. Fall back to regex parsing of SSR-rendered HTML event elements
 *
 * Address: 2407 NJ-71, Spring Lake Heights, NJ 07762
 *
 * If it breaks:
 *   1. Open https://www.heights27.com/calendar
 *   2. View Page Source → search for "wix-warmup-data"
 *   3. If the JSON structure changed, update the extraction path below
 *   4. If no warmup data, check if the site switched to client-side rendering
 */

const VENUE = 'Heights 27';
const CALENDAR_URL = 'https://www.heights27.com/calendar';

/**
 * Convert Wix date string to YYYY-MM-DD in Eastern time.
 * Wix Events uses ISO 8601 timestamps (e.g. "2026-04-22T23:00:00.000Z").
 */
function wixDateToEastern(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  } catch { return null; }
}

/**
 * Convert Wix date string to 12-hour time in Eastern time.
 */
function wixTimeToEastern(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch { return null; }
}

/**
 * Strategy 1: Extract events from wix-warmup-data JSON.
 * The warmup data is a nested JSON object keyed by component IDs.
 * We recursively search for anything that looks like a Wix Events array.
 */
function extractFromWarmupData(html) {
  const warmupMatch = html.match(/<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (!warmupMatch) return null;

  let warmupData;
  try {
    warmupData = JSON.parse(warmupMatch[1]);
  } catch { return null; }

  // Recursively find arrays of event-like objects
  const events = [];
  findEvents(warmupData, events);
  return events.length > 0 ? events : null;
}

function findEvents(obj, results, depth = 0) {
  if (depth > 15 || !obj || typeof obj !== 'object') return;

  // Check if this object looks like a Wix Event
  if (obj.title && (obj.scheduling || obj.dateAndTimeSettings || obj.start || obj.startDate)) {
    results.push(obj);
    return;
  }

  // Check arrays
  if (Array.isArray(obj)) {
    // Check if this is an array of event-like objects
    const eventLike = obj.filter(item =>
      item && typeof item === 'object' && item.title &&
      (item.scheduling || item.dateAndTimeSettings || item.start || item.startDate)
    );
    if (eventLike.length > 0) {
      results.push(...eventLike);
      return;
    }
    for (const item of obj) findEvents(item, results, depth + 1);
    return;
  }

  // Recurse into object values
  for (const val of Object.values(obj)) {
    findEvents(val, results, depth + 1);
  }
}

/**
 * Normalize a Wix Event object into our standard scraper format.
 * Wix Events can have various shapes depending on the API version.
 */
function normalizeWixEvent(evt) {
  // Title
  const title = evt.title || evt.name || null;
  if (!title) return null;

  // Date/time — Wix Events uses scheduling.config or scheduling.formatted
  let startIso = null;
  let endIso = null;

  if (evt.scheduling?.config?.startDate) {
    startIso = evt.scheduling.config.startDate;
    endIso = evt.scheduling.config.endDate || null;
  } else if (evt.scheduling?.startDate) {
    startIso = evt.scheduling.startDate;
    endIso = evt.scheduling.endDate || null;
  } else if (evt.start) {
    startIso = evt.start;
    endIso = evt.end || null;
  } else if (evt.startDate) {
    startIso = evt.startDate;
    endIso = evt.endDate || null;
  } else if (evt.dateAndTimeSettings?.startDate) {
    startIso = evt.dateAndTimeSettings.startDate;
    endIso = evt.dateAndTimeSettings.endDate || null;
  }

  const date = wixDateToEastern(startIso);
  if (!date) return null;

  const time = wixTimeToEastern(startIso);
  const endTime = wixTimeToEastern(endIso);

  // Image
  let imageUrl = null;
  if (evt.mainImage?.url) {
    imageUrl = evt.mainImage.url;
  } else if (evt.mainImage?.id) {
    imageUrl = `https://static.wixstatic.com/media/${evt.mainImage.id}`;
  }

  // Description
  const description = evt.description || evt.about || null;

  // Event ID for dedup
  const eventId = evt.id || evt._id || evt.eventId || null;

  return { title, date, time, endTime, imageUrl, description, eventId };
}

/**
 * Strategy 2: Fall back to regex parsing of rendered HTML.
 * Wix Events SSR renders event items with structured elements.
 */
function extractFromHtml(html) {
  const events = [];

  // Look for event blocks — Wix Events renders title + date + time in nearby elements
  // Pattern: "Event Title" near "Day, Month DD, YYYY" near "H:MMpm-H:MMpm"
  const datePattern = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+\s+\d{1,2},\s*\d{4})/gi;
  const timePattern = /(\d{1,2}:\d{2}\s*(?:am|pm))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:am|pm))/gi;

  // Find all dates in the page
  let dateMatch;
  while ((dateMatch = datePattern.exec(html)) !== null) {
    const fullDateStr = dateMatch[1]; // e.g. "April 22, 2026"
    const position = dateMatch.index;

    // Look for title nearby (within 500 chars before the date)
    const nearby = html.slice(Math.max(0, position - 800), position + 500);

    // Try to find a heading or strong text near the date
    const titleMatch = nearby.match(/<(?:h[2-6]|strong|b)[^>]*>([^<]{2,80})<\/(?:h[2-6]|strong|b)>/i)
      || nearby.match(/data-hook="[^"]*title[^"]*"[^>]*>([^<]{2,80})</i)
      || nearby.match(/"eventTitle"[^>]*>([^<]{2,80})</i);

    if (!titleMatch) continue;

    const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (!title || title.length < 2) continue;

    // Parse the date
    const dateObj = new Date(fullDateStr);
    if (isNaN(dateObj.getTime())) continue;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Look for time near the date
    const timeSection = html.slice(position, position + 300);
    const timeMatch = timeSection.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    const time = timeMatch ? timeMatch[1].toUpperCase() : null;

    events.push({ title, date: dateStr, time, endTime: null, imageUrl: null, description: null, eventId: null });
  }

  return events.length > 0 ? events : null;
}

export async function scrapeHeights27() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(CALENDAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    // Strategy 1: wix-warmup-data JSON
    let rawEvents = extractFromWarmupData(html);
    let source = 'warmup-data';

    if (rawEvents && rawEvents.length > 0) {
      for (const raw of rawEvents) {
        const norm = normalizeWixEvent(raw);
        if (!norm || !norm.date || norm.date < todayStr) continue;

        const titleSlug = norm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        const externalId = `heights27-${norm.date}-${titleSlug}`;
        if (seen.has(externalId)) continue;
        seen.add(externalId);

        events.push({
          title: norm.title,
          venue: VENUE,
          date: norm.date,
          time: norm.time || null,
          end_time: norm.endTime || null,
          description: norm.description,
          image_url: norm.imageUrl,
          ticket_url: null,
          price: null,
          source_url: CALENDAR_URL,
          external_id: externalId,
        });
      }
    }

    // Strategy 2: HTML regex fallback
    if (events.length === 0) {
      source = 'html-parse';
      const htmlEvents = extractFromHtml(html);
      if (htmlEvents) {
        for (const evt of htmlEvents) {
          if (evt.date < todayStr) continue;

          const titleSlug = evt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          const externalId = `heights27-${evt.date}-${titleSlug}`;
          if (seen.has(externalId)) continue;
          seen.add(externalId);

          events.push({
            title: evt.title,
            venue: VENUE,
            date: evt.date,
            time: evt.time || null,
            end_time: evt.endTime || null,
            description: null,
            image_url: null,
            ticket_url: null,
            price: null,
            source_url: CALENDAR_URL,
            external_id: externalId,
          });
        }
      }
    }

    console.log(`[Heights27] Found ${events.length} events via ${source}`);
  } catch (err) {
    error = err.message;
    console.error('[Heights27] Scraper error:', err.message);
  }

  return { events, error };
}
