/**
 * Drifthouse Restaurant, Lounge & Bar scraper
 * Site: https://drifthousenj.com/events/
 *
 * WordPress + Elementor site. The events page has THREE music sections — and
 * also a bunch of non-music content (Mother's Day Brunch, special promos,
 * "Smoke & OAK IV", etc.) that we explicitly do NOT scrape. The discipline:
 * the scraper recognizes the music section by THREE structural anchors and
 * ignores everything else.
 *
 *   1. TUESDAYS — recurring weekly. Anchor:
 *        <h3 class="qodef-m-title">TUESDAYS</h3>
 *        <h6 class="qodef-m-subtitle">Chad Acoustic</h6>
 *        <p  class="qodef-m-text">LIVE MUSIC 7PM</p>
 *      Synthesized: one event per upcoming Tuesday for `HORIZON_WEEKS` weeks.
 *
 *   2. THURSDAY SCHEDULE — explicitly dated cards. Anchor:
 *        <section id="ebi-events-1">
 *          <article class="ebi-card">
 *            <p class="ebi-card__meta">Thu, Apr 30 2026</p>
 *            <h3 class="ebi-card__title">Lori and Alex</h3>
 *          </article> ...
 *        </section>
 *      Parsed: one event per .ebi-card. Cards are scoped to within the
 *      ebi-events <section> block so future EBI plugin instances elsewhere
 *      on the page can't pollute the scrape.
 *
 *   3. FRIDAYS — recurring weekly. Same shape as TUESDAYS, different artist.
 *      Synthesized: one event per upcoming Friday for `HORIZON_WEEKS` weeks.
 *
 * Anything that doesn't match one of these three anchors (Mother's Day,
 * one-off promos, restaurant-only content) is skipped — there's no fallback
 * "scrape any text that looks like an event" branch.
 *
 * Holiday cancellations and artist substitutions: the recurring synthesizer
 * doesn't know about them. Admin manually flips status='cancelled' or edits
 * the artist on individual rows; the is_human_edited lock at sync-events
 * preserves those manual fixes across re-scrapes.
 *
 * If it breaks:
 *   1. Visit https://drifthousenj.com/events/ in a browser.
 *   2. Inspect the TUESDAYS / FRIDAYS / THURSDAY SCHEDULE headings; confirm
 *      they still use the qodef-m-title / qodef-m-subtitle / qodef-m-text
 *      class triplet. Update the regexes below if the theme changed.
 *   3. Inspect a Thursday card; confirm it's still <article class="ebi-card">
 *      with .ebi-card__meta + .ebi-card__title. Update if the EBI plugin
 *      shipped a major rewrite.
 *
 * Address: 1485 Ocean Avenue, Sea Bright, NJ 07760
 */

import { proxyFetch, BROWSER_HEADERS } from '@/lib/proxyFetch';

const VENUE = 'Drifthouse';
const VENUE_URL = 'https://drifthousenj.com/events/';

// Generate this many upcoming Tuesdays / Fridays per scrape pass.
// 8 weeks ≈ 2 months ahead — good balance between feed depth and not
// emitting events further out than the venue has actually committed to.
const HORIZON_WEEKS = 8;

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// ── Date helpers — all date math anchored on noon-UTC for the YYYY-MM-DD
//    string so day-of-week computation is stable regardless of host TZ. ──

function startOfDayUTC(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function dayOfWeek(yyyymmdd) {
  return startOfDayUTC(yyyymmdd).getUTCDay(); // 0=Sun..6=Sat
}

function addDays(yyyymmdd, n) {
  const d = startOfDayUTC(yyyymmdd);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Walk forward from `fromDateStr` (Eastern YYYY-MM-DD) and return the next
 * `count` dates whose day-of-week matches `targetDow`. If `fromDateStr` IS
 * the target day, it's included as the first entry.
 */
function getNextNOfDow(targetDow, count, fromDateStr) {
  const fromDow = dayOfWeek(fromDateStr);
  const daysAhead = (targetDow - fromDow + 7) % 7;
  let cur = addDays(fromDateStr, daysAhead);
  const dates = [];
  for (let i = 0; i < count; i++) {
    dates.push(cur);
    cur = addDays(cur, 7);
  }
  return dates;
}

// ── Parsing helpers ─────────────────────────────────────────────────────

function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a phrase like "LIVE MUSIC 7PM" or "starts at 8:30 pm" into a
 * 24-hour HH:MM string. Returns null if no time pattern is found.
 */
function parseTimeFromText(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)/i);
  if (!m) return null;
  let hr = parseInt(m[1], 10);
  const mn = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === 'pm' && hr !== 12) hr += 12;
  if (ampm === 'am' && hr === 12) hr = 0;
  return `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

/**
 * Parse the EBI plugin's "Thu, Apr 30 2026" date format → "2026-04-30".
 * Returns null if the format doesn't match.
 */
function parseEbiCardDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const monthKey = m[1].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  if (!month) return null;
  const day = String(parseInt(m[2], 10)).padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Find the qodef widget for a specific day-name heading and pull the artist
 * + time. The widget renders title → subtitle → text as adjacent siblings
 * inside an Elementor container, so a non-greedy regex window between the
 * three pieces is safe.
 *
 * Returns { artist, time } or null when the section isn't on the page.
 */
function extractDaySection(html, dayName) {
  // The Drifthouse theme renders heading close tags with optional whitespace
  // before `>` — e.g. `<h6 class="qodef-m-subtitle" >Chad Acoustic</h6 >`
  // (note the space in `</h6 >`). The earlier regex used `</h\d>` which
  // didn't match that, causing the subtitle's capture group to expand
  // non-greedily until the NEXT `</h\d>` (the FRIDAYS heading), swallowing
  // a huge garbage string as the artist. Fixed by allowing optional
  // whitespace before `>` on every heading close tag.
  const re = new RegExp(
    `<h\\d[^>]*\\bclass="[^"]*\\bqodef-m-title\\b[^"]*"[^>]*>\\s*${dayName}\\s*</h\\d\\s*>` +
    `[\\s\\S]*?` +
    `<h\\d[^>]*\\bclass="[^"]*\\bqodef-m-subtitle\\b[^"]*"[^>]*>([\\s\\S]*?)</h\\d\\s*>` +
    `[\\s\\S]*?` +
    `<p[^>]*\\bclass="[^"]*\\bqodef-m-text\\b[^"]*"[^>]*>([\\s\\S]*?)</p>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return null;
  const artist = stripHtml(m[1]);
  const time = parseTimeFromText(stripHtml(m[2])) || '19:00'; // fallback: 7pm
  if (!artist) return null;
  return { artist, time };
}

/**
 * Build one event per upcoming occurrence of the given day-of-week, using
 * the artist + time pulled from the page's qodef widget for that day.
 */
function synthesizeWeekly(html, dayName, dayOfWeekIndex, todayStr) {
  const section = extractDaySection(html, dayName);
  if (!section) {
    console.warn(`[Drifthouse] No "${dayName}" section found on the page`);
    return [];
  }
  const { artist, time } = section;
  const dates = getNextNOfDow(dayOfWeekIndex, HORIZON_WEEKS, todayStr);
  const slug = artist
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const dayKey = dayName.toLowerCase().replace(/s$/, ''); // tuesdays → tuesday

  return dates.map(date => ({
    title: artist,
    venue: VENUE,
    date,
    time,
    description: null,
    ticket_url: VENUE_URL,
    price: null,
    source_url: VENUE_URL,
    // Stable + collision-free across the three sections: include both the
    // day-of-week tag and the artist slug.
    external_id: `drifthouse-${date}-${dayKey}-${slug}`,
    image_url: null,
  }));
}

/**
 * Parse the dated Thursday cards. Scoped to within <section id="ebi-events*">
 * so any future EBI plugin instances elsewhere on the page (e.g. promos)
 * can't pollute the scrape.
 */
function parseEbiCards(html, todayStr) {
  const sectionRe = /<section[^>]*\bid="ebi-events[^"]*"[^>]*>([\s\S]*?)<\/section>/i;
  const sectionMatch = html.match(sectionRe);
  if (!sectionMatch) {
    console.warn('[Drifthouse] No <section id="ebi-events*"> block on the page');
    return [];
  }
  const sectionHtml = sectionMatch[1];

  const events = [];
  const seen = new Set();
  const cardRe = /<article[^>]*\bclass="[^"]*\bebi-card\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = cardRe.exec(sectionHtml)) !== null) {
    const cardHtml = match[1];

    const dateMatch = cardHtml.match(
      /<[^>]*\bclass="[^"]*\bebi-card__meta\b[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/
    );
    const titleMatch = cardHtml.match(
      /<[^>]*\bclass="[^"]*\bebi-card__title\b[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/
    );
    if (!dateMatch || !titleMatch) continue;

    const rawDate = stripHtml(dateMatch[1]);
    const title = stripHtml(titleMatch[1]);
    if (!rawDate || !title) continue;
    if (/^private\s+event\s*$/i.test(title)) continue; // booked-out, not public music

    const dateStr = parseEbiCardDate(rawDate);
    if (!dateStr) continue;
    if (dateStr < todayStr) continue; // past

    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    const externalId = `drifthouse-${dateStr}-thu-${titleSlug}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    events.push({
      title,
      venue: VENUE,
      date: dateStr,
      time: null, // Thursday cards don't carry a time on the page; venue.default_start_time fills via waterfall
      description: null,
      ticket_url: VENUE_URL,
      price: null,
      source_url: VENUE_URL,
      external_id: externalId,
      image_url: null,
    });
  }

  return events;
}

// ── Main entrypoint ─────────────────────────────────────────────────────

export async function scrapeDrifthouse() {
  try {
    // proxyFetch + IPRoyal residential proxy. Drifthouse's host (or
    // upstream CDN) appears to filter Vercel datacenter IPs — the same
    // browser-shaped UA fetched from a residential connection returned
    // the full 160KB HTML, but the deployed Vercel runtime got either
    // empty or stripped-down responses (count=0 across multiple syncs
    // even after the regex bug was fixed). Routing through the existing
    // residential proxy used by AlgonquinArts / TimMcLoones / Starland
    // / HOI sidesteps the IP-based filter.
    //
    // BROWSER_HEADERS is the shared header set from `@/lib/proxyFetch`
    // (Chrome-on-macOS UA, Accept, Accept-Language, Accept-Encoding,
    // cache disable). Using the constant keeps Drifthouse aligned with
    // every other proxy-routed scraper instead of inlining a near-copy.
    const res = await proxyFetch(VENUE_URL, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Drifthouse events page`);

    const html = await res.text();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Three music-section anchors. Anything else on the page is ignored.
    const events = [
      ...synthesizeWeekly(html, 'TUESDAYS', 2, todayStr), // Tue
      ...parseEbiCards(html, todayStr),                    // Thu (dated)
      ...synthesizeWeekly(html, 'FRIDAYS',  5, todayStr), // Fri
    ];

    // Diagnostic: when count is 0, dump enough about the response to
    // distinguish "wrong HTML returned" from "regex bug." Helps the next
    // operator (or me) figure out the failure mode without re-deploying.
    if (events.length === 0) {
      const titleHits = (html.match(/qodef-m-title/g) || []).length;
      const cardHits = (html.match(/ebi-card/g) || []).length;
      const snippet = html.slice(0, 200).replace(/\s+/g, ' ');
      console.warn(
        `[Drifthouse] 0 events parsed. html_length=${html.length}, ` +
        `qodef-m-title_count=${titleHits}, ebi-card_count=${cardHits}. ` +
        `First 200 chars: ${snippet}`
      );
    } else {
      console.log(`[Drifthouse] Found ${events.length} upcoming events ` +
                  `(Tue/Fri synthesized over ${HORIZON_WEEKS} weeks, Thu from the schedule list)`);
    }
    return { events, error: null };

  } catch (err) {
    console.error('[Drifthouse] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
