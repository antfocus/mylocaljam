/**
 * Jacks on the Tracks scraper
 * Calendar page: https://www.jacksbytracks.com/calendar
 *
 * Uses The Events Calendar broker API which proxies a Google Calendar.
 * API: https://broker.eventscalendar.co/api/google/events
 *
 * If it breaks:
 *   1. Go to https://www.jacksbytracks.com/calendar
 *   2. Open DevTools → Network tab → filter XHR
 *   3. Look for requests to broker.eventscalendar.co
 *   4. Update USER_ID, PROJECT_ID, and CALENDAR_ID below
 */

const USER_ID = 'user_owyofJjoX85Y2ScKhIYAQ';
const PROJECT_ID = 'proj_7CWF6zndYMQ7ie3lY7pxG';
const CALENDAR_ID = 'jackstracksnj@gmail.com';
const VENUE = 'Jacks on the Tracks';
const VENUE_URL = 'https://www.jacksbytracks.com/calendar';

export async function scrapeJacksOnTheTracks() {
  try {
    // Fetch events from now through ~6 months out
    const from = Date.now();
    const to = from + 180 * 24 * 60 * 60 * 1000;

    const url =
      `https://broker.eventscalendar.co/api/google/events` +
      `?user=${USER_ID}` +
      `&project=${PROJECT_ID}` +
      `&calendar=${encodeURIComponent(CALENDAR_ID)}` +
      `&from=${from}` +
      `&to=${to}` +
      `&options=undefined`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://plugin.eventscalendar.co',
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      },
    });

    if (!res.ok) throw new Error(`Events Calendar API error: ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected API response shape');

    const events = [];
    const now = new Date();

    for (const item of data) {
      if (!item.title || !item.start_time) continue;

      // Skip past events
      const startDate = new Date(item.start_time);
      if (startDate < now) continue;

      // Format time for display (e.g. "7:00 PM")
      const timeStr = startDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });

      // Format date as YYYY-MM-DD
      const dateStr = startDate.toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      });

      events.push({
        title: item.title.trim(),
        venue: VENUE,
        date: dateStr,
        time: timeStr,
        description: item.description || null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: `jackstracks-${item.id}`,
      });
    }

    console.log(`[JacksOnTheTracks] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[JacksOnTheTracks] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
