import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';

// Import all scrapers
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
import { scrapeTenthAveBurrito } from '@/lib/scrapers/tenthAveBurrito';
import { scrapeReefAndBarrel } from '@/lib/scrapers/reefAndBoatyard';
import { scrapePalmetto } from '@/lib/scrapers/palmetto';
import { scrapeIdleHour } from '@/lib/scrapers/idleHour';
import { scrapeAsburyLanes } from '@/lib/scrapers/asburyLanes';
import { scrapeBakesBrewing } from '@/lib/scrapers/bakesBrewing';
import { scrapeRiverRock } from '@/lib/scrapers/riverRock';
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
import { scrapeAlgonquinArts } from '@/lib/scrapers/algonquinArts';
import { scrapeTimMcLoones } from '@/lib/scrapers/timMcLoones';
import { scrapeMjsRestaurant } from '@/lib/scrapers/mjsRestaurant';
import { scrapePaganosUva } from '@/lib/scrapers/paganosUva';
import { scrapeCaptainsInn } from '@/lib/scrapers/captainsInn';
import { scrapeCharleysOceanGrill } from '@/lib/scrapers/charleysOceanGrill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCRAPER_MAP = {
  PigAndParrot: scrapePigAndParrot,
  Ticketmaster: scrapeTicketmaster,
  JoesSurfShack: scrapeJoesSurfShack,
  StStephensGreen: scrapeStStephensGreen,
  McCanns: scrapeMcCanns,
  BeachHaus: scrapeBeachHaus,
  Martells: scrapeMartells,
  BarAnticipation: scrapeBarAnticipation,
  JacksOnTheTracks: scrapeJacksOnTheTracks,
  MarinaGrille: scrapeMarinaGrille,
  AnchorTavern: scrapeAnchorTavern,
  RBar: scrapeRBar,
  BrielleHouse: scrapeBrielleHouse,
  TenthAveBurrito: scrapeTenthAveBurrito,
  ReefAndBarrel: scrapeReefAndBarrel,
  Palmetto: scrapePalmetto,
  IdleHour: scrapeIdleHour,
  AsburyLanes: scrapeAsburyLanes,
  BakesBrewing: scrapeBakesBrewing,
  RiverRock: scrapeRiverRock,
  WildAir: scrapeWildAir,
  AsburyParkBrewery: scrapeAsburyParkBrewery,
  Boatyard401: scrapeBoatyard401,
  WindwardTavern: scrapeWindwardTavern,
  Jamians: scrapeJamians,
  TheCabin: scrapeTheCabin,
  TheVogel: scrapeTheVogel,
  SunHarbor: scrapeSunHarbor,
  BumRogers: scrapeBumRogers,
  TheColumns: scrapeTheColumns,
  TheRoost: scrapeTheRoost,
  DealLakeBar: scrapeDealLakeBar,
  CrabsClaw: scrapeCrabsClaw,
  WaterStreet: scrapeWaterStreet,
  Crossroads: scrapeCrossroads,
  EventideGrille: scrapeEventideGrille,
  TriumphBrewing: scrapeTriumphBrewing,
  BlackSwan: scrapeBlackSwan,
  AlgonquinArts: scrapeAlgonquinArts,
  TimMcLoones: scrapeTimMcLoones,
  MjsRestaurant: scrapeMjsRestaurant,
  PaganosUva: scrapePaganosUva,
  CaptainsInn: scrapeCaptainsInn,
  CharleysOcean: scrapeCharleysOceanGrill,
};

// Platform metadata for scraper_health (mirrors VENUE_REGISTRY in sync-events/route.js)
const PLATFORM_MAP = {
  PigAndParrot: 'GraphQL', Ticketmaster: 'Ticketmaster API', JoesSurfShack: 'WordPress AJAX',
  StStephensGreen: 'Google Calendar', McCanns: 'Google Calendar', BeachHaus: 'WordPress',
  Martells: 'HTML Scrape', BarAnticipation: 'HTML Scrape', JacksOnTheTracks: 'Google Calendar',
  MarinaGrille: 'Squarespace', AnchorTavern: 'Squarespace', RBar: 'Squarespace',
  BrielleHouse: 'WordPress AJAX', TenthAveBurrito: 'WordPress', ReefAndBarrel: 'Google Calendar',
  Palmetto: 'Image Poster', IdleHour: 'Google Calendar', AsburyLanes: 'HTML Scrape',
  BakesBrewing: 'HTML Scrape (Webflow)', RiverRock: 'WordPress AJAX', WildAir: 'Squarespace',
  AsburyParkBrewery: 'Squarespace', Boatyard401: 'WordPress AJAX', WindwardTavern: 'Google Calendar',
  Jamians: 'Squarespace', TheCabin: 'Squarespace', TheVogel: 'HTML Scrape',
  SunHarbor: 'Squarespace', BumRogers: 'BentoBox/Wix', TheColumns: 'WordPress',
  TheRoost: 'HTML Scrape', DealLakeBar: 'Squarespace', CrabsClaw: 'RestaurantPassion',
  WaterStreet: 'Squarespace', Crossroads: 'Eventbrite API', EventideGrille: 'Vision OCR (Gemini)',
  TriumphBrewing: 'WordPress HTML', BlackSwan: 'Squarespace',
  AlgonquinArts: 'PHP HTML (proxy)', TimMcLoones: 'Ticketbud HTML (proxy)',
  MjsRestaurant: 'Vision OCR (Gemini)', PaganosUva: 'Vision OCR (Gemini)',
  CaptainsInn: 'Vision OCR (Gemini)', CharleysOcean: 'Vision OCR (Gemini)',
};

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Reuse the same time helpers from sync-events
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

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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
    const period = matchRange[3].toUpperCase();
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

function extractTimeFromTitle(title) {
  if (!title) return null;
  const rangeMatch = title.match(/\b(\d{1,2}):?(\d{2})\s*[-–]\s*(\d{1,2}):?(\d{2})\b/);
  if (rangeMatch) {
    let hr = parseInt(rangeMatch[1]);
    const mn = rangeMatch[2] || '00';
    if (hr >= 1 && hr <= 12) {
      if (hr < 12 && hr >= 1) hr += 12;
      return `${String(hr).padStart(2, '0')}:${mn}`;
    }
  }
  const pmMatch = title.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (pmMatch) {
    let hr = parseInt(pmMatch[1]);
    const mn = pmMatch[2] || '00';
    const isPm = pmMatch[3].toLowerCase() === 'pm';
    if (isPm && hr !== 12) hr += 12;
    if (!isPm && hr === 12) hr = 0;
    return `${String(hr).padStart(2, '0')}:${mn}`;
  }
  return null;
}

function stripTimeFromTitle(title) {
  if (!title) return title;
  return title
    .replace(/\s*\b\d{1,2}:?\d{2}\s*[-–]\s*\d{1,2}:?\d{2}\b\s*/g, ' ')
    .replace(/\s*\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function mapEvent(ev, venueMap, defaultTimes) {
  const venueId = venueMap[ev.venue] || null;
  let scrapedTime = ev.time;
  let cleanTitle = ev.title;
  if (!scrapedTime || scrapedTime === '00:00' || scrapedTime === '12:00 AM') {
    const titleTime = extractTimeFromTitle(ev.title);
    if (titleTime) {
      scrapedTime = titleTime;
      cleanTitle = stripTimeFromTitle(ev.title);
    }
  }
  const venueDefaultTime = defaultTimes[ev.venue] || null;
  const hasRealTime = scrapedTime && scrapedTime !== '00:00' && scrapedTime !== '12:00 AM';

  let eventDate = null;
  if (ev.date) {
    if (ev.date.includes('T')) {
      eventDate = new Date(ev.date).toISOString();
    } else {
      const offset = easternOffset(ev.date);
      let timeStr;
      if (hasRealTime) timeStr = convertTo24h(scrapedTime);
      else if (venueDefaultTime) timeStr = convertTo24h(venueDefaultTime);
      else timeStr = '00:00';
      eventDate = new Date(`${ev.date}T${timeStr}:00${offset}`).toISOString();
    }
  }

  return {
    artist_name: decodeHtmlEntities(cleanTitle),
    venue_name: ev.venue,
    venue_id: venueId,
    event_date: eventDate,
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
    image_url: ev.image_url || null,
    external_id: ev.external_id,
    status: 'published',
    verified_at: new Date().toISOString(),
  };
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scraper_key } = await request.json();
  if (!scraper_key || !SCRAPER_MAP[scraper_key]) {
    return NextResponse.json(
      { error: `Unknown scraper_key: ${scraper_key}`, available: Object.keys(SCRAPER_MAP) },
      { status: 400 }
    );
  }

  const start = Date.now();
  const supabase = getAdminClient();

  // Load venue map and default times
  const { data: venues } = await supabase.from('venues').select('id, name, default_start_time');
  const venueMap = {};
  const defaultTimes = {};
  for (const v of venues || []) {
    venueMap[v.name] = v.id;
    if (v.default_start_time) defaultTimes[v.name] = v.default_start_time;
  }

  // Run the single scraper
  const scraperFn = SCRAPER_MAP[scraper_key];
  const result = await scraperFn();

  // Map and validate events
  const allEvents = result.events.map(ev => mapEvent(ev, venueMap, defaultTimes));
  const seen = new Set();
  const validEvents = allEvents.filter(ev => {
    if (!ev.external_id || !ev.event_date) return false;
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });

  // Upsert events (respecting human edits)
  let protectedIds = new Set();
  try {
    const extIds = validEvents.map(ev => ev.external_id).filter(Boolean);
    for (let i = 0; i < extIds.length; i += 200) {
      const chunk = extIds.slice(i, i + 200);
      const { data: locked } = await supabase
        .from('events')
        .select('external_id')
        .in('external_id', chunk)
        // Phase-1 reader flip (Task #60): match either lock column during the
        // transition week. Simplify to `.eq('is_locked', true)` once
        // is_human_edited is dropped.
        .or('is_locked.eq.true,is_human_edited.eq.true');
      for (const row of (locked || [])) protectedIds.add(row.external_id);
    }
  } catch { /* proceed */ }

  const unprotected = validEvents.filter(ev => !protectedIds.has(ev.external_id));
  const protected_ = validEvents.filter(ev => protectedIds.has(ev.external_id));

  let totalUpserted = 0;
  const upsertErrors = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < unprotected.length; i += BATCH_SIZE) {
    const batch = unprotected.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('events').upsert(batch, {
      onConflict: 'external_id',
      ignoreDuplicates: false,
    });
    if (error) upsertErrors.push(error.message);
    else totalUpserted += batch.length;
  }

  for (const ev of protected_) {
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
    } catch { /* skip */ }
  }

  // ── Artist Linking ─────────────────────────────────────────────────────
  // Link newly upserted events to existing artist records by name + aliases.
  // This mirrors the cron sync's linking logic but skips enrichment (the cron
  // handles MusicBrainz/Discogs/Last.fm/Perplexity lookups). Without this,
  // events created via force-sync have artist_id=null and don't show metadata.
  let eventsLinked = 0;
  try {
    // Get the events we just upserted that have no artist_id
    const extIds = validEvents.map(ev => ev.external_id).filter(Boolean);
    const unlinkdEvents = [];
    for (let i = 0; i < extIds.length; i += 200) {
      const chunk = extIds.slice(i, i + 200);
      const { data: rows } = await supabase
        .from('events')
        .select('id, artist_name, artist_id')
        .in('external_id', chunk)
        .is('artist_id', null);
      if (rows?.length) unlinkdEvents.push(...rows);
    }

    if (unlinkdEvents.length > 0) {
      // Collect unique artist names to look up
      const nameSet = new Set();
      for (const ev of unlinkdEvents) {
        const name = (ev.artist_name || '').trim();
        if (name) nameSet.add(name);
      }
      const uniqueNames = [...nameSet];

      // Direct name match against artists table
      const artistMap = {}; // lowercase name → artist record
      for (let i = 0; i < uniqueNames.length; i += 200) {
        const chunk = uniqueNames.slice(i, i + 200);
        const { data: artists } = await supabase
          .from('artists')
          .select('id, name, default_category')
          .in('name', chunk);
        for (const a of (artists || [])) artistMap[a.name.toLowerCase()] = a;
      }

      // Alias lookup for any names that didn't match directly
      const unmatchedNames = uniqueNames.filter(n => !artistMap[n.toLowerCase()]);
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
            .select('id, name, default_category')
            .in('id', aliasArtistIds);

          const artistById = {};
          for (const a of (aliasArtists || [])) artistById[a.id] = a;

          for (const row of aliasRows) {
            const master = artistById[row.artist_id];
            if (master && !artistMap[row.alias_lower]) {
              artistMap[row.alias_lower] = master;
            }
          }
        }
      }

      // Link events to matched artists
      for (const ev of unlinkdEvents) {
        const key = (ev.artist_name || '').trim().toLowerCase();
        const artist = artistMap[key];
        if (!artist) continue;

        const update = { artist_id: artist.id };

        // Apply default category if artist has one and event isn't already categorized
        if (artist.default_category) {
          update.category = artist.default_category;
          update.is_category_verified = true;
          update.category_source = 'artist_default';
        }

        const { error: linkErr } = await supabase.from('events').update(update).eq('id', ev.id);
        if (!linkErr) eventsLinked++;
      }
    }
  } catch (linkErr) {
    console.error('[force-sync] Artist linking error:', linkErr.message);
  }

  // Update scraper_health via upsert (works now that getAdminClient disables Next.js Data Cache)
  let healthError = null;
  const newStatus = result.error ? 'fail' : (result.events.length === 0 ? 'warning' : 'success');
  try {
    const { error: healthErr } = await supabase
      .from('scraper_health')
      .upsert({
        scraper_key,
        venue_name: validEvents[0]?.venue_name || scraper_key,
        website_url: result.events[0]?.source_url || null,
        platform: PLATFORM_MAP[scraper_key] || null,
        events_found: result.events.length,
        status: newStatus,
        error_message: result.error || null,
        last_sync: new Date().toISOString(),
      }, { onConflict: 'scraper_key' });
    if (healthErr) healthError = healthErr.message;
  } catch (healthErr) {
    healthError = healthErr.message;
    console.error('Failed to write scraper health:', healthErr);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    scraper_key,
    duration,
    eventsScraped: result.events.length,
    eventsUpserted: totalUpserted,
    eventsLinked,
    error: result.error || null,
    upsertErrors: upsertErrors.length ? upsertErrors : null,
    healthError,
  });
}
