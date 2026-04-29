export const maxDuration = 60; // Vercel Hobby default is 10s — way too short for 40+ scrapers

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { scrapePigAndParrot } from '@/lib/scrapers/pigAndParrot';
import { scrapeTicketmaster } from '@/lib/scrapers/ticketmaster';
import { scrapeJoesSurfShack } from '@/lib/scrapers/joesSurfShack';
import { scrapeStStephensGreen } from '@/lib/scrapers/stStephensGreen';
import { scrapeMcCanns } from '@/lib/scrapers/mccanns';
import { scrapeBeachHaus } from '@/lib/scrapers/beachHaus';
import { scrapeMartells } from '@/lib/scrapers/martells';
import { scrapeBarAnticipation } from '@/lib/scrapers/barAnticipation';
import { scrapeJacksOnTheTracks } from '@/lib/scrapers/jacksOnTheTracks';
import { scrapeMarinaGrille } from '@/lib/scrapers/marinaGrille';
import { scrapeAnchorTavern } from '@/lib/scrapers/anchorTavern';
import { scrapeRBar } from '@/lib/scrapers/rBar';
import { scrapeBrielleHouse } from '@/lib/scrapers/brielleHouse';
// ParkStage HTML scraper removed — now covered by Ticketmaster (venue KovZ917AY7B)
import { scrapeTenthAveBurrito } from '@/lib/scrapers/tenthAveBurrito';
import { scrapeReefAndBarrel } from '@/lib/scrapers/reefAndBoatyard';
import { scrapePalmetto } from '@/lib/scrapers/palmetto';
import { scrapeLighthouseTavern } from '@/lib/scrapers/lighthouseTavern';
import { scrapeIdleHour } from '@/lib/scrapers/idleHour';
import { scrapeDrifthouse } from '@/lib/scrapers/drifthouse';
import { scrapeAsburyLanes } from '@/lib/scrapers/asburyLanes';
import { scrapeBakesBrewing } from '@/lib/scrapers/bakesBrewing';
import { scrapeRiverRock } from '@/lib/scrapers/riverRock';
import { scrapeJenksClub } from '@/lib/scrapers/jenksClub';
import { scrapeDjais } from '@/lib/scrapers/djais';
import { scrapeParkerHouse } from '@/lib/scrapers/parkerHouse';
import { scrapeOsprey } from '@/lib/scrapers/osprey';
import { scrapeWildAir } from '@/lib/scrapers/wildAir';
import { scrapeAsburyParkBrewery } from '@/lib/scrapers/asburyParkBrewery';
import { scrapeBoatyard401 } from '@/lib/scrapers/boatyard401';
import { scrapeWindwardTavern } from '@/lib/scrapers/windwardTavern';
import { scrapeJamians } from '@/lib/scrapers/jamians';
import { scrapeTheCabin } from '@/lib/scrapers/theCabin';
import { scrapeTheVogel } from '@/lib/scrapers/theVogel';
import { scrapeSunHarbor } from '@/lib/scrapers/sunHarbor';
import { scrapeBumRogers } from '@/lib/scrapers/bumRogers';
import { scrapeTheColumns } from '@/lib/scrapers/theColumns';
import { scrapeTheRoost } from '@/lib/scrapers/theRoost';
import { scrapeDealLakeBar } from '@/lib/scrapers/dealLakeBar';
import { scrapeCrabsClaw } from '@/lib/scrapers/crabsClaw';
import { scrapeWaterStreet } from '@/lib/scrapers/waterStreet';
import { scrapeCrossroads } from '@/lib/scrapers/crossroads';
import { scrapeEventideGrille } from '@/lib/scrapers/eventideGrille';
import { scrapeTriumphBrewing } from '@/lib/scrapers/triumphBrewing';
import { scrapeBlackSwan } from '@/lib/scrapers/blackSwan';
// ── Proxy-routed scrapers (IPRoyal residential proxy) ──
import { scrapeAlgonquinArts } from '@/lib/scrapers/algonquinArts';
import { scrapeTimMcLoones } from '@/lib/scrapers/timMcLoones';
// House of Independents — proxy connects but Etix does browser fingerprinting (serves 2KB shell). Needs headless browser.
// Starland Ballroom — proxy connects but AJAX returns empty. Needs headless browser.
// ── Vision OCR scrapers (Gemini 2.5 Flash — image flyer extraction) ──
import { scrapeMjsRestaurant } from '@/lib/scrapers/mjsRestaurant';
import { scrapePaganosUva } from '@/lib/scrapers/paganosUva';
import { scrapeCaptainsInn } from '@/lib/scrapers/captainsInn';
import { scrapeCharleysOceanGrill } from '@/lib/scrapers/charleysOceanGrill';
// Heights 27 and Leggett's removed — they use Boom Calendar (boomte.ch iframe),
// which can't be scraped server-side. Events come via community submissions instead.
import { enrichWithLastfm } from '@/lib/enrichLastfm';
import { enrichArtist } from '@/lib/enrichArtist';
import { matchTemplate } from '@/lib/matchTemplate';
// Shared classifier — single source of truth with /api/admin/auto-categorize.
// We invoke it here so newly scraped events get a confidence-bar pass at the
// tail end of the sync, after templates + keyword routing + artist_default
// inheritance have had their shots. Everything still sitting in triage after
// those passes is a genuine unknown — that's what the LLM earns its keep on.
import { classifyEvent, ALLOWED_CATEGORIES, CONFIDENCE_THRESHOLD } from '@/lib/eventClassifier';


export const dynamic = 'force-dynamic';

// Protect with a secret so only cron/authorized callers can trigger
// Accepts either CRON_SECRET (sent by Vercel Cron) or SYNC_SECRET (manual/internal)
function isAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;
  const validSecrets = [cronSecret, syncSecret].filter(Boolean);
  if (validSecrets.length === 0) return false; // fail closed — at least one secret must be configured
  const auth = request.headers.get('authorization');
  return validSecrets.some(s => auth === `Bearer ${s}`);
}

// Return the correct Eastern UTC offset for a given date string (YYYY-MM-DD)
// Accounts for US DST: EDT (UTC-4) from 2nd Sun Mar → 1st Sun Nov, else EST (UTC-5)
function easternOffset(dateStr) {
  try {
    // Use Intl to ask the America/New_York timezone what offset applies on this date
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).formatToParts(d);
    const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'EST';
    return tz.includes('EDT') ? '-04:00' : '-05:00';
  } catch {
    return '-05:00'; // safe fallback
  }
}

// Decode common HTML entities that scrapers may leave in text fields
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Extract time from messy title strings like "Malcolm McDonald 730-1030", "Live Music 9pm", "DJ 8:30 PM"
function extractTimeFromTitle(title) {
  if (!title) return null;

  // Pattern 1: "730-1030" or "7:30-10:30" (military-ish, no am/pm — assume PM for evening)
  const rangeMatch = title.match(/\b(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})\b/);
  if (rangeMatch) {
    let hr = parseInt(rangeMatch[1]);
    const mn = rangeMatch[2] || '00';
    // 3-4 digit number like 730 → 7:30
    if (hr >= 1 && hr <= 12) {
      if (hr < 12 && hr >= 1) hr += 12; // assume PM for evening shows
      return `${String(hr).padStart(2, '0')}:${mn}`;
    }
  }

  // Pattern 2: "8pm", "9:30 PM", "8:30PM", "9 pm"
  const ampmMatch = title.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (ampmMatch) {
    let hr = parseInt(ampmMatch[1]);
    const mn = ampmMatch[2] || '00';
    const period = ampmMatch[3].toLowerCase();
    if (period === 'pm' && hr !== 12) hr += 12;
    if (period === 'am' && hr === 12) hr = 0;
    return `${String(hr).padStart(2, '0')}:${mn}`;
  }

  return null;
}

// Strip time patterns from title to clean up the artist name
function stripTimeFromTitle(title) {
  if (!title) return title;
  return title
    .replace(/\s+\d{1,2}:?\d{2}\s*[-–]\s*\d{1,2}:?\d{2}\s*(am|pm)?\s*/gi, ' ')
    .replace(/\s+\d{1,2}(?::\d{2})?\s*(am|pm)\s*[-–]?\s*\d{0,2}:?\d{0,2}\s*(am|pm)?\s*/gi, ' ')
    .replace(/\s+\d{1,2}(?::\d{2})?\s*(am|pm)\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Normalize a venue name for fuzzy matching against the venues table.
// Lowercase + trim + strip a leading "the " article so the scraper's
// "Wonder Bar" lines up with the DB's "The Wonder Bar" (and vice versa).
// Used as the keying function for both venueMap (id lookup) and
// defaultTimes (start-time lookup) — both sides MUST normalize the same
// way or the lookups silently miss and events ship with venue_id NULL.
function normalizeVenueName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/^the\s+/i, '');
}

// Map scraper fields → Supabase schema
function mapEvent(ev, venueMap, defaultTimes) {
  const venueKey = normalizeVenueName(ev.venue);
  const venueId = venueMap[venueKey] || null;

  // Try to extract time from title if scraper didn't provide one
  let scrapedTime = ev.time;
  let cleanTitle = ev.title;
  if (!scrapedTime || scrapedTime === '00:00' || scrapedTime === '12:00 AM') {
    const titleTime = extractTimeFromTitle(ev.title);
    if (titleTime) {
      scrapedTime = titleTime;
      cleanTitle = stripTimeFromTitle(ev.title);
    }
  }

  // Fallback to venue default time if still no time found.
  // Same normalized key as the venueMap above — see normalizeVenueName.
  const venueDefaultTime = defaultTimes[venueKey] || null;
  const hasRealTime = scrapedTime && scrapedTime !== '00:00' && scrapedTime !== '12:00 AM';

  // Track whether we actually have a real time or are guessing
  let isTimeTbd = false;

  // Combine date + time into a full ISO timestamp (Eastern)
  let eventDate = null;
  if (ev.date) {
    try {
      if (ev.date.includes('T')) {
        const d = new Date(ev.date);
        if (isNaN(d.getTime())) throw new Error(`Invalid ISO date: "${ev.date}"`);
        eventDate = d.toISOString();
      } else {
        const offset = easternOffset(ev.date);
        let timeStr;
        if (hasRealTime) {
          timeStr = convertTo24h(scrapedTime);
        } else if (venueDefaultTime) {
          timeStr = convertTo24h(venueDefaultTime);
        } else {
          timeStr = '00:00';
          isTimeTbd = true;
        }
        const raw = `${ev.date}T${timeStr}:00${offset}`;
        const d = new Date(raw);
        if (isNaN(d.getTime())) throw new Error(`Invalid constructed date: "${raw}"`);
        eventDate = d.toISOString();
      }
    } catch (dateErr) {
      console.error(`[mapEvent] Bad date for "${ev.title}" at ${ev.venue}: ${dateErr.message}`);
      eventDate = null;
    }
  }

  return {
    artist_name: decodeHtmlEntities(cleanTitle),
    venue_name: ev.venue,
    venue_id: venueId,
    event_date: eventDate,
    is_time_tbd: isTimeTbd,
    // Pass through scraper description — used for scraper-first artist enrichment
    _scraper_bio: ev.description || null,
    _scraper_image: ev.image_url || null,
    // Only store ticket_link if it points to a real external ticketing site
    // (different domain than the venue's own source_url)
    ticket_link: (() => {
      const t = ev.ticket_url || null;
      const s = ev.source_url || null;
      if (!t) return null;
      if (!s) return t;
      try {
        const tHost = new URL(t).hostname.replace(/^www\./, '');
        const sHost = new URL(s).hostname.replace(/^www\./, '');
        return tHost === sHost ? null : t;
      } catch { return t; }
    })(),
    cover: ev.price || null,
    source: ev.source_url || null,
    // Write to event_image_url so the frontend waterfall can find it
    event_image_url: ev.image_url || null,
    external_id: ev.external_id,
    status: 'published',
    verified_at: new Date().toISOString(),
  };
}

// Convert any time string to "HH:MM" 24-hour format.
// Handles: "18:00", "18:00:00", "18:00-21:30", "6:00 PM", "6:00-9:30 PM",
//          "6 PM", "6PM", "1800", Supabase TIME "18:00:00+00", etc.
function convertTo24h(timeStr) {
  if (!timeStr) return '00:00';

  // Clean up: trim whitespace and remove timezone suffixes from DB TIME values
  const cleaned = timeStr.trim().replace(/[+-]\d{2}(:\d{2})?$/, '').trim();

  // 1a. Time RANGE with AM/PM — "6:00-9:30 PM", "6-9:30 PM", "2:00 PM-5:00 PM"
  //     Extract only the START time; the period applies to the start if only one is given
  const matchRange = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(AM|PM)/i);
  if (matchRange) {
    let h = parseInt(matchRange[1]);
    const m = matchRange[2] || '00';
    const period = matchRange[3].toUpperCase(); // Use the trailing AM/PM for both
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // 1b. Single 12-hour AM/PM — "6:00 PM", "6PM", "6 PM", "12:30 AM"
  const match12 = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = match12[2] || '00';
    const period = match12[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // 2. 24-hour HH:MM or HH:MM:SS (with optional range, seconds, etc.)
  //    Matches: "18:00", "18:00:00", "18:00-21:30", "9:30"
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:${match24[2]}`;
    }
  }

  // 3. Military-ish "1800" or "0930" (no colon, 3-4 digits)
  const matchMil = cleaned.match(/^(\d{1,2})(\d{2})$/);
  if (matchMil) {
    const h = parseInt(matchMil[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:${matchMil[2]}`;
    }
  }

  console.warn(`[convertTo24h] Unrecognized time format: "${timeStr}"`);
  return '00:00';
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  // Wall-clock stamp used by the Step 4 AI fallback below to scope its
  // confidence-bar pass to events that were inserted by THIS sync run —
  // so we never silently re-classify yesterday's stuck triage rows
  // (those stay admin-visible; they can still be picked up from the
  // Event Feed "AI Categorize" button).
  const syncStartedAt = new Date().toISOString();
  const supabase = getAdminClient();

  // ── Shard/tier-based scraper selection ────────────────────────────────────
  // There are three execution modes, selected by `?shard=` or `?tier=`:
  //
  //   ?shard=1         → run FAST_SHARD_1 only (daily cron, ~25-30s budget)
  //   ?shard=2         → run FAST_SHARD_2 only (daily cron, ~25-30s budget)
  //   ?tier=slow       → run SLOW_SCRAPER_KEYS only (weekly cron, Vision OCR + proxy)
  //   ?tier=fast       → run BOTH fast shards (legacy; manual diagnostic)
  //   ?tier=all        → run everything (manual diagnostic only)
  //   (no param)       → defaults to tier=fast (legacy behavior)
  //
  // Why shards: as the venue list grew past ~35 scrapers the combined fast-tier
  // sync hit ~59s/60s on the Vercel Hobby cap. Splitting into two halves gives
  // each cron ~30s breathing room and scales linearly as new venues are added
  // (drop each new scraper into whichever shard is lighter). Post-scrape steps
  // (templateMatcher, autoSort, scraperArtistEnrich, upsert) naturally scope to
  // the shard because they operate on `allEvents`, which only contains events
  // from scrapers that actually ran. Slow-tier stays untouched in its weekly
  // cron.
  //
  // Shard assignment is tuned for balance by event volume (≈845 vs ≈850
  // events/run as of April 2026). RiverRock is intentionally in shard 2 with
  // its 11s of detail fetches kept apart from Martells's 257 events in shard 1.
  const shardParam = new URL(request.url).searchParams.get('shard');
  const tierParam = new URL(request.url).searchParams.get('tier');
  const tier = tierParam || (shardParam ? null : 'fast');
  if (tier && !['fast', 'slow', 'all'].includes(tier)) {
    return NextResponse.json(
      { error: `Invalid tier: ${tier}. Use fast|slow|all.` },
      { status: 400 }
    );
  }
  if (shardParam && !['1', '2'].includes(shardParam)) {
    return NextResponse.json(
      { error: `Invalid shard: ${shardParam}. Use 1|2.` },
      { status: 400 }
    );
  }

  const SLOW_SCRAPER_KEYS = new Set([
    'TenthAveBurrito', 'Palmetto', 'MjsRestaurant', 'PaganosUva',
    'CaptainsInn', 'CharleysOcean', 'EventideGrille',
    'AlgonquinArts', 'TimMcLoones',
    'LighthouseTavern',
  ]);

  // Fast-tier shard 1 — higher-volume venues + lighter scrapers. ~845 events.
  const FAST_SHARD_1 = new Set([
    'Ticketmaster', 'Martells', 'AsburyParkBrewery', 'IdleHour', 'TheVogel',
    'WindwardTavern', 'JenksClub', 'StStephensGreen', 'Crossroads',
    'DealLakeBar', 'WildAir', 'TheRoost', 'JacksOnTheTracks', 'BumRogers',
    'TheColumns', 'TheCabin', 'AnchorTavern', 'Boatyard401', 'Djais',
    // 'Drifthouse',  ← parked (Apr 28, 2026). Returned count=0 across
    //   multiple syncs. Tried browser-shape UA, regex close-tag fix, and
    //   proxyFetch — none unblocked. See PARKED.md #11. Wiring (import,
    //   destructure, Promise.all entry, scraperResults, VENUE_REGISTRY,
    //   allEvents spread) stays so the scraper can be re-enabled with a
    //   one-line edit (uncomment) once root cause is found.
  ]);

  // Fast-tier shard 2 — paired with RiverRock (detail-fetch heavy) and the new
  // ParkerHouse scraper. ~850 events. Osprey added April 2026 — single fetch,
  // ~50 events, negligible runtime add.
  const FAST_SHARD_2 = new Set([
    'BarAnticipation', 'ParkerHouse', 'RiverRock', 'McCanns', 'BakesBrewing',
    'PigAndParrot', 'JoesSurfShack', 'Jamians', 'BeachHaus', 'AsburyLanes',
    'TriumphBrewing', 'ReefAndBarrel', 'SunHarbor', 'BlackSwan', 'RBar',
    'WaterStreet', 'CrabsClaw', 'MarinaGrille', 'BrielleHouse', 'Osprey',
  ]);

  const includeSlow = tier === 'slow' || tier === 'all';
  const includeFast = tier === 'fast' || tier === 'all';
  const includeShard1 = shardParam === '1' || includeFast;
  const includeShard2 = shardParam === '2' || includeFast;

  // Central gate used by every scraper entry in the Promise.all below plus the
  // per-scraper health-row filter at the end of the run. Slow scrapers are only
  // gated on tier; fast scrapers check whichever shard they belong to.
  function shouldRunScraper(key) {
    if (SLOW_SCRAPER_KEYS.has(key)) return includeSlow;
    if (FAST_SHARD_1.has(key)) return includeShard1;
    if (FAST_SHARD_2.has(key)) return includeShard2;
    // Unknown key — shouldn't happen if the shard sets stay in sync with the
    // scraper list, but default to falsy rather than silently running it.
    return false;
  }

  // Skip the post-scrape artist-bio enrichment + AI categorization blocks
  // when this run needs to fit under the 60s Vercel Hobby cap. Cron calls pass
  // ?skipEnrich=true because those blocks can eat 20-30s on nights with many
  // new events, running out the function clock before AI categorize finishes.
  // When skipped, new events land in the DB with triage_status=null/pending;
  // the separate /api/enrich-backfill and /api/admin/auto-categorize paths
  // (or a dedicated enrichment cron — TODO) pick them up out-of-band.
  // Default false so manual/diagnostic invocations of this route still run
  // the full pipeline end-to-end.
  const skipEnrich = new URL(request.url).searchParams.get('skipEnrich') === 'true';
  if (skipEnrich) console.log('[sync-events] skipEnrich=true — enrichment + AI categorize will be skipped');
  // No-op stub for skipped scrapers — keeps array positions stable in the
  // big destructure below so we don't have to refactor the whole orchestration.
  const skip = async () => ({ events: [], error: null });
  console.log(
    `[sync-events] shard=${shardParam || '-'} tier=${tier || '-'} ` +
    `(shard1=${includeShard1}, shard2=${includeShard2}, slow=${includeSlow})`
  );

  // Load venue map and default times.
  // Both maps are keyed by the NORMALIZED venue name so the scraper's
  // "Wonder Bar" finds the DB's "The Wonder Bar" — see normalizeVenueName().
  // Without this, ~50 events/week were arriving with venue_id NULL, which
  // also broke any downstream search that joins through the venues table
  // (e.g. "Asbury Park events" — events without venue_id have no address).
  const { data: venues } = await supabase.from('venues').select('id, name, default_start_time');
  const venueMap = {};
  const defaultTimes = {};
  for (const v of venues || []) {
    const key = normalizeVenueName(v.name);
    venueMap[key] = v.id;
    if (v.default_start_time) defaultTimes[key] = v.default_start_time;
  }

  // Run all scrapers in parallel
  const [pigAndParrot, ticketmaster, joesSurfShack, stStephensGreen, mcCanns, beachHaus, martells, barAnticipation, jacksOnTheTracks, marinaGrille, anchorTavern, rBar, brielleHouse, tenthAveBurrito, reefAndBarrel, palmetto, idleHour, asburyLanes, bakesBrewing, riverRock, jenksClub, djais, parkerHouse, osprey, wildAir, asburyParkBrewery, boatyard401, windwardTavern, jamians, theCabin, theVogel, sunHarbor, bumRogers, theColumns, theRoost, dealLakeBar, crabsClaw, waterStreet, crossroads, eventideGrille, triumphBrewing, blackSwan, algonquinArts, timMcLoones, mjsRestaurant, paganosUva, captainsInn, charleysOceanGrill, drifthouse, lighthouseTavern] = await Promise.all([
    shouldRunScraper('PigAndParrot')   ? scrapePigAndParrot()       : skip(),
    shouldRunScraper('Ticketmaster')   ? scrapeTicketmaster()       : skip(),
    shouldRunScraper('JoesSurfShack')  ? scrapeJoesSurfShack()      : skip(),
    shouldRunScraper('StStephensGreen')? scrapeStStephensGreen()    : skip(),
    shouldRunScraper('McCanns')        ? scrapeMcCanns()            : skip(),
    shouldRunScraper('BeachHaus')      ? scrapeBeachHaus()          : skip(),
    shouldRunScraper('Martells')       ? scrapeMartells()           : skip(),
    shouldRunScraper('BarAnticipation')? scrapeBarAnticipation()    : skip(),
    shouldRunScraper('JacksOnTheTracks')? scrapeJacksOnTheTracks()  : skip(),
    shouldRunScraper('MarinaGrille')   ? scrapeMarinaGrille()       : skip(),
    shouldRunScraper('AnchorTavern')   ? scrapeAnchorTavern()       : skip(),
    shouldRunScraper('RBar')           ? scrapeRBar()               : skip(),
    shouldRunScraper('BrielleHouse')   ? scrapeBrielleHouse()       : skip(),
    shouldRunScraper('TenthAveBurrito')? scrapeTenthAveBurrito()    : skip(),  // Vision OCR (slow)
    shouldRunScraper('ReefAndBarrel')  ? scrapeReefAndBarrel()      : skip(),
    shouldRunScraper('Palmetto')       ? scrapePalmetto()           : skip(),  // Vision OCR (slow)
    shouldRunScraper('LighthouseTavern')? scrapeLighthouseTavern()  : skip(),  // Vision OCR (slow)
    shouldRunScraper('IdleHour')       ? scrapeIdleHour()           : skip(),
    shouldRunScraper('Drifthouse')     ? scrapeDrifthouse()         : skip(),
    shouldRunScraper('AsburyLanes')    ? scrapeAsburyLanes()        : skip(),
    shouldRunScraper('BakesBrewing')   ? scrapeBakesBrewing()       : skip(),
    shouldRunScraper('RiverRock')      ? scrapeRiverRock()          : skip(),
    shouldRunScraper('JenksClub')      ? scrapeJenksClub()          : skip(),
    shouldRunScraper('Djais')          ? scrapeDjais()              : skip(),
    shouldRunScraper('ParkerHouse')    ? scrapeParkerHouse()        : skip(),
    shouldRunScraper('Osprey')         ? scrapeOsprey()             : skip(),
    shouldRunScraper('WildAir')        ? scrapeWildAir()            : skip(),
    shouldRunScraper('AsburyParkBrewery')? scrapeAsburyParkBrewery(): skip(),
    shouldRunScraper('Boatyard401')    ? scrapeBoatyard401()        : skip(),
    shouldRunScraper('WindwardTavern') ? scrapeWindwardTavern()     : skip(),
    shouldRunScraper('Jamians')        ? scrapeJamians()            : skip(),
    shouldRunScraper('TheCabin')       ? scrapeTheCabin()           : skip(),
    shouldRunScraper('TheVogel')       ? scrapeTheVogel()           : skip(),
    shouldRunScraper('SunHarbor')      ? scrapeSunHarbor()          : skip(),
    shouldRunScraper('BumRogers')      ? scrapeBumRogers()          : skip(),
    shouldRunScraper('TheColumns')     ? scrapeTheColumns()         : skip(),
    shouldRunScraper('TheRoost')       ? scrapeTheRoost()           : skip(),
    shouldRunScraper('DealLakeBar')    ? scrapeDealLakeBar()        : skip(),
    shouldRunScraper('CrabsClaw')      ? scrapeCrabsClaw()          : skip(),
    shouldRunScraper('WaterStreet')    ? scrapeWaterStreet()        : skip(),
    shouldRunScraper('Crossroads')     ? scrapeCrossroads()         : skip(),
    shouldRunScraper('EventideGrille') ? scrapeEventideGrille()     : skip(),  // Vision OCR (slow)
    shouldRunScraper('TriumphBrewing') ? scrapeTriumphBrewing()     : skip(),
    shouldRunScraper('BlackSwan')      ? scrapeBlackSwan()          : skip(),
    // Proxy-routed scrapers (IPRoyal residential proxy) — slow tier
    shouldRunScraper('AlgonquinArts')  ? scrapeAlgonquinArts()      : skip(),
    shouldRunScraper('TimMcLoones')    ? scrapeTimMcLoones()        : skip(),
    // Vision OCR scrapers (Perplexity Sonar — image flyer extraction) — slow tier
    shouldRunScraper('MjsRestaurant')  ? scrapeMjsRestaurant()      : skip(),
    shouldRunScraper('PaganosUva')     ? scrapePaganosUva()         : skip(),
    shouldRunScraper('CaptainsInn')    ? scrapeCaptainsInn()        : skip(),
    shouldRunScraper('CharleysOcean')  ? scrapeCharleysOceanGrill() : skip(),
  ]);

  const scraperResults = {
    PigAndParrot: { count: pigAndParrot.events.length, error: pigAndParrot.error },
    Ticketmaster: { count: ticketmaster.events.length, error: ticketmaster.error },
    JoesSurfShack: { count: joesSurfShack.events.length, error: joesSurfShack.error },
    StStephensGreen: { count: stStephensGreen.events.length, error: stStephensGreen.error },
    McCanns: { count: mcCanns.events.length, error: mcCanns.error },
    BeachHaus: { count: beachHaus.events.length, error: beachHaus.error },
    Martells: { count: martells.events.length, error: martells.error },
    BarAnticipation: { count: barAnticipation.events.length, error: barAnticipation.error },
    JacksOnTheTracks: { count: jacksOnTheTracks.events.length, error: jacksOnTheTracks.error },
    MarinaGrille: { count: marinaGrille.events.length, error: marinaGrille.error },
    AnchorTavern: { count: anchorTavern.events.length, error: anchorTavern.error },
    RBar: { count: rBar.events.length, error: rBar.error },
    BrielleHouse: { count: brielleHouse.events.length, error: brielleHouse.error },
    TenthAveBurrito: { count: tenthAveBurrito.events.length, error: tenthAveBurrito.error },
    ReefAndBarrel: { count: reefAndBarrel.events.length, error: reefAndBarrel.error },
    Palmetto: { count: palmetto.events.length, error: palmetto.error },
    LighthouseTavern: { count: lighthouseTavern.events.length, error: lighthouseTavern.error },
    IdleHour: { count: idleHour.events.length, error: idleHour.error },
    Drifthouse: { count: drifthouse.events.length, error: drifthouse.error },
    AsburyLanes: { count: asburyLanes.events.length, error: asburyLanes.error },
    BakesBrewing: { count: bakesBrewing.events.length, error: bakesBrewing.error },
    RiverRock: { count: riverRock.events.length, error: riverRock.error },
    JenksClub: { count: jenksClub.events.length, error: jenksClub.error },
    Djais: { count: djais.events.length, error: djais.error },
    ParkerHouse: { count: parkerHouse.events.length, error: parkerHouse.error },
    Osprey: { count: osprey.events.length, error: osprey.error },
    WildAir: { count: wildAir.events.length, error: wildAir.error },
    AsburyParkBrewery: { count: asburyParkBrewery.events.length, error: asburyParkBrewery.error },
    Boatyard401: { count: boatyard401.events.length, error: boatyard401.error },
    WindwardTavern: { count: windwardTavern.events.length, error: windwardTavern.error },
    Jamians: { count: jamians.events.length, error: jamians.error },
    TheCabin: { count: theCabin.events.length, error: theCabin.error },
    TheVogel: { count: theVogel.events.length, error: theVogel.error },
    SunHarbor: { count: sunHarbor.events.length, error: sunHarbor.error },
    BumRogers: { count: bumRogers.events.length, error: bumRogers.error },
    TheColumns: { count: theColumns.events.length, error: theColumns.error },
    TheRoost: { count: theRoost.events.length, error: theRoost.error },
    DealLakeBar: { count: dealLakeBar.events.length, error: dealLakeBar.error },
    CrabsClaw: { count: crabsClaw.events.length, error: crabsClaw.error },
    WaterStreet: { count: waterStreet.events.length, error: waterStreet.error },
    Crossroads: { count: crossroads.events.length, error: crossroads.error },
    EventideGrille: { count: eventideGrille.events.length, error: eventideGrille.error },
    TriumphBrewing: { count: triumphBrewing.events.length, error: triumphBrewing.error },
    BlackSwan: { count: blackSwan.events.length, error: blackSwan.error },
    // Proxy-routed scrapers (IPRoyal residential proxy)
    AlgonquinArts: { count: algonquinArts.events.length, error: algonquinArts.error },
    TimMcLoones: { count: timMcLoones.events.length, error: timMcLoones.error },
    // Vision OCR scrapers (Gemini 2.5 Flash)
    MjsRestaurant: { count: mjsRestaurant.events.length, error: mjsRestaurant.error },
    PaganosUva: { count: paganosUva.events.length, error: paganosUva.error },
    CaptainsInn: { count: captainsInn.events.length, error: captainsInn.error },
    CharleysOcean: { count: charleysOceanGrill.events.length, error: charleysOceanGrill.error },
  };

  // ── Venue registry (used by both scraper health writing and admin UI) ─────
  const VENUE_REGISTRY = {
    PigAndParrot: { venue: 'Pig & Parrot Brielle', url: 'https://www.thepigandparrot.com', source: 'GraphQL' },
    Ticketmaster: { venue: 'Ticketmaster Venues', url: 'https://ticketmaster.com', source: 'Ticketmaster API' },
    JoesSurfShack: { venue: "Joe's Surf Shack", url: 'https://www.jss.surf', source: 'WordPress AJAX' },
    StStephensGreen: { venue: "St. Stephen's Green", url: 'https://www.ststephensgreenpub.com', source: 'Google Calendar' },
    McCanns: { venue: "McCann's Tavern", url: 'http://www.mccannstavernnj.com', source: 'Google Calendar' },
    BeachHaus: { venue: 'Beach Haus', url: 'https://beachhausparty.com', source: 'WordPress' },
    Martells: { venue: "Martell's Tiki Bar", url: 'https://tikibar.com', source: 'HTML Scrape' },
    BarAnticipation: { venue: 'Bar Anticipation', url: 'https://bar-a.com', source: 'HTML Scrape' },
    JacksOnTheTracks: { venue: 'Jacks on the Tracks', url: 'https://www.jacksbytracks.com', source: 'Google Calendar' },
    MarinaGrille: { venue: 'Marina Grille', url: 'https://www.marinagrillenj.com', source: 'Squarespace' },
    AnchorTavern: { venue: 'Anchor Tavern', url: 'https://www.anchortavernnj.com', source: 'Squarespace' },
    RBar: { venue: 'R Bar', url: 'https://www.itsrbar.com', source: 'Squarespace' },
    BrielleHouse: { venue: 'Brielle House', url: 'https://brielle-house.com', source: 'WordPress AJAX' },
    TenthAveBurrito: { venue: '10th Ave Burrito', url: 'https://tenthaveburrito.com', source: 'Vision OCR (Gemini)' },
    ReefAndBarrel: { venue: 'Reef & Barrel', url: 'https://www.reefandbarrel.com', source: 'Google Calendar' },
    Palmetto: { venue: 'Palmetto', url: 'https://www.palmettoasburypark.com', source: 'Vision OCR (Gemini)' },
    LighthouseTavern: { venue: 'Lighthouse Tavern', url: 'https://www.lighthousetavernnj.com', source: 'Vision OCR (Gemini, multi-flyer)' },
    IdleHour: { venue: 'Idle Hour', url: 'https://www.ihpointpleasant.com', source: 'Google Calendar' },
    Drifthouse: { venue: 'Drifthouse', url: 'https://drifthousenj.com', source: 'WordPress + EBI plugin' },
    AsburyLanes: { venue: 'Asbury Lanes', url: 'https://www.asburylanes.com', source: 'HTML Scrape' },
    BakesBrewing: { venue: 'Bakes Brewing', url: 'https://www.bakesbrewing.com', source: 'HTML Scrape (Webflow)' },
    RiverRock: { venue: 'River Rock', url: 'https://riverrockbricknj.com', source: 'WordPress AJAX' },
    JenksClub: { venue: 'Jenks Club', url: 'https://jenksclub.com', source: 'WordPress AJAX (Calendarize It)' },
    Djais: { venue: "D'Jais", url: 'https://djais.com', source: 'WordPress REST (The Events Calendar)' },
    ParkerHouse: { venue: 'The Parker House', url: 'https://parkerhousenj.com', source: 'HTML Scrape (WordPress SSR)' },
    Osprey: { venue: 'The Osprey', url: 'https://www.ospreynightclub.com', source: 'HTML Scrape (custom)' },
    WildAir: { venue: 'Wild Air Beerworks', url: 'https://www.wildairbeer.com', source: 'Squarespace' },
    AsburyParkBrewery: { venue: 'Asbury Park Brewery', url: 'https://www.asburyparkbrewery.com', source: 'Squarespace' },
    Boatyard401: { venue: 'Boatyard 401', url: 'https://boatyard401.com', source: 'WordPress AJAX' },
    WindwardTavern: { venue: 'Windward Tavern', url: 'https://www.windwardtavern.com', source: 'Google Calendar' },
    Jamians: { venue: "Jamian's", url: 'https://www.jamiansfood.com', source: 'Squarespace' },
    TheCabin: { venue: 'The Cabin', url: 'https://www.thecabinnj.com', source: 'Squarespace' },
    TheVogel: { venue: 'The Vogel', url: 'https://thebasie.org', source: 'HTML Scrape' },
    SunHarbor: { venue: 'Sun Harbor', url: 'https://www.sunharborseafoodandgrill.com', source: 'Squarespace' },
    BumRogers: { venue: 'Bum Rogers Tavern', url: 'https://bumrogerstavern.com', source: 'BentoBox/Wix' },
    TheColumns: { venue: 'The Columns', url: 'https://thecolumnsnj.com', source: 'WordPress' },
    TheRoost: { venue: 'The Roost', url: 'https://theroostrestaurant.com', source: 'HTML Scrape' },
    DealLakeBar: { venue: 'Deal Lake Bar + Co.', url: 'https://www.deallakebarco.com', source: 'Squarespace' },
    CrabsClaw: { venue: "The Crab's Claw Inn", url: 'https://thecrabsclaw.com', source: 'RestaurantPassion' },
    WaterStreet: { venue: 'Water Street Bar & Grill', url: 'https://www.waterstreetnj.com', source: 'Squarespace' },
    Crossroads: { venue: 'Crossroads', url: 'https://www.xxroads.com', source: 'Eventbrite API' },
    EventideGrille: { venue: 'Eventide Grille', url: 'https://eventidegrille.com', source: 'Vision OCR (Gemini)' },
    TriumphBrewing: { venue: 'Triumph Brewing Red Bank', url: 'https://www.triumphbrewing.com', source: 'WordPress HTML (The Events Calendar)' },
    BlackSwan: { venue: 'The Black Swan', url: 'https://www.theblackswanap.com', source: 'Squarespace' },
    // Proxy-routed scrapers
    AlgonquinArts: { venue: 'Algonquin Arts Theatre', url: 'https://www.algonquinarts.org', source: 'PHP HTML (proxy)' },
    TimMcLoones: { venue: "Tim McLoone's Supper Club", url: 'https://mcloones.ticketbud.com', source: 'Ticketbud HTML (proxy)' },
    // Vision OCR scrapers (Gemini 2.5 Flash)
    MjsRestaurant: { venue: "MJ's Restaurant Bar & Grill", url: 'https://www.mjsrestaurant.com/Neptune/live-music/', source: 'Vision OCR (Gemini)' },
    PaganosUva: { venue: "Pagano's UVA Ristorante", url: 'https://www.uvaonmain.com/live-music/', source: 'Vision OCR (Gemini)' },
    CaptainsInn: { venue: "Captain's Inn", url: 'https://www.captainsinnnj.com/calendar', source: 'Vision OCR (Gemini)' },
    CharleysOcean: { venue: "Charley's Ocean Bar & Grill", url: 'https://www.charleysoceangrill.com/events.php', source: 'Vision OCR (Gemini)' },
  };

  // NOTE: scraper_health writing was moved to AFTER the upsert loops (search
  // for "Write scraper health") because the global summary row references
  // `totalUpserted` and `upsertErrors`, which are declared below in the upsert
  // step. Reading them here threw a TDZ ReferenceError that was swallowed by
  // the surrounding try/catch — which is why only 2/45 scrapers ever wrote
  // health rows historically. Keep the health write where it is now.

  // Combine all events
  const allEvents = [
    ...pigAndParrot.events,
    ...ticketmaster.events,
    ...joesSurfShack.events,
    ...stStephensGreen.events,
    ...mcCanns.events,
    ...beachHaus.events,
    ...martells.events,
    ...barAnticipation.events,
    ...jacksOnTheTracks.events,
    ...marinaGrille.events,
    ...anchorTavern.events,
    ...rBar.events,
    ...brielleHouse.events,
    ...tenthAveBurrito.events,
    ...reefAndBarrel.events,
    ...palmetto.events,
    ...lighthouseTavern.events,
    ...idleHour.events,
    ...drifthouse.events,
    ...asburyLanes.events,
    ...bakesBrewing.events,
    ...riverRock.events,
    ...jenksClub.events,
    ...djais.events,
    ...parkerHouse.events,
    ...osprey.events,
    ...wildAir.events,
    ...asburyParkBrewery.events,
    ...boatyard401.events,
    ...windwardTavern.events,
    ...jamians.events,
    ...theCabin.events,
    ...theVogel.events,
    ...sunHarbor.events,
    ...bumRogers.events,
    ...theColumns.events,
    ...theRoost.events,
    ...dealLakeBar.events,
    ...crabsClaw.events,
    ...waterStreet.events,
    ...crossroads.events,
    ...eventideGrille.events,
    ...triumphBrewing.events,
    ...blackSwan.events,
    // Proxy-routed scrapers
    ...algonquinArts.events,
    ...timMcLoones.events,
    // Vision OCR scrapers (Gemini 2.5 Flash)
    ...mjsRestaurant.events,
    ...paganosUva.events,
    ...captainsInn.events,
    ...charleysOceanGrill.events,
  ].map(ev => mapEvent(ev, venueMap, defaultTimes));

  // Filter out events with no external_id or date, and deduplicate by external_id
  const seen = new Set();
  const validEvents = allEvents.filter(ev => {
    if (!ev.external_id || !ev.event_date) return false;
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });

  // ── Community-submission dedup: drop scraped events that duplicate a
  //    human-submitted row at the same venue + date + artist (case-insensitive).
  //    Community submissions have external_id = NULL and are locked
  //    (is_locked=true after Phase-1 backfill; the legacy is_human_edited
  //    boolean is still written in parallel during the transition week),
  //    so they never collide on the external_id upsert — we must catch
  //    them here.
  let communityDupeCount = 0;
  try {
    // Collect unique venue+date pairs from this sync batch
    const venueDates = [...new Set(validEvents.map(ev => `${ev.venue_id}|${ev.event_date?.slice(0, 10)}`))];
    if (venueDates.length > 0) {
      // Fetch community-submitted events for those venue+date combos
      const venueIds = [...new Set(validEvents.map(ev => ev.venue_id).filter(Boolean))];
      const minDate = validEvents.reduce((min, ev) => ev.event_date?.slice(0, 10) < min ? ev.event_date.slice(0, 10) : min, '9999-12-31');
      const maxDate = validEvents.reduce((max, ev) => ev.event_date?.slice(0, 10) > max ? ev.event_date.slice(0, 10) : max, '0000-01-01');
      const { data: communityRows } = await supabase
        .from('events')
        .select('venue_id, event_date, artist_name')
        .in('venue_id', venueIds)
        .gte('event_date', minDate)
        .lte('event_date', maxDate + 'T23:59:59')
        // Phase-1 reader flip (Task #60): match both lock columns while
        // dual-writes bake. After is_human_edited is dropped this becomes
        // just `.eq('is_locked', true)`.
        .or('is_locked.eq.true,is_human_edited.eq.true')
        .is('external_id', null);
      if (communityRows?.length) {
        // Build a Set of normalized keys for fast lookup
        const communityKeys = new Set(
          communityRows.map(r => `${r.venue_id}|${r.event_date?.slice(0, 10)}|${(r.artist_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
        );
        const before = validEvents.length;
        const filtered = validEvents.filter(ev => {
          const key = `${ev.venue_id}|${ev.event_date?.slice(0, 10)}|${(ev.artist_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          return !communityKeys.has(key);
        });
        communityDupeCount = before - filtered.length;
        if (communityDupeCount > 0) {
          console.log(`[Sync] Dropped ${communityDupeCount} scraped events that duplicate community submissions`);
          validEvents.splice(0, validEvents.length, ...filtered);
        }
      }
    }
  } catch (err) {
    console.warn('[Sync] Community-dedup check failed (non-fatal):', err.message);
  }

  // ── Smart upsert: protect manually-edited events from scraper overwrites ──
  // Load external_ids of manually-edited events so we can skip overwriting their fields
  const allExtIds = validEvents.map(ev => ev.external_id).filter(Boolean);
  let protectedIds = new Set();
  try {
    // Batch query in chunks to avoid URL length limits
    for (let i = 0; i < allExtIds.length; i += 200) {
      const chunk = allExtIds.slice(i, i + 200);
      const { data: locked } = await supabase
        .from('events')
        .select('external_id')
        .in('external_id', chunk)
        .or('is_human_edited.eq.true,is_locked.eq.true');
      for (const row of (locked || [])) protectedIds.add(row.external_id);
    }
  } catch { /* proceed without protection if query fails */ }

  // ── Event-template matchmaker: attach template_id pre-upsert ─────────────
  // One-shot fetch of all event_templates; matchTemplate is pure so we only
  // need name + aliases + venue_id + id. Staying well under the 5k row cap
  // keeps this comfortable even as the template library grows.
  let templates = [];
  try {
    // Pull template fields used for inheritance (the "Master Time" + category +
    // image/bio). Schema column for the master time is `start_time` (TIME); the
    // user-facing spec calls it "master_time" but we keep DB names here.
    const { data: tplRows } = await supabase
      .from('event_templates')
      .select('id, template_name, aliases, venue_id, start_time, category, image_url, bio, genres')
      .limit(5000);
    templates = tplRows || [];
  } catch { /* no templates → matcher returns null for every event, harmless */ }

  // Preserve admin cherry-picks: any event row that already has a non-null
  // template_id in the DB was either manually linked via the Event Feed's
  // "Suggest: X" action or claimed during Discovery. We MUST NOT clobber it
  // with a fresh automated match, even if the matcher would agree.
  const alreadyLinkedExtIds = new Set();
  if (templates.length > 0 && allExtIds.length > 0) {
    try {
      for (let i = 0; i < allExtIds.length; i += 200) {
        const chunk = allExtIds.slice(i, i + 200);
        const { data: linked } = await supabase
          .from('events')
          .select('external_id')
          .in('external_id', chunk)
          .not('template_id', 'is', null);
        for (const row of (linked || [])) alreadyLinkedExtIds.add(row.external_id);
      }
    } catch { /* if lookup fails, we fall through and may re-link — non-fatal */ }
  }

  // Attach template_id to any validEvent whose (title, venue_id) resolves to
  // a known template. mapEvent stored the cleaned title in `artist_name` and
  // the resolved venue uuid in `venue_id`; that's exactly what matchTemplate
  // needs. We skip events whose row already has a template_id so admin
  // cherry-picks stay pinned.
  let templatesLinked = 0;
  let templatesInherited = 0;

  // Helper: replace the time portion of an ISO timestamp with the template's
  // start_time (TIME column → "HH:MM:SS" or "HH:MM"). Anchored to America/
  // New_York so the wall-clock time the admin set on the template is what
  // shows up in the event row, regardless of DST.
  const stampMasterTime = (eventDateIso, masterTime) => {
    if (!eventDateIso || !masterTime) return null;
    try {
      // Parse master time → "HH:MM" (drop seconds if present)
      const [hh, mm] = String(masterTime).split(':');
      if (!hh || !mm) return null;
      const datePart = new Date(eventDateIso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const probe = new Date(`${datePart}T12:00:00`);
      const isEDT = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT');
      const offset = isEDT ? '-04:00' : '-05:00';
      return new Date(`${datePart}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00${offset}`).toISOString();
    } catch {
      return null;
    }
  };

  if (templates.length > 0) {
    for (const ev of validEvents) {
      // Resolve which template (if any) this event matches. We do this once
      // and reuse the result for both the link-write and the inheritance pass.
      let matchedTemplate = null;
      if (alreadyLinkedExtIds.has(ev.external_id)) {
        // Already pinned by admin — keep the existing template_id but still
        // pull its metadata so master_time / category / image cascade in.
        // We don't have the existing template_id on `ev` here (this is the
        // scrape payload, not the DB row), so the fresh match acts as a
        // best-effort proxy. If admin pinned a different template, the
        // pinned one wins after upsert because we never overwrite template_id
        // for already-linked rows below.
        matchedTemplate = matchTemplate(
          { title: ev.artist_name, venue_id: ev.venue_id },
          templates
        )?.template || null;
      } else {
        const result = matchTemplate(
          { title: ev.artist_name, venue_id: ev.venue_id },
          templates
        );
        if (result && result.template && result.template.id) {
          ev.template_id = result.template.id;
          matchedTemplate = result.template;
          templatesLinked++;
        }
      }

      // ── Template field inheritance ─────────────────────────────────────
      // Spec: when an event matches a template, the template's master_time +
      // category + image + bio overwrite the scraper data so the row is
      // consistent at rest (no more 12:00 AM defaults bleeding through).
      // We respect protectedIds (existing human_edited / locked rows) — never
      // clobber an admin's manual edit.
      if (matchedTemplate && !protectedIds.has(ev.external_id)) {
        let inherited = false;

        if (matchedTemplate.start_time) {
          const stamped = stampMasterTime(ev.event_date, matchedTemplate.start_time);
          if (stamped) { ev.event_date = stamped; inherited = true; }
        }
        if (matchedTemplate.category) {
          ev.category = matchedTemplate.category;
          // Templates take precedence in the Confidence Cascade — lock the
          // category source so AI categorize never re-decides this row.
          ev.category_source = 'template';
          ev.is_category_verified = true;
          ev.triage_status = 'reviewed';
          inherited = true;
        }
        if (matchedTemplate.image_url && !ev.event_image_url) {
          ev.event_image_url = matchedTemplate.image_url;
          inherited = true;
        }
        if (matchedTemplate.bio && !ev.artist_bio) {
          ev.artist_bio = matchedTemplate.bio;
          inherited = true;
        }
        if (inherited) templatesInherited++;
      }
    }
  }

  // Default is_category_verified=false on every row before upsert. The column
  // is NOT NULL in Postgres (added with the Confidence Cascade work). Template
  // matches above already flipped this to true at line 742 when appropriate;
  // everything else is an unverified row awaiting AI categorize or human review,
  // which is the semantic meaning of false. Without this default the field is
  // `undefined` on the object, Supabase writes it as NULL, and the row gets
  // rejected with "null value in column is_category_verified ... violates
  // not-null constraint" — silently dropping ~50/1460 events per sync.
  for (const ev of validEvents) {
    if (ev.is_category_verified === undefined || ev.is_category_verified === null) {
      ev.is_category_verified = false;
    }
  }

  // Split events: unprotected get full upsert, protected only get safe fields updated
  const unprotectedEvents = validEvents.filter(ev => !protectedIds.has(ev.external_id));
  const protectedEvents = validEvents.filter(ev => protectedIds.has(ev.external_id));

  const BATCH_SIZE = 50;
  let totalUpserted = 0;
  const upsertErrors = [];

  // Full upsert for non-protected events
  // Strip internal _scraper_* fields before sending to Supabase
  for (let i = 0; i < unprotectedEvents.length; i += BATCH_SIZE) {
    const batch = unprotectedEvents.slice(i, i + BATCH_SIZE).map(({ _scraper_bio, _scraper_image, ...rest }) => rest);
    const { error } = await supabase
      .from('events')
      .upsert(batch, {
        onConflict: 'external_id',
        ignoreDuplicates: false,
      });

    if (error) {
      upsertErrors.push(error.message);
    } else {
      totalUpserted += batch.length;
    }
  }

  // Safe update for protected events — only refresh ticket_link, cover, source (never overwrite time, title, image)
  for (const ev of protectedEvents) {
    try {
      const safeUpdate = {};
      if (ev.ticket_link) safeUpdate.ticket_link = ev.ticket_link;
      if (ev.cover) safeUpdate.cover = ev.cover;
      if (ev.source) safeUpdate.source = ev.source;
      safeUpdate.verified_at = new Date().toISOString();
      if (Object.keys(safeUpdate).length > 1) {
        await supabase.from('events').update(safeUpdate).eq('external_id', ev.external_id);
      }
      totalUpserted++;
    } catch { /* skip on error */ }
  }

  // ── Write scraper health to database ──────────────────────────────────────
  // Must run AFTER the upsert loops because the global summary row reads
  // `totalUpserted` and `upsertErrors`. Per-scraper rows are filtered to the
  // scrapers that actually ran in this shard/tier — skipped scrapers keep their
  // previous health row untouched (preserving their last successful sync
  // timestamp from the run that actually exercised them).
  try {
    const healthRows = Object.entries(scraperResults)
      .filter(([key]) => shouldRunScraper(key))
      .map(([key, result]) => {
        const reg = VENUE_REGISTRY[key] || { venue: key, url: '', source: 'Unknown' };
        return {
          scraper_key: key,
          venue_name: reg.venue,
          website_url: reg.url || null,
          platform: reg.source || 'Unknown',
          events_found: result.count || 0,
          last_sync_count: result.count || 0,
          status: result.error ? 'fail' : (result.count === 0 ? 'warning' : 'success'),
          error_message: result.error || null,
          last_sync: new Date().toISOString(),
        };
      });

    // Global summary row — each shard and the slow tier write to distinct
    // scraper_key values so the admin "last sync" timestamps don't clobber each
    // other across shards. `_global_sync` is preserved for the legacy
    // full-fast-tier invocation (?tier=fast or no param) used by manual runs.
    const ranScraperResults = Object.fromEntries(
      Object.entries(scraperResults).filter(([key]) => shouldRunScraper(key))
    );
    const failedScrapers = Object.values(ranScraperResults).filter(r => r.error).length;
    let globalKey;
    let globalLabel;
    if (shardParam === '1') {
      globalKey = '_global_sync_shard_1';
      globalLabel = 'All Venues (Shard 1 — Daily)';
    } else if (shardParam === '2') {
      globalKey = '_global_sync_shard_2';
      globalLabel = 'All Venues (Shard 2 — Daily)';
    } else if (tier === 'slow') {
      globalKey = '_global_sync_slow';
      globalLabel = 'All Venues (Slow Tier — Weekly)';
    } else {
      globalKey = '_global_sync';
      globalLabel = 'All Venues (Sync Summary)';
    }
    healthRows.push({
      scraper_key: globalKey,
      venue_name: globalLabel,
      website_url: null,
      platform: 'System',
      events_found: totalUpserted,
      last_sync_count: totalUpserted,
      status: upsertErrors.length ? 'fail' : 'success',
      error_message: upsertErrors.length
        ? `${upsertErrors.length} upsert batch error(s); ${failedScrapers} scraper(s) errored`
        : null,
      last_sync: new Date().toISOString(),
    });

    await supabase.from('scraper_health').upsert(healthRows, { onConflict: 'scraper_key' });
  } catch (healthErr) {
    console.error('Failed to write scraper health:', healthErr);
  }

  // --- Phase 1: Auto-Sorter Pipeline — categorize events before triage --------
  let autoSortResult = { matched: 0, keywordRouted: 0, unknowns: 0 };
  try {
    // Fetch all events needing triage (pending or null)
    const { data: pendingEvents } = await supabase
      .from('events')
      .select('id, artist_name, artist_bio, category, triage_status')
      .or('triage_status.is.null,triage_status.eq.pending')
      .gte('event_date', new Date().toISOString())
      .limit(500);

    if (pendingEvents?.length) {
      // Load all known artist names for fast-track matching
      const { data: knownArtists } = await supabase
        .from('artists')
        .select('name')
        .not('name', 'is', null)
        .limit(5000);
      const artistNamesSet = new Set((knownArtists || []).map(a => a.name.toLowerCase().trim()));

      // Keyword routing rules
      const KEYWORD_ROUTES = [
        { category: 'Trivia', terms: ['trivia', 'bingo', 'feud', 'game night', 'quiz'] },
        { category: 'Food & Drink Special', terms: ['pint night', 'taco', 'wings', 'miller lite', 'happy hour', 'drink special', 'food special', 'ladies night', 'pitcher', 'burger night'] },
        { category: 'Sports / Watch Party', terms: ['ufc', 'nfl', 'football', 'watch party', 'nba', 'mlb', 'march madness', 'super bowl', 'fight night'] },
        { category: 'Other / Special Event', terms: ['comedy', 'fundraiser', 'market', 'brunch', 'yoga', 'craft fair', 'paint night', 'drag', 'comedy night', 'open house'] },
      ];

      for (const ev of pendingEvents) {
        const title = (ev.artist_name || '').toLowerCase().trim();
        const desc = (ev.artist_bio || '').toLowerCase();
        const combined = `${title} ${desc}`;
        let category = null;
        let triageStatus = 'pending';

        // Step 1: Known artist fast-track
        if (title && artistNamesSet.has(title)) {
          category = 'Live Music';
          triageStatus = 'reviewed';
          autoSortResult.matched++;
        }

        // Step 2: Keyword routing (only if not already matched)
        if (!category) {
          for (const rule of KEYWORD_ROUTES) {
            if (rule.terms.some(term => combined.includes(term))) {
              category = rule.category;
              triageStatus = 'reviewed';
              autoSortResult.keywordRouted++;
              break;
            }
          }
        }

        // Step 3: Still unknown → stays pending for triage
        if (!category) {
          autoSortResult.unknowns++;
          continue; // Leave as pending, don't update
        }

        // Write the auto-sort result
        const sortUpdate = { category, triage_status: triageStatus };
        // For non-music categories, null out artist_id so enrichment doesn't re-create artist rows
        if (category !== 'Live Music') {
          sortUpdate.artist_id = null;
        }
        await supabase
          .from('events')
          .update(sortUpdate)
          .eq('id', ev.id);
      }
    }
  } catch (sortErr) {
    console.error('Auto-sorter error:', sortErr);
  }

  // --- Price Extractor — extract BASE price from event descriptions -------------
  // Rules: base face-value only (ignore taxes/fees), use "Cover" for bars, "Tickets" for ticketed
  let priceResult = { extracted: 0, cleaned: 0 };
  try {
    // Pass 1: Extract prices for events with no cover set
    const { data: needsPrice } = await supabase
      .from('events')
      .select('id, artist_name, artist_bio, cover, source, ticket_link')
      .is('cover', null)
      .gte('event_date', new Date().toISOString())
      .eq('status', 'published')
      .limit(200);

    if (needsPrice?.length) {
      for (const ev of needsPrice) {
        const text = `${ev.artist_name || ''} ${ev.artist_bio || ''}`.toLowerCase();
        const isTicketed = !!(ev.ticket_link || (ev.source && /ticketmaster|ticketweb|eventbrite|seetickets|axs\.com/i.test(ev.source)));
        let priceInfo = null;

        if (/\bfree\b|no cover|free admission|free entry/i.test(text)) {
          priceInfo = 'Free';
        } else {
          // Extract all dollar amounts, pick the LOWEST as base price
          const dollarMatches = text.match(/\$(\d+(?:\.\d{2})?)/g);
          if (dollarMatches) {
            const amounts = dollarMatches.map(m => parseFloat(m.replace('$', '')));
            const basePrice = Math.min(...amounts);
            // Round to whole dollar (base prices are almost always whole numbers)
            const rounded = Math.round(basePrice);
            // Format with correct terminology
            if (/cover/i.test(text) || /door/i.test(text)) {
              priceInfo = `$${rounded} Cover`;
            } else if (isTicketed) {
              priceInfo = `From $${rounded}`;
            } else {
              priceInfo = `$${rounded} Cover`;
            }
          }
        }

        if (priceInfo) {
          await supabase.from('events').update({ cover: priceInfo }).eq('id', ev.id);
          priceResult.extracted++;
        }
      }
    }

    // Pass 2: Clean up existing prices that look like checkout totals (decimals from Ticketmaster)
    const { data: decimalPrices } = await supabase
      .from('events')
      .select('id, cover, source, ticket_link')
      .gte('event_date', new Date().toISOString())
      .eq('status', 'published')
      .not('cover', 'is', null)
      .limit(500);

    if (decimalPrices?.length) {
      for (const ev of decimalPrices) {
        const c = ev.cover || '';
        // If it's a raw decimal price like "$28.63" or "$50.93" — it's a checkout total
        if (/^\$\d+\.\d{2}$/.test(c.trim())) {
          const raw = parseFloat(c.replace('$', ''));
          // Estimate base price: Ticketmaster fees are ~25-30%, so base ≈ raw / 1.27
          const estimated = Math.round(raw / 1.27);
          const isTicketed = !!(ev.ticket_link || (ev.source && /ticketmaster|ticketweb|eventbrite/i.test(ev.source)));
          const cleaned = isTicketed ? `From $${estimated}` : `$${estimated} Cover`;
          await supabase.from('events').update({ cover: cleaned }).eq('id', ev.id);
          priceResult.cleaned++;
        }
      }
    }
  } catch (priceErr) {
    console.error('Price extractor error:', priceErr);
  }

  // --- Load artist blacklist (ignored_artists) for scraper memory ---
  let blacklistedNames = new Set();
  try {
    const { data: blacklist } = await supabase.from('ignored_artists').select('name_lower').limit(5000);
    blacklistedNames = new Set((blacklist || []).map(b => b.name_lower));
  } catch { /* table may not exist yet */ }

  // --- Phase 0: Scraper-First Artist Enrichment ─────────────────────────────
  // Before Last.fm, seed the artists table with bios/images from scrapers.
  // Scrapers are the primary source for local artists that Last.fm doesn't know.
  let scraperEnrichResult = { created: 0, updated: 0 };
  try {
    // Collect scraper bio/image data grouped by artist name
    const scraperArtistData = {};
    for (const ev of validEvents) {
      const name = ev.artist_name?.trim();
      if (!name) continue;
      if (blacklistedNames.has(name.toLowerCase())) continue;
      const bio = ev._scraper_bio;
      const image = ev._scraper_image;
      if (!bio && !image) continue;
      const key = name.toLowerCase();
      // Keep the longest bio and first image found across events
      if (!scraperArtistData[key]) {
        scraperArtistData[key] = { name, bio: bio || null, image_url: image || null };
      } else {
        if (bio && (!scraperArtistData[key].bio || bio.length > scraperArtistData[key].bio.length)) {
          scraperArtistData[key].bio = bio;
        }
        if (image && !scraperArtistData[key].image_url) {
          scraperArtistData[key].image_url = image;
        }
      }
    }

    const scraperNames = Object.keys(scraperArtistData);
    if (scraperNames.length > 0) {
      // Load existing artist rows by name
      const nameValues = scraperNames.map(k => scraperArtistData[k].name);
      const { data: existing } = await supabase
        .from('artists')
        .select('id, name, bio, image_url, is_locked')
        .in('name', nameValues.slice(0, 200));

      const existingMap = {};
      for (const a of (existing || [])) existingMap[a.name.toLowerCase()] = a;

      // Also check aliases for any names not found by direct match
      // This prevents creating duplicate artist rows when a scraper sends
      // an old or variant name that was already saved as an alias
      const unmatchedKeys = scraperNames.filter(k => !existingMap[k]);
      if (unmatchedKeys.length > 0) {
        try {
          const { data: aliasRows } = await supabase
            .from('artist_aliases')
            .select('artist_id, alias_lower')
            .in('alias_lower', unmatchedKeys.slice(0, 200));

          if (aliasRows?.length) {
            const aliasArtistIds = [...new Set(aliasRows.map(a => a.artist_id))];
            const { data: aliasArtists } = await supabase
              .from('artists')
              .select('id, name, bio, image_url, is_locked')
              .in('id', aliasArtistIds);

            const artistById = {};
            for (const a of (aliasArtists || [])) artistById[a.id] = a;

            for (const row of aliasRows) {
              const master = artistById[row.artist_id];
              if (master && !existingMap[row.alias_lower]) {
                existingMap[row.alias_lower] = master;
              }
            }
          }
        } catch { /* artist_aliases table may not exist yet */ }
      }

      for (const key of scraperNames) {
        const sd = scraperArtistData[key];
        const ex = existingMap[key];

        // Never touch locked artists
        if (ex?.is_locked) continue;

        if (!ex) {
          // Create new artist row from scraper data
          await supabase.from('artists').upsert({
            name: sd.name,
            bio: sd.bio,
            image_url: sd.image_url,
            last_fetched: new Date().toISOString(),
            metadata_source: 'scraper',
            image_source: sd.image_url ? 'Scraped' : 'Unknown',
            bio_source: sd.bio ? 'Scraped' : 'Unknown',
          }, { onConflict: 'name' });
          scraperEnrichResult.created++;
        } else {
          // Update only empty fields (don't overwrite existing bios/images)
          const update = {};
          if (!ex.bio && sd.bio) { update.bio = sd.bio; update.bio_source = 'Scraped'; }
          if (!ex.image_url && sd.image_url) { update.image_url = sd.image_url; update.image_source = 'Scraped'; }
          if (Object.keys(update).length > 0) {
            await supabase.from('artists').update(update).eq('id', ex.id);
            scraperEnrichResult.updated++;
          }
        }
      }
    }
  } catch (scraperEnrichErr) {
    console.error('Scraper artist enrichment error:', scraperEnrichErr);
  }

  // --- Auto-enrich new artists via Last.fm + link events → artists via artist_id ---
  // Gated by skipEnrich so the cron run can fit under the 60s Hobby cap.
  // When skipped, the struct below stays at zeros and a separate backfill
  // cron (/api/enrich-backfill) picks up the unenriched rows out-of-band.
  let enrichResult = { artistsLookedUp: 0, eventsEnriched: 0, eventsLinked: 0, blacklisted: 0, humanSkipped: 0, defaultCategoryApplied: 0, errors: [], skipped: skipEnrich };
  if (!skipEnrich) try {
    // Fetch all future published LIVE MUSIC events for enrichment + artist linking
    // Only enrich events categorized as Live Music (or uncategorized) — skip drink specials, trivia, etc.
    // Order by event_date ASC so artists playing soonest get enriched first.
    // With the 30-per-run cap, this ensures tonight's acts have bios/images
    // before someone playing 3 weeks from now.
    const { data: unenriched } = await supabase
      .from('events')
      .select('id, artist_name, image_url, artist_bio, artist_id, is_human_edited, is_locked, category, template_id, is_category_verified, category_source')
      .eq('status', 'published')
      .not('artist_name', 'is', null)
      .gte('event_date', new Date().toISOString())
      .or('category.is.null,category.eq.Live Music')
      .order('event_date', { ascending: true })
      .limit(500);

    if (unenriched?.length) {
      // Golden Rule: skip human-edited or locked events — never overwrite admin changes
      const enrichable = unenriched.filter(e => {
        if (e.is_human_edited || e.is_locked) { enrichResult.humanSkipped++; return false; }
        return true;
      });

      const uniqueNames = [...new Set(enrichable.map(e => e.artist_name.trim()))];

      // Blacklist filter: skip names that were deleted by admin
      const cleanNames = uniqueNames.filter(n => {
        if (blacklistedNames.has(n.toLowerCase().trim())) {
          enrichResult.blacklisted++;
          return false;
        }
        return true;
      });

      // Check which are already cached
      const { data: cached } = await supabase
        .from('artists')
        .select('id, name, image_url, bio, default_category')
        .in('name', cleanNames.slice(0, 200));

      const cachedMap = {};
      for (const a of (cached || [])) cachedMap[a.name.toLowerCase()] = a;

      // Look up uncached artists (max 50 per sync — raised from 30 for launch readiness)
      // Uses the Universal Enrichment Hook: MusicBrainz → Discogs → Last.fm
      const uncached = cleanNames.filter(n => !cachedMap[n.toLowerCase()]).slice(0, 50);
      for (const name of uncached) {
        try {
          await enrichArtist(name, supabase, { blacklist: blacklistedNames });
          enrichResult.artistsLookedUp++;
        } catch (err) {
          enrichResult.errors.push(`${name}: ${err.message}`);
        }
      }

      // Reload cache (with id for FK linking) and update events
      const { data: freshCached } = await supabase
        .from('artists')
        .select('id, name, image_url, bio, default_category')
        .in('name', cleanNames.slice(0, 200));

      const freshMap = {};
      for (const a of (freshCached || [])) freshMap[a.name.toLowerCase()] = a;

      // Also load aliases so renamed artists still get linked to events
      try {
        const unmatchedNames = cleanNames.filter(n => !freshMap[n.toLowerCase()]);
        if (unmatchedNames.length > 0) {
          const lowerNames = unmatchedNames.map(n => n.toLowerCase().trim());
          const { data: aliasRows } = await supabase
            .from('artist_aliases')
            .select('artist_id, alias_lower')
            .in('alias_lower', lowerNames.slice(0, 200));

          if (aliasRows?.length) {
            const aliasArtistIds = [...new Set(aliasRows.map(a => a.artist_id))];
            const { data: aliasArtists } = await supabase
              .from('artists')
              .select('id, name, image_url, bio, default_category')
              .in('id', aliasArtistIds);

            const artistById = {};
            for (const a of (aliasArtists || [])) artistById[a.id] = a;

            for (const row of aliasRows) {
              const master = artistById[row.artist_id];
              if (master && !freshMap[row.alias_lower]) {
                freshMap[row.alias_lower] = master;
              }
            }
          }
        }
      } catch { /* artist_aliases table may not exist yet */ }

      // ── Pass 1: Artist-ID linking (ALL events, including locked/human-edited) ──
      // Linking artist_id is non-destructive (only sets a null FK) and is the
      // foundation for the image/bio waterfall. Skipping locked rows here was
      // the root cause of OCR-scraped events (Captain's Inn, Palmetto, etc.)
      // never getting their artist image — the admin's category edit set
      // is_human_edited=true, which blocked the entire enrichment loop.
      const allUnlinked = unenriched.filter(e => !e.artist_id && !blacklistedNames.has(e.artist_name.trim().toLowerCase()));
      for (const ev of allUnlinked) {
        const evNameLower = ev.artist_name.trim().toLowerCase();
        const artistData = freshMap[evNameLower];
        if (!artistData?.id) continue;
        const { error: linkErr } = await supabase.from('events').update({ artist_id: artistData.id }).eq('id', ev.id);
        if (!linkErr) enrichResult.eventsLinked++;
      }

      // ── Pass 2: Bio/image enrichment + category cascade (unlocked only) ──
      // These writes can overwrite existing data, so they respect the
      // human-edited/locked guard.
      for (const ev of enrichable) {
        const evNameLower = ev.artist_name.trim().toLowerCase();
        // Skip blacklisted artists in the enrichment step too
        if (blacklistedNames.has(evNameLower)) continue;
        const artistData = freshMap[evNameLower];
        if (!artistData) continue;
        const update = {};
        if (!ev.image_url && artistData.image_url) update.image_url = artistData.image_url;
        // Only overwrite bio if event has NO bio or a short scraper stub (<100 chars).
        // Protects good bios (from Perplexity AI or curated) from being clobbered.
        const existingBioLen = (ev.artist_bio || '').length;
        if (artistData.bio && (existingBioLen === 0 || existingBioLen < 100)) {
          update.artist_bio = artistData.bio;
        }

        // ── Confidence Cascade Tier 1: Default-Category Bypass ───────────
        // If the matched artist has an admin-set default_category, stamp it
        // on the event and lock it (is_category_verified=true, category_source
        // 'artist_default'). This is the deterministic shortcut that lets the
        // system "remember" decisions admins already made — no AI call, no
        // triage queue.
        //
        // Chain of Command (highest precedence first):
        //   1. Templates (template_id set)        → never override
        //   2. Human edits (is_human_edited)      → never override
        //   3. Already verified (is_cat_verified) → never override
        //   4. Manually locked row (is_locked)    → never override
        //   5. Artist default_category            → APPLY HERE
        //   6. Keyword router / AI categorize     → fallback (next stage)
        if (
          artistData.default_category &&
          !ev.template_id &&
          !ev.is_human_edited &&
          !ev.is_locked &&
          !ev.is_category_verified &&
          ev.category_source !== 'artist_default'
        ) {
          update.category = artistData.default_category;
          update.is_category_verified = true;
          update.category_source = 'artist_default';
          update.category_ai_flagged_at = null;
          update.triage_status = 'reviewed';
        }

        if (Object.keys(update).length === 0) continue;
        const { error: upErr } = await supabase.from('events').update(update).eq('id', ev.id);
        if (!upErr) {
          if (update.image_url || update.artist_bio) enrichResult.eventsEnriched++;
          if (update.category_source === 'artist_default') enrichResult.defaultCategoryApplied++;
        }
      }
    }
  } catch (enrichErr) {
    enrichResult.errors.push(`Enrichment failed: ${enrichErr.message}`);
  }

  // --- Step 4: AI Categorization Fallback (Confidence Cascade tail) ──────
  // Runs AFTER the keyword Auto-Sorter (Step 1–3 above) and the enrichment
  // pass (which applies artist_default_category). Any event still in
  // triage_status='pending' at this point is a true unknown — neither its
  // title nor its linked artist told us what category to use. Hand it to
  // Perplexity with the confidence bar set at 0.85:
  //   • ≥0.85 + whitelisted category  → write category, mark reviewed
  //   • <0.85 or off-list category    → flag for Manual Review, stay pending
  //   • LLM transport/parse failure   → leave row untouched (next sync retries)
  //
  // Scope: created_at >= syncStartedAt so we only classify rows inserted
  // by this run. Legacy triage rows stay admin-visible; the admin can still
  // trigger /api/admin/auto-categorize manually for those.
  //
  // Cost cap: 50 events/run × ~$0.005/call ≈ $0.25/sync. With ~2 syncs/day
  // that's <$0.50/day worst case. Kill switch: set
  // SYNC_AI_CATEGORIZE_ENABLED=false to disable the whole block without a
  // deploy.
  let aiCategorizeResult = {
    attempted: 0,
    updated: 0,
    flagged: 0,
    skipped_artist_default: 0,
    failed: 0,
    context_injected: 0,
    enabled: true,
  };
  const aiEnabled = (process.env.SYNC_AI_CATEGORIZE_ENABLED || 'true').toLowerCase() !== 'false';
  aiCategorizeResult.enabled = aiEnabled;
  aiCategorizeResult.skipped = skipEnrich;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!skipEnrich && aiEnabled && perplexityKey) {
    try {
      // Pull still-pending events created by this sync that haven't been
      // locked by templates / admin verification / artist default.
      const { data: pending } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, event_date, description, custom_description, category, template_id, is_category_verified, category_source, artist_id')
        .eq('triage_status', 'pending')
        .is('template_id', null)
        .eq('is_category_verified', false)
        .neq('category_source', 'artist_default')
        .gte('created_at', syncStartedAt)
        .gte('event_date', new Date().toISOString())
        .limit(50);

      if (pending?.length) {
        // Tier 2 Confidence Cascade: batch-load bio/genres for every linked
        // artist so we can inject context into the prompt without per-event
        // round-trips. Mirrors /api/admin/auto-categorize.
        const artistIds = [...new Set(pending.map(e => e.artist_id).filter(Boolean))];
        const artistContextMap = {};
        if (artistIds.length > 0) {
          const { data: artistRows } = await supabase
            .from('artists')
            .select('id, bio, genres, default_category')
            .in('id', artistIds);
          for (const a of (artistRows || [])) artistContextMap[a.id] = a;
        }

        for (const ev of pending) {
          // Defense-in-depth: if enrichment just set default_category on the
          // artist but didn't get to write it back to this event, let the
          // next sync handle it rather than burning an LLM call.
          const linkedArtist = ev.artist_id ? artistContextMap[ev.artist_id] : null;
          if (linkedArtist?.default_category) {
            aiCategorizeResult.skipped_artist_default++;
            continue;
          }

          aiCategorizeResult.attempted++;
          const artistContext = linkedArtist && (linkedArtist.bio || (Array.isArray(linkedArtist.genres) && linkedArtist.genres.length > 0))
            ? { bio: linkedArtist.bio, genres: linkedArtist.genres }
            : null;
          if (artistContext) aiCategorizeResult.context_injected++;

          const ai = await classifyEvent(ev, perplexityKey, artistContext);
          if (!ai) { aiCategorizeResult.failed++; continue; }

          const category = ALLOWED_CATEGORIES.includes(ai.category) ? ai.category : null;
          const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));

          if (!category || confidence < CONFIDENCE_THRESHOLD) {
            // Below the bar — flag for manual review. Don't overwrite the
            // category field; the admin sees the suggested value via
            // category_ai_flagged_at + category_confidence in the triage UI.
            const { error: flagErr } = await supabase
              .from('events')
              .update({
                category_source: 'manual_review',
                category_confidence: confidence,
                category_ai_flagged_at: new Date().toISOString(),
                triage_status: 'pending',
              })
              .eq('id', ev.id);
            if (flagErr) aiCategorizeResult.failed++;
            else aiCategorizeResult.flagged++;
          } else {
            // Happy path: high-confidence + whitelisted → write it. Never
            // sets is_category_verified=true; only humans verify.
            const { error: updErr } = await supabase
              .from('events')
              .update({
                category,
                category_source: 'ai',
                category_confidence: confidence,
                category_ai_flagged_at: null,
                triage_status: 'reviewed',
              })
              .eq('id', ev.id);
            if (updErr) aiCategorizeResult.failed++;
            else aiCategorizeResult.updated++;
          }

          // Gentle rate limit — matches /api/admin/auto-categorize.
          await new Promise(r => setTimeout(r, 200));
        }
      }
    } catch (aiErr) {
      console.error('[Sync AI Categorize] Error:', aiErr.message);
    }
  }

  // --- Trigger B: Notify followers about newly added events ---
  let notifyResult = { newEvents: 0, notified: false };
  try {
    // Find events created in the last 10 minutes (covers this sync window)
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: brandNew } = await supabase
      .from('events')
      .select('id')
      .gte('created_at', tenMinsAgo)
      .eq('status', 'published')
      .not('artist_name', 'is', null);

    const newIds = (brandNew || []).map(e => e.id);
    notifyResult.newEvents = newIds.length;

    if (newIds.length > 0 && newIds.length < 200) {
      // Fire-and-forget internal call to /api/notify
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      fetch(`${baseUrl}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SYNC_SECRET || ''}`,
        },
        body: JSON.stringify({ trigger: 'new_show', newEventIds: newIds }),
      }).catch(err => console.error('[Trigger B] Fire-and-forget failed:', err.message));
      notifyResult.notified = true;
    }
  } catch (notifyErr) {
    console.error('[Trigger B] Error:', notifyErr.message);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    duration,
    totalScraped: validEvents.length,
    totalUpserted,
    scrapers: scraperResults,
    autoSort: {
      knownArtistMatches: autoSortResult.matched,
      keywordRouted: autoSortResult.keywordRouted,
      unknownsForTriage: autoSortResult.unknowns,
    },
    priceExtractor: {
      pricesExtracted: priceResult.extracted,
      decimalsCleaned: priceResult.cleaned,
    },
    scraperArtistEnrich: {
      created: scraperEnrichResult.created,
      updated: scraperEnrichResult.updated,
    },
    templateMatcher: {
      templatesLoaded: templates.length,
      eventsLinked: templatesLinked,
      eventsInherited: templatesInherited,
      adminLinksPreserved: alreadyLinkedExtIds.size,
    },
    enrichment: {
      artistsLookedUp: enrichResult.artistsLookedUp,
      eventsEnriched: enrichResult.eventsEnriched,
      eventsLinked: enrichResult.eventsLinked,
      defaultCategoryApplied: enrichResult.defaultCategoryApplied,
      blacklistedSkipped: enrichResult.blacklisted,
      humanEditedSkipped: enrichResult.humanSkipped,
      errors: enrichResult.errors.length ? enrichResult.errors : null,
    },
    aiCategorize: {
      enabled: aiCategorizeResult.enabled,
      attempted: aiCategorizeResult.attempted,
      updated: aiCategorizeResult.updated,
      flagged: aiCategorizeResult.flagged,
      skippedArtistDefault: aiCategorizeResult.skipped_artist_default,
      contextInjected: aiCategorizeResult.context_injected,
      failed: aiCategorizeResult.failed,
    },
    notifications: notifyResult,
    errors: upsertErrors.length ? upsertErrors : null,
  });
}

// Allow Vercel cron (which sends GET) to trigger sync
export async function GET(request) {
  return POST(request);
}