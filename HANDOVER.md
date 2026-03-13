# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~1200+ events** across 31 scrapers (as of March 12, 2026)

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
| 5 | McCann's Tavern | `mccanns.js` | Google Calendar iCal | ✅ Working (calendar ID fixed — was missing 's' in `jacksbythetracksnj`) | ~15+ |
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
| 21 | Bakes Brewing | `bakesBrewing.js` | Webflow CMS HTML | ✅ Working | ~12 |
| 22 | River Rock | `riverRock.js` | WordPress EventPrime AJAX | ✅ Working | ~102 |
| 23 | Wild Air Beerworks | `wildAir.js` | Square Online (HTML + API) | ✅ Working | ~12 |
| 24 | Asbury Park Brewery | `asburyParkBrewery.js` | Squarespace JSON | ✅ Working | ~54 |
| 25 | Boatyard 401 | `boatyard401.js` | WordPress Simple Calendar (AJAX) | ✅ Working | ~40+ |
| 26 | Tim McLoone's Supper Club | _(removed)_ | Ticketbud HTML | ❌ Blocked — all McLoone's domains behind Cloudflare+reCAPTCHA, blocks all datacenter IPs. Scraper removed. | 0 |
| 27 | Windward Tavern | `windwardTavern.js` | Google Calendar iCal | ✅ Working | ~15+ |
| 28 | Jamian's Food & Drink | `jamians.js` | Squarespace HTML (plain-text schedule) | ✅ Working | ~30+ |
| 29 | The Cabin | `theCabin.js` | Squarespace GetItemsByMonth API | ✅ Working | ~13+ |
| 30 | The Vogel | `theVogel.js` | WordPress HTML (custom event post type) | ✅ Working | ~51 |
| 31 | Sun Harbor Seafood and Grill | `sunHarbor.js` | Squarespace JSON API | ✅ Working | ~19 |

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

### Bakes Brewing (`bakesBrewing.js`)
- **URL:** https://www.bakesbrewing.co/events
- **Platform:** Webflow CMS (dynamic list items with `role="listitem"`)
- **Approach:** Fetches the HTML page, splits on `role="listitem"` boundaries, extracts title (`.heading-11`), date (`.text-block-12`), time (`.start-time`), price (`.text-block-14`), image (`img`), and slug (`a.link-block`)
- **Filtering:** Only includes events with titles starting "LIVE MUSIC" or "COMEDY SHOW" — strips the prefix to get the artist name
- **Address:** 57 Main St, Belmar, NJ 07719

### River Rock (`riverRock.js`)
- **URL:** https://riverrockbricknj.com/events/
- **Platform:** WordPress + Elementor + EventPrime plugin
- **Approach:** AJAX POST to `admin-ajax.php` with `action=ep_get_calendar_event` — fetches current + next 2 months. Unlike Brielle House (same plugin), River Rock's EventPrime does NOT validate nonces, so server-side AJAX works
- **Detail pages:** Fetches each event's detail page (`/events/?event={id}`) in parallel batches of 5 to extract descriptions from `#ep_single_event_description`
- **Filtering:** None — includes all event types (music, trivia, specials, etc.) per user request
- **Address:** 1600 NJ-70, Brick Township, NJ 08724

### Asbury Park Brewery (`asburyParkBrewery.js`)
- **URL:** https://www.asburyparkbrewery.com/events
- **Platform:** Squarespace — uses `?format=json` on the `/events` collection
- **Approach:** Same pattern as Marina Grille, Anchor Tavern, R Bar. Events are in the `upcoming` array (not `items`). Dates are epoch milliseconds in `startDate`, converted to Eastern time.
- **Address:** 810 Sewall Ave, Asbury Park, NJ 07712
- **Note:** ~54 upcoming events. Title field contains HTML entities (`&amp;` etc.) — scraper decodes them.

### Boatyard 401 (`boatyard401.js`)
- **URL:** https://boatyard401.com/events/
- **Platform:** WordPress + Simple Calendar plugin (simcal) wrapping a Google Calendar
- **Approach:** Two-step:
  1. Fetches the `/events/` HTML page to get current month's events + the AJAX nonce
  2. Uses AJAX POST to `admin-ajax.php` with action `simcal_default_calendar_draw_grid` to fetch next 2 months
- **Calendar ID:** 66 (from `data-calendar-id` attribute on `.simcal-calendar` element)
- **Parsing:** Extracts from `.simcal-event-details.simcal-tooltip-content` divs: title, start-date, start-time, description
- **Address:** 401 South Main St, Manasquan, NJ 08736
- **Note:** The nonce is publicly available in the page source (`simcal_default_calendar` JS variable). Includes all events (music, DJs, specials). ~39 events per month.

### Tim McLoone's Supper Club — ❌ BLOCKED (scraper removed)
- **URL:** https://www.timmcloonessupperclub.com/events.php
- **Alternate source tried:** https://mcloones.ticketbud.com (Ticketbud organizer page)
- **Platform:** Custom PHP site behind Cloudflare + reCAPTCHA
- **Problem:** All McLoone's domains (`timmcloonessupperclub.com`, `mcloones.ticketbud.com`, `mcloones.com`) are behind Cloudflare with aggressive bot detection that blocks all datacenter IPs. Tried: browser-like headers, Vercel Edge Runtime proxy (runs on Cloudflare's own network), and Ticketbud as alternate source — all return HTTP 403.
- **Ticketbud page structure (for future reference):** Server-rendered HTML with `.card.vertical` containers, `.event-title` (H6), `.date`, `.time` classes, images from S3 (`s3.amazonaws.com/attachments.ticketbud.com`), pagination via `?page=N`
- **Other sources checked:** Bandsintown (no events listed), Facebook (requires auth), parent McLoone's site (also Cloudflare)
- **Address:** 1200 Ocean Ave, Asbury Park, NJ 07712
- **To revisit:** Check if venue gets listed on Ticketmaster or Bandsintown, or if Ticketbud opens a public API. A headless browser (Puppeteer/Playwright) running outside Vercel could also work.

### Windward Tavern (`windwardTavern.js`)
- **URL:** https://www.windwardtavern.com/music-events
- **Platform:** Google Calendar embed on venue website
- **Approach:** Google Calendar iCal feed (same pattern as St. Stephen's Green, Idle Hour, etc.)
- **Calendar ID:** `windwardtavern@gmail.com`
- **Address:** Brick, NJ
- **Note:** Music on Fri/Sat, food specials on Mondays

### Jamian's Food & Drink (`jamians.js`)
- **URL:** https://www.jamiansfood.com/music
- **Platform:** Squarespace — manually typed plain-text schedule (NOT a Squarespace events collection)
- **Approach:** Fetches HTML page directly and parses schedule text from Squarespace layout blocks (`sqs-block-content` divs). The `?format=json` endpoint returns empty `mainContent` because the schedule lives in layout blocks, not structured event data.
- **Schedule format:** Month headers ("February", "March") followed by "dayNumber ArtistName" lines (e.g., "5 Skinny Amigo", "6 Black Dog")
- **Recurring weekly events:** Pat Guadagno Mondays 7pm, Trivia Tuesdays 7:30pm, Karaoke Wednesdays 8pm, Open Mic Sundays 8pm — generated for next 8 weeks
- **Start time rules:** Thu 8pm, Fri & Sat 9pm (per venue page note "Music starts Thurs 8pm Fri & Sat 9pm")
- **Address:** 79 Monmouth Street, Red Bank, NJ 07701
- **Note:** If recurring events duplicate monthly listings on the same date, the monthly listing takes priority (dedup by external_id)

### The Cabin Restaurant (`theCabin.js`)
- **URL:** https://www.thecabinnj.com/music
- **Platform:** Squarespace — events displayed via Summary Block on /music page, backed by a hidden events collection
- **Approach:** The `/music?format=json` endpoint returns type "page" (not "events") with no items. The events collection is referenced by the Summary Block's `data-block-json` attribute containing `collectionId: "6504675f2416e6466afd5e87"`. Uses Squarespace's open API: `/api/open/GetItemsByMonth?collectionId={id}&month={M-YYYY}`
- **Collection ID:** `6504675f2416e6466afd5e87` (from Summary Block `data-block-json`)
- **Schedule:** Thursdays 6-9pm, Fridays & Saturdays 8:30-11:30pm
- **Address:** 839 NJ-71, Spring Lake Heights, NJ 07762
- **Note:** If collection ID changes, inspect the `summary-v2-block` element on the /music page and check `data-block-json` for the new ID

### The Vogel — Count Basie Center (`theVogel.js`)
- **URL:** https://thebasie.org/venue/the-vogel/
- **Platform:** WordPress with custom event post type — no REST API for events (404 on `/wp-json/wp/v2/events`)
- **Approach:** Fetches venue page HTML, parses `<article class="event">` cards. Each card contains date/time text, title, ticket link, and image — all on one page (no pagination).
- **Date/time text formats:**
  - `"MARCH 12 • 7:30PM"` (month day • time)
  - `"FRI • MARCH 13 • 8PM"` (day-of-week • month day • time)
  - `"NEW DATE! FRI OCT 23 • 8PM"` (prefix note + day-of-week + month day • time)
- **Year logic:** If month < current month, assumes next year
- **Address:** 99 Monmouth St, Red Bank, NJ 07701
- **Note:** ~51 events on one page. If pagination is added in the future, scraper will need updating.

### Sun Harbor Seafood and Grill (`sunHarbor.js`)
- **URL:** https://www.sunharborseafoodandgrill.com/events
- **Platform:** Squarespace — uses built-in JSON API (`/events?format=json`)
- **Approach:** Fetches Squarespace JSON endpoint. Each item has `title`, `startDate` (epoch ms), `endDate`, `urlId`, `id`, `assetUrl`, `excerpt`. Filters to future events only.
- **Collection:** `events` (visible in event link paths: `/events/{slug}`)
- **Address:** 1 Channel Dr, Monmouth Beach, NJ 07750
- **Note:** Same pattern as Anchor Tavern scraper. ~19 upcoming events typically. If JSON API stops working, check if collection name changed.

### Wild Air Beerworks (`wildAir.js`)
- **URL:** https://www.wildairbeer.com/upcoming-events
- **Platform:** Square Online (events stored as "products" with product_type=event)
- **Approach:** Two-step process:
  1. Fetches the HTML page and extracts `featuredEventIds` array from the inline `__BOOTSTRAP_STATE__` object (the 12 event IDs the page is configured to display)
  2. Fetches each event's details individually via Square Online Store API (`/products/{id}`) in batches of 5
- **Why not paginated API?** The Store API's `product_type=event` query param does NOT actually filter — it returns ALL product types (food, merchandise, events) mixed across 7 pages. Using `featuredEventIds` ensures we get exactly the events shown on the page.
- **API endpoint:** `cdn5.editmysite.com/app/store/api/v28/editor/users/131268749/sites/275806222903239352/products/{id}`
- **Address:** 801 2nd Ave, Asbury Park, NJ 07712
- **Note:** If the API domain (`cdn5.editmysite.com`) is blocked from the hosting environment, the HTML page fetch (step 1) still works — the issue would only be in step 2's individual product fetches.

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
- **Heights 27** (https://www.heights27.com/calendar) — ❌ Investigated, cannot scrape. Wix site using native Wix Events TPA (third-party app). Events render entirely client-side inside an iframe — no SSR data, no public API, no iCal feed, no JSON-LD, no individual event pages, no sitemap entries. Tried: `_api/events-server/v1/events` (403 — needs instance auth), `_api/wix-one-events-server/html/v2/events` (404), Wix Data collections (404). Facebook page has no upcoming events. Address: 2407 NJ-71, Spring Lake Heights, NJ 07762. Revisit if they add a Google Calendar embed or if Wix opens a public events API.
- **Boathouse Belmar** (https://www.boathousebelmar.com/events) — ❌ Investigated, cannot scrape. Wix site using MarketPush Google Calendar Embed app. Calendar is embedded via a custom HTML iframe (`filesusr.com`) that receives the Google Calendar URL via Wix's internal `postMessage` — the calendar ID is never exposed in page source or network requests. No public API, no iCal feed. Events are posted weekly as image posters on Instagram (@boathousebelmarnj). Address: 1309 Main Street, Belmar, NJ 07719. Revisit if they add a direct Google Calendar link or switch to a public calendar.
- **Woody's Roadside Tavern** (https://www.woodysroadside.com/events/) — ❌ Investigated, cannot scrape. Events page just has a "Click Here for Upcoming Events" link that leads to an image poster flyer — no structured event data, no calendar widget, no API. Events are only published as image flyers. Address: 105 Academy St, Farmingdale, NJ 07727. Revisit if they add a proper calendar or event listing.
- **Driftwood Tiki Bar** (https://driftwoodtikibar.com/calender/) — ❌ Investigated, cannot scrape. Events posted as image posters only — no structured event data. Address: Seaside Park, NJ. Revisit if they add a proper calendar or event listing.
- User may add additional venues not on this list

### User Favorites & Notifications (planned)
- **Goal:** Let users save favorite artists and venues. Filter events by favorites. Push notifications when a favorited artist is added to an event.
- **Auth:** Supabase Auth (Google sign-in and/or email magic links) — gives `user.id` UUID as foreign key
- **New tables:**
  ```sql
  CREATE TABLE user_favorite_artists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    artist_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, artist_name)
  );

  CREATE TABLE user_favorite_venues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, venue_id)
  );
  ```
- **Artist favorites:** Keyed on `artist_name` (text) not a separate ID, because scraper artist names aren't normalized enough. Matching via `ILIKE` on sync.
- **Venue filtering:** Frontend toggle "Show favorites only" — filters client-side or passes venue IDs as query params to Supabase query.
- **Notifications:** Add a step at end of existing sync cron — after upserting events, query for newly inserted events, check if any match a user's favorited artists/venues, send web-push notification via existing PWA setup (`notifications.js`).
- **UX for adding favorites:** Heart icon on event cards saves that event's `artist_name`. Manual artist search can be added later.

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

## Venue Investigation Playbook — Step-by-Step

When the user provides a new venue URL, follow this investigation workflow to determine the best scraping approach. Every site is different, so work through these steps in order.

### Step 1: Identify the Platform

Visit the venue URL and determine what platform the site is built on. Check these in order:

1. **`<meta name="generator">`** — reveals WordPress, Wix, Squarespace, etc.
2. **Page source clues:**
   - `wp-content` or `wp-json` → WordPress
   - `squarespace-cdn` or `sqs-block` → Squarespace
   - `wix.com` or `X-Wix` in source → Wix
   - `getbento.com` in JSON-LD or images → BentoBox
   - `static.framer.com` or Framer attributes → Framer
3. **Check for iframes** — Google Calendar embeds, Boomtech widgets, Eventbrite, etc.
4. **Check for JSON-LD** — `<script type="application/ld+json">` may contain `@type: Event` data

### Step 2: Try the Easy Wins First (platform-specific)

**If Squarespace:**
- Append `?format=json` to the events/schedule page URL
- Check for `items` array with `startDate`, `title`, `urlId`
- Also try `/events?format=json` if the main page doesn't have events
- This is the fastest scraper type — see "Squarespace Scraper Pattern" below
- Working examples: Marina Grille, Anchor Tavern, R Bar

**If Google Calendar embed found (iframe with `calendar.google.com`):**
- Extract the calendar ID from the iframe `src` parameter (look for `src=` query param)
- The calendar ID may be base64-encoded (decode it)
- Build iCal feed URL: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`
- Test the iCal URL to make sure the calendar is public (if 404, calendar is private)
- Use the standard iCal parser pattern with `easternOffset()`, `parseIcalDate()`, `parseIcal()`
- IMPORTANT: Include date in external_id for recurring events: `venuename-${dateStr}-${uidClean}`
- Working examples: St. Stephen's Green, Jacks on the Tracks, Reef & Barrel, Idle Hour
- Failed example: McCann's (private calendar — returns 404 on iCal URL)

**If WordPress:**
- Try `/wp-json/wp/v2/posts?per_page=50` or `/wp-json/wp/v2/events?per_page=50` for REST API
- Check for calendar plugins: EventPrime, The Events Calendar, JetEngine, Modern Events Calendar
- Look for `admin-ajax.php` calls in network tab — these often load calendar data
- WARNING: WordPress nonces tied to session cookies may block AJAX calls server-side (see Brielle House)
- Working examples: ParkStage (plain HTML), 10th Ave Burrito (JetEngine AJAX), River Rock (EventPrime AJAX — no nonce required)
- Failed example: Brielle House (EventPrime nonce blocked)
- NOTE: EventPrime nonce enforcement varies by site — River Rock works without nonce while Brielle House blocks it. Always test the AJAX call without nonce first.

**If Wix:**
- Check if they use native Wix Events or a third-party app (Boomtech, etc.)
- Look for Google Calendar embeds inside iframes — Wix sites often embed them
- If Boomtech calendar: currently NOT scrapeable (cross-origin iframe, no public API, no iCal export)
- Working example: Idle Hour (Wix site but uses Google Calendar embed)
- Failed example: Leggetts Sand Bar (Boomtech widget, completely locked down)

**If BentoBox (getbento.com):**
- No JSON API available
- Parse the listing page HTML for event card elements (`.card__heading`, `.card__btn`)
- Event titles often contain dates embedded in them (e.g., "CKY | 03.15.2026")
- Fetch each detail page for time/description from JSON-LD `@type: Event`
- Working example: Asbury Lanes

**If Ticketmaster venue:**
- Use the Ticketmaster Discovery API with the venue ID
- Find venue ID: search `https://app.ticketmaster.com/discovery/v2/venues.json?keyword=VENUE_NAME&apikey=KEY`
- Add the venue ID to the `VENUES` array in `ticketmaster.js`
- Requires `TICKETMASTER_API_KEY` env var (already set on Vercel)
- Working examples: Wonder Bar, Stone Pony, ParkStage

### Step 3: Dig Deeper if No Easy Win

If the platform doesn't have an obvious API or feed:

1. **Check network requests** — reload the page with network monitoring active. Look for XHR/Fetch calls to API endpoints that return JSON event data.
2. **Check for hidden APIs** — some sites load calendar data via AJAX POST (like 10th Ave Burrito's JetEngine `jet_engine_calendar_get_month` action). Inspect the XHR request body and headers.
3. **Check social media links** — Facebook Events pages or Google Calendar links in the footer may provide an alternative data source.
4. **Check for Eventbrite/other ticket platforms** — the venue may sell tickets through a platform with a public API.
5. **Inspect the page source** — look for inline JSON data, `window.__PRELOADED_STATE__`, or SSR-rendered event data.

### Step 4: Fallback Options (when automated scraping isn't possible)

If no structured data source can be found:

1. **Image poster only** (like Palmetto) — read the poster image, create a hardcoded `MONTHLY_EVENTS` array. Add a staleness check so it stops returning events after >1 month. Requires manual monthly update.
2. **Skip the venue** — document why it can't be scraped in HANDOVER.md under "Venues to Add" so future sessions don't re-investigate.
3. **Contact the venue** — ask them to make their Google Calendar public or provide an iCal feed.

### Step 5: Build and Wire the Scraper

Once you've determined the approach:

1. Create `src/lib/scrapers/venueName.js` with the appropriate pattern
2. Every event object must include: `title`, `venue` (exact DB name), `date` (YYYY-MM-DD), `time` (12h format), `external_id` (unique, prefixed with venue slug)
3. Optionally include: `ticket_url`, `price`, `description`, `source_url`, `image_url`
4. Wire into `route.js`: import, add to Promise.all destructuring, add to scraperResults, spread into allEvents
5. Provide Supabase SQL: `INSERT INTO venues (name, address, website) VALUES (...);`
6. User pushes to git, runs the INSERT, then triggers a manual sync to verify

### Common Pitfalls

- **DST offset:** Always use `easternOffset()` for iCal dates — never hardcode `-05:00`
- **Duplicate external_ids:** Include date in external_id for recurring events or venues with repeating UIDs
- **HTML entities:** route.js has `decodeHtmlEntities()` that cleans `&amp;`, `&#039;`, etc. in mapEvent()
- **CORS/Cookie blocking:** When investigating via browser, JavaScript execution may get blocked by cookie/session data. Try extracting just parameter names or non-sensitive values separately.
- **Cross-origin iframes:** Cannot access DOM of iframes from different origins (e.g., Boomtech calendar). Must find an alternative data source or API.
- **Stale data:** For hardcoded scrapers, add a month check to auto-disable when data is stale
- **Venue name must match exactly** between scraper output and Supabase `venues.name` — otherwise events won't link to the venue

### Platform Detection Quick Reference

| Clue in Page Source | Platform | Best Approach |
|---|---|---|
| `squarespace-cdn`, `sqs-block` | Squarespace | `?format=json` on collection URL |
| `calendar.google.com` iframe | Google Calendar | iCal feed (`.ics` URL) |
| `wp-content`, `wp-json` | WordPress | REST API or AJAX inspection |
| `wix.com`, `Wix.com Website Builder` | Wix | Check for Google Calendar embed; native Wix Events API may not be accessible |
| `getbento.com` in images/JSON-LD | BentoBox | Parse listing HTML + detail page JSON-LD |
| `static.framer.com` | Framer | Check for embedded Google Calendar or other widgets |
| `calendar.boomte.ch` iframe | Boomtech (Wix app) | ❌ Currently not scrapeable |
| `timely` in scripts | Timely Calendar | Timely API (JSON) — see `martells.js` |
| `ticketmaster.com` links | Ticketmaster | Discovery API with venue ID |
| `editmysite.com`, Square Online store | Square Online | Extract `featuredEventIds` from `__BOOTSTRAP_STATE__` + individual product API calls |
| `simcal-calendar`, Simple Calendar | Simple Calendar (WP) | Parse simcal HTML + AJAX for additional months |
| `w-dyn-item`, Webflow attributes | Webflow CMS | Parse HTML dynamic list items (`role="listitem"`) |
| `ticketbud.com` links or embeds | Ticketbud | Parse organizer page HTML (`.card.vertical`, `.event-title`, `.date`, `.time`). ⚠️ May be behind Cloudflare — test from Vercel first |
| Wix Events TPA iframe (no `src`, title "Events Calendar") | Wix Events | ❌ Currently not scrapeable — events render client-side in iframe, no public API, needs instance auth |
| Image poster only (no structured data) | Any | Hardcoded monthly events array |

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

## Logo Build

### Version History
| Version | File | Format | Notes |
|---|---|---|---|
| v1 (original) | `myLocaljam_Logo_v031126.jpg` | JPG (154K) | Initial logo, project root |
| v2 | `myLocaljam_Logo_v2_031126.textClipping` | textClipping | macOS text clipping (not usable as image) |
| v3 | `myLocaljam_Logo_v3_transparent_031126.png` | PNG (6.0M) | Transparent background version, project root |
| v4 (waveform jar) | `public/myLocaljam_Logo_v4.png` | PNG (5.7M) | Mason jar with rainbow waveform design — used for PWA notifications (icon + badge) |
| v5 | `public/myLocaljam_Logo_v5.png` | PNG (47K) | Optimized/compressed version in public |

### Production Assets (in `public/`)
- **`myLocaljam_Logo.png`** (7.8M) — full-size logo
- **`myLocaljam_Logo_200.png`** (40K) — 200px version, used in site header (jar logo in center nav)
- **`myLocaljam_Logo_104.png`** (13K) — 104px version, used on homepage hero
- **`myLocaljam_Logo_v4.png`** (5.7M) — waveform jar design, used for PWA push notification icon & badge
- **`myLocaljam_Logo_v5.png`** (47K) — latest optimized version

### Where Logos Are Referenced
- **`SiteHeader.js`** — center jar logo uses `myLocaljam_Logo_200.png`; text logo ("myLocalJam") rendered with CSS class `logo-text`
- **`page.js` (homepage)** — hero section uses `myLocaljam_Logo_104.png`
- **`SiteFooter.js`** — text-only logo with `logo-text` CSS class (no image)
- **`notifications.js`** — PWA notifications use `myLocaljam_Logo_v4.png` for both `icon` and `badge`

### Git History Notes
- The waveform jar logo (v4) was added, then reverted, then reapplied, then reverted again across multiple commits (`8feadf0` → `41a88a3` → `48f8be4` → `e1689af`). The final state reverted the homepage redesign but kept the waveform logo files in `public/`.
- Commit `cfe4e6b` (latest) reverted the styled-text logo attempt from `c16507b`.
- **Revert files backup:** `revert-files/public/` contains copies of `myLocaljam_Logo_104.png` and `myLocaljam_Logo_200.png` from before the redesign attempts.

### Notes
- Several logo source files sit in the **project root** (v1 JPG, v2 textClipping, v3 transparent PNG) — these are design assets, not served by the app.
- The full-size logos (v3 at 6MB, v4 at 5.7M, original at 7.8M) are very large for web. The production site uses the pre-sized 104px and 200px versions.
- v5 (47K) appears to be the most optimized version but is not currently referenced in any component.

---

## Repo
GitHub: `https://github.com/antfocus/mylocaljam.git`
Push to main = auto-deploy on Vercel.
User's local path: `~/Documents/mylocaljam`
