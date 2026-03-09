/**
 * Martell's Tiki Bar scraper
 * Uses the Timely calendar API (calendar ID: 54704946)
 * Events page: https://tikibar.com/tiki-events/
 */

const CALENDAR_ID = '54704946';
const VENUE_NAME = "Martell's Tiki Bar";
const SOURCE_URL = 'https://tikibar.com/tiki-events/';
const MAX_PAGES = 20;

export async function scrapeMartells() {
  try {
    const startDateUtc = Math.floor(Date.now() / 1000);
    const allEvents = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= MAX_PAGES) {
      const url =
        `https://calendar.time.ly/api/calendars/${CALENDAR_ID}/events` +
        `?timezone=America/New_York&view=modern_list` +
        `&start_date_utc=${startDateUtc}&per_page=50&page=${page}`;

      const res = await fetch(url, {
        headers: {
          'Origin': 'https://calendar.time.ly',
          'Referer': 'https://calendar.time.ly/ixnvhbv0/',
          'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        },
      });
      if (!res.ok) throw new Error(`Timely API error: ${res.status}`);

      const json = await res.json();
      const data = json?.data;
      if (!data) throw new Error('Unexpected API response shape');

      for (const item of data.items || []) {
        // Skip placeholder / example events
        if (item.is_example_event) continue;
        // Only confirmed events
        if (item.event_status !== 'confirmed') continue;
        // Must have a title and start time
        if (!item.title || !item.start_utc_datetime) continue;

        // start_utc_datetime: "2026-03-15 17:00:00" → ISO UTC string
        const isoDate = item.start_utc_datetime.replace(' ', 'T') + 'Z';

        allEvents.push({
          title: item.title,
          venue: VENUE_NAME,
          date: isoDate,          // full ISO — mapEvent will use as-is (contains 'T')
          time: null,             // not needed when date is full ISO
          external_id: `martells-${item.id}`,
          ticket_url: item.custom_url
            ? `https://tikibar.com/event/${item.custom_url}/`
            : null,
          price:
            item.cost_display && item.cost_display !== '0'
              ? item.cost_display
              : null,
          source_url: SOURCE_URL,
        });
      }

      hasNext = data.has_next === true;
      page++;
    }

    return { events: allEvents, error: null };
  } catch (err) {
    return { events: [], error: err.message };
  }
}
