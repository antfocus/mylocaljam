/**
 * The Roost Restaurant scraper
 * Events page: https://theroostrestaurant.com/events
 *
 * Custom CMS site (Beacon/CoreGolf). Events are plain text in a <p> tag
 * with <br> separators. Format:
 *   - Month headers: "FEBRUARY", "MARCH"
 *   - Event lines: "3/6 Sean Cox" (month/day performer)
 *   - Recurring: "EVERY WEDNESDAY - Joe Vadala 6:30-8:30pm"
 *
 * If it breaks:
 *   1. Go to https://theroostrestaurant.com/events
 *   2. View source — look for the <p> containing month names and date lines
 *   3. Check if format changed from "M/D Performer" pattern
 */

const VENUE = 'The Roost';
const VENUE_URL = 'https://theroostrestaurant.com/events';

export async function scrapeTheRoost() {
  try {
    const res = await fetch(VENUE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching The Roost events`);

    const html = await res.text();

    // Find the <p> that contains the event schedule (has month names + date patterns)
    const pMatch = html.match(/<p[^>]*>([\s\S]*?(?:FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY)[\s\S]*?)<\/p>/i);
    if (!pMatch) throw new Error('Could not find event schedule paragraph');

    // Split by <br> tags to get individual lines
    const rawText = pMatch[1];
    const lines = rawText
      .replace(/<[^>]*>/g, '\n')  // replace HTML tags with newlines
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const events = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const seen = new Set();

    // Month name mapping
    const MONTHS = {
      JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3,
      MAY: 4, JUNE: 5, JULY: 6, AUGUST: 7,
      SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
    };

    let activeMonth = null; // track which month header we're under

    for (const line of lines) {
      // Check if this is a month header
      const monthKey = line.toUpperCase().trim();
      if (MONTHS[monthKey] !== undefined) {
        activeMonth = MONTHS[monthKey];
        continue;
      }

      // Match event lines: "3/6 Sean Cox" or "2/14 DJ Dominic Longo"
      const eventMatch = line.match(/^(\d{1,2})\/(\d{1,2})\s+(.+)$/);
      if (!eventMatch || activeMonth === null) continue;

      const month = parseInt(eventMatch[1], 10) - 1; // 0-indexed
      const day = parseInt(eventMatch[2], 10);
      const performer = eventMatch[3].trim();

      if (!performer) continue;

      // Determine the year — if month is before current month, assume next year
      let year = currentYear;
      if (month < currentMonth - 1) {
        year = currentYear + 1;
      }

      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Default time: Friday & Saturday events are 9PM, per the page header
      const time = '9:00 PM';

      // Build external ID
      const titleSlug = performer.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `theroost-${dateStr}-${titleSlug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: performer,
        venue: VENUE,
        date: dateStr,
        time,
        description: null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: null,
      });
    }

    console.log(`[TheRoost] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[TheRoost] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
