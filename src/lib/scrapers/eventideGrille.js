/**
 * Eventide Grille scraper
 * Website: https://eventidegrille.com/
 *
 * Squarespace site — the live music schedule is posted as an IMAGE POSTER only.
 * There is no structured data, no calendar embed, no events feed.
 *
 * This scraper uses a hardcoded monthly schedule read from the poster image.
 * It must be updated manually each month when the venue posts a new poster.
 *
 * HOW TO UPDATE:
 *   1. Go to https://eventidegrille.com/ and scroll to the "Live Music" section
 *   2. Read the new monthly poster image
 *   3. Update the MONTHLY_EVENTS array below with the new events
 *   4. Update SCHEDULE_MONTH to the new month string (e.g. '2026-04')
 *
 * Address: 1400 Ocean Avenue, Sea Bright, NJ 07760
 */

const VENUE = 'Eventide Grille';
const VENUE_URL = 'https://eventidegrille.com/';

// ── Current schedule month ──────────────────────────────────────────────────
const SCHEDULE_MONTH = '2026-03';

// ── Hardcoded events from the March 2026 poster ─────────────────────────────
// Each entry: { day (1-31), title, time (12h string) }
const MONTHLY_EVENTS = [
  { day: 17, title: 'John Rafferty',       time: '4:00 PM' },  // St. Patrick's Day
  { day: 20, title: 'The Slackers',        time: '6:00 PM' },
  { day: 21, title: 'The Soulstirs',       time: '6:00 PM' },
  { day: 22, title: 'Aiden Villa Duo',     time: '2:00 PM' },
  { day: 27, title: 'Liam Davis Trio',     time: '6:00 PM' },
  { day: 28, title: 'Barefoot Jugglers',   time: '6:00 PM' },
  { day: 29, title: 'Scott Elk',           time: '2:00 PM' },
];

export async function scrapeEventideGrille() {
  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Only return events if we're in the schedule month (or it's still current)
    const [schedYear, schedMonth] = SCHEDULE_MONTH.split('-').map(Number);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based

    // If the schedule is more than 1 month old, skip
    const schedDate = new Date(schedYear, schedMonth - 1, 1);
    const nowDate = new Date(currentYear, currentMonth - 1, 1);
    const monthDiff = (nowDate.getFullYear() - schedDate.getFullYear()) * 12
      + (nowDate.getMonth() - schedDate.getMonth());

    if (monthDiff > 1) {
      console.log('[EventideGrille] Schedule is stale (more than 1 month old) — skipping.');
      return { events: [], error: 'Schedule data is stale — needs manual update' };
    }

    const events = [];

    for (const ev of MONTHLY_EVENTS) {
      const day = String(ev.day).padStart(2, '0');
      const dateStr = `${SCHEDULE_MONTH}-${day}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      const titleClean = ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `eventidegrille-${dateStr}-${titleClean}`;

      events.push({
        title: ev.title,
        venue: VENUE,
        date: dateStr,
        time: ev.time,
        description: null,
        ticket_url: VENUE_URL,
        price: null,
        source_url: VENUE_URL,
        external_id: externalId,
      });
    }

    console.log(`[EventideGrille] Found ${events.length} upcoming events (from hardcoded ${SCHEDULE_MONTH} schedule)`);
    return { events, error: null };

  } catch (err) {
    console.error('[EventideGrille] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
