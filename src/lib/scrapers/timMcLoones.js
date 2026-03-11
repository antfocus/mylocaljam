/**
 * Tim McLoone's Supper Club Scraper
 * URL: https://www.timmcloonessupperclub.com/events.php
 *
 * Custom PHP site — server-rendered HTML with event cards.
 * Each event card has two columns:
 *   .events_col1 — image
 *   .events_col2 — date (.event_date), title (h2), subtitle (.event_subtitle),
 *                  DETAILS link (events.php?id=XXXX), TICKETS link (ticketbud.com)
 *
 * Dates are "Thursday, March 12" format (no year — inferred from current/next year).
 * Some events have times in the subtitle (e.g. "7:00pm" or "6:30pm - 8:30pm").
 *
 * If it breaks:
 *   1. Go to timmcloonessupperclub.com/events.php
 *   2. View source — events are in .events_col2 divs
 *   3. Check that date class is still .event_date and title is still in <h2>
 */

const VENUE = "Tim McLoone's Supper Club";
const EVENTS_URL = 'https://www.timmcloonessupperclub.com/events.php';
const BASE_URL = 'https://www.timmcloonessupperclub.com';

/**
 * Parse date like "Thursday, March 12" → "2026-03-12"
 * Infers year: if the resulting date is >2 months in the past, use next year.
 */
function parseEventDate(dateStr) {
  if (!dateStr) return null;

  // Remove day-of-week prefix: "Thursday, March 12" → "March 12"
  const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, '').trim();

  const months = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;

  const monthName = m[1].toLowerCase();
  const day = parseInt(m[2]);
  const monthIdx = months[monthName];
  if (monthIdx === undefined || isNaN(day)) return null;

  // Determine year — use current year, bump to next if date is >2 months ago
  const now = new Date();
  const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  let year = nowET.getFullYear();
  const candidate = new Date(year, monthIdx, day);

  const twoMonthsAgo = new Date(nowET);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  if (candidate < twoMonthsAgo) {
    year++;
  }

  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Extract time from subtitle text. Looks for patterns like:
 *   "7:00pm", "6:30pm - 8:30pm", "NO COVER CHARGE!, 6:30pm - 8:30pm"
 */
function extractTime(subtitle) {
  if (!subtitle) return null;
  const m = subtitle.match(/(\d{1,2}:\d{2})\s*(am|pm)/i);
  if (!m) return null;
  return `${m[1]} ${m[2].toUpperCase()}`;
}

export async function scrapeTimMcLoones() {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    console.log(`[TimMcLoones] Fetched ${html.length} bytes`);

    const todayET = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });

    // Split on events_col2 boundaries
    const blocks = html.split(/class="events_col2"/);

    const events = [];
    const seen = new Set();

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];

      // Date: <div class="event_date">Thursday, March 12</div>
      const dateMatch = block.match(/class="event_date"[^>]*>([^<]+)/);
      const dateStr = dateMatch?.[1]?.trim();
      const date = parseEventDate(dateStr);
      if (!date || date < todayET) continue;

      // Title: <h2><a href="events.php?id=XXXX">Title Here</a></h2>
      // or: <h2>Title Here</h2>
      const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      let title = null;
      let detailUrl = null;

      if (h2Match) {
        const h2Content = h2Match[1];
        // Check if title is wrapped in a link
        const linkMatch = h2Content.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/);
        if (linkMatch) {
          detailUrl = linkMatch[1];
          title = linkMatch[2].trim();
        } else {
          title = h2Content.replace(/<[^>]+>/g, '').trim();
        }
      }

      if (!title) continue;

      // Clean HTML entities
      title = title
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      // Subtitle (may contain time, price info)
      const subtitleMatch = block.match(/class="event_subtitle"[^>]*>([\s\S]*?)<\/div>/);
      const subtitle = subtitleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || null;

      // Time from subtitle
      const time = extractTime(subtitle);

      // Ticket URL from ticketbud link
      const ticketMatch = block.match(/href="(https?:\/\/mcloones\.ticketbud\.com[^"]*)"/);
      const ticketUrl = ticketMatch?.[1] || null;

      // Detail page URL
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = `${BASE_URL}/${detailUrl}`;
      }

      // Image from preceding events_col1 block
      // Since we split on events_col2, the image is in the chunk before this block
      // Look backwards in the original HTML for the nearest image
      const prevChunk = blocks[i - 1] || '';
      const imgMatch = prevChunk.match(/src="(https?:\/\/cdn\.mcloones\.com\/images\/calendar\/[^"]+)"/);
      const imageUrl = imgMatch?.[1] || null;

      // Build external ID from the event page ID if available
      const idMatch = detailUrl?.match(/id=(\d+)/);
      const eventId = idMatch ? idMatch[1] : title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 30);
      const externalId = `timmcloones-${date}-${eventId}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title,
        venue: VENUE,
        date,
        time,
        description: subtitle,
        ticket_url: ticketUrl || detailUrl || EVENTS_URL,
        price: null,
        source_url: EVENTS_URL,
        image_url: imageUrl,
        external_id: externalId,
      });
    }

    console.log(`[TimMcLoones] Found ${events.length} upcoming events`);
    return { events, error: null };
  } catch (err) {
    console.error('[TimMcLoones] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
