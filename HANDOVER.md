# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~850+ events** across 20 scrapers (as of March 10, 2026)

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
| 14 | ParkStage | `parkStage.js` | HTML (WordPress) | ✅ Working | ~8 |
| 15 | Monmouth Tourism | `monmouthTourism.js` | API (ImGoing Calendar) | ❌ Removed — venue attribution problem (all events came in as "Monmouth County"). Scraper deleted. | 0 |
| 16 | 10th Ave Burrito | `tenthAveBurrito.js` | WordPress JetEngine AJAX | ✅ Working (0 events until venue posts spring schedule) | 0 |
| 17 | Reef & Barrel | `reefAndBoatyard.js` | Google Calendar iCal | ✅ Working | ~10+ |
| 18 | Palmetto | `palmetto.js` | Hardcoded (image poster) | ⚠️ Working — requires manual monthly update (see notes) | ~21 |
| 19 | Idle Hour | `idleHour.js` | Google Calendar iCal | ✅ Working | ~15+ |
| 20 | Asbury Lanes | `asburyLanes.js` | BentoBox HTML + JSON-LD | ✅ Working | ~12+ |

---

## Key Fixes Applied

### 1. Timezone bug in date filtering (all iCal + Squarespace scrapers)
- **Problem:** Vercel runs in UTC. After 7 PM Eastern (midnight UTC), the server thought it was the next day, filtering out same-day events.
- **Fix:** Changed all date comparisons to use Eastern time: `now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`
- **Files fixed:** `barAnticipation.js`, `stStephensGreen.js`, `jacksOnTheTracks.js`, `marinaGrille.js`, `anchorTavern.js`, `mccanns.js`

### 2. Bar Anticipation RDATE recurring events
- **Problem:** Bar A's iCal feed uses RDATE entries for recurring events (e.g., VINYL plays every Monday). The parser only read DTSTART, missing all recurring dates.
- **Fix:** Rewrote `parseIcal()` to collect all RDATE values per VEVENT and create a separate event for each future date. Added title+date deduplication to prevent duplicates from overlapping VEVENTs.
- **Result:** Jumped from 32 → 211 events.
- **Important:** After changing Bar A's external_id format, had to run `DELETE FROM events WHERE venue_name = 'Bar Anticipation';` in Supabase to clear old duplicates, then re-sync.

### 3. Jacks on the Tracks duplicate ID fix
- **Problem:** Google Calendar recurring events share the same UID, causing batch upsert failures.
- **Fix:** Include date in external_id: `jackstracks-${dateStr}-${uidClean}`

### 4. DST (Daylight Saving Time) offset bug — all iCal + HTML scrapers
- **Problem:** All iCal scrapers (`barAnticipation.js`, `stStephensGreen.js`, `jacksOnTheTracks.js`, `mccanns.js`) had `-05:00` (EST) hardcoded in `parseIcalDate()` for floating/TZID dates. `beachHaus.js` had the same issue in `parseEventDate()`. After DST spring-forward (March 8, 2026), Eastern time is EDT (`-04:00`), so all event times were off by 1 hour.
- **Fix:** Added `easternOffset()` helper to each scraper that dynamically detects EDT vs EST using `Intl.DateTimeFormat`:
  ```javascript
  function easternOffset(dateStr) {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        timeZoneName: 'short',
      }).formatToParts(d);
      const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'EST';
      return tz.includes('EDT') ? '-04:00' : '-05:00';
    } catch { return '-05:00'; }
  }
  ```
- **Files fixed:** `barAnticipation.js`, `stStephensGreen.js`, `jacksOnTheTracks.js`, `mccanns.js`, `beachHaus.js`
- **Note:** `route.js` already had its own `easternOffset()` for the `mapEvent()` function (added in a previous session).

### 5. Pig & Parrot DST fix
- **Problem:** `pigAndParrot.js` sent `date: ev.startAt` as a full ISO string, which bypassed the `easternOffset()` logic in route.js's `mapEvent()`.
- **Fix:** Changed to `date: ev.startAt ? ev.startAt.slice(0, 10) : null` so route.js combines the date-only with the `time` field using the dynamic offset.

### 6. ParkStage scraper wired up
- **Scraper file** (`parkStage.js`) was created in a previous session but not connected.
- **Wired into** `route.js`: import, Promise.all entry, scraperResults, allEvents spread.
- **Venue added to Supabase:** `INSERT INTO venues (name, address) VALUES ('ParkStage', '1500 Kozloski Road, Freehold NJ');`
- **Supabase schema note:** venues table only has `id, name, address, color, website, created_at` — no `slug` or `location` columns.

### 7. Monmouth County Tourism — investigated and removed
- **Site:** `https://tourism.visitmonmouth.com/events` (WordPress + ImGoing Calendar API)
- **API:** `api.imgoingcalendar.com` — rich paginated JSON with ~97 events, 16 per page
- **Built scraper** with pagination + artist/date deduplication logic in route.js
- **Removed** because all events came in with venue "Monmouth County" instead of actual venue names — too complicated to resolve
- **Cleanup:** Deleted scraper file, reverted route.js, ran `DELETE FROM events WHERE external_id LIKE 'monmouthtourism-%';` in Supabase
- **Residual data:** May need `DELETE FROM events WHERE venue_name = 'Monmouth County';` and `DELETE FROM venues WHERE name = 'Monmouth County';` if old entries persist

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

## New Scrapers (March 10, 2026)

### 10th Ave Burrito (`tenthAveBurrito.js`)
- **URL:** https://tenthaveburrito.com/events/
- **Platform:** WordPress + Elementor + JetEngine Listing Calendar
- **Approach:** AJAX POST to `jet_engine_calendar_get_month` action — fetches current + next 2 months
- **Note:** WP REST API (`/wp-json/wp/v2/events-calender`) returns posts but has NO date meta fields; the only way to get dates is through the JetEngine calendar widget
- **Address:** 801 Belmar Plaza, Belmar NJ 07719
- **Status:** Scraper works but venue hasn't posted spring 2026 events yet, so returns 0

### Reef & Barrel (`reefAndBoatyard.js` — rewritten)
- **URL:** https://www.reefandbarrel.com/events
- **Platform:** Framer site with embedded Google Calendar iframe
- **Previous version:** Basic HTML parser that didn't work for Framer
- **Rewritten as:** Google Calendar iCal scraper (same pattern as St. Stephen's Green)
- **Calendar ID:** `9d075af2fc91346d02e182eab76954878a912755f357e3cafdfc915fd90c0829@group.calendar.google.com`
- **Address:** 153 Sea Girt Ave, Manasquan NJ 08736
- **Also exports:** `scrapeBoatyard401()` — returns empty (no calendar found for Boatyard 401)

### Palmetto (`palmetto.js`) — ⚠️ Manual Update Required Monthly
- **URL:** https://www.palmettoasburypark.com/music
- **Platform:** Squarespace — music schedule is posted as an IMAGE POSTER only (no structured data, no calendar embed, no events collection, no JSON feed)
- **Approach:** Hardcoded `MONTHLY_EVENTS` array read from the poster image. Scraper skips past dates and flags itself stale if schedule is >1 month old.
- **Address:** 1000 Ocean Ave N, Asbury Park, NJ 07712
- **To update each month:**
  1. Visit https://www.palmettoasburypark.com/music
  2. Read the new monthly poster image
  3. Edit `src/lib/scrapers/palmetto.js`: update `SCHEDULE_MONTH` and `MONTHLY_EVENTS` array
  4. Commit and push
- **Current schedule:** March 2026 (21 events — Wednesdays, Fridays, Saturdays, Sundays, + 2 specials)

### Idle Hour (`idleHour.js`)
- **URL:** https://www.ihpointpleasant.com/
- **Platform:** Wix site with embedded Google Calendar on homepage
- **Approach:** Google Calendar iCal feed (same pattern as St. Stephen's Green, Reef & Barrel)
- **Calendar ID:** `8f5d0389c430a2be6bc4445bcb064a60609a1e8abe3e176347e9646c215c0df5@group.calendar.google.com`
- **Address:** 2600 NJ-88, Point Pleasant, NJ 08742
- **Live music:** Thursdays, Fridays, Saturdays

### Asbury Lanes (`asburyLanes.js`)
- **URL:** https://www.asburylanes.com/concerts/
- **Platform:** BentoBox (getbento.com) — no API available
- **Approach:** Parses listing page HTML for `.card__heading` titles (contain dates in MM.DD.YYYY format), extracts event slugs for external_id, then fetches each detail page in parallel to extract door times from JSON-LD `@type:Event` description field
- **Fallback time:** 8:00 PM if no door time found in detail page
- **Address:** 209 4th Ave, Asbury Park, NJ 07712
- **Note:** Concert venue + bowling alley. Events include concerts, music bingo, and special events.

---

## Immediate Action Items
- **Push all local commits:** `cd ~/Documents/mylocaljam && git push origin main`
- **Run sync** to refresh events with corrected DST offsets and image_url passthrough
- **Run Supabase SQL migrations** (see Schema Notes) to add `image_url` to `events` and create `artists` table
- **Add LASTFM_API_KEY** to Vercel environment variables (https://www.last.fm/api/account/create — free)
- **Run artist enrichment** after deploy + migrations: call `/api/enrich-artists` repeatedly until all events are enriched
- **Clean up Monmouth County** if still showing: run `DELETE FROM events WHERE venue_name = 'Monmouth County';` and `DELETE FROM venues WHERE name = 'Monmouth County';` in Supabase

---

## Next Steps

### Venues to Add
- **Spring Lake Tap House** — Not yet investigated
- **Wharfside Seafood and Patio Bar** — Not yet investigated
- **Broadway Bar and Grill** — Not yet investigated
- **Leggetts Sand Bar** (https://www.leggetts.us/calendar) — ❌ Investigated, cannot scrape. Wix site using Boomtech Boom Event Calendar widget (third-party app running in cross-origin iframe). No public API, no iCal export, no Wix Events API access, no event data in page source. Events are entirely locked inside the Boomtech iframe. Address: 217 1st Ave, Manasquan, NJ 08736. Revisit if they switch to a Google Calendar or other accessible platform.
- User may add additional venues not on this list

### Last.fm Artist Enrichment ✅ Implemented
- **Module:** `src/lib/enrichLastfm.js` — fetches artist bio, image, and tags from Last.fm API; caches in `artists` table (7-day TTL); skips Last.fm placeholder images
- **API route:** `src/app/api/enrich-artists/route.js` — POST/GET to run enrichment; processes up to 30 unenriched events per call; updates `image_url` and `artist_bio` on events that are missing them
- **Dry run:** `POST /api/enrich-artists?dry=true` — counts unenriched events without writing anything
- **Required env var:** `LASTFM_API_KEY` — add to Vercel environment variables. Get a free key at https://www.last.fm/api/account/create
- **Auth:** same `SYNC_SECRET` Bearer token as `/api/sync-events`
- **Manual trigger from browser console:**
  ```javascript
  fetch('/api/enrich-artists', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
  ```
- **Run multiple times** to work through all unenriched events (30 per call limit keeps it within Vercel's timeout)
- **Supabase SQL required** (see Schema Notes section above)

---

## Supabase Schema Notes
- **Table:** `events`
- **Key fields:** `artist_name`, `venue_name`, `venue_id`, `event_date` (ISO string), `ticket_link`, `cover`, `source`, `image_url`, `external_id`, `status`, `verified_at`
- **`image_url`** — added March 2026. Populated by scrapers that have images (Ticketmaster, Martells) and/or by `/api/enrich-artists` via Last.fm.
- **Upsert conflict key:** `external_id`
- **Venue names with apostrophes** need SQL escaping: use `''` (double single-quote) in raw SQL

### SQL Migrations (run once in Supabase SQL editor)
```sql
-- Add image_url to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create artists cache table for Last.fm enrichment
CREATE TABLE IF NOT EXISTS artists (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT UNIQUE NOT NULL,
  image_url    TEXT,
  bio          TEXT,
  tags         TEXT,           -- comma-separated genre tags from Last.fm
  last_fetched TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

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
