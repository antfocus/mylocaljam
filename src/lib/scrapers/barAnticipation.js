/**
 * Bar Anticipation (Bar A) scraper
 * Entertainment calendar: https://bar-a.com/entertainment-calendar/
 *
 * Uses the All-in-One Event Calendar (AILEC) iCal export feed.
 * iCal URL: https://bar-a.com/?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events
 *
 * If it breaks:
 *   1. Go to https://bar-a.com/entertainment-calendar/
 *   2. Look for an "Export" or "Subscribe" link
 *   3. Update ICAL_URL below with the new export URL
 */

const ICAL_URL =
  'https://bar-a.com/?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events';
const VENUE = 'Bar Anticipation';
const VENUE_URL = 'https://bar-a.com/entertainment-calendar/';

/**
 * Return the correct Eastern UTC offset for a given date string (YYYY-MM-DD).
 * EDT (UTC-4) from 2nd Sun Mar → 1st Sun Nov, else EST (UTC-5).
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

/**
 * Parse an iCal date string into a JS Date.
 * Handles: TZID format, UTC (Z), and floating dates.
 * Uses dynamic EST/EDT offset for non-UTC dates.
 */
function parseIcalDate(str) {
  if (!str) return null;

  // DATE only: 20260315
  const dateOnly = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const ds = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    return new Date(`${ds}T00:00:00${easternOffset(ds)}`);
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
    const ds = `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}`;
    return new Date(
      `${ds}T${localMatch[4]}:${localMatch[5]}:${localMatch[6]}${easternOffset(ds)}`
    );
  }

  return null;
}

/** Extract the value after the colon in an iCal property line. */
function extractValue(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return '';
  return line.slice(colonIdx + 1).trim();
}

/** Decode iCal text escapes. */
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
 * Handles RDATE recurring dates — each RDATE becomes its own event.
 */
function parseIcal(icalText) {
  const events = [];
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const seen = new Set();

  // Unfold lines (iCal wraps long lines with CRLF + space/tab)
  const unfolded = icalText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);

  let inEvent = false;
  let current = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = { rdates: [] };
      continue;
    }

    if (line === 'END:VEVENT') {
      inEvent = false;

      const title = decodeIcalText(current.summary || '');
      if (!title) { current = {}; continue; }

      // Collect all dates: DTSTART + all RDATEs
      const allDates = [];
      const startDate = parseIcalDate(current.dtstart);
      if (startDate) allDates.push(startDate);
      for (const rd of current.rdates) {
        const d = parseIcalDate(rd);
        if (d) allDates.push(d);
      }

      // Create an event for each future date
      for (const date of allDates) {
        const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (dateStr < todayStr) continue;

        const timeStr = date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        });

        // Deduplicate by title + date (different VEVENTs can produce the same event)
        const titleDateKey = `${title.toLowerCase().trim()}|${dateStr}`;
        if (seen.has(titleDateKey)) continue;
        seen.add(titleDateKey);

        // Include date in external_id so each occurrence is unique
        const titleClean = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
        const externalId = `baranticipation-${dateStr}-${titleClean}`;

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
      }

      current = {};
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith('SUMMARY')) current.summary = extractValue(line);
    else if (line.startsWith('DTSTART')) current.dtstart = extractValue(line);
    else if (line.startsWith('DTEND')) current.dtend = extractValue(line);
    else if (line.startsWith('RDATE')) current.rdates.push(extractValue(line));
    else if (line.startsWith('DESCRIPTION')) current.description = extractValue(line);
    else if (line.startsWith('URL')) current.url = extractValue(line);
    else if (line.startsWith('UID')) current.uid = extractValue(line);
  }

  return events;
}

export async function scrapeBarAnticipation() {
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
    console.log(`[BarAnticipation] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BarAnticipation] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
