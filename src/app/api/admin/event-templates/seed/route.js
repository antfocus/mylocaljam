import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Minimum number of times a title must appear in the events feed
// before we consider it a candidate for template seeding.
const MIN_FREQUENCY = 3;

// Cap the number of events we pull in for frequency analysis.
// Matches the safety ceiling used elsewhere in the codebase.
const EVENT_FETCH_LIMIT = 10000;

// Cap how many source occurrences we return per candidate row. Protects
// payload size for titles that recur dozens of times; the admin just needs
// enough examples to verify the pattern is real.
const MAX_OCCURRENCES_PER_CANDIDATE = 25;

/**
 * Normalise a string for duplicate / match detection: trimmed + lowercased.
 * Keeps the original casing in the returned candidate object.
 */
function norm(s) {
  return (s || '').trim().toLowerCase();
}

/**
 * Composite dedupe key covering the (name, venue) axis.
 * Global entries use the string 'GLOBAL' so they can't collide with a uuid.
 */
function scopeKey(normName, venueId) {
  return `${normName}::${venueId || 'GLOBAL'}`;
}

/**
 * GET — Discover candidate templates (venue-aware).
 *
 * We group the events feed by `(norm(event_title), venue_id)` so that a title
 * running at multiple venues surfaces as one "group" with per-venue splits.
 * The UI can then let the admin either claim a split for a specific venue
 * (📍 local) or roll it up into a Global template (🌐 covers all venues).
 *
 * Response shape:
 *   {
 *     groups: [{
 *       title: 'Music Bingo',
 *       total_count: 8,
 *       splits: [
 *         { venue_id, venue_name, count, occurrences: [...] },
 *         ...
 *       ],
 *       // Convenience: what the UI would produce if you clicked 🌐 Global.
 *       global_candidate: { title, count: 8, occurrences: [...] },
 *       // Already-existing scope flags so the UI can hide duplicates.
 *       existing_scopes: ['GLOBAL', 'venue-uuid-A'],
 *     }, ...],
 *     min_frequency: 3,
 *     total_events_scanned: N,
 *   }
 */
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  // 1. Pull event rows. Events order by date desc so the N most-recent
  //    occurrences are what survive the per-split cap below.
  //
  // Extra columns vs. raw title counting:
  //   - is_time_tbd: lets the UI hide the start-time column when it's meaningless
  //   - custom_bio / artist_bio: source of the "snippet" column (custom wins when present,
  //     matching how the UI treats them elsewhere).
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, event_title, event_date, venue_id, is_time_tbd, custom_bio, artist_bio')
    .not('event_title', 'is', null)
    .order('event_date', { ascending: false })
    .limit(EVENT_FETCH_LIMIT);

  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 500 });
  }

  // 2. Fetch existing templates (name + aliases + venue_id) so we can:
  //    (a) detect "already exists for this venue" per-split
  //    (b) detect "already exists globally"
  const { data: existingTemplates, error: existingErr } = await supabase
    .from('event_templates')
    .select('template_name, aliases, venue_id')
    .limit(5000);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  // Map each normalised title/alias → set of venue_id scopes already claimed.
  // A row with venue_id null contributes scope 'GLOBAL'.
  const existingScopes = new Map();  // normTitle -> Set<scope>
  const addScope = (normName, venueScope) => {
    if (!existingScopes.has(normName)) existingScopes.set(normName, new Set());
    existingScopes.get(normName).add(venueScope);
  };
  for (const t of existingTemplates || []) {
    const scope = t.venue_id || 'GLOBAL';
    if (t.template_name) addScope(norm(t.template_name), scope);
    if (Array.isArray(t.aliases)) {
      for (const a of t.aliases) {
        if (a) addScope(norm(a), scope);
      }
    }
  }

  // 3. Group events by (norm(title), venue_id). Each split is its own bucket.
  const splitBuckets = new Map();    // "normTitle|venueId" -> { normTitle, venueId, count, occurrences[] }
  const titleDisplay = new Map();    // normTitle -> original casing (first seen)
  const titleTotalCounts = new Map(); // normTitle -> count across all venues (for sort)
  const venueIdsNeeded = new Set();

  for (const row of events || []) {
    const title = (row?.event_title || '').trim();
    if (!title) continue;
    const normTitle = norm(title);
    if (!titleDisplay.has(normTitle)) titleDisplay.set(normTitle, title);
    titleTotalCounts.set(normTitle, (titleTotalCounts.get(normTitle) || 0) + 1);

    const venueId = row.venue_id || null;
    const splitKey = `${normTitle}|${venueId || ''}`;
    if (!splitBuckets.has(splitKey)) {
      splitBuckets.set(splitKey, { normTitle, venueId, count: 0, occurrences: [] });
    }
    const bucket = splitBuckets.get(splitKey);
    bucket.count++;
    if (bucket.occurrences.length < MAX_OCCURRENCES_PER_CANDIDATE) {
      // Build the snippet server-side to keep the wire payload small.
      // Prefer custom_bio when present (human-curated), fall back to the scraped
      // artist_bio. Trim + truncate to 60 chars with an ellipsis — enough for
      // the admin to recognise "wrong event, skip it" at a glance.
      const rawBio = (row.custom_bio || row.artist_bio || '').trim();
      const snippet = rawBio ? (rawBio.length > 60 ? rawBio.slice(0, 60) + '\u2026' : rawBio) : null;

      bucket.occurrences.push({
        id: row.id,
        event_date: row.event_date,
        is_time_tbd: !!row.is_time_tbd,
        snippet,
        venue_id: venueId,
      });
    }
    if (venueId) venueIdsNeeded.add(venueId);
  }

  // 4. Resolve venue names in one batched query.
  const venueNames = new Map();
  if (venueIdsNeeded.size > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name')
      .in('id', Array.from(venueIdsNeeded));
    for (const v of venues || []) venueNames.set(v.id, v.name);
  }

  // 5. Roll buckets up into per-title groups. A group surfaces only if its
  //    TOTAL across venues >= MIN_FREQUENCY. Individual splits that don't
  //    clear the threshold on their own are still shown to the admin — the
  //    cumulative evidence justifies inspection.
  const groups = new Map();  // normTitle -> group object
  for (const { normTitle, venueId, count, occurrences } of splitBuckets.values()) {
    if ((titleTotalCounts.get(normTitle) || 0) < MIN_FREQUENCY) continue;

    if (!groups.has(normTitle)) {
      groups.set(normTitle, {
        title: titleDisplay.get(normTitle),
        total_count: 0,
        splits: [],
        existing_scopes: Array.from(existingScopes.get(normTitle) || []),
      });
    }
    const group = groups.get(normTitle);
    const resolvedOccs = occurrences.map(o => ({
      id: o.id,
      event_date: o.event_date,
      is_time_tbd: o.is_time_tbd,
      snippet: o.snippet,
      venue_name: o.venue_id ? (venueNames.get(o.venue_id) || null) : null,
    }));
    group.splits.push({
      venue_id: venueId,
      venue_name: venueId ? (venueNames.get(venueId) || null) : null,
      count,
      occurrences: resolvedOccs,
    });
    group.total_count += count;
  }

  // 6. Finalise each group: compute global_candidate, sort splits by count desc,
  //    drop groups whose every possible scope is already claimed.
  const output = [];
  for (const group of groups.values()) {
    group.splits.sort((a, b) => (b.count - a.count) || String(a.venue_name || '').localeCompare(String(b.venue_name || '')));

    // Flatten occurrences across splits for the 🌐 Global rollup preview.
    // Uses the same per-candidate cap, most-recent-first.
    const allOccs = group.splits.flatMap(s => s.occurrences)
      .sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))
      .slice(0, MAX_OCCURRENCES_PER_CANDIDATE);
    group.global_candidate = {
      count: group.total_count,
      occurrences: allOccs,
    };

    // If GLOBAL + every split venue are all already templated, skip the group.
    const claimed = new Set(group.existing_scopes);
    const hasUnclaimedSplit = group.splits.some(s => !claimed.has(s.venue_id || 'GLOBAL'));
    const globalUnclaimed = !claimed.has('GLOBAL');
    if (!hasUnclaimedSplit && !globalUnclaimed) continue;

    output.push(group);
  }

  // Sort groups by total_count desc, alphabetical tiebreak.
  output.sort((a, b) => (b.total_count - a.total_count) || a.title.localeCompare(b.title));

  return NextResponse.json({
    groups: output,
    min_frequency: MIN_FREQUENCY,
    total_events_scanned: (events || []).length,
  });
}

/**
 * POST — Bulk convert selected scopes into templates (venue-aware).
 *
 * Accepts two body shapes:
 *   (legacy) { titles: ['Taco Tuesday', ...] }
 *     → each string becomes a GLOBAL template.
 *   (current) { items: [
 *       { template_name, venue_id?, aliases? },   // venue_id null/missing = global
 *       ...
 *     ] }
 *
 * Naming convention (venue-specific) — enforced by the CALLER (Discovery UI):
 *   The UI is expected to send { template_name: 'Wonder Bar Music Bingo', venue_id: <V>,
 *   aliases: ['Music Bingo'] }. The prefixed template_name keeps the directory readable;
 *   the original title in aliases keeps the matchmaker's name lookup intact.
 *   This route does NOT mangle template_name or auto-populate aliases — that's a UI
 *   decision, and we keep the API dumb/predictable.
 *
 * Safety:
 *   - Dedupe key is (norm(template_name), venue_id || 'GLOBAL'). This lets "Taco
 *     Tuesday" exist as GLOBAL AND as a local at Bar A simultaneously.
 *   - Existing-template check matches on (template_name OR any alias) × scope so
 *     re-seeding won't create a second row next to a local template that already
 *     has the base title in its aliases.
 *   - Explicit allowlist of columns on the insert row; nothing else leaks through.
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  // Normalise both body shapes into a canonical `items[]`.
  let rawItems = [];
  if (Array.isArray(body.items)) {
    rawItems = body.items;
  } else if (Array.isArray(body.titles)) {
    rawItems = body.titles.map(t => ({ template_name: t, venue_id: null, aliases: [] }));
  }

  // Clean + composite-dedupe within the request itself (case-insensitive).
  const seenScopes = new Set();
  const incoming = [];
  for (const raw of rawItems) {
    const name = typeof raw?.template_name === 'string' ? raw.template_name.trim() : '';
    if (!name) continue;
    const venueId = raw?.venue_id || null;
    const key = scopeKey(norm(name), venueId);
    if (seenScopes.has(key)) continue;
    seenScopes.add(key);

    const aliases = Array.isArray(raw?.aliases)
      ? raw.aliases.map(a => (typeof a === 'string' ? a.trim() : '')).filter(Boolean)
      : [];

    // occurrence_ids — the admin's "cherry pick" of which source events get
    // their template_id set after the template row is inserted. Missing /
    // empty array = skip linking. Values that don't look like UUIDs are dropped
    // defensively so a typo'd client can't cause a broad update.
    const occurrenceIds = Array.isArray(raw?.occurrence_ids)
      ? raw.occurrence_ids.filter(x => typeof x === 'string' && x.length > 0)
      : [];

    incoming.push({ template_name: name, venue_id: venueId, aliases, occurrence_ids: occurrenceIds });
  }

  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No valid items provided' }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Existing-template guard: we block anything that (name OR alias) matches at
  // the same scope. This prevents creating "Music Bingo" globally if there's
  // already a template whose aliases contain "Music Bingo" at venue_id null.
  const { data: existingTemplates, error: existingErr } = await supabase
    .from('event_templates')
    .select('template_name, aliases, venue_id')
    .limit(5000);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  // Scope → Set<normalised name-or-alias> for O(1) conflict checks.
  const claimed = new Map();  // scopeKey -> Set<normTitle>
  const addClaim = (normTitle, venueId) => {
    const key = scopeKey(normTitle, venueId);
    if (!claimed.has(key)) claimed.set(key, true);
  };
  for (const t of existingTemplates || []) {
    const venueId = t.venue_id || null;
    if (t.template_name) addClaim(norm(t.template_name), venueId);
    if (Array.isArray(t.aliases)) {
      for (const a of t.aliases) if (a) addClaim(norm(a), venueId);
    }
  }

  const rows = [];
  const skipped = [];
  // Parallel to `rows`: remembers which occurrence_ids each row wants linked,
  // so after Supabase returns inserted rows (with new UUIDs) we can pair them
  // back up by (template_name, venue_id). Insert order isn't guaranteed to
  // match, so we key the map instead of zipping by index.
  const linkPlan = new Map(); // scopeKey -> occurrence_ids[]
  for (const item of incoming) {
    const nameKey = scopeKey(norm(item.template_name), item.venue_id);
    // Any alias collision on the same scope also blocks the insert.
    const aliasConflict = item.aliases.some(a => claimed.has(scopeKey(norm(a), item.venue_id)));
    if (claimed.has(nameKey) || aliasConflict) {
      skipped.push({
        template_name: item.template_name,
        venue_id: item.venue_id,
        reason: claimed.has(nameKey) ? 'name_exists' : 'alias_exists',
      });
      continue;
    }

    rows.push({
      template_name: item.template_name,
      aliases: item.aliases,
      category: 'Live Music',
      venue_id: item.venue_id || null,
      is_event_only: false,
      image_url: null,
      bio: null,
      genres: null,
      vibes: null,
      image_source: null,
      bio_source: null,
      field_status: {},
      is_human_edited: {},
      is_locked: false,
    });
    if (item.occurrence_ids.length > 0) {
      linkPlan.set(nameKey, item.occurrence_ids);
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({
      inserted: 0,
      skipped,
      message: 'Every requested item is already covered by an existing template',
    });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('event_templates')
    .insert(rows)
    .select();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // ── "Safe Link" — attach hand-picked occurrences to their new template ────
  // Per-template, set events.template_id = <new_tid> WHERE id IN (<picks>).
  // Soft-fails: if the column doesn't exist yet, or the update errors, we
  // report that in link_warnings but still return the template insert as a
  // success. This lets the admin iterate on schema without losing the rows
  // that were just created.
  const linkResults = [];   // per template: { template_id, linked_count }
  const linkWarnings = [];  // per template: { template_id, error }
  for (const tpl of inserted || []) {
    const key = scopeKey(norm(tpl.template_name), tpl.venue_id || null);
    const picks = linkPlan.get(key);
    if (!picks || picks.length === 0) continue;

    try {
      const { data: linked, error: linkErr } = await supabase
        .from('events')
        .update({ template_id: tpl.id })
        .in('id', picks)
        .select('id');

      if (linkErr) {
        linkWarnings.push({ template_id: tpl.id, template_name: tpl.template_name, error: linkErr.message });
      } else {
        linkResults.push({ template_id: tpl.id, template_name: tpl.template_name, linked_count: linked?.length || 0 });
      }
    } catch (e) {
      linkWarnings.push({ template_id: tpl.id, template_name: tpl.template_name, error: String(e?.message || e) });
    }
  }

  revalidatePath('/');
  revalidatePath('/api/events');

  return NextResponse.json({
    inserted: inserted?.length || 0,
    skipped,
    templates: inserted || [],
    links: linkResults,
    link_warnings: linkWarnings,
  });
}
