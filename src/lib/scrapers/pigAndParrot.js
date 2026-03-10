// lib/scrapers/pigAndParrot.js
// Pig & Parrot Brielle — PopMenu GraphQL API
//
// Uses customPageCalendarSection to fetch all upcoming events.
// If broken: go to thepigandparrot.com/brielle, open DevTools → Network,
// scroll to events section, find the customPageCalendarSection request,
// and update OPERATION_ID and SECTION_ID below.

const GRAPHQL_URL = 'https://www.thepigandparrot.com/graphql';
const SECTION_ID = 4216789;
const OPERATION_ID = 'PopmenuClient/cd5b0fad2ca75f0ee6749973681b6474';

function secondsToTime(seconds) {
  if (!seconds && seconds !== 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function scrapePigAndParrot() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.thepigandparrot.com',
        'Referer': 'https://www.thepigandparrot.com/brielle',
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)',
      },
      body: JSON.stringify({
        operationName: 'customPageCalendarSection',
        variables: {
          rangeStartAt: new Date().toISOString(),
          limit: 60,
          sectionId: SECTION_ID,
        },
        extensions: {
          operationId: OPERATION_ID,
        },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from PopMenu`);

    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const upcomingEvents =
      json?.data?.customPageSection?.upcomingCalendarEvents || [];

    for (const ev of upcomingEvents) {
      if (ev.isPastEvent) continue;

      const photoUrl =
        ev.photoUploadedPhoto?.url ||
        ev.photoUrl ||
        null;

      events.push({
        title: ev.name,
        venue: 'Pig & Parrot Brielle',
        date: ev.startAt ? ev.startAt.slice(0, 10) : null,
        time: secondsToTime(ev.startTime),
        end_time: secondsToTime(ev.endTime),
        description: ev.description || null,
        image_url: photoUrl,
        ticket_url:
          ev.externalLinkUrl ||
          `https://www.thepigandparrot.com${ev.calendarEventPageUrl}`,
        source_url: 'https://www.thepigandparrot.com/brielle',
        external_id: `pigandparrot-${ev.id}`,
        approved: true,
      });
    }

    console.log(`[PigAndParrot] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[PigAndParrot] Scraper error:', err.message);
  }

  return { events, error };
}