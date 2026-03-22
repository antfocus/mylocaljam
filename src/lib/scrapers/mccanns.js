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

const CALENDAR_ID = 'jacksbythetracksnj@gmail.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(CALENDAR_ID)}/public/basic.ics`;
const VENUE = "McCann's Tavern";
const VENUE_URL = 'http://www.mccannstavernnj.com';

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

/**
 * Extract a start time from title strings like:
 *   "Kevin Hill 6-9"        → { time: "6:00 PM", cleaned: "Kevin Hill" }
 *   "Jazz Trio 7pm"         → { time: "7:00 PM", cleaned: "Jazz Trio" }
 *   "Open Mic 6:30-9:30"    → { time: "6:30 PM", cleaned: "Open Mic" }
 *   "Blues Night 8pm-11pm"  → { time: "8:00 PM", cleaned: "Blues Night" }
 *   "Kevin Hill"            → null (no time found)
 */
function extractTimeFromTitle(title) {
  if (!title) return null;

  // Pattern 1: "6:30pm-9:30pm" or "6:30-9:30" or "6pm-9pm" or "6-9" (with optional am/pm)
  const rangeRe = /\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;
  const rangeMatch = title.match(rangeRe);
  if (rangeMatch) {
    let hour = parseInt(rangeMatch[1], 10);
    const min = rangeMatch[2] || '00';
    const startMeridiem = rangeMatch[3];
    const endHour = parseInt(rangeMatch[4], 10);
    const endMeridiem = rangeMatch[6];

    // Determine AM/PM: if explicitly stated use it, otherwise infer
    // Most bar/venue events are PM, and if start < end and both < 12, assume PM
    let meridiem = 'PM';
    if (startMeridiem) {
      meridiem = startMeridiem.toUpperCase();
    } else if (endMeridiem) {
      // If end is AM (e.g., 8-1am), start is still PM
      // If end is PM, start is PM too
      meridiem = 'PM';
    } else {
      // No meridiem at all (e.g., "6-9") — assume PM for bar events
      meridiem = 'PM';
    }

    if (meridiem === 'PM' && hour < 12) hour = hour; // keep as-is, will format with PM
    const timeStr = `${hour}:${min.padStart(2, '0')} ${meridiem}`;
    const cleaned = title.replace(rangeRe, '').trim();
    return { time: timeStr, cleaned };
  }

  // Pattern 2: standalone "7pm" or "8:30pm" at end of title
  const singleRe = /\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i;
  const singleMatch = title.match(singleRe);
  if (singleMatch) {
    const hour = parseInt(singleMatch[1], 10);
    const min = singleMatch[2] || '00';
    const meridiem = singleMatch[3].toUpperCase();
    const timeStr = `${hour}:${min.padStart(2, '0')} ${meridiem}`;
    const cleaned = title.replace(singleRe, '').trim();
    return { time: timeStr, cleaned };
  }

  return null;
}

/**
 * Check if a DTSTART value is a date-only (all-day) event vs. one with a real time.
 * Date-only: "20260322"
 * With time: "20260322T190000Z" or "20260322T190000"
 */
function isAllDayEvent(dtstart) {
  return dtstart && /^\d{8}$/.test(dtstart);
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

      const rawTitle = decodeIcalText(current.summary || '');
      if (!rawTitle) { current = {}; continue; }

      const allDay = isAllDayEvent(current.dtstart);

      // Try to extract time from title (e.g., "Kevin Hill 6-9" → 6:00 PM)
      const titleTime = extractTimeFromTitle(rawTitle);
      const title = titleTime ? titleTime.cleaned : rawTitle;

      let timeStr = null;
      if (titleTime) {
        // Time was embedded in the title — use it
        timeStr = titleTime.time;
      } else if (!allDay) {
        // Real timed event from Google Calendar — use the actual time
        timeStr = startDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        });
        // If the resolved time is exactly midnight, it's likely a default — treat as NULL
        const h = startDate.getUTCHours();
        const m = startDate.getUTCMinutes();
        const offset = easternOffset(startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
        const offsetHours = parseInt(offset.split(':')[0], 10);
        const easternHour = (h + offsetHours + 24) % 24;
        if (easternHour === 0 && m === 0) {
          timeStr = null; // midnight default → treat as missing
        }
      }
      // else: all-day event with no time in title → timeStr stays null

      const uid = current.uid || `${title}-${current.dtstart}`;
      const externalId = `mccanns-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40)}`;

      const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

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
