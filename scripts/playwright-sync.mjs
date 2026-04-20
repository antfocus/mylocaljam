#!/usr/bin/env node
/**
 * Playwright Sync Runner
 * ----------------------
 * Standalone Node script that runs the Playwright-based venue scrapers and
 * writes results directly to Supabase. Designed to be invoked from a GitHub
 * Action (see .github/workflows/playwright-scrapers.yml) since Vercel's
 * serverless runtime can't run a full Chromium instance.
 *
 * Why this exists:
 *   The main Vercel cron (POST /api/cron/sync-events, 10 PM ET) runs ~46
 *   fetch()-based scrapers on the server. A handful of venues (Brielle House,
 *   and eventually House of Independents, Starland Ballroom) use JavaScript-
 *   rendered calendars (FullCalendar, React SPAs) that either block server
 *   IPs or require a real browser to extract events. Those run here instead.
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY       — Service role key (bypasses RLS)
 *
 * Run locally:
 *   node scripts/playwright-sync.mjs
 *
 * Exit codes:
 *   0 — all scrapers completed (with or without zero events); details in log
 *   1 — a fatal error prevented any scraper from running
 */

import { createClient } from '@supabase/supabase-js';
import { scrapeBrielleHouse } from '../src/lib/scrapers/brielleHouse.playwright.js';
import { scrapeHouseOfIndependents } from '../src/lib/scrapers/houseOfIndependents.playwright.js';

// ── Scraper registry ───────────────────────────────────────────────────────
// Add new Playwright scrapers here. `key` must match the scraper_health
// scraper_key used elsewhere (stable upsert key). `platform` is a human label.
const SCRAPERS = [
  {
    key: 'BrielleHouse',
    venue: 'Brielle House',
    fn: scrapeBrielleHouse,
    platform: 'Playwright (FullCalendar)',
    sourceUrl: 'https://brielle-house.com/specials-events/',
  },
  {
    key: 'HouseOfIndependents',
    venue: 'House of Independents',
    fn: scrapeHouseOfIndependents,
    platform: 'Playwright (Etix SPA)',
    sourceUrl: 'https://www.etix.com/ticket/v/33546/calendars',
  },
];

// ── Env validation ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[playwright-sync] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) },
});

// ── Time helpers (mirrors force-sync/route.js) ─────────────────────────────
function easternOffset(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).formatToParts(d);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'EST';
    return tz.includes('EDT') ? '-04:00' : '-05:00';
  } catch {
    return '-05:00';
  }
}

function convertTo24h(timeStr) {
  if (!timeStr) return '00:00';
  const cleaned = timeStr.trim().replace(/[+-]\d{2}(:\d{2})?$/, '').trim();

  // Range with AM/PM e.g. "6:00-9:30 PM" or "07:00 PM – 10:00 PM"
  const matchRange = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(AM|PM)/i);
  if (matchRange) {
    let h = parseInt(matchRange[1]);
    const m = matchRange[2] || '00';
    const period = matchRange[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // Single 12-hour e.g. "6 PM", "6:30 PM"
  const match12 = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = match12[2] || '00';
    const period = match12[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // 24-hour HH:MM
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${match24[2]}`;
  }
  return '00:00';
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function mapEvent(ev, venueMap, defaultTimes) {
  const venueId = venueMap[ev.venue] || null;
  const venueDefault = defaultTimes[ev.venue] || null;
  const hasRealTime = ev.time && ev.time !== '00:00' && ev.time !== '12:00 AM';

  let eventDate = null;
  if (ev.date) {
    if (ev.date.includes('T')) {
      eventDate = new Date(ev.date).toISOString();
    } else {
      const offset = easternOffset(ev.date);
      const t = hasRealTime ? convertTo24h(ev.time)
             : venueDefault ? convertTo24h(venueDefault)
             : '00:00';
      eventDate = new Date(`${ev.date}T${t}:00${offset}`).toISOString();
    }
  }

  // Keep ticket_link only if it's off-domain (same convention as force-sync)
  let ticketLink = ev.ticket_url || null;
  if (ticketLink && ev.source_url) {
    try {
      const tHost = new URL(ticketLink).hostname.replace(/^www\./, '');
      const sHost = new URL(ev.source_url).hostname.replace(/^www\./, '');
      if (tHost === sHost) ticketLink = null;
    } catch { /* keep ticketLink as-is */ }
  }

  return {
    artist_name: decodeHtmlEntities(ev.title),
    venue_name: ev.venue,
    venue_id: venueId,
    event_date: eventDate,
    ticket_link: ticketLink,
    cover: ev.price || null,
    source: ev.source_url || null,
    image_url: ev.image_url || null,
    external_id: ev.external_id,
    status: 'published',
    verified_at: new Date().toISOString(),
  };
}

// ── Upsert + health update for a single scraper ────────────────────────────
async function runOne(scraper, venueMap, defaultTimes) {
  const start = Date.now();
  console.log(`\n[playwright-sync] ▶ ${scraper.key}`);

  let result;
  try {
    result = await scraper.fn();
  } catch (err) {
    result = { events: [], error: err.message };
  }

  const mapped = result.events.map(ev => mapEvent(ev, venueMap, defaultTimes));
  const seen = new Set();
  const valid = mapped.filter(ev => {
    if (!ev.external_id || !ev.event_date) return false;
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });

  // Respect human edits: skip locked rows for destructive upsert,
  // and only update safe fields on locked ones.
  const protectedIds = new Set();
  try {
    const extIds = valid.map(e => e.external_id);
    for (let i = 0; i < extIds.length; i += 200) {
      const chunk = extIds.slice(i, i + 200);
      const { data: locked } = await supabase
        .from('events')
        .select('external_id')
        .in('external_id', chunk)
        .eq('is_human_edited', true);
      for (const row of locked || []) protectedIds.add(row.external_id);
    }
  } catch { /* proceed */ }

  const unprotected = valid.filter(e => !protectedIds.has(e.external_id));
  const lockedRows  = valid.filter(e => protectedIds.has(e.external_id));

  let upserted = 0;
  const upsertErrors = [];
  const BATCH = 50;
  for (let i = 0; i < unprotected.length; i += BATCH) {
    const batch = unprotected.slice(i, i + BATCH);
    const { error } = await supabase.from('events').upsert(batch, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    });
    if (error) upsertErrors.push(error.message);
    else upserted += batch.length;
  }

  // Safe-field update for locked (human-edited) rows
  for (const ev of lockedRows) {
    try {
      const safe = { verified_at: new Date().toISOString() };
      if (ev.ticket_link) safe.ticket_link = ev.ticket_link;
      if (ev.cover) safe.cover = ev.cover;
      if (ev.source) safe.source = ev.source;
      if (Object.keys(safe).length > 1) {
        await supabase.from('events').update(safe).eq('external_id', ev.external_id);
      }
      upserted++;
    } catch { /* skip */ }
  }

  // scraper_health upsert
  const newStatus = result.error ? 'fail' : (result.events.length === 0 ? 'warning' : 'success');
  let healthError = null;
  try {
    const { error: hErr } = await supabase.from('scraper_health').upsert({
      scraper_key: scraper.key,
      venue_name: scraper.venue,
      website_url: scraper.sourceUrl,
      platform: scraper.platform,
      events_found: result.events.length,
      status: newStatus,
      error_message: result.error || null,
      last_sync: new Date().toISOString(),
    }, { onConflict: 'scraper_key' });
    if (hErr) healthError = hErr.message;
  } catch (e) {
    healthError = e.message;
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';
  console.log(`[playwright-sync] ${scraper.key}: scraped=${result.events.length} upserted=${upserted} duration=${duration}`);
  if (result.error) console.log(`[playwright-sync]   error: ${result.error}`);
  if (upsertErrors.length) console.log(`[playwright-sync]   upsert errors: ${upsertErrors.join('; ')}`);
  if (healthError) console.log(`[playwright-sync]   health error: ${healthError}`);

  return { key: scraper.key, scraped: result.events.length, upserted, error: result.error, healthError };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[playwright-sync] Starting ${SCRAPERS.length} Playwright scraper(s) at ${new Date().toISOString()}`);

  // Preload venue map + default times once for all scrapers
  const { data: venues, error: vErr } = await supabase
    .from('venues')
    .select('id, name, default_start_time');
  if (vErr) {
    console.error('[playwright-sync] Failed to load venues:', vErr.message);
    process.exit(1);
  }
  const venueMap = {};
  const defaultTimes = {};
  for (const v of venues || []) {
    venueMap[v.name] = v.id;
    if (v.default_start_time) defaultTimes[v.name] = v.default_start_time;
  }

  const summaries = [];
  for (const scraper of SCRAPERS) {
    const summary = await runOne(scraper, venueMap, defaultTimes);
    summaries.push(summary);
  }

  console.log('\n[playwright-sync] === Summary ===');
  for (const s of summaries) {
    const label = s.error ? 'FAIL' : (s.scraped === 0 ? 'WARN' : 'OK');
    console.log(`  [${label}] ${s.key}: ${s.scraped} scraped, ${s.upserted} upserted${s.error ? ` — ${s.error}` : ''}`);
  }

  const anyFailed = summaries.some(s => s.error);
  // Exit 0 either way — scraper_health captures failures and we don't want to
  // spam Actions notifications for transient venue-side outages. Flip to
  // `process.exit(anyFailed ? 2 : 0)` if you want failures to mark the run red.
  process.exit(0);
}

main().catch(err => {
  console.error('[playwright-sync] Fatal error:', err);
  process.exit(1);
});
