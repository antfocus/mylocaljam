/**
 * matchTemplate — venue-aware template matchmaker (pure primitive).
 *
 * Given a scraped event's `{ title, venue_id }` and the full list of
 * event_templates, pick the best template to hydrate the event with.
 *
 * Priority rules (local ALWAYS wins):
 *   1. Local name match       — template.venue_id === event.venue_id AND template_name matches
 *   2. Local alias match      — template.venue_id === event.venue_id AND an alias matches
 *   3. Global name match      — template.venue_id IS NULL AND template_name matches
 *   4. Global alias match     — template.venue_id IS NULL AND an alias matches
 *   5. No match               — returns null
 *
 * All comparisons are case-insensitive with trimmed whitespace.
 *
 * This module is intentionally pure (no DB, no I/O) so it can be:
 *   - Unit tested in isolation
 *   - Called from the admin UI for "Dry Run" previews
 *   - Dropped into sync-events later without refactoring
 */

/** Normalise a string for case-insensitive comparison. */
function norm(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/** Does this template's name or any alias equal `normTitle`? Returns match kind or null. */
function titleMatchKind(template, normTitle) {
  if (!normTitle) return null;
  if (norm(template?.template_name) === normTitle) return 'name';
  const aliases = Array.isArray(template?.aliases) ? template.aliases : [];
  for (const a of aliases) {
    if (norm(a) === normTitle) return 'alias';
  }
  return null;
}

/**
 * matchTemplate
 *
 * @param {object}  event              - Event-like input.
 * @param {string}  event.title        - Event title to match against template_name + aliases.
 * @param {string=} event.venue_id     - Optional venue id. When omitted, only Global templates are considered.
 * @param {Array<object>} templates    - Full list of event_templates rows.
 * @returns {{ template: object, matchType: string } | null}
 *   matchType is one of: 'local_name' | 'local_alias' | 'global_name' | 'global_alias'
 */
export function matchTemplate(event, templates) {
  const normTitle = norm(event?.title);
  if (!normTitle) return null;
  if (!Array.isArray(templates) || templates.length === 0) return null;

  const venueId = event?.venue_id || null;

  // We accumulate into 4 buckets and then pick the highest-priority non-empty one.
  // This structure makes the priority order obvious and is cheap for libraries
  // of a few thousand templates.
  const local = { name: null, alias: null };
  const global = { name: null, alias: null };

  for (const t of templates) {
    const kind = titleMatchKind(t, normTitle);
    if (!kind) continue;

    const isLocal = venueId && t.venue_id === venueId;
    const isGlobal = t.venue_id === null || t.venue_id === undefined;

    if (isLocal) {
      if (kind === 'name' && !local.name) local.name = t;
      else if (kind === 'alias' && !local.alias) local.alias = t;
    } else if (isGlobal) {
      if (kind === 'name' && !global.name) global.name = t;
      else if (kind === 'alias' && !global.alias) global.alias = t;
    }
    // Templates scoped to a DIFFERENT venue are ignored — they're not ours.
  }

  // Apply the priority order — local always wins.
  if (local.name)  return { template: local.name,  matchType: 'local_name'  };
  if (local.alias) return { template: local.alias, matchType: 'local_alias' };
  if (global.name)  return { template: global.name,  matchType: 'global_name'  };
  if (global.alias) return { template: global.alias, matchType: 'global_alias' };
  return null;
}

/**
 * matchTemplateBatch — convenience wrapper for "Dry Run" UI previews.
 * Returns one result per input event.
 */
export function matchTemplateBatch(events, templates) {
  if (!Array.isArray(events)) return [];
  return events.map(e => ({ event: e, match: matchTemplate(e, templates) }));
}

// Exported for unit tests.
export const __internal = { norm, titleMatchKind };
