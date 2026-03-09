/**
 * Martell's Tiki Bar scraper
 * Uses the Timely calendar API (calendar ID: 54704946)
 * Events page: https://tikibar.com/tiki-events/
 *
 * Strategy: Timely blocks direct API calls (403). We first fetch the
 * calendar embed page to grab session cookies, then use those cookies
 * for the API request.
 */

const CALENDAR_ID = '54704946';
const EMBED_SLUG = 'ixnvhbv0';
const VENUE_NAME = "Martell's Tiki Bar";
const SOURCE_URL = 'https://tikibar.com/tiki-events/';
const MAX_PAGES = 20;

/**
 * Fetch the Timely embed page to capture session cookies.
 */
async function getSessionCookies() {
  const res = await fetch(`https://calendar.time.ly/${EMBED_SLUG}/modern-list`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  // Extract Set-Cookie headers
  const cookies = [];
  const setCookieHeaders = res.headers.getSetCookie?.() || [];
  for (const header of setCookieHeaders) {
    // Extract just the name=value part (before the first ;)
    const nameValue = header.split(';')[0];
    if (nameValue) cookies.push(nameValue);
  }

  // Fallback: try raw header
  if (cookies.length === 0) {
    const raw = res.headers.get('set-cookie');
    if (raw) {
      for (const part of raw.split(/,(?=[^ ])/)) {
        const nameValue = part.split(';')[0].trim();
        if (nameValue) cookies.push(nameValue);
      }
    }
  }

  return cookies.join('; ');
}

export async function scrapeMartells() {
  try {
    // Step 1: Get session cookies from the embed page
    const cookieString = await getSessionCookies();

    const startDateUtc = Math.floor(Date.now() / 1000);
    const allEvents = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= MAX_PAGES) {
      const url =
        `https://calendar.time.ly/api/calendars/${CALENDAR_ID}/events` +
        `?timezone=America/New_York&view=modern_list` +
        `&start_date_utc=${startDateUtc}&per_page=50&page=${page}`;

      // Step 2: Call API with session cookies
      const res = await fetch(url, {
        headers: {
          'Cookie': cookieString,
          'Origin': 'https://calendar.time.ly',
          'Referer': `https://calendar.time.ly/${EMBED_SLUG}/modern-list`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`Timely API error: ${res.status}`);

      const json = await res.json();
      const data = json?.data;
      if (!data) throw new Error('Unexpected API response shape');

      for (const item of data.items || []) {
        if (item.is_example_event) continue;
        if (item.event_status !== 'confirmed') continue;
        if (!item.title || !item.start_utc_datetime) continue;

        // start_utc_datetime: "2026-03-15 17:00:00" → ISO UTC string
        const isoDate = item.start_utc_datetime.replace(' ', 'T') + 'Z';

        allEvents.push({
          title: item.title,
          venue: VENUE_NAME,
          date: isoDate,
          time: null,
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
