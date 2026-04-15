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
  if (event.is_human_edited) return false;   // human lock wins
  if (!event.template_id) return false;      // no template → nothing to clobber with
  return isMidnight(event.start_time);
}

// Treat "" and "None" as missing so the ladder keeps falling.
export const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;
export const cleanStr = (v) => (v && v !== 'None' && v !== '') ? v : null;

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
 * @returns {{ title, category, start_time, description, event_image,
 *            is_human_edited, template, artist }}
 */
export function applyWaterfall(event, opts = {}) {
  const e = event || {};
  const tpl = e.event_templates || opts.template || null;
  const artist = e.artists || opts.artist || null;
  const humanEdited = !!e.is_human_edited;

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

  // Start-time — Midnight Exception lets template clobber scraper's 00:00.
  const treatEmpty = shouldTreatEventTimeAsEmpty(e);
  const start_time = humanEdited
    ? (e.start_time || tpl?.start_time || null)
    : (treatEmpty ? (tpl?.start_time || null) : (tpl?.start_time || e.start_time || null));

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
