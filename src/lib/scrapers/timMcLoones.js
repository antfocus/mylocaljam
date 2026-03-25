/**
 * Tim McLoone's Supper Club scraper
 * Source: https://mcloones.ticketbud.com (Ticketbud organizer page)
 *
 * Ticketbud serves server-rendered HTML with `.card.vertical` containers.
 * Each card has:
 *   - `.event-title` or `h6` — event name
 *   - `.date` — "Sun, Mar 29, 2026"
 *   - `.time` — "7:00 pm - 9:30 pm"
 *   - `img.card-image` — event image (S3-hosted)
 *   - `a[href]` — ticket/detail link
 *
 * Detail pages (e.g. mcloones.ticketbud.com/the-no-worries-band-...) contain
 * artist descriptions in `section.columns.large-7.small-12` elements. We fetch
 * each detail page to populate the `description` field so Phase 0 enrichment
 * can seed artist bios automatically.
 *
 * Pagination: `?page=N` (9 cards per page, ~2-3 pages typical)
 *
 * Previously blocked because all McLoone's domains are behind Cloudflare+reCAPTCHA
 * which blocks datacenter IPs. Now routed through IPRoyal residential proxy.
 *
 * If it breaks:
 *   1. Go to https://mcloones.ticketbud.com in a browser
 *   2. Check if .card.vertical structure still exists
 *   3. Check if Cloudflare added a JS challenge that the proxy can't bypass
 *   4. Try incrementing page param to verify pagination still works
 *
 * Address: 1200 Ocean Ave, Asbury Park, NJ 07712
 */

import { proxyFetch } from '@/lib/proxyFetch';

const BASE_URL = 'https://mcloones.ticketbud.com';
const VENUE = "Tim McLoone's Supper Club";
const MAX_PAGES = 4;

// Month abbreviations from Ticketbud date format
const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Parse Ticketbud date string: "Sun, Mar 29, 2026" → "2026-03-29"
 */
function parseDate(dateText) {
  if (!dateText) return null;
  // Handle extra whitespace: "Thu, Apr  2, 2026"
  const match = dateText.match(/(\w{3})\s+(\d{1,2}),?\s*(\d{4})/);
  if (!match) return null;
  const mm = MONTHS[match[1].toLowerCase()];
  if (!mm) return null;
  const day = match[2].padStart(2, '0');
  return `${match[3]}-${mm}-${day}`;
}

/**
 * Parse Ticketbud time string: "7:00 pm - 9:30 pm" → "7:00 PM"
 * Takes just the start time.
 */
function parseTime(timeText) {
  if (!timeText) return null;
  const match = timeText.match(/(\d{1,2}:\d{2}\s*[ap]m)/i);
  return match ? match[1].trim().toUpperCase() : null;
}

/**
 * Extract event slug from Ticketbud URL for use as external_id.
 * URL: "https://mcloones.ticketbud.com/the-no-worries-band-8dcc8ebd-9072244011b7"
 * We take the last path segment.
 */
function extractSlug(url) {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const slug = path.split('/').filter(Boolean).pop();
    return slug ? `mcloones-${slug}` : null;
  } catch {
    return null;
  }
}

/** Small delay between detail-page fetches to be polite to Ticketbud. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a Ticketbud detail page and extract the artist description.
 *
 * Page structure (confirmed via browser inspection):
 *   <section class="columns large-7 small-12">
 *     <section class="ql-editor">       ← bio content lives here
 *       <p>Artist Name</p>
 *       <p>Get ready for some smooth grooves...</p>
 *     </section>
 *     <div class="event-location-map">...</div>
 *   </section>
 *
 * We target `section.ql-editor` first (most reliable), then fall back
 * to the outer columns section, then generic description containers.
 * Returns the description string (max 500 chars) or null.
 */
async function fetchDescription(detailUrl) {
  if (!detailUrl) return null;
  try {
    const res = await proxyFetch(detailUrl);
    if (!res.ok) {
      console.warn(`[TimMcLoones] Detail page HTTP ${res.status}: ${detailUrl}`);
      return null;
    }
    const html = await res.text();

    // Detect Cloudflare challenge on detail page
    if (html.includes('cf-challenge') || html.includes('Checking your browser')) {
      console.warn(`[TimMcLoones] Cloudflare challenge on detail page: ${detailUrl}`);
      return null;
    }

    // Log page size for debugging
    console.log(`[TimMcLoones] Detail page fetched (${html.length} bytes): ${detailUrl}`);

    // Strategy 1: section.ql-editor — the Quill rich-text editor container (most specific)
    const qlMatch = html.match(
      /<section[^>]*class="[^"]*ql-editor[^"]*"[^>]*>([\s\S]*?)<\/section>/i
    );

    // Strategy 2: section.columns.large-7 — the outer content column
    // Use greedy match up to LAST </section> since there's a nested section inside
    const colMatch = qlMatch
      || html.match(/<section[^>]*class="[^"]*columns[^"]*large-7[^"]*"[^>]*>([\s\S]*?)<\/section>\s*<\/section>/i);

    // Strategy 3: .event-description or #event-description
    const descMatch = colMatch
      || html.match(/<div[^>]*(?:class="[^"]*event-description[^"]*"|id="event-description")[^>]*>([\s\S]*?)<\/div>/i);

    // Strategy 4: any .description container
    const fallbackMatch = descMatch
      || html.match(/<div[^>]*class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    if (!fallbackMatch) {
      console.warn(`[TimMcLoones] No description container found on: ${detailUrl}`);
      return null;
    }

    // Strip HTML tags, decode entities, collapse whitespace
    const text = fallbackMatch[1]
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Skip very short or boilerplate-only text
    if (!text || text.length < 20) return null;

    return text.slice(0, 500);
  } catch (err) {
    console.warn(`[TimMcLoones] Failed to fetch detail page ${detailUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Parse .card.vertical blocks from Ticketbud HTML.
 */
function parseCards(html, todayStr, seen) {
  const events = [];

  // Split by card.vertical containers
  const cardPattern = /<div\s+class="card\s+vertical">/gi;
  const blocks = html.split(cardPattern).slice(1);

  for (const block of blocks) {
    // Title — from h6 with class event-title, or any h6
    const titleMatch = block.match(/<h6[^>]*class="[^"]*event-title[^"]*"[^>]*>([\s\S]*?)<\/h6>/i)
      || block.match(/<h6[^>]*>([\s\S]*?)<\/h6>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    if (!title) continue;

    // Date — from .date element
    const dateMatch = block.match(/<[^>]*class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p|time)>/i);
    const dateText = dateMatch ? dateMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    const dateStr = parseDate(dateText);
    if (!dateStr || dateStr < todayStr) continue;

    // Time — from .time element
    const timeMatch = block.match(/<[^>]*class="[^"]*\btime\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/i);
    const timeText = timeMatch ? timeMatch[1].replace(/<[^>]*>/g, '').trim() : '';
    const time = parseTime(timeText) || '7:00 PM';

    // Ticket link — first <a> with href to ticketbud
    const linkMatch = block.match(/href="(https:\/\/mcloones\.ticketbud\.com\/[^"]+)"/i);
    const ticketUrl = linkMatch ? linkMatch[1] : null;

    // Image — from img.card-image
    const imgMatch = block.match(/<img[^>]*class="[^"]*card-image[^"]*"[^>]*src="([^"]+)"/i)
      || block.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*card-image[^"]*"/i);
    const imageUrl = imgMatch ? imgMatch[1].split('?')[0] : null;

    // External ID from slug
    const externalId = extractSlug(ticketUrl) || `mcloones-${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    events.push({
      title,
      venue: VENUE,
      date: dateStr,
      time,
      description: null,
      ticket_url: ticketUrl,
      price: null,
      source_url: BASE_URL,
      external_id: externalId,
      image_url: imageUrl,
    });
  }

  return events;
}

export async function scrapeTimMcLoones() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    const allEvents = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page === 1 ? BASE_URL : `${BASE_URL}/?page=${page}`;

      const res = await proxyFetch(url);
      if (!res.ok) {
        if (page === 1) throw new Error(`HTTP ${res.status} fetching Ticketbud page`);
        break; // later pages returning errors just means no more pages
      }

      const html = await res.text();

      // Detect Cloudflare challenge page
      if (html.includes('cf-challenge') || html.includes('Checking your browser')) {
        throw new Error('Cloudflare challenge detected — proxy may not be working');
      }

      const pageEvents = parseCards(html, todayStr, seen);
      allEvents.push(...pageEvents);

      // If we got fewer than 8 cards, probably the last page
      if (pageEvents.length < 8) break;

      console.log(`[TimMcLoones] Page ${page}: ${pageEvents.length} events`);
    }

    // NOTE: Detail page fetching for artist bios was attempted but disabled.
    // Ticketbud detail pages have rich bios in section.ql-editor, but fetching
    // them through the proxy hits Vercel's 10s timeout and/or Cloudflare rate
    // limits. Artist bios for McLoone's events should be added manually via admin.

    console.log(`[TimMcLoones] Found ${allEvents.length} upcoming events`);
    return { events: allEvents, error: null };

  } catch (err) {
    console.error("[TimMcLoones] Scraper error:", err.message);
    return { events: [], error: err.message };
  }
}
