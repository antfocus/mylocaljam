/**
 * Algonquin Arts Theatre scraper
 * Calendar page: https://www.algonquinarts.org/calendar.php?s=14
 *
 * Custom PHP site with `.calendar-full-container` divs for each event.
 * Each container has:
 *   - `.calendar-full-dates` — date text (e.g. "April 18" or "March 20 - March 29")
 *   - `.calendar-full-title` — event title (inside an <h2>)
 *   - `.calendar-full-series` — category (Broadway, Concerts, Jazz, Orchestra)
 *   - `.calendar-full-description` — description text
 *   - `a[href]` with "calendar.php?id=XXX" for detail page
 *   - `img` for event image
 *
 * The `?s=14` parameter is the current season. If events stop appearing,
 * try incrementing the season number (s=15, s=16, etc.).
 *
 * If it breaks:
 *   1. Go to https://www.algonquinarts.org/calendar.php?s=14
 *   2. Inspect event containers — look for .calendar-full-container
 *   3. Check if the season param changed
 */

const BASE_URL = 'https://www.algonquinarts.org';
const CALENDAR_URL = `${BASE_URL}/calendar.php?s=14`;
const VENUE = 'Algonquin Arts Theatre';
const VENUE_URL = CALENDAR_URL;

export async function scrapeAlgonquinArts() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Algonquin Arts calendar`);

    const html = await res.text();

    // Match each calendar-full-container block
    const containerPattern = /<div[^>]*class="calendar-full-container"[^>]*>([\s\S]*?)(?=<div[^>]*class="calendar-full-container"|<\/div>\s*<\/div>\s*<\/div>\s*$)/gi;

    const events = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();

    // Month mapping
    const MONTHS = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    // Simpler approach: extract dates, titles, and series using class-based patterns
    const datePattern = /<div[^>]*class="calendar-full-dates"[^>]*>([\s\S]*?)<\/div>/gi;
    const titlePattern = /<div[^>]*class="calendar-full-title"[^>]*>([\s\S]*?)<\/div>/gi;
    const seriesPattern = /<div[^>]*class="calendar-full-series"[^>]*>([\s\S]*?)<\/div>/gi;
    const descPattern = /<div[^>]*class="calendar-full-description"[^>]*>([\s\S]*?)<\/div>/gi;

    const dates = [];
    const titles = [];
    const series = [];
    const descriptions = [];
    let match;

    while ((match = datePattern.exec(html)) !== null) {
      dates.push(match[1].replace(/<[^>]*>/g, '').trim());
    }
    while ((match = titlePattern.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]*>/g, '').trim());
    }
    while ((match = seriesPattern.exec(html)) !== null) {
      series.push(match[1].replace(/<[^>]*>/g, '').trim());
    }
    while ((match = descPattern.exec(html)) !== null) {
      descriptions.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    // Also extract detail page links (calendar.php?id=XXX)
    const detailLinks = [];
    const linkPattern = /href="(calendar\.php\?id=\d+)"/gi;
    const linksSeen = new Set();
    while ((match = linkPattern.exec(html)) !== null) {
      if (!linksSeen.has(match[1])) {
        linksSeen.add(match[1]);
        detailLinks.push(match[1]);
      }
    }

    // Extract image URLs from calendar-full-image containers
    const imagePattern = /<div[^>]*class="calendar-full-image"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/gi;
    const images = [];
    while ((match = imagePattern.exec(html)) !== null) {
      const src = match[1];
      images.push(src.startsWith('http') ? src : `${BASE_URL}/${src.replace(/^\//, '')}`);
    }

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      const dateText = dates[i] || '';
      const category = series[i] || '';
      const description = descriptions[i] || null;

      if (!title || !dateText) continue;

      // Parse date — handle "April 18", "March 20 - March 29", "January 16 - January 24, 2027"
      // Take the first (start) date
      const startMatch = dateText.match(/(\w+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
      if (!startMatch) continue;

      const monthName = startMatch[1].toLowerCase();
      const day = parseInt(startMatch[2], 10);
      const explicitYear = startMatch[3] ? parseInt(startMatch[3], 10) : null;

      const month = MONTHS[monthName];
      if (month === undefined || isNaN(day)) continue;

      // Determine year
      let year = explicitYear || currentYear;
      // If no explicit year and the month is before the current month, assume next year
      if (!explicitYear && month < now.getMonth() - 1) {
        year = currentYear + 1;
      }

      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      // Default time — theatre shows typically at 8 PM
      const time = '8:00 PM';

      // Build event URL
      const detailLink = detailLinks[i] ? `${BASE_URL}/${detailLinks[i]}` : VENUE_URL;

      // Image
      const imageUrl = images[i] || null;

      // External ID
      const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const externalId = `algonquin-${dateStr}-${titleSlug}`;

      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: `${title}${category ? ` (${category})` : ''}`,
        venue: VENUE,
        date: dateStr,
        time,
        description: description ? description.slice(0, 500) : null,
        ticket_url: detailLink,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
        image_url: imageUrl,
      });
    }

    console.log(`[AlgonquinArts] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[AlgonquinArts] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
