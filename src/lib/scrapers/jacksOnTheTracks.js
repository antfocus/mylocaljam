/**
 * Jacks on the Tracks scraper
 * Calendar page: https://www.jacksbytracks.com/calendar
 *
 * Uses the public Google Calendar iCal feed (jackstracksnj@gmail.com).
 * The website uses Events Calendar broker to display events, but the
 * underlying Google Calendar is publicly accessible via iCal.
 *
 * If it breaks:
 *   1. Go to https://www.jacksbytracks.com/calendar
 *   2. Open DevTools → Network → look for broker.eventscalendar.co requests
 *   3. Find the calendar= parameter — that's the Google Calendar ID
 *   4. Update CALENDAR_ID below
 */

const CALENDAR_ID = 'jackstracksnj@gmail.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE = 'Jacks on the Tracks';
const VENUE_URL = 'https://www.jacksbytracks.com/calendar';

/**
 * Parse an iCal date string into a JS Date.
 */
function parseIcalDate(str) {
  if (!str) return null;

  // DATE only: 20260315
  const dateOnly = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00-05:00`);
  }

  // DateTime UTC: 20260315T210000Z
  const utcMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    return new Date(
      `${utcMatch[1]}-${utcMatch[2]}-${utcMatch[3]}T${utcMatch[4]}:${utcMatch[5]}:${utcMatch[6]}Z`
    );
  }

  // DateTime floating or with TZID: 20260315T210000
  const localMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    return new Date(
      `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}:${localMatch[6]}-05:00`
    );
  }

  return null;
}

function extractValue(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return '';
  return line.slice(colonIdx + 1).trim();
}

function decodeIcalText(str) {
  return str
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcal(icalText) {
  const events = [];
  const now = new Date();

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

      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Include date in external_id so recurring events (same UID) get unique IDs
      const uid = current.uid || `${title}-${current.dtstart}`;
      const uidClean = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
      const externalId = `jackstracks-${dateStr}-${uidClean}`;
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

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
      });

      current = {};
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith('SUMMARY')) current.summary = extractValue(line);
    else if (line.startsWith('DTSTART')) current.dtstart = extractValue(line);
    else if (line.startsWith('DTEND')) current.dtend = extractValue(line);
    else if (line.startsWith('DESCRIPTION')) current.description = extractValue(line);
    else if (line.startsWith('URL')) current.url = extractValue(line);
    else if (line.startsWith('UID')) current.uid = extractValue(line);
  }

  return events;
}

export async function scrapeJacksOnTheTracks() {
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
    console.log(`[JacksOnTheTracks] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[JacksOnTheTracks] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
