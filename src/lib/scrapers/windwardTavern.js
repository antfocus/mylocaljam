/**
 * Windward Tavern scraper
 * Site: https://www.windwardtavern.com/music-events
 *
 * Google Calendar embed on the events page.
 * Calendar ID: windwardtavern@gmail.com
 * Uses the public iCal feed — no API key required.
 *
 * Live music Fridays & Saturdays, plus weekly food specials on Mondays.
 * The iCal feed includes both music events and food specials —
 * we keep everything since the calendar mixes them.
 *
 * If it breaks:
 *   1. Go to https://www.windwardtavern.com/music-events
 *   2. Scroll to the Google Calendar embed
 *   3. Inspect the iframe src and grab the `src=` parameter (the calendar ID)
 *   4. Update CALENDAR_ID below
 *
 * Address: 400 Ocean Ave N, Long Branch, NJ 07740
 */

const CALENDAR_ID = 'windwardtavern@gmail.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE = 'Windward Tavern';
const VENUE_URL = 'https://www.windwardtavern.com/music-events';

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

      const eventDateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (eventDateStr < todayStr) { current = {}; continue; }

      const title = decodeIcalText(current.summary || '');
      if (!title) { current = {}; continue; }

      // Include date in external_id to handle recurring events with same UID
      const uid = current.uid || `${title}-${current.dtstart}`;
      const uidClean = uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
      const externalId = `windward-${eventDateStr}-${uidClean}`;

      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      events.push({
        title,
        venue: VENUE,
        date: eventDateStr,
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

export async function scrapeWindwardTavern() {
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
    console.log(`[WindwardTavern] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[WindwardTavern] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
