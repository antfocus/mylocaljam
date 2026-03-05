import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase';
import { scrapePigAndParrot } from '@/lib/scrapers/pigAndParrot';
import { scrapeTicketmaster } from '@/lib/scrapers/ticketmaster';

export const dynamic = 'force-dynamic';

// Optional: protect with a secret so only cron/authorized callers can trigger
function isAuthorized(request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true; // no secret set = open (dev mode)
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

// Map scraper fields → Supabase schema
function mapEvent(ev, venueMap) {
  const venueId = venueMap[ev.venue] || null;

  // Combine date + time into a full ISO timestamp (Eastern)
  let eventDate = null;
  if (ev.date) {
    const dateStr = ev.date.includes('T')
      ? ev.date // already ISO (PigAndParrot sends full ISO)
      : `${ev.date}T${ev.time ? convertTo24h(ev.time) : '00:00'}:00-05:00`;
    eventDate = new Date(dateStr).toISOString();
  }

  return {
    artist_name: ev.title,
    venue_name: ev.venue,
    venue_id: venueId,
    event_date: eventDate,
    artist_bio: ev.description || null,
    ticket_link: ev.ticket_url || null,
    cover: ev.price || null,
    source: ev.source_url || null,
    external_id: ev.external_id,
    image_url: ev.image_url || null,
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
  const [pigAndParrot, ticketmaster] = await Promise.all([
    scrapePigAndParrot(),
    scrapeTicketmaster(),
  ]);

  const scraperResults = {
    PigAndParrot: { count: pigAndParrot.events.length, error: pigAndParrot.error },
    Ticketmaster: { count: ticketmaster.events.length, error: ticketmaster.error },
  };

  // Combine all events
  const allEvents = [
    ...pigAndParrot.events,
    ...ticketmaster.events,
  ].map(ev => mapEvent(ev, venueMap));

  // Filter out events with no external_id or date
  const validEvents = allEvents.filter(ev => ev.external_id && ev.event_date);

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