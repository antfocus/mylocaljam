# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~1500+ events** across 35 active scrapers (as of March 21, 2026)

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
- **Auto artist enrichment:** After upserting events, the sync route automatically enriches new artists via Last.fm. Finds unenriched events (missing `image_url` or `artist_bio`), looks up to 30 new artists per sync on Last.fm, caches results in the `artists` table, and updates matching events. The sync response includes an `enrichment` field with `artistsLookedUp`, `eventsEnriched`, and any errors. Wrapped in try/catch so enrichment failures don't break the sync.

---

## Scrapers — Status

| # | Venue | File | Type | Status | ~Events |
|---|---|---|---|---|---|
| 1 | Pig & Parrot | `pigAndParrot.js` | Custom API | ✅ Working | ~60 |
| 2 | Ticketmaster | `ticketmaster.js` | Ticketmaster API | ✅ Working | ~120+ |
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
| 20 | Asbury Lanes | `asburyLanes.js` | BentoBox HTML + AJAX pagination | ✅ Working (fixed: browser-like headers + pagination for all events) | ~18+ |
| 21 | Bakes Brewing | `bakesBrewing.js` | Webflow CMS HTML | ✅ Working | ~12 |
| 22 | River Rock | `riverRock.js` | WordPress EventPrime AJAX | ✅ Working | ~102 |
| 23 | Wild Air Beerworks | `wildAir.js` | Square Online (HTML + API) | ✅ Working | ~12 |
| 24 | Asbury Park Brewery | `asburyParkBrewery.js` | Squarespace JSON | ✅ Working | ~54 |
| 25 | Boatyard 401 | `boatyard401.js` | WordPress Simple Calendar (AJAX) | ✅ Working | ~40+ |
| 26 | Tim McLoone's Supper Club | _(removed)_ | Ticketbud HTML | ❌ Blocked — all McLoone's domains behind Cloudflare+reCAPTCHA, blocks all datacenter IPs. Scraper removed. | 0 |
| 27 | Windward Tavern | `windwardTavern.js` | Google Calendar iCal | ✅ Working | ~15+ |
| 28 | Jamian's Food & Drink | `jamians.js` | Squarespace HTML (plain-text schedule) | ✅ Working | ~30+ |
| 29 | The Cabin | `theCabin.js` | Squarespace GetItemsByMonth API | ✅ Working | 10 |
| 30 | The Vogel | `theVogel.js` | WordPress HTML (custom event post type) | ✅ Working | 51 |
| 31 | Sun Harbor Seafood and Grill | `sunHarbor.js` | Squarespace JSON API | ✅ Working | 19 |
| 32 | Bum Rogers Tavern | `bumRogers.js` | HTML parsing (Astro/BentoBox) | ✅ Working | 2 |
| 33 | The Columns | `theColumns.js` | WordPress HTML (custom schedule block) | ✅ Working | 112 |
| 34 | The Roost | `theRoost.js` | HTML plain-text parsing (Beacon CMS) | ✅ Working | ~10+ |
| 35 | Deal Lake Bar + Co. | `dealLakeBar.js` | Squarespace JSON API | ✅ Working | ~23 |
| 36 | The Crab's Claw Inn | `crabsClaw.js` | RestaurantPassion iframe HTML | ✅ Working | ~10+ |
| 37 | Water Street Bar & Grill | `waterStreet.js` | Squarespace JSON API | ✅ Working | ~5 |
| 38 | Crossroads | `crossroads.js` | Eventbrite showmore JSON API | ✅ Working | ~24 |
| ~~39~~ | ~~Algonquin Arts Theatre~~ | ~~`algonquinArts.js`~~ | ~~Custom PHP HTML~~ | ❌ Blocked (403) | — |
| ~~39~~ | ~~Starland Ballroom~~ | ~~`starlandBallroom.js`~~ | ~~AXS/Carbonhouse AJAX~~ | ❌ Blocked (datacenter IP) | — |
| ~~39~~ | ~~House of Independents~~ | ~~`houseOfIndependents.js`~~ | ~~Etix JSON-LD~~ | ❌ Blocked (datacenter IP) | — |

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

### 8. Asbury Lanes scraper — headers + pagination fix
- **Problem 1:** Scraper started returning "FAIL: No event cards found." BentoBox nginx was blocking the default bot User-Agent from Vercel datacenter IPs — returned valid HTML but with no event cards.
- **Fix 1:** Replaced bare UA with full `BROWSER_HEADERS` constant (Chrome 124 UA, Accept, Accept-Language, Accept-Encoding, Cache-Control, Pragma). Also added 3 fallback parsing strategies and single-digit month support (`M.DD.YYYY`).
- **Problem 2:** Sync only captured 10 events when the site had 18+. The "Load More Events" button triggers AJAX pagination.
- **Fix 2:** Added pagination loop — fetches `${LISTING_URL}?p=${page}` with `X-Requested-With: XMLHttpRequest` header (returns HTML fragments). Extracted `parseCardsFromHTML()` helper. Deduplicates by href via `seenHrefs` Set, stops when `newCards.length === 0` or hits `MAX_PAGES=5`.
- **File:** `asburyLanes.js`

### 9. iOS Safari swipe — `overflow-x: hidden` blocks ALL horizontal scroll

> **CRITICAL — read this before building any swipeable/carousel component.**

- **Root cause:** `overflow-x: hidden` on `html` and/or `body` (set in `globals.css` to prevent horizontal page overflow) **blocks ALL horizontal scrolling in every child container** on iOS Safari. This includes native CSS `overflow-x: scroll`, CSS `scroll-snap-type`, and JS carousel libraries (e.g. Embla Carousel). Desktop Chrome/Firefox are unaffected — the bug is iOS Safari only.
- **What does NOT work on iOS Safari when html/body has `overflow-x: hidden`:**
  - `overflow-x: auto` or `overflow-x: scroll` on a child container
  - CSS `scroll-snap-type: x mandatory` with `scroll-snap-align`
  - JS carousel libraries that rely on native scroll (Embla, Swiper in scroll mode, etc.)
  - `overflow: clip` on html/body (breaks vertical page scrolling entirely)
  - `touch-action: pan-x` / `touch-action: manipulation` on the carousel
- **What DOES work:** Custom touch event handlers + CSS `transform: translateX()` on a non-scrolling container.
- **The proven pattern:**
  1. Viewport wrapper: `overflow: hidden` (NOT `auto` or `scroll`)
  2. Track (flex row of slides): moved via `style.transform = translateX(Npx)`
  3. Raw `addEventListener` on the viewport for `touchstart`, `touchmove` (with `{ passive: false }`), `touchend`, `touchcancel`
  4. Direction locking: after 5px of movement, lock to horizontal (`x`) or vertical (`y`). If vertical, abort swipe and let page scroll normally. If horizontal, call `e.preventDefault()` + `e.stopPropagation()` and update `translateX`.
  5. On `touchend`: if drag > 50px threshold, snap to next/prev slide; otherwise snap back.
  6. Smooth snap: `transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)'` on the track during snap, `transition: 'none'` during active drag.

- **DO NOT change `overflow-x: hidden` on html/body in `globals.css`.** It prevents the page from having horizontal scroll on all browsers. The custom touch handler approach works around it.

- **Auto-rotate with pause/resume pattern:**
  - `setInterval` every 5000ms advances to next slide (loops at end)
  - `clearInterval` on `touchstart` / `mousedown` (pause immediately)
  - `setTimeout` 2000ms after `touchend` / `mouseup` to restart the interval
  - Use a `useRef` mirror of the active slide index (`activeRef`) so the `setInterval` callback always has the latest value (avoids stale closure from `useState`)

- **Reference implementation:** `src/components/HeroSection.js` — the "Tonight's Spotlight" hero carousel with swipe + auto-rotate.
- **Unused file:** `src/components/SpotlightCarousel.js` — an older separate carousel; still on disk but no longer imported in `page.js`. Contains the same touch handler pattern.

### 9. Admin PUT route — silent failure from unknown DB columns
- **Problem:** The admin API PUT handler used `const { id, ...updates } = body` to pass all form fields to Supabase. The admin form includes `event_time` (a UI-only field not in the database schema), causing Supabase PostgREST to reject the entire UPDATE silently. This meant `is_spotlight` and other changes never saved when editing events.
- **Fix:** Rewrote PUT handler to explicitly pick only known database columns using conditional spread:
  ```javascript
  const updates = {
    ...(body.artist_name !== undefined && { artist_name: body.artist_name }),
    ...(body.is_spotlight !== undefined && { is_spotlight: body.is_spotlight }),
    // ... (only known DB columns)
    verified_at: new Date().toISOString(),
  };
  ```
- **Rule:** When adding new fields to the admin form, always update the PUT handler's allowlist in `src/app/api/admin/route.js` to include the new column. Never spread the entire request body into Supabase.

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
- **Platform:** BentoBox (getbento.com) — nginx-served HTML, no API available
- **Approach:** Parses listing page HTML with 3 fallback strategies (`.card__btn` + `.card__heading`, separate heading+href matching, aria-label attributes). Dates in `M.DD.YYYY` or `MM.DD.YYYY` format. Extracts images from `background-image` styles on `.card__image` divs.
- **Pagination:** BentoBox AJAX pagination — fetches `?p=2`, `?p=3`, etc. with `X-Requested-With: XMLHttpRequest` header. Returns HTML fragments. Deduplicates by href, stops when all cards are dupes or hits MAX_PAGES=5.
- **Headers:** Requires full browser-like headers (`BROWSER_HEADERS` constant) — BentoBox nginx blocks bare bot User-Agents from Vercel datacenter IPs.
- **Fallback time:** 8:00 PM if no door time found
- **Address:** 209 4th Ave, Asbury Park, NJ 07712
- **Note:** Concert venue + bowling alley. Events include concerts, music bingo, and special events.
- **Fix history:** (1) Mar 2026 — replaced bot UA with browser-like headers, added single-digit month support, image extraction, aria-label fallback parsing. (2) Added AJAX pagination to capture all events (was only getting first page of ~10, site had 18+).

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

### Bum Rogers Tavern (`bumRogers.js`)
- **URL:** https://bumrogerstavern.com/events
- **Platform:** Astro-based site (BentoBox/Mercury restaurant platform) — static HTML
- **Approach:** Fetches HTML page, parses `<a class="event-card">` elements. Each card has `<h3>` for title and `<p>` for date/time text. Links have individual event URLs.
- **Date format:** "Tuesday, March 17, 2026 7-10 PM, repeats"
- **Address:** 80 Shrewsbury Ave, Highlands, NJ 07732
- **Note:** Currently only ~2 recurring events. Scraper will pick up new events as they're added to the page.

### The Columns (`theColumns.js`)
- **URL:** https://thecolumnsnj.com/entertainment-schedule/
- **Platform:** WordPress with custom `entertainment_schedule_block` section
- **Approach:** Fetches HTML page, extracts the `entertainment_schedule_block` section, then parses `<h5>` (title) + `<span class="bold-weight">` (date/time) pairs.
- **Date format:** "May 1, 2026 8:00 pm"
- **Address:** 601 Ocean Ave, Avon-by-the-Sea, NJ 07717
- **Note:** Huge schedule — ~112 events from May through September (summer season). No individual event pages, all events link back to the schedule page.

### The Roost (`theRoost.js`)
- **URL:** https://theroostrestaurant.com/events
- **Platform:** Custom CMS (Beacon/CoreGolf)
- **Approach:** Fetches HTML page, finds the `<p>` containing month headers (FEBRUARY, MARCH, etc.), splits by `<br>` tags, then parses `M/D Performer Name` lines under each month header.
- **Date format:** "3/6 Sean Cox" (month/day performer)
- **Default time:** 9:00 PM (Friday & Saturday live music per page header)
- **Address:** Cream Ridge, NJ
- **Note:** Also has recurring weekly acts (Wednesday Joe Vadala, Thursday DC DUO) but these are not scraped as they lack specific dates. The page lists ~2 months of Friday/Saturday performers.

### Deal Lake Bar + Co. (`dealLakeBar.js`)
- **URL:** https://www.deallakebarco.com/music-events
- **Platform:** Squarespace (JSON API)
- **Approach:** Same pattern as Anchor Tavern / Sun Harbor — fetches `/music-events?format=json`, parses the `upcoming` array with `title`, `startDate` (epoch ms), `endDate`, `urlId`, `id`, `assetUrl`, `excerpt`.
- **Address:** 601 Main Street, Loch Arbour, NJ
- **Note:** Mix of live music (Charlie Brown, Quincy Mumford, Kevin Hill, etc.), trivia nights, and special events (March Madness). ~23 upcoming events.

### The Crab's Claw Inn (`crabsClaw.js`)
- **URL:** https://thecrabsclaw.com/events-calendar/
- **Data source:** RestaurantPassion iframe (`https://www.restaurantpassion.com/ext-page/13/332/27093/`)
- **Platform:** Custom CMS with embedded RestaurantPassion calendar widget
- **Approach:** Fetches the iframe URL directly, extracts `.custom_page_body`, splits into `<p>` blocks (one per day). First line of each block is the date, subsequent lines are events. Filters out non-music events (Bingo, Karaoke, Texas Hold'em, Trivia).
- **Date format:** Very inconsistent — "Fri., Mar., 20", "Sun.,Mar . 1", "Sat.,Mar., 14", etc. Uses loose regex to handle variants.
- **Address:** Lavallette, NJ
- **Note:** Schedule is typically one month at a time. Non-music events are filtered by a skip list. Time is extracted from inline ranges like "4-7" or "8-12".

### Water Street Bar & Grill (`waterStreet.js`)
- **URL:** https://www.waterstreetnj.com/music (display page), https://www.waterstreetnj.com/schedule (events collection)
- **Platform:** Squarespace (JSON API)
- **Approach:** Same pattern as other Squarespace scrapers — fetches `/schedule?format=json`, parses the `upcoming` array. Note: the `/music` page is a layout page that embeds the `/schedule` collection, so the JSON API must target `/schedule`, not `/music`.
- **Address:** Tom's River, NJ
- **Note:** Friday & Saturday live music, 8:30pm–12:30am. ~5 upcoming events. Also has Bingo nights.

### Crossroads (`crossroads.js`) — UPGRADED to Eventbrite showmore API
- **URL:** https://www.xxroads.com/calendar (venue site), https://www.eventbrite.com/o/crossroads-18337279677 (data source)
- **Platform:** Wix (venue site is image posters only) — scrapes Eventbrite organizer page instead
- **Previous approach (replaced):** Eventbrite JSON-LD (`<script type="application/ld+json">`) — only returned the first ~12 of 24 events because JSON-LD contains only the first page of results.
- **Current approach:** Eventbrite showmore JSON API (`/org/{orgId}/showmore/?type=future&page_size=50&page=1`). Returns ALL future events as JSON with `data.events[]` containing `name.text`, `start.local`, `start.formatted_time`, `url`, `logo.url`, `summary`, `is_free`, `price_range`, `id`.
- **Organizer ID:** `18337279677` (from the Eventbrite organizer URL)
- **Address:** 78 North Ave, Garwood, NJ 07027
- **Note:** Active music venue with ~24 upcoming events. Tickets sold via Eventbrite with prices. Events include live bands, tribute acts, comedy shows, and festivals.
- **Discovery story:** JSON-LD was missing half the events. Investigated `window.__SERVER_DATA__` which showed `num_future_events: 24` but only `futureCount: 12` loaded. The "Show more" button on the Eventbrite page triggers the `/org/{id}/showmore/` API endpoint. See "Eventbrite Organizer Pages" in the platform detection reference below.

### Starland Ballroom — ❌ BLOCKED
- **URL:** https://www.starlandballroom.com/events/all
- **Platform:** AEG/Carbonhouse platform, ticketed by AXS
- **Status:** Main page is a JS shell; events load via AJAX at `/events/events_ajax/{offset}`. Both the main page and AJAX endpoint block datacenter IPs (Vercel) — returns 0 events with no error. Full browser headers and X-Requested-With did not help.
- **Scraper file:** `starlandBallroom.js` kept for reference — can be re-enabled if a proxy workaround is found.
- **Address:** 570 Jernee Mill Rd, Sayreville, NJ 08872

### Algonquin Arts Theatre — ❌ BLOCKED
- **URL:** https://www.algonquinarts.org/calendar.php?s=14
- **Platform:** Custom PHP site
- **Status:** Returns HTTP 403 from Vercel datacenter IPs. Full browser-like headers (Sec-Fetch-*, Referer, Connection) did not help. Site blocks server-side requests entirely.
- **Scraper file:** `algonquinArts.js` kept for reference — can be re-enabled if a proxy workaround is found.
- **Address:** 173 Main St, Manasquan, NJ 08736

### House of Independents — ❌ BLOCKED
- **URL:** https://www.etix.com/ticket/v/33546/calendars
- **Platform:** Etix (React SPA with server-rendered JSON-LD)
- **Status:** Etix serves a bare React app shell (~2KB, no title, no JSON-LD) to Vercel datacenter IPs. From residential IPs, the same URL returns ~44KB with 2 JSON-LD blocks including an array of 20 Event objects. The Etix search API (`POST /ticket/api/online/search`) was also investigated but returns encrypted/encoded data that can't be decoded server-side.
- **What works from residential IP:** JSON-LD extraction — 20 upcoming events with name, image, ticket URL, startDate ("Sat Mar 21 17:30:00 EDT 2026" format), and offers (price in USD). Venue ID is 33546.
- **Scraper file:** `houseOfIndependents.js` kept for reference — fully functional from non-datacenter IPs, can be re-enabled if a proxy workaround is found.
- **Address:** 572 Cookman Avenue, Asbury Park, NJ 07712

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

## Dev Redesign — Search, Filter & "Saved" Ecosystem

### Overview
A standalone prototype for the redesigned search, filter, and saved-events experience. Built as a separate component at `/redesign` to iterate without touching the production UI. Mobile-first (480px max-width), dark/light mode, inline styles following the project's existing pattern (no Tailwind/CSS modules).

**File:** `src/components/SearchFilterRedesign.js` (~1290 lines)
**Route:** `src/app/redesign/page.js` — standalone page that renders the prototype
**URL:** `localhost:3000/redesign` (dev) or `mylocaljam.com/redesign` (if deployed)

### Architecture

- **Single-file component** with `'use client'` directive
- **Theme system:** `DARK` and `LIGHT` theme objects with color tokens (`bg`, `surface`, `text`, `textMuted`, `accent` `#E8722A`, `accentAlt` `#3AADA0`, `purple` `#a78bfa`, `border`)
- **Lifted state pattern:** All filter state lives in the parent `SearchFilterRedesign` component and is passed down to child components (`UnifiedSearchBlock`, `FilterSummary`, `EventCard`, etc.)
- **Mock data:** 8 sample events across 5 venues for prototype testing
- **Google Material Design icons:** All icons are inline SVG paths from Material Design (search, tune, close, location_on, event, music_note, person, home, favorite, add) — no emoji used anywhere

### Components

| Component | Purpose |
|---|---|
| `SearchFilterRedesign` | Parent container — holds all state, renders hero, filter summary, event list, bottom nav |
| `UnifiedSearchBlock` | The omnibar search/filter pill + expandable filter panel with Where/When/Venue/Artist sections |
| `FilterSummary` | **Removed** — was a compact bar below hero; now redundant since the omnibar shows active filter pills inline. "Clear all" lives inside the expanded filter panel instead. |
| `EventCard` | Individual event row with time badge, venue icon, title, venue name, save heart |
| `MaterialIcon` | Helper that renders location/calendar/venue/artist SVG icons by name |

### Filter System

**Filter state object:**
```javascript
{
  radius: 15,              // miles (default 15)
  dateFilter: 'all',       // 'all' | 'today' | 'tomorrow' | 'weekend' | 'pick'
  pickedDate: '',           // YYYY-MM-DD when dateFilter === 'pick'
  showDatePicker: false,
  selectedVenues: [],       // array of venue name strings
  selectedArtists: [],      // array of artist name strings
}
```

**Active filter detection:**
```javascript
const hasActiveFilters = filters.radius !== 15 || filters.dateFilter !== 'all' || filters.selectedVenues.length > 0 || filters.selectedArtists.length > 0;
```

**Dynamic event count:** Uses `useMemo` to filter `MOCK_EVENTS` by date, selected venues, and selected artists. The count updates live as filters change.

**Individual filter clearing:** `clearSingleFilter(filterKey)` switch/case function handles resetting radius, date, venues, or artists independently. Each filter chip in `FilterSummary` has an × button that calls this.

**Clear all:** `clearAllFilters()` resets the entire filter state object to defaults and collapses the filter panel.

### Search Bar (Omnibar) Behavior — "Glow & Badge" Approach

The search bar is a clickable pill that toggles the filter panel open/closed. Uses the brand's secondary **Teal/Mint** (`#3AADA0`) color for the active/filtered state — intentionally avoiding primary Orange to prevent visual competition with the `+` FAB and "Featured" tags. It has three visual states:

1. **Default (no filters):** Dark background (`#1E1E2A`), muted grey text "Search / Filters", muted search and tune icons, subtle dark border
2. **Filters active, panel closed ("Glow & Badge"):**
   - Container border changes to solid 1px Teal
   - Subtle low-opacity Teal `box-shadow` outer glow
   - Search icon turns Teal
   - "Search / Filters" text remains visible (never overwritten — preserves search context)
   - Active filter pills appear inline after the text, each with a small Teal Material Design icon + abbreviated label (e.g., calendar + "Today", music note + "1", person + "2")
   - Right side shows a solid Teal badge pill with tune icon + active filter count (e.g., "2")
   - Layout example: `[ Search / Filters | calendar Today  music 1 | badge 2 ]`
3. **Panel expanded:** Teal border + glow, Teal "Search / Filters" text, close × icon in Teal replaces tune icon, filter pills hidden

**UX Rules:**
- Rule 1: Never overwrite the user's search text — filter indicators are additive
- Rule 2: The moment all filters are cleared/reverted to defaults, the Teal border/glow disappears and the bar returns to its inactive dark grey state

### Filter Panel (Expandable)

Opens below the omnibar with a spring-like CSS transition (`max-height` + `opacity` with cubic-bezier curves). Contains four collapsible sections:

- **WHERE:** Location display + radius slider (5–50 miles)
- **WHEN:** Date filter chips (All Upcoming, Today, Tomorrow, This Weekend, Pick a Date) with optional date picker
- **VENUE:** Searchable venue list with checkboxes, event counts per venue, "Clear" link
- **ARTIST:** Searchable artist list with checkboxes, event counts per artist, "Clear" link

Each section has a colored icon (green location, orange calendar, purple venue, teal artist) and expands/collapses independently with the `activeCard` state.

**"Show N events" button** at the bottom closes the panel and shows the filtered count.

### Filter Summary Bar — Removed

Previously a compact row between hero and event list showing event count, teal filter chips, and "Clear all" link. **Removed** to maximize vertical screen real estate — the omnibar's inline filter pills and badge now serve the same purpose. The "Clear all" button remains prominently accessible inside the expanded filter panel (bottom-left, next to "Show N events").

### Bottom Navigation

Three-tab bottom nav bar with Material Design SVG icons: Home (house), Saved (heart), Profile (person). Home tab highlighted in orange accent by default.

### Theme Toggle

Small button in the top bar (next to the omnibar) toggles between dark and light mode. All colors reference the `t` theme object so the entire UI switches instantly.

### Key Design Decisions

- **Color hierarchy:** Primary Orange (`#E8722A`) reserved for CTAs, FAB, featured tags, and event time badges. Secondary Teal/Mint (`#3AADA0`) used for active/filtered states on the omnibar and filter chips — avoids visual competition with primary actions.
- **No emojis anywhere:** All icons use Google Material Design inline SVG paths (search, tune, close, location, calendar, music_note, person, home, heart, add, sun, moon).
- **Inline styles over CSS:** Matches the existing project pattern. All styles are computed from the theme object `t` using ternary expressions for dark/light mode.
- **Container Transform animation:** The filter panel uses CSS `max-height` transitions (0 → 600px) with spring-like `cubic-bezier(0.32, 0.72, 0, 1)` timing for a Material Design feel.
- **Mobile-first 480px container:** Centered with `margin: '0 auto'` — designed for phone screens first.
- **Font:** DM Sans throughout, loaded via Google Fonts link in the head.

### Phase 1 — Production Integration (Shipped)

The following elements from the redesign prototype have been integrated into the production `src/app/page.js`:

**What shipped:**
- **Header Omnibar:** Replaced the old emoji search input + `FilterBar` component with the unified Glow & Badge omnibar pill. Teal active state, inline filter pills (distance, date, artist, venue), badge count — all wired to production state (`dateKey`, `activeVenues`, `milesRadius`, `searchQuery`, `artistSearch`).
- **Expandable filter panel:** Morphs open from the header with spring animation. Card order follows broad-to-specific funnel: **Distance/Location → When → Artist → Venue**. "Clear all" and "Show N events" buttons at the bottom.
- **Distance/Location card:** Combined location + distance into one card. Compact 2-row layout: origin input on top (defaults to device geolocation via browser API, reverse-geocoded to town name via Nominatim; user can override with zip/city), distance slider below with "5 mi" / "50 mi" bookend labels. Dynamic header text shows "Within X miles" when slider is active, "Any distance" at default. No pills, no FROM label — ultra-compact footprint.
- **Artist card:** New text input filter that matches against event names (artist/band). Shows inline pill in omnibar when active.
- **Icon color system:** All four filter card icons (Distance, When, Artist, Venue) use neutral grey (`t.textMuted`) by default. Icons switch to their brand color only when that filter is actively modified: Teal for Distance, Teal for When, Teal for Artist, Purple for Venue. Reduces visual clutter in default state.
- **"Clear all" button:** Styled as a teal ghost button with border (`1px solid` teal, transparent background, bold weight) instead of muted text link — more prominent and tappable.
- **"Pick a Date" in WHEN card:** 5th pill option added after "This Weekend." Tapping it keeps the card open and reveals a native `<input type="date">` picker below the pills. Selecting a date auto-closes the card and filters events to that single day. The WHEN card header and omnibar pill show the formatted date (e.g., "Fri, Mar 20" / "Mar 20"). Also wired into the Saved tab's date pills. Resets on "Clear all" and tab change.
- **FilterBar removed:** The old horizontal filter bar between hero and event list is gone. The `FilterBar` component import was removed from `page.js`. The component file (`FilterBar.js`) still exists but is no longer used.
- **Summary row removed:** No secondary filter summary row — the omnibar handles all active filter indication.
- **Scrim overlay:** Semi-transparent backdrop when filter panel is open; clicking it closes the panel.
- **`+` FAB:** Replaced the old text "+" button with a Material Design SVG add icon inside the orange circle.

**What was NOT changed:**
- Hero section ("Featured Tonight" / "Tonight's Spotlight") — completely untouched
- Event cards, event list rendering, date separators — unchanged
- Bottom navigation — unchanged
- Saved/Profile tabs — unchanged
- All existing filter logic (`filteredEvents`, `groupedEvents`, etc.) — unchanged, just wired to new UI

**New state variables added to `page.js`:**
- `filtersExpanded` — boolean, controls filter panel open/close
- `activeFilterCard` — `'distance'` | `'when'` | `'artist'` | `'venue'` | null, controls which section is expanded
- `venueSearch` — string, search text inside the venue filter list
- `locationOrigin` — string, user-entered zip/city override for distance origin
- `locationLabel` — string, display label (reverse-geocoded town or "Current Location")
- `locationCoords` — `{ lat, lng }` | null, coordinates from geolocation or geocode
- `geolocating` — boolean, true while detecting device location
- `artistSearch` — string, artist/band name filter text
- `pickedDate` — string (YYYY-MM-DD), custom date selection when `dateKey === 'pick'`

### What's Next

- **Saved/favorites functionality** — wire the heart icons to Supabase `user_favorite_artists` / `user_favorite_venues` tables
- **Geolocation distance filtering** — the UI and geocoding are wired up, but actual haversine distance calculation against venue lat/lng is not yet implemented in `filteredEvents`. Needs venue coordinates in Supabase and client-side distance math.
- **Clean up** — remove `FilterBar.js` component file if confirmed no longer needed

### Deployment Notes

- **Vercel CLI deploy:** If `git push` deployments get stuck at "Initializing" (known Vercel issue), use `npx vercel --prod` from the project directory as a reliable alternative. Requires `npx vercel login` first if token has expired.
- **Last successful deploy method:** CLI direct deploy via `npx vercel --prod` (March 13, 2026), which bypasses the GitHub integration.

---

## Immediate Action Items
- **Push all local commits:** `cd ~/Documents/mylocaljam && git push origin main`
- **Run sync** to refresh events with corrected DST offsets and image_url passthrough
- **Run Supabase SQL migrations** (see Schema Notes) to add `image_url` to `events` and create `artists` table
- **Add LASTFM_API_KEY** to Vercel environment variables (https://www.last.fm/api/account/create — free)
- **Run initial artist enrichment backfill** (optional): call `/api/enrich-artists` a few times to catch up any unenriched events. After that, auto-enrichment runs with every sync.
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
- **MJ's Restaurant Bar & Grill** (https://www.mjsrestaurant.com/Neptune/live-music/) — ❌ Investigated, cannot scrape. Live music page contains only an image poster (JPEG uploaded monthly). No structured event data, no calendar widget, no API. Address: 3205 Rt 66, Neptune, NJ 07753. Revisit if they add a proper calendar or event listing.
- **Pagano's UVA Ristorante** (https://www.uvaonmain.com/live-music/) — ❌ Investigated, cannot scrape. WordPress/Divi site with image slider — live music page contains a monthly JPEG poster (`music_202603.jpg`) and directs visitors to Facebook for the schedule. No structured event data, no calendar widget, no API. Address: 800 Main St, Bradley Beach, NJ 07720. Revisit if they add a proper calendar or event listing.
- **The Wharf** (https://thewharfoceanportnj.com/live-music-calendar) — ❌ Investigated, cannot scrape. GoDaddy Website Builder site — live music calendar page renders the monthly schedule as an image (no text in DOM, only nav elements). No structured event data, no calendar widget, no API. Address: Ocean Port, NJ. Revisit if they add a proper calendar or event listing.
- **Captain's Inn** (https://www.captainsinnnj.com/calendar) — ❌ Investigated, cannot scrape. Wix site — calendar page contains a large image poster (1319×2333 px) with no text content in the DOM. No structured event data, no calendar widget, no API. Address: 304 E. Lacey Rd, Forked River, NJ 08731. Revisit if they add a proper calendar or event listing.
- **Charley's Ocean Bar & Grill** (https://www.charleysoceangrill.com/events.php) — ❌ Investigated, cannot scrape. Static site fetches content from WordPress JSON API (`charleys.prime-cms.net/wp-json/wp/v2/pages/73/`), but the returned content is just image posters (`music-lineup-01-2026.png`). No structured event data. Address: Long Branch, NJ. Revisit if they add a proper calendar or event listing.
- **Icarus Brewing** (https://icarusbrewing.com/calendar/) — ❌ Investigated, cannot scrape. WordPress site (WPBakery) — events page is entirely image posters (flyers for music, comedy, food pairings, etc.). No structured event data, no calendar widget, no API. Address: 2045 Route 88, Brick, NJ 08724. Revisit if they add a proper calendar or event listing.
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

### Last.fm Artist Enrichment ✅ Implemented (Auto + Manual)
- **Module:** `src/lib/enrichLastfm.js` — fetches artist bio, image, and tags from Last.fm API; caches in `artists` table (7-day TTL); skips Last.fm placeholder images
- **Auto-enrichment:** Built into `sync-events/route.js` — runs automatically after every sync (6 AM & 6 PM). Looks up to 30 new artists per sync, caches results, and updates events. No manual intervention needed for new artists.
- **Standalone API route:** `src/app/api/enrich-artists/route.js` — POST/GET for manual bulk enrichment; processes up to 100 unenriched events per call. Useful for initial backfill or catching up after adding many new venues.
- **Dry run:** `POST /api/enrich-artists?dry=true` — counts unenriched events without writing anything
- **Required env var:** `LASTFM_API_KEY` — add to Vercel environment variables. Get a free key at https://www.last.fm/api/account/create
- **Auth:** same `SYNC_SECRET` Bearer token as `/api/sync-events`
- **Manual trigger from browser console (for bulk backfill):**
  ```javascript
  fetch('/api/enrich-artists', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
  ```
- **Run multiple times** for initial backfill to work through all unenriched events (100 per call). After backfill, the auto-enrichment in the sync cron handles new artists automatically.
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
- Working examples: Wonder Bar, Stone Pony, ParkStage, PNC Bank Arts Center

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
| `eventbrite.com` links or organizer page | Eventbrite | showmore JSON API (`/org/{orgId}/showmore/`) — see Eventbrite pattern below |
| AXS ticket links, `axs.com`, Carbonhouse platform | AEG/Carbonhouse | ❌ Likely blocked — datacenter IP blocking. AJAX at `/events/events_ajax/{offset}`. See Starland Ballroom notes |
| `restaurantpassion.com` iframe | RestaurantPassion | Fetch iframe URL directly, parse `custom_page_body` HTML. Regex boundary is fragile — see notes |

---

## Scraping Data — Patterns, APIs & Lessons Learned

This section documents every scraping pattern, API endpoint, and hard-won lesson learned across all sessions. The goal is to enable an AI agent to autonomously investigate and scrape new venues without repeating past mistakes.

### Eventbrite Organizer Pages

**When to use:** Venue sells tickets through Eventbrite but their own website only has image posters or no structured data.

**How to find the organizer ID:**
1. Search Eventbrite for the venue name (e.g., "Crossroads Garwood")
2. Click on the organizer name in any event listing
3. The organizer URL is `https://www.eventbrite.com/o/{name}-{orgId}` — the numeric suffix is the organizer ID
4. Alternatively: on any Eventbrite event page, open DevTools and check `window.__SERVER_DATA__` → `api_data.organizer`

**API endpoint — showmore (preferred):**
```
GET https://www.eventbrite.com/org/{orgId}/showmore/?type=future&page_size=50&page=1
Headers:
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
  Accept: application/json
  Referer: https://www.eventbrite.com/o/{name}-{orgId}
```

**Response structure:**
```json
{
  "data": {
    "events": [
      {
        "name": { "text": "Event Title" },
        "start": { "local": "2026-03-20T20:00:00", "formatted_time": "8:00 PM" },
        "end": { "local": "2026-03-20T23:00:00" },
        "url": "https://www.eventbrite.com/e/...",
        "logo": { "url": "https://img.evbuc.com/..." },
        "summary": "Event description text",
        "is_free": false,
        "price_range": "$25 - $35",
        "id": "123456789"
      }
    ]
  }
}
```

**Why NOT to use JSON-LD:** The Eventbrite organizer page includes `<script type="application/ld+json">` with an `itemListElement` array, but this only contains events from the **first page load** (typically ~12). If the organizer has more events (e.g., 24), the rest are loaded via the showmore API when the user clicks "Show more." The JSON-LD will silently miss half the events.

**`window.__SERVER_DATA__` for debugging:** On an Eventbrite organizer page, `window.__SERVER_DATA__.view_data.events` contains `num_future_events` (total count), `has_next_future_page` (boolean), and `future_events` (first page only). Use this to verify if events are being missed.

**Working example:** Crossroads (`crossroads.js`) — organizer ID `18337279677`

### AEG/Carbonhouse Platform (Starland Ballroom pattern)

**Identifying features:** AXS ticket links (`axs.com`), venue site domain often managed by AEG. Main page is a JavaScript shell that loads events via AJAX.

**AJAX endpoint:**
```
GET https://www.{venue}.com/events/events_ajax/{offset}
Headers:
  X-Requested-With: XMLHttpRequest
  Referer: https://www.{venue}.com/events/all
```
Returns JSON-encoded HTML string (must `JSON.parse()` first). Each page returns ~20 events in `<div class="entry starland clearfix">` blocks.

**⚠️ BLOCKED from datacenter IPs:** Both the main page and AJAX endpoints block Vercel/datacenter IPs entirely. Returns empty HTML or 0 events with no error. This is platform-level blocking, not per-venue — all AEG/Carbonhouse sites will likely be blocked.

**Scraper kept for reference:** `starlandBallroom.js` — fully functional parser, just can't reach the data from Vercel.

**To revisit:** A residential proxy, headless browser running outside Vercel, or if AEG opens a public API.

### RestaurantPassion Iframe Calendar

**Identifying features:** Restaurant websites using RestaurantPassion for their calendar/events page. Calendar is embedded in an iframe pointing to `restaurantpassion.com/ext-page/{a}/{b}/{c}/`.

**Approach:** Fetch the iframe URL directly (not the parent page). Extract content from `.custom_page_body` div. Content is organized as `<p>` blocks — one per day, with date on first line and events on subsequent lines.

**⚠️ Regex boundary is fragile:** The regex to extract `custom_page_body` content depends on what HTML tag follows the closing `</div>`. This has changed at least once (from `<script>` to `<style>`). The current robust pattern is:
```regex
/class="custom_page_body"[^>]*>([\s\S]*?)<\/div>\s*(?:<style|<script|<\/div>|$)/i
```
If the scraper breaks with "Could not find custom_page_body", check what tag follows the div and add it to the alternation group.

**Working example:** The Crab's Claw Inn (`crabsClaw.js`) — iframe URL `restaurantpassion.com/ext-page/13/332/27093/`

### Datacenter IP Blocking — Which Platforms Block

Vercel runs on datacenter IPs that many platforms block. These are the known blocking patterns:

| Platform / Site | Blocks? | Error Behavior |
|---|---|---|
| Cloudflare + reCAPTCHA (McLoone's) | ✅ Yes | HTTP 403 |
| AEG/Carbonhouse (Starland Ballroom) | ✅ Yes | Returns empty/0 events, no error |
| Etix (House of Independents) | ✅ Yes | Returns 2KB React shell, no JSON-LD |
| Algonquin Arts (custom PHP) | ✅ Yes | HTTP 403 |
| WordPress EventPrime (Brielle House) | ✅ Partially — nonce/session blocks AJAX | "Security check failed" |
| Ticketbud (behind Cloudflare) | ✅ Yes | HTTP 403 |
| Eventbrite | ❌ No | Works fine |
| Ticketmaster Discovery API | ❌ No | Works fine (API key auth) |
| Google Calendar iCal feeds | ❌ No | Works fine |
| Squarespace JSON API | ❌ No | Works fine |
| WordPress REST API / AJAX | ❌ Usually no | Depends on security plugins |
| RestaurantPassion | ❌ No | Works fine |
| Timely API | ❌ No | Works fine |
| BentoBox | ❌ No | Works fine |
| Square Online API | ❌ No | Works fine |
| Webflow CMS | ❌ No | Works fine |

**Key lesson:** When a scraper returns 0 events with no error, it's often datacenter IP blocking — the server returns valid but empty responses. Always test new scrapers from Vercel (not just local dev) before marking them as working.

**Headers that DON'T help against real blocking:** Full browser-like headers (`User-Agent`, `Sec-Fetch-*`, `Referer`, `Connection`, `Cache-Control`, `Upgrade-Insecure-Requests`) do NOT bypass Cloudflare, AEG, or server-level IP blocking. If a site blocks datacenter IPs, no amount of header manipulation will help.

### Ticketmaster Venue Addition (fastest method for major venues)

**When to use:** Venue is ticketed by Ticketmaster/Live Nation. These are typically larger venues (concert halls, amphitheaters, clubs with reserved seating).

**How to find the venue ID:**
1. Go to the venue's website and look for Ticketmaster links
2. Check the page source for JSON-LD — look for `@type: Place` with `identifier` or `sameAs` containing a Ticketmaster URL
3. Or search the Ticketmaster Discovery API: `https://app.ticketmaster.com/discovery/v2/venues.json?keyword=VENUE_NAME&apikey=YOUR_KEY`
4. The venue ID looks like `KovZpZAEAIIA` (alphanumeric)

**To add a new Ticketmaster venue:** Just append to the `VENUES` array in `ticketmaster.js`:
```javascript
{ id: 'KovZpZAEAIIA', name: 'PNC Bank Arts Center' },
```
No new scraper file needed. No route.js changes needed. The existing Ticketmaster scraper handles all venues in the array.

**Current Ticketmaster venues:** Wonder Bar, Stone Pony Summer Stage, The Stone Pony, ParkStage, PNC Bank Arts Center (~155 combined events)

### Supabase Venue Deduplication

**Problem:** When a venue is added via SQL INSERT and the sync also creates one, or when multiple INSERTs run, duplicate venue entries appear in Supabase. Events may link to different venue IDs.

**Fix procedure:**
1. Identify the correct venue ID to keep (usually the one with the most events)
2. Reassign all events from duplicate IDs: `UPDATE events SET venue_id = 'correct-uuid' WHERE venue_id = 'duplicate-uuid';`
3. Delete the duplicate venue entries: `DELETE FROM venues WHERE id = 'duplicate-uuid';`
4. **Important:** Must reassign events FIRST — the foreign key constraint prevents deleting a venue that still has events linked to it.

### Autonomous Venue Investigation Workflow

When investigating a new venue URL, an AI agent should follow this exact sequence:

**Phase 1 — Quick Reconnaissance (no browser needed)**
1. Fetch the venue URL with `fetch()` and examine the HTML source
2. Check `<meta name="generator">` for platform identification
3. Search for `calendar.google.com` iframes → Google Calendar embed
4. Search for `<script type="application/ld+json">` → structured event data
5. Search for platform clues: `wp-content`, `squarespace-cdn`, `wix.com`, `getbento.com`, `static.framer.com`
6. Check for known ticket platform links: `eventbrite.com`, `ticketmaster.com`, `axs.com`, `ticketbud.com`

**Phase 2 — Platform-Specific API Probing**
- **Squarespace:** Try `{url}?format=json` — if it returns items/upcoming array, done
- **WordPress:** Try `/wp-json/wp/v2/events`, `/wp-json/wp/v2/posts` — check for event data
- **Google Calendar:** Extract calendar ID from iframe → build iCal URL → test if public
- **Eventbrite:** Find organizer ID → test showmore API
- **Ticketmaster:** Find venue ID → add to VENUES array in `ticketmaster.js`

**Phase 3 — Deep Investigation (browser may be needed)**
- Open the page in a browser and check the Network tab for XHR/Fetch requests
- Look for AJAX endpoints that return JSON event data
- Check `window.__SERVER_DATA__`, `window.__PRELOADED_STATE__`, `__BOOTSTRAP_STATE__` for inline data
- Check for API calls when interacting with calendar widgets (clicking next month, "show more", etc.)

**Phase 4 — Classification**
After investigation, classify the venue into one of:
- ✅ **Scrapeable** — structured data source found, build the scraper
- ⚠️ **Image poster only** — can build hardcoded monthly scraper (requires manual updates)
- ❌ **Blocked** — datacenter IP blocking, keep scraper file for reference
- ❌ **Not scrapeable** — no structured data, no API, cross-origin iframe lockdown

**Phase 5 — Build & Wire**
1. Create scraper file following existing patterns
2. Wire into `route.js` (import, Promise.all, scraperResults, allEvents spread)
3. Provide Supabase INSERT SQL for the venue
4. Update this HANDOVER.md with the new venue entry
5. User pushes to git, runs SQL, triggers sync

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

## UI Adjustments (March 14, 2026)

### Typography & Contrast Improvements
- **Event titles** (`EventCardV2`): 13px → 15px, fontWeight 700 → 600 (semi-bold)
- **Event titles** (`SiteEventCard`): 17px → 19px, fontWeight 700 → 600
- **Event titles** (`SiteHero` carousel): 15px → 17px, fontWeight 700 → 600
- **Venue names** (`EventCardV2`): 11.5px → 13px
- **Venue names** (`SiteEventCard`, `SiteHero`): 13px → 14px
- **Date dividers** (`dateSeparatorStyle` in `page.js` + `redesign/page.js`): 11px → 13px, fontWeight 800 → 700, color lightened from `textMuted` (#7878A0) to `#9898B8` (dark mode) / `#6B7280` (light mode)
- **Section headings** (`SectionHeading.js`): 18px → 20px
- **Orange badges — contrast fix**: All white-on-orange text changed to dark `#1A1A24` (or `#111111`) across `EventCardV2` time badge, `HeroSection` pill, `EventCardV2` "Get Tickets" button, `SiteEventCard` "Tickets" button

### Event Card Time Badge — Fixed Width Alignment
- **Problem:** Orange time badges changed width based on text content (e.g., '8:30p' wider than '8p'), causing jagged alignment of artist names
- **Fix:** Set fixed `width: 62px` on the time badge (comfortably fits "11:30p"), removed `minWidth`, used `padding: 5px 0` with flexbox centering (`display: flex, alignItems: center, justifyContent: center`)
- **Result:** All badges same width, music note icons and artist names form a clean vertical line

---

## Hero Carousel Redesign — "Tonight's Spotlight" (March 14, 2026)

### UI Overhaul (`src/components/HeroSection.js`)
- **Label:** "Featured Tonight" → "Tonight's Spotlight" (or "Coming Up" for non-today)
- **Pill styling:** Vibrant orange `#FF6600` background, pure black `#000000` text + bolt icon (Material Design bolt as inline SVG), font 9px weight 700, compact badge size
- **Green genre pill:** Removed entirely
- **Time + venue:** Removed boxed orange time badge. Combined into single clean line: `🕒 2:00 PM • 📍 Venue Name` using full time format (e.g., "7:00 PM" not "7p")
- **Padding:** Increased from `8px 16px 12px` → `20px 20px 24px`
- **Background:** Replaced solid gradient with background image (from `venue.photo_url`, `event.image_url`, or Unsplash placeholders) + heavy dark gradient overlay (`rgba(0,0,0,0.55)` → `rgba(0,0,0,0.80)`)
- **Carousel:** Supports up to 5 items (was 3), dots slightly larger (7px, active 18px)

### Spotlight Admin — Manual Carousel Pinning

#### Database Table (`supabase-spotlight.sql`)
```sql
CREATE TABLE spotlight_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  spotlight_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE(event_id, spotlight_date)
);
```
**⚠️ Must run this SQL in Supabase SQL Editor before the spotlight feature works.**

#### API (`src/app/api/spotlight/route.js`)
- `GET /api/spotlight?date=YYYY-MM-DD` — public, returns pinned event IDs for a date
- `POST /api/spotlight` — admin auth required, body: `{ date, event_ids: [] }`, replaces all pins for that date (max 5)
- `DELETE /api/spotlight?date=YYYY-MM-DD` — admin auth required, clears all pins for that date

#### Admin Panel (`src/app/admin/page.js`)
- New **Spotlight** tab added between Events and Submissions
- Date picker to select which day to configure
- Shows all published events for that date — click to pin/unpin (star icon toggles)
- Pinned events list with reorder buttons (↑↓) and remove (✕)
- "Save Spotlight" and "Clear Pins" buttons
- Status indicator: "No pins — using auto fallback" or "3/5 pinned"

#### Carousel Priority Logic (`page.js` + `redesign/page.js`)
1. **Priority 1:** Manual spotlight pins from admin (fetched from `/api/spotlight?date=today`)
2. **Priority 2:** Algorithmic fallback — today's events sorted by start_time
3. **Priority 3:** Next upcoming events (up to 6), sorted by date then time

---

## Distance / Location Filter Overhaul (March 14, 2026)

### UI Changes
- **Active container wraps everything**: When the Distance dropdown is open, a teal border (`1.5px solid accentAlt`) and subtle background tint (`#1E1E30` dark / `#F0FFFE` light) encloses the header, location input, AND slider — not just the header row. Rounded corners (`10px`) and small margin separate it visually from other filter cards.
- **Slider labels**: Bumped to `10px`/`600` weight, color `#A0A0A0` for visibility. Min label shows "5 mi", max shows "50 mi".
- **Slider min value**: Changed from `0` to `5` (a 0-mile radius is useless). Dragging to minimum (5) resets filter to `null` (any distance).
- **Custom slider thumb**: CSS class `.distance-slider` in `globals.css` — 22px teal circle with 2.5px white border and drop shadow. Cursor changes to `grab`/`grabbing`. Track thickened to 6px.
- **Radius display**: When active, shows "X miles from [location]" below the slider in teal.

### Backend: Venue Geocoding
- **Migration**: `supabase-geocode.sql` — adds `latitude`/`longitude` columns to `venues` table, seeds 6 default Asbury Park venue coordinates, creates `idx_venues_lat_lng` index.
- **API Route**: `src/app/api/geocode-venues/route.js`
  - `POST` (admin auth): Batch geocodes all venues missing lat/lng using Nominatim. Rate-limited to 1 req/sec.
  - `GET` (public): Returns all venues with coordinates.
- **Event data mapping**: Both `page.js` and `redesign/page.js` now select `venues(... latitude, longitude)` and map to `venue_lat`/`venue_lng` on each event.

### Backend: Haversine Distance Filtering
- **Haversine function**: `haversineDistance(lat1, lng1, lat2, lng2)` returns distance in miles. Added to both `page.js` and `redesign/page.js`.
- **Filter logic**: In `filteredEvents` useMemo, when `milesRadius !== null && locationCoords` is set, events are filtered by `haversineDistance(userLat, userLng, venueLat, venueLng) <= milesRadius`. Events without venue coordinates are excluded.
- **User location sources**: (1) Browser geolocation on mount → reverse geocode for town name; (2) Text input → forward geocode via Nominatim (appends ", NJ").

### Setup Required
1. ~~Run `supabase-geocode.sql` in Supabase SQL Editor~~ ✅ Done
2. ~~For new venues, run geocoding: `POST /api/geocode-venues` with admin auth header~~ ✅ Done (32/37 geocoded)

### Known Issues — Venues Not Geocoded (Nominatim "not_found")
These 5 venues need manual lat/lng coordinates added in Supabase. Nominatim could not resolve their addresses. Fix by running an UPDATE query in the SQL Editor for each:
```sql
UPDATE venues SET latitude = ?, longitude = ? WHERE name = '?';
```

1. **Jacks on the Tracks** — needs correct street address or manual coords
2. **10th Ave Burrito** — needs correct street address or manual coords
3. **Bakes Brewing** — needs correct street address or manual coords
4. **Boatyard 401** — needs correct street address or manual coords
5. **Jacks on the Tracks** (duplicate entry?) — check if duplicate venue in DB

> **Note:** Any future venues added by scrapers will also need geocoding. Re-run `POST /api/geocode-venues` with admin auth after new venues are added, or manually insert coords.

---

## Expanded Event Card Redesign (March 14, 2026)

### UI De-cluttering
- **Removed** redundant artist name + venue name text that appeared below the hero image (already shown in compact header row)
- **Removed** bottom row with large `+ Follow Artist` and `+ Follow Venue` buttons
- **Dropped** Follow Venue feature entirely — `onFollowVenue` and `isVenueFollowed` props removed from EventCardV2
- **Image fix**: Hero image uses `aspect-ratio: 16/9` with `object-fit: cover` and `object-position: center center`. Proportional rendering without bottom clipping.

### Action Row (Single Flex Line, Left-to-Right Order)
1. **+ Follow Artist** (far left, primary): Orange outlined pill when unfollowed, green bg when followed. 11px/700 weight. Only element with standout accent color.
2. **🌐 Venue Website** (middle): Always shows if `source` URL exists. Subtle grey bg button (`#2A2A3A` dark / `#E5E7EB` light).
3. **⚑ Flag** (far right): Pushed right via `marginLeft: auto`. 24px icon, `marginRight: 2px`. No background, no border. Muted `#A0A0A0`, turns orange on hover. Opens flag bottom-sheet.
- **Tickets button removed** — users can find tickets via the Venue Website link. Removed from EventCardV2 entirely.

### Sync Route — Ticket Link Filtering
- `sync-events/route.js` now compares `ticket_url` hostname against `source_url` hostname at ingest time. If same domain (scraper venue-URL fallback), stores `null` for `ticket_link` instead of the fallback URL.

### Public Status Badges
- **Cover Charge pill**: Subtle rounded pill above description. Dark mode: dark grey bg + light text. Light mode: light grey bg + dark text. Shows "💵 $X Cover" or "🎵 Free Admission"
- **CANCELED badge**: Red `#DC2626` pill centered over the hero image with dark overlay. If no image, shows as centered badge. When canceled:
  - Left accent bar turns red
  - Time badge turns red with "✕"
  - Artist name gets `text-decoration: line-through`
  - Card opacity drops to 0.6
  - Venue/Tickets/Follow buttons hidden entirely
- Both badges are admin-controlled via the `status` and `cover_charge` columns in the events table

### Report Issue (Crowdsourced Flagging)
- **Old**: Tiny grey "⚑ Report an issue" text at bottom → opened full ReportIssueModal
- **New**: Clean flag icon button (⚑) in the action row → slides up a bottom-sheet modal titled "What's up with this event?"
- **Two options**: "🛑 Band Canceled" and "💵 Cover Charge Added" (plus Close)
- **Backend**: Tapping an option calls `POST /api/flag-event` with `{ event_id, flag_type: 'cancel' | 'cover' }`. This increments `cancel_flag_count` or `cover_flag_count` on the events table. Does NOT change the public UI — routes to admin review
- **ReportIssueModal** is no longer triggered from EventCardV2 (dead code, can be removed later)

### New Files
- `src/app/api/flag-event/route.js` — Public POST endpoint for flag increments
- `supabase-event-flags.sql` — Adds `cancel_flag_count` and `cover_flag_count` columns to events table

### Modified Files
- `src/components/EventCardV2.js` — Full rewrite with all above changes
- `src/app/page.js` — Removed `onFollowVenue`, `isVenueFollowed`, `onReport` props; added `onFlag` prop; cleaned up ReportIssueModal references

### Styling Tweaks (March 14, 2026)
- **Search bar icon + text**: Magnifying glass and "Search / Filters" label both use `t.textMuted` — no longer switches to teal accent when expanded. Matches placeholder text color.
- **Time pill text**: White (`#FFFFFF`) in dark mode, black (`#000000`) in light mode. Previously was `#111111` in both modes which looked muddy on dark backgrounds.

### Time Block Redesign (March 15, 2026)
- **Uniform squircle blocks**: Fixed 48×48px with 8px border-radius, `flex-direction: column` layout
- **Font**: Arial Black / Anton / Archivo Black, weight 900, 18px, tabular-nums, letter-spacing -0.5px
- **Stacked text for colon times**: If `timeStr` contains `:`, splits into two lines — top line is everything before the colon (e.g., `5`), bottom line is everything after (e.g., `30p`). Colon stripped for clean stacking. Uses `<br/>` to split. `line-height: 0.85` keeps lines hugging tightly inside the squircle.
- **Single-line times**: Times without colons (e.g., `7p`, `12p`) render normally on one line at 18px
- **Canceled state**: Red `#DC2626` background with white '✕' symbol

### Filter UI Overhaul (March 15, 2026)
- **Pill labels shortened**: "All Upcoming" → "ALL", "This Weekend" → "Weekend", "Choose a Date..." → "Pick a Date"
- **Font sizes bumped**: Pill text 10px → 14px, card header labels 9px → 11px (SearchFilterRedesign) / 11px → 13px (page.js), card header subtext 12px → 14px
- **Touch targets increased**: Pill padding 5px 10px → 10px 16px, minHeight 40px, border-radius 14px → 20px, gap 4px → 8px
- **Pick a Date — native calendar**: Uses `<label>` wrapping a hidden `<input type="date">` (opacity 0, absolute positioned). Tapping the pill immediately opens the native OS date picker (iOS date wheel, Android material calendar, desktop browser picker). No two-step process. Applied to all 3 instances: main filter panel (page.js), SearchFilterRedesign component, and Saved Events tab
- **SectionHeading labels**: Updated to match — "All Upcoming" → "All Shows", "This Weekend" → "Weekend"
- **Modified files**: `src/app/page.js`, `src/components/SearchFilterRedesign.js`, `src/components/SectionHeading.js`

### Setup Required
1. Run `supabase-event-flags.sql` in Supabase SQL Editor (adds flag count columns)
2. To mark an event canceled: UPDATE events SET status = 'cancelled' WHERE id = '...';

---

## Known Issues — Git / Deploy Workflow

### Git out of sync with Vercel deploy
- **Problem:** `npx vercel --prod` deploys directly from local disk files, bypassing git. So the live site can be ahead of what's committed to GitHub. Meanwhile, the Claude sandbox edits files at `/sessions/.../mnt/mylocaljam` which syncs to the user's local folder, but git commands run from the user's terminal at `~/mylocaljam` (not `~/Documents/mylocaljam`). Path mismatches in `cd` commands cause commit failures.
- **Symptoms:** Red "modified" files in `git status` that are already deployed and working on the live site. Commits fail with `cd: no such file or directory`.
- **Current state (March 15, 2026):** Several files may have uncommitted changes that are already live: `.gitignore`, `src/app/admin/page.js`, `src/components/SiteEventCard.js`, `src/components/SiteHero.js`. Plus untracked files: `ARCHITECTURE-PLAN.md`, `src/app/api/follows/`, `src/app/api/spotlight/`, `src/components/FollowingTab.js`, `supabase-phase2-follows.sql`, `supabase-spotlight.sql`.
- **Fix needed:** Run `git add` and `git commit` from the user's terminal to catch git up with what's deployed. Do NOT use `cd /Users/anthony/mylocaljam` — the user's terminal is already in the `mylocaljam` directory. Just use `git add` and `git commit` directly.
- **Prevention:** Future sessions should omit the `cd` prefix from git commands since the user's terminal is already in the project directory.

---

## Session: March 15, 2026 — Submission Flow, Admin Queue, Filter Cleanup

### Saved Tab — Date Filters Removed
- **Removed entirely** — no date pills (ALL/Today/Tomorrow/Pick a Date) on Saved tab, any screen size
- Removed corresponding date-filtering switch/case from the saved events IIFE
- Simplified from nested double-IIFE to single IIFE
- Updated empty state messages (no longer references date filters)
- **Files changed:** `src/app/page.js`

### "Add to the Jar" Submission Modal — Complete Rewrite
- **File:** `src/components/SubmitEventModal.js` — replaced heavy 10-field form with minimalist two-path design
- **Primary path:** Photo upload via `<label htmlFor>` pointing to hidden `<input type="file">` (reliable on iOS — no programmatic `.click()`)
- **Secondary path:** "or enter manually" toggle reveals 3 fields: Artist, Venue, Date
- Uses inline `DARK`/`LIGHT` theme tokens (not CSS vars) matching page.js pattern
- Bottom-sheet modal style with drag handle, slides up from bottom
- `handleClose()` callback resets ALL state (photo, form fields, submittedRef) on X or backdrop tap
- Double-submit prevention via `submittedRef` (useRef guard) + `disabled={submitting}`
- Error messages now surface actual DB error from API response
- Input `fontSize: 16px` prevents iOS Safari auto-zoom on focus
- `scrollIntoView({ block: 'center' })` on input focus with 300ms delay for iOS keyboard
- 40vh spacer div at bottom for keyboard scroll clearance
- **DB status:** All submissions use `status: 'pending'` (DB constraint `submissions_status_check` only allows pending/approved/rejected)

### Submissions API Update
- **File:** `src/app/api/submissions/route.js`
- Handles both photo path (`image_url` present) and manual entry path
- Normalizes bare `YYYY-MM-DD` dates to full ISO timestamps (`T00:00:00`)
- `console.error` with details/hint on DB errors for debugging
- Uses `getAdminClient()` (service role key, bypasses RLS)

### Admin Approval Queue — New Feature
- **Page:** `src/app/admin/queue/page.js` — desktop-optimized split-screen dashboard
- **API:** `src/app/api/admin/queue/route.js` — GET pending, POST approve, PUT reject/block
- **Duplicate check API:** `src/app/api/admin/duplicate-check/route.js`
- **Layout:** Three-panel split-screen:
  - Left sidebar: scrollable queue list sorted oldest-first, status badges (📷 Flyer / ✏️ Manual)
  - Middle: source panel with flyer image (clickable lightbox + "Open in New Tab") or manual entry details, submission metadata
  - Right: editor panel with editable fields (Artist, Venue with datalist, Date, Time, Genre, Vibe, Cover, Ticket Link)
- **Duplicate check:** Live warning when venue+date matches existing published event (500ms debounce)
- **Actions:** Approve (creates event + marks submission approved), Reject, Block Submitter (rejects + flags email)
- **Auto-advance:** After approve/reject/block, automatically loads next queue item
- **Auth:** Same `ADMIN_PASSWORD` env var pattern as existing admin page
- **Admin page updated:** Orange "Approval Queue" button added to `/admin` header
- **Password:** `freshdoily` (in `.env.local`)

### Toast Component Upgrade
- **File:** `src/components/Toast.js` — now supports `variant="success"` prop
- Success variant: full-width green bar (#16A34A), large white text, party emoji, 4-second duration
- Default variant unchanged (small dark pill with accent border)
- `toastVariant` state added to page.js, reset on dismiss

### Profile Tab Sign In Button
- Wired `onClick={() => setShowAuthModal(true)}` on the Profile tab's orange Sign In button
- Added `fontFamily: "'DM Sans', sans-serif"` to match Saved tab button

### DB Schema Requirements
```sql
-- Required for photo uploads and block feature:
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE;

-- Required for block submitter action:
CREATE TABLE IF NOT EXISTS blocked_submitters (
  email TEXT PRIMARY KEY,
  blocked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase Storage: create a public bucket named "flyers"
```

### Known Bugs (To Fix Later)
1. **Submit modal — Date field buried under keyboard on iOS:** `scrollIntoView` + 40vh spacer not fully working on iOS Safari. Needs more aggressive fix (possibly `visualViewport` API or repositioning modal from `position: fixed` to `absolute`).
2. **Submit modal — Date-to-button spacing on mobile Safari:** Explicit `marginBottom: 24px` on Date wrapper visually collapsing on mobile despite working on desktop. Needs Safari remote inspector debugging to find override.

### State Variables Added to page.js
```javascript
const [isLoggedIn, setIsLoggedIn] = useState(false);
const [showAuthModal, setShowAuthModal] = useState(false);
const [toastVariant, setToastVariant] = useState(null);
```

### New Files Created
- `src/app/admin/queue/page.js`
- `src/app/api/admin/queue/route.js`
- `src/app/api/admin/duplicate-check/route.js`

### Files Modified
- `src/app/page.js` — Saved tab filter removal, auth state, toastVariant, Profile Sign In wiring
- `src/components/SubmitEventModal.js` — complete rewrite
- `src/components/Toast.js` — success variant
- `src/app/api/submissions/route.js` — photo + manual paths, error logging
- `src/app/admin/page.js` — Approval Queue button in header

---

## Session: March 16, 2026 — Data Architecture & Artist Audit Dashboard

### Database Changes

#### `events` table — new `category` column
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Live Music';
```
Standard values: `'Live Music'`, `'Drink/Food Special'`, `'Trivia/Games'`, `'DJ/Nightlife'`. Defaults to `'Live Music'` so all existing events are unaffected. The "Convert to Special" tool in the admin panel writes `'Drink/Food Special'` when cleaning junk artist entries.

#### `artists` table — schema alignment
The enrichment pipeline originally created a simpler schema (`name, image_url, bio, tags, last_fetched`). These ALTERs add the columns the admin dashboard expects:
```sql
ALTER TABLE artists ADD COLUMN IF NOT EXISTS genres TEXT[];
ALTER TABLE artists ADD COLUMN IF NOT EXISTS vibes TEXT[];
ALTER TABLE artists ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
```

### Artist Backfill Endpoint
- **Route:** `src/app/api/admin/artists/backfill/route.js`
- **Purpose:** One-time (safe to re-run) backfill that scans ALL events, extracts every unique `artist_name`, and upserts into the `artists` table. Maps over `image_url`, `artist_bio`, and `genre` from events. Paginates in 1000-row chunks to bypass Supabase's default 1000-row cap.
- **Trigger from browser console:**
  ```javascript
  fetch('/api/admin/artists/backfill', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer freshdoily' }
  }).then(r => r.json()).then(d => console.log(d))
  ```
- **Results (March 16):** Scanned 1,652 events → 679 unique artists → inserted ~311 new artists across two runs, backfilled image/bio data on existing rows.

### Admin Artists Tab — Rebuilt as Audit Dashboard
**File:** `src/app/admin/page.js`

New state variables:
```javascript
const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
const [editingArtist, setEditingArtist] = useState(null);
const [artistForm, setArtistForm] = useState({ bio: '', genres: '', image_url: '', instagram_url: '' });
const [artistActionLoading, setArtistActionLoading] = useState(null);
```

Features:
- **"Needs Info Only" toggle** — filters to artists missing bio, image, genres, or social. Uses `?needsInfo=true` query param on the API.
- **Health badges** on every row: `Bio`, `Img`, `Genre`, `Social` — teal (#3AADA0) when populated, muted grey at 50% opacity when null. Font size 12px, padding 3px 10px.
- **Inline edit panel** — click ✎ to open a form for bio (textarea), genres (comma-separated input → array), image URL, Instagram URL. Saves via PUT to `/api/admin/artists`.
- **🍺 Convert to Special** — confirms, then calls `DELETE /api/admin/artists?id=X&action=convert-to-special`. Backend finds linked events by `artist_name` (ilike match), sets their `category` to `'Drink/Food Special'` and nulls `artist_name`/`artist_bio`, then deletes the artist row.
- **🗑 Delete** — standard permanent delete from the artists table.
- **↓ Export CSV** — downloads currently visible rows (respects search + needsInfo filter) as CSV with columns: Artist Name, Has Bio, Has Image, Has Genres, Has Socials, Database ID. Filename includes filter state and date.

### API Changes

#### `/api/admin/artists/route.js`
- GET: Added `.limit(5000)` to bypass Supabase default 1000-row cap. Added `?needsInfo=true` query param for server-side filtering.
- DELETE: Added `?action=convert-to-special` mode that re-categorizes linked events before deleting the artist. Added `revalidatePath('/')` and `revalidatePath('/api/events')` after delete.

### Files Created
- `src/app/api/admin/artists/backfill/route.js`

### Files Modified
- `src/app/api/admin/artists/route.js` — needsInfo filter, limit(5000), convert-to-special action, cache invalidation
- `src/app/admin/page.js` — Full Artists tab rebuild (audit dashboard), new state variables, Export CSV button

### Pending / Not Yet Deployed
- SQL migrations (category column + artists schema alignment) — user needs to run in Supabase SQL Editor
- Future: `artist_id` foreign key on events table (preparing for relational shift)
- Future: Admin page layout/design improvements
- Known bugs from prior sessions: Date field buried under keyboard on iOS, Date-to-button spacing on mobile Safari
- 5 ungeocodable venues need manual lat/lng in Supabase
- Supabase Storage: Create public bucket named "flyers"

---

## Session: March 17, 2026 — AI Auto-Fill (Perplexity Integration)

### What Changed
1. **New API Route: `/api/admin/artists/ai-lookup`** (`src/app/api/admin/artists/ai-lookup/route.js`)
   - POST endpoint, admin-auth protected (Bearer token)
   - Accepts `{ artistName }`, calls Perplexity `sonar-pro` model with live web search
   - System prompt forces structured JSON response: `bio`, `genres[]`, `vibes[]`, `instagram_url`
   - Strips markdown code fences, validates JSON, normalizes shape before returning
   - Returns 502 with descriptive error on API failure, parse failure, or empty response

2. **Admin Edit Panel — ✨ Auto-Fill with AI button**
   - Added at top-right of edit panel header, gradient orange styling
   - Shows "⏳ Searching..." with disabled state during API call
   - On success: maps AI response into form fields (bio, genres, vibes, instagram_url) — only fills non-empty values, preserves existing data
   - Does NOT auto-save — user reviews and clicks "Save Changes" manually

3. **Admin Edit Panel — Vibes field added**
   - New "Vibes (comma-separated)" input field in edit panel (left column under Bio)
   - Vibes saved as array to artists table on Save
   - Populated from existing `artist.vibes` on edit open

4. **Toast notification system**
   - Fixed-position toast at top-right of screen
   - Green for success ("AI fields populated — review & save!")
   - Red for error ("Could not auto-fill. Manual entry required.")
   - Auto-dismisses after 4-5 seconds

### Env Var Required
- `PERPLEXITY_API_KEY` — must be set in Vercel environment variables before deploying

### Files Created
- `src/app/api/admin/artists/ai-lookup/route.js` (new)

### Files Modified
- `src/app/admin/page.js` — new state vars (aiLoading, artistToast), vibes in artistForm, Auto-Fill button, vibes input, toast UI
- `HANDOVER.md` — this section

### Deploy Steps
1. Add `PERPLEXITY_API_KEY` env var in Vercel dashboard (Settings → Environment Variables)
2. Run `npx vercel --prod` from `~/mylocaljam`

---

## Session: March 17, 2026 — Image Upload Pipeline & Posters Bucket

### What Changed
1. **SubmitEventModal — switched to `posters` bucket with UUID rename**
   - Uploads now go to the `posters` Supabase Storage bucket (was `flyers`)
   - Files auto-renamed to `{uuid}.{ext}` using `crypto.randomUUID()` to prevent overwrites
   - Added client-side validation: max 10MB, only JPG/PNG/WebP/GIF allowed
   - File rejected with user-friendly alert before upload attempt

2. **Queue Approve — image_url now carries to events table**
   - On approve, fetches `image_url` from the submission record
   - Saves it to the new event's `image_url` column so the poster appears on the public feed
   - Previously this link was lost — submitted posters were never visible on published events

3. **Queue Reject — storage cleanup**
   - On reject, extracts the file name from the submission's `image_url`
   - Deletes the file from `posters` bucket to prevent junk file accumulation
   - Wrapped in try/catch so storage failures don't block the reject action
   - Only triggers for URLs containing `/posters/` (safe for legacy `flyers` URLs)

4. **Public feed already secure**
   - `GET /api/events` already filters `status = 'published'` — no pending submissions leak to users

### RLS Policies — Run in Supabase SQL Editor
```sql
-- Allow public/anon users to upload to posters bucket (insert only)
CREATE POLICY "Allow public uploads to posters"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'posters');

-- Allow public to read poster images (needed for public URLs)
CREATE POLICY "Allow public read of posters"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'posters');

-- Admin (service role) already bypasses RLS — full CRUD by default
-- No explicit policy needed for admin operations
```

### Files Modified
- `src/components/SubmitEventModal.js` — posters bucket, UUID rename, file validation
- `src/app/api/admin/queue/route.js` — image_url linking on approve, storage delete on reject
- `HANDOVER.md` — this section

### Deploy Steps
1. Run the RLS policies SQL above in Supabase SQL Editor
2. Run `npx vercel --prod` from `~/mylocaljam`

---

## Session: March 17, 2026 — Spotlight Carousel + iOS Swipe Fix

### What Changed
1. **`HeroSection.js` — rewritten with swipe + auto-rotate**
   - The "Tonight's Spotlight" hero is now a swipeable carousel using custom touch handlers + `translateX` transforms (the only approach that works on iOS Safari — see Key Fix #8 above)
   - Auto-rotates every 5s, pauses on touch/mouse interaction, resumes 2s after release
   - Accepts `spotlightEvents` prop: uses those if available, falls back to `events` prop
   - Dot pagination in bottom-right corner
   - `SpotlightCarousel.js` (separate orange ★ Spotlight section) was removed from `page.js` — there is now ONE swipeable hero only

2. **Admin EventFormModal — ★ Spotlight Carousel toggle**
   - New checkbox next to "Recurring event" in the event edit form
   - Sets `is_spotlight: true/false` on the event row
   - Orange styling to distinguish from regular checkbox

3. **Admin API PUT handler fixed** — was silently failing because it sent non-database fields (like `event_time`) to Supabase. Rewritten to only include known DB columns (see Key Fix #9 above).

4. **Admin API POST** — `is_spotlight` field added to create event handler.

5. **Main page (`page.js`)** — `SpotlightCarousel` import removed. `HeroSection` now receives `spotlightEvents` prop. Single hero at top.

### SQL Migration — Run in Supabase SQL Editor
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_spotlight BOOLEAN DEFAULT FALSE;
```

### Files Modified
- `src/components/HeroSection.js` — full rewrite with custom touch swipe + auto-rotate
- `src/app/page.js` — removed SpotlightCarousel import, pass spotlightEvents to HeroSection
- `src/app/admin/page.js` — is_spotlight in EventFormModal form state + checkbox
- `src/app/api/admin/route.js` — is_spotlight in POST, fixed PUT to allowlist DB columns only
- `HANDOVER.md` — this section + Key Fixes #8 and #9

### Files on Disk (unused)
- `src/components/SpotlightCarousel.js` — older separate carousel, no longer imported. Safe to delete.

### Deploy Steps
1. Run the ALTER TABLE SQL above in Supabase SQL Editor
2. Run `npx vercel --prod` from `~/mylocaljam`
3. Edit any event in Admin, check ★ Spotlight Carousel, save — it appears in the hero on the public feed

---

## Session: March 17, 2026 — Database Taxonomy & Dynamic Pills (Phase 4-5)

### What Changed

1. **SQL Migration: `supabase-phase4-taxonomy.sql`** (NEW FILE)
   - `venues` table: Added `venue_type TEXT` and `tags TEXT[]` columns
   - `artists` table: Added `is_tribute BOOLEAN DEFAULT false`
   - `events` table: Added `artist_id UUID REFERENCES artists(id)` foreign key + index
   - Created `shortcut_pills` table (dynamic, admin-managed filter pills) with `filter_type`, `filter_config JSONB`, `seasonal_start/end` dates
   - Backfill: links existing events → artists by matching `artist_name`
   - Seeds venue types (Beach Bar, Brewery, Restaurant, Bar, Venue) for known venues
   - Seeds 7 initial pills (6 standard + 1 seasonal St. Patty's example)

2. **Frontend Query: Relational Join** (`src/app/page.js`)
   - Event query now joins `artists(name, bio, genres, vibes, is_tribute, image_url, instagram_url)` alongside existing `venues()` join
   - Event mapping pulls `artist_genres`, `artist_vibes`, `is_tribute`, `venue_type` from joined data
   - Bio now prefers joined `artists.bio` over legacy `events.artist_bio`

3. **Dynamic Shortcut Pills** (`src/app/page.js`)
   - Replaced hardcoded `SHORTCUT_PILLS` array with `dbPills` state fetched from `shortcut_pills` Supabase table
   - Added `MATERIAL_ICON_PATHS` lookup (icon name → SVG path) for rendering DB-stored icon names
   - Pill filtering now uses `filter_type` switch: `trending`, `venue_type`, `genre`, `is_tribute`, `search`, `time`
   - Seasonal pills auto-filtered by `seasonal_start`/`seasonal_end` dates
   - To add a new pill: INSERT into `shortcut_pills` table via Supabase dashboard — no deploy needed

4. **EventCardV2: Genre Chips + Tribute Badge** (`src/components/EventCardV2.js`)
   - Shows genre tags as small rounded chips below the bio
   - Shows purple "🎭 Tribute" badge for tribute/cover bands
   - Falls back to artist image if event has no image

5. **Perplexity AI Lookup: Structured Output** (`src/app/api/admin/artists/ai-lookup/route.js`)
   - Updated system prompt to return `is_tribute` boolean (true for cover/tribute bands)
   - Response normalization now includes `is_tribute` field

6. **Sync Route: artist_id Linking** (`src/app/api/sync-events/route.js`)
   - Enrichment loop now links events → artists via `artist_id` FK
   - Tracks `eventsLinked` count in enrichment response
   - Admin artists POST route now accepts `is_tribute` field

### SQL Migration — Run BEFORE deploying
```sql
-- Run supabase-phase4-taxonomy.sql in Supabase SQL Editor
-- (file is in repo root)
```

### Shortcut Pills Config
Each pill in the `shortcut_pills` table has:
- `filter_type`: One of `trending`, `venue_type`, `genre`, `is_tribute`, `search`, `time`
- `filter_config` (JSONB): Type-specific config, e.g.:
  - `{"venue_types": ["Beach Bar"]}` for venue_type pills
  - `{"genres": ["Acoustic"], "terms": ["acoustic", "solo"]}` for genre pills
  - `{"terms": ["st. patrick", "irish"]}` for keyword search pills
  - `{"before_hour": 17}` for time-based pills
- `seasonal_start` / `seasonal_end`: Optional DATE fields for auto-activate/deactivate

### Deploy Steps
1. Run `supabase-phase4-taxonomy.sql` in Supabase SQL Editor
2. Deploy code: `npx vercel --prod` or push to main
3. Trigger a sync to backfill `artist_id` FKs on events

### Files Modified
- `src/app/page.js` — relational join, dynamic pills, `MATERIAL_ICON_PATHS` lookup, header clear-all X, "Any time" label fix
- `src/components/EventCardV2.js` — genre chips, tribute badge, artist image fallback
- `src/app/api/admin/artists/ai-lookup/route.js` — structured output with `is_tribute`
- `src/app/api/admin/artists/route.js` — `is_tribute` in POST
- `src/app/api/sync-events/route.js` — `artist_id` linking in enrichment, bio overwrite protection
- `src/lib/enrichLastfm.js` — disambiguation bio rejection, 300-char bio cap, Last.fm tags → genres array
- `supabase-phase4-taxonomy.sql` — new migration file (includes Karaoke, Trivia, Specials pills)

### QA Fixes Applied (same session)
- **Bio overwrite protection:** Last.fm disambiguation bios ("There are numerous artists...") now rejected. Bios capped at 300 chars. Sync only overwrites bios < 100 chars (protects curated/Perplexity bios).
- **Genre chips wiring:** Last.fm tags now auto-populate `artists.genres` array (top 3 tags, won't overwrite curated genres from AI lookup). Genre chips render on EventCardV2 after sync populates data.
- **Trending pill:** Threshold raised to top 25% busiest venues with minimum 8 events. Still needs a better signal (click count, curated flag) — currently shows too many events.
- **New pills added:** Karaoke (keyword search), Trivia (keyword search), Specials (keyword search). Need seed SQL run in Supabase.
- **St. Patty's extended:** seasonal_end moved to 2026-03-22 for Belmar parade weekend.
- **Header clear-all X:** Small X button next to filter count badge in collapsed omnibar — clears all filters without opening panel.
- **"Any time" label:** WHEN dropdown default now reads "Any time" (lowercase t) to match "Any distance".

### Known Bugs / Open Issues
1. **403 Forbidden on Supabase:** `shortcut_pills` table query returns 403 — likely means the Phase 4 SQL migration hasn't been run yet, or the RLS policy didn't apply. Run `supabase-phase4-taxonomy.sql` to fix.
2. **500 on `/api/follows`:** The `user_follows` table may not exist. Run `supabase-phase2-follows.sql` in Supabase SQL Editor to create it.
3. **Stale Supabase session warnings:** Console shows "Session as retrieved from URL expires in -171151s" — this is a GoTrue auth token that expired. Harmless for anonymous users but can be fixed by clearing the auth session or calling `supabase.auth.signOut()`.
4. **Click-outside panel dismissal:** Tapping blank space inside the filter panel doesn't close it. The scrim overlay (behind the panel) and the header both close it, but the panel interior padding does not. Needs a different approach (possibly a close gesture or dedicated close zone).
5. **Trending pill logic:** Shows ~909 events — needs a real popularity signal (view count, click tracking, or admin curation) instead of just event-count-per-venue.

---

## Session: March 18, 2026 — "My Jam" Overhaul, Ticket Stubs & Artist Profiles

### What Changed

Complete redesign of the "My Jam" (saved) tab with retro ticket stub cards, an artist profile screen, and numerous UX polish passes.

### New Components Created

| Component | File | Purpose |
|---|---|---|
| `SavedGigCard` | `src/components/SavedGigCard.js` | Brand Orange retro ticket stub for saved events. 3-column layout: left date/time stub (split into date column + vertical rotated time), middle body with monospace ARTIST/VENUE labels, right action stub with remove (confirm dialog) + share icons. Dark slate paper background, muted gray structural borders, 8px orange top strip. |
| `ArtistProfileScreen` | `src/components/ArtistProfileScreen.js` | Full-screen artist detail overlay (z-index 200). Conditional hero image (300px edge-to-edge with gradient fade, hidden entirely if no image), artist name, ghost follow/unfollow pill button, bio with fallback text, lightweight upcoming shows text list (orange dates + title-case venues). |
| `ArtistListItem` | `src/components/ArtistListItem.js` | Standalone artist row component (created early, now unused — list is inlined in FollowingTab). Can be deleted if desired. |

### Components Modified

**`src/components/EventCardV2.js`**
- Removed left 4px accent border bar
- Time block border-radius changed from `8px 0 0 8px` to `12px 0 0 12px` (flush with outer card)
- Compact row left padding set to 0 (stub flush against card edge)
- Removed category emoji (`{config.emoji}`) between time block and artist name

**`src/components/FollowingTab.js`** — Major rewrite
- Added local search bar ("Search your artists...") with real-time filtering
- Rows simplified: Avatar (48px circle) → Artist Name → Gray Chevron `>`
- Removed: remove_circle_outline button, next gig info block, notification bell, "Following" pill button
- Rows are clickable — artists open `ArtistProfileScreen`, venues open existing bottom sheet
- Artist image lookup via `useMemo` map from events array (`artist_image || image_url`)
- Fallback avatar: dark gray circle with Brand Orange `music_note` SVG
- Empty state + trending artists carousel preserved

**`src/components/SavedGigCard.js`** — Evolved through several iterations:
1. Started as `PurpleTicketCard` (deep violet theme) — deleted
2. Pivoted to Brand Orange with muted gray structural borders
3. Left stub split into 2 inner columns: date stack + vertical rotated time
4. Time format: full `h:mm AM/PM` (e.g., "7:00 PM") via custom parser from `event.start_time`
5. Font smoothing: `-webkit-font-smoothing: antialiased` on all stub text
6. Remove button uses `window.confirm()` before calling `onToggleFavorite`

### Page.js Changes (`src/app/page.js`)

**Navigation & Toggle**
- Segmented control redesigned: dark slate container with Brand Orange active pill (white text + orange glow shadow)
- Toggle labels: "My Shows" / "My Artists" (renamed from "Upcoming Gigs" / "Followed Artists")
- Default segment forced to `'events'` (My Shows) every time user taps the My Jam tab via `handleSetSavedSegment('events')` in bottom nav click handler
- Session storage persistence via `mlj_saved_segment` key

**Header Conditional Rendering**
- Global search/filter omnibar pill hidden on `saved` and `profile` tabs
- Orange `+` "Add to the Jar" FAB hidden on `saved` and `profile` tabs
- Header on My Jam = clean `myLocalJam` logo only

**Artist Profile Navigation**
- New state: `const [artistProfile, setArtistProfile] = useState(null)` — holds artist name string
- `onEntityTap` in FollowingTab: artists → `setArtistProfile(name)`, venues → `setBottomSheet(...)`
- `ArtistProfileScreen` rendered as fixed overlay when `artistProfile` is set
- Props passed: `artistName`, `events`, `darkMode`, `isFollowed`, `onFollow`, `onUnfollow`, `onBack`

**6:00 AM Rollover Expiration (My Shows feed)**
- Saved events filtered on frontend only — events stay visible until 6:00 AM the morning after the event date
- Logic: `new Date(e.date + 'T06:00:00')` + 1 day, compare to `now`
- Does NOT delete from `user_saved_events` table — data preserved for future "Gig Diary" feature
- Same rollover logic applied in `ArtistProfileScreen` upcoming shows list

### Files Created
- `src/components/SavedGigCard.js`
- `src/components/ArtistProfileScreen.js`
- `src/components/ArtistListItem.js` (unused, can be cleaned up)

### Files Deleted
- `src/components/PurpleTicketCard.js` (replaced by SavedGigCard)

### Files Modified
- `src/app/page.js` — imports, state, toggle UI, header conditionals, artist profile rendering, 6AM rollover filter
- `src/components/EventCardV2.js` — removed accent border, emoji, adjusted radii/padding
- `src/components/FollowingTab.js` — complete list rewrite with search, simplified rows, clickable navigation

### Database Impact
- **None** — all changes are frontend-only. No new tables, no migrations, no RLS changes needed.
- `user_saved_events` and `user_followed_artists` tables (from previous session) remain unchanged.

### Known Issues
1. **ArtistListItem.js is unused** — was created as a standalone component but the list rendering was later inlined directly in FollowingTab. Safe to delete.
2. **Artist images depend on events data** — if an artist has no upcoming events in the current dataset, their avatar in the Following list will show the fallback music note. Image lookup is `artist_image || image_url` from matching events.
3. **6AM rollover is client-side only** — the filter runs on each render using `new Date()`. If a user leaves the tab open overnight, events will disappear at 6AM without a refresh. This is acceptable behavior.

---

## Session: March 18, 2026 — Sprint 1: Event Auto-Sorter & Triage

### What Changed

**Phase 1: Auto-Sorter Pipeline** (`src/app/api/sync-events/route.js`)
- Runs after event upsert, before Last.fm enrichment
- **Known Artist Fast-Track:** Cross-references `artist_name` against all names in the `artists` table. If exact match found → `category = 'Live Music'`, `triage_status = 'reviewed'`, goes straight to live feed.
- **Keyword Routing:** If no artist match, scans title+description for keyword patterns:
  - `['trivia', 'bingo', 'feud', 'game night', 'quiz']` → Trivia
  - `['pint night', 'taco', 'wings', 'happy hour', 'drink special', ...]` → Food & Drink Special
  - `['ufc', 'nfl', 'football', 'watch party', ...]` → Sports / Watch Party
- Events auto-sorted by Phase 1 completely bypass the Triage inbox
- Sync response now includes `autoSort: { knownArtistMatches, keywordRouted, unknownsForTriage }`

**Phase 2: Triage Inbox** (`src/app/admin/page.js`)
- "Triage" tab (first/default tab in admin) shows ONLY events that couldn't be auto-sorted (`triage_status = 'pending'`)
- Professional category pill buttons: **Live Music** (green), **Food & Drink** (amber), **Trivia** (purple), **Sports** (blue)
- Edit pencil + SVG trash can for junk deletion
- Non-music categories clear `artist_bio`/`artist_id` from the event
- "Inbox Zero" state when all events are reviewed

**Phase 3: Error Correction** (`src/app/admin/page.js`)
- **History tab:** Each event row now has an inline category `<select>` dropdown, colored by current category
- Changing the dropdown instantly re-routes the event (same logic as triage: non-music clears artist data)
- Toast confirmation on category change
- **User Reports:** Frontend EventCardV2 already has a "Report Issue" flag button (flag-event API → Reports tab in admin). No changes needed — this flow is intact.

### Data Flow (End-to-End)
```
Scraper → mapEvent() → upsert (triage_status defaults to 'pending')
  ↓
Auto-Sorter:
  ├─ Known artist match? → Live Music (reviewed) → live feed
  ├─ Keyword match? → Trivia/Food/Sports (reviewed) → live feed
  └─ No match → stays pending → Triage inbox
  ↓
Admin Triage (manual):
  ├─ Tap pill → categorized + reviewed → live feed
  └─ Tap trash → deleted
  ↓
Error Correction:
  └─ History tab → change dropdown → re-categorized live
```

### SQL Migration — Run BEFORE deploying
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'pending';
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Live Music';
CREATE INDEX IF NOT EXISTS idx_events_triage ON events(triage_status, event_date);
UPDATE events SET triage_status = 'reviewed' WHERE triage_status IS NULL OR triage_status = 'pending';
```

### Deploy Steps
1. Run the SQL above in Supabase SQL Editor
2. Deploy code
3. Trigger a sync — check the response for `autoSort` stats
4. Open /admin → Triage tab will show only unknowns the auto-sorter couldn't handle

### Files Modified
- `src/app/api/sync-events/route.js` — Auto-sorter pipeline (Phase 1)
- `src/app/admin/page.js` — Triage tab (Phase 2), History tab category dropdown (Phase 3)
- `src/app/api/admin/route.js` — triage filter, category/triage_status in PUT/POST, future-date filter for triage
- `supabase-sprint1-triage.sql` — migration file

---

## Session: March 19, 2026 — Sprint 2: AI Artist Command Center + Scraper Memory

### What Changed

#### Sprint 2: Artist Metadata Command Center
1. **Traffic Light Status Pills** (`src/app/admin/page.js`)
   - Red = missing/null, Yellow = AI-generated pending review, Green = approved & live
   - Powered by new `field_status JSONB` column on `artists` table
   - Locked fields show 🔒 icon (from `is_human_edited JSONB`)

2. **Granular Missing-Data Filters**
   - Replaced single "Needs Info" toggle with four filter chips: Missing Bio, Missing Image, Missing Genre, Missing Vibe
   - Combinable — checking multiple shows artists missing *any* of the selected fields
   - CSV export respects active filters

3. **Bulk AI Enrichment with Staging**
   - Select artists → "Run AI Enrichment" → async progress bar
   - AI-filled fields default to Yellow "pending" status (not live until admin approves)
   - Respects `is_human_edited` lock — never overwrites human edits

4. **Approve & Publish Workflow** (Edit Modal)
   - Two save buttons: "Save Draft" (saves edits, locks changed fields) and "Approve & Publish" (sets all populated fields to Green/live, locks everything)
   - Associated Events section shows venue, date, and source link for each event linked to the artist

5. **Clean SVG Action Icons**
   - Removed beer mug emoji and "Convert to Special" button
   - Replaced with SVG pencil (edit) and SVG trash can (delete) matching Event Feed style

6. **Smart Delete Modal**
   - Clicking trash on an artist shows a confirmation modal with event count
   - **Option A — "Delete & Hide Events"**: Deletes artist, archives linked upcoming events
   - **Option B — "Delete & Keep Events"**: Deletes artist, keeps events live as "Other / Special Event" with null artist_id
   - Deleted artists are automatically added to the blacklist (see Scraper Memory below)

#### Event Feed Cleanup
- Tab renamed "History" → **"Event Feed"**
- Default sort: `created_at DESC` (most recently scraped at top)
- Default filter: **Upcoming** (future + published)
- Filter labels: **Upcoming** / **Past** / **Hidden**
- Star/spotlight icon removed from rows (dedicated Spotlight tab handles this)
- Inline category `<select>` dropdown on every row for error correction

#### Triage Enhancements
- **"Other / Special Event"** category added to triage pills, auto-sorter keywords, and Event Feed dropdown
- **Instant Inbox Zero**: Tapping a pill or trash instantly removes the row (no save button)
- **Undo Toast**: 5-second toast with clickable "Undo" button reverts category to null and restores the row
- **Source Link**: Clickable `🔗 domain.com` link next to venue/date on triage cards (opens in new tab)

#### Scraper Memory & Deduplication
1. **Artist Blacklist** (`ignored_artists` table)
   - When an admin deletes an artist, the name is added to `ignored_artists` with a lowercase index
   - Sync route loads the full blacklist before enrichment and skips any matching names
   - Prevents re-creation of deleted/fake artist profiles (e.g., "Kids Easter Egg Hunt")

2. **Human-Edit Protection** (`is_human_edited` on events)
   - New `is_human_edited BOOLEAN` column on events table
   - Automatically set to `true` when admin changes category via triage, Event Feed dropdown, or any admin PUT
   - Sync route skips human-edited events during enrichment — the scraper never overwrites admin changes
   - Backfill marks existing non-"Live Music" categorized events as human-edited

3. **Event Deduplication**
   - Already handled by `external_id` upsert (`onConflict: 'external_id'`) — scraper-generated unique IDs prevent duplicates
   - Upsert only updates columns present in the scraper payload — `category`, `triage_status`, `is_human_edited` are NOT in the payload, so they're never overwritten

### Data Migration — Run BEFORE deploying

```sql
-- Sprint 2: AI Artist Command Center
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_human_edited JSONB DEFAULT '{}';
ALTER TABLE artists ADD COLUMN IF NOT EXISTS field_status JSONB DEFAULT '{}';

UPDATE artists SET field_status = jsonb_build_object(
  'bio', CASE WHEN bio IS NOT NULL THEN 'live' ELSE null END,
  'image_url', CASE WHEN image_url IS NOT NULL THEN 'live' ELSE null END,
  'genres', CASE WHEN genres IS NOT NULL AND array_length(genres, 1) > 0 THEN 'live' ELSE null END,
  'vibes', CASE WHEN vibes IS NOT NULL AND array_length(vibes, 1) > 0 THEN 'live' ELSE null END
)
WHERE field_status = '{}' OR field_status IS NULL;

-- Scraper Memory: Artist Blacklist
CREATE TABLE IF NOT EXISTS ignored_artists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  reason TEXT DEFAULT 'admin_deleted',
  deleted_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_artists_name ON ignored_artists(name_lower);
ALTER TABLE ignored_artists ENABLE ROW LEVEL SECURITY;

-- Scraper Memory: Human-Edit Protection
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_human_edited BOOLEAN DEFAULT false;
UPDATE events SET is_human_edited = true
WHERE is_human_edited = false
  AND triage_status = 'reviewed'
  AND category IS NOT NULL
  AND category != 'Live Music';
```

### Files Modified
- `src/app/admin/page.js` — Full Artists tab overhaul (traffic lights, filters, bulk enrichment, approve workflow, smart deletes, edit modal with associated events), Event Feed renaming/filtering, triage enhancements (Other category, undo toast, source links)
- `src/app/api/admin/route.js` — `is_human_edited` auto-set on category change, `artist_id` in PUT allowlist
- `src/app/api/admin/artists/route.js` — Smart delete (hide-events/unlink-events/count-events modes), blacklist insertion on delete
- `src/app/api/sync-events/route.js` — Blacklist loading, human-edit skip, enrichment stats (blacklistedSkipped, humanEditedSkipped), "Other / Special Event" keyword routing
- `supabase-sprint2-artists.sql` — `is_human_edited` JSONB, `field_status` JSONB, backfill
- `supabase-scraper-memory.sql` — `ignored_artists` table, `is_human_edited` on events, backfill

### Deploy Steps
1. Run the SQL migration above in Supabase SQL Editor
2. Deploy code (`npx vercel --prod`)
3. Trigger a sync — check response for `blacklistedSkipped` and `humanEditedSkipped` stats
4. Open /admin → Artists tab to verify traffic light pills and filters

---

## Session: March 19, 2026 — AI Pipeline Polish, UX Fixes & Bug Fix

### What Changed

#### AI System Prompts (Backend LLM Integration)
- **Bio Writer** — Updated prompt: "Strictly 2-3 sentences, under 60 words, MUST complete final sentence." Removed hard `.slice(0, 400)` truncation. `max_tokens` already at 600.
- **Genre/Vibe Tagger** — Strict allowlist enforcement with canonical lists synced between `ai-lookup/route.js` and `src/lib/utils.js`
- **Price Extractor** — Regex-first (no AI credits): extracts "$X Cover" for bars, "From $X" for ticketed events, "Free" for free. Cleans up Ticketmaster decimal checkout totals (estimates base price by backing out ~27% fees). Runs every sync.
- **Image Search** — Serper.dev integration: queries `"[Artist Name] band live music"`, returns top 5 URLs for carousel. Fallback: 8 Unsplash music placeholders.

#### Canonical Allowed Tags (`src/lib/utils.js`)
- **Genres:** Rock, Pop, Country, Acoustic, Cover Band, DJ, Electronic, Jazz, Blues, Reggae, R&B, Hip Hop, Emo, Punk, Metal, Indie, Folk
- **Vibes:** High Energy, Chill, Dance Party, Sing-along, Background Music, Heavy, Family Friendly

#### Admin UX Polish
- **Image Carousel** — `< >` overlay arrows on Mobile Preview pane cycle through top 5 Serper results. "Search for images" button triggers Serper when carousel is empty. Counter shows "2 of 5".
- **Regenerate Buttons** — Per-field 🔄 icons next to Bio, Genres, and Image URL in edit modal. Forces fresh AI call for that single field, bypasses smart-skip.
- **Sticky Table Header** — Artist table header (ARTIST / STATUS / ACTIONS) now pinned with `position: sticky; top: 0`.
- **Search Bar** — Capped at `max-width: 400px`. Clear X icon inside right edge (only visible when text present, clears and re-fetches on click).
- **Status Pills** — Changed to `flex-wrap: nowrap; min-width: 220px` so all four pills (Bio, Img, Genre, Vibe) stay on one line.
- **Modal Copy** — AI Enrichment confirmation now reads "images, bios, genres, and vibes" (was missing "images").
- **Sticky Bulk Action Bar** — Floating bar at viewport bottom (only when artists selected) with count, "Deselect All", and "Run AI Enrichment" button + progress bar.
- **Magic Wand Shortcut** — Sparkle SVG icon on every artist row for instant single-artist AI enrichment (bypasses checkbox workflow).
- **Enrichment Confirmation Modal** — Lists selected artist names with avatars and missing-field indicators before executing.

#### Bug Fix: Client-Side Crash on "Keep Events" Delete
- **Root Cause:** The delete modal handlers called `setDeleteConfirm(null)` before the async API call, then referenced `deleteConfirm.artist.id` and `deleteConfirm.artist.name` in subsequent lines. After React re-rendered with `deleteConfirm = null`, the stale closure references caused the crash.
- **Fix:** Destructure `const { artist, eventCount } = deleteConfirm` into local variables BEFORE calling `setDeleteConfirm(null)`. Both Option A (Hide Events) and Option B (Keep Events) handlers are now safe.

### Files Modified
- `src/app/api/admin/artists/ai-lookup/route.js` — Two-pass Perplexity (Bio Writer + Genre/Vibe Tagger) + Serper image search returning `image_candidates[]`, updated bio prompt (word limit, no truncation)
- `src/app/api/sync-events/route.js` — Price extractor (regex + decimal cleanup), auto-sorter "Other" keywords
- `src/app/admin/page.js` — Image carousel, regenerate buttons, sticky header, search bar resize/clear, status pill nowrap, modal copy, sticky bulk action bar, magic wand icon, enrichment confirmation modal, delete crash fix
- `src/lib/utils.js` — Canonical GENRES and VIBES arrays aligned with AI prompts

#### Bulk Delete Feature
- **Sticky bar** now has red "Delete (N)" button alongside AI Enrich button
- **Bulk delete confirmation modal** — fetches aggregate event counts, shows artist name list, Option A (Delete & Hide Events) / Option B (Delete & Keep Events as "Other")
- Option B only shown when linked events exist

#### Critical Bug Fix: Deleted Artists Reappearing
- **Root cause:** Multiple code paths re-created deleted artists from event data:
  1. `/api/enrich-artists` standalone endpoint called `enrichWithLastfm` without blacklist
  2. `/api/admin/artists/backfill` scanned all events and re-inserted blacklisted names
  3. Sync route enrichment queried ALL events regardless of category — drink specials triggered artist creation
  4. Delete API nulled `artist_id` but left `artist_name` intact, allowing enrichment to re-create the row
  5. Delete API only cleaned upcoming published events, missing past/archived ones
- **Fixes applied (5 layers of protection):**
  1. `enrichWithLastfm` now accepts `{ blacklist }` param and rejects matching names
  2. `/api/enrich-artists` loads blacklist and filters names before enrichment
  3. `/api/admin/artists/backfill` loads blacklist and skips matching names
  4. Sync route enrichment now filters to ONLY `Live Music` or uncategorized events: `.or('category.is.null,category.eq.Live Music')`
  5. Auto-sorter sets `artist_id = null` on non-music events when categorizing
  6. Delete API now sets `is_human_edited = true` on ALL events matching the artist name (nuclear cleanup)
  7. Delete API "hide-events" and "unlink-events" modes now also set `is_human_edited = true`

#### Bug Fix: Client-Side Crash on Delete Modal
- **Root cause:** `showQueueToast({ msg: '...' })` double-wrapped the message object. `showQueueToast` already wraps in `{ msg, undoFn }`, so passing an object created `{ msg: { msg: '...' } }` which React couldn't render.
- **Fix:** Changed delete handlers to pass plain strings: `showQueueToast('Deleted...')`
- **Also fixed:** Destructure `const { artist, eventCount } = deleteConfirm` before `setDeleteConfirm(null)` to prevent stale closure references

### Files Modified
- `src/app/api/admin/artists/ai-lookup/route.js` — Serper top-5 carousel, bio prompt word limit, image candidates array
- `src/app/api/admin/artists/route.js` — Nuclear cleanup on delete (is_human_edited on all matching events)
- `src/app/api/admin/artists/backfill/route.js` — Blacklist check added
- `src/app/api/sync-events/route.js` — Category filter on enrichment query, auto-sorter nulls artist_id on non-music, price extractor
- `src/app/api/enrich-artists/route.js` — Blacklist check added
- `src/lib/enrichLastfm.js` — Blacklist parameter support
- `src/app/admin/page.js` — Image carousel, regenerate buttons, sticky header, search resize/clear, status pill nowrap, bulk delete, sticky bar, magic wand, enrichment confirmation modal, delete crash fixes
- `src/lib/utils.js` — Canonical GENRES and VIBES arrays

### No SQL Migration Needed
All changes are code-only. Existing DB columns are sufficient.

---

---

## Session: March 20, 2026 — Admin Overhaul, Data Cleanup & Spotlight Fix

### Critical Bug Fix: UTC Timezone Mismatch (Root Cause of Multiple Issues)

**Problem:** Events stored in Supabase use UTC timestamps. An 8:30 PM Eastern show becomes `2026-03-21T00:30:00Z` — the UTC date is the *next day*. Every piece of code that compared dates using `.slice(0, 10)` (string-based UTC date extraction) would miss evening events entirely.

**Affected areas (all fixed):**
- Spotlight picker: filtered today's events by UTC date string, missing all evening shows
- Spotlight GET API: same UTC date range issue, missed events after ~7 PM Eastern
- Spotlight Tier 3 evening range: used UTC times instead of Eastern-adjusted
- Artist "Next Event" column: minor impact (display only)

**Fix pattern — use everywhere going forward:**
```javascript
// WRONG — compares UTC date, misses evening events
const match = (ev.event_date || '').slice(0, 10) === '2026-03-20';

// RIGHT — converts to Eastern before comparing
const evDateET = new Date(ev.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const match = evDateET === '2026-03-20';

// RIGHT (server-side) — extend UTC range to cover Eastern evening
const dateStart = `${date}T04:00:00`;   // midnight ET = 4-5 AM UTC
const dateEnd = `${nextDateStr}T05:59:59`; // covers through ~1 AM ET next day
```

**Rule for future development:** Never use `.slice(0, 10)` on UTC ISO strings to compare dates in the Jersey Shore timezone. Always convert to `America/New_York` first, or use extended UTC ranges.

### Critical Bug Fix: Spotlight Save Flow

**Problem:** The spotlight save appeared to succeed but data reverted on reload. Three layered issues:

1. **`spotlight_events` table didn't exist** — the POST endpoint wrote to it, got a 500 error, but the UI didn't check the response status. The GET endpoint never read from it either (only checked `is_featured` on events table).
2. **Stale ghost IDs** — deleted/past event IDs persisted in `spotlightPins` state array. The display filtered them visually but the raw array still sent them to the save API, polluting the database.
3. **Async race condition** — `fetchSpotlight` loaded pin IDs before `fetchSpotlightEvents` finished, so pin validation against the events list always failed.

**Fix:**
- Created `spotlight_events` table (see SQL migrations below)
- GET endpoint now reads from `spotlight_events` first; returns admin pins immediately if they exist, skips algorithm
- `fetchSpotlightEvents` now returns the events array; `fetchSpotlight` awaits it and filters pins synchronously before setting state
- `saveSpotlight` filters stale IDs from `spotlightPins` before writing to DB
- `toggleSpotlightPin` auto-purges stale IDs on every interaction

### Admin Bulk Tools

**Bulk Delete (upgraded):**
- Sticky bar Delete button now fetches per-artist event counts
- Modal shows granular list: each artist with their individual upcoming event count
- Red (Delete & Hide) and Yellow (Delete & Keep as Other) buttons

**Merge Duplicates (new):**
- Blue "Merge (N)" button appears when 2+ artists checked
- Modal with radio buttons to select master profile (shows avatar, data status pills)
- Execution: transfers all events from duplicates to master (by `artist_id` and `artist_name`), saves duplicate names as aliases, deletes duplicate rows
- API: `POST /api/admin/artists/merge` — `{ masterId, duplicateIds[] }`

**Bulk Edit Time (new):**
- Checkbox column on Events table with select-all
- Bulk action bar with "Edit Time (N)" button
- Modal with single time input; updates `event_date` on all selected events (preserves date, changes time only)
- Selection clears on search change, filter change, or after save

### Event Title Field

- New `event_title` column on events table (nullable)
- Added to Edit Event modal above Artist Name field
- Display priority: `event_title > artist_name` across all components (EventCard, EventCardV2, SiteEventCard, SpotlightCarousel, HeroSection)
- Use case: festival events like "Annual Mushfest" featuring artist "Mushmouth"

### Artist Edit Enhancements

**Editable Artist Name:**
- Name field added to top of edit modal
- Renaming auto-saves old name as alias (prevents scraper from re-creating duplicates)
- Events linked to the artist get their `artist_name` updated

**Artist Aliases System:**
- New `artist_aliases` table: `artist_id`, `alias`, `alias_lower` (unique index)
- Populated automatically on: artist rename, merge, name correction
- Scraper checks aliases before creating new artists (`enrichWithLastfm` + sync route event-linking)
- Prevents the "renamed artist reappears as duplicate" problem

**Genre/Vibe Tag Pickers:**
- Converted from free-text inputs to clickable pill buttons (multi-select)
- Controlled vocabulary enforced in UI, AI prompt, and server-side validation
- Genres: Rock, Pop, Country, Reggae, Jazz/Blues, R&B/Soul, Hip-Hop, EDM/DJ, Tribute/Cover, Alternative, Jam Band
- Vibes: High-Energy, Chill/Acoustic, Dance Heavy, Sing-Along, Background Music, Family Friendly, Late Night
- Migration script maps old freeform values to new vocabulary (`supabase-migrate-tags.sql`)

### Event Feed UI Overhaul

- View filters (Upcoming/Past/Hidden) changed from orange pills to clean underline tabs
- Sort buttons replaced with single dropdown: "Sort by: Event Date (soonest)" etc.
- Server-side filtering via `?status=upcoming|past|hidden` param on admin API — fixes the "0 events on load" bug
- Default sort: `event_date asc` (tonight's events at top)
- Search bar with clear X button
- Event selection state clears on search/filter/tab changes

### Live Feed & Cache Fixes

**Artist data JOIN:**
- Public `/api/events` now JOINs `artists(name, bio, image_url, genres, vibes, is_tribute, instagram_url)`
- Admin `/api/admin` also JOINs `artists(name, image_url)`
- Frontend components prioritize artist-level data over stale event-level fields

**Image priority (all card components):**
```
artist_image > image_url > venue_photo > branded gradient fallback
```

**Cache revalidation:**
- Artist PUT endpoint now calls `revalidatePath('/')` and `revalidatePath('/api/events')`
- Public events API set to `force-dynamic`

**Branded fallback graphics:**
- HeroSection and SpotlightCarousel use orange/teal gradient with subtle "MYLOCALJAM" watermark when no image exists
- Replaces broken Unsplash placeholder URLs

### Scraper Improvements

**Deduplication:**
- Added unique index on `external_id` column (was missing — root cause of all duplicate events)
- Crossroads duplicates purged (old slug-format vs new numeric-format `external_id`)
- `supabase-dedup.sql` migration handles cleanup

**Instagram/Facebook image blacklist:**
- Serper image search now filters out `instagram.com`, `lookaside`, `scontent`, `facebook.com` CDN URLs
- These domains block hotlinking with CORS/403 errors

**Artist alias awareness:**
- `enrichWithLastfm` checks `artist_aliases` table before creating new artist profiles
- Sync route event-linking augments the name-to-artist map with alias lookups

### Mobile App Updates

**Flag modal — "Other / Incorrect Info":**
- Third option added to EventCardV2 flag bottom-sheet
- Progressive disclosure: tapping reveals text area (200 char limit) + "Submit Report" button
- Posts to existing `/api/reports` endpoint with `issue_type: 'other'`

**Admin Reports tab rebuilt:**
- Color-coded type pills (red cancel, yellow cover, blue other)
- Shows venue, date, user's quoted text, timestamp
- "Edit Event" button opens the event directly in the edit modal

**Event modal cleanup:**
- Removed deprecated Recurring and Spotlight checkboxes
- Genre/Vibe dropdowns show inherited artist values as placeholder ("Inheriting: Rock, High-Energy")
- Override logic: event-level genre/vibe takes priority over artist-level on the live feed

### Spotlight Picker UX

- Missing-image warning badge ("⚠️ No Image") on events without artist image
- Warning modal intercepts pin attempt: "Edit Artist Profile" or "Spotlight with Default Graphic"
- Search bar added to spotlight picker (same logic as Event Feed)
- Stale/ghost pins auto-purged from state and database

### SQL Migrations Required (Run in Supabase SQL Editor)

1. `supabase-event-title.sql` — `event_title` column on events
2. `supabase-dedup.sql` — unique index on `external_id`, purges duplicates
3. `supabase-artist-aliases.sql` — aliases table for scraper memory
4. `supabase-migrate-tags.sql` — maps old genre/vibe strings to controlled vocabulary
5. `spotlight_events` table — manual pins for spotlight carousel

### Files Created
- `src/app/api/admin/artists/merge/route.js` — merge duplicates endpoint

### Files Modified
- `src/app/admin/page.js` — bulk delete upgrade, merge tool, bulk edit time, event title field, artist name editing, genre/vibe tag pickers, event feed UI overhaul, spotlight picker with search/warnings/stale-pin cleanup
- `src/app/api/admin/route.js` — `event_title` support, server-side status filtering, artists JOIN
- `src/app/api/admin/artists/route.js` — rename + alias creation, next_event_date attachment, cache revalidation
- `src/app/api/admin/artists/merge/route.js` — alias creation on merge
- `src/app/api/admin/artists/ai-lookup/route.js` — Instagram CDN blacklist, updated genre/vibe seed lists
- `src/app/api/events/route.js` — artists JOIN, force-dynamic
- `src/app/api/spotlight/route.js` — reads from spotlight_events table first, Eastern-aware date ranges
- `src/app/api/sync-events/route.js` — alias-aware event linking, explicit upsert options
- `src/app/api/flag-event/route.js` — unchanged (Other reports go through /api/reports)
- `src/app/page.js` — event_title priority, genre/vibe override logic, artist image priority
- `src/components/EventCard.js` — event_title display
- `src/components/EventCardV2.js` — artist image priority, "Other" flag option
- `src/components/SiteEventCard.js` — event_title + artist image
- `src/components/SpotlightCarousel.js` — artist image priority, branded fallback watermark
- `src/components/HeroSection.js` — artist image priority, branded gradient fallbacks
- `src/lib/enrichLastfm.js` — alias-aware cache lookup
- `src/lib/utils.js` — updated genre/vibe controlled vocabulary

---

## Session: March 21, 2026 — Follow Action Sheet, Mobile Hover Fix, Google Auth Cleanup

### What Changed

1. **Follow Action Bottom Sheet** (`src/components/FollowActionSheet.js`) — New component replacing the toast upsell when saving an event. Full bottom sheet menu with tonal burnt-orange buttons (#3E2723 bg, white text). Menu options: Follow Artist, Follow Venue, Follow Both (heart icon), Save Event Only, Cancel. The plus icon does NOT toggle until after a menu selection. Matches existing flag sheet pattern (overlay, slideUp animation, drag handle).

2. **Event save flow rewrite** (`src/app/page.js`) — `toggleFavorite` now opens the Follow Action Sheet instead of immediately saving + showing a toast. If already saved, unsaves immediately. Added `followSheet` state, extracted `saveEventToDb`/`unsaveEventFromDb`, added `handleFollowSheetAction` callback.

3. **Mobile hover bug fix** (`src/components/EventCardV2.js`) — Removed JS `onMouseEnter`/`onMouseLeave` handlers from share and flag buttons. Replaced with CSS `@media (hover: hover)` query so hover highlights only activate on devices with real hover support (prevents stuck highlight on mobile touchscreens).

4. **Privacy & Terms pages** — Created `/privacy` (`src/app/privacy/page.js`) and `/terms` (`src/app/terms/page.js`) for Google OAuth compliance. Dark themed, DM Sans font, orange accents, contact: mylocaljam@gmail.com.

5. **Google Auth — signInWithIdToken attempt & revert** — Attempted to switch from `signInWithOAuth` (redirect through Supabase) to `signInWithIdToken` (client-side popup via Google Identity Services) to eliminate the Supabase project URL from the Google consent screen. Created `GoogleOAuthWrapper.js`, installed `@react-oauth/google`. After multiple failures (One Tap unreliable on mobile, session conflicts, hidden button proxy-click issues), **reverted entirely** to standard `signInWithOAuth`. Removed GoogleOAuthWrapper from `layout.js`, restored clean AuthModal.js with custom-styled Google/Apple buttons.

### Files Created
- `src/components/FollowActionSheet.js`
- `src/app/privacy/page.js`
- `src/app/terms/page.js`
- `src/components/GoogleOAuthWrapper.js` (created then made unused by revert — can be deleted)

### Files Modified
- `src/app/page.js` — Follow Action Sheet integration, save flow rewrite
- `src/components/EventCardV2.js` — `@media (hover: hover)` CSS fix
- `src/components/AuthModal.js` — Reverted to clean `signInWithOAuth` (no GIS/signInWithIdToken code)
- `src/app/layout.js` — Removed GoogleOAuthWrapper, back to simple `<body>{children}</body>`
- `.env.local` — Added `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `.env.local.example` — Added `NEXT_PUBLIC_GOOGLE_CLIENT_ID` placeholder
- `package.json` / `package-lock.json` — `@react-oauth/google` installed (unused, can be removed)

### Env Vars
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — `952608961093-8fm1g85hfhcfs3ohgm8o44kom4mp4v4f.apps.googleusercontent.com` (already in `.env.local` and Vercel)

### Pending / TODO
- **Google Brand Verification** — Submit app for official Brand Verification in Google Cloud Console so the consent screen displays "mylocaljam" branding instead of the raw Supabase project URL (`ugmyqucizialapfulens.supabase.co`). Go to Google Cloud Console → APIs & Services → OAuth consent screen → publish app and submit for verification. Requires privacy policy URL (`https://mylocaljam.com/privacy`) and terms URL (`https://mylocaljam.com/terms`) — both are deployed.
- **Delete `GoogleOAuthWrapper.js`** — No longer used after revert. Can be safely removed.
- **Optionally uninstall `@react-oauth/google`** — No longer used. Run `npm uninstall @react-oauth/google` if desired, or leave as harmless dep.

---

## Repo
GitHub: `https://github.com/antfocus/mylocaljam.git`
Push to main = auto-deploy on Vercel.
User's local path: `~/mylocaljam` (NOT `~/Documents/mylocaljam`)

