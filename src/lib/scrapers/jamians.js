/**
 * Jamian's Food & Drink scraper
 * Site: https://www.jamiansfood.com/music
 *
 * Squarespace site with a manually-typed plain-text music schedule.
 * NOT a Squarespace events collection — the ?format=json endpoint
 * returns an empty mainContent div.  We fetch the HTML directly and
 * parse the schedule text from Squarespace layout blocks.
 *
 * Page format:
 *   - Recurring weekly events at top (Pat Guadagno Mondays, Trivia Tuesdays, etc.)
 *   - Month headers: "February", "March"
 *   - Day + artist lines: "5 Skinny Amigo", "6 Black Dog"
 *   - Note: "Music starts Thurs 8pm Fri & Sat 9pm"
 *
 * Start-time rules (from the page):
 *   Thursday  → 8:00 PM
 *   Friday    → 9:00 PM
 *   Saturday  → 9:00 PM
 *   All other → 8:00 PM (default)
 *
 * If it breaks:
 *   1. Go to https://www.jamiansfood.com/music
 *   2. View page source and look for the schedule text
 *   3. It lives inside Squarespace layout blocks (div.sqs-block-content)
 *   4. Check that the text still follows "dayNumber ArtistName" pattern
 *
 * Address: 79 Monmouth Street, Red Bank, NJ 07701
 */

const MUSIC_URL = 'https://www.jamiansfood.com/music';
const VENUE = "Jamian's";
const VENUE_URL = 'https://www.jamiansfood.com/music';

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Given a day-of-week (0=Sun..6=Sat), return the default start time.
 * Thu=8pm, Fri/Sat=9pm, all others=8pm
 */
function defaultTime(dayOfWeek) {
  if (dayOfWeek === 5 || dayOfWeek === 6) return '9:00 PM';  // Fri, Sat
  return '8:00 PM'; // Thu and everything else
}

/**
 * Strip HTML tags and decode common entities.
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extract schedule text from the Squarespace HTML.
 * Look for sqs-block-content divs containing the schedule.
 */
function extractScheduleText(html) {
  // Grab all text content from sqs-block-content blocks
  const blocks = [];
  const blockPattern = /class="sqs-block-content"[^>]*>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = blockPattern.exec(html)) !== null) {
    const text = stripHtml(m[1]).trim();
    if (text) blocks.push(text);
  }

  // If we didn't find sqs-block-content blocks, try a broader approach
  if (blocks.length === 0) {
    // Try html-content blocks
    const htmlBlockPattern = /class="html-block[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    while ((m = htmlBlockPattern.exec(html)) !== null) {
      const text = stripHtml(m[1]).trim();
      if (text) blocks.push(text);
    }
  }

  // Also try sqs-html-content
  if (blocks.length === 0) {
    const sqsHtmlPattern = /class="sqs-html-content"[^>]*>([\s\S]*?)<\/div>/gi;
    while ((m = sqsHtmlPattern.exec(html)) !== null) {
      const text = stripHtml(m[1]).trim();
      if (text) blocks.push(text);
    }
  }

  return blocks.join('\n');
}

/**
 * Parse the schedule text into events.
 *
 * Expected patterns:
 *   "February"  (month header)
 *   "5 Skinny Amigo"  (day number + artist)
 *   "6 The ALT"
 *   ...
 *   "March"
 *   "5 Skinny Amigo"
 *   etc.
 *
 * Also handles recurring weekly events like:
 *   "Pat Guadagno Mondays 7pm-10pm"
 *   "Trivia Tuesdays 7:30pm"
 *   "Karaoke Wednesdays 8pm"
 *   "Open Mic Sundays 8pm"
 */
function parseSchedule(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const events = [];
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  let activeMonth = null;  // 0-based month index
  let activeYear = currentYear;

  // Track recurring weekly events separately
  const recurringEvents = [];

  for (const line of lines) {
    // Check for month header
    const monthIdx = MONTH_NAMES.indexOf(line.toLowerCase().trim());
    if (monthIdx !== -1) {
      activeMonth = monthIdx;
      // If the month is earlier than current month, assume next year
      if (monthIdx < currentMonth) {
        activeYear = currentYear + 1;
      } else {
        activeYear = currentYear;
      }
      continue;
    }

    // Check for "day artist" pattern: starts with 1-2 digit number followed by space and text
    const dayMatch = line.match(/^(\d{1,2})\s+(.+)$/);
    if (dayMatch && activeMonth !== null) {
      const dayNum = parseInt(dayMatch[1]);
      const artist = dayMatch[2].trim();

      // Validate day number (1-31)
      if (dayNum < 1 || dayNum > 31) continue;
      if (!artist) continue;

      // Skip lines that look like times or notes rather than artists
      if (/^(music starts|starts at|doors|show)/i.test(artist)) continue;

      const month = String(activeMonth + 1).padStart(2, '0');
      const day = String(dayNum).padStart(2, '0');
      const dateStr = `${activeYear}-${month}-${day}`;

      // Validate the date is real
      const testDate = new Date(`${dateStr}T12:00:00Z`);
      if (isNaN(testDate.getTime())) continue;
      if (testDate.getDate() !== dayNum) continue; // e.g. Feb 31 → invalid

      // Skip past dates
      if (dateStr < todayStr) continue;

      // Determine start time based on day of week
      const eventDate = new Date(`${dateStr}T12:00:00Z`);
      const dayOfWeek = eventDate.getDay(); // 0=Sun
      const time = defaultTime(dayOfWeek);

      const titleClean = artist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `jamians-${dateStr}-${titleClean}`;

      events.push({
        title: artist,
        venue: VENUE,
        date: dateStr,
        time,
        description: null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
      });
      continue;
    }

    // Check for recurring weekly events
    // Patterns like: "Pat Guadagno Mondays 7pm-10pm" or "Trivia Tuesdays 7:30pm"
    const recurringMatch = line.match(/^(.+?)\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\s*(.*)/i);
    if (recurringMatch) {
      const eventName = recurringMatch[1].trim();
      const dayName = recurringMatch[2].toLowerCase().replace(/s$/, '');
      const timeInfo = recurringMatch[3].trim();

      // Parse start time from timeInfo (e.g. "7pm-10pm", "7:30pm", "8pm")
      const timeMatch = timeInfo.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)/i);
      let time = '8:00 PM';
      if (timeMatch) {
        let [, t, period] = timeMatch;
        if (!t.includes(':')) t += ':00';
        time = `${t} ${period.toUpperCase()}`;
      }

      const dayMap = {
        'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0,
      };
      const targetDay = dayMap[dayName];
      if (targetDay === undefined) continue;

      recurringEvents.push({ eventName, targetDay, time });
      continue;
    }
  }

  // Generate recurring events for the next 8 weeks
  for (const rec of recurringEvents) {
    const startDate = new Date(now);
    for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + (weekOffset * 7));

      // Find the next occurrence of targetDay from d
      const diff = (rec.targetDay - d.getDay() + 7) % 7;
      const eventD = new Date(d);
      eventD.setDate(d.getDate() + diff);

      const dateStr = eventD.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (dateStr < todayStr) continue;

      const titleClean = rec.eventName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `jamians-${dateStr}-${titleClean}`;

      // Avoid duplicates with monthly events on the same date
      if (events.some(e => e.external_id === externalId)) continue;

      events.push({
        title: rec.eventName,
        venue: VENUE,
        date: dateStr,
        time: rec.time,
        description: null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
      });
    }
  }

  return events;
}

export async function scrapeJamians() {
  try {
    const res = await fetch(MUSIC_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching music page`);

    const html = await res.text();
    const scheduleText = extractScheduleText(html);

    if (!scheduleText) {
      throw new Error('Could not extract schedule text from page');
    }

    console.log(`[Jamians] Extracted schedule text (${scheduleText.length} chars)`);

    const events = parseSchedule(scheduleText);
    console.log(`[Jamians] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error("[Jamians] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
