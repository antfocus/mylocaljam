/**
 * Verified-Lock write guards (Agent_SOP.md §G Spot Protocol).
 *
 * Problem this module solves: `is_human_edited` is read consistently by the
 * waterfall (src/lib/waterfall.js) but was enforced inconsistently on WRITES
 * — scattered across enrichment scripts, admin PUT handlers, and the artist
 * sync pipeline. The schema also drifted: `events.is_human_edited` is a
 * boolean ("this row is locked end-to-end"), while `artists.is_human_edited`
 * is a JSONB object with per-field keys (`{ bio: true, image_url: true }`).
 * That ambiguity meant enrichArtist/enrichLastfm silently bypassed locks
 * whenever the flag was stored as a boolean, and the admin event PUT had no
 * gate at all. Result: a 7:12 PM cron wipe on Mariel Bildsten's photo.
 *
 * This module is the single source of truth for "is this field locked?"
 * across every writer. All automation writers MUST route updates through
 * `stripLockedFields` before calling `.update(...)` or `.upsert(...)`.
 *
 * Lock schema semantics:
 *   • boolean `true`     → ALL lockable fields are locked (end-to-end lock).
 *   • boolean `false`    → nothing is locked.
 *   • JSONB  `{ f: true }` → field `f` is locked; others follow their own keys.
 *   • null / undefined   → nothing is locked.
 */

/**
 * Returns true if `field` is locked on `existingRow.is_human_edited`,
 * handling both boolean and JSONB shapes.
 */
export function isFieldLocked(existingRow, field) {
  if (!existingRow) return false;
  const flag = existingRow.is_human_edited;
  if (flag === true) return true;                 // end-to-end lock
  if (flag && typeof flag === 'object') {         // per-field JSONB
    return !!flag[field];
  }
  return false;
}

/**
 * Return a copy of `updates` with any field stripped that is locked on
 * `existingRow`. Callers can opt-out per-request by passing `allowUnlock`
 * with the new JSONB `is_human_edited` payload — same escape hatch the
 * artist PUT handler uses for explicit unlock actions.
 *
 * @param {object} existingRow   fresh DB row being updated
 * @param {object} updates       incoming update payload
 * @param {object} [opts]
 * @param {string[]} [opts.lockableFields]  fields to guard (default: the
 *   intersection of event + artist lockable columns).
 * @param {object}   [opts.allowUnlock]     the caller's new is_human_edited
 *   object; if `allowUnlock[field] === false`, that field passes through.
 * @returns {object}  new update object safe to hand to supabase.
 */
export function stripLockedFields(existingRow, updates, opts = {}) {
  if (!existingRow || !updates) return updates || {};
  const lockableFields = opts.lockableFields || [
    'name', 'bio', 'artist_bio',
    'image_url', 'event_image_url', 'custom_image_url',
    'genres', 'vibes',
    'category', 'start_time',
    'event_title', 'template_name',
  ];
  const allowUnlock = opts.allowUnlock && typeof opts.allowUnlock === 'object'
    ? opts.allowUnlock
    : null;

  const out = { ...updates };
  for (const field of lockableFields) {
    if (!(field in out)) continue;
    if (!isFieldLocked(existingRow, field)) continue;
    // Escape hatch: caller is explicitly unlocking this field in the same
    // request (per-field JSONB unlock). Required so admin "unlock &
    // overwrite" still works.
    if (allowUnlock && allowUnlock[field] === false) continue;
    delete out[field];
  }
  return out;
}

/**
 * Build a partial upsert `record` by skipping fields that would overwrite
 * a lock. Used by the enrichment upserts where we don't have a pre-fetched
 * "updates vs existing" diff — we build the record from scratch and need to
 * drop fields before calling `.upsert(..., { onConflict: 'name' })`.
 *
 * Same semantics as stripLockedFields but returns a new object with only
 * the unlocked keys from `record` plus any non-lockable keys untouched.
 */
export function buildLockSafeRecord(existingRow, record, opts = {}) {
  return stripLockedFields(existingRow, record, opts);
}
