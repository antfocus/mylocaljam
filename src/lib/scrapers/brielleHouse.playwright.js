/**
 * Brielle House scraper (Playwright version)
 * Events page: https://brielle-house.com/specials-events/
 *
 * WordPress site using EventPrime + FullCalendar.
 * Events are loaded via AJAX and rendered client-side — a plain fetch()
 * only gets a loading spinner. The old scraper tried to replicate the
 * AJAX call (cookies + nonce + admin-ajax.php) but WordPress blocks it
 * with HTTP 500 from server IPs.
 *
 * This Playwright version opens a real browser, waits for the calendar
 * to render, and reads structured event data directly from the DOM.
 *
 * Requirements:
 *   npm install playwright (or @playwright/test)
 *   npx playwright install chromium
 *
 * Address: 403 Higgins Ave, Brielle, NJ
 */

import { chromium } from 'playwright';

const VENUE = 'Brielle House';
const EVENTS_PAGE = 'https://brielle-house.com/specials-events/';

export async function scrapeBrielleHouse() {
  let browser;
  try {
    // Launch headless Chromium
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate and wait for the FullCalendar to render
    await page.goto(EVENTS_PAGE, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for calendar events to appear in the DOM
    await page.waitForSelector('.fc-event', { timeout: 15000 }).catch(() => {
      console.warn('[BrielleHouse] No .fc-event elements found — calendar may be empty');
    });

    // Extract events from the rendered FullCalendar DOM
    const rawEvents = await page.evaluate(() => {
      const events = document.querySelectorAll('.fc-event');
      const results = [];
      events.forEach(el => {
        const title = el.querySelector('.fc-event-title')?.textContent?.trim()
          || el.textContent?.trim();
        const time = el.querySelector('.fc-event-time')?.textContent?.trim();
        const href = el.getAttribute('href');
        const date = el.closest('td')?.getAttribute('data-date');
        if (title && date) results.push({ title, time, date, href });
      });
      return results;
    });

    // Check if we need next month too (if we're late in the month)
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    let nextMonthEvents = [];

    if (daysLeft <= 7) {
      // Click the "next month" arrow to load upcoming month
      const nextBtn = await page.$('.fc-next-button, button[aria-label="next"]');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForTimeout(2000); // Wait for calendar to re-render
        await page.waitForSelector('.fc-event', { timeout: 10000 }).catch(() => {});

        nextMonthEvents = await page.evaluate(() => {
          const events = document.querySelectorAll('.fc-event');
          const results = [];
          events.forEach(el => {
            const title = el.querySelector('.fc-event-title')?.textContent?.trim()
              || el.textContent?.trim();
            const time = el.querySelector('.fc-event-time')?.textContent?.trim();
            const href = el.getAttribute('href');
            const date = el.closest('td')?.getAttribute('data-date');
            if (title && date) results.push({ title, time, date, href });
          });
          return results;
        });
      }
    }

    await browser.close();
    browser = null;

    // Merge and deduplicate
    const allRaw = [...rawEvents, ...nextMonthEvents];
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const seen = new Set();
    const events = [];

    for (const ev of allRaw) {
      if (ev.date < todayStr) continue;

      // Parse start time from "07:00 PM – 10:00 PM" or "11:00 AM – 02:00 PM"
      const startTime = ev.time?.split(/\s*[–-]\s*/)?.[0]?.trim() || null;

      const externalId = `briellehouse-${ev.date}-${ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      events.push({
        title: ev.title,
        venue: VENUE,
        date: ev.date,
        time: startTime,
        description: null,
        ticket_url: ev.href || null,
        price: null,
        source_url: EVENTS_PAGE,
        external_id: externalId,
        image_url: null,
      });
    }

    console.log(`[BrielleHouse] Playwright scraped ${events.length} upcoming events`);
    return { events, error: null };

  } catch (err) {
    console.error('[BrielleHouse] Playwright scraper error:', err.message);
    return { events: [], error: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
