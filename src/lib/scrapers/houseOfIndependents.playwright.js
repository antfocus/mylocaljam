/**
 * House of Independents scraper (Playwright version)
 * Etix calendar page: https://www.etix.com/ticket/v/33546/calendars
 *
 * Etix is a React SPA (Material UI) behind AWS WAF. The old scraper relied
 * on server-rendered JSON-LD, but Etix removed that. A plain fetch() from
 * a server IP gets a ~2 KB shell with no event data.
 *
 * This Playwright version opens a real browser, waits for the React app to
 * hydrate and the /api/online/search results to render, then reads the DOM.
 *
 * DOM structure per event card (list view):
 *   "Apr 23"                        — date (month + day, no year)
 *   "Thu  •  7:00 PM"               — day-of-week + start time
 *   "STYLES P"                      — title (inside <a href="/ticket/p/{id}/...">)
 *   "House of Independents • ..."   — venue line
 *   "$44.31 - $61.30"               — price range (inside 2nd <a>)
 *
 * The page shows ~30 events initially with a "Show More" button to load the
 * rest (typically 60 total). We click it until all events are visible.
 *
 * Requirements:
 *   npm install playwright (or @playwright/test)
 *   npx playwright install chromium
 *
 * Address: 572 Cookman Avenue, Asbury Park, NJ 07712
 */

import { chromium } from 'playwright';

const VENUE = 'House of Independents';
const CALENDAR_URL = 'https://www.etix.com/ticket/v/33546/calendars';

/**
 * Parse "Apr 23" + "Thu • 7:00 PM" into { date: 'YYYY-MM-DD', time: '7:00 PM' }.
 * Infers year: if the month is before the current month, assume next year.
 */
const MONTH_ABBR = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function parseDateAndTime(dateStr, timeStr) {
  if (!dateStr) return { date: null, time: null };

  // dateStr: "Apr 23" or "May 2"
  const dateMatch = dateStr.match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!dateMatch) return { date: null, time: null };

  const [, monthAbbr, day] = dateMatch;
  const mm = MONTH_ABBR[monthAbbr];
  if (!mm) return { date: null, time: null };

  // Determine year — if event month is before current month, it's next year
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const currentYear = now.getFullYear();
  const eventMonth = parseInt(mm, 10);
  const year = eventMonth < currentMonth ? currentYear + 1 : currentYear;

  const date = `${year}-${mm}-${day.padStart(2, '0')}`;

  // timeStr: "7:00 PM" or "10:00 PM" (extracted from its own DOM text node)
  let time = null;
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (timeMatch) {
      time = timeMatch[1].trim();
    }
  }

  return { date, time };
}

/**
 * Extract the Etix performance ID from the event URL for use as external_id.
 * URL pattern: /ticket/p/91572460/aaron-gillespie-...
 * We want: "hoi-91572460"
 */
function extractPerformanceId(href) {
  if (!href) return null;
  const match = href.match(/\/ticket\/p\/(\d+)\//);
  return match ? `hoi-${match[1]}` : null;
}

export async function scrapeHouseOfIndependents() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate and wait for the SPA to render event data
    await page.goto(CALENDAR_URL, { waitUntil: 'networkidle', timeout: 45000 });

    // Wait for at least one event link to appear
    await page.waitForSelector('a[href*="/ticket/p/"]', { timeout: 20000 }).catch(() => {
      console.warn('[HouseOfIndependents] No event links found after 20s — page may be blocked');
    });

    // Click "Show More" until all events are loaded
    let showMoreClicks = 0;
    const MAX_CLICKS = 10; // safety limit
    while (showMoreClicks < MAX_CLICKS) {
      const showMoreBtn = await page.$('button:has-text("Show More")');
      if (!showMoreBtn) break;

      const isVisible = await showMoreBtn.isVisible().catch(() => false);
      if (!isVisible) break;

      await showMoreBtn.click();
      showMoreClicks++;
      // Wait for new events to load
      await page.waitForTimeout(1500);
    }
    console.log(`[HouseOfIndependents] Clicked "Show More" ${showMoreClicks} time(s)`);

    // Extract all events from the rendered DOM
    // Each event card is a MuiStack-root with CSS class css-1j1ov2l containing:
    //   Text nodes: "Apr 23", "Thu", "•", "7:00 PM", title, venue, price
    //   Links: title <a href="/ticket/p/{id}/..."> and price <a> (or "Sold Out")
    //
    // Fallback: if that class changes, find cards by walking up from event links.
    const rawEvents = await page.evaluate(() => {
      const results = [];

      // Primary: use the card-level container class
      let cards = document.querySelectorAll('.css-1j1ov2l');

      // Fallback if MUI class changes: find the container that holds all event links
      // and iterate its direct children
      if (cards.length === 0) {
        const firstLink = document.querySelector('a[href*="/ticket/p/"]');
        if (firstLink) {
          // Walk up until we find a parent with many children (the list container)
          let container = firstLink.parentElement;
          for (let i = 0; i < 8 && container; i++) {
            if (container.children.length >= 10) break;
            container = container.parentElement;
          }
          if (container) cards = container.children;
        }
      }

      for (const card of cards) {
        // Extract leaf text nodes in DOM order
        const leafTexts = [];
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
          const t = node.textContent.trim();
          if (t) leafTexts.push(t);
        }

        // Find the title link (first <a> whose text is not a price)
        const links = card.querySelectorAll('a[href*="/ticket/p/"]');
        let titleLink = null;
        let priceText = null;
        for (const l of links) {
          const t = l.textContent?.trim();
          if (!t) continue;
          if (t.startsWith('$')) {
            if (!priceText) priceText = t;
          } else if (t !== 'Event Information' && !titleLink) {
            titleLink = l;
          }
        }

        if (!titleLink) continue;

        const title = titleLink.textContent.trim();
        const href = titleLink.getAttribute('href');
        const isSoldOut = card.textContent?.includes('Sold Out');

        // Parse date from leaf texts — "Apr 23" pattern
        let dateText = null;
        let timeText = null;
        for (const lt of leafTexts) {
          if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/.test(lt)) {
            dateText = lt;
          }
          // Time is its own text node: "7:00 PM" or "10:00 AM"
          if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(lt)) {
            timeText = lt;
          }
        }

        results.push({
          title,
          href,
          dateText,
          timeText,
          price: isSoldOut ? 'Sold Out' : priceText,
        });
      }

      return results;
    });

    await browser.close();
    browser = null;

    console.log(`[HouseOfIndependents] Extracted ${rawEvents.length} raw events from DOM`);

    // Process into final event objects
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const events = [];

    for (const ev of rawEvents) {
      const { date, time } = parseDateAndTime(ev.dateText, ev.timeText);
      if (!date) continue;
      if (date < todayStr) continue;

      const externalId = extractPerformanceId(ev.href);
      if (!externalId) continue;

      const ticketUrl = ev.href
        ? `https://www.etix.com${ev.href}`
        : null;

      events.push({
        title: ev.title,
        venue: VENUE,
        date,
        time: time || '8:00 PM',
        description: null,
        ticket_url: ticketUrl,
        price: ev.price,
        source_url: CALENDAR_URL,
        external_id: externalId,
        image_url: null,
      });
    }

    console.log(`[HouseOfIndependents] Found ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[HouseOfIndependents] Playwright scraper error:', err.message);
    return { events: [], error: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
