/**
 * Tim McLoone's Supper Club Scraper
 * Source: https://mcloones.ticketbud.com (Ticketbud organizer page)
 *
 * The main site (timmcloonessupperclub.com) is behind Cloudflare + reCAPTCHA
 * and blocks datacenter IPs (Vercel). Instead we scrape their Ticketbud
 * organizer page which has the same events, images, and ticket links.
 *
 * Structure: server-rendered HTML with `.card.vertical` containers.
 * Each card has:
 *   .card-section.vox1 — image (S3 hosted)
 *   .event-title (H6) — event name
 *   .date — "Thu, Mar 12, 2026"
 *   .time — "7:00 pm - 10:00 pm"
 *   a.button — ticket link (mcloones.ticketbud.com/event-slug)
 *
 * Pagination: ?page=2, ?page=3, etc.
 *
 * If it breaks:
 *   1. Go to mcloones.ticketbud.com
 *   2. View source — events are in .card.vertical divs
 *   3. Check that .event-title, .date, .time classes still exist
 *   4. Check pagination links at bottom (/?page=N)
 */

const VENUE = "Tim McLoone's Supper Club";
const TICKETBUD_URL = 'https://mcloones.ticketbud.com';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch HTML via direct request first; if Cloudflare blocks (403),
 * fall back to the Edge Runtime proxy which runs on Cloudflare's
 * own network and bypasses datacenter-IP blocking.
 */
async function fetchWithEdgeFallback(url) {
  // Try direct fetch first
  const directRes = await fetch(url, {
    headers: FETCH_HEADERS,
    next: { revalidate: 0 },
  });

  if (directRes.ok) {
    return directRes.text();
  }

  console.log(`[TimMcLoones] Direct fetch returned ${directRes.status}, trying Edge proxy...`);

  // Fall back to Edge proxy
  const proxyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mylocaljam.com'}/api/fetch-proxy`;
  const proxyRes = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.SYNC_SECRET ? { Authorization: `Bearer ${process.env.SYNC_SECRET}` } : {}),
    },
    body: JSON.stringify({ url }),
  });

  if (!proxyRes.ok) {
    throw new Error(`Edge proxy returned ${proxyRes.status}`);
  }

  const data = await proxyRes.json();
  if (data.status !== 200) {
    throw new Error(`Edge proxy: target returned HTTP ${data.status}`);
  }

  return data.html;
}

/**
 * Parse Ticketbud date like "Thu, Mar 12, 2026" → "2026-03-12"
 */
function parseTicketbudDate(dateStr) {
  if (!dateStr) return null;
  // "Thu, Mar 12, 2026" or "Fri, Apr  3, 2026"
  const cleaned = dateStr.replace(/\s+/g, ' ').trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extract start time from Ticketbud time string like "7:00 pm - 10:00 pm"
 */
function extractTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}:\d{2})\s*(am|pm)/i);
  if (!m) return null;
  return `${m[1]} ${m[2].toUpperCase()}`;
}

/**
 * Parse events from one page of Ticketbud HTML
 */
function parseTicketbudPage(html) {
  const events = [];

  // Split on card boundaries
  const blocks = html.split(/class="card vertical"/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Title: <h6 class="event-title">...</h6> or content inside event-title
    const titleMatch = block.match(/class="event-title"[^>]*>([\s\S]*?)<\/h6>/i);
    let title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || null;
    if (!title) continue;

    // Clean HTML entities
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();

    // Date: <p class="date">Thu, Mar 12, 2026</p>
    const dateMatch = block.match(/class="date"[^>]*>([^<]+)/);
    const date = parseTicketbudDate(dateMatch?.[1]);

    // Time: <p class="time">7:00 pm - 10:00 pm</p>
    const timeMatch = block.match(/class="time"[^>]*>([^<]+)/);
    const time = extractTime(timeMatch?.[1]);

    // Ticket URL: <a class="button primary expanded" href="...">View Event</a>
    const linkMatch = block.match(/href="(https?:\/\/mcloones\.ticketbud\.com\/[^"]+)"/);
    const ticketUrl = linkMatch?.[1] || null;

    // Image: <img src="https://s3.amazonaws.com/attachments.ticketbud.com/...">
    const imgMatch = block.match(/src="(https?:\/\/s3\.amazonaws\.com\/attachments\.ticketbud\.com[^"]+)"/);
    const imageUrl = imgMatch?.[1] || null;

    // Build slug-based external ID from the ticket URL
    let eventSlug = null;
    if (ticketUrl) {
      const slugMatch = ticketUrl.match(/ticketbud\.com\/(.+)/);
      eventSlug = slugMatch?.[1]?.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
    }
    const externalId = eventSlug
      ? `timmcloones-${eventSlug}`
      : `timmcloones-${date}-${title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 30)}`;

    events.push({
      title,
      venue: VENUE,
      date,
      time,
      description: null,
      ticket_url: ticketUrl || TICKETBUD_URL,
      price: null,
      source_url: TICKETBUD_URL,
      image_url: imageUrl,
      external_id: externalId,
    });
  }

  return events;
}

/**
 * Check if there's a next page link
 */
function hasNextPage(html, currentPage) {
  const nextPage = currentPage + 1;
  return html.includes(`page=${nextPage}`);
}

export async function scrapeTimMcLoones() {
  try {
    const allEvents = [];
    const seen = new Set();
    let page = 1;
    const MAX_PAGES = 5;

    while (page <= MAX_PAGES) {
      const url = page === 1 ? TICKETBUD_URL : `${TICKETBUD_URL}/?page=${page}`;
      const html = await fetchWithEdgeFallback(url);
      console.log(`[TimMcLoones] Page ${page}: ${html.length} bytes`);

      const pageEvents = parseTicketbudPage(html);
      console.log(`[TimMcLoones] Page ${page}: ${pageEvents.length} events`);

      if (pageEvents.length === 0) break;

      // Filter today+ and deduplicate
      const todayET = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      });

      for (const ev of pageEvents) {
        if (!ev.date || ev.date < todayET) continue;
        if (seen.has(ev.external_id)) continue;
        seen.add(ev.external_id);
        allEvents.push(ev);
      }

      // Check for next page
      if (!hasNextPage(html, page)) break;
      page++;
    }

    console.log(`[TimMcLoones] Found ${allEvents.length} upcoming events across ${page} page(s)`);
    return { events: allEvents, error: null };
  } catch (err) {
    console.error('[TimMcLoones] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
