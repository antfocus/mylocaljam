/**
 * The Osprey Nightclub (Manasquan) Scraper
 * URL: https://www.ospreynightclub.com/events
 *
 * Custom-built site (no WordPress / Squarespace / Wix / Dice / SeeTickets /
 * Prekindle / bandsintown / JSON-LD). Single server-rendered page listing
 * every upcoming show as a stack of `.c-single-event` blocks grouped by
 * month headings. Fastest-tier-class scraper — one fetch, no detail pages.
 *
 * ── DOM STRUCTURE (as of April 2026) ──
 * <div class="c-events-list">
 *   <h2>April 2026</h2>                 ← month heading (ignored)
 *   <div class="c-single-event none">
 *     <a href="detailsevent/42526manasquancaresfundraiser">
 *       <div class="row align-items-center">
 *         <div class="col-lg-6"><p>Manasquan Cares Fundraiser</p></div>
 *         <div class="col-lg-6 text-lg-end"><p>April 25, 2026 5:00-9:00 PM</p></div>
 *       </div>
 *     </a>
 *   </div>
 *   ...
 * </div>
 *
 * The anchor's `href` is relative (`detailsevent/<slug>`). We resolve to
 * an absolute ticket_url off the base origin.
 *
 * Title structure: the site encodes headliner + supporting act in a
 * single <p> separated by a <br>. We split on that boundary and rejoin
 * with " · " so the feed shows "Pulse · DJ Cole Pardi" instead of the
 * ambiguous blob "Pulse DJ Cole Pardi" (stripHtml collapsing the <br>
 * to a space was the source of the Tier-1 readability bug fixed on
 * 2026-04-24). Single-line titles like "Manasquan Cares Fundraiser"
 * pass through unchanged — the split returns one piece, the join is a
 * no-op. The dot separator is chosen because slugify() collapses any
 * non-alphanumeric run to a single hyphen, so external_id is stable
 * before/after this change (same slug as the old space-separated form).
 *
 * Date formats:
 *   "April 25, 2026 5:00-9:00 PM"   (range — take the start time)
 *   "May 02, 2026 9:00 PM"          (single time)
 *
 * External ID: no stable per-event ID is exposed in the DOM, so we
 * synthesize `osprey-<date>-<titleSlug>`, stable across runs while the
 * date + title remain unchanged.
 *
 * Address: The Osprey, 62 1st Ave, Manasquan, NJ 08736
 *
 * If it breaks:
 *   1. Open https://www.ospreynightclub.com/events
 *   2. Right-click an event → Inspect; confirm `.c-single-event` wraps
 *      `<a><div class="row"><div><p>TITLE</p></div><div><p>DATETIME</p></div></div></a>`
 *   3. If the class changes, update EVENT_BLOCK_MARKER.
 *   4. If date format changes, adjust parseDateTime().
 */

const VENUE = 'The Osprey';
const BASE_URL = 'https://www.ospreynightclub.com';
const PAGE_URL = `${BASE_URL}/events`;

// Splits on every event block. The `none` class trailing `c-single-event`
// is a leftover utility; matching both classes keeps us from catching any
// decorative `c-single-event--*` variant if the site ever adds one.
const EVENT_BLOCK_MARKER = /class="c-single-event[^"]*"/i;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse Osprey's datetime strings. Handles both:
 *   "April 25, 2026 5:00-9:00 PM"   → { date: "2026-04-25", time: "5:00 PM" }
 *   "May 02, 2026 9:00 PM"          → { date: "2026-05-02", time: "9:00 PM" }
 *
 * For ranges we keep the start time — that's what users care about for
 * "when does the show start." End time isn't tracked in our event schema.
 *
 * Note: a range like "5:00-9:00 PM" has the am/pm only on the end. We
 * assume both sides share the same meridiem (true for every event we've
 * seen; nightclub shows don't cross noon). If that ever breaks we'd need
 * to look at whether the start hour is reasonable for PM without it.
 */
function parseDateTime(raw) {
  if (!raw) return { date: null, time: null };
  const s = raw.trim().replace(/\s+/g, ' ');

  // Date: month word + day + year
  const dateMatch = s.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!dateMatch) return { date: null, time: null };
  const monthIdx = MONTHS[dateMatch[1].toLowerCase()];
  if (monthIdx === undefined) return { date: null, time: null };

  const day = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);
  const date = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Time: grab the FIRST h:mm pattern after the year. If it's followed
  // immediately by a hyphen and another h:mm (range form), we still only
  // want the first one. The am/pm is at the tail of whichever side has it.
  let time = null;
  const afterDate = s.slice(dateMatch[0].length);
  const startTime = afterDate.match(/(\d{1,2}):(\d{2})/);
  const meridiem = afterDate.match(/\b(am|pm)\b/i);
  if (startTime) {
    const hh = parseInt(startTime[1], 10);
    const mm = startTime[2];
    const ampm = meridiem ? meridiem[1].toUpperCase() : 'PM'; // default PM — this is a nightclub
    time = `${hh}:${mm} ${ampm}`;
  }
  return { date, time };
}

/**
 * Strip HTML tags + decode common entities + collapse whitespace.
 */
function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL-friendly slug for synthesizing external_id. Same shape as other
 * scrapers so the dedup logic downstream treats these IDs consistently.
 */
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Resolve a relative detailsevent href against the site origin.
 * Leaves absolute URLs alone (belt + suspenders — shouldn't happen).
 */
function absolutize(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

/**
 * Extract every event block from the page HTML and normalize each one
 * into { title, date, time, detailUrl }. Blocks missing a title or date
 * are dropped.
 */
function extractEvents(html) {
  const events = [];

  // Split on the block marker. blocks[0] is page header + preamble — skip.
  const blocks = html.split(EVENT_BLOCK_MARKER);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Anchor href → detail page (optional but useful for ticket_url).
    // We match `detailsevent/...` specifically to avoid picking up any
    // unrelated anchor the template might embed (social icons etc.).
    const hrefMatch = block.match(/<a[^>]*href="([^"]*detailsevent\/[^"]*)"/i);
    const detailUrl = hrefMatch ? absolutize(hrefMatch[1]) : null;

    // The first two <p> tags inside the row carry title and datetime.
    // Title <p> contains a <br> between headliner and supporting act —
    // split on that boundary and rejoin with " · " so the feed shows
    // "Pulse · DJ Cole Pardi" instead of stripHtml's "Pulse DJ Cole
    // Pardi" (space-collapsed <br>). Splitting per-<p> then stripping
    // each piece keeps the datetime paragraph unaffected (it has no
    // <br>, so split returns one piece).
    const pMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => {
        const pieces = m[1]
          .split(/<br\s*\/?>/i)
          .map(piece => stripHtml(piece))
          .filter(Boolean);
        return pieces.join(' · ');
      })
      .filter(Boolean);

    // Structurally: [title, datetime, ...optional decorative paragraphs].
    // If the site ever reorders these we'll need to key on a class
    // attribute instead — but they've been stable so far.
    const title = pMatches[0] || null;
    const rawDateTime = pMatches[1] || null;
    const { date, time } = parseDateTime(rawDateTime);

    if (!title || !date) continue;
    events.push({ title, date, time, detailUrl });
  }

  return events;
}

export async function scrapeOsprey() {
  try {
    const res = await fetch(PAGE_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Osprey events page`);
    }

    const html = await res.text();
    const extracted = extractEvents(html);

    console.log(`[Osprey] Parsed ${extracted.length} events from HTML`);

    // Filter to today-or-later (venue-local ET) so we don't re-upsert past shows.
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const seen = new Set();
    const events = [];
    for (const e of extracted) {
      if (e.date < todayET) continue;

      const externalId = `osprey-${e.date}-${slugify(e.title)}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: e.title,                      // raw concatenated headliner+opener — AI splits downstream
        venue: VENUE,
        date: e.date,
        time: e.time || null,
        description: null,                   // no description text on the listing page
        ticket_url: e.detailUrl || PAGE_URL, // per-event detail page if present, else the listing
        price: null,                          // no prices on the listing page
        source_url: PAGE_URL,
        image_url: null,                      // no per-event images on listing — cascade fills
        external_id: externalId,
      });
    }

    console.log(`[Osprey] ${events.length} upcoming events after date filter`);
    return { events, error: null };
  } catch (err) {
    console.error('[Osprey] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
