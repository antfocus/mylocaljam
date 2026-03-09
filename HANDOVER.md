# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~850+ events** across 13 scrapers (as of March 9, 2026)

---

## Sync Infrastructure (complete ✅)
- **Route:** `src/app/api/sync-events/route.js` — runs all scrapers in parallel, maps to Supabase schema, batches upserts (50 at a time) with `onConflict: 'external_id'`
- **Cron:** `vercel.json` at root — runs at 6am & 6pm Eastern (UTC 11:00 and 23:00)
- **Auth:** `SYNC_SECRET` env var on Vercel — Bearer token required for GET/POST
- **Manual trigger from browser console (on mylocaljam.com):**
  ```javascript
  fetch('/api/sync-events', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
  ```
- **Global deduplication:** `seen` Set in route.js prevents "ON CONFLICT DO UPDATE" batch errors from duplicate external_ids

---

## Scrapers — Status

| # | Venue | File | Type | Status | ~Events |
|---|---|---|---|---|---|
| 1 | Pig & Parrot | `pigAndParrot.js` | Custom API | ✅ Working | ~60 |
| 2 | Ticketmaster | `ticketmaster.js` | Ticketmaster API | ✅ Working | ~92 |
| 3 | Joe's Surf Shack | `joesSurfShack.js` | Custom | ✅ Working | ~56 |
| 4 | St. Stephen's Green | `stStephensGreen.js` | Google Calendar iCal | ✅ Working | ~65 |
| 5 | McCann's Tavern | `mccanns.js` | Google Calendar iCal | ⚠️ Private calendar — returns 0. Contact venue to make public. | 0 |
| 6 | Beach Haus | `beachHaus.js` | Custom | ✅ Working | ~35 |
| 7 | Martell's Tiki Bar | `martells.js` | Timely API | ✅ Working | ~270 |
| 8 | Bar Anticipation | `barAnticipation.js` | AILEC iCal + RDATE | ✅ Working | ~211 |
| 9 | Jacks on the Tracks | `jacksOnTheTracks.js` | Google Calendar iCal | ✅ Working | ~34 |
| 10 | Marina Grille | `marinaGrille.js` | Squarespace JSON | ✅ Working | ~7 |
| 11 | Anchor Tavern | `anchorTavern.js` | Squarespace JSON | ✅ Working | ~6 |
| 12 | R Bar | `rBar.js` | Squarespace JSON | ✅ Working | ~8 |
| 13 | Brielle House | `brielleHouse.js` | WordPress EventPrime | ❌ Blocked — nonce requires session cookies that can't be replicated server-side. See notes below. | 0 |

---

## Key Fixes Applied This Session

### 1. Timezone bug in date filtering (all iCal + Squarespace scrapers)
- **Problem:** Vercel runs in UTC. After 7 PM Eastern (midnight UTC), the server thought it was the next day, filtering out same-day events.
- **Fix:** Changed all date comparisons to use Eastern time: `now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`
- **Files fixed:** `barAnticipation.js`, `stStephensGreen.js`, `jacksOnTheTracks.js`, `marinaGrille.js`, `anchorTavern.js`, `mccanns.js`

### 2. Bar Anticipation RDATE recurring events
- **Problem:** Bar A's iCal feed uses RDATE entries for recurring events (e.g., VINYL plays every Monday). The parser only read DTSTART, missing all recurring dates.
- **Fix:** Rewrote `parseIcal()` to collect all RDATE values per VEVENT and create a separate event for each future date. Added title+date deduplication to prevent duplicates from overlapping VEVENTs.
- **Result:** Jumped from 32 → 211 events.
- **Important:** After changing Bar A's external_id format, had to run `DELETE FROM events WHERE venue_name = 'Bar Anticipation';` in Supabase to clear old duplicates, then re-sync.

### 3. Jacks on the Tracks duplicate ID fix (previous session)
- **Problem:** Google Calendar recurring events share the same UID, causing batch upsert failures.
- **Fix:** Include date in external_id: `jackstracks-${dateStr}-${uidClean}`

---

## Brielle House — Investigation Notes
- **URL:** https://brielle-house.com/specials-events/
- **Platform:** WordPress with **EventPrime** calendar plugin
- **Calendar data source:** `admin-ajax.php` with action `ep_get_calendar_event`
- **Nonce location:** `var em_front_event_object = {"nonce":"..."}` in page source
- **Problem:** WordPress nonce verification requires session cookies. The nonce is tied to the server-side session, so even when we extract the nonce and cookies from the initial page fetch, the AJAX call returns "Security check failed."
- **REST API:** `https://brielle-house.com/wp-json/eventprime/v1/events` returns event names/IDs but NO dates
- **Individual event details:** `/wp-json/eventprime/v1/events/{id}` returns "Route not found"
- **Possible future approaches:** Browser-based scraping (Puppeteer/Playwright), or contact venue for a public calendar feed

---

## Next Steps

### Venues to Add
- **Spring Lake Tap House** — Not yet investigated
- **Wharfside Seafood and Patio Bar** — Not yet investigated
- **Broadway Bar and Grill** — Not yet investigated
- User may add additional venues not on this list

### Last.fm Artist Enrichment (planned)
- Many scraped events have no band bio or genre info
- Plan: Use **Last.fm API** (free, no auth needed) to enrich events
- Approach:
  1. After scraping, check if event has an artist name but no description/genre
  2. Search Last.fm for the artist
  3. Cache artist info in a new `artists` table in Supabase
  4. Link events to artists for bio + genre display
- User confirmed they want Last.fm (not Spotify or MusicBrainz)
- Build this after adding a few more venues

---

## Supabase Schema Notes
- **Table:** `events`
- **Key fields:** `artist_name`, `venue_name`, `venue_id`, `event_date` (ISO string), `ticket_link`, `cover`, `source`, `external_id`, `status`, `verified_at`
- **No `image_url` column** — do not include in mapEvent()
- **Upsert conflict key:** `external_id`
- **Venue names with apostrophes** need SQL escaping: use `''` (double single-quote) in raw SQL

---

## Adding a New Scraper — Checklist
1. Create `src/lib/scrapers/venueName.js` — export `async function scrapeVenueName() { return { events: [], error: null } }`
2. Each event object needs: `title`, `venue` (must match DB venue name exactly), `date` (YYYY-MM-DD), `time` (12h format OK), `external_id`, optionally `ticket_url`, `price`, `description`, `source_url`
3. Import and add to `sync-events/route.js` — add to `Promise.all`, spread into `allEvents`, add to `scraperResults`
4. Add venue row to Supabase `venues` table if not already there
5. Deploy and run manual sync to verify
6. **For Squarespace sites:** Use `?format=json` on the collection URL. Click an event to find the collection name from the URL path.
7. **For iCal feeds:** Use Eastern time for date comparisons. Handle RDATE if the feed uses recurring events. Include date in external_id for recurring events.

---

## Squarespace Scraper Pattern (fastest to add)
```
const BASE_URL = 'https://www.example.com';
const COLLECTION = 'events';  // from the event URL path
// Fetch: `${BASE_URL}/${COLLECTION}?format=json`
// Events in: data.items || data.upcoming
// Date from: item.startDate (epoch ms)
// Slug from: item.urlId || item.fullUrl
```
Working examples: Marina Grille (`schedule`), Anchor Tavern (`schedule`), R Bar (`events`)

---

## Repo
GitHub: `https://github.com/antfocus/mylocaljam.git`
Push to main = auto-deploy on Vercel.
User's local path: `~/Documents/mylocaljam`
