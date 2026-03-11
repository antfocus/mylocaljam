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


export const dynamic = 'force-dynamic';

// Optional: protect with a secret so only cron/authorized callers can trigger
function isAuthorized(request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // no secret set = open (dev mode)
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
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

// Map scraper fields → Supabase schema
function mapEvent(ev, venueMap) {
  const venueId = venueMap[ev.venue] || null;

  // Combine date + time into a full ISO timestamp (Eastern)
  let eventDate = null;
  if (ev.date) {
    if (ev.date.includes('T')) {
      // Already a full ISO string — use as-is
      eventDate = new Date(ev.date).toISOString();
    } else {
      // Build with correct Eastern offset (EDT or EST) for the event date
      const offset  = easternOffset(ev.date);
      const timeStr = ev.time ? convertTo24h(ev.time) : '00:00';
      eventDate = new Date(`${ev.date}T${timeStr}:00${offset}`).toISOString();
    }
  }

  return {
    artist_name: decodeHtmlEntities(ev.title),
    venue_name: ev.venue,
    venue_id: venueId,
    event_date: eventDate,
    artist_bio: decodeHtmlEntities(ev.description) || null,
    ticket_link: ev.ticket_url || null,
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

  // Load venue map: { "Pig & Parrot Brielle": uuid, ... }
  const { data: venues } = await supabase.from('venues').select('id, name');
  const venueMap = {};
  for (const v of venues || []) {
    venueMap[v.name] = v.id;
  }

  // Run all scrapers in parallel
  const [pigAndParrot, ticketmaster, joesSurfShack, stStephensGreen, mcCanns, beachHaus, martells, barAnticipation, jacksOnTheTracks, marinaGrille, anchorTavern, rBar, brielleHouse, tenthAveBurrito, reefAndBarrel, palmetto, idleHour, asburyLanes, bakesBrewing, riverRock, wildAir, asburyParkBrewery, boatyard401] = await Promise.all([
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
  };

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
  ].map(ev => mapEvent(ev, venueMap));

  // Filter out events with no external_id or date, and deduplicate by external_id
  const seen = new Set();
  const validEvents = allEvents.filter(ev => {
    if (!ev.external_id || !ev.event_date) return false;
    if (seen.has(ev.external_id)) return false;
    seen.add(ev.external_id);
    return true;
  });

  // Batch upsert to Supabase in chunks of 50
  const BATCH_SIZE = 50;
  let totalUpserted = 0;
  const upsertErrors = [];

  for (let i = 0; i < validEvents.length; i += BATCH_SIZE) {
    const batch = validEvents.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('events')
      .upsert(batch, { onConflict: 'external_id' });

    if (error) {
      upsertErrors.push(error.message);
    } else {
      totalUpserted += batch.length;
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2) + 's';

  return NextResponse.json({
    ok: true,
    duration,
    totalScraped: validEvents.length,
    totalUpserted,
    scrapers: scraperResults,
    errors: upsertErrors.length ? upsertErrors : null,
  });
}

// Allow Vercel cron (which sends GET) to trigger sync
export async function GET(request) {
  return POST(request);
}
