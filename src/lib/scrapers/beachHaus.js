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
 * Parse the Divi page HTML into events.
 * Structure (confirmed via DevTools):
 *   SPAN: Artist name (e.g. "Chris Brown")
 *   A:    Instagram link (optional, skip)
 *   H4:   Date (e.g. "Friday, March 6, 2026")
 *   P:    Time (e.g. "7:00 p.m. to 10:00 p.m.")
 */
function parseEvents(html) {
  const events = [];
  const now = new Date();

  // Extract all leaf text elements in order from the page
  // Match SPAN (artist), H4 (date), P (time) tags
  const tokenRegex = /<(span|h4|p|a)[^>]*>([\s\S]*?)<\/\1>/gi;
  const tokens = [];
  let m;

  while ((m = tokenRegex.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const raw = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    if (!raw) continue;

    // Skip navigation, footer, meta content
    if (raw.length > 200) continue;

    tokens.push({ tag, text: raw });
  }

  // Walk tokens looking for the pattern: SPAN (artist) → H4 (date) → P (time)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Look for an H4 that contains a date
    if (t.tag !== 'h4') continue;
    const dateStr = t.text;
    if (!/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(dateStr)) continue;

    // Look back for the nearest SPAN that's an artist name (skip Instagram links)
    let title = null;
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const prev = tokens[j];
      if (prev.tag === 'span' &&
          !prev.text.toLowerCase().includes('instagram') &&
          !prev.text.toLowerCase().includes('calendar') &&
          !prev.text.toLowerCase().includes('http') &&
          prev.text.length > 1) {
        title = prev.text;
        break;
      }
    }
    if (!title) continue;

    // Look ahead for the time P tag
    let timeStr = null;
    if (i + 1 < tokens.length && tokens[i + 1].tag === 'p') {
      timeStr = tokens[i + 1].text;
    }

    const eventDate = parseEventDate(dateStr, timeStr);
    if (!eventDate) continue;
    if (eventDate < now) continue;

    const dateKey = eventDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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