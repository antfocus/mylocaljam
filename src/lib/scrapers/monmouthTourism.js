/**
 * Monmouth County Tourism (ImGoing Calendar) scraper
 * Source: https://tourism.visitmonmouth.com/events
 * API: https://api.imgoingcalendar.com/api/visitors/MonmouthCoNJ/events
 *
 * This is an aggregator site — many events may already exist from
 * venue-specific scrapers. Deduplication by artist+date is handled
 * in route.js to avoid inserting duplicates.
 *
 * If it breaks:
 *   1. Go to https://tourism.visitmonmouth.com/events?ig-custom-events=live-music--66ec2d9f4f3ca22d3b3027dd
 *   2. Open DevTools → Network tab → look for api.imgoingcalendar.com requests
 *   3. Check the URL pattern and response structure
 */

const API_BASE = 'https://api.imgoingcalendar.com/api/visitors/MonmouthCoNJ/events';
const FAVORITE_BTN_ID = '66ec2d9f4f3ca22d3b3027dd';
const LIMIT = 16;
const MAX_PAGES = 10; // Safety cap: 10 pages × 16 = 160 events max
const SOURCE_URL = 'https://tourism.visitmonmouth.com/events?ig-custom-events=live-music--66ec2d9f4f3ca22d3b3027dd';

function buildUrl(page) {
  return `${API_BASE}?page=${page}&limit=${LIMIT}&category=All&source=google&useFuzzyQuery=true&searchFields=name,address&favoriteEventBtnId=${FAVORITE_BTN_ID}`;
}

/**
 * Normalize time from ISO timestamp → "7:00 PM" format
 */
function formatTime(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });
  } catch {
    return null;
  }
}

/**
 * Extract date string (YYYY-MM-DD) in Eastern time from ISO timestamp
 */
function formatDate(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  } catch {
    return null;
  }
}

export async function scrapeMonmouthTourism() {
  try {
    const allEvents = [];
    const seen = new Set();
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = buildUrl(page);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0; +https://mylocaljam.com)',
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        console.error(`[MonmouthTourism] HTTP ${res.status} on page ${page}`);
        break;
      }

      const data = await res.json();

      // The API returns an array of events, or could be { events: [...] }
      const events = Array.isArray(data) ? data : (data.events || data.data || []);

      if (!events.length) break; // No more events

      for (const ev of events) {
        // Skip cancelled events
        if (ev.isCancelled) continue;
        // Skip removed/blocked events
        if (ev.isRemoved || ev.isBlocked) continue;

        const name = (ev.name || ev.title || '').trim();
        if (!name) continue;

        // Get the event date from startTime
        const dateStr = formatDate(ev.startTime);
        if (!dateStr) continue;

        // Skip past events
        if (dateStr < todayStr) continue;

        const timeStr = formatTime(ev.startTime);

        // Venue info
        const venueName = ev.venueInfo?.name || null;
        const address = ev.address?.address || null;

        // Build a venue string for display: "Venue Name" or "Venue Name, City"
        let venueDisplay = 'Monmouth County';
        if (venueName) {
          venueDisplay = venueName;
        }

        // Description (strip HTML tags)
        let description = ev.description || null;
        if (description) {
          description = description
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
        }

        // Ticket info
        let ticketUrl = SOURCE_URL;
        if (ev.ticketInfo && ev.ticketInfo.length > 0) {
          ticketUrl = ev.ticketInfo[0].url || SOURCE_URL;
        }

        // Use the ImGoing calendar ID as external ID
        const externalId = `monmouthtourism-${ev.id || ev._id}`;

        if (seen.has(externalId)) continue;
        seen.add(externalId);

        allEvents.push({
          title: name,
          venue: venueDisplay,
          date: dateStr,
          time: timeStr,
          description,
          ticket_url: ticketUrl,
          price: null,
          source_url: SOURCE_URL,
          external_id: externalId,
          // Extra field for dedup in route.js
          _venueName: venueName,
          _address: address,
        });
      }

      // If we got fewer than LIMIT events, we've reached the last page
      if (events.length < LIMIT) break;
    }

    console.log(`[MonmouthTourism] Found ${allEvents.length} upcoming live music events`);
    return { events: allEvents, error: null };

  } catch (err) {
    console.error('[MonmouthTourism] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
