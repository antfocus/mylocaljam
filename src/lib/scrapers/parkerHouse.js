/**
 * The Parker House (Sea Girt) Scraper
 * URL: https://parkerhousenj.com/entertainment-schedule/
 *
 * WordPress custom theme "parker-house-2026" with a single server-rendered
 * page that lists EVERY upcoming show in one HTML response. No AJAX, no
 * pagination, no detail pages — fastest scraper in the set.
 *
 * ── DOM STRUCTURE (as of April 2026) ──
 * <section id="block-entertainment_schedule_block-1" class="entertainment_schedule_block">
 *   <div class="container container-narrow fade-group">           ← one per month
 *     <h3 class="text-center">May 2026</h3>
 *     <div class="row justify-content-center fade-item mb-m">     ← one per event
 *       <div class="col-12 col-lg-7 mobile-center text-left">
 *         <h5>ARTIST NAME</h5>
 *         <span class="d-block d-lg-none bold-weight">May 20, 2026 6:00 pm</span>  ← mobile dupe
 *         <p>ROOM NAME</p>                                         ← "The Tavern" / "Raw Bar" / etc.
 *       </div>
 *       <div class="col-12 d-none d-lg-inline-block col-lg-5 text-right mobile-center">
 *         <span class="bold-weight">May 20, 2026 6:00 pm</span>   ← desktop date/time
 *       </div>
 *     </div>
 *     ...
 *   </div>
 *   ...
 * </section>
 *
 * The `mb-m` class on real event rows distinguishes them from the month-
 * heading row (which has only `fade-item`, no `mb-m`). We key on that to
 * avoid parsing the month headers as events.
 *
 * Parker House has multiple performance rooms (The Tavern, Raw Bar, Yacht
 * Club, Lobsterpalozza, etc.). We keep the main venue_name as "The Parker
 * House" and append the room to `description` so it shows up in search but
 * doesn't fragment the venue data.
 *
 * External ID: no event URLs or IDs exist in the DOM, so we synthesize
 * `parkerhouse-<date>-<titleSlug>` which is stable across runs as long as
 * the date + artist stay the same.
 *
 * Address: The Parker House, 1st and Beacon Ave, Sea Girt, NJ 08750
 *
 * If it breaks:
 *   1. Go to https://parkerhousenj.com/entertainment-schedule/
 *   2. Right-click an event → Inspect to confirm CSS classes
 *   3. Look for `.row.justify-content-center.fade-item.mb-m` containing
 *      an h5, a p, and a span.bold-weight
 *   4. If the classes change, update EVENT_ROW_MARKER + the h5/p/span regexes
 */

const VENUE = 'The Parker House';
const PAGE_URL = 'https://parkerhousenj.com/entertainment-schedule/';

// Splits on every real event row. Month-heading rows don't have `mb-m` so
// they're excluded automatically. Keep the three classes in stable order;
// if WordPress ever reshuffles them, swap to a looser matcher that requires
// all three in any order.
const EVENT_ROW_MARKER = /class="row justify-content-center fade-item mb-m"/;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse "May 20, 2026 6:00 pm" → { date: "2026-05-20", time: "6:00 PM" }.
 * Returns { date: null, time: null } if the string doesn't match.
 */
function parseDateTime(raw) {
  if (!raw) return { date: null, time: null };
  const s = raw.trim().replace(/\s+/g, ' ');

  // Pull date (month word + day + year) and time (h:mm am/pm) separately —
  // lets us tolerate minor punctuation quirks without a single rigid regex.
  const dateMatch = s.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  const timeMatch = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);

  if (!dateMatch) return { date: null, time: null };
  const monthIdx = MONTHS[dateMatch[1].toLowerCase()];
  if (monthIdx === undefined) return { date: null, time: null };

  const day = parseInt(dateMatch[2], 10);
  const year = parseInt(dateMatch[3], 10);
  const date = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  let time = null;
  if (timeMatch) {
    const hh = parseInt(timeMatch[1], 10);
    const mm = timeMatch[2];
    const ampm = timeMatch[3].toUpperCase();
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
 * Build a URL-friendly slug from a title — used for synthesizing external_id.
 * Collapses non-alphanumerics to `-` and trims to 40 chars so the id stays
 * short and stable.
 */
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Extract every event row from the page HTML and normalize each one into
 * { title, room, date, time }. Rows missing a title or date are dropped.
 */
function extractEvents(html) {
  const events = [];

  // Split on the row marker. blocks[0] is page header + preamble — skip it.
  const blocks = html.split(EVENT_ROW_MARKER);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Title — first <h5> inside the row.
    const titleMatch = block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : null;

    // Room / sub-venue — first <p> inside the row (e.g. "The Tavern").
    // Some rows may omit this; it's decorative, so null is fine.
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const room = pMatch ? stripHtml(pMatch[1]) : null;

    // Date/time — any <span> with class `bold-weight`. The row contains two
    // (a hidden mobile one + the desktop one); both hold the SAME string,
    // so we just grab the first match.
    const dtMatch = block.match(/<span[^>]*class="[^"]*bold-weight[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const rawDateTime = dtMatch ? stripHtml(dtMatch[1]) : null;
    const { date, time } = parseDateTime(rawDateTime);

    if (!title || !date) continue;
    events.push({ title, room, date, time });
  }

  return events;
}

export async function scrapeParkerHouse() {
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
      throw new Error(`HTTP ${res.status} fetching Parker House entertainment schedule`);
    }

    const html = await res.text();
    const extracted = extractEvents(html);

    console.log(`[ParkerHouse] Parsed ${extracted.length} events from HTML`);

    // Filter to today-or-later (venue-local ET) so we don't re-upsert past shows.
    const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const seen = new Set();
    const events = [];
    for (const e of extracted) {
      if (e.date < todayET) continue;

      const externalId = `parkerhouse-${e.date}-${slugify(e.title)}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      // Room goes into description so it's searchable and visible in admin,
      // without fragmenting the venue row into sub-venues. If the room is
      // empty, leave description null — downstream enrichment will fill it.
      const description = e.room ? `${e.room} — The Parker House` : null;

      events.push({
        title: e.title,
        venue: VENUE,
        date: e.date,
        time: e.time || null,
        description,
        ticket_url: PAGE_URL,              // no per-event ticket links
        price: null,                        // no prices on the listing page
        source_url: PAGE_URL,
        image_url: null,                    // no per-event images — cascade handles it
        external_id: externalId,
      });
    }

    console.log(`[ParkerHouse] ${events.length} upcoming events after date filter`);
    return { events, error: null };
  } catch (err) {
    console.error('[ParkerHouse] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
