/**
 * 10th Ave Burrito scraper
 * Events page: https://tenthaveburrito.com/events/
 *
 * WordPress + Elementor + JetEngine Listing Calendar.
 * The REST API (wp-json/wp/v2/events-calender) returns posts but does NOT
 * expose the `date` custom meta field.  Instead, the calendar widget loads
 * events via an XHR POST to the events page with action
 * `jet_engine_calendar_get_month`.
 *
 * We replicate that POST for the current and next 2 months, then parse
 * event names, dates, and times from the returned HTML.
 *
 * If it breaks:
 *   1. Go to https://tenthaveburrito.com/events/
 *   2. Open DevTools → Network, click a month arrow
 *   3. Check the POST body params (settings[lisitng_id], post, etc.)
 *   4. Update the SETTINGS object below if IDs have changed
 */

const EVENTS_URL = 'https://tenthaveburrito.com/events/';
const VENUE = '10th Ave Burrito';
const VENUE_URL = 'https://tenthaveburrito.com/events/';

/* JetEngine calendar widget settings (captured from live site) */
const SETTINGS = {
  'jet_engine_action': 'jet_engine_calendar_get_month',
  'settings[lisitng_id]': '846',
  'settings[week_days_format]': 'short',
  'settings[allow_multiday]': '',
  'settings[end_date_key]': '',
  'settings[group_by]': 'meta_date',
  'settings[group_by_key]': 'date',
  'settings[meta_query_relation]': 'AND',
  'settings[tax_query_relation]': 'AND',
  'settings[hide_widget_if]': '',
  'settings[caption_layout]': 'layout-4',
  'settings[show_posts_nearby_months]': 'yes',
  'settings[hide_past_events]': '',
  'settings[allow_date_select]': '',
  'settings[start_year_select]': '1970',
  'settings[end_year_select]': '2038',
  'settings[use_custom_post_types]': '',
  'settings[custom_post_types]': '',
  'settings[custom_query]': '',
  'settings[custom_query_id]': '',
  'settings[_element_id]': '',
  'settings[cache_enabled]': '',
  'settings[cache_timeout]': '60',
  'settings[max_cache]': '12',
  'settings[_id]': '01c5ab5',
  'settings[renderer]': '',
  'settings[__switch_direction]': '1',
  'post': '823',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Fetch one month of calendar HTML from JetEngine.
 * Returns raw HTML string or null on failure.
 */
async function fetchMonth(monthName, year) {
  const body = new URLSearchParams({
    ...SETTINGS,
    month: `${monthName} ${year}`,
  });

  const res = await fetch(`${EVENTS_URL}?nocache=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
      'Accept': '*/*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': EVENTS_URL,
    },
    body: body.toString(),
  });

  if (!res.ok) return null;
  const text = await res.text();
  return text;
}

/**
 * Parse events from JetEngine calendar HTML response.
 *
 * The HTML contains calendar day cells like:
 *   <div class="jet-calendar-week__day" data-day="15">
 *     ...
 *       <div class="jet-listing-dynamic-post-XXXX">
 *         ... event title ...
 *         ... time like "12:00 PM" ...
 *       </div>
 *     ...
 *   </div>
 *
 * We look for day cells with event content and extract title + time.
 */
function parseCalendarHTML(html, year, monthIndex) {
  const events = [];
  if (!html) return events;

  const month = String(monthIndex + 1).padStart(2, '0');

  // Match each day cell: data-day="N" ... content ... next day cell
  const dayPattern = /data-day="(\d{1,2})"([\s\S]*?)(?=data-day="|<\/div>\s*<\/div>\s*<\/div>\s*$)/gi;
  let match;

  while ((match = dayPattern.exec(html)) !== null) {
    const dayNum = parseInt(match[1]);
    const dayContent = match[2];

    // Check if this day has any event (jet-listing-dynamic-post-)
    if (!dayContent.includes('jet-listing-dynamic-post-')) continue;

    // Extract each event block within this day
    const eventBlocks = dayContent.split('jet-listing-dynamic-post-').slice(1);

    for (const block of eventBlocks) {
      // Get post ID
      const idMatch = block.match(/^(\d+)/);
      const postId = idMatch ? idMatch[1] : null;

      // Extract event title — look for the dynamic-field content that's NOT a time
      const fieldContents = [];
      const fieldPattern = /jet-listing-dynamic-field__content"?>([^<]+)</g;
      let fm;
      while ((fm = fieldPattern.exec(block)) !== null) {
        const val = fm[1].replace(/&amp;/g, '&')
          .replace(/&#8217;/g, '\u2019')
          .replace(/&#8216;/g, '\u2018')
          .replace(/&#038;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .trim();
        if (val) fieldContents.push(val);
      }

      // Also try heading tags
      const headingPattern = /<(?:h[1-6])[^>]*>([^<]+)<\/(?:h[1-6])>/gi;
      while ((fm = headingPattern.exec(block)) !== null) {
        const val = fm[1].replace(/&amp;/g, '&')
          .replace(/&#8217;/g, '\u2019')
          .replace(/&#8216;/g, '\u2018')
          .replace(/&#038;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .trim();
        if (val && !fieldContents.includes(val)) fieldContents.push(val);
      }

      if (fieldContents.length === 0) continue;

      // Separate title from time
      let title = null;
      let timeStr = null;

      for (const val of fieldContents) {
        if (/^\d{1,2}:\d{2}\s*(?:AM|PM)$/i.test(val)) {
          timeStr = val;
        } else if (!title && val.length > 1 && !/^\d+$/.test(val)) {
          title = val;
        }
      }

      if (!title) continue;

      // Clean up title: remove leading/trailing special chars
      title = title.replace(/^\*\s*/, '').replace(/\s*\*$/, '').trim();
      if (!title) continue;

      const day = String(dayNum).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      events.push({ title, dateStr, timeStr, postId });
    }
  }

  return events;
}

export async function scrapeTenthAveBurrito() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const events = [];
    const seen = new Set();

    // Fetch current month + next 2 months
    for (let offset = 0; offset < 3; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const monthName = MONTH_NAMES[d.getMonth()];
      const year = d.getFullYear();

      const html = await fetchMonth(monthName, year);
      if (!html) continue;

      const monthEvents = parseCalendarHTML(html, year, d.getMonth());

      for (const ev of monthEvents) {
        if (ev.dateStr < todayStr) continue;

        const titleClean = ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
        const externalId = `10thaveburrito-${ev.dateStr}-${titleClean}`;

        if (seen.has(externalId)) continue;
        seen.add(externalId);

        events.push({
          title: ev.title,
          venue: VENUE,
          date: ev.dateStr,
          time: ev.timeStr,
          description: null,
          ticket_url: VENUE_URL,
          price: null,
          source_url: VENUE_URL,
          external_id: externalId,
        });
      }
    }

    console.log(`[10th Ave Burrito] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[10th Ave Burrito] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
