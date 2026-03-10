/**
 * Palmetto Southern Kitchen + Bar scraper
 * Music page: https://www.palmettoasburypark.com/music
 *
 * Squarespace site — the music schedule is posted as an IMAGE POSTER only.
 * There is no structured data, no calendar embed, no events feed.
 *
 * This scraper uses a hardcoded monthly schedule read from the poster image.
 * It must be updated manually each month when the venue posts a new poster.
 *
 * HOW TO UPDATE:
 *   1. Go to https://www.palmettoasburypark.com/music
 *   2. Read the new monthly poster image
 *   3. Update the MONTHLY_EVENTS array below with the new events
 *   4. Update SCHEDULE_MONTH to the new month string (e.g. '2026-04')
 *
 * Address: 1000 Ocean Ave N, Asbury Park, NJ 07712
 */

const VENUE = 'Palmetto';
const VENUE_URL = 'https://www.palmettoasburypark.com/music';

// ── Current schedule month ──────────────────────────────────────────────────
const SCHEDULE_MONTH = '2026-03';

// ── Hardcoded events from the March 2026 poster ─────────────────────────────
// Each entry: { day (1-31), title, time (12h string) }
const MONTHLY_EVENTS = [
  // Every Wednesday — Ryan Gregg & Friends at 8PM
  { day: 4,  title: 'Ryan Gregg & Friends', time: '8:00 PM' },
  { day: 11, title: 'Ryan Gregg & Friends', time: '8:00 PM' },
  { day: 18, title: 'Ryan Gregg & Friends', time: '8:00 PM' },
  { day: 25, title: 'Ryan Gregg & Friends', time: '8:00 PM' },

  // Fridays at 9PM
  { day: 6,  title: 'DJ Krush', time: '9:00 PM' },
  { day: 13, title: 'Lawless & The Bad Hombres w/ The Foes of Fern', time: '9:00 PM' },
  { day: 20, title: 'Salsa Fiesta with Xol Azul', time: '9:00 PM' },
  { day: 27, title: 'An Evening with Chevy Lopez', time: '9:00 PM' },

  // Saturdays at 9PM
  { day: 7,  title: 'An Evening with Keith Kenny', time: '9:00 PM' },
  { day: 14, title: 'The Get Down Committee', time: '9:00 PM' },
  { day: 21, title: 'Boardwalk Review w/ Mick Hale & Drew Melodrama', time: '9:00 PM' },
  { day: 28, title: 'An Evening with Skinny Amigo', time: '9:00 PM' },

  // Brunch on the Boards — Every Sunday at 1PM
  { day: 1,  title: 'The Salty Dawgz (Brunch on the Boards)', time: '1:00 PM' },
  { day: 8,  title: "Owen's Heavy Mellow (Brunch on the Boards)", time: '1:00 PM' },
  { day: 15, title: 'Willie & Billie (of Atlantic City Expressway) & Guests (Brunch on the Boards)', time: '1:00 PM' },
  { day: 22, title: "Ronnie Brandt & Freewheelin' (Brunch on the Boards)", time: '1:00 PM' },
  { day: 29, title: 'Bobby Syvarth Trio (Brunch on the Boards)', time: '1:00 PM' },

  // Special Events
  { day: 5,  title: 'Allie Morabia with Rena Angel', time: '9:00 PM' },
  { day: 17, title: 'The 4 Leaf Clovers', time: '9:00 PM' },
];

export async function scrapePalmetto() {
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
      console.log('[Palmetto] Schedule is stale (more than 1 month old) — skipping.');
      return { events: [], error: 'Schedule data is stale — needs manual update' };
    }

    const events = [];

    for (const ev of MONTHLY_EVENTS) {
      const day = String(ev.day).padStart(2, '0');
      const dateStr = `${SCHEDULE_MONTH}-${day}`;

      // Skip past events
      if (dateStr < todayStr) continue;

      const titleClean = ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      const externalId = `palmetto-${dateStr}-${titleClean}`;

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

    console.log(`[Palmetto] Found ${events.length} upcoming events (from hardcoded ${SCHEDULE_MONTH} schedule)`);
    return { events, error: null };

  } catch (err) {
    console.error('[Palmetto] Scraper error:', err.message);
    return { events: [], error: err.message };
  }
}
