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
import { enrichWithLastfm } from '@/lib/enrichLastfm';


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

// Map scraper fields → Supabase schema
function mapEvent(ev, venueMap, defaultTimes) {
  const venueId = venueMap[ev.venue] || null;

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

  // Fallback to venue default time if still no time found
  const venueDefaultTime = defaultTimes[ev.venue] || null;
  const hasRealTime = scrapedTime && scrapedTime !== '00:00' && scrapedTime !== '12:00 AM';

  // Track whether we actually have a real time or are guessing
  let isTimeTbd = false;

  // Combine date + time into a full ISO timestamp (Eastern)
  let eventDate = null;
  if (ev.date) {
    if (ev.date.includes('T')) {
      eventDate = new Date(ev.date).toISOString();
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
      eventDate = new Date(`${ev.date}T${timeStr}:00${offset}`).toISOString();
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
    image_url: ev.image_url || null,
    external_id: ev.external_id,
    status: 'published',
    verified_at: new Date().toISOString(),
  };
}

// Convert "6:00 PM" → "18:00"
function convertTo24h(timeStr) {
  if (!timeStr) return '00:00';
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '00:00';
  let [, h, m, period] = match;
  h = parseInt(h);
  if (period.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (period.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  // Run all scrapers in parallel
  const [pigAndParrot, ticketmaster, joesSurfShack, stStephensGreen, mcCanns, beachHaus, martells, barAnticipation, jacksOnTheTracks, marinaGrille, anchorTavern, rBar, brielleHouse, tenthAveBurrito, reefAndBarrel, palmetto, idleHour, asburyLanes, bakesBrewing, riverRock, wildAir, asburyParkBrewery, boatyard401, windwardTavern, jamians, theCabin, theVogel, sunHarbor, bumRogers, theColumns, theRoost, dealLakeBar, crabsClaw, waterStreet, crossroads, eventideGrille, triumphBrewing, blackSwan, algonquinArts, timMcLoones, mjsRestaurant, paganosUva, captainsInn, charleysOceanGrill] = await Promise.all([
    scrapePigAndParrot(),
    scrapeTicketmaster(),
    scrapeJoesSurfShack(),
    scrapeStStephensGreen(),
    scrapeMcCanns(),
    scrapeBeachHaus(),
    scrapeMartells(),
    scrapeBarAnticipation(),
    scrapeJacksOnTheTracks(),
    scrapeMarinaGrille(),
    scrapeAnchorTavern(),
    scrapeRBar(),
    scrapeBrielleHouse(),
    scrapeTenthAveBurrito(),
    scrapeReefAndBarrel(),
    scrapePalmetto(),
    scrapeIdleHour(),
    scrapeAsburyLanes(),
    scrapeBakesBrewing(),
    scrapeRiverRock(),
    scrapeWildAir(),
    scrapeAsburyParkBrewery(),
    scrapeBoatyard401(),
    scrapeWindwardTavern(),
    scrapeJamians(),
    scrapeTheCabin(),
    scrapeTheVogel(),
    scrapeSunHarbor(),
    scrapeBumRogers(),
    scrapeTheColumns(),
    scrapeTheRoost(),
    scrapeDealLakeBar(),
    scrapeCrabsClaw(),
    scrapeWaterStreet(),
    scrapeCrossroads(),
    scrapeEventideGrille(),
    scrapeTriumphBrewing(),
    scrapeBlackSwan(),
    // Proxy-routed scrapers (IPRoyal residential proxy)
    scrapeAlgonquinArts(),
    scrapeTimMcLoones(),
    // Vision OCR scrapers (Perplexity Sonar — image flyer extraction)
    scrapeMjsRestaurant(),
    scrapePaganosUva(),
    scrapeCaptainsInn(),
    scrapeCharleysOceanGrill(),
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
    IdleHour: { count: idleHour.events.length, error: idleHour.error },
    AsburyLanes: { count: asburyLanes.events.length, error: asburyLanes.error },
    BakesBrewing: { count: bakesBrewing.events.length, error: bakesBrewing.error },
    RiverRock: { count: riverRock.events.length, error: riverRock.error },
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

  // ── Write scraper health to database ──────────────────────────────────────
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
    TenthAveBurrito: { venue: '10th Ave Burrito', url: 'https://tenthaveburrito.com', source: 'WordPress' },
    ReefAndBarrel: { venue: 'Reef & Barrel', url: 'https://www.reefandbarrel.com', source: 'Google Calendar' },
    Palmetto: { venue: 'Palmetto', url: 'https://www.palmettoasburypark.com', source: 'Image Poster' },
    IdleHour: { venue: 'Idle Hour', url: 'https://www.ihpointpleasant.com', source: 'Google Calendar' },
    AsburyLanes: { venue: 'Asbury Lanes', url: 'https://www.asburylanes.com', source: 'HTML Scrape' },
    BakesBrewing: { venue: 'Bakes Brewing', url: 'https://www.bakesbrewing.co', source: 'Squarespace' },
    RiverRock: { venue: 'River Rock', url: 'https://riverrockbricknj.com', source: 'WordPress AJAX' },
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
    EventideGrille: { venue: 'Eventide Grille', url: 'https://eventidegrille.com', source: 'Image Poster' },
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

  try {
    const healthRows = Object.entries(scraperResults).map(([key, result]) => {
      const reg = VENUE_REGISTRY[key] || { venue: key, url: '', source: 'Unknown' };
      return {
        scraper_key: key,
        venue_name: reg.venue,
        website_url: reg.url || null,
        platform: reg.source || 'Unknown',
        events_found: result.count || 0,
        status: result.error ? 'fail' : (result.count === 0 ? 'warning' : 'success'),
        error_message: result.error || null,
        last_sync: new Date().toISOString(),
      };
    });
    await supabase.from('scraper_health').upsert(healthRows, { onConflict: 'scraper_key' });
  } catch (healthErr) {
    console.error('Failed to write scraper health:', healthErr);
  }

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
    ...idleHour.events,
    ...asburyLanes.events,
    ...bakesBrewing.events,
    ...riverRock.events,
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
          }, { onConflict: 'name' });
          scraperEnrichResult.created++;
        } else {
          // Update only empty fields (don't overwrite existing bios/images)
          const update = {};
          if (!ex.bio && sd.bio) update.bio = sd.bio;
          if (!ex.image_url && sd.image_url) update.image_url = sd.image_url;
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
  let enrichResult = { artistsLookedUp: 0, eventsEnriched: 0, eventsLinked: 0, blacklisted: 0, humanSkipped: 0, errors: [] };
  try {
    // Fetch all future published LIVE MUSIC events for enrichment + artist linking
    // Only enrich events categorized as Live Music (or uncategorized) — skip drink specials, trivia, etc.
    const { data: unenriched } = await supabase
      .from('events')
      .select('id, artist_name, image_url, artist_bio, artist_id, is_human_edited, is_locked, category')
      .eq('status', 'published')
      .not('artist_name', 'is', null)
      .gte('event_date', new Date().toISOString())
      .or('category.is.null,category.eq.Live Music')
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
        .select('id, name, image_url, bio')
        .in('name', cleanNames.slice(0, 200));

      const cachedMap = {};
      for (const a of (cached || [])) cachedMap[a.name.toLowerCase()] = a;

      // Look up uncached artists (max 30 per sync to stay within timeout)
      // Also skip blacklisted from Last.fm lookup
      const uncached = cleanNames.filter(n => !cachedMap[n.toLowerCase()]).slice(0, 30);
      for (const name of uncached) {
        try {
          await enrichWithLastfm(name, supabase, { blacklist: blacklistedNames });
          enrichResult.artistsLookedUp++;
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          enrichResult.errors.push(`${name}: ${err.message}`);
        }
      }

      // Reload cache (with id for FK linking) and update events
      const { data: freshCached } = await supabase
        .from('artists')
        .select('id, name, image_url, bio')
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
              .select('id, name, image_url, bio')
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

      for (const ev of enrichable) {
        const evNameLower = ev.artist_name.trim().toLowerCase();
        // Skip blacklisted artists in the linking step too
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
        // Link event → artist via FK if not already linked
        if (!ev.artist_id && artistData.id) update.artist_id = artistData.id;
        if (Object.keys(update).length === 0) continue;
        const { error: upErr } = await supabase.from('events').update(update).eq('id', ev.id);
        if (!upErr) {
          if (update.image_url || update.artist_bio) enrichResult.eventsEnriched++;
          if (update.artist_id) enrichResult.eventsLinked++;
        }
      }
    }
  } catch (enrichErr) {
    enrichResult.errors.push(`Enrichment failed: ${enrichErr.message}`);
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
    enrichment: {
      artistsLookedUp: enrichResult.artistsLookedUp,
      eventsEnriched: enrichResult.eventsEnriched,
      eventsLinked: enrichResult.eventsLinked,
      blacklistedSkipped: enrichResult.blacklisted,
      humanEditedSkipped: enrichResult.humanSkipped,
      errors: enrichResult.errors.length ? enrichResult.errors : null,
    },
    notifications: notifyResult,
    errors: upsertErrors.length ? upsertErrors : null,
  });
}

// Allow Vercel cron (which sends GET) to trigger sync
export async function GET(request) {
  return POST(request);
}
