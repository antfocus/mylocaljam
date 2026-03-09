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
 * Parse an iCal date string into a JS Date.
 * Handles: TZID format, UTC (Z), and floating dates.
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
 */
function parseIcal(icalText) {
  const events = [];
  const now = new Date();

  // Unfold lines (iCal wraps long lines with CRLF + space/tab)
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

      // Skip past events
      if (startDate < now) { current = {}; continue; }

      const title = decodeIcalText(current.summary || '');
      if (!title) { current = {}; continue; }

      // Build external_id from UID or title+date
      const uid = current.uid || `${title}-${current.dtstart}`;
      const externalId = `baranticipation-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 60)}`;

      // Format date and time for Eastern
      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
