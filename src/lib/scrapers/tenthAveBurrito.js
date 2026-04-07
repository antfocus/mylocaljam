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
 *   5. Check if the HTML structure of day cells has changed
 *      (look for data-day="N" and jet-listing-dynamic-post- patterns)
 *
 * COMMON FAILURE MODES:
 *   - Widget settings IDs change after a WordPress/Elementor update
 *     → POST returns empty HTML or error → 0 events → WARN status
 *   - HTML class names change (e.g. "jet-listing-dynamic-field__content")
 *     → Parser finds 0 events from valid HTML → WARN status
 *   - Site switches to a different calendar plugin (The Events Calendar, etc.)
 *     → POST returns 404 or garbage → need full rewrite
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

  if (!res.ok) {
    console.warn(`[10th Ave Burrito] HTTP ${res.status} for ${monthName} ${year}`);
    return null;
  }

  const text = await res.text();

  // ── Diagnostic: detect empty/error responses ──
  if (!text || text.trim().length < 50) {
    console.warn(`[10th Ave Burrito] Empty or near-empty response for ${monthName} ${year} (${text.length} chars)`);
    return null;
  }

  // Check if response contains calendar structure
  if (!text.includes('data-day=') && !text.includes('jet-calendar')) {
    console.warn(`[10th Ave Burrito] Response for ${monthName} ${year} has no calendar structure — possible widget ID mismatch. First 200 chars: ${text.slice(0, 200)}`);
    // Still return the text so we can try parsing — might be a different format
  }

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

  // Match each day cell: data-day="N" ... content ... next day cell or end
  // Improved regex: more permissive end anchor to avoid missing the last day
  const dayPattern = /data-day="(\d{1,2})"([\s\S]*?)(?=data-day="|$)/gi;
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

      // Pattern 1: jet-listing-dynamic-field__content (standard JetEngine)
      const fieldPattern = /jet-listing-dynamic-field__content[^>]*>([^<]+)</g;
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

      // Pattern 2: heading tags (h1-h6)
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

      // Pattern 3: Fallback — any text node inside a link or span with a class
      // containing "title", "name", or "heading" (catches layout changes)
      const titleFallback = /class="[^"]*(?:title|name|heading)[^"]*"[^>]*>([^<]+)</gi;
      while ((fm = titleFallback.exec(block)) !== null) {
        const val = fm[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
        if (val && val.length > 1 && !fieldContents.includes(val)) fieldContents.push(val);
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

/**
 * Fallback parser: Try to extract events from HTML that may not use
 * the JetEngine calendar structure (in case they switched plugins).
 * Looks for common WordPress event patterns:
 *   - The Events Calendar (tribe-events)
 *   - Simple list/grid layouts with dates and titles
 */
function parseFallbackHTML(html) {
  const events = [];
  if (!html) return events;

  // The Events Calendar (Tribe) pattern
  const tribePattern = /<article[^>]*class="[^"]*tribe_events[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
  let articleMatch;
  while ((articleMatch = tribePattern.exec(html)) !== null) {
    const article = articleMatch[0];
    const titleMatch = article.match(/class="[^"]*tribe-events-list-event-title[^"]*"[^>]*>.*?<a[^>]*>([^<]+)/i)
      || article.match(/<h[1-6][^>]*>.*?<a[^>]*>([^<]+)/i);
    const dateMatch = article.match(/datetime="(\d{4}-\d{2}-\d{2})/);
    const timeMatch = article.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);

    if (titleMatch && dateMatch) {
      events.push({
        title: titleMatch[1].trim(),
        dateStr: dateMatch[1],
        timeStr: timeMatch ? timeMatch[1] : null,
        postId: null,
      });
    }
  }

  // Generic event block pattern: look for date + title combos
  if (events.length === 0) {
    const dateBlocks = html.matchAll(/(\d{4}-\d{2}-\d{2})[\s\S]{0,200}?(?:title|name|heading)[^>]*>([^<]{2,80})</gi);
    for (const m of dateBlocks) {
      events.push({ title: m[2].trim(), dateStr: m[1], timeStr: null, postId: null });
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
    let totalHtmlLength = 0;
    let usedFallback = false;

    // Fetch current month + next 2 months
    for (let offset = 0; offset < 3; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const monthName = MONTH_NAMES[d.getMonth()];
      const year = d.getFullYear();

      const html = await fetchMonth(monthName, year);
      if (!html) continue;
      totalHtmlLength += html.length;

      // Try primary parser first
      let monthEvents = parseCalendarHTML(html, year, d.getMonth());

      // If primary parser returns 0 but we got HTML, try fallback
      if (monthEvents.length === 0 && html.length > 200) {
        console.warn(`[10th Ave Burrito] Primary parser found 0 events in ${monthName} ${year} (${html.length} chars HTML) — trying fallback parser`);
        monthEvents = parseFallbackHTML(html);
        if (monthEvents.length > 0) usedFallback = true;
      }

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

    // ── Diagnostic logging ──
    if (events.length === 0) {
      if (totalHtmlLength === 0) {
        console.error('[10th Ave Burrito] All month fetches returned null — possible endpoint change or site down');
      } else {
        console.error(`[10th Ave Burrito] Got ${totalHtmlLength} chars of HTML but parsed 0 events — likely widget ID mismatch or HTML structure change`);
      }
    } else if (usedFallback) {
      console.warn(`[10th Ave Burrito] Used fallback parser — site may have switched calendar plugins`);
    }

    console.log(`[10th Ave Burrito] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[10th Ave Burrito] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
