/**
 * The Vogel (Count Basie Center for the Arts) scraper
 * Site: https://thebasie.org/venue/the-vogel/
 *
 * WordPress site with custom event post type. No REST API for events.
 * The venue page lists all upcoming events as `article.event` cards
 * with date/time text, title, ticket link, and image — all on one page
 * (no pagination).
 *
 * Card text format:
 *   "MARCH 12 • 7:30PM"       (month day • time)
 *   "FRI • MARCH 13 • 8PM"    (day-of-week • month day • time)
 *   "NEW DATE! FRI OCT 23 • 8PM"  (prefix note + day-of-week + month day • time)
 *   Title on next line, then "BUY TICKETS" or "SOLD OUT"
 *
 * If it breaks:
 *   1. Go to https://thebasie.org/venue/the-vogel/
 *   2. Inspect an event card — should be `article.event`
 *   3. Check the inner text format for date/time parsing
 *   4. Check if pagination was added (currently all events on one page)
 *
 * Address: 99 Monmouth St, Red Bank, NJ 07701
 */

const VENUE_PAGE = 'https://thebasie.org/venue/the-vogel/';
const VENUE = 'The Vogel';
const VENUE_URL = 'https://thebasie.org/venue/the-vogel/';

const MONTH_MAP = {
  'january': 0, 'february': 1, 'march': 2, 'april': 3,
  'may': 4, 'june': 5, 'july': 6, 'august': 7,
  'september': 8, 'october': 9, 'november': 10, 'december': 11,
  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3,
  'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'sept': 8,
  'oct': 9, 'nov': 10, 'dec': 11,
};

/**
 * Parse the date/time line from event card text.
 *
 * Examples:
 *   "MARCH 12 • 7:30PM"
 *   "FRI • MARCH 13 • 8PM"
 *   "NEW DATE! FRI OCT 23 • 8PM"
 *   "SAT • MARCH 14 • 8PM"
 *
 * Returns { dateStr: "YYYY-MM-DD", time: "7:30 PM" } or null
 */
function parseDateTimeLine(line) {
  if (!line) return null;

  // Normalize: uppercase, remove dots/commas
  const clean = line.toUpperCase().replace(/[.,]/g, '').trim();

  // Extract time: look for pattern like "7:30PM" or "8PM"
  const timeMatch = clean.match(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i);
  let time = null;
  if (timeMatch) {
    let [, t, period] = timeMatch;
    if (!t.includes(':')) t += ':00';
    time = `${t} ${period}`;
  }

  // Extract month and day: look for "MONTH DD" pattern
  const monthDayMatch = clean.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+(\d{1,2})\b/);
  if (!monthDayMatch) return null;

  const monthName = monthDayMatch[1].toLowerCase();
  const monthIdx = MONTH_MAP[monthName];
  if (monthIdx === undefined) return null;

  const day = parseInt(monthDayMatch[2]);
  if (day < 1 || day > 31) return null;

  // Determine year: if the month is before the current month, assume next year
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const year = monthIdx < currentMonth ? currentYear + 1 : currentYear;

  const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Validate date
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  if (isNaN(testDate.getTime()) || testDate.getDate() !== day) return null;

  return { dateStr, time };
}

/**
 * Parse event cards from HTML.
 * Each card is an <article class="event"> with:
 *   - <a class="event__thumb" href="..."> (link + image)
 *   - <img> inside the link (image)
 *   - Text content: "DATE • TIME\n\nTitle\nBUY TICKETS|SOLD OUT"
 */
function parseEvents(html) {
  const events = [];

  // Split on article.event boundaries (may have extra attributes like itemscope)
  const cardPattern = /<article\s+class="event"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = cardPattern.exec(html)) !== null) {
    const card = match[1];

    // Extract link
    const linkMatch = card.match(/<a[^>]*href="([^"]+)"[^>]*>/);
    const eventUrl = linkMatch ? linkMatch[1] : null;

    // Extract image
    const imgMatch = card.match(/<img[^>]*src="([^"]+)"[^>]*/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // Extract title: look for heading tags or specific class
    const titleMatch = card.match(/<(?:h[1-6])[^>]*class="[^"]*event-title[^"]*"[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i)
      || card.match(/<(?:h[1-6])[^>]*class="[^"]*event__title[^"]*"[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i)
      || card.match(/<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i);
    let title = null;
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Extract date/time: look for the date element or parse from text
    const dateElMatch = card.match(/<[^>]*class="[^"]*event-showDate[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i)
      || card.match(/<[^>]*class="[^"]*event__date[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
    let dateTimeLine = null;
    if (dateElMatch) {
      dateTimeLine = dateElMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // If we couldn't get structured date/title, parse from full text
    if (!dateTimeLine || !title) {
      const textContent = card
        .replace(/<[^>]*>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&#8217;/g, '\u2019')
        .replace(/&#8216;/g, '\u2018')
        .replace(/&#038;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
        .trim();

      const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);

      // First non-empty line with a month name is the date line
      if (!dateTimeLine) {
        for (const line of lines) {
          if (/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b/i.test(line)) {
            dateTimeLine = line;
            break;
          }
        }
      }

      // Title is usually the line after the date line, before "BUY TICKETS"/"SOLD OUT"
      if (!title) {
        for (const line of lines) {
          if (/BUY TICKETS|SOLD OUT|RESCHEDULED/i.test(line)) continue;
          if (/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(line) && /\d{1,2}/.test(line)) continue;
          if (line.length > 2 && !/^(NEW DATE|POSTPONED|CANCELLED)/i.test(line)) {
            title = line;
            break;
          }
        }
      }
    }

    if (!title || !dateTimeLine) continue;

    const parsed = parseDateTimeLine(dateTimeLine);
    if (!parsed) continue;

    events.push({
      title,
      dateStr: parsed.dateStr,
      time: parsed.time,
      eventUrl,
      imageUrl,
    });
  }

  return events;
}

export async function scrapeTheVogel() {
  try {
    const res = await fetch(VENUE_PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        'Accept': 'text/html',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching venue page`);

    const html = await res.text();
    const parsed = parseEvents(html);

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const events = [];
    const seen = new Set();

    for (const ev of parsed) {
      if (ev.dateStr < todayStr) continue;

      const titleClean = ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `vogel-${ev.dateStr}-${titleClean}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: ev.title,
        venue: VENUE,
        date: ev.dateStr,
        time: ev.time,
        description: null,
        ticket_url: ev.eventUrl || VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: ev.imageUrl || null,
      });
    }

    console.log(`[The Vogel] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[The Vogel] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
