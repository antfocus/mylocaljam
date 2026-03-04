// lib/scrapers/barAnticipation.js
// Bar Anticipation (Bar A) — WordPress REST API via The Events Calendar plugin
// No API key needed. Most reliable scraper in the set.

const API_URL = 'https://bar-a.com/wp-json/tribe/events/v1/events';

function stripHtml(html) {
  return html?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || null;
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function scrapeBarAnticipation() {
  const events = [];
  let error = null;

  try {
    const url = new URL(API_URL);
    url.searchParams.set('per_page', '50');
    url.searchParams.set('status', 'publish');
    url.searchParams.set('start_date', new Date().toISOString().split('T')[0]);

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const items = json.events || [];

    for (const ev of items) {
      const [date, timeRaw] = (ev.start_date || '').split(' ');
      const [, endTimeRaw] = (ev.end_date || '').split(' ');

      events.push({
        title: stripHtml(ev.title) || ev.title,
        venue: 'Bar Anticipation',
        date: date || null,
        time: formatTime(timeRaw),
        end_time: formatTime(endTimeRaw),
        description: stripHtml(ev.description) || null,
        image_url: ev.image?.url || null,
        ticket_url: ev.website || ev.url || null,
        price: ev.cost || null,
        source_url: 'https://bar-a.com/events',
        external_id: `baranticipation-${ev.id}`,
        approved: true,
      });
    }

    console.log(`[BarAnticipation] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[BarAnticipation] Scraper error:', err.message);
  }

  return { events, error };
}