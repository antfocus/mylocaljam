/**
 * McCann's Tavern Scraper
 * Live music page: http://www.mccannstavernnj.com/live-music.html
 *
 * Uses an embedded Google Calendar (jacksbythetracknj@gmail.com).
 * We fetch the public iCal feed directly — no API key required.
 *
 * If it breaks:
 *   1. Go to mccannstavernnj.com/live-music.html
 *   2. Open DevTools console and run:
 *      Array.from(document.querySelectorAll('iframe')).map(f => f.src)
 *   3. Copy the `src=` parameter value from the Google Calendar embed URL
 *   4. Update CALENDAR_ID below
 */

const CALENDAR_ID = 'jacksbythetracknj@gmail.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE = "McCann's Tavern";
const VENUE_URL = 'http://www.mccannstavernnj.com';

function parseIcalDate(str) {
  if (!str) return null;

  const dateOnly = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00-05:00`);
  }

  const utcMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    return new Date(`${utcMatch[1]}-${utcMatch[2]}-${utcMatch[3]}T${utcMatch[4]}:${utcMatch[5]}:${utcMatch[6]}Z`);
  }

  const localMatch = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    return new Date(`${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}:${localMatch[6]}-05:00`);
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
      if (startDate < now) { current = {}; continue; }

      const title = decodeIcalText(current.summary || '');
      if (!title) { current = {}; continue; }

      const uid = current.uid || `${title}-${current.dtstart}`;
      const externalId = `mccanns-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;

      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

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

    if (line.startsWith('SUMMARY')) current.summary = extractValue(line);
    else if (line.startsWith('DTSTART')) current.dtstart = extractValue(line);
    else if (line.startsWith('DTEND')) current.dtend = extractValue(line);
    else if (line.startsWith('DESCRIPTION')) current.description = extractValue(line);
    else if (line.startsWith('URL')) current.url = extractValue(line);
    else if (line.startsWith('UID')) current.uid = extractValue(line);
  }

  return events;
}

export async function scrapeMcCanns() {
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
    console.log(`[McCanns] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[McCanns] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}