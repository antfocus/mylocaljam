/**
 * Beach Haus Scraper
 * Calendar URL: https://beachhausparty.com/calendar/
 *
 * Built with Divi (WordPress). Events are server-rendered as plain text
 * inside et_pb_text modules. No API or calendar plugin — pure HTML parsing.
 *
 * Event format in DOM:
 *   Artist Name
 *   Instagram.com/Handle (optional)
 *   Friday, March 6, 2026
 *   7:00 p.m. to 10:00 p.m.
 *
 * If it breaks:
 *   1. Go to beachhausparty.com/calendar
 *   2. Check if the text format has changed
 *   3. Update the date/time regex patterns below
 */

const CALENDAR_URL = 'https://beachhausparty.com/calendar/';
const VENUE = 'Beach Haus';
const VENUE_URL = 'https://www.beachhausbeer.com/events-calendar';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Parse "Friday, March 6, 2026" → Date object
 * Parse "7:00 p.m. to 10:00 p.m." → time string
 */
function parseEventDate(dateStr, timeStr) {
  if (!dateStr) return null;

  // Match "Monday, March 6, 2026" or "Friday — March 6, 2026" or "Sunday,  March 8, 2026"
  const dateMatch = dateStr.match(/([A-Za-z]+),?\s*[—-]?\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!dateMatch) return null;

  const monthName = dateMatch[2].toLowerCase();
  const day = parseInt(dateMatch[3]);
  const year = parseInt(dateMatch[4]);
  const month = MONTHS[monthName];
  if (!month) return null;

  // Parse start time from "7:00 p.m. to 10:00 p.m."
  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);
      const period = timeMatch[3].toLowerCase().replace(/\./g, '');
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
    }
  }

  return new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-05:00`
  );
}

/**
 * Extract time display string from "7:00 p.m. to 10:00 p.m."
 */
function formatTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}:\d{2}\s*[ap]\.m\.)/i);
  if (!match) return null;
  return match[1].replace(/\./g, '').replace('am', 'AM').replace('pm', 'PM').trim();
}

/**
 * Parse the Divi text block content into events.
 * Events are separated by blank lines, each block has:
 * Line 1: Artist name
 * Line 2 (optional): Instagram handle
 * Line 3: Date
 * Line 4: Time
 */
function parseEvents(html) {
  const events = [];
  const now = new Date();

  // Extract all et_pb_text_inner divs
  const textBlockRegex = /<div class="et_pb_text_inner">([\s\S]*?)<\/div>/g;
  let blockMatch;

  while ((blockMatch = textBlockRegex.exec(html)) !== null) {
    const content = blockMatch[1];

    // Strip HTML tags and decode entities
    const text = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#8211;/g, '—')
      .replace(/&#8212;/g, '—')
      .trim();

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) continue;

    // Look for a date line pattern
    const dateLineIdx = lines.findIndex(l =>
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(l) ||
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(l)
    );
    if (dateLineIdx === -1) continue;

    // Artist name is the line before the date (skip Instagram lines)
    let titleIdx = dateLineIdx - 1;
    while (titleIdx >= 0 && lines[titleIdx].toLowerCase().includes('instagram')) {
      titleIdx--;
    }
    if (titleIdx < 0) continue;
    const title = lines[titleIdx];
    if (!title || title.toLowerCase().includes('calendar')) continue;

    const dateStr = lines[dateLineIdx];
    const timeStr = lines[dateLineIdx + 1] || null;

    const eventDate = parseEventDate(dateStr, timeStr);
    if (!eventDate) continue;
    if (eventDate < now) continue;

    // Build a stable external_id from title + date
    const dateKey = eventDate.toISOString().split('T')[0];
    const externalId = `beachhaus-${title.toLowerCase().replace(/[^a-z0-9]/g, '')}-${dateKey}`;

    events.push({
      title,
      venue: VENUE,
      date: dateKey,
      time: formatTime(timeStr),
      description: null,
      ticket_url: VENUE_URL,
      price: null,
      source_url: VENUE_URL,
      external_id: externalId,
      genre: 'Music',
    });
  }

  // Deduplicate
  const seen = new Set();
  return events.filter(ev => {
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });
}

export async function scrapeBeachHaus() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Beach Haus calendar`);

    const html = await res.text();
    const events = parseEvents(html);

    console.log(`[BeachHaus] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BeachHaus] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}