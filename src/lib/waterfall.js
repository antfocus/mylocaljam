/**
 * Data Inheritance Waterfall (Agent_SOP.md §1–2).
 *
 * Single source of truth for resolving an event's display fields from its
 * scraper row + template + linked artist. Imported by both the server-side
 * Spotlight route and the admin tab UI so the hero carousel and the admin
 * preview can never drift from each other.
 *
 * Tiers (top wins):
 *   1. Override      — event.custom_*                       (human lock)
 *   2. Template      — event.event_templates.*              (master library)
 *   3. Event/Scraper — event.event_title / event_image_url / start_time / …
 *   4. Artist        — event.artists.bio / image_url
 *   5. Venue Default — event.venues.default_start_time      (time only)
 *
 * Two cross-cutting rules modify the ladder:
 *   • Verified Lock (is_human_edited): if true, the Event tier beats Template
 *     for category/start_time/bio/image (the human's choice sticks).
 *   • Midnight Exception: when `is_human_edited` is false AND the event is
 *     template-linked AND start_time is 00:00, treat the time as empty so
 *     the template's master time can clobber it. A human-locked midnight is
 *     respected as intentional (e.g. New Year's countdown).
 */

export function isMidnight(t) {
  if (!t) return false;
  const s = String(t).trim();
  return s === '00:00' || s === '00:00:00' || s.startsWith('00:00:');
}

/**
 * Returns true when the event's own `start_time` should be ignored so the
 * template's master time can take over. See Midnight Exception above.
 */
export function shouldTreatEventTimeAsEmpty(event) {
  if (!event) return false;
  // Phase-1 reader flip (Task #60): check both columns during the transition
  // week so locks from unpatched writers still win.
  if (event.is_locked || event.is_human_edited) return false;   // human lock wins
  if (!event.template_id) return false;      // no template → nothing to clobber with
  return isMidnight(event.start_time);
}

// Treat "" and "None" as missing so the ladder keeps falling.
export const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;
export const cleanStr = (v) => (v && v !== 'None' && v !== '') ? v : null;

/**
 * Canonical artist-name key for fuzzy matching between `events.artist_name`
 * (often scraper-mangled — double spaces, trailing whitespace, case drift) and
 * the curated `artists.name` column.
 *
 * Must stay in lockstep with every caller: AdminSpotlightTab uses it to pick
 * an artist when `artist_id` is null, and /api/spotlight does the same on
 * the public hero. Drift here re-introduces the "admin sees Mariel's photo,
 * homepage shows a placeholder" bug.
 */
export function normalizeName(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Derive an Eastern-time `HH:MM` string from a full event_date timestamp.
 * Scrapers frequently leave the dedicated `start_time` column null while
 * still encoding the real start inside the ISO `event_date`. Without this
 * fallback the readiness check reports "no time" for events the hero
 * carousel (and the row subtext) render correctly.
 *
 * Returns null for unparseable / missing input.
 */
export function extractTimeFromDate(eventDateIso) {
  if (!eventDateIso) return null;
  try {
    const d = new Date(eventDateIso);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = parts.find(p => p.type === 'hour')?.value ?? '00';
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
    // Intl sometimes emits "24" for midnight; normalize.
    const hour = hh === '24' ? '00' : hh;
    return `${hour}:${mm}`;
  } catch {
    return null;
  }
}

/**
 * Resolve one event through the full waterfall.
 *
 * @param {object} event  hydrated event row with optional joins:
 *   - event.event_templates  (template row or null)
 *   - event.artists          (linked artist row or null)
 * @param {object} [opts]
 * @param {object|null} [opts.template]  fallback template when the join isn't
 *   hydrated; looked up client-side via `event.template_id`.
 * @param {object|null} [opts.artist]    fallback artist row; same idea.
 * @param {object|null} [opts.venue]     fallback venue row for default_start_time.
 * @returns {{ title, category, start_time, description, event_image,
 *            is_human_edited, template, artist }}
 */
export function applyWaterfall(event, opts = {}) {
  const e = event || {};
  const tpl = e.event_templates || opts.template || null;
  const artist = e.artists || opts.artist || null;
  const venue = e.venues || opts.venue || null;
  // Phase-1 reader flip (Task #60): `is_locked` is the new canonical row
  // lock. During the transition week we still OR in `is_human_edited` so
  // rows written by any not-yet-patched code path are still honored as
  // locked. After the dual-write week and the is_human_edited column drop,
  // simplify to `!!e.is_locked` (and rename `humanEdited` → `locked`).
  const humanEdited = !!(e.is_locked || e.is_human_edited);

  // Title — custom → (human ? event → template : template → event).
  const title =
    cleanStr(e.custom_title) ||
    (humanEdited
      ? (cleanStr(e.event_title) || cleanStr(tpl?.template_name))
      : (cleanStr(tpl?.template_name) || cleanStr(e.event_title))) ||
    '';

  // Category — (human ? event → template : template → event) → 'Other'.
  const category =
    (humanEdited
      ? (cleanStr(e.category) || cleanStr(tpl?.category))
      : (cleanStr(tpl?.category) || cleanStr(e.category))) ||
    'Other';

  // Start-time ladder.
  //   • Human lock: event.start_time → template → event_date → venue default.
  //   • Default:    template → event.start_time → event_date → venue default,
  //                 with the Midnight Exception letting a template clobber
  //                 a scraper-supplied 00:00.
  // event_date is a mid-tier fallback because scrapers often leave
  // start_time null while the real time is encoded in event_date.
  // Venue default_start_time is the last resort — covers OCR events
  // where no time was parsed but the venue has a consistent showtime.
  const treatEmpty = shouldTreatEventTimeAsEmpty(e);
  const dateDerivedRaw = extractTimeFromDate(e.event_date);
  // Midnight from event_date means "no real time encoded" — let it fall
  // through to venue default rather than displaying 12:00 AM.
  const dateDerived = (dateDerivedRaw && !isMidnight(dateDerivedRaw))
    ? dateDerivedRaw
    : null;
  // Parse venue default time — handles "20:00:00", "20:00", "8:00 PM" etc.
  const venueTime = (() => {
    const raw = venue?.default_start_time;
    if (!raw) return null;
    const s = String(raw).trim();
    // Already HH:MM or HH:MM:SS → take first 5 chars
    if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
    // 12-hour format like "8:00 PM"
    const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (m) {
      let hr = parseInt(m[1]);
      const mn = m[2];
      const per = m[3].toLowerCase();
      if (per === 'pm' && hr !== 12) hr += 12;
      if (per === 'am' && hr === 12) hr = 0;
      return `${String(hr).padStart(2, '0')}:${mn}`;
    }
    return null;
  })();
  const start_time = humanEdited
    ? (e.start_time || tpl?.start_time || dateDerived || venueTime || null)
    : (treatEmpty
        ? (tpl?.start_time || dateDerived || venueTime || null)
        : (tpl?.start_time || e.start_time || dateDerived || venueTime || null));

  // Bio — custom_bio → (human ? event → template : template → event) → artist.
  const description =
    cleanStr(e.custom_bio) ||
    (humanEdited
      ? (cleanStr(e.artist_bio) || cleanStr(tpl?.bio))
      : (cleanStr(tpl?.bio) || cleanStr(e.artist_bio))) ||
    cleanStr(artist?.bio) ||
    '';

  // Image — custom → (human ? event → template : template → event) → legacy → artist.
  const event_image = humanEdited
    ? (cleanImg(e.custom_image_url)
        || cleanImg(e.event_image_url)
        || cleanImg(tpl?.image_url)
        || cleanImg(e.image_url)
        || cleanImg(artist?.image_url))
    : (cleanImg(e.custom_image_url)
        || cleanImg(tpl?.image_url)
        || cleanImg(e.event_image_url)
        || cleanImg(e.image_url)
        || cleanImg(artist?.image_url));

  return {
    title,
    category,
    start_time,
    description,
    event_image,
    is_human_edited: humanEdited,
    template: tpl,
    artist,
  };
}

/**
 * Spotlight readiness — the traffic-light model used by the admin picker.
 *
 *   green  : has image + bio + valid time (template midnight resolved, or
 *            human-locked midnight = intentional).
 *   yellow : has a valid time but is missing image OR bio.
 *   red    : resolved time is 00:00/null and no human lock → broken.
 *
 * @returns { state: 'green'|'yellow'|'red', resolved, reasons: string[] }
 */
export function getSpotlightReadiness(event, opts = {}) {
  const resolved = applyWaterfall(event, opts);
  const reasons = [];

  const timeMissing = !resolved.start_time || isMidnight(resolved.start_time);
  const timeOk = !timeMissing || resolved.is_human_edited; // human lock = intentional

  if (!timeOk) reasons.push(resolved.start_time ? 'Stuck at 12:00 AM' : 'No start time');
  if (!resolved.event_image) reasons.push('No image');
  if (!resolved.description) reasons.push('No bio');

  let state;
  if (!timeOk) state = 'red';
  else if (!resolved.event_image || !resolved.description) state = 'yellow';
  else state = 'green';

  return { state, resolved, reasons };
}
