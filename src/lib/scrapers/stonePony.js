// lib/scrapers/stonePony.js
// Stone Pony — HTML scraper (WordPress + EventOn plugin)

const CALENDAR_URL = 'https://www.stoneponyonline.com/calendar';

function parseEventOnDate(el) {
  const match = el.match(/data-event_start="(\d+)"/);
  if (match) {
    const d = new Date(parseInt(match[1], 10) * 1000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function parseEventOnTime(el) {
  const match = el.match(/class="evcal_time"[^>]*>([\s\S]*?)<\/span>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, '').trim().toUpperCase() || null;
}

function parseEventOnTitle(el) {
  const match =
    el.match(/class="evcal_event_title"[^>]*>([\s\S]*?)<\/span>/i) ||
    el.match(/class="evo_event_title"[^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, '').trim();
}

function parseEventOnUrl(el) {
  const match = el.match(/href="(https?:\/\/(?:www\.)?stoneponyonline\.com\/event\/[^"]+)"/i);
  return match ? match[1] : null;
}

function parseEventOnImage(el) {
  const match =
    el.match(/class="evcal_evdata_img"[\s\S]*?src="([^"]+)"/i) ||
    el.match(/wp-post-image[^>]*src="([^"]+)"/i);
  return match ? match[1] : null;
}

export async function scrapeStonePony() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(CALENDAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const articleRegex = /<article[^>]*class="[^"]*eventon_list_event[^"]*"([\s\S]*?)<\/article>/gi;
    let match;

    while ((match = articleRegex.exec(html)) !== null) {
      const el = match[0];
      const title = parseEventOnTitle(el);
      if (!title) continue;

      const date = parseEventOnDate(el);
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

      events.push({
        title,
        venue: 'Stone Pony',
        date,
        time: parseEventOnTime(el),
        end_time: null,
        description: null,
        image_url: parseEventOnImage(el),
        ticket_url: parseEventOnUrl(el),
        price: null,
        source_url: CALENDAR_URL,
        external_id: `stonepony-${date || 'nodate'}-${slug}`,
        approved: true,
      });
    }

    console.log(`[StonePony] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[StonePony] Scraper error:', err.message);
  }

  return { events, error };
}