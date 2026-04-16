#!/usr/bin/env node
/**
 * Forensic investigation: why are 5 events on 2026-04-21 showing as
 * "Human-locked" when the user didn't manually lock them?
 *
 * READ-ONLY. No mutations. Uses the service-role key from .env.local so
 * RLS can't hide the is_human_edited columns.
 *
 * Usage (from the repo root, where `node_modules/` and `.env.local` live):
 *     node scripts/investigate-lock-2026-04-21.mjs
 *
 * Prints 4 sections:
 *   1. Per-row state (timestamps, lock flags, venue/artist FK)
 *   2. updated_at cluster view (grouped by minute)
 *   3. Linked artist JSONB lock state
 *   4. Venue-link trait
 *
 * The trailing "How to read" note explains which write site in the
 * codebase each result pattern maps to.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

// Minimal .env parser — avoids a dotenv dep.
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key);

// Eastern day 2026-04-21 → UTC bounds (EDT = UTC-4).
const dateStart = '2026-04-21T04:00:00Z';
const dateEnd   = '2026-04-22T04:00:00Z';

const NAMES = [
  'Spring Wine Dinner',
  'Al Holmes',
  'Frankie',
  'Karaoke',          // prefix match; "Karaoke 8pm every" may be recurring/truncated
  'Stan Steele',
];

function fmt(ts) {
  if (!ts) return '— null —';
  const d = new Date(ts);
  const utc = d.toISOString();
  // Convert to Eastern (EDT = UTC-4 on 2026-04-21).
  const etH = (d.getUTCHours() - 4 + 24) % 24;
  const etM = d.getUTCMinutes();
  return `${utc}  (ET ${String(etH).padStart(2,'0')}:${String(etM).padStart(2,'0')})`;
}

console.log('━'.repeat(80));
console.log('STEP 1 · Locate matched events on 2026-04-21 (Eastern)');
console.log('━'.repeat(80));

const { data: allOnDate, error: listErr } = await supabase
  .from('events')
  .select(`
    id, event_title, artist_name, venue_id, venue_name,
    created_at, updated_at,
    is_human_edited, is_locked,
    artist_id, event_date, status,
    venues(id, name, created_at),
    artists(id, name, bio, image_url, bio_source, image_source,
            is_human_edited, updated_at, created_at)
  `)
  .eq('status', 'published')
  .gte('event_date', dateStart)
  .lte('event_date', dateEnd);

if (listErr) {
  console.error('FATAL:', listErr.message);
  process.exit(1);
}
console.log(`Found ${allOnDate.length} published events on 2026-04-21.`);

const matched = [];
for (const name of NAMES) {
  const lower = name.toLowerCase();
  const hit = allOnDate.find(e =>
    (e.artist_name || '').toLowerCase().includes(lower) ||
    (e.event_title || '').toLowerCase().includes(lower)
  );
  if (hit) matched.push({ searchedAs: name, ...hit });
  else console.log(`  NOT FOUND on 2026-04-21: "${name}"`);
}
console.log(`Matched ${matched.length}/${NAMES.length} names.`);

// ── Per-row timestamps ─────────────────────────────────────────────────────
console.log('\n' + '━'.repeat(80));
console.log('STEP 2 · Per-row state');
console.log('━'.repeat(80));
for (const e of matched) {
  console.log(`\n"${e.searchedAs}"  (id=${e.id.slice(0,8)}…)`);
  console.log(`  artist_name      : "${e.artist_name}"`);
  console.log(`  event_title      : "${e.event_title}"`);
  console.log(`  created_at       : ${fmt(e.created_at)}`);
  console.log(`  updated_at       : ${fmt(e.updated_at)}`);
  const gapSec = e.updated_at && e.created_at
    ? Math.round((+new Date(e.updated_at) - +new Date(e.created_at)) / 1000)
    : null;
  console.log(`  secs since create: ${gapSec ?? '—'}`);
  console.log(`  is_human_edited  : ${JSON.stringify(e.is_human_edited)}`);
  console.log(`  is_locked        : ${JSON.stringify(e.is_locked)}`);
  console.log(`  venue_id         : ${e.venue_id || '— null —'}  (venues.name="${e.venues?.name || ''}")`);
  console.log(`  artist_id        : ${e.artist_id || '— null —'}  (artists.name="${e.artists?.name || ''}")`);
  if (e.artists) {
    console.log(`  artists.updated  : ${fmt(e.artists.updated_at)}`);
    console.log(`  artists.is_human_edited:`);
    console.log(`    ${JSON.stringify(e.artists.is_human_edited)}`);
    console.log(`  artists.bio_source  = ${e.artists.bio_source ?? '—'}`);
    console.log(`  artists.image_source= ${e.artists.image_source ?? '—'}`);
  }
  if (e.venues) {
    // Note: this schema's `venues` has no updated_at column, so we can't
    // time-correlate a venue-link action to the event's is_human_edited
    // flip. We still show the venue row's created_at as a sanity check —
    // a brand-new venue created seconds before the cluster is suspicious.
    console.log(`  venues.created   : ${fmt(e.venues.created_at)}`);
  }
}

// ── Cluster analysis ───────────────────────────────────────────────────────
console.log('\n' + '━'.repeat(80));
console.log('STEP 3 · updated_at cluster (bucketed to minute)');
console.log('━'.repeat(80));
const buckets = {};
for (const e of matched) {
  if (!e.updated_at) continue;
  const key = e.updated_at.slice(0, 16); // YYYY-MM-DDTHH:MM
  buckets[key] = (buckets[key] || []).concat(e.searchedAs);
}
for (const [k, names] of Object.entries(buckets).sort()) {
  console.log(`  ${k}Z   (${names.length} row${names.length === 1 ? '' : 's'})  ${names.join(' · ')}`);
}

const times = matched
  .map(e => e.updated_at && +new Date(e.updated_at))
  .filter(Boolean)
  .sort((a, b) => a - b);
if (times.length >= 2) {
  const spanSec = (times[times.length - 1] - times[0]) / 1000;
  console.log(`\nSpan earliest → latest updated_at: ${spanSec.toFixed(1)}s`);
  if (spanSec < 60)       console.log(`  → TIGHT CLUSTER (<60s) — single bulk write.`);
  else if (spanSec < 600) console.log(`  → LOOSE CLUSTER (<10min) — likely a cron or scripted batch.`);
  else                    console.log(`  → SPREAD — probably not a single script run.`);
}

// Venue-sharing trait.
const venueIds = new Set(matched.map(e => e.venue_id).filter(Boolean));
console.log(`\nDistinct venue_ids across the ${matched.length} events: ${venueIds.size}`);
if (venueIds.size === 1) console.log(`  → All share venue_id=${[...venueIds][0]} — bulk venue-link suspect.`);
else if (venueIds.size > 1) console.log(`  → Spans ${venueIds.size} venues — rules out a single-venue batch op.`);

// ── Artist JSONB summary ───────────────────────────────────────────────────
console.log('\n' + '━'.repeat(80));
console.log('STEP 4 · Artist JSONB lock summary');
console.log('━'.repeat(80));
for (const e of matched) {
  const a = e.artists;
  if (!a) { console.log(`  "${e.searchedAs}" → no linked artist row`); continue; }
  const lock = a.is_human_edited;
  if (lock === true)       console.log(`  "${e.searchedAs}" → artist FULL-ROW locked (boolean true)`);
  else if (lock === false) console.log(`  "${e.searchedAs}" → artist lock flag false`);
  else if (lock === null || lock === undefined) console.log(`  "${e.searchedAs}" → artist lock flag null`);
  else if (typeof lock === 'object') {
    console.log(`  "${e.searchedAs}" → PER-FIELD JSONB locks: ${JSON.stringify(lock)}`);
  } else {
    console.log(`  "${e.searchedAs}" → unexpected lock shape: ${JSON.stringify(lock)}`);
  }
}

// ── Interpretation hints ───────────────────────────────────────────────────
console.log('\n' + '━'.repeat(80));
console.log('HOW TO READ (map results to suspect code paths)');
console.log('━'.repeat(80));
console.log(`
1. If all 5 event.updated_at values share the same minute bucket in STEP 3,
   a single write did it. Identify the bucket's ET time and check:

   • Lines up with a Magic Wand ✨ Auto-Fill click on 2026-04-21?
     → src/app/api/admin/enrich-date/route.js:348 sets is_human_edited=true
       on every event it enriches that date. Matches a 5-row cluster on a
       Spotlight date.

   • Lines up with a DELETE/unlink on any artist whose name matches one of
     these 5 performers?
     → src/app/api/admin/artists/route.js:416-419 does an UNSCOPED
           .update({ artist_id: null, is_human_edited: true })
           .ilike('artist_name', artist.name)
       across ALL events — no date filter, no status filter. A single
       artist delete can flip every future-dated event with that name.

   • No matching admin activity, times are suspiciously round (xx:00 ET)?
     → We do not currently ship a cron that writes is_human_edited=true,
       so a round-time cluster with nothing in the admin log means either
       a cron we don't know about or a hand-run SQL UPDATE.

2. STEP 4 · If artists.is_human_edited is a JSONB OBJECT
   (e.g. { "bio": true, "image_url": true }) with a matching updated_at,
   the Magic Wand wrote it — only that path produces the per-field shape.

3. Venue-link trait: this schema's \`venues\` table has no updated_at
   column, so we can't time-correlate a venue-link action to the flip
   directly. But if all 5 events share a venue_id AND the STEP 3 cluster
   is tight, a bulk SQL UPDATE that set both venue_id and is_human_edited
   is still the simplest explanation (no admin UI does this today).
`);
