/**
 * St. Stephen's Green Publick House Scraper
 * Entertainment calendar: https://calendar.google.com/calendar/embed?src=fvqec2fjipa4er26tcnm18ecto@group.calendar.google.com
 *
 * Uses the public Google Calendar iCal feed — no API key required.
 * iCal URL: https://calendar.google.com/calendar/ical/{calendarId}/public/basic.ics
 *
 * If it breaks:
 *   1. Go to the venue's entertainment page
 *   2. Find the Google Calendar embed URL
 *   3. Copy the `src=` parameter value — that's the calendar ID
 *   4. Update CALENDAR_ID below
 */

const CALENDAR_ID = 'fvqec2fjipa4er26tcnm18ecto@group.calendar.google.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE = "St. Stephen's Green Publick House";
const VENUE_URL = 'https://www.ssgpub.com';

/**
 * Parse an iCal date string into a JS Date.
 * Handles: TZID format, UTC (Z), and floating dates.
 * Examples:
 *   DTSTART;TZID=America/New_York:20260315T210000
 *   DTSTART:20260315T210000Z
 *   DTSTART;VALUE=DATE:20260315
 */
function easternOffset(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).formatToParts(d);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'EST';
    return tz.includes('EDT') ? '-04:00' : '-05:00';
  } catch {
    return '-05:00';
  }
}

function parseIcalDate(str) {
  if (!str) return null;

  const dateOnly = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const ds = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    return new Date(`${ds}T00:00:00${easternOffset(ds)}`);
  }

  const utcMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    return new Date(`${utcMatch[1]}-${utcMatch[2]}-${utcMatch[3]}T${utcMatch[4]}:${utcMatch[5]}:${utcMatch[6]}Z`);
  }

  const localMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const ds = `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}`;
    return new Date(`${ds}T${localMatch[4]}:${localMatch[5]}:${localMatch[6]}${easternOffset(ds)}`);
  }

  return null;
}

/**
 * Extract the value from an iCal property line.
 * Handles folded lines (continuation lines start with a space/tab).
 * e.g. "SUMMARY:My Event Title" → "My Event Title"
 *      "DTSTART;TZID=America/New_York:20260315T210000" → "20260315T210000"
 */
function extractValue(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return '';
  return line.slice(colonIdx + 1).trim();
}

/**
 * Decode iCal text escapes: \n → newline, \, → comma, \; → semicolon
 */
function decodeIcalText(str) {
  return str
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Parse raw iCal text into an array of event objects.
 */
function parseIcal(icalText) {
  const events = [];
  const now = new Date();

  // Unfold lines (iCal wraps long lines with CRLF + space)
  const unfolded = icalText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);

  let inEvent = false;
  let current = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      inEvent = false;

      const startDate = parseIcalDate(current.dtstart);
      if (!startDate) { current = {}; continue; }

      // Skip only if the event date is before today in Eastern time
      const eventDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) { current = {}; continue; }

      const title = decodeIcalText(current.summary || '');
      if (!title) { current = {}; continue; }

      // Build external_id from UID or title+date
      const uid = current.uid || `${title}-${current.dtstart}`;
      const externalId = `ststephensgreen-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;

      // Format date and time
      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      // Detect genre
      let genre = 'Music';
      const lower = title.toLowerCase();
      if (lower.includes('happy hour')) genre = 'Happy Hour';
      else if (lower.includes('trivia')) genre = 'Trivia';
      else if (lower.includes('open mic')) genre = 'Open Mic';
      else if (lower.includes('dj')) genre = 'DJ';
      else if (lower.includes('special') || lower.includes('$')) genre = 'Specials';

      events.push({
        title,
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: current.description ? decodeIcalText(current.description) : null,
        ticket_url: current.url || VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        genre,
      });

      current = {};
      continue;
    }

    if (!inEvent) continue;

    // Parse property name and value
    if (line.startsWith('SUMMARY')) current.summary = extractValue(line);
    else if (line.startsWith('DTSTART')) current.dtstart = extractValue(line);
    else if (line.startsWith('DTEND')) current.dtend = extractValue(line);
    else if (line.startsWith('DESCRIPTION')) current.description = extractValue(line);
    else if (line.startsWith('URL')) current.url = extractValue(line);
    else if (line.startsWith('UID')) current.uid = extractValue(line);
  }

  return events;
}

export async function scrapeStStephensGreen() {
  try {
    const res = await fetch(ICAL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching iCal feed`);

    const icalText = await res.text();
    if (!icalText.includes('BEGIN:VCALENDAR')) {
      throw new Error('Response does not appear to be a valid iCal feed');
    }

    const events = parseIcal(icalText);
    console.log(`[StStephensGreen] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[StStephensGreen] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
