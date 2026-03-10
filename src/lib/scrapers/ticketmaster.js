const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

const VENUES = [
  { id: 'KovZpZAdnEtA', name: 'Wonder Bar' },
  { id: 'KovZpZAatk1A', name: 'Stone Pony Summer Stage' },
  { id: 'KovZpZAdt7AA', name: 'The Stone Pony' },
  { id: 'KovZ917AY7B', name: 'ParkStage' },
];

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function scrapeVenue(venue, apiKey) {
  const events = [];
  const url = new URL(TM_BASE);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('venueId', venue.id);
  url.searchParams.set('size', '50');
  url.searchParams.set('sort', 'date,asc');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} for venue ${venue.id}`);

  const json = await res.json();
  const items = json?._embedded?.events || [];

  for (const ev of items) {
    const dateInfo = ev.dates?.start;
    const priceRange = ev.priceRanges?.[0];
    const imageUrl =
      ev.images?.find((img) => img.ratio === '16_9' && img.width > 500)?.url ||
      ev.images?.[0]?.url || null;

    events.push({
      title: ev.name,
      venue: venue.name,
      date: dateInfo?.localDate || null,
      time: formatTime(dateInfo?.localTime),
      end_time: null,
      description: ev.info || ev.pleaseNote || null,
      image_url: imageUrl,
      ticket_url: ev.url || null,
      price: priceRange ? `$${priceRange.min}–$${priceRange.max}` : null,
      source_url: `https://www.ticketmaster.com/search?q=${encodeURIComponent(venue.name)}`,
      external_id: `ticketmaster-${ev.id}`,
      approved: true,
    });
  }
  return events;
}

export async function scrapeTicketmaster() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const allEvents = [];
  const errors = [];

  if (!apiKey) {
    return { events: [], error: 'TICKETMASTER_API_KEY is not set' };
  }

  for (const venue of VENUES) {
    try {
      const venueEvents = await scrapeVenue(venue, apiKey);
      allEvents.push(...venueEvents);
    } catch (err) {
      errors.push(`${venue.name}: ${err.message}`);
    }
  }

  return { events: allEvents, error: errors.length ? errors.join('; ') : null };
}