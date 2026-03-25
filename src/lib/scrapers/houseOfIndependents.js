/**
 * House of Independents scraper
 * Etix calendar page: https://www.etix.com/ticket/v/33546/calendars
 *
 * Etix is a React SPA. The search API returns encrypted/encoded data
 * that can't be decoded server-side. However, the calendar page
 * server-renders JSON-LD structured data containing up to 20 upcoming
 * Event objects — enough for a rolling sync.
 *
 * JSON-LD structure (2 blocks):
 *   1. @type: Organization — venue metadata
 *   2. Array of Event objects with: name, image, url, description,
 *      startDate, endDate, eventStatus, location, offers
 *
 * startDate format: "Sat Mar 21 17:30:00 EDT 2026"
 * offers.price: number (USD), offers.url: ticket link
 *
 * If it breaks:
 *   - Check if Etix changed the JSON-LD structure or removed it
 *   - Check if they started blocking server-side requests (look for 403 or CAPTCHA)
 *   - Check if the startDate format changed
 *   - The venue ID is 33546 — if the URL changes, search for it on etix.com
 *
 * Address: 572 Cookman Avenue, Asbury Park, NJ 07712
 */

import { proxyFetch, BROWSER_HEADERS } from '@/lib/proxyFetch';

const VENUE = 'House of Independents';
const CALENDAR_URL = 'https://www.etix.com/ticket/v/33546/calendars';

/**
 * Parse the Etix startDate format into { date: 'YYYY-MM-DD', time: 'H:MM PM' }.
 * Input examples:
 *   "Sat Mar 21 17:30:00 EDT 2026"
 *   "Fri Apr 24 21:00:00 EDT 2026"
 *   "Sun Jun 01 19:00:00 EST 2026"
 */
const MONTH_ABBR = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function parseEtixDate(dateStr) {
  if (!dateStr) return { date: null, time: null };

  // "Sat Mar 21 17:30:00 EDT 2026"
  const match = dateStr.match(
    /\w+\s+(\w+)\s+(\d{1,2})\s+(\d{2}):(\d{2}):\d{2}\s+\w+\s+(\d{4})/
  );
  if (!match) return { date: null, time: null };

  const [, monthAbbr, day, hours24, minutes, year] = match;
  const mm = MONTH_ABBR[monthAbbr];
  if (!mm) return { date: null, time: null };

  const date = `${year}-${mm}-${day.padStart(2, '0')}`;

  // Convert 24h → 12h for the sync route's convertTo24h() to handle
  let h = parseInt(hours24, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const time = `${h}:${minutes} ${period}`;

  return { date, time };
}

/**
 * Extract the Etix performance ID from the event URL for use as external_id.
 * URL pattern: https://www.etix.com/ticket/p/91572460/aaron-gillespie-...
 * We want: "hoi-91572460"
 */
function extractPerformanceId(url) {
  if (!url) return null;
  const match = url.match(/\/ticket\/p\/(\d+)\//);
  return match ? `hoi-${match[1]}` : null;
}

export async function scrapeHouseOfIndependents() {
  try {
    const res = await proxyFetch(CALENDAR_URL, {
      headers: BROWSER_HEADERS,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching calendar page`);

    const html = await res.text();
    console.log(`[HouseOfIndependents] Calendar page fetched: ${html.length} bytes`);

    // Diagnostics: detect bot-blocking / different page served to datacenter IPs
    const hasCaptcha = /captcha|challenge|verify.*human|blocked|access.denied/i.test(html);
    const hasTitle = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '(no title)';
    console.log(`[HouseOfIndependents] Page title: "${hasTitle}", captcha/block signals: ${hasCaptcha}`);
    if (html.length < 5000) {
      console.log(`[HouseOfIndependents] Short response (possible block). First 1000 chars: ${html.substring(0, 1000)}`);
    }

    // Extract all JSON-LD blocks
    const ldRegex =
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    let eventArray = null;
    let ldBlockCount = 0;

    while ((ldMatch = ldRegex.exec(html)) !== null) {
      ldBlockCount++;
      try {
        const data = JSON.parse(ldMatch[1]);
        if (Array.isArray(data) && data.length > 0 && data[0]['@type'] === 'Event') {
          eventArray = data;
          break;
        }
      } catch {
        // ignore parse errors
      }
    }

    console.log(`[HouseOfIndependents] JSON-LD blocks found: ${ldBlockCount}`);

    if (!eventArray || eventArray.length === 0) {
      const hasLdJson = html.includes('application/ld+json');
      const hasEventKeyword = html.includes('"@type":"Event"') || html.includes('"@type": "Event"');
      console.log(
        `[HouseOfIndependents] No Event JSON-LD array found. ld+json tags present: ${hasLdJson}, Event keyword in HTML: ${hasEventKeyword}`
      );
      return { events: [], error: `No Event JSON-LD found (${html.length} bytes, ${ldBlockCount} ld+json blocks, title: ${hasTitle})` };
    }

    console.log(`[HouseOfIndependents] Found ${eventArray.length} events in JSON-LD`);

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const events = [];

    for (const ev of eventArray) {
      if (ev['@type'] !== 'Event') continue;
      if (ev.eventStatus === 'https://schema.org/EventCancelled') continue;

      const { date, time } = parseEtixDate(ev.startDate);
      if (!date) continue;
      if (date < todayStr) continue;

      const title = ev.name?.trim();
      if (!title) continue;

      const externalId = extractPerformanceId(ev.url);
      if (!externalId) continue;

      // Offers can be Offer (single price) or AggregateOffer (lowPrice/highPrice)
      let price = null;
      if (ev.offers?.price) {
        price = `$${ev.offers.price}`;
      } else if (ev.offers?.lowPrice) {
        price = `$${ev.offers.lowPrice}`;
      }

      events.push({
        title,
        venue: VENUE,
        date,
        time: time || '8:00 PM',
        description: ev.description?.trim() || null,
        ticket_url: ev.offers?.url || ev.url || null,
        price,
        source_url: CALENDAR_URL,
        external_id: externalId,
        image_url: ev.image || null,
      });
    }

    console.log(`[HouseOfIndependents] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[HouseOfIndependents] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
