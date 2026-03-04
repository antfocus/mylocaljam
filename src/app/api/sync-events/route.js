import { createClient } from '@supabase/supabase-js';
import { scrapePigAndParrot } from '@/lib/scrapers/pigAndParrot';
import { scrapeTicketmaster } from '@/lib/scrapers/ticketmaster';
import { scrapeBarAnticipation } from '@/lib/scrapers/barAnticipation';
import { scrapeStonePony } from '@/lib/scrapers/stonePony';
import { scrapeReefAndBarrel, scrapeBoatyard401 } from '@/lib/scrapers/reefAndBoatyard';

function mapToDbSchema(ev) {
  let event_date = null;
  if (ev.date) {
    if (ev.time) {
      const m = ev.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (m) {
        let h = parseInt(m[1]);
        const min = m[2];
        const ampm = m[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
      event_date = `${ev.date}T${String(h).padStart(2,'0')}:${min}:00-05:00`;
      } else {
        event_date = ev.date;
      }
    } else {
      event_date = ev.date;
    }
  }

  return {
    artist_name: ev.title || null,
    venue_name: ev.venue || null,
    event_date,
    artist_bio: ev.description || null,
    ticket_link: ev.ticket_url || null,
    cover: ev.price || null,
    source: ev.source_url || null,
    external_id: ev.external_id,
   status: 'published',
  };
}

export async function POST(request) {
  const authHeader = request.headers.get('Authorization');
  const syncSecret = process.env.SYNC_SECRET;

  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {};
  const totalErrors = [];

  const scrapers = [
    { name: 'PigAndParrot',    fn: scrapePigAndParrot },
    { name: 'Ticketmaster',    fn: scrapeTicketmaster },
    { name: 'BarAnticipation', fn: scrapeBarAnticipation },
    { name: 'StonePony',       fn: scrapeStonePony },
    { name: 'ReefAndBarrel',   fn: scrapeReefAndBarrel },
    { name: 'Boatyard401',     fn: scrapeBoatyard401 },
  ];

  const allEvents = [];
  for (const { name, fn } of scrapers) {
    try {
      const { events, error } = await fn();
      results[name] = { count: events.length, error: error || null };
      if (error) totalErrors.push(`${name}: ${error}`);
      allEvents.push(...events);
    } catch (err) {
      results[name] = { count: 0, error: err.message };
      totalErrors.push(`${name}: ${err.message}`);
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let totalUpserted = 0;
  const BATCH_SIZE = 50;
  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE).map(mapToDbSchema);
    const { error: upsertError, count } = await supabase
      .from('events')
      .upsert(batch, { onConflict: 'external_id', count: 'exact' });

    if (upsertError) {
      totalErrors.push(`DB upsert: ${upsertError.message}`);
    } else {
      totalUpserted += count || 0;
    }
  }

  return Response.json({
    ok: true,
    duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    totalScraped: allEvents.length,
    totalUpserted,
    scrapers: results,
    errors: totalErrors.length ? totalErrors : null,
  });
}