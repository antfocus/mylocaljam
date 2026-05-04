# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~1500+ events** across 44 active scrapers + 2 Playwright scrapers (as of April 20, 2026)

---

## Sync Infrastructure (complete ✅)
- **Route:** `src/app/api/sync-events/route.js` — runs all scrapers in parallel, maps to Supabase schema, batches upserts (50 at a time) with `onConflict: 'external_id'`
- **Cron:** `vercel.json` at root — runs nightly at 10 PM Eastern (UTC 02:00). `maxDuration = 60` on the route (Vercel Hobby default is 10s).
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
| 5 | McCann's Tavern | `mccanns.js` | Google Calendar iCal | ✅ Working (time-from-title extraction, NULL for missing times) | ~15+ |
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
| 26 | Tim McLoone's Supper Club | `timMcLoones.js` | Ticketbud HTML (proxy) | ✅ Working — routed through IPRoyal residential proxy | ~12 |
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
| 39 | Algonquin Arts Theatre | `algonquinArts.js` | Custom PHP HTML (proxy) | ✅ Working — routed through IPRoyal residential proxy | ~16 |
| 40 | Tim McLoone's Supper Club | `timMcLoones.js` | Ticketbud HTML (proxy) | ✅ Working — routed through IPRoyal residential proxy | ~12 |
| 41 | MJ's Restaurant | `mjsRestaurant.js` | Vision OCR (Gemini) | ✅ Working — flyer from WordPress uploads | ~2 |
| 42 | Pagano's UVA | `paganosUva.js` | Vision OCR (Gemini) | ✅ Working — flyer pattern `music_YYYYMM.jpg` | ~6 |
| 43 | Captain's Inn | `captainsInn.js` | Vision OCR (Gemini) | ✅ Working — Wix site, month-name matching for flyer | ~4 |
| 44 | Charley's Ocean Bar & Grill | `charleysOceanGrill.js` | Vision OCR (Gemini) | ✅ Working — WP JSON API fetch for flyer | ~5 |
| ~~45~~ | ~~Starland Ballroom~~ | ~~`starlandBallroom.js`~~ | ~~AXS/Carbonhouse AJAX~~ | ❌ Disabled — proxy connects but AJAX returns empty (browser fingerprinting). Needs headless browser. | — |
| ~~46~~ | ~~House of Independents~~ | ~~`houseOfIndependents.js`~~ | ~~Etix JSON-LD~~ | ❌ Disabled — Etix removed JSON-LD entirely. Replaced by Playwright scraper. | — |
| 47 | House of Independents | `houseOfIndependents.playwright.js` | Playwright (Etix SPA) | ⚠️ Built, verified locally, blocked by AWS WAF on GH Actions IPs | 0 |
| 48 | Brielle House | `brielleHouse.playwright.js` | Playwright (FullCalendar) | ✅ Running via GitHub Actions nightly | ~3 |

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

### Tim McLoone's Supper Club (`timMcLoones.js`) — ✅ WORKING (proxy)
- **URL:** https://mcloones.ticketbud.com (Ticketbud organizer page)
- **Platform:** Ticketbud HTML — was previously blocked by Cloudflare on all McLoone's domains from datacenter IPs
- **Fix:** Routed through IPRoyal residential proxy (March 24, 2026). Ticketbud page now accessible.
- **Approach:** HTML parsing of `.card.vertical` containers. Each card has `.event-title` (H6), `.date` ("Sun, Mar 29, 2026"), `.time` ("7:00 pm - 9:30 pm"), `img.card-image` (S3-hosted images), and `a[href]` ticket links. Pagination via `?page=N`, up to 4 pages.
- **External ID pattern:** `mcloones-{ticketbud-slug}` (from URL path)
- **Address:** 1200 Ocean Ave, Asbury Park, NJ 07712

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

### Starland Ballroom — ❌ DISABLED (needs headless browser)
- **URL:** https://www.starlandballroom.com/events/all
- **Platform:** AEG/Carbonhouse platform, ticketed by AXS
- **Status:** Tested with IPRoyal residential proxy (March 24, 2026) — proxy connects successfully (no HTTP error) but AJAX endpoint at `/events/events_ajax/{offset}` returns empty HTML. Like Etix, Carbonhouse does browser fingerprinting that requires actual JavaScript execution.
- **Scraper file:** `starlandBallroom.js` kept with `proxyFetch` integration — parsing logic ready, just needs a headless browser environment.
- **Commented out** in `sync-events/route.js` to avoid wasting proxy bandwidth.
- **To revisit:** Same headless browser solution as House of Independents (Browserless, Puppeteer Lambda, Playwright Cloud).
- **Address:** 570 Jernee Mill Rd, Sayreville, NJ 08872

### Algonquin Arts Theatre (`algonquinArts.js`) — ✅ WORKING (proxy)
- **URL:** https://www.algonquinarts.org/calendar.php?s=14
- **Platform:** Custom PHP site — was previously blocked (HTTP 403) from Vercel datacenter IPs
- **Fix:** Routed through IPRoyal residential proxy (March 24, 2026). Returns full HTML with event data.
- **Approach:** HTML parsing of `.calendar-full-container` blocks. Extracts `.calendar-full-dates` (date), `.calendar-full-title` (h2, event name), `.calendar-full-series` (category — Broadway, Concerts, Jazz), `.calendar-full-description`, `.calendar-full-image` (img), and `calendar.php?id=XXX` detail links.
- **Season param:** `?s=14` is the current season. If events stop appearing, try incrementing (`s=15`, `s=16`).
- **External ID pattern:** `algonquin-{date}-{title-slug}`
- **Address:** 173 Main St, Manasquan, NJ 08736

### House of Independents — ❌ DISABLED (needs headless browser)
- **URL:** https://www.etix.com/ticket/v/33546/calendars
- **Platform:** Etix (React SPA with server-rendered JSON-LD)
- **Status:** Tested with IPRoyal residential proxy (March 24, 2026) — proxy connects successfully but Etix still serves the bare 2KB React shell. Etix does browser fingerprinting beyond IP detection (likely checking for JavaScript execution, cookies, or TLS fingerprint). A simple HTTP proxy is not enough.
- **What works from a real browser:** JSON-LD extraction — 20 upcoming events with name, image, ticket URL, startDate ("Sat Mar 21 17:30:00 EDT 2026" format), and offers (price in USD). Venue ID is 33546.
- **Scraper file:** `houseOfIndependents.js` kept with `proxyFetch` integration — fully functional, just needs a headless browser environment to execute.
- **Commented out** in `sync-events/route.js` to avoid wasting proxy bandwidth.
- **To revisit:** Browserless.io, Puppeteer on AWS Lambda, or Playwright Cloud. Scraper code is ready — just needs a JS-executing runtime.
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
- **Boathouse Belmar** (https://www.boathousebelmar.com/events) — ❌ Re-investigated March 24, 2026, still cannot scrape. Previous MarketPush Google Calendar Embed appears to have been removed — page now just shows "Events Calendar" heading and happy hour specials (623 chars total text). No calendar widget, no iframe, no event listings. MarketPush and filesusr references still exist in Wix framework code but no calendar renders. Events only posted as image posters on Instagram (@boathousebelmarnj). Address: 1309 Main Street, Belmar, NJ 07719.
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
4. Add venue row to Supabase `venues` table if not already there. **MUST populate `latitude` + `longitude`** — `src/app/page.js` filters out any event whose venue has null coords (silent UI failure: events disappear from feed + venue-filter dropdown). Address + website + default_start_time on the same insert.
5. Also add the scraper key to FAST_SHARD_1 or FAST_SHARD_2 (or SLOW_SCRAPER_KEYS) in `sync-events/route.js` — unknown keys are skipped by `shouldRunScraper` so the scraper silently runs 0 times if this step is missed.
6. Also add a `VENUE_REGISTRY` entry in `sync-events/route.js` so the scraper shows up in the admin health panel.
7. Deploy and run manual sync to verify (check event count, then check a venue event actually surfaces in the home-page venue dropdown).
8. **For Squarespace sites:** Use `?format=json` on the collection URL. Click an event to find the collection name from the URL path.
9. **For iCal feeds:** Use Eastern time for date comparisons. Handle RDATE if the feed uses recurring events. Include date in external_id for recurring events.

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

### Do NOT deploy via GitHub MCP API — use local git push
- **Problem (April 17, 2026):** Using the GitHub MCP `push_files` / `create_or_update_file` tools creates commits directly on GitHub that bypass the local git history. This causes the local repo and remote to diverge, leading to merge conflicts, stash failures, and lock file issues when the user later tries to `git pull`.
- **Rule:** Always make code changes to the local files (in the mounted workspace folder), then have the user run `git add`, `git commit`, and `git push` from their terminal. This keeps a single linear history with no divergence.
- **Fallback exception:** The GitHub MCP push is acceptable for tiny emergency hotfixes, but the user MUST run `git pull` immediately after to sync their local repo before any further local work.
- **Large files:** Files over ~100KB (like HANDOVER.md at 299KB) cannot be pushed via the GitHub API at all — they must go through local git.

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

## Session: March 22, 2026 — McCann's Time Extraction, Pagination Fix, Admin Dashboard Polish

### What Changed

1. **McCann's Tavern — Time Extraction from Titles** (`src/lib/scrapers/mccanns.js`)
   - New `extractTimeFromTitle()` function parses time patterns at the end of event titles: `6-9`, `7pm`, `6:30-9:30`, `8pm-11pm`, en-dash/em-dash variants
   - Assumes PM for bare numbers (safe for bar/venue events)
   - Cleans the extracted time from the title so only the artist name remains (e.g., "Kevin Hill 6-9" → title: "Kevin Hill", time: "6:00 PM")
   - New `isAllDayEvent()` helper detects date-only DTSTART values (no time component)
   - **Priority order:** title-embedded time → real calendar time (if not midnight) → `null`
   - **Midnight default → NULL:** Events resolving to exactly midnight Eastern now return `null` for time, so they correctly surface in the "Missing Time" dashboard card

2. **Pagination Count Bug Fix** (`src/app/api/admin/route.js`)
   - The count query for the Load More button was not applying the `recentlyAdded` filter, causing it to show unfiltered totals (e.g., "8 of 1865" instead of "8 of 8")
   - Added `recentlyAdded` filter (`created_at >= 24h ago`) to the count query so it matches the data query
   - Load More button now correctly hides when all filtered results are displayed

3. **Prior session carry-over (committed earlier, documented here for completeness):**
   - **Eventide Grille scraper** wired into sync-events route (Image Poster type, hardcoded monthly events)
   - **scraper_health table** — ALTER TABLE to add `website_url` and `platform` columns
   - **Brielle House** — Updated nonce regex for `_nonce` key, added error messages for HTTP 403 and WordPress critical errors. Site-side issue (their EventPrime plugin is broken), nothing we can fix.
   - **Force Sync endpoint** (`/api/admin/force-sync/route.js`) — Per-venue sync with `SCRAPER_MAP` and `PLATFORM_MAP`
   - **Asbury Lanes** — AJAX fallback when BentoBox/nginx blocks full-page requests from Vercel IPs
   - **Successful Syncs card** on Data Health dashboard
   - **Platform badges** — `PLATFORM_MAP` in force-sync, backfill SQL for existing rows, Squarespace badge color fix (`#1A1A1A` → `#5B8A72`)
   - **New Events (24h) velocity card** with click-through to filtered events list
   - **Dashboard card reorder** — Row 1: Health & Inventory, Row 2: Action Items

### Files Modified
- `src/lib/scrapers/mccanns.js` — `extractTimeFromTitle()`, `isAllDayEvent()`, NULL time handling, cleaned titles
- `src/app/api/admin/route.js` — `recentlyAdded` filter on count query

### SQL Migrations Required
- `ALTER TABLE scraper_health ADD COLUMN website_url TEXT, ADD COLUMN platform TEXT;` (if not already run)
- Backfill platform tags: `UPDATE scraper_health SET platform = 'Google Calendar' WHERE scraper_key = 'McCanns';` (etc. for all venues — see PLATFORM_MAP in force-sync route)

### Pending / TODO
- **Brielle House** — Site-side PHP crash + HTTP 403 from datacenter IPs. Monitor periodically; nothing to fix on our end.
- **Eventide Grille / Palmetto** — Image poster scrapers require manual monthly updates. Scheduled reminder set up.

---

## Session: March 23, 2026 — Notifications System, Distance Filter, Feed Card UI, Admin Timezone Fix

### What Changed

1. **Notification System — Full Backend + Frontend** (NEW)
   - **Three notification triggers** via `/api/notify/route.js`:
     - **Trigger A – Tracked Show Reminder** (cron at 10 AM ET / `0 15 * * *` UTC): Finds users with saved events happening today, sends in-app notification + email
     - **Trigger B – New Show Added** (called from sync pipeline via POST): When sync finds new events for followed artists, notifies all followers
     - **Trigger C – Artist Discovery Nudge** (cron at 12 PM ET / `0 17 * * *` UTC): Finds followed artists playing today, nudges followers who haven't saved the event (in-app only, no email)
   - **API routes:**
     - `GET /api/notifications` — Returns user's notifications (paginated, newest first) + unread count
     - `PATCH /api/notifications` — Mark as read: `{ ids: [...] }` for individual, `{ all: true }` for all
     - `GET /api/notification-prefs` — Returns user's email/in-app/search_radius preferences (defaults if no row)
     - `PATCH /api/notification-prefs` — Upserts notification preferences
   - **Email via Resend** (`src/lib/sendEmail.js`): REST API integration (no npm package), styled HTML email template with myLocalJam branding. Env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - **Dedup:** `notification_emails_sent` table with unique index `(user_id, event_id, trigger)` prevents duplicate sends
   - **Vercel cron** added to `vercel.json`:
     ```json
     { "path": "/api/notify?trigger=tracked_show", "schedule": "0 15 * * *" },
     { "path": "/api/notify?trigger=artist_discovery", "schedule": "0 17 * * *" }
     ```
   - **Auth:** Uses `SYNC_SECRET` Bearer token (same as sync-events) + `SUPABASE_SERVICE_ROLE_KEY` admin client (bypasses RLS)

2. **In-App Notification UI** (`src/app/page.js`)
   - Bell icon in header with unread count badge (red dot with number)
   - Notification dropdown panel with list of notifications
   - Removed auto-mark-all on bell click — now only marks via explicit "Mark all read" button
   - `markSingleNotificationRead` function: marks individual notification read on click
   - Notification click navigates in-app using `scrollIntoView` to the event card (instead of `window.location.href` which caused 404s on `/events/{id}`)
   - "Mark all read" button only visible when `unreadCount > 0`

3. **Distance Filter — Default Changed to "Show All"**
   - `search_radius` default changed from `25` to `null` (Show All) in:
     - `page.js` — `search_radius ?? null` instead of `search_radius ?? 25`
     - `notification-prefs/route.js` — default response returns `search_radius: null`
     - `supabase-search-radius.sql` — `DEFAULT NULL`
   - Distance slider max capped at 25 miles (was 50)
   - Slider label shows "25 mi" as max
   - 50-mile option removed from profile radius picker
   - **"Reset to default" button** added below slider — resets to user's saved profile default
   - Uses `profileRadiusRef` (useRef) pattern to track saved profile value separately from active session filter
   - CSS: `.reset-to-default-btn:hover` style in `globals.css`

4. **Header Icon Alignment Fix** (`page.js`)
   - Fixed bell icon jumping left when switching to My Jam / Profile tabs
   - Added flex spacer for header on saved/profile tabs
   - Wrapped right-side header icons (+ button and bell) in a div for consistent alignment

5. **Admin Event Edit — Timezone Bug Fix** (`src/app/admin/page.js`)
   - **Problem:** Editing an 8 PM ET event would shift it to the next day. The form initialized `event_date` using UTC extraction but `event_time` using local system time, causing a mismatch.
   - **Fix — Form initialization:** Both date and time now use consistent `America/New_York` timezone:
     ```javascript
     event_date: new Date(event.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
     event_time: new Date(event.event_date).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
     ```
   - **Fix — Save handler:** Constructs datetime with explicit ET offset:
     ```javascript
     const probe = new Date(`${form.event_date}T12:00:00`);
     const etOffset = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
     const eventDate = new Date(`${form.event_date}T${form.event_time}:00${etOffset}`).toISOString();
     ```
   - Same fix applied to queue approval flow

6. **Cache-Control Headers** (`next.config.js`)
   - Added `no-cache, no-store, must-revalidate` for all HTML pages (excludes `_next/static`, `_next/image`, `favicon.ico`)
   - Ensures fresh deploys are served immediately without stale cache

7. **Feed Card UI Overhaul** (`src/components/EventCardV2.js`)
   - **Bookmark icon** replaced save icon (circle+check Material Icon) with bookmark SVG from Feather icons
   - `bookmarkPop` CSS keyframe animation on save
   - **Removed share button from compact card row** — share only in expanded detail
   - **Follow popover upsell:** When user bookmarks an event for an unfollowed artist, shows a popover asking "Saved! Want alerts for future shows?" with a Follow button
     - Popover rendered via `createPortal` to `document.body` (fixes clipping from `overflow: hidden` on card)
     - Fixed positioning using `getBoundingClientRect()` from `bookmarkRef`
     - Auto-dismiss after 5 seconds with fade animation
     - `popover-fade-in` / `popover-fade-out` CSS classes
   - **Expanded card action row:** Three balanced buttons — Follow Artist (solid dark bg unfollowed / orange followed), Venue (website link), Share
   - **"Suggest Edit"** text link below action row (replaced inline flag icon) — opens existing bottom-sheet report modal
   - **Smart "Read More":** Uses `useRef` + `useEffect` to measure actual text truncation via `scrollHeight > clientHeight`, only shows Read More button when text is genuinely truncated
   - **Genre chips + Tribute badge** commented out pending backend data cleanup

8. **Client-Side Exception Fix** (`EventCardV2.js`)
   - After deploying the `createPortal` changes, the app crashed with "Application error: a client-side exception has occurred"
   - **Root causes found and fixed:**
     - `useLayoutEffect` → replaced with `useEffect` (useLayoutEffect causes SSR errors in Next.js)
     - `useEffect` for truncation check was placed AFTER `if (!event) return null` early return — **Rules of Hooks violation** (hooks must always be called in the same order). Moved above the early return.
     - `desc` variable referenced in `useLayoutEffect` dependency array before it was declared — moved `desc` derivation above the hook
     - `typeof document !== 'undefined'` guard for `createPortal` replaced with `mounted` state pattern: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`

### New Files
- `src/app/api/notify/route.js` — Notification trigger handler (3 triggers: tracked_show, new_show, artist_discovery)
- `src/app/api/notifications/route.js` — GET/PATCH user notifications
- `src/app/api/notification-prefs/route.js` — GET/PATCH notification preferences
- `src/lib/sendEmail.js` — Resend email utility + HTML email template builder
- `supabase-notifications.sql` — Table definitions (notifications, user_notification_preferences, notification_emails_sent)
- `supabase-search-radius.sql` — ALTER TABLE to add search_radius column

### Files Modified
- `src/app/page.js` — Notification UI (bell icon, dropdown, mark read), distance filter defaults, header alignment, removed follow banner logic
- `src/components/EventCardV2.js` — Complete UI overhaul (bookmark, popover, portal, action row, suggest edit, smart Read More)
- `src/app/admin/page.js` — Timezone fix for event editing (form init + save handler)
- `src/app/globals.css` — `.reset-to-default-btn:hover` style
- `next.config.js` — Cache-Control headers
- `vercel.json` — Two new notification cron jobs

### SQL Migrations Required
```sql
-- 1. Notification tables (run supabase-notifications.sql if not already done)
-- Creates: notifications, user_notification_preferences, notification_emails_sent
-- With RLS policies and indexes

-- 2. Search radius column (run if not already done)
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS search_radius INTEGER DEFAULT NULL;
```

### Env Vars Required
- `RESEND_API_KEY` — Resend email API key (add to `.env.local` and Vercel)
- `RESEND_FROM_EMAIL` — Sender address (e.g., `myLocalJam <notifications@mylocaljam.com>`). Falls back to `onboarding@resend.dev`
- `NEXT_PUBLIC_SITE_URL` — Base URL for email links (defaults to `https://mylocaljam.com`)

### Key Architecture Patterns Introduced

**Portal pattern for popover escape:**
```javascript
import { createPortal } from 'react-dom';
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
// In JSX:
{showPopover && mounted && createPortal(<PopoverContent />, document.body)}
```
This is required because cards have `overflow: hidden` which clips absolutely-positioned children.

**profileRadiusRef pattern:**
The saved profile radius (from DB) and the active session radius (from slider) are tracked separately. `profileRadiusRef` holds the DB value, allowing "Reset to default" to restore it without a re-fetch.

**Admin timezone pattern:**
Always use `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` for dates and `toLocaleTimeString('en-GB', { timeZone: 'America/New_York' })` for times when extracting from ISO strings. When constructing ISO strings for save, probe for EDT/EST offset dynamically.

### Pending / TODO
- **Resend API setup** — User needs to configure `RESEND_API_KEY` in Vercel env vars (may already be done)
- **Notification testing** — Full end-to-end test of cron triggers in production
- **Genre chips** — Currently commented out in EventCardV2; re-enable after backend data cleanup
- **Delete `GoogleOAuthWrapper.js`** — Still on disk, no longer imported
- **Google Brand Verification** — Still pending (from prior session)

---

## Session: March 23, 2026 (cont.) — Event Sharing, OG Meta Tags, Deep Linking, Schema Fix

### What Changed

1. **Dynamic Event Sharing Route — `/event/[id]`** (NEW)
   - **Server component** (`src/app/event/[id]/page.js`) with `generateMetadata()` for rich Open Graph tags
   - **OG title format:** `"Artist at Venue | Friday, Mar 27 at 8 PM"` — date/time shown directly in link previews (iMessage, Slack, Twitter, etc.)
   - **OG description:** `"Live music Friday, Mar 27 at 8 PM. Tap to see details and save this show on myLocalJam."`
   - **Twitter cards:** `summary_large_image` when artist/venue image available
   - `export const dynamic = 'force-dynamic'` + `export const revalidate = 0` — forces fresh server render, no ISR/route cache
   - **Supabase client fallback:** Prefers `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS), falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` if service key isn't set. Logs detailed errors with Supabase error code, message, and hint.
   - **Joined query + flattenEvent():** Queries `events` with `venues(...)` and `artists(...)` joins, then flattens into the same shape the main feed uses. This fixed the 42703 column-not-found errors (the events table doesn't have `description`, `start_time`, `artist_image` etc. — those come from joins).

2. **Public Event Page — EventPageClient** (NEW)
   - **Auth check on mount:** Logged-in users redirect to `/?event={id}` (deep-link to expanded card). Unauthenticated users see the public view.
   - **Public view:** Full event details (date, time, title, venue, image, description, genres, cover charge, tribute badge)
   - **Sticky upsell banner:** "Never miss a local jam" + "Create Free Account" CTA linking to `/?signup=true`
   - **Auth modal overlay:** "Save Show" / "Follow Artist" buttons trigger a modal with Sign Up / Sign In links
   - Cover charge displays from `event.cover` (text field), handles "Free", "0", "TBA", and dollar amounts

3. **Share Button Fix — All Card Components**
   - **Share URL:** Now generates `https://mylocaljam.com/event/{event.id}` instead of linking to external ticket/venue sites
   - **Silent failure fix:** Wrapped `navigator.share()` in `try/catch`. If Web Share API fails or isn't supported (desktop browsers), falls back to `navigator.clipboard.writeText()` and shows "Link copied to clipboard!" toast
   - **AbortError handling:** User cancelling the share sheet doesn't trigger the clipboard fallback
   - Applied to: `EventCardV2.js`, `SavedGigCard.js`

4. **Ghost Column Cleanup — Schema Alignment**
   - **Problem:** Multiple components referenced columns that don't exist on the `events` table: `cover_charge`, `ticket_url`, `image_url`, `end_time`, `description`, `start_time`, `artist_image`, `artist_genres`
   - **Reality:** `cover` (text), `ticket_link`, `artist_bio` are the real event columns. Artist images/bios/genres come from the `artists` join. Venue photos come from the `venues` join.
   - **Fixed in:**
     - `EventCardV2.js` — `cover_charge` → `cover`, `ticket_url` → `ticket_link`, removed `image_url` from fallback, removed `end_time` from `formatTimeRange`
     - `SavedGigCard.js` — Same `cover_charge` → `cover` fix, share URL updated to mylocaljam.com format with clipboard fallback
     - `SiteEventCard.js` — `cover_charge` → `cover` for free admission check
     - `EventPageClient.js` — `cover_charge` → `cover`, removed `artist_bio`/`image_url` fallbacks (already handled by `flattenEvent`)

5. **Deep-Link Expanded Card — `?event=` Query Param**
   - **Problem:** Logged-in users clicking shared links were dumped onto the home feed without seeing the specific event
   - **Fix — Race condition:** Split into two useEffects:
     1. Mount effect reads `?event=` param, stores in `deepLinkEventId` state, cleans URL via `history.replaceState`
     2. Load effect waits for `loading === false` (events fetched), then scrolls to card with orange highlight
   - **Auto-expand:** New `autoExpand` prop on `EventCardV2` — when `deepLinkEventId === event.id`, the card renders already expanded (`useState(autoExpand)`)
   - **Cleanup:** `deepLinkEventId` cleared to `null` after scroll completes to prevent re-triggering on tab switches
   - **Auth modal params:** `?signup=true` opens auth modal in signup mode, `?login=true` opens in login mode (from public page CTAs)

6. **OG Date/Time Formatting**
   - `formatOGDate()` — e.g. "Friday, Mar 27" (compact `month: 'short'` format)
   - `formatOGTime()` — Converts 24h `start_time` string (from `flattenEvent`) into "8 PM" or "8:30 PM". Returns empty for midnight (typically means "no time provided")
   - Falls back gracefully: no time → just date, no date → "Live music at {venue}"

7. **RLS Policy Update**
   - Replaced `"Public can read published events"` (`status = 'published'`) with `"Public can read events"` (`status IS NULL OR status <> 'draft'`)
   - Fixes: scraped events with NULL status were invisible to unauthenticated users on shared links
   - Migration: `supabase-public-events.sql`

### New Files
- `src/app/event/[id]/page.js` — Server component with `generateMetadata()`, joined query, `flattenEvent()`, OG/Twitter meta tags
- `src/app/event/[id]/EventPageClient.js` — Client component: auth redirect, public event view, upsell banner, auth modal
- `supabase-public-events.sql` — RLS policy migration (public SELECT on events for non-draft)

### Files Modified
- `src/components/EventCardV2.js` — Share URL, clipboard fallback with toast, ghost column fixes (`cover`, `ticket_link`), `autoExpand` prop
- `src/components/SavedGigCard.js` — Share URL, clipboard fallback, `cover_charge` → `cover`
- `src/components/SiteEventCard.js` — `cover_charge` → `cover`
- `src/app/page.js` — `deepLinkEventId` state, query param handling (`?event=`, `?signup=`, `?login=`), `autoExpand` prop threading

### SQL Migrations Required
```sql
-- Run supabase-public-events.sql in Supabase SQL Editor:
DROP POLICY IF EXISTS "Public can read published events" ON events;
CREATE POLICY "Public can read events"
  ON events FOR SELECT
  USING (status IS NULL OR status <> 'draft');

-- Also ensure the DELETE policy from the previous session entry exists:
-- CREATE POLICY "Users can delete own notifications"
--   ON notifications FOR DELETE
--   USING (auth.uid() = user_id);
```

### Env Vars
- `SUPABASE_SERVICE_ROLE_KEY` — Must be set in Vercel for the `/event/[id]` server component to bypass RLS. Falls back to anon key if missing, but service key is preferred.

### Key Architecture Patterns Introduced

**Joined query + flattenEvent pattern:**
The `events` table is lean — artist details (bio, image, genres, is_tribute) live on the `artists` table, venue details (photo, address, type) on `venues`. Always query with joins and flatten:
```javascript
const EVENT_SELECT = 'id, artist_name, event_date, ..., venues(name, address, color, photo_url), artists(name, bio, image_url, genres, is_tribute)';
const { data: raw } = await supabase.from('events').select(EVENT_SELECT).eq('id', id).single();
const event = flattenEvent(raw); // maps artists.bio → description, artists.image_url → artist_image, etc.
```

**Deep-link auto-expand pattern:**
```javascript
// page.js — store param in state, wait for data to load
const [deepLinkEventId, setDeepLinkEventId] = useState(null);
useEffect(() => { /* read ?event= on mount, store in state */ }, []);
useEffect(() => { /* when !loading && deepLinkEventId, scroll + clear */ }, [deepLinkEventId, loading]);
// In JSX:
<EventCardV2 autoExpand={deepLinkEventId === event.id} ... />
// EventCardV2.js:
const [expanded, setExpanded] = useState(autoExpand);
```

---

## Session: March 24, 2026 — Security Audit & Hardening

### What Changed

1. **Deleted Unauthenticated Test Routes** (3 files removed)
   - `/api/do-sync` — Proxy that called sync-events POST without Bearer token, bypassing auth entirely. Deleted.
   - `/api/test-parkstage` — Destructive endpoint (deleted duplicate events) with no auth, using `getAdminClient()`. Deleted.
   - `/api/test-pig-parrot` — Temporary scraper test endpoint with no auth. Deleted.

2. **Hardened SYNC_SECRET — Fail Closed** (4 locations, 3 files)
   - **Before:** `if (!secret) return true` — if `SYNC_SECRET` env var was missing, all requests were allowed through
   - **After:** `if (!secret) return false` — if env var is missing, all requests are rejected (401)
   - Applied to:
     - `src/app/api/sync-events/route.js` — `isAuthorized()` function
     - `src/app/api/enrich-artists/route.js` — `isAuthorized()` function
     - `src/app/api/notify/route.js` — GET handler (cron triggers)
     - `src/app/api/notify/route.js` — POST handler (sync pipeline calls)

3. **Rate Limited `/api/flag-event`** (rewritten)
   - **Before:** No auth, no rate limiting — anyone could spam flag increments on any event
   - **After:** In-memory rate limiter keyed on `IP:event_id`, 1 flag per event per 10-minute window
   - Returns 429 with friendly message if rate exceeded
   - Automatic Map cleanup every 5 minutes to prevent unbounded memory growth
   - `getClientIP()` reads `x-forwarded-for` → `x-real-ip` → `'unknown'` (works behind Cloudflare/Vercel proxy)

4. **Cloudflare Security Configuration** (dashboard, no code)
   - **Rate Limiting Rule deployed:** 30 requests per 10 seconds per IP on `/api/` paths → Block for 10 seconds
   - **Block AI Bots:** Enabled on all pages (blocks GPTBot, CCBot, and other AI training crawlers)

### Files Deleted
- `src/app/api/do-sync/route.js` + directory
- `src/app/api/test-parkstage/route.js` + directory
- `src/app/api/test-pig-parrot/route.js` + directory

### Files Modified
- `src/app/api/sync-events/route.js` — `isAuthorized()` fails closed
- `src/app/api/enrich-artists/route.js` — `isAuthorized()` fails closed
- `src/app/api/notify/route.js` — GET + POST auth checks fail closed
- `src/app/api/flag-event/route.js` — Complete rewrite with IP-based rate limiting

### Security Audit Summary

**API Route Auth Status (post-hardening):**
| Auth Type | Routes |
|---|---|
| `ADMIN_PASSWORD` Bearer | `/api/admin/*`, `/api/submissions` GET, `/api/reports` GET/PUT, `/api/geocode-venues` POST |
| `SYNC_SECRET` Bearer (fail closed) | `/api/sync-events`, `/api/enrich-artists`, `/api/notify` |
| Supabase JWT (user session) | `/api/saved-events`, `/api/follows`, `/api/notifications`, `/api/notification-prefs` |
| Public (intentional) | `/api/events` GET (read-only feed), `/api/spotlight` GET, `/api/submissions` POST, `/api/reports` POST |
| Public + rate limited | `/api/flag-event` POST |

**Supabase RLS Status:**
- All user tables enforce `auth.uid() = user_id` — users can only access their own data
- Events/venues/spotlight/pills are public read-only (SELECT)
- `user_follows` table (legacy, unused) has wide-open policies — should be dropped
- `artists` table may need RLS policy verification in Supabase dashboard

### Pending / TODO
- **Drop `user_follows` table** — Legacy, not used by any code, has fully open RLS policies
- **Verify `artists` table RLS** in Supabase dashboard — no policy found in migration files
- **Cloudflare Bot Fight Mode** — Check if available under Security → Bots → General tab (broader than just AI bots)

## Session: March 24, 2026 (cont.) — Cron Auth Fix, IPRoyal Proxy Integration, is_time_tbd Fix

### What Changed

1. **Fixed Daily Email Notifications Not Triggering (Cron Auth)**
   - **Root cause:** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` but code only checked `SYNC_SECRET`. If `CRON_SECRET` wasn't set or differed from `SYNC_SECRET`, cron requests got 401.
   - **Fix:** Updated auth checks in `notify/route.js` (GET + POST) and `sync-events/route.js` to accept either `CRON_SECRET` or `SYNC_SECRET` as valid Bearer tokens.
   - **Timezone fix:** Changed tracked_show cron from `0 15 * * *` (11 AM EDT) to `0 14 * * *` (10 AM EDT) in `vercel.json`.
   - **Verified:** Manual "Run" from Vercel Cron Jobs page returned 200 with "[Trigger A] Found 5 tracked events for today."

2. **Fixed `is_time_tbd` Backfill SQL Bug**
   - **Root cause:** Backfill used `EXTRACT(HOUR FROM event_date) IN (0, 4, 5)` which caught real 8 PM EDT shows stored as 00:00 UTC.
   - **Fix:** Updated `supabase-is-time-tbd.sql` to reset all flags to `false` and let the next sync set them correctly via `mapEvent()` which knows at scrape-time whether a real time was found.

3. **IPRoyal Residential Proxy Integration**
   - **New file:** `src/lib/proxyFetch.js` — Shared utility using `undici` `ProxyAgent` to route requests through IPRoyal rotating residential proxies. Falls back to direct fetch if env vars not set.
   - **Env vars:** `IPROYAL_PROXY_HOST`, `IPROYAL_PROXY_PORT`, `IPROYAL_PROXY_USER`, `IPROYAL_PROXY_PASS`
   - **Plan:** IPRoyal Pay-As-You-Go ($7/1GB)
   - **Only used by proxy-routed scrapers** — all 38 other scrapers use standard `fetch()` with no proxy.

4. **Algonquin Arts Theatre — ✅ UNBLOCKED via proxy**
   - Was returning HTTP 403 from datacenter IPs. Now routed through IPRoyal residential proxy.
   - **16 events** on first sync. Custom PHP HTML parsing of `.calendar-full-container` blocks.

5. **Tim McLoone's Supper Club — ✅ NEW SCRAPER via proxy**
   - Previously blocked by Cloudflare on all McLoone's domains. New scraper targets `mcloones.ticketbud.com` through IPRoyal proxy.
   - **12 events** on first sync. HTML parsing of `.card.vertical` containers with pagination.
   - **New file:** `src/lib/scrapers/timMcLoones.js`

6. **House of Independents & Starland Ballroom — ❌ STILL BLOCKED (disabled)**
   - Tested with proxy — both connect successfully but still serve empty/shell content. Etix and Carbonhouse do browser fingerprinting beyond IP detection (require JavaScript execution).
   - **Commented out** from sync-events route to save proxy bandwidth.
   - **Backlog:** Revisit with Browserless.io, Puppeteer Lambda, or Playwright Cloud.

7. **Boathouse Belmar — Re-investigated, still dead end**
   - Calendar page now just shows happy hour specials (623 chars total). Previous MarketPush Google Calendar embed appears removed. Events only on Instagram.

8. **MJ's Restaurant — ✅ NOW WORKING via Vision OCR**
   - Previously listed as "cannot scrape" (image-only poster). Now handled by Gemini 2.5 Flash vision OCR pipeline. See Vision OCR session below.

### New Files
- `src/lib/proxyFetch.js` — IPRoyal proxy-aware fetch utility
- `src/lib/scrapers/timMcLoones.js` — Tim McLoone's Ticketbud scraper

### Files Modified
- `src/app/api/sync-events/route.js` — Dual CRON_SECRET/SYNC_SECRET auth, added Algonquin + McLoone's scrapers, disabled HoI + Starland
- `src/app/api/notify/route.js` — Dual CRON_SECRET/SYNC_SECRET auth (GET + POST)
- `src/lib/scrapers/algonquinArts.js` — Switched from direct `fetch` to `proxyFetch`
- `src/lib/scrapers/houseOfIndependents.js` — Switched to `proxyFetch` (disabled in route)
- `src/lib/scrapers/starlandBallroom.js` — Switched to `proxyFetch` (disabled in route)
- `vercel.json` — Fixed tracked_show cron to `0 14 * * *` (10 AM EDT)
- `supabase-is-time-tbd.sql` — Fixed backfill to reset all flags instead of UTC hour guessing

### Env Vars Required
- `CRON_SECRET` — Must match `SYNC_SECRET` value (or set independently). Added in Vercel for cron auth.
- `IPROYAL_PROXY_HOST` — `geo.iproyal.com`
- `IPROYAL_PROXY_PORT` — `12321`
- `IPROYAL_PROXY_USER` — (set in Vercel)
- `IPROYAL_PROXY_PASS` — (set in Vercel)

### SQL to Run in Supabase
```sql
-- Reset is_time_tbd flags (then trigger a sync to repopulate correctly)
UPDATE events SET is_time_tbd = false WHERE is_time_tbd = true;
```

### Pending / TODO
- **Run `is_time_tbd` reset SQL** in Supabase, then trigger a sync
- **Headless browser architecture** for House of Independents + Starland Ballroom (Browserless.io / Puppeteer Lambda)
- **Deploy** via `npx vercel --prod`

---

## Session: March 24, 2026 (cont.) — Vision OCR Pipeline (Gemini 2.5 Flash)

### What Changed

**Built a Vision OCR pipeline** for venues that only post image flyers (no structured data). Uses Google Gemini 2.5 Flash (free tier) to extract artist names, dates, and times from flyer images. The vision AI only does OCR extraction — existing Phase 2 Last.fm enrichment handles bios/images automatically.

### Architecture

1. **Core module:** `src/lib/visionOCR.js`
   - Exports `extractEventsFromFlyer(imageUrl, { venueName, year, month })`
   - Downloads flyer image → base64 encodes → sends to Gemini 2.5 Flash with structured JSON schema
   - Uses `response_mime_type: 'application/json'` + `response_schema` for forced structured output
   - Returns `[{ artist, date, time }]`
   - API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
   - Env var: `GOOGLE_AI_KEY`

2. **Handoff to enrichment:** Vision scrapers return events with `description: null` and `image_url: null`. The existing Phase 2 Last.fm enrichment pipeline automatically picks up new artists and fills in bios/images. No bios from OCR.

### Vision Scrapers (4 total)

| Venue | File | How Flyer is Found | Status |
|---|---|---|---|
| MJ's Restaurant | `mjsRestaurant.js` | WordPress `wp-content/uploads` pattern: `MJS-NEPTUNE-LIVE-MUSIC-MONTH-YYYY.jpg` | ✅ 2 events |
| Pagano's UVA | `paganosUva.js` | Static pattern: `music_YYYYMM.jpg` | ✅ 6 events |
| Captain's Inn | `captainsInn.js` | Wix site — searches `src`, `data-src`, `data-pin-media` for month-name match in URL (e.g. "MARCH 2026 NEW.png") | ✅ 4 events |
| Charley's Ocean Bar | `charleysOceanGrill.js` | Fetches WordPress JSON API at `charleys.prime-cms.net/wp-json/wp/v2/pages/73`, extracts `music-lineup-MM-YYYY.png` from `content.rendered`. Falls back to predicted URL pattern via HEAD request. | ✅ 5 events (all March, filtered by date) |

### Debugging History

- **Captain's Inn (round 1):** `count: 0, error: null` — flyer URL was found but Gemini returned 0 events. Root cause: Wix uses `data-src` for lazy loading (not `src`), and stripping query params broke Wix image URLs. Fix: added `data-src`/`data-pin-media` to regex, month-name matching as priority strategy, stopped stripping query params.
- **Charley's Ocean (round 1):** `error: "No flyer image found"` — page content loaded via JavaScript from WordPress JSON API, not in static HTML. Fix: scraper now fetches WP JSON API directly (`pages/73`), parses `content.rendered` for image URLs.
- **Charley's Ocean (round 2):** `count: 0, error: null` → diagnostic revealed "Gemini found 5 events but all before 2026-03-24". The March flyer only had events in early March. Working correctly — will pick up April flyer automatically.

### Venues Assessed but Not Scraped

- **Driftwood** — Seasonal venue, no current content
- **The Wharf** — No extractable flyer images
- **Icarus** — Vercel timeout issues
- **Woody's Ocean Grille** — Mixed flyer formats (risky for OCR)

### New Files
- `src/lib/visionOCR.js` — Core Gemini 2.5 Flash vision OCR module
- `src/lib/scrapers/mjsRestaurant.js` — MJ's Restaurant vision scraper
- `src/lib/scrapers/paganosUva.js` — Pagano's UVA vision scraper
- `src/lib/scrapers/captainsInn.js` — Captain's Inn vision scraper (Wix)
- `src/lib/scrapers/charleysOceanGrill.js` — Charley's Ocean Bar vision scraper (WP JSON API)

### Files Modified
- `src/app/api/sync-events/route.js` — Added imports and registration for all 4 vision scrapers in Promise.all, VENUE_REGISTRY (source: 'Vision OCR (Gemini)'), and allEvents array

### Env Vars Required
- `GOOGLE_AI_KEY` — Google AI Studio API key for Gemini 2.5 Flash (free tier)

### Tim McLoone's — Artist Bios (ABANDONED)

Attempted to fetch artist description/bios from Ticketbud detail pages:
- Added `fetchDescription()` with ql-editor regex targeting
- Multiple regex strategies failed (content nesting, Cloudflare blocking, proxy IP rotation broke IPRoyal pay-as-you-go plan)
- Vercel 10s timeout made multi-page fetching impractical (12 detail pages with delays)
- **Decision:** Disabled detail page fetching entirely. User will add bios manually via admin dashboard.
- Code (`fetchDescription`, `sleep`) still exists in `timMcLoones.js` but is unused.

### Pending / TODO
- **Run `is_time_tbd` reset SQL** in Supabase (still pending from previous session)
- **Headless browser architecture** for House of Independents + Starland Ballroom (backlog)

---

## Session: March 25, 2026 — Split Source Tracking, Admin Auth, Spotlight Routing Fixes, Triage UI Polish

### What Changed

#### 1. Metadata Triage UI — Date Added Sort (completed from prior session)
- Added `date_added` sort logic to the triage artist list (sorts by `created_at` descending, newest first)
- Sort dropdown already had the option; now the actual sorting code is wired up
- File: `src/app/admin/page.js` (~line 2480)

#### 2. Split Source Tracking (image_source / bio_source)
- **Database:** Two new columns on `artists` table: `image_source` (TEXT, default 'Unknown') and `bio_source` (TEXT, default 'Unknown')
- **Enrichment pipeline** (`src/lib/enrichArtist.js`): Tracks provenance per-field through the entire pipeline:
  - MusicBrainz image → `image_source: 'MusicBrainz'`
  - Discogs fallback → `image_source: 'Discogs'`
  - Last.fm fallback → `image_source: 'Last.fm'` (both image and bio)
  - If artist was initially 'Scraped' but enrichment finds API data, the API name **overwrites** the Scraped tag
- **Scraper upsert** (`src/app/api/sync-events/route.js`): New artists from scrapers get `image_source: 'Scraped'` / `bio_source: 'Scraped'`; updates to existing artists also set the source
- **Triage UI** (`src/app/admin/page.js`): Single source badge replaced with two compact badges: `Img: MusicBrainz` and `Bio: Last.fm` (color-coded per source)
- **Source filter dropdown**: Now lists actual API names (MusicBrainz, Discogs, Last.fm, Scraped, Manual, Unknown); filters if EITHER image_source or bio_source matches
- **CSV export**: Now includes separate `Image Source` and `Bio Source` columns instead of single `Metadata Source`

#### 3. Admin Login — Session Persistence, Autofill & Password Toggle
- **Session persistence**: Password saved to `sessionStorage` on login, auto-restored on refresh/new tab. All data-fetch functions fire automatically on session restore. Cleared on 401 response.
- **Browser autofill**: Hidden `<input type="text" name="username" autocomplete="username" value="admin">` + password field has `autocomplete="current-password"`. Chrome/Safari now offer to save credentials.
- **Password visibility toggle**: Eye icon inside password input toggles between hidden/visible text. SVG icons for open eye / crossed-out eye.
- **Password change**: Update `ADMIN_PASSWORD` env var in Vercel project settings → redeploy. Old sessions auto-clear on first 401.

#### 4. Spotlight "Edit Image" Routing Fix
- **Bug**: Clicking "Edit Artist Profile" from Spotlight missing-image modal kicked to main Directory instead of the artist edit panel. Two root causes:
  1. `artists` array was empty (only loaded on Artists tab visit, not Spotlight)
  2. Didn't switch to `triage` sub-tab where the edit panel renders
- **Fix**: Button is now `async`, fetches artists on-demand if array is empty, then routes to `artists` tab → `triage` sub-tab with edit panel pre-populated

#### 5. Post-Edit Return Routing (Spotlight → Edit → Save → Spotlight)
- **Bug**: After editing an artist from Spotlight and saving, user was left on the Artists/Triage tab instead of returning to Spotlight
- **Fix**: New `returnToTab` state variable. Set to `'spotlight'` when navigating from Spotlight modal. After successful save, cancel, or close (✕), automatically switches back to the stored tab and refreshes Spotlight events. State is cleared after use so it never interferes with normal navigation.
- Generic pattern: any future tab can use `setReturnToTab('tab-name')` before routing to artist edit

#### 6. Smart Categorization & Triage Bypass (confirmed from prior session)
- Already implemented: Gemini OCR returns `category` + `confidence_score` per artist
- Triage auto-routing: `confidence_score >= 90` → `triage_status: 'reviewed'` (bypasses triage)
- Requires SQL: `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Live Music'; ALTER TABLE submissions ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0;`

### SQL Migrations Required (Run in Supabase SQL Editor)

```sql
-- Split source tracking
ALTER TABLE artists ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT 'Unknown';
ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio_source TEXT DEFAULT 'Unknown';

-- Smart categorization (if not already run)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Live Music';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0;
```

### Files Modified
- `src/lib/enrichArtist.js` — Split source tracking (image_source, bio_source) through MusicBrainz → Discogs → Last.fm pipeline
- `src/app/api/sync-events/route.js` — Scraper upserts now set image_source/bio_source to 'Scraped'
- `src/app/admin/page.js` — All UI changes: date_added sort, split source badges, source filter dropdown, CSV export, session persistence, autofill hack, password toggle, Spotlight edit routing fix, return-to-tab routing

### Deploy Steps
1. Run SQL migrations above in Supabase
2. From local terminal:
   ```bash
   git add -A
   git commit -m "Split source tracking, admin auth, Spotlight routing fixes"
   git push origin main
   ```
3. If webhook doesn't trigger: `npx vercel --prod`

### Pending / TODO
- **Test full Spotlight → Edit → Save → Return flow** with a missing-image artist
- **Re-upload Sea Hear Now poster** to test smart categorization + autocomplete + batch apply
- **Test enrichment image pipeline** — verify Wikidata → Wikimedia Commons images populate `image_source: 'MusicBrainz'`
- **Headless browser architecture** for House of Independents + Starland Ballroom (backlog)

---

## Session: March 26, 2026 — In-App Support Form, Modal Merge, Global Contrast Fix, Conditional Hero

### What Changed

#### 1. In-App Support Form (replaces mailto: link)
- **Before**: "Contact Support" button in Profile tab opened `mailto:mylocaljam@gmail.com` (kicked to email client)
- **After**: Opens a native bottom-sheet-style modal with category selector, message textarea, and success toast
- **New component**: `src/components/SupportModal.js`
- **New API endpoint**: `src/app/api/support/route.js` — POST stores to `support_requests` table, GET (admin-only) retrieves with optional status filter
- **Profile menu**: `mailto:` onClick replaced with `setShowSupport(true)`

#### 2. Merged Feedback + Support Modals into Single "Help & Feedback" Experience
- **Before**: Two separate menu rows ("Give Feedback" → FeedbackModal, "Contact Support" → SupportModal) with overlapping categories
- **After**: Single "Help & Feedback" row opens one unified SupportModal with:
  - Section 1: "How's the vibe?" emoji rating row (1-5 scale, carried over from FeedbackModal)
  - Section 2: Unified category pills — Account Issue, Event / Listing, Bug Report, Feature Idea, General
  - Section 3: Single textarea ("Describe what happened or what's on your mind...")
  - Submit button: "Send Message"
- **Deleted**: `src/components/FeedbackModal.js` (removed entirely)
- **Removed**: `showFeedback` state, FeedbackModal import and render from `src/app/page.js`
- **API updated**: `/api/support` now accepts optional `rating` (1-5) alongside `category`, `message`, `email`
- Icon changed from `chat_bubble` to `help_outline` for the merged row

#### 3. Global Contrast Fix — No White Text/Icons on Orange (#E8722A) Backgrounds
- **Design rule**: All orange-background elements now use `#1C1917` (Tailwind gray-900) text/icon color instead of white
- **Phase 1 (pills/badges/tags)**: Filter shortcut pills, date pills, date picker pill, saved tab segment toggle, admin sub-tab pills, force sync button (6 instances across page.js + admin/page.js)
- **Phase 2 (full CTAs + SVGs — "no exceptions")**: Every remaining white-on-orange element updated across 15 files:
  - `src/app/page.js` — filter count badge text + SVG, "+" FAB SVG, "Show X events" CTA, profile camera SVG, "Save Changes" button, notification badges
  - `src/app/admin/page.js` — tab count badges, Create Venue, Resolve dropdown, Bulk Save Time, AI Enrich, Confirm & Run, Auto-Fill with AI
  - `src/app/admin/queue/page.js` — Login, Back to Admin, queue action buttons
  - `src/app/event/[id]/EventPageClient.js` — Browse Events, Create Free Account, Sign Up Free
  - `src/app/event/[id]/page.js` — Browse Events fallback link
  - `src/app/redesign/page.js` — "+" FAB SVG, filter CTA, Sign In button
  - `src/components/EventCardV2.js` — Follow button text + SVG stroke, flag submit
  - `src/components/MapView.js` — "Go" search button
  - `src/components/SearchFilterRedesign.js` — "+" FAB SVG, profile avatar SVG, Show Events, notification badges
  - `src/components/AuthModal.js` — Sign in / submit buttons
  - `src/components/WelcomeModal.js` — "Get Started" button
  - `src/components/SubmitEventModal.js` — Upload + Submit buttons
  - `src/components/SupportModal.js` — "Send Message" button
  - `src/lib/sendEmail.js` — CTA button in notification emails

#### 4. Conditional Spotlight Hero Rendering
- **Before**: "Today's Spotlight" hero carousel always displayed on Home tab, pushing search results down
- **After**: Hero unmounts when any search query or filter is active (`hasActiveFilters` check)
- **Condition**: `activeTab === 'home' && !hasActiveFilters` — hero shows only when search is empty AND no date/distance/shortcut filters are applied
- Events list snaps directly under the search bar when filtering, maximizing screen space
- File: `src/app/page.js` (line ~2229)

### SQL Migrations Required (Run in Supabase SQL Editor)

```sql
-- Support requests table (new)
CREATE TABLE IF NOT EXISTS support_requests (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  category    TEXT DEFAULT 'general',
  message     TEXT,
  email       TEXT,
  status      TEXT DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Files Created
- `src/components/SupportModal.js` — Unified Help & Feedback modal (emoji rating + categories + message)
- `src/app/api/support/route.js` — Support request POST/GET endpoint

### Files Deleted
- `src/components/FeedbackModal.js` — Replaced by merged SupportModal

### Files Modified
- `src/app/page.js` — Removed FeedbackModal, added SupportModal, merged menu row, contrast fixes, conditional hero rendering
- `src/app/admin/page.js` — Contrast fixes on all orange buttons/badges
- `src/app/admin/queue/page.js` — Contrast fixes
- `src/app/event/[id]/EventPageClient.js` — Contrast fixes
- `src/app/event/[id]/page.js` — Contrast fixes
- `src/app/redesign/page.js` — Contrast fixes
- `src/components/EventCardV2.js` — Contrast fixes (follow button, flag submit)
- `src/components/MapView.js` — Contrast fix (Go button)
- `src/components/SearchFilterRedesign.js` — Contrast fixes (FAB, badges, CTA)
- `src/components/AuthModal.js` — Contrast fixes
- `src/components/WelcomeModal.js` — Contrast fix
- `src/components/SubmitEventModal.js` — Contrast fixes
- `src/lib/sendEmail.js` — Contrast fix (email CTA button)

### Deploy Steps
1. Run SQL migration above in Supabase (support_requests table)
2. Push and deploy:
   ```bash
   git add -A
   git commit -m "In-app support, modal merge, global contrast fix, conditional hero"
   git push origin main
   ```
3. If webhook doesn't trigger: `npx vercel --prod`

### Pending / TODO
- **Test full Spotlight → Edit → Save → Return flow** with a missing-image artist
- **Re-upload Sea Hear Now poster** to test smart categorization + autocomplete + batch apply
- **Test enrichment image pipeline** — verify Wikidata → Wikimedia Commons images populate `image_source: 'MusicBrainz'`
- **Headless browser architecture** for House of Independents + Starland Ballroom (backlog)
- **Test Help & Feedback modal** — submit a test message, verify it lands in `support_requests` table
- **Verify contrast** — spot-check orange buttons across the app on mobile (dark + light mode)

---

## Session: March 27, 2026 — Admin Locks, Instagram Removal, UX Polish, Auth

### 1. Metadata Lock System — Full Rebuild
**Problem:** Lock state was fragmented — list view pills, edit modal inputs, and the master lock toggle all operated on disconnected state. Toggling a lock in one place didn't reflect in others. LockBadge in the edit modal only updated local React state, never persisted to DB. The `editingArtist` was a stale snapshot taken on pencil click.

**Architecture (two-layer lock system):**
- `is_locked` BOOLEAN on `artists` — global flag that blocks the enrichment pipeline from overwriting any field
- `is_human_edited` JSONB on `artists` — per-field lock map (e.g. `{ bio: true, image_url: true }`) that protects individual fields

**Fix — three-layer sync:**
1. DB → `fetchArtists()` → `artists` array (source of truth)
2. `useEffect` watches `artists` array and syncs lock fields into `editingArtist` (fixes stale snapshot)
3. `isFieldLocked()` reads from `editingArtist.is_human_edited` → drives `readOnly`/`disabled` on inputs

**Key changes in `src/app/admin/page.js`:**
- `useEffect` sync bridge: watches `artists` array, patches `editingArtist` lock fields when they change
- `LockBadge` component: always-visible toggle (was hidden when unlocked), persists to DB via PUT + `fetchArtists()`
- `TrafficDot` pills (list view): clickable lock toggles with DB persistence
- Master lock toggle: now computes `newFieldLocks` from populated fields and sends both `is_locked` + `is_human_edited` in one PUT
- AI auto-fill in edit modal: respects `is_human_edited` per-field — skips locked fields
- Image carousel arrows: hidden when `image_url` is locked

**Visual distinction (locked vs unlocked):**
- Locked: green background `rgba(34,197,94,0.15)`, green text `#22c55e`, green border, padlock icon + "LOCKED" label
- Unlocked: near-invisible gray `rgba(136,136,136,0.06)`, muted text `rgba(136,136,136,0.5)`, faint border, "OPEN" label (no icon)

**Backend validation in `src/app/api/admin/artists/route.js`:**
- PUT handler checks existing `is_human_edited` before applying updates
- Locked fields are stripped from the update payload unless the request is explicitly unlocking them
- `lockableFields`: `['name', 'bio', 'genres', 'vibes', 'image_url']`

### 2. Instagram URL — Complete Removal
Deprecated `instagram_url` from the entire codebase. Files modified:

| File | Changes |
|---|---|
| `src/app/admin/page.js` | Removed from `artistForm` state, form initialization, save payload, bulk enrich, AI auto-fill, master lock toggle, edit modal fields |
| `src/app/api/admin/artists/route.js` | Removed from POST insert, needsInfo filter, lockableFields, manualFields |
| `src/app/api/admin/artists/ai-lookup/route.js` | Removed from AI prompt, response schema, result object |
| `src/app/page.js` | Removed from Supabase select queries and field mappings |
| `src/app/event/[id]/page.js` | Removed from artist select query and field mapping |
| `src/app/api/events/route.js` | Removed from artist select query |

**SQL migration (must run manually):** `supabase-drop-instagram.sql`
```sql
ALTER TABLE artists DROP COLUMN IF EXISTS instagram_url;
```

### 3. Top Nav "Add" Button — Ghost Style
Changed the "+" button in the top nav from solid orange to ghost/transparent style:
- `background: 'transparent'`
- `border: 1px solid` with `rgba(255,255,255,0.2)` dark / `rgba(0,0,0,0.2)` light
- Icon fill: `rgba(255,255,255,0.8)` dark / `rgba(0,0,0,0.5)` light
- Hover: `rgba(255,255,255,0.1)` via `.add-jar-btn:hover` in `globals.css`

**Files:** `src/app/page.js`, `src/app/globals.css`

### 4. "My Jam" Toggle — Renamed & Restyled
- "My Shows" → **"My Stubs"**
- "My Artists" → **"My Locals"**
- Font size: 15px → 16px
- Font weight: both set to 700
- Inactive color: `rgba(255,255,255,0.85)` (more legible)

**File:** `src/app/page.js`

### 5. My Locals (FollowingTab) — Sort, Filter & UI Cleanup
**File:** `src/components/FollowingTab.js`

**Sort/filter dropdown:**
- State: `sortBy` (default `'alpha'`), `onlyUpcoming`, `showSortMenu`
- Click-outside close via `sortMenuRef` + `useEffect` with `mousedown` listener
- Menu options: Alphabetical (default), Next Event Date, Recently Added

**Sort logic:**
- `alpha`: A-Z by name
- `next_event`: soonest gig first, artists with no upcoming gig sink to bottom
- `recent`: `created_at` descending

**Upcoming-only toggle:** filters to artists with `next_gig` set

**UI cleanup:**
- Subtitles removed — single-line artist directory
- Dates shown only when `sortBy === 'next_event'` (right-aligned: "Tonight" / "Tomorrow" / "Mon, Apr 16")

### 6. Email Magic Link Auth
**File:** `src/components/AuthModal.js`

Layout reordered to promote magic link as primary auth method:
1. Magic link email form (top/primary)
2. "or" divider
3. Google/Apple OAuth buttons (secondary)

Copy changes: "Send Login Link" → "Send Magic Link", placeholder "you@example.com" → "name@example.com"

Implementation was already complete (`signInWithOtp`, success state, `/auth/callback` redirect) — only needed layout reorder.

**File:** `src/app/auth/callback/route.js` — already existed, handles PKCE code exchange

### 7. Profile Auth Indicators & Email Management
**File:** `src/app/page.js`

**Auth provider indicator:**
- Detects provider from `user.app_metadata.provider` (or `.providers[0]`)
- Renders Google G SVG, Apple logo SVG, or envelope icon below email in profile header

**Editable email:**
- New state: `editEmail`, `emailChangeNote`
- Email field in Edit Profile modal converted from read-only to editable input
- Warning text: "A verification link will be sent to this new address"
- Save handler: if email changed, calls `supabase.auth.updateUser({ email })` which triggers Supabase's built-in verification flow
- On success: modal stays open with green "Verification email sent" note instead of closing

### Files Modified (this session)
- `src/app/admin/page.js` — Lock system rebuild, instagram removal, visual polish
- `src/app/api/admin/artists/route.js` — Backend lock validation, instagram removal
- `src/app/api/admin/artists/ai-lookup/route.js` — Instagram removal from AI prompt
- `src/app/page.js` — Ghost add button, toggle rename, instagram removal, auth provider icons, email editing
- `src/app/event/[id]/page.js` — Instagram removal
- `src/app/api/events/route.js` — Instagram removal
- `src/components/FollowingTab.js` — Sort/filter dropdown, UI cleanup
- `src/components/AuthModal.js` — Magic link layout reorder
- `src/app/globals.css` — Add button hover style

### Files Created
- `supabase-drop-instagram.sql` — Column drop migration

### Deploy Steps
1. Run `supabase-drop-instagram.sql` in Supabase SQL Editor
2. Verify "Link accounts with the same email" is enabled in Supabase Auth → Providers (likely on by default)
3. Push and deploy:
   ```bash
   git add -A && git commit -m "feat: lock system rebuild, instagram removal, auth polish, UX updates" && git push && npx vercel --prod
   ```

### Pending / TODO
- **Test full lock flow** — toggle lock in list view pill, verify it reflects in edit modal and blocks AI auto-fill
- **Test magic link auth** — sign up via magic link, verify callback redirect works
- **Test email change** — edit email in profile, verify verification email arrives, confirm new email works after clicking link
- **Test account linking** — sign up via magic link, sign out, sign in via Google with same email, verify same account
- **Run `supabase-drop-instagram.sql`** — drop the `instagram_url` column from `artists` table
- **Headless browser architecture** for House of Independents + Starland Ballroom (backlog)

---

## Session — March 27, 2026 (Event Metadata, PostHog, Save Icon, Festivals, Admin Analytics)

### Changes Made

#### 1. Edit Event Modal — Metadata Separation
- **File:** `src/app/admin/page.js`
- Renamed "Artist Bio" label → "Event Description (Optional)" with helper text explaining it overrides global artist bio
- DB column is still `artist_bio` on `events` table — no schema change needed

#### 2. Event Title Fallback Logic
- **Files:** `src/components/EventCardV2.js`, `src/components/SiteEventCard.js`, `src/app/event/[id]/EventPageClient.js`, `src/components/SavedGigCard.js`
- `event_title` now renders as primary headline on event cards
- `artist_name` shows as subtitle underneath when `event_title` is set and differs
- Description fallback priority fixed: `e.artist_bio || e.artists?.bio || ''` (event-level overrides global)

#### 3. Admin Venue Dropdown Bug Fix
- **File:** `src/app/admin/page.js`
- `EventFormModal` now accepts `venues` prop from DB instead of hardcoded 6-venue list
- Current venue always included in dropdown even if not in DB venues list

#### 4. Source Icon Update
- **File:** `src/app/admin/page.js`
- External-link icon → chain-link icon to distinguish from edit icon

#### 5. Publish/Unpublish State Logic
- **File:** `src/app/admin/page.js`
- Status badges: green "Published" or grey "Draft"/"Hidden"
- Action buttons: only shows the relevant action (Unpublish for published, Publish for draft/hidden)

#### 6. PostHog Analytics (v1.0)
- **New file:** `src/lib/posthog.js` — singleton PostHog init with autocapture, session recording, SPA tracking
- **New file:** `src/components/PostHogProvider.js` — client component for SPA page view tracking on route change
- **File:** `src/app/layout.js` — wrapped children with `PostHogProvider` inside `Suspense`
- **File:** `src/app/page.js` — identity management (`posthog.identify` on auth, `posthog.reset` on sign out)
- Custom events tracked: `User Signed In`, `event_bookmarked`, `Local Followed`, `List Sorted/Filtered`
- **Env vars required:**
  - `NEXT_PUBLIC_POSTHOG_KEY=phc_4hYcx23N3RcvKnnQ8TpuJvWGNb8uV5PMYuLTWbg0TgG`
  - `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`
  - `POSTHOG_PERSONAL_API_KEY=phx_TcmwJJOF2eIgv94GQbmLzXgO6Z43JawI0yV1Qb3QvKOnXA7`

#### 7. PostHog Admin Dashboard Widgets
- **New file:** `src/app/api/admin/analytics/route.js` — server-side route querying PostHog HogQL API
  - Queries: unique visitors, mobile/desktop breakdown, venue link clicks
  - Auth: requires admin password via query param
  - Date range filtering: today / 7d / 30d / all (maps to HogQL interval)
- **File:** `src/app/admin/page.js` — dashboard MetricCards wired to live PostHog data
  - `analyticsData` / `analyticsLoading` state
  - `fetchAnalytics()` called on auth and on date range change
  - Cards show loading states (`…`), real numbers, and percentage breakdowns

#### 8. Save Icon Evolution (Bookmark → Plus → Orange Minimalist)
- **File:** `src/components/EventCardV2.js`
- Went through multiple iterations per user feedback:
  - Bookmark → Plus circle → Large orange filled circle → **Final: orange outline circle with orange checkmark**
- Final design: 26px fixed size, `strokeWidth: 1.5` outline matches unsaved state, solid orange `#E8722A` checkmark inside
- Unsaved: grey circle outline with plus sign
- Saved: orange circle outline with orange checkmark — "high-contrast minimalist" approach

#### 9. Bookmark Toast & Follow Logic
- **File:** `src/components/EventCardV2.js`
- Toast shows for ALL saves (removed `!isArtistFollowed` gate)
- Follow button hidden when artist already followed
- Header copy updated, toast scaled up (260px wide, 15px header font)
- AM/PM contrast fix: `opacity: 0.75`, `fontWeight: 700`

#### 10. Festival Cleanup & Admin Tab
- **File:** `src/app/admin/page.js` — new "Festivals" management tab
  - Lists festivals grouped by `event_title` with event counts
  - Search with case-insensitive `normalizeVenue()` matching
  - Bulk rename and bulk delete (clears `event_title` + `is_festival`)
- **File:** `src/app/api/admin/route.js` — PUT handler additions:
  - `bulk_rename_festival`: updates `event_title` across all matching events
  - `bulk_clear_festival`: clears `event_title` and `is_festival` for matching events
- **File:** `src/app/page.js` — festival autocomplete normalization fix using `normalizeVenue()`

### Deploy Instructions
```bash
git push origin main
npx vercel --prod
```

### Vercel Env Vars to Add (Production)
- `NEXT_PUBLIC_POSTHOG_KEY` = `phc_4hYcx23N3RcvKnnQ8TpuJvWGNb8uV5PMYuLTWbg0TgG`
- `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
- `POSTHOG_PERSONAL_API_KEY` = `phx_TcmwJJOF2eIgv94GQbmLzXgO6Z43JawI0yV1Qb3QvKOnXA7`

### Pending / TODO
- **Add PostHog env vars to Vercel** — all three vars above need to be in Production environment
- **Run festival SQL cleanup:** `UPDATE events SET event_title = 'Sea Hear Now 2026' WHERE event_title = 'sea.hear.now';`
- **Run `supabase-drop-instagram.sql`** — still pending from prior session
- **Test PostHog dashboard** — verify analytics widgets populate after env vars are set on Vercel

---

## Session: March 28, 2026 — Event Modal Waterfall & AI Enhance

### What Changed

**1. Event-Specific Image Upload (`event_image_url`)**
- New column `event_image_url` on events table (migration: `sql/add-event-image-url.sql`)
- Event Edit modal now includes "Event Image URL" field with live preview thumbnail
- Admin API `POST` and `PUT` handlers updated to persist `event_image_url`

**2. AI Enhance Button for Event Descriptions**
- New API route: `src/app/api/admin/ai-enhance/route.js`
- Uses OpenAI `gpt-4o-mini` to generate 2-3 sentence event descriptions
- Purple "AI Enhance" button in Event Edit modal next to description field
- Requires `OPENAI_API_KEY` env var on Vercel

**3. Frontend Waterfall Hierarchy**
- Image waterfall: `event_image` → `artist_image` → `venue_photo`
- Text waterfall: `event.description` (from `artist_bio` on events) → `artist.bio`
- Headline waterfall: `event_title` → `artist_name` (already existed)
- Updated in: EventCardV2, EventPageClient, SavedGigCard, HeroSection, SpotlightCarousel, event detail page (SSR + OG)
- Homepage `page.js` and `event/[id]/page.js` mappings now include `event_image` field

### Files Modified
- `src/app/admin/page.js` — EventFormModal: added `event_image_url` field, AI Enhance button, `adminPassword` prop
- `src/app/api/admin/route.js` — POST/PUT: added `event_image_url` column support
- `src/app/api/admin/ai-enhance/route.js` — NEW: AI description enhancement endpoint
- `src/app/page.js` — Event mapping includes `event_image`
- `src/app/event/[id]/page.js` — flattenEvent + OG image uses waterfall
- `src/app/event/[id]/EventPageClient.js` — Image waterfall
- `src/components/EventCardV2.js` — Image waterfall
- `src/components/SavedGigCard.js` — Image waterfall
- `src/components/HeroSection.js` — Image waterfall
- `src/components/SpotlightCarousel.js` — Image waterfall
- `sql/add-event-image-url.sql` — NEW: migration to add column

### Env Vars Needed
- `OPENAI_API_KEY` — required for AI Enhance feature (add to Vercel Production env)

### Pending / TODO
- **Run `sql/add-event-image-url.sql`** in Supabase SQL Editor before deploying
- **Add `OPENAI_API_KEY` to Vercel** env vars
- **Run `supabase-drop-instagram.sql`** — still pending from prior session
- **Run festival SQL cleanup:** `UPDATE events SET event_title = 'Sea Hear Now 2026' WHERE event_title = 'sea.hear.now';`

---

## Session: March 30, 2026 — Admin Dashboard Modular Refactor (UAT & Bug Fixes)

Branch: `admin-refactor` (NOT merged to main yet)

### Summary

Continued the admin page modular refactor that began in the prior session (breaking the monolithic `src/app/admin/page.js` into standalone tab components). This session focused on UAT — testing each tab, catching runtime crashes from missing imports/props, and restoring strict 1:1 production UI parity.

### Bug Fixes

**1. `formatTime` missing import — AdminEventsTab.js**
- **Error:** `ReferenceError: formatTime is not defined` at line 278
- **Cause:** Only `formatDate` was imported; `formatTime` was used but never added during extraction
- **Fix:** Changed import to `import { formatDate, formatTime } from '@/lib/utils'`
- Audited all 10 extracted components — this was the only missing utility import

**2. `artistMissingFilters` type mismatch — AdminArtistsTab.js**
- **Error:** `TypeError: artistMissingFilters.includes is not a function`
- **Cause:** Parent `page.js` initializes `artistMissingFilters` as an object `{ bio: false, image_url: false, genres: false, vibes: false }` but the component was treating it as an array (calling `.includes()`, `.indexOf()`, `.filter()`)
- **Fix:** Rewrote all filter logic in AdminArtistsTab.js to use object-based approach (`Object.values().some(Boolean)`, individual property checks), matching production exactly

**3. Dashboard "New Events (24H)" card not working — AdminDashboardTab.js**
- **Error:** Click handler referenced `setEventsStatusFilter` which wasn't in props
- **Fix:** Added `setEventsStatusFilter` to both the parent's JSX props and the component's destructuring. Also added missing props: `setVenuesFilter`, `setEventsRecentlyAdded`, `setEvents`, `setFlagsViewFilter`, `setEventsMissingTime`, `setArtistMissingFilters`, `fetchReports`

**4. `queueSelected` and 7 other missing props — AdminSubmissionsTab.js**
- **Error:** `ReferenceError: queueSelected is not defined` at line 159
- **Cause:** 8 variables used in the component were never passed as props during extraction
- **Fix:** Added all 8 to both parent JSX and component destructuring:
  - `queueSelected` (derived value: `queue[queueSelectedIdx] || null`)
  - `festivalNames` (state: festival name list for datalist)
  - `batchApplyPrompt` / `setBatchApplyPrompt` (state: batch apply UI)
  - `qLabelStyle` / `qInputStyle` (style objects for form fields)
  - `qGreen` / `qRed` (color constants for approve/reject buttons)

### UI Parity Restorations

**5. Artists tab sub-navigation toggle**
- The Directory / Metadata Triage pill toggle was lost during extraction
- Restored with `#E8722A` active background, `#1C1917` active text, matching production styling

**6. Directory view — gallery grid replaced with sortable table**
- Production uses a table layout with columns: Artist (avatar + name), Next Event, Date Added, Genres
- Replaced the gallery grid with production's sortable table including `SortChevron`, `toggleSort`, and `approvedArtists` filtering (requires both bio and image_url)
- Fixed `directorySort` from string-based to object-based `{ col, dir }`

**7. Triage view — unified Missing dropdown + TrafficDot pills**
- Replaced individual square filter buttons with production's unified "Missing: All / Bio / Image / Genres / Vibes" dropdown (object-based state)
- Replaced green/yellow checkmark boxes with TrafficDot pill badges showing locked/live/missing/pending states with lock icons

**8. Triage inline edit panel restored (~470 lines)**
- The pencil edit button was wired but the entire inline editor panel was missing from the extracted component
- Restored full production edit panel: AI Auto-Fill, LockBadge, RegenBtn, name/bio/vibes/genres/image fields, image carousel, associated events, Save Draft / Approve & Publish buttons

### Files Modified

| File | Size | Changes |
|------|------|---------|
| `src/app/admin/page.js` | 82KB | Added `setEventsStatusFilter` prop to Dashboard, added 8 missing props to Submissions JSX, reverted `artistMissingFilters` to object-based useState |
| `src/components/admin/AdminArtistsTab.js` | 71KB | Complete rewrite (380→1,281 lines): sub-tab toggle, sortable directory table, unified Missing dropdown, TrafficDot pills, full inline edit panel, object-based filter logic |
| `src/components/admin/AdminDashboardTab.js` | 13KB | Added `setEventsStatusFilter` + other missing props to destructuring, reverted `setArtistMissingFilters` calls to object form |
| `src/components/admin/AdminEventsTab.js` | 22KB | Fixed import: added `formatTime` alongside `formatDate` |
| `src/components/admin/AdminFestivalsTab.js` | 7KB | Added missing props from prior session: `festivalData`, `festivalSearch`, `setFestivalSearch`, `editingFestival`, `setEditingFestival`, `fetchFestivalNames` |
| `src/components/admin/AdminSubmissionsTab.js` | 32KB | Added 8 missing props: `queueSelected`, `festivalNames`, `batchApplyPrompt`, `setBatchApplyPrompt`, `qLabelStyle`, `qInputStyle`, `qGreen`, `qRed`; fixed `qBg`→`qSurfaceAlt` |

### Key Technical Decisions

- **`artistMissingFilters` is object-based** (NOT array): `{ bio: false, image_url: false, genres: false, vibes: false }`. This went through three states during debugging (object → array → back to object) because production's unified dropdown depends on the object form.
- **`directorySort` is object-based**: `{ col: 'date_added', dir: 'desc' }`, not a string.
- **`queueSelected` is a derived value** computed in `page.js` as `queue[queueSelectedIdx] || null`, not a state variable. It must be passed as a prop since the component can't derive it without access to `queue`.

### Commit

```
Complete admin dashboard modular refactor, restore production UI parity, and fix Submissions tab props.
```

Pushed to `admin-refactor` branch. Tony verified: "The local dashboard is now a perfect 1:1 match with production."

### Pending / Next Steps

- **Phase 4: Move tab-specific state into components** — will further thin out page.js by co-locating state with the components that use it
- **Merge `admin-refactor` → `main`** — only after full UAT sign-off on all tabs
- **Backburner: Events Reel Image Edit Crash** — debug when reproducible
- **Backburner: Incognito Login Issue** — likely cookie/storage partitioning
- **From prior sessions:** Create Supabase `artists` storage bucket, run base64 migration, various SQL/config tasks

---

## ADMIN ARCHITECTURE OVERHAUL (APRIL 2026)

### The Great Purge

`src/app/admin/page.js` was systematically refactored from **1,699 lines** down to **728 lines** — a **57% reduction**. All domain-specific state and controller logic was extracted into dedicated custom hooks using a strict set of rules:

- **Zero Feature Changes** — every extraction was a strict 1:1 lift with no new behavior.
- **No Logic Refactoring** — code was moved verbatim; no optimizations, no consolidation.
- **One-Step Isolation** — each hook was extracted, wired, and verified before moving to the next.
- **No new `console.log` statements** — only pre-existing error logging was preserved in the hooks.

### Hook Directory

Eight custom hooks were created in `src/hooks/`, each owning a single domain's state and controller logic:

| Hook | Prefix | Lines | Responsibility |
|---|---|---|---|
| `useAdminQueue` | `q.` | 410 | Queue state, flyer uploads, approve/reject/archive actions |
| `useAdminArtists` | `ar.` | 216 | Artist state, bios, duplicate detection, bulk enrichment |
| `useAdminSpotlight` | `sp.` | 121 | Homepage spotlight pins, save/clear/toggle |
| `useAdminEvents` | `ev.` | 106 | Event state, paginated fetch, featured toggles, category updates |
| `useAdminTriage` | `tr.` | 75 | Uncategorized event triage, categorization, deletion |
| `useAdminVenues` | `ve.` | 61 | Venue list, scraper health dashboard, force-sync actions |
| `useAdminFestivals` | `fe.` | 44 | Festival name autocomplete, grouped data, search/edit |
| `useAdminReports` | `re.` | 23 | User-submitted flags, submissions list, filter state |

### The "Glue" Rule

After the overhaul, `page.js` contains **only infrastructure glue**:

- **Auth/Login** — password state, session persistence via `sessionStorage`, `handleLogin` validation.
- **Global `fetchAll`** — parallel fetch orchestrator (`Promise.all`) that calls into domain hooks (`ev.fetchEvents`, `re.setSubmissions`, `re.setReports`).
- **Analytics** — PostHog analytics fetch (`fetchAnalytics`) and date range/env state.
- **Event CRUD** — `deleteEvent`, `saveEvent`, `unpublishEvent` (remain in page.js because they call `fetchAll`).
- **Tab Routing** — `activeTab` state, tab badge counts, and per-tab onClick data refresh triggers.
- **UI Modals** — Spotlight image warning, bulk time editor, event form, queue lightbox.
- **Toast System** — `showQueueToast` with auto-dismiss timers.

**No domain logic is permitted in the main page file.** Any new domain feature must be added to the appropriate hook or a new one.

### The Prefix Pattern

All hook instances in `page.js` use a **2-letter prefix convention** for namespacing:

```javascript
const ev = useAdminEvents({ password, showQueueToast, setAuthenticated });
const ve = useAdminVenues({ password, showQueueToast });
const q  = useAdminQueue({ password, venues: ve.venues, setVenues: ve.setVenues, fetchAll, supabase, toTitleCase, showQueueToast, authenticated });
const tr = useAdminTriage({ password, showQueueToast });
const ar = useAdminArtists({ password });
const sp = useAdminSpotlight({ password, fetchAll });
const fe = useAdminFestivals();
const re = useAdminReports({ password });
```

In JSX, all references use the prefix: `ev.events`, `ar.artists`, `ve.scraperHealth`, `q.fetchQueue`, `sp.toggleSpotlightPin`, etc. This eliminates naming collisions and makes it immediately clear which domain owns each piece of state.

**Hook ordering matters.** `ev` must be declared before `fetchAll` (which calls `ev.fetchEvents`), and `ve` must be declared before `q` (which receives `ve.venues` / `ve.setVenues`).

### UI Parity Rule — EventCardV2

`src/components/EventCardV2.js` (the staging/V2 feed card) must mirror the production logic in `src/app/event/[id]/EventPageClient.js`:

- **Venue button** renders only when `sourceLink` is a valid URL (`event.source` matching `/^https?:\/\//i`). No fallback to `ticket_link` or unconditional rendering — if there's no valid source URL, the button is hidden. This prevents dead links.
- **Cover Charge badge** is currently hidden (commented out) until the feature is fully set up in the backend. The `Badge` component import remains for the CANCELED badge.

### Line Count Journey

```
1,699  (original god file)
1,175  (after AdminLoginScreen + AdminFestivalsTab component extraction)
  986  (after useAdminArtists)
  881  (after useAdminSpotlight)
  805  (after useAdminEvents)
  762  (after useAdminVenues)
  735  (after useAdminFestivals)
  728  (after useAdminReports) ← current
```

---

## React Performance Optimization — `page.js` Card Render Cascade (April 4, 2026) ✅ DEPLOYED

### 1. The "Waterfall" Problem

Clicking "Save/Bookmark" on a single `EventCardV2` triggered a re-render of every card on the page (12+ `console.log` fires per interaction). Root cause: `page.js` passed unstable function references and inline-evaluated props to memoized children, defeating `React.memo` entirely.

The cascade path: `favorites` state change → `toggleFavorite` recreated (had `favorites` in its deps) → new prop reference on every card → all `EventCardV2` instances re-render → 60fps destroyed on scroll/search/save.

### 2. The "Stability Chain" Fix

**2a. `React.memo` on `EventCardV2`** (`src/components/EventCardV2.js`)

Wrapped the default export in `memo()`. The function declaration changed from `export default function EventCardV2(...)` to a bare `function EventCardV2(...)` with `export default memo(EventCardV2)` at EOF. Import: `memo` added to the existing `react` import on line 3.

**2b. Stable Refs for State Reads** (`page.js` lines 564–566)

Created `isLoggedInRef` and `favoritesRef` (alongside the pre-existing `followingRef`). Each is synced via a one-liner `useEffect`. This lets callbacks read current state values without listing them as `useCallback` dependencies, so the callback references never change:

```js
const isLoggedInRef = useRef(false);
const favoritesRef = useRef(new Set());
useEffect(() => { isLoggedInRef.current = isLoggedIn; }, [isLoggedIn]);
useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
```

**2c. Empty/Minimal Dependency Arrays**

| Callback | Deps Before | Deps After | Technique |
|---|---|---|---|
| `toggleFavorite` | `[favorites, isLoggedIn, openAuth, unsaveEventFromDb, saveEventToDb]` | `[openAuth, unsaveEventFromDb, saveEventToDb]` | Reads `favoritesRef.current.has()` and `isLoggedInRef.current` |
| `followEntity` | `[isLoggedIn, openAuth]` | `[openAuth]` | Reads `isLoggedInRef.current` |
| `handleFollowArtist` | `[isFollowing, followEntity, unfollowEntity]` | `[followEntity, unfollowEntity]` | Reads `followingRef.current.some()` |
| `unfollowEntity` | `[]` | `[]` | Already stable (functional `setFollowing`) |
| `handleFlag` | `[]` | `[]` | Already stable (just calls `setToast`) |

`openAuth` has deps `[]`, `unsaveEventFromDb` has deps `[]`, `unfollowEntity` has deps `[]` — the entire chain is referentially stable until `saveEventToDb` changes (deps: `[events, notifEnabled]`, both infrequent — page load / manual refresh only).

**2d. The Follow Set — `followedArtistNames`** (`page.js` line ~757)

Replaced inline `isFollowing('artist', name)` calls in the card JSX with a `useMemo` Set:

```js
const followedArtistNames = useMemo(() => {
  return new Set(following.filter(f => f.entity_type === 'artist').map(f => f.entity_name));
}, [following]);
```

JSX changed from `isArtistFollowed={isFollowing('artist', event.name || event.artist_name || '')}` to `isArtistFollowed={followedArtistNames.has(event.name || event.artist_name || '')}`. This is O(1) per card vs the old O(n) `.some()` scan, and the Set reference is stable between renders when `following` hasn't changed.

Note: `isFollowing` is NOT removed — it's still used by the bottom sheet components (artist profile sheet, venue sheet) which aren't memoized cards.

### 3. The "Nested Button" Hydration Fix (`page.js` line ~1524)

**Problem:** Console warning `In HTML, <button> cannot be a descendant of <button>`. The "Clear Filters" `<button>` (with `clearAllFilters()` onClick) was nested inside the Omnibar Pill's outer `<button>`. This caused React hydration mismatches on every page load.

**Fix:** Changed the outer Omnibar Pill wrapper from `<button>` to `<div>` with accessibility attributes:
- Added `role="button"` and `tabIndex={0}` for screen readers and keyboard focus
- Added `onKeyDown` handler supporting Enter and Space keys to match native button behavior
- All existing `onClick`, `style`, and `stopPropagation()` logic unchanged
- The inner "Clear Filters" `<button>` (line ~1635) remains a real `<button>` — now legal HTML since its parent is a `<div>`

**Result:** Console is clean of all hydration warnings.

### 4. Verification

- Re-renders confirmed at 4 total logs (Strict Mode minimum: 2 mount + 2 StrictMode double-invoke) for targeted cards only
- PostHog analytics verified: `$autocapture` and `event_bookmarked` events fire correctly after the refactor
- Hydration console is clean — no warnings on page load

### 5. Diagnostic Log (TEMPORARY — remove before deploy)

`EventCardV2.js` line ~137 has `console.log('--- CARD RENDERED ---', event?.artist_name || 'Unknown')` for testing. **Remove this line before production push.**

### 6. Remaining Technical Debt

**`saveEventToDb` cascade:** `toggleFavorite` still depends on `saveEventToDb` which has `[events, notifEnabled]` in its deps. When the full event list refreshes, `toggleFavorite` recreates — but this is infrequent (page load / manual refresh only). To fully eliminate: add `eventsRef` and `notifEnabledRef`. Low priority since the current fix already handles the high-frequency triggers (save/unsave/follow clicks, search typing, filter toggling).

---

## Architecture: Event Vibes vs. Artist Genres (April 5, 2026) ✅ DEPLOYED

### The Philosophy

**Genres** describe the artist's identity — permanent attributes like "Rock / Alternative", "Jazz / Blues", or "Electronic / DJ". These don't change between performances.

**Vibes** describe the venue experience — situational attributes like the energy level, crowd atmosphere, and setting. The same jazz trio might be "Chill / Low Key" at a wine bar and "Energetic / Party" at a street festival. Vibes are about the room, not the act.

### The "Final 4" Vibes

Consolidated from the original 6 vibes on April 5, 2026:

| New Vibe | Merged From | What It Describes |
|---|---|---|
| **Chill / Low Key** | "Acoustic / Intimate" + "Chill / Low-Key" | Low volume, relaxed crowd, conversational atmosphere. Any genre can fit — an acoustic singer-songwriter and a jazz quartet both qualify if the setting is mellow. |
| **Energetic / Party** | "High-Energy / Dance" + "Late Night / Party" | High volume, dancing, crowd energy. A rock band and a DJ both qualify if the room is loud and moving. |
| **Outdoor / Patio** | (kept as-is) | Outdoor setting — beer gardens, rooftop bars, boardwalk stages. Describes the physical environment. |
| **Family-Friendly** | (kept as-is) | All-ages, daytime events, kid-appropriate. Community events, festivals, fundraisers. |

### Why This Matters for AI Auto-Categorization

When the AI (Perplexity via `ai-lookup/route.js`) categorizes an event's vibe, it should look for venue/crowd descriptors, NOT instrument or genre keywords. A "Chill / Low Key" tag means "this is a quiet, relaxed atmosphere" regardless of whether the act plays acoustic guitar, piano jazz, or lo-fi electronic. The `ALLOWED_VIBES` in the AI lookup route has been updated to match the Final 4.

### Files Changed

- `src/lib/utils.js` — canonical `VIBES` array (4 items)
- `src/components/admin/shared/StyleMoodSelector.js` — local `VIBES` array + grid comment
- `src/app/api/admin/artists/ai-lookup/route.js` — `ALLOWED_VIBES` for AI classification
- `src/app/admin/queue/page.js` — consumes `VIBES` from utils.js (auto-updated via import)
- `EventFormModal.js` — consumes `VIBES` from StyleMoodSelector (auto-updated via import)
- `AdminArtistsTab.js` — consumes `VIBES` from StyleMoodSelector (auto-updated via import)

### Data Migration Note

Existing events/artists in the database may still have the old vibe values ("Acoustic / Intimate", "High-Energy / Dance", "Chill / Low-Key", "Late Night / Party"). The `page.js` filter logic compares vibes case-insensitively via `.toLowerCase()`, so old values will still match if shortcut pills reference them. However, for full consistency, a one-time Supabase query should remap old values to the new names in the `artists.vibes` array column and the `events.vibe` / `events.custom_vibes` columns.

---

## Metadata Waterfall Architecture (April 5, 2026) ✅ DEPLOYED

### The Hierarchy: Artist = Source of Truth, Event = Situational Override

All display metadata follows a "Smart Waterfall" where the artist provides the permanent identity and the event provides situational overrides.

**Source of Truth Rule (for all future AI prompts and code):**
1. **Event custom fields** override everything — if `custom_bio`, `custom_genres`, `custom_vibes`, or `custom_image_url` is set, it wins.
2. **Artist table** is the fallback — if the event has no custom override, inherit from the joined `artists` row (`bio`, `genres`, `vibes`, `image_url`).
3. **Hardcoded defaults** are the last resort — `'Live Music'` for category, `null` for image (which triggers venue photo or branded logo fallback).

This is a strict override chain, not a merge. If an event sets `custom_vibes: ['Energetic / Party']`, the artist's vibes are completely ignored for that event.

The merge happens at two layers:

**Layer 1 — Data Mapping (`page.js` lines 834–864, 1195–1222):**

| Field | Waterfall Priority |
|---|---|
| `event_image` | `custom_image_url` → `event_image_url` → null |
| `artist_image` | `artists.image_url` → null |
| `description` | `custom_bio` → `artist_bio` (event column) → `artists.bio` (joined) → '' |
| `artist_genres` | `custom_genres[]` → `[event.genre]` → `artists.genres[]` → [] |
| `artist_vibes` | `custom_vibes[]` → `[event.vibe]` → `artists.vibes[]` → [] |

**Layer 2 — Display (`EventCardV2.js` lines 89–95):**

| Display Field | Waterfall Priority |
|---|---|
| Image | `event.event_image` → `event.artist_image` → `event.venue_photo` → null |
| Category Tag | `artist_vibes[0]` → `artist_genres[0]` → `event.genre` → `event.vibe` → 'Live Music' |
| Genres Array | `event.artist_genres` → [] |

The category tag intentionally prefers vibes over genres because vibes describe the experience (what the user cares about when deciding to attend) while genres describe the artist identity (useful for filtering but less useful as a visual label).

### Unified Image Field (EventFormModal)

The admin event editor previously had two separate image inputs that caused confusion: `custom_image_url` (shown in `ImagePreviewSection` when artist is linked) and `event_image_url` (standalone input, shown only when no artist linked). This was consolidated on April 5, 2026:

- Single `ImagePreviewSection` renders for ALL events (with or without linked artist)
- When an artist is linked: lock/unlock toggle controls inheritance. Locked = shows artist image at 50% opacity. Unlocked = editable input for custom URL
- When no artist: input is always editable, no lock toggle shown
- `onUrlChange` writes to BOTH `custom_image_url` and `event_image_url` for backward compatibility
- On mount, `custom_image_url` seeds from `event_image_url` if the custom field is empty (migrates old data)

### AI Enhance — Structured JSON Response

The `ai-enhance` route (`src/app/api/admin/ai-enhance/route.js`) was upgraded from plain-text bio output to structured JSON:

```json
{
  "bio": "2-3 sentence event description",
  "genre": "One of the 15 GENRES options",
  "vibe": "One of the Final 4 VIBES",
  "image_search_query": "Google Image search query for the artist"
}
```

The EventFormModal handler auto-populates `custom_bio`, `custom_genres`, and `custom_vibes` from the response (only if no custom override already exists). The `image_search_query` is displayed as a hint below the AI Enhance button.

The vibe field is validated against `ALLOWED_VIBES` server-side. If the AI returns a vibe not in the list, a case-insensitive match is attempted; if no match, the field is set to null.

Backward compat: if JSON parsing fails, the raw text is returned as `enhanced` (the old format) so older versions of EventFormModal still work.

---

## Sprint: April 5–6, 2026 — Performance & Stability ("Marco Island") ✅ DEPLOYED

### Current State
The site has moved from a 5-second "Loading" lag to sub-1-second page loads. The database query executes in 0.06ms, the network payload is ~85% smaller, and the UI renders a fast, capped set of events with server-side date filtering. All Safety Locks remain intact.

### 1. Database & Infrastructure

SQL indexes added on `event_date`, `status`, and `venue_id` — database search speed is now 0.06ms.

Server-side date filtering implemented: `fetchEvents(dateFloor)` accepts a `YYYY-MM-DD` parameter and sends `.gte('event_date', floor)` to Supabase. A dedicated `useEffect` watches `[dateKey, pickedDate, fetchEvents]` and re-fires the query whenever the user picks a new date filter (Today, Tomorrow, Weekend, or a specific date via the date picker). This replaced the old approach of fetching all future events and filtering client-side — future dates are now always findable regardless of the fetch limit.

File: `src/app/page.js` — `fetchEvents` function (line ~780) and date-filter useEffect (line ~880).

### 2. Performance Optimization

80-event fetch limit: `.limit(80)` caps each query, reducing the network payload from ~750KB (all future events) to ~160KB (80 events × ~2KB each). The old "infinite while loop" pagination logic (PAGE_SIZE 1000, looping until exhausted) has been removed entirely — with an 80-row cap, pagination is unnecessary.

Select logic: `.select('*')` retained for schema compatibility. An earlier attempt with explicit column names caused a "No events found" blank screen due to a column-name mismatch (likely `start_time` or `image_url` not being actual DB column names). The `select('*')` + `.limit(80)` combination provides the performance win without schema fragility. Explicit columns can be revisited after a formal schema audit.

Column mismatch fix (the "Blackout" bug): The sync pipeline wrote scraper images to `image_url` on the events table, but the frontend read from `event_image_url` and `custom_image_url` — completely different columns. Images were in the database but invisible on the site. Fixed by changing `mapEvent()` in `sync-events/route.js` to write to `event_image_url` instead. The legacy `image_url` column is preserved as a fallback in all frontend waterfalls.

Files changed: `src/app/api/sync-events/route.js` (line 208), `src/app/page.js`, `src/components/EventCardV2.js`, `src/app/event/[id]/EventPageClient.js`, `src/app/event/[id]/page.js`.

### 3. UI/UX Fixes

Fixed bottom navigation: The nav bar is now permanently visible at `position: fixed; bottom: 0`. The scroll-tracking `useEffect` that toggled `navHidden` (hide on scroll down, show on scroll up) has been removed. The `transform` on the `<nav>` is now a constant `translateX(-50%)` with no conditional `translate-y-full`. File: `src/app/page.js` (line ~2890).

Image waterfall + `cleanImg` helper: A `cleanImg(v)` utility was added to all four frontend files. It returns `null` if the input is `""`, `"None"`, or falsy — preventing poison values from blocking the waterfall. The full image hierarchy is now: `custom_image_url → event_image_url → image_url (legacy) → artist_image → venue_photo`. This fixes R Bar and other Squarespace venues whose scraper images were silently lost.

### 4. Safety Locks (DO NOT TOUCH)

These architectural decisions are load-bearing and must not be modified:

- `isLoggedInRef` (useRef) and `favoritesRef` (useRef) — instant UI reads without re-render cascade. Lines 550–551 in page.js.
- `handleFlag` useCallback deps: `[]` — stable reference for React.memo. Line 771.
- `handleFollowArtist` useCallback deps: `[followEntity, unfollowEntity]` — reads from `followingRef.current`. Line 767.
- `<div role="button" tabIndex={0}>` on the Omnibar pill — prevents nested-button hydration error. Line ~1549.
- `cleanImg` helper — treats `""` and `"None"` as null in the image waterfall. Present in page.js, EventCardV2.js, EventPageClient.js, and event/[id]/page.js.
- `fetchEvents` deps: `[]` — stable identity, date is passed as a parameter not a dependency.

### 5. R Bar Ingestion Audit (Diagnosis Complete)

Full pipeline traced: Scraper → mapEvent → Upsert → Auto-enrichment → Frontend.

Root cause of missing metadata: R Bar events arrive as "orphans" — the scraper sets `artist_name` from the Squarespace title but no `artist_id`. The auto-enrichment step (line ~793 in sync-events) does attempt to link `artist_id` by matching `artist_name` against the `artists` table, but is capped at 15 new artist lookups per sync cycle and depends on exact name matching. Local/regional artists that don't exist on MusicBrainz/Discogs/Last.fm never get an artist row created, so the event stays permanently orphaned.

The column mismatch fix (writing to `event_image_url`) ensures at minimum the Squarespace event flyer image now reaches the frontend, even for orphan events.

---

## Sprint: April 6, 2026 — Scale, Automation & Admin Fixes ✅ DEPLOYED

### Current State

The platform is now in a high-performance, production-stable state. Sub-1-second page loads are sustained via the 80-event surgical limit and server-side date filtering. The admin panel's artist deletion flow is fully functional. The Spotlight bio inheritance is fixed. The architecture is ready for the next phase: a self-healing, automated enrichment system built on Event Templates.

### 1. Recent Accomplishments (Completed & Verified)

Performance: The 80-event limit (`.limit(80)`) and server-side date filtering (`fetchEvents(dateFloor)`) are deployed and stable. The main query hits Supabase with `.gte('event_date', floor)` based on the user's selected date filter, ensuring any future date is findable regardless of the limit cap. Load times are consistently under 1 second.

Admin Fixes: Fixed a silent failure in the "Delete Artist, Keep Events" flow. The `AdminArtistModals` component was referencing five variables (`setArtistActionLoading`, `artistsSearch`, `artistsNeedsInfo`, `editingArtist`, `setEditingArtist`) that were never passed as props. The `setArtistActionLoading()` call at line 499 threw a `TypeError` outside the `try` block, causing the async handler to reject silently after the modal had already closed. Fixed by adding the five missing props in `admin/page.js` (lines 706-708) and destructuring them in `AdminArtistModals.js` (lines 18-20). Both "Delete & Hide Events" and "Delete Artist, Keep Events" now work for single and bulk operations.

Files changed: `src/app/admin/page.js`, `src/components/admin/AdminArtistModals.js`.

UX — Fixed Navigation: The bottom nav bar is permanently visible at `position: fixed; bottom: 0`. The scroll-tracking `useEffect` that toggled `navHidden` has been removed. The `transform` is now a constant `translateX(-50%)` with no conditional hide. This gives the app a native mobile feel.

Spotlight Bio Sync: The Spotlight mapping in `page.js` (line ~1235) now uses `cleanStr()` to filter `""`, `"None"`, and whitespace-only values from the bio waterfall: `cleanStr(e.custom_bio) || cleanStr(e.artist_bio) || cleanStr(e.artists?.bio) || ''`. The image waterfall in the same mapping was also synced with the main feed — `cleanImg()` applied, legacy `e.image_url` fallback added. This fixes cases like Ocean Avenue Stompers where a "Green Locked" artist bio was invisible in the Spotlight because `artist_bio` on the events row contained a poison value that short-circuited the chain.

### 2. Infrastructure Roadmap: Universal Metadata & Event Templates

This section documents the V2 architecture for recurring event automation. Implementation is planned, not yet started.

Table Schema — `event_templates`: A new Supabase table to store "Golden" metadata for recurring venue events that should never enter the artist-matching pipeline. Proposed columns: `id` (UUID), `template_name` (TEXT), `is_event_only` (BOOLEAN — true means "never try to match an artist"), `description` (TEXT), `image_url` (TEXT), `category` (TEXT — e.g., 'Trivia', 'Food & Drink Special'), `aliases` (TEXT[] — alternative title matches), `venue_id` (UUID, optional FK), `created_at`, `updated_at`.

The "Twin" Editor: The current Artist edit panel in `AdminArtistsTab.js` (lines 454-700) will be extracted into a reusable `<MetadataEditor>` component. The three shared primitives (`MetadataField`, `StyleMoodSelector`, `ImagePreviewSection`) are already generic and entity-agnostic. The extraction work is the orchestration layer: form state, AI auto-fill handler, and save handler become props (`onSave`, `onAiAutoFill`, `entity`). Estimated effort: 2-3 hours. The Artist and Event Template admin pages will both consume `<MetadataEditor>`.

Scraper Step 3.5 — Template Matching: A new pipeline step inserted after the event Upsert (current step 3) but before the Auto-Sorter (current step 4) in `sync-events/route.js`. Logic: (1) Fetch all templates into memory (one query, ~50 rows). (2) For each new/pending event, check `artist_name` against `template_name` and `aliases`. (3) If match found and `is_event_only = true`: apply template metadata, set `artist_id = null`, set `is_human_edited = true`, eject from the artist pipeline entirely. (4) If match found and `is_event_only = false`: apply template defaults but allow artist linking to continue. (5) If no match: proceed to Auto-Sorter and enrichment as normal.

Constraint — Future-Only: Template matching will only apply to newly synced events (those in `pending` triage status). It will never retroactively overwrite existing event records. The existing `is_human_edited` and `is_locked` guards will be respected — if an admin has manually edited an event, the template will not override it.

Priority Resolution: If an event title matches both a template (`is_event_only = true`) and a known artist in the `artists` table, the template wins. The `is_event_only` flag is an explicit admin decision that outweighs automated artist-matching. This prevents "Trivia Night with DJ Mike" from creating a fake "Trivia Night with DJ Mike" artist profile.

Performance Impact: Negligible. One additional `SELECT` query (~5ms) to fetch templates, then in-memory Map lookups (O(1) per event). Total added time: <10ms per sync cycle.

### 3. Database Health & Archive Strategy

Past events remain in the main `events` table — no separate archive table. The 80-event limit and SQL indexes (`event_date`, `status`, `venue_id`) protect frontend performance regardless of archive size. The `.gte('event_date', floor)` filter ensures past events never enter the frontend payload.

Admin pagination: As the archive grows, the Admin event list will need default "Upcoming Only" views and pagination (limit 50 per page) to prevent browser lag. This is not yet implemented but is a known requirement.

Enrichment cap: The auto-enrichment pipeline processes 15 new artists per sync cycle. At the current rate of ~40 venues syncing twice daily, this is sufficient. If venue count doubles, the cap may need to increase to 25-30 to prevent a growing backlog of unenriched artists.

### 4. Safety Locks — Cumulative (DO NOT TOUCH)

All previous Safety Locks remain in force. Updated line references after this sprint's edits:

- `isLoggedInRef` (useRef) and `favoritesRef` (useRef) — lines 550-551 in page.js.
- `handleFlag` useCallback deps: `[]` — line 771.
- `handleFollowArtist` useCallback deps: `[followEntity, unfollowEntity]` — line 767.
- `<div role="button" tabIndex={0}>` on the Omnibar pill — line ~1554.
- `cleanImg` helper — present in page.js (line ~785, ~800), EventCardV2.js, EventPageClient.js, event/[id]/page.js.
- `cleanStr` helper — present in page.js Spotlight mapping (line ~1201).
- `fetchEvents` deps: `[]` — stable identity, date passed as parameter.
- `.limit(80)` on the main feed query — line ~781.
- Server-side date filtering useEffect deps: `[dateKey, pickedDate, fetchEvents]` — line ~916.

---

## Session: April 14, 2026 — Triple Crown Data Ladders, Linking Station, Magic Wand, Category Whitelist ✅ DEPLOYED

### Current State

The Event Templates roadmap from the April 6 sprint has been implemented end-to-end. The frontend and both public API routes now resolve every user-facing event field through a strict three-tier priority chain. Admins have a one-click Magic Wand to turn any raw scraper event into a Master Template, plus a manual Linking Station dropdown that replaced the bare "No Match" text with an actionable picker. Finally, the feed cards now suppress the messy scraper `artist_name` subtitle for non-music categories, so food/trivia/karaoke rows collapse cleanly to Title + Venue.

### 1. The "Triple Crown" Data Ladders (Hierarchy of Truth)

Every user-facing event field now resolves through a strict three-tier priority chain that is identical across the home feed, the event detail page, and both public API routes. The priority order — non-negotiable — is **Admin Override (`custom_*`) → Template Data (`event_templates.*`) → Scraper / Raw Data**, with a safe empty-state default. The admin's `custom_title`, `custom_bio`, `custom_image_url` columns always win; an unlinked event falls back to its raw scraper columns as before.

The ladder covers five fields:

- `event_title`: `e.custom_title || e.event_templates?.template_name || e.event_title || ''`
- `category`: `e.event_templates?.category || e.category || 'Other'`
- `start_time`: `e.custom_start_time || e.event_templates?.start_time || e.start_time || <existing event_date/title-regex fallbacks>`
- `description`: `e.custom_bio || e.event_templates?.bio || e.artists?.bio || e.artist_bio || ''`
- `event_image`: `cleanImg(e.custom_image_url) || cleanImg(e.event_templates?.image_url) || cleanImg(e.event_image_url) || cleanImg(e.image_url) || null`

These ladders are applied in exactly four flatten-points: `src/app/page.js` (home feed map ~line 820 and Spotlight map ~line 1240), `src/app/event/[id]/page.js` (detail page map ~line 100), `src/app/api/events/route.js` (public API `.map()` ~line 45), and `src/app/api/spotlight/route.js` (block-body map ~line 180). The two API routes each carry a local `cleanImg` helper so the image ladder behaves identically whether the consumer reads from the API or from the page-level Supabase call. The SQL join uses PostgREST's foreign-key embed syntax: `event_templates(template_name, bio, image_url, category, start_time)` added to every `.select(...)` that drives a feed.

Output keys match what the UI components already consume (`event_title`, `category`, `start_time`, `description`, `event_image`) — do not rename them to `bio`/`image_url`/etc., or the cards will render blanks. The `custom_title` column is deliberately kept out of the `.select()` strings on some legacy paths; title resolution from `custom_title` happens via the embed/ladder only on the four flatten-points listed above.

### 2. The Linking Station (Manual Template Picker)

In `AdminEventsTab.js`, the row-level "No Match" state for unlinked events (events where no template alias fired) was replaced with a `<select>` dropdown populated from the admin's full template list. The options are computed once per render via `useMemo` (keyed on `templates`) and sorted alphabetically by `template_name` at the API layer, so the dropdown is stable and cheap. Selecting a template fires the existing `confirmTemplateMatch(event, template)` handler, which runs an optimistic in-place update on the events grid plus a `PUT /api/admin/events/:id` to persist `template_id`. On error, the row is rolled back and a toast is shown.

The Magic Wand button (see §3) sits immediately next to the dropdown in the same "NoMatch" IIFE branch, so admins can either pick an existing template or clone the row into a new one without leaving the feed view. The wand was removed from the far-right action cluster to avoid visual duplication.

### 3. The Magic Wand (Template Cloning from Raw Event)

The Magic Wand button in each `AdminEventsTab.js` row invokes `handleCreateTemplateFromEvent(ev)`, which pre-fills the Template Editor with the event's data and flips the admin panel to the Templates tab via a cross-tab state handoff. Three new props were threaded from `admin/page.js` into `AdminEventsTab` — `setActiveTab`, `setEditingTemplate`, `setTemplateForm` — sharing the same React state that the Templates tab already reads. No URL params, no localStorage, no separate route — just a shared setter pattern, which means a half-filled template draft survives tab switches without leaking into the URL.

The handoff populates `template_name` and `aliases` from the raw `event_title`, `venue_id` from `ev.venue_id`, and `category` from `ev.category || 'Live Music'`. `bio` and `image_url` run through a **sanitizer guard** (`sanitizeForTemplate(value, rawTitle)`) before being written to the form. The sanitizer drops any value that is empty, whitespace-only, or case-insensitively equal to the raw title. This was added to prevent "poisoning" — a recurring bug where the Magic Wand would pre-fill a template bio with the title itself (because the scraper had no real bio), the admin would save the template, and then the bio-ladder's template rung would rebroadcast that title-as-bio across every future matching event.

### 4. The Category Whitelist (Subtitle Gating on Feed Cards)

The scraper frequently writes noisy strings into `artist_name` — venue promoters, generic labels ("DJ", "Live Music"), punctuation-only fragments. This was acceptable when every card was a concert, but since the `events.category` column was introduced, food specials, trivia nights, karaoke, and happy hours were showing these junk artist names as the subtitle under the title.

The fix is a module-level whitelist constant in both card components:

```js
const ARTIST_SUBTITLE_CATEGORIES = ['Live Music', 'Comedy'];
```

A derived `showArtistSubtitle` boolean combines the whitelist check with the pre-existing "eventTitle && artistName && eventTitle !== artistName" guard. The subtitle render and (in `SiteEventCard.js`) the title `marginBottom` tweak both key off this single boolean, so non-music categories collapse cleanly: the venue name sits directly under the title with no orphan 2px gap. Applied to `src/components/SiteEventCard.js` and `src/components/EventCardV2.js`; the per-file local constant pattern matches how `CATEGORY_CONFIG` is already defined in each card (no new shared module).

The whitelist reads `event.category` directly — that field is guaranteed to be set by the Triple Crown category ladder (§1), defaulting to `'Other'` when missing, which correctly hides the subtitle.

### Files Modified

- `src/app/page.js` — home feed map + Spotlight map ladders (pre-existing from earlier sprint, verified as no-op in this session)
- `src/app/event/[id]/page.js` — detail page ladder (verified as no-op)
- `src/app/api/events/route.js` — added local `cleanImg` + description/event_image ladder rows
- `src/app/api/spotlight/route.js` — added local `cleanImg` + description/event_image ladder rows
- `src/components/admin/AdminEventsTab.js` — Magic Wand handler + `sanitizeForTemplate` + NoMatch dropdown + memoized `templateOptions`
- `src/app/admin/page.js` — threaded `setActiveTab`, `setEditingTemplate`, `setTemplateForm` into `<AdminEventsTab>`
- `src/components/SiteEventCard.js` — `ARTIST_SUBTITLE_CATEGORIES` + `showArtistSubtitle` guard
- `src/components/EventCardV2.js` — `ARTIST_SUBTITLE_CATEGORIES` + `showArtistSubtitle` guard

### Safety Locks — Cumulative (DO NOT TOUCH)

All previous Safety Locks remain in force. This sprint adds the following invariants:

- **Triple Crown ladder priority** — the order `custom_* → event_templates.* → raw/artist` must never be flipped. Admin overrides always win; flipping the order will silently erase hundreds of manual edits.
- **Ladder output keys** — the flatten-points emit `event_title`, `category`, `start_time`, `description`, `event_image`. Do not rename to `bio` / `image_url` / `title` — the UI components read the former set and will render blanks if renamed.
- **`cleanImg` locality** — `/api/events/route.js` and `/api/spotlight/route.js` each define their own local `cleanImg`. Do not promote to a shared helper without also auditing the three frontend copies (`page.js`, `event/[id]/page.js`, `EventCardV2.js`).
- **`sanitizeForTemplate` in Magic Wand** — must remain active. Removing it re-opens the title-as-bio poisoning path that propagates via the `event_templates.bio` ladder rung.
- **Category whitelist values** — `ARTIST_SUBTITLE_CATEGORIES = ['Live Music', 'Comedy']` is defined locally in each card file. Adding a category that legitimately has artist names (e.g. a future `'DJ'` top-level category) requires editing both `SiteEventCard.js` and `EventCardV2.js`.
- **`'Other'` category default** — the category ladder's final fallback is the string `'Other'`, not `'Live Music'`. The old `'Live Music'` default was removed so un-categorized events no longer inherit the music-specific UI (subtitle, orange accent bar in some variants).
- **Magic Wand prop contract** — `AdminEventsTab` requires `setActiveTab`, `setEditingTemplate`, `setTemplateForm` from its parent. The handler is a no-op if any is missing; a future admin refactor must preserve this prop surface.

### Pending / TODO

- Extract `<MetadataEditor>` (the "Twin Editor" from April 6 roadmap) — Artist edit panel and Template edit panel still duplicate form orchestration.
- Punctuation-insensitive fuzzy match in `sanitizeForTemplate` — current comparison is case-insensitive + trim only. Titles like `"Open Mic Night!"` vs `"Open Mic Night"` still slip through. Deferred until a real regression is observed.
- Admin pagination on the events grid — see April 6 sprint §3.

---

## Architecture Reference (April 14, 2026)

This section is the canonical reference for five cross-cutting systems shipped in the Flat-18 / Twin Editor rollout. Numbers here are enforced in code — if they drift, update the code, not this section.

### 1. Metadata Waterfall (4-tier provenance)

Every event renders four fields — **bio**, **image**, **genres**, **vibes** — through a declarative waterfall. The top populated tier wins.

| Priority | Tier | Source column(s) | Badge color |
|---|---|---|---|
| 1 | Admin Override | `events.custom_bio`, `custom_image_url`, `custom_genres`, `custom_vibes` | Orange |
| 2 | Template | `event_templates.bio`, `.image_url`, `.genres` | Blue |
| 3 | Artist Profile | `artists.bio`, `.image_url`, `.genres`, `.vibes` | Purple |
| 4 | Raw Scraper | `events.artist_bio`, `.event_image_url`/`.image_url`, `.genre`, `.vibe` | Gray |

**Key files:**
- `src/lib/metadataWaterfall.js` — `TIERS`, `resolveTier(sources, type)`, `parentTierValue()`, `hasText`, `hasArray`. Pure, no React dependency.
- `src/components/admin/shared/MetadataField.js` — renders the provenance badge + Reset (undo-arrow) button. Dual-mode: Mode A when `sources` prop is passed (waterfall), Mode B legacy 2-tier for Artists/Templates tabs.
- `src/components/EventFormModal.js` — the "Twin Editor." Builds four `sources` objects, calls `seedOverride(field)` on focus, `resetField(field)` from Reset button.
- Vibes uses a **3-tier** waterfall (no template column) — templates don't carry vibes.

**Twin interaction contract:**
- Displayed value: `form.custom_<field> || resolved.value` — shows override if typed, else inherited.
- On `onFocus`, `seedOverride()` copies the parent tier value into `custom_<field>` so the admin edits a populated textarea instead of fighting a placeholder.
- Reset button appears only when `resolved.tier.key === 'override'`. Clicking it sets `custom_<field>` to `''` / `[]`, flipping the badge back to the inherited tier.

### 2. Taxonomy Standard — Flat-18

The canonical genre list is 18 items, stored verbatim in the DB and used everywhere (UI chips, AI validation, scraper normalization):

```
Rock, Pop, Country, Acoustic, Cover Band, DJ, Electronic, Jazz, Blues,
Reggae, R&B, Hip Hop, Latin, Emo, Punk, Metal, Indie, Folk
```

**Enforcement points — all must stay in lockstep:**
- `src/lib/utils.js` → `GENRES` (18 items)
- `src/app/api/admin/artists/ai-lookup/route.js` → `ALLOWED_GENRES` (18 items)
- DB rows: translated by `sql/taxonomy-flat-18-migration.sql` on April 13, 2026 (0 post-flight rows confirmed green)

Legacy compound labels (`'Latin / Reggaeton'`, `'Rock / Indie'`, etc.) are gone from the DB. Scrapers that still emit compound labels must normalize before upsert, or the row will fail the whitelist filter downstream.

### 3. Image Candidate System

Serper Google Image Search results are cached on the **artist**, never on the event.

- **Column:** `artists.image_candidates TEXT[]` (nullable). Migration: `sql/artists-image-candidates.sql`.
- **Hard cap:** 5 images. Enforced in `searchArtistImages()` (break at `valid.length >= 5`) and on both placeholder fallback paths (`shuffled.slice(0, 5)`).
- **Write paths (both in `src/hooks/useAdminArtists.js`):**
  - Bulk enrich — `runBulkEnrich` adds `image_candidates` to the existing PUT body.
  - Single-field regen — `regenerateField('image_url')` fires a parallel PUT so the carousel survives reload.
- **Read path:** `EventFormModal.js` carousel reads `linkedArtist.image_candidates`. Events never store the candidate array.

### 4. Query Requirements Invariant

The `event_templates(...)` embed must include `genres` everywhere events are hydrated for rendering, or the waterfall will silently fall through to artist/scraper tiers for template-linked events.

**Required embed shape:**
```
event_templates(template_name, bio, image_url, category, start_time, genres)
```

**Files to keep in sync:**
- `src/app/page.js`
- `src/app/api/events/route.js`
- `src/app/api/spotlight/route.js`
- `src/app/event/[id]/page.js`

Missing `genres` here is the #1 regression risk when adding a new events-rendering route.

### 5. Security Hard Stops

All enforced in `src/app/api/admin/route.js` (POST + PUT handlers).

- **Bio length cap: 500 characters.** Applied to `custom_bio` and `artist_bio` via `capBio()`. Client-side mirror: `maxLength={500}` on the Event Edit Modal bio textarea with a live counter.
- **Light XSS sanitization.** `sanitizeString()` strips `<script>`, `<iframe>`, `<style>` tag bodies, inline `on*=` event handlers (quoted and unquoted), and `javascript:` pseudo-URLs. Applied as part of `capBio()`.
- **URL validation.** `validateUrl()` requires `http://` or `https://` prefix; anything else becomes `null`. Applied to `custom_image_url`, `image_url`, `event_image_url`.
- These are defense-in-depth — the UI never renders admin strings as raw HTML — but they cap the blast radius if a future component starts doing so.

---

## Repo
GitHub: `https://github.com/antfocus/mylocaljam.git`
Push to main = auto-deploy on Vercel.
User's local path: `~/mylocaljam` (NOT `~/Documents/mylocaljam`)


---

## 🛠️ Recent Core Hardening (April 14, 2026)

1. **Ghost-Killer & Alias Symmetry.** Deployed bidirectional logic ensuring that if an artist is merged or renamed, all past and future events for that alias are automatically mapped to the canonical profile. The two alias stores — `artists.alias_names` (array, admin UI) and `artist_aliases` (lookup table, sync pipeline) — now dual-write in lockstep on rename, merge, and the tag-input UI in `AdminArtistsTab.js`. Events carrying the retired `artist_name` are re-pointed to the master `artist_id` inside the merge transaction.
2. **Ghost Hunt Blacklist.** Implemented the `ignored_artists` table and the 🚫 (Ignore) per-row action + bulk "Ignore Selected" bar button to silence non-artist noise ("Pizza Night", "Drink Specials", recurring themes). Ignored entries are filtered out of the admin artists GET and the `sql/ghost-hunt-audit.sql` report, so they cannot reappear via scraper re-creation. Affected events are preserved on the frontend as "Other / Special Event" rather than hard-deleted.
3. **Bulk Triage UI.** Added multi-select checkbox capabilities (header Select-All + per-row checkboxes) and a fixed bottom bulk actions bar to the Metadata Triage view in `AdminArtistsTab.js` / `AdminArtistModals.js`. Batch endpoints: AI Enrich (loop), Delete (per-id with confirmation + event count), Merge (≥2 selected), and Ignore (single POST accepts `names[]` array + fan-out unlink). All actions optimistically remove rows with rollback on failure.
4. **Row-Multiplication Defense-in-Depth.** The "4 Skinny Amigos" ghost was killed with two independent guards: server-side `Set`-based dedupe in the admin GET (`src/app/api/admin/route.js`) and client-side `Map(id → row)` idempotent merge in `useAdminEvents.js`. One DB row = one array slot, regardless of StrictMode double-mounts, fetch races, or pagination re-entry.

---

## 🛡️ The "G Spot" Protocol (Global Safety & Efficiency)

All future automation — specifically AI-powered classification and enrichment — must adhere to this protocol:

- **Verified Lock.** AI cannot touch rows where `is_category_verified` is `true`. Human edits are sacrosanct. This complements the existing `is_human_edited` field-level lock map and the `is_locked` master toggle on artists.
- **Confidence Bar.** Minimum 0.85 (85%) threshold for auto-updates. Below this, the row must be flagged for human review (e.g. `triage_status: 'pending'` + `category: 'Other / Special Event'`) rather than auto-saved.
- **Enum Prison.** AI must select strictly from pre-defined category lists (`CATEGORY_OPTIONS` in `useAdminEvents.js`, `GENRES` Flat-18 in `src/lib/utils.js`, `ALLOWED_GENRES` in ai-lookup route). No "invented" tags. Whitelist filter runs before any DB write.
- **Chain of Command.** The resolution order for categorization and metadata is: **Event Templates → Linked Artists → AI Suggestion → Default (`'Other / Special Event'`).** AI suggestions never override a template-linked or artist-linked value.
- **Batch Economy.** Operations must be processed in server-side batches where possible. The single `/api/admin/ignored-names` POST accepting `names[]` is the reference pattern — one round-trip, idempotent via `onConflict: 'name_lower'` upsert.

---

## 📌 Addendum — Files Touched April 14, 2026

- `sql/artists-alias-names.sql` (new) — alias_names column + GIN index + backfill
- `sql/ghost-hunt-audit.sql` (new, then filtered against `ignored_artists`)
- `sql/ignored-artists.sql` (new) — Ghost Hunt Blacklist table
- `src/lib/artistMatcher.js` (new) — Smart Match helper
- `src/app/api/admin/route.js` — sanitizer + bio cap + URL validation + GET dedupe + Ghost Link learning
- `src/app/api/admin/artists/route.js` — rename dual-write, alias mirror, ignored_artists filter
- `src/app/api/admin/artists/merge/route.js` — alias-transfer on merge (dual-write)
- `src/app/api/admin/artists/ai-lookup/route.js` — image cap 3→5
- `src/app/api/admin/ignored-names/route.js` (new) — GET / POST (single+batch) / DELETE
- `src/hooks/useAdminEvents.js` — Map-based client idempotency
- `src/hooks/useAdminArtists.js` — alias_names in form state + duplicate-name check
- `src/components/EventFormModal.js` — bio maxLength 500 + counter
- `src/components/admin/AdminArtistsTab.js` — alias tag input + Ignore row button
- `src/components/admin/AdminArtistModals.js` — Ignore Selected bulk button
- `src/app/admin/page.js` — wired `setArtists` + `setArtistToast` through to modals

---

## Session: April 16, 2026 — Smart Fill, Classification Fork, Muted Solid Drafts, 7:12 PM Ghost Exorcised ✅ DEPLOYED

### Headline

Four things shipped this sprint:

1. **Smart Fill** on the Magic Wand — the enrich-date endpoint now rescues rows that carry a stale `is_human_edited = true` lock but have blank image or bio fields. Before today those rows were stranded forever. The April 21, 2026 button now jumps from 6 → 11 eligible artists.
2. **Classification Fork** in `aiLookup.js` — the Perplexity prompt now classifies the target as `MUSICIAN` or `VENUE_EVENT` on its first step and branches the rest of the write path. Things like "Trivia Night" or "BOGO Burger" no longer get fake band bios, fake genre tags, or musician-styled Serper images.
3. **Muted Solid draft slots** in Spotlight — the dashed blue border is gone. Projected slots now sit behind a 2px solid border + a faint 6%-opacity blue tint, with the DRAFT pill and the muted blue rank number carrying the visual weight.
4. **The 7:12 PM Ghost** — an artist-DELETE cleanup path was flipping `is_human_edited = true` on every future-dated event matching the deleted artist's name with no date or status filter. We've identified the write site (`src/app/api/admin/artists/route.js:416-419`); the Smart Fill rescue now makes the stranded rows drain automatically, but scoping that DELETE is a must-fix before the next admin delete ships.

### 1. Smart Fill (Magic Wand Rescue)

`POST /api/admin/enrich-date` is no longer a "skip anything locked" endpoint. The Smart Fill rule:

- **Filter:** any published event missing an image OR bio is a candidate — regardless of its `is_human_edited` / `is_locked` state. The lock is reinterpreted from "skip row entirely" to "don't clobber populated fields."
- **Write:** each writable field is re-checked on a per-event basis against every real image column (`custom_image_url`, `event_image_url`, legacy `image_url`) plus the joined `artists.image_url`, and against `artist_bio` plus the joined `artists.bio`. The AI only writes into columns that are all blank.
- **Preserve manual edits:** `event_title` and `start_time` are never in the `update` object. Ever. The preserve-manual-edits invariant is enforced by physical omission, not by a strip filter.
- **No `stripLockedFields` on this path.** The guard would strip our writes on exactly the rogue-locked rows Smart Fill is designed to rescue, defeating the feature. The per-field blank-only pre-check is the replacement safety net.
- **Response shape.** Added `lockedBlankFilled` — a count of locked rows Smart Fill rescued. The legacy `lockedSkipped` key is still present for back-compat and is always `0` now (Smart Fill skips nothing).

**Consumer update.** `AdminSpotlightTab.js` result banner now prefers the new `lockedBlankFilled` signal and displays "· N locked (blank-filled)", falling back to the legacy "· N locked (skipped)" string if a server has not yet rolled out.

### 2. Classification Fork (`src/lib/aiLookup.js`)

The Perplexity `sonar-pro` bio prompt now runs a 5-step decision tree:

1. **Categorize** the target into `MUSICIAN` or `VENUE_EVENT`.
2. **Conditional writing rules** — MUSICIAN gets a band-shaped bio (members, style, vibe). VENUE_EVENT gets a room-shaped description (what the event is, who it's for, what to expect at the venue). No fake discographies, no "touring nationally" hype on a trivia night.
3. **Conditional image rules** — MUSICIAN looks for live-performance photos; VENUE_EVENT looks for interior / vibe / ambience shots of the room.
4. **Source link** — both branches still return a source URL when available.
5. **Output** — strict JSON contract, kind is carried back to the caller.

**Implementation details:**

- The prompt template makes the conditional branches explicit (`If MUSICIAN: ... If VENUE_EVENT: ...`) rather than a single generic instruction. Perplexity follows the branch conditional much more reliably than a wishy-washy "tailor the bio to the type of event."
- `kind` is normalized at the caller: `const kind = rawKind === 'VENUE_EVENT' ? 'VENUE_EVENT' : 'MUSICIAN'`. Anything the model returns outside the two tokens falls through to `MUSICIAN` as the safe default (we'd rather run a musician workflow on a venue event once than the reverse).
- **Pass-2 genre tagger is skipped** when `kind === 'VENUE_EVENT'`. The helper guards with `(bioText && kind === 'MUSICIAN') ? await callPerplexity(...) : null` so VENUE_EVENT rows never get a genre label written back.
- **Serper fallback is kind-aware.** `searchArtistImages(name, kind = 'MUSICIAN')` now appends context-appropriate keywords: `"${name} band live music"` for MUSICIAN, `"${name} restaurant bar interior"` for VENUE_EVENT. Hotlink-safe filtering is unchanged.
- **Returned object** carries `kind` and forces `is_tribute: false` on the VENUE_EVENT branch so the tribute-artist UI flag can't accidentally light up on a trivia night.

### 3. Muted Solid Drafts (`AdminSpotlightTab.js`)

New design vocabulary for Projected / Suggested Spotlight slots:

- **`fillBorder`** — `2px solid var(--border)` (was `2px dashed #60A5FA`). Matches the standard unpinned slot border so Suggested rows no longer visually scream "under construction."
- **`fillBackground`** — `rgba(59,130,246,0.06)` (was `rgba(96,165,250,0.05)`). A faint 6%-opacity blue tint that reads as a subtle status cue without competing with the pinned slots.
- **DRAFT pill** and **muted blue rank number** stay unchanged — they are now the primary draft-state indicators. The bump warning and manual-pin chip are preserved.

The dashed-border pattern is retired elsewhere in the admin UI too; keep any new Spotlight-adjacent affordances on the Muted Solid vocabulary (solid border + faint tint + pill) unless you have a specific reason to diverge.

### 4. The 7:12 PM Ghost — Exorcised

**Root cause.** `src/app/api/admin/artists/route.js:416-419` contains an unscoped cleanup step on the artist DELETE handler:

```js
.update({ artist_id: null, is_human_edited: true })
.ilike('artist_name', artist.name)
```

No date filter. No `status = 'published'` filter. Deleting any artist whose name is shared by future events (e.g. "Frankie") flips `is_human_edited = true` on ALL of those future rows. On 2026-04-14 at ~19:12 ET someone deleted a test artist whose name collided with 4 real April-21 events (Frankie, Al Holmes, Stan Steele, Karaoke), all of which showed up in the UI as "Human-locked" without any admin save.

**Forensic evidence** is captured in two ready-to-run scripts:

- `scripts/investigate-lock-2026-04-21.sql` — 4 queries (per-row state, updated_at cluster by minute, linked artist JSONB lock shape, venue-link trait) and a mapping of each result pattern to its likely write site.
- `scripts/investigate-lock-2026-04-21.mjs` — Node version that uses the service-role key from `.env.local` and prints the same four sections with a "tight cluster / loose cluster / spread" verdict at the end.

**Mitigation status.** Smart Fill (§1) now rescues rogue-locked rows with blank data automatically, so the live feed is no longer visibly affected. But the underlying DELETE bug is still unscoped in production — see the Safety Locks and Pending sections below for the required fix.

### 5. Phantom Columns Purged

Two virtual / nonexistent references were silently eating data:

- **`event_image`** — a VIRTUAL field produced by `applyWaterfall` in `src/lib/waterfall.js`. It is NOT a column on the `events` table. Selecting it in PostgREST drops the whole row in error mode; writing to it is a silent no-op. Purged from:
  - `src/app/api/spotlight/route.js` — SELECT now lists `custom_image_url, event_image_url, image_url`. The PostgREST `error` is now destructured and logged via `console.warn`. `classify()` was rewritten to mirror `applyWaterfall` priority exactly (Tier 1 real image columns → Tier 2 `venues.photo_url` → Tier 3 `event_templates.image_url` → 99 nothing).
  - `src/app/api/admin/enrich-date/route.js` — SELECT and WRITE both reference `event_image_url` now.
- **`venues.updated_at`** — the `venues` table has no `updated_at` column. Any diagnostic that needs a timestamp on the venue link must use `v.created_at` or thread through the event's own `updated_at`. `scripts/investigate-lock-2026-04-21.sql/.mjs` were revised after the Supabase SQL editor surfaced `ERROR: 42703: column v.updated_at does not exist`.

### Files Modified

- `src/app/api/admin/enrich-date/route.js` — Smart Fill filter + write + docstring + response shape
- `src/app/api/spotlight/route.js` — phantom-column purge + silent-error warn + classify() rewrite
- `src/lib/aiLookup.js` — Classification Fork prompt + kind-aware Serper + Pass-2 gate
- `src/components/admin/AdminSpotlightTab.js` — Muted Solid draft vocabulary + new `lockedBlankFilled` banner signal

### Files Created

- `scripts/investigate-lock-2026-04-21.sql` — forensic SQL, safe to run in the Supabase editor
- `scripts/investigate-lock-2026-04-21.mjs` — forensic Node version (service-role key via `.env.local`)

### Safety Locks — Additions

All prior Safety Locks remain in force. This sprint adds:

- **Smart Fill boundary.** `POST /api/admin/enrich-date` may bypass the row-level `is_human_edited = true` / `is_locked = true` lock ONLY WHEN the target field is currently blank, where "blank" means every real image column (`custom_image_url`, `event_image_url`, legacy `image_url`) AND the joined `artists.image_url` are all falsy (for the image ladder), or both `event.artist_bio` and the joined `artists.bio` are falsy (for the bio ladder). Writes to `event_title` or `start_time` are forbidden; the endpoint must never include those keys in its `update` object. Fork this invariant into any future "rescue" endpoint.
- **Classification Fork kind contract.** `aiLookupArtist()` returns `{ kind: 'MUSICIAN' | 'VENUE_EVENT', ... }`. Any downstream caller that plans to feed the result into the Artists-tab genre pipeline, the tribute-artist UI, or any "band-shaped" visualization MUST gate on `kind === 'MUSICIAN'`. The Pass-2 genre tagger in `aiLookup.js` is already gated; do not weaken it.
- **No phantom columns on events.** `event_image` is a virtual waterfall field only. The real image columns are `custom_image_url`, `event_image_url`, and legacy `image_url`. Do not SELECT, WRITE, or lock against `event_image`.
- **`venues` schema invariant.** The `venues` table has no `updated_at` column. Diagnostics that need a link timestamp must use `v.created_at` or the event's own `updated_at`.
- **`stripLockedFields` is ineligible on Smart Fill paths.** The guard is correct for per-event admin saves and per-artist enrichment (it still runs in `src/app/api/admin/route.js` and `src/app/api/enrich-artists/route.js`), but it cannot be applied to any endpoint that is designed to rescue rows with a stale boolean lock — it would strip the rescue write and defeat the feature. If you add a new rescue endpoint, replicate the per-field blank-only pre-check instead.

### Pending / TODO

- **Scope the artist-DELETE cleanup (BLOCKER before the next admin delete ships).** `src/app/api/admin/artists/route.js:416-419` must add `.eq('status', 'published')` AND a future-date filter (e.g. `.gte('event_date', nowEasternDayStart())`) before the unscoped `.update({ artist_id: null, is_human_edited: true })`. Alternatively, split the path: the `is_human_edited = true` flip should NEVER be applied as a side effect of an artist DELETE — only the `artist_id = null` side of the cleanup is semantically correct. Recommended fix: drop `is_human_edited: true` from that update entirely and rely on the admin save path to set locks intentionally.
- **Automated Template Linker (NEW ROADMAP ITEM).** Build a background process that scans newly-scraped events against existing `event_templates` rows by (Venue × Title prefix / alias match) and pre-links them. Eliminates most Linking Station "No Match" work on the next-day admin review. Suggested entry point: a tail step in `src/app/api/sync-events/route.js` that runs `findCandidateTemplate({ venue_id, raw_title })` per upserted event and writes `template_id` when a high-confidence match exists. Invariants: (a) never clobber an admin-set `template_id`, (b) the existing Magic Wand template-cloning path must still work when the linker declines a match, (c) respect the Confidence Bar — sub-0.85 matches should NOT write.
- **Punctuation-insensitive fuzzy match** in `sanitizeForTemplate` — still deferred from April 14.
- **Admin pagination on the events grid** — still deferred from April 6.

### Safety Locks — Cumulative Snapshot (Apr 16)

- All April 14 Safety Locks (ladder priority, output keys, `cleanImg` locality, `sanitizeForTemplate`, whitelist values, `'Other'` default, Magic Wand prop contract) remain in force.
- All April 14 G Spot invariants (Verified Lock, Confidence Bar, Enum Prison, Chain of Command, Batch Economy) remain in force.
- April 16 additions: Smart Fill boundary, Classification Fork kind contract, phantom-column purge, venues schema invariant, stripLockedFields ineligibility on rescue paths.

---

## Session: April 16, 2026 (cont.) — AI Image Search, Top 5 Gallery, Preview Mode, Short-Circuit Bypass ✅ COMPLETE

### Summary

Built the **AI Image Search** feature end-to-end: a ✨ button inside the Edit Event Modal that calls the `enrich-date` endpoint in `preview: true` mode, runs the full Perplexity + Serper pipeline WITHOUT writing to the database, and returns a **Top 5 Gallery** of candidate images for the operator to pick from. The operator clicks a thumbnail, sees it in the Mobile Preview, then commits via the normal "Update Event" button. No auto-save — the preview flow is a pure read path.

Resolved three progressive bugs along the way (musician bias, jammed input, 178ms short-circuit) culminating in a defense-in-depth **Short-Circuit Bypass** hotfix that ensures preview mode always reaches the AI pipeline regardless of existing data on the row.

### Architectural Wins

1. **Preview mode (`preview: true`)** — A new dry-run path through `POST /api/admin/enrich-date`. When the request body includes `preview: true` + `eventId`, the endpoint runs the full single-event pipeline (partition, byArtist grouping, `aiLookupArtist`, Serper top-up) but short-circuits before both DB writes (5a artists upsert, 5b events update). Returns `{ image_url, preview_images: [...], bio, kind }` for the client to populate form state. Nothing is persisted. Validated at the API level: `preview: true` without `eventId` returns 400.

2. **Top 5 Gallery** — Instead of a single-guess image, the backend builds a gallery of up to 5 de-duplicated image URLs: Perplexity's official image (if any) at index 0, topped up with Serper web image search results. The frontend renders these as a horizontal row of 56×56 clickable thumbnails with an orange border + checkmark badge on the active selection. Click promotes that URL into `custom_image_url` + `event_image_url` on the form.

3. **Short-Circuit Bypass (hotfix chain)** — Four coordinated fixes ensure preview mode ALWAYS reaches the AI pipeline:
   - **Fix A (partition bypass):** `if (!isMissing) continue` gated with `!isPreview` — preview force-includes every row even when bio+image are already present.
   - **Fix B (byArtist fallback chain):** `if (!raw) continue` extended with a fallback chain in preview mode: `artist_name → event_title → venue_name → venues.name → '(untitled event)'`. The blacklist check is also gated with `!isPreview`.
   - **Fix C (main loop restructure):** The preview block now runs BEFORE `if (!ai) continue` and `if (!gotBio && !gotImage) continue`. All `ai` accesses use optional chaining (`ai?.kind`, etc.), so even when Perplexity returns null, the Serper top-up still builds a gallery.
   - **Fix D (defense-in-depth):** Rescue counters (`lockedBlankFilled`, `rescueSet`) and blacklist check both gated on `!isPreview`.

4. **Venue-focused Serper queries** — `searchArtistImages(name, kind, { venue, city })` no longer appends band/music keywords for `VENUE_EVENT` kind. Query logic: name+venue → `${name} ${venue}`; venue only → `${venue} interior`; name only → `${name}`. Eliminates false positives for venue events like "Family Night at River Rock".

5. **Waterfall override binding fix** — The EVENT IMAGE input in the modal was bound to the waterfall-resolved value (`imageResolved.value`), which caused "rubber-banding" — deleting text immediately re-resolved to the next waterfall tier. Fixed by binding directly to `form.custom_image_url` (the raw override) and passing the waterfall result as a separate `inheritedUrl` prop to `ImagePreviewSection`.

### Files Modified

- `src/app/api/admin/enrich-date/route.js` — Preview mode validation, partition bypass, byArtist fallback chain, main loop restructure (preview before !ai/!data continues), defense-in-depth gating. ~843 lines.
- `src/lib/aiLookup.js` — `searchArtistImages` venue-focused query logic for VENUE_EVENT; debug logs (`[IMAGE DEBUG] Event Kind Classified as:`, `[IMAGE DEBUG] Final Serper Search Query used:`).
- `src/components/EventFormModal.js` — `handleImageSearch` async function, `previewImages` state, Top 5 Gallery UI (thumbnails + active state), `pickGalleryImage` handler, ✨ button with spinner/error states, waterfall override binding fix.
- `src/components/admin/shared/ImagePreviewSection.js` — Read-only; confirmed input onChange works correctly (bug was in parent binding).

### Debug Instrumentation

Two diagnostic console.log statements added for operator verification:
- `[IMAGE DEBUG] Event Kind Classified as: [MUSICIAN|VENUE_EVENT|None]` — in the preview block of `enrich-date/route.js`, confirms classification branch.
- `[IMAGE DEBUG] Final Serper Search Query used: '<query>'` — in `searchArtistImages` of `aiLookup.js`, confirms the exact Serper query string sent.

### Known Issues / Backlog

- **The "Family Night" Paradox (tabled).** VENUE_EVENT rows like "Family Night at River Rock" can still return low-relevance Serper images because the venue's web presence is sparse. The system works flawlessly for ~95% of real data (musicians with promo shots, venues with active social media). For the remaining edge cases, the operator uses the manual image URL override. This is an acceptable UX given the Top 5 Gallery now provides multiple options. **Not a blocker — tabled as a known limitation.**
- **`(untitled event)` placeholder in byArtist.** Preview mode uses this as a last-resort AI lookup key when all name fields are blank. The placeholder never reaches a DB write (preview short-circuits before 5a/5b), but it does feed into the Perplexity prompt, which may produce generic results. Acceptable because the Serper top-up uses venue/city context and usually finds something useful.
- **Admin events grid pagination** — still deferred. Next session will tackle server-side search + database indexing + pagination to replace the 80-event client-side limit.

### Safety Locks — Additions

All prior Safety Locks remain in force. This session adds:

- **Preview mode is a pure read path.** `preview: true` on `enrich-date` must NEVER write to `events` or `artists`. The preview block `continue`s before both 5a and 5b. If you add a new write site inside the artist loop, place it AFTER the preview block, not before.
- **Preview bypasses ALL partition skip checks.** The `!isMissing` continue, the `!raw` continue, the blacklist `.has()` check, the `!ai` continue, and the `!gotBio && !gotImage` continue are ALL gated with `!isPreview`. An explicit ✨-click from the modal runs the full pipeline unconditionally. Do not re-introduce early returns that would short-circuit a preview request.
- **byArtist fallback chain is preview-only.** The `venue_name → venues.name → '(untitled event)'` fallback chain only activates when `isPreview || isSingleEvent`. Bulk commit mode still requires a real `artist_name` to key the artists upsert. Do not widen the fallback to bulk mode — it would key upserts on venue names, polluting the `artists` table.
- **Waterfall override binding.** Image inputs in the Edit Event Modal MUST bind to the raw override field (`form.custom_image_url`), NOT to the resolved waterfall value. The waterfall result goes to `inheritedUrl` (displayed at reduced opacity with an "Inherited from artist" overlay). This prevents rubber-banding when the operator clears the field.

### Safety Locks — Cumulative Snapshot (Apr 16, cont.)

- All April 14 Safety Locks remain in force.
- All April 14 G Spot invariants remain in force.
- All April 16 (session 1) additions remain in force: Smart Fill boundary, Classification Fork kind contract, phantom-column purge, venues schema invariant, stripLockedFields ineligibility on rescue paths.
- April 16 (session 2) additions: Preview mode read-path invariant, preview bypass of all partition checks, byArtist fallback chain scope, waterfall override binding rule.

### Pending / TODO

- ~~**Server-side search, database indexing, and pagination** — Replace the 80-event client-side limit with an industry-standard paginated feed. This is the next major platform upgrade (new session).~~ **DONE — see April 16 Session 3 below.**
- **Scope the artist-DELETE cleanup** — Still open from session 1.
- **Automated Template Linker** — Still open from session 1.
- **Punctuation-insensitive fuzzy match** in `sanitizeForTemplate` — Still deferred.
- **Category taxonomy reconciliation** (Comedy category wiring, Drink/Food Special overlap) — Still open from SOP review.

---

## Session — April 16, 2026 (Session 3): Server-Side Search, Indexing & Pagination — LAUNCHED

### Summary

Successfully deployed the **Server-Side Search, Indexing & Pagination** feature to production. The old 80-event client-side Supabase fetch has been replaced with a proper server-side architecture: a dedicated API endpoint (`/api/events/search`) backed by PostgreSQL trigram indexes, offset-based pagination, and frontend infinite scroll. All 1,932 published events are now accessible. 16/16 automated tests passing against production.

### Incident: Botched Deployment & Recovery

The feature was initially pushed directly to production before staging validation. This caused a cascade of failures:

1. **Missing FK constraint.** The search route joins `event_templates` via PostgREST. Without a formal FK between `events.template_id` and `event_templates.id`, PostgREST could not resolve the join.
2. **Manual DB mutations created a ghost FK.** During emergency repairs, a duplicate FK was created: `events_template_id_fkey` (auto-generated by Supabase dashboard) + `fk_events_template_id` (from migration). PostgREST errored with "more than one relationship was found."
3. **Rollback left site at 0 events.** Vercel rollback restored old frontend code, but the duplicate FK caused all `event_templates` joins to fail across the entire site (including the old code paths).
4. **Resolution.** Ghost FK (`events_template_id_fkey`) dropped via Supabase MCP. PostgREST schema cache forced to reload via DDL comment change (`COMMENT ON CONSTRAINT`) + `pg_notify()`. Site recovered with 1,927 events visible.

**Key lesson:** `NOTIFY pgrst, 'reload schema'` is unreliable for forcing PostgREST to detect schema changes. A DDL change (ALTER, COMMENT, CREATE) triggers PostgREST's event-trigger-based reload, which is more reliable.

### Technical Stack

- **Database indexes (live on production):**
  - `pg_trgm` extension enabled
  - GIN trigram indexes on `events.event_title`, `events.artist_name`, `events.venue_name`
  - Composite B-tree index on `(status, event_date)`
  - FK constraint `fk_events_template_id` (events.template_id → event_templates.id)

- **API endpoint:** `src/app/api/events/search/route.js` (352 lines)
  - Offset-based pagination via Supabase `.range(from, to)`
  - ILIKE search with pg_trgm GIN indexes for fuzzy partial matching
  - Date/venue/category filtering
  - Server-side waterfall via shared `applyWaterfall()` from `src/lib/waterfall.js`
  - Explicit PostgREST FK hint: `event_templates!fk_events_template_id(...)` — bypasses schema cache auto-detection
  - Response shape: `{ data, page, limit, total, hasMore }`
  - Single-line select string (newlines in template literals break PostgREST URL parser)

- **Frontend wiring:** `src/app/page.js` (286-line diff)
  - Pagination state: `currentPage`, `hasMore`, `loadingMore`, `totalEvents`, `PAGE_SIZE = 20`
  - IntersectionObserver infinite scroll with sentinel div at 400px rootMargin
  - Stale-response guard via `fetchIdRef` counter
  - Auto-reset to page 1 on filter/search changes
  - `serverParams` useMemo computes dateFrom/dateTo/q from UI state

- **Migration files:**
  - `supabase/migrations/20260416_search_indexes.sql` — committed, live on production
  - `supabase/migrations/20260416_template_fk.sql` — committed, live on production

### Deployment Path

Feature branch `feat/server-search` → Vercel preview (blocked by Deployment Protection auth wall, manually verified via browser) → merged to `main` → promoted from "Staged" to "Current" (Vercel had held the rollback as active; required manual promotion). Production deployment ID: `25siVjeyz`, commit `1910d0f`.

**Vercel production is no longer in a rollback state** and is successfully tracking the latest commit on `main`.

### Files Modified

- `src/app/api/events/search/route.js` — New file. Server-side search API endpoint with pagination, filtering, waterfall, and FK hint.
- `src/app/page.js` — Replaced 80-event client-side Supabase fetch with `/api/events/search` calls, added infinite scroll, pagination state, and stale-response guard.
- `supabase/migrations/20260416_search_indexes.sql` — Enables pg_trgm, creates trigram GIN indexes and composite B-tree index.
- `supabase/migrations/20260416_template_fk.sql` — Adds FK constraint `fk_events_template_id`.

### Test Scripts

- `scripts/test-search-api.mjs` — 16 automated tests. Accepts optional base URL argument (defaults to localhost:3000). Covers: default fetch, pagination, limit clamping, search, gibberish, date range, category filter, event shape, combined params, special characters, pagination consistency, waterfall resolution, hasMore flag, and edge cases.
- `scripts/test-search-curl.sh` — 10 curl-based tests for quick manual verification.
- `scripts/diagnose-fk.mjs` — 10-test FK diagnostic (untracked). Hits Supabase REST API directly, bypassing Next.js.
- `scripts/find-ghost-fk.sql` — SQL ghost FK hunter (untracked). Queries `information_schema` and `pg_catalog` for duplicate FK constraints.

### Known Limitations (Future Polish)

- **Autocomplete suggestions** iterate over the loaded events array (only pages the user has scrolled through). A dedicated autocomplete endpoint would provide full coverage.
- **Venue filter dropdown** shows only venues from loaded pages. Same solution: a dedicated `/api/venues` endpoint.
- **`template_id` population** is at ~2.7% (65 of 2,731 events). Grows naturally with each sync cycle as the template matchmaker links more events.

### Safety Locks — Additions

All prior Safety Locks remain in force. This session adds:

- **PostgREST FK hint requirement.** All PostgREST fetch logic that joins two tables connected by foreign keys MUST use explicit join hints (e.g., `table!fk_name(*)`) to prevent "Multiple Relationships" ambiguity crashes. The schema cache is not guaranteed to auto-detect the correct FK path.
- **Single-line select strings for PostgREST.** Never use template literals with newlines for Supabase `.select()` strings. Newlines get URL-encoded (`%0A`) and break PostgREST's parser. Use single-quoted, single-line strings.
- **`event_image` remains virtual.** The search route does NOT select `event_image` (Safety Lock §0.4). Image resolution happens post-query via `applyWaterfall()`.

### Safety Locks — Cumulative Snapshot (Apr 16, Session 3)

- All April 14 Safety Locks remain in force.
- All April 14 G Spot invariants remain in force.
- All April 16 (session 1) additions remain in force.
- All April 16 (session 2) additions remain in force.
- April 16 (session 3) additions: PostgREST FK hint requirement, single-line select strings, event_image virtual field in search route.

---

## Session: April 18, 2026

### Summary

Enrichment pipeline tuning, genre/vibe taxonomy expansion, and cron sync prioritization.

### Changes Made

#### 1. Enrichment Limit Bumped (15 → 30)

**File:** `src/app/api/sync-events/route.js` (line ~1070)

The per-sync artist enrichment cap was raised from 15 to 30. The old limit was too conservative for the Pro plan's longer function execution time, causing a growing backlog (~585 artists missing bios at time of audit). At 30 per run with more frequent cron syncs, the backlog clears ~2x faster.

#### 2. Enrichment Prioritized by Event Date

**File:** `src/app/api/sync-events/route.js` (enrichment query)

Added `.order('event_date', { ascending: true })` to the unenriched events query. Artists playing soonest now get enriched first. Previously, enrichment order was arbitrary (insertion order), meaning tonight's act could be behind someone playing 3 weeks out.

#### 3. Added "Disco" and "Jam" Genres

**Files:** `src/lib/utils.js`, `src/lib/aiLookup.js`

Added `'Disco'` and `'Jam'` to both `GENRES` (utils.js, now 20 items) and `ALLOWED_GENRES` (aiLookup.js). Jam bands are prevalent at the Jersey Shore (Grateful Dead/Phish-influenced acts) and were being shoehorned into "Rock". The AI tagger prompt now includes explicit guidance: "If the artist plays jam-band, improvisational, or Grateful Dead/Phish-style music, output 'Jam'."

#### 4. Artist vs Event Vibe Split

**Files:** `src/lib/utils.js`, `src/lib/aiLookup.js`, `src/app/admin/page.js`, `src/components/admin/AdminArtistsTab.js`, `src/components/admin/shared/StyleMoodSelector.js`, `src/components/admin/shared/index.js`

New export `ARTIST_VIBES` (3 items): `'Chill / Low Key'`, `'Energetic / Party'`, `'Family-Friendly'`. Excludes `'Outdoor / Patio'` which describes a venue setting, not how a band sounds.

- **Artist admin modal** now shows only 3 vibes (uses `ARTIST_VIBES`)
- **Event modals** (EventFormModal, AdminEventTemplatesTab) still show all 4 vibes (uses `VIBES`)
- **AI Pass 2 tagger** uses `ARTIST_VIBES` for MUSICIAN kind, `ALLOWED_VIBES` for VENUE_EVENT kind
- **Vibe validation** in `aiLookupArtist()` is now kind-aware — won't accept "Outdoor / Patio" on a musician

#### 5. Force-Sync Artist Linking (from earlier in session)

**File:** `src/app/api/admin/force-sync/route.js`

Added artist-linking logic post-upsert that mirrors the cron sync's linking. Steps: find unlinked events → direct name match against artists table → alias lookup for unmatched → set artist_id + default_category on matched events. Returns `eventsLinked` count in response. This fixed the root cause of artists like Skinny Amigo not showing metadata on the live site after a force-sync.

### Cron Sync Mechanics (Reference)

For operator awareness, here's how the cron sync handles re-runs:

- **Events:** Upserted on `external_id` conflict. Re-scraped events update existing rows, never duplicate.
- **Artists:** Only names NOT already in the `artists` table (the `cachedMap`) get sent for enrichment. Running cron more frequently does NOT re-enrich existing artists — it only processes the uncached backlog.
- **Recommendation:** 2-3 cron runs per day to keep pace with ~13 new artists/day and clear the enrichment backlog.

### Safety Locks — Additions

All prior Safety Locks remain in force. This session adds:

- **Enum Prison expanded.** `GENRES` Flat-20 (was Flat-18). Added `'Disco'` and `'Jam'`. `ALLOWED_GENRES` in `aiLookup.js` must stay in sync.
- **Artist vibe boundary.** `ARTIST_VIBES` is the canonical vibe list for MUSICIAN contexts. `'Outdoor / Patio'` must NOT appear on artist profiles or in AI tagger output for musicians. The full `VIBES` (4 items) is for events only.
- **Enrichment date priority.** The enrichment query in `sync-events/route.js` MUST order by `event_date ASC`. Do not remove this ordering — it ensures soonest events get bios/images first.

### Roadmap — Added April 18, 2026

- **Retroactive QA Audit System (build in ~2 weeks).** A Gemini Flash-powered audit system at `/api/admin/qa-audit` that evaluates all existing live data. Three phases: Phase 1 — programmatic checks (hype words, char limits, dead URLs, missing fields) at zero API cost. Phase 2 — LLM quality scoring on bios that passed Phase 1 but may still be fluff. Phase 3 — vision-based image QA (detect text-heavy flyers, generic stock photos, irrelevant images). Results surface in a "QA Review" queue in the admin dashboard. Use Gemini Flash (not Perplexity) to keep enrichment and audit on separate billing. Wait until the improved enrichment pipeline (hype word filters, citation stripping, date-priority ordering) has run for 2 weeks before auditing, so new data comes in clean.

---

## Session — April 19, 2026

### 1. Spotlight Runner-Up Promotion Fix

**Problem:** Runner-ups (positions 6-8) were vanishing on admin page load and not promoting when a main spotlight was deleted. Random autopilot events appeared instead.

**Root cause:** `GET /api/spotlight` capped at `MAX_SLOTS = 5`, dropping pins 6-8 on every fetch. Additionally, autopilot filled all slots up to MAX_SLOTS, overwriting runner-up positions.

**Fix (3 files):**
- `src/app/api/spotlight/route.js` — Added `all_pins=true` query param that raises MAX_SLOTS to 8 for admin fetches. Added separate `AUTOPILOT_CAP = 5` so autopilot never fills runner-up slots. POST validation changed from 10 to 8 max.
- `src/hooks/useAdminSpotlight.js` — Changed `MAX_PINS` from 10 to 8. Fetch URL now includes `?all_pins=true`. `removePin` works correctly — list shrinks and runner-ups slide up.
- `src/components/admin/AdminSpotlightTab.js` — Default prop updated to `MAX_PINS = 8`. UI splits at index 5: positions 0-4 are main (#1-#5), positions 5-7 are runner-ups (R1-R3).

### 2. Artist-ID Linking Fix for Human-Edited Events

**Problem:** OCR-scraped and manually edited events (e.g., Howl at Palmetto) never got linked to their artist records, so no image/bio cascaded.

**Root cause:** The enrichment loop's `is_human_edited || is_locked` filter blocked ALL processing including non-destructive artist_id FK linking.

**Fix:** Split enrichment into two passes in `src/app/api/sync-events/route.js`:
- **Pass 1 (Artist-ID Linking):** Runs on ALL unlinked events regardless of lock status. Only sets null `artist_id` FK — non-destructive.
- **Pass 2 (Bio/Image Enrichment):** Runs only on unlocked events. Writes bio, image, genre, category from Last.fm/MusicBrainz/Discogs.

**Backfill:** Ran migration to link 270 orphaned events to existing artist records.

### 3. Cron Sync Timeout Fix

**Problem:** Nightly Vercel cron hadn't run since April 7. All venue sync dates stuck.

**Root cause:** `sync-events/route.js` had no `maxDuration` export, defaulting to Vercel Hobby's 10-second limit. 44+ scrapers in `Promise.all` always exceed 10s.

**Fix:** Added `export const maxDuration = 60;` to `src/app/api/sync-events/route.js`. Verified `CRON_SECRET` env var exists in Vercel. Cron schedule confirmed at `0 2 * * *` (10 PM ET).

---

## Session — April 20, 2026

### 4. House of Independents Playwright Scraper

**Problem:** Old fetch-based scraper (`houseOfIndependents.js`) relied on Etix server-rendering JSON-LD structured data. Etix removed that — page returns a 2KB empty shell with 0 ld+json blocks.

**Investigation:** Navigated to Etix calendar page in Chrome. Confirmed it's a React SPA (Material UI) behind AWS WAF. Events load via `POST /ticket/api/online/search`. DOM structure is clean: each event card (`.css-1j1ov2l`) contains date, time, title link, venue, and price.

**New scraper:** `src/lib/scrapers/houseOfIndependents.playwright.js`
- Launches headless Chromium with stealth args + `playwright-extra` stealth plugin
- Waits for event links to render, clicks "Show More" to paginate all ~60 events
- Extracts title, date ("Apr 23" → YYYY-MM-DD with year inference), time, price, ticket URL
- Uses same `hoi-{performanceId}` external_id format as old scraper for DB continuity

**Registration:** Added to `scripts/playwright-sync.mjs` SCRAPERS array alongside Brielle House.

**Status:** Scraper logic verified against live DOM (30/30 events extracted correctly in Chrome). However, Etix AWS WAF blocks headless Chromium on GitHub Actions IPs — even with stealth plugin. Tabled for now. Options for future: residential proxy via Playwright, API token interception, or self-hosted runner.

**GitHub token scope:** Had to add `workflow` scope to GitHub PAT to push `.github/workflows/` changes.

**GitHub Actions secrets:** Added `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as repository secrets for the Playwright runner.

### Files Changed (April 19-20)

| File | Change |
|------|--------|
| `src/app/api/spotlight/route.js` | `all_pins=true` param, `AUTOPILOT_CAP = 5`, POST max 8 |
| `src/hooks/useAdminSpotlight.js` | `MAX_PINS = 8`, fetch with `all_pins=true` |
| `src/components/admin/AdminSpotlightTab.js` | Default prop `MAX_PINS = 8` |
| `src/app/api/sync-events/route.js` | `maxDuration = 60`, two-pass enrichment split |
| `src/lib/scrapers/houseOfIndependents.playwright.js` | **NEW** — Playwright scraper for Etix SPA |
| `src/lib/scrapers/brielleHouse.playwright.js` | **NEW** (from earlier) — Playwright scraper for FullCalendar |
| `src/lib/scrapers/brielleHouse.js` | Updated header comments (legacy/fallback label) |
| `scripts/playwright-sync.mjs` | **NEW** — Playwright sync runner with HOI + Brielle House |
| `.github/workflows/playwright-scrapers.yml` | **NEW** — Nightly GH Actions cron for Playwright scrapers |
| `package.json` | Added `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth` to devDependencies |

---

## Session — April 20, 2026 (cont.) — Metadata Enrichment Pipeline

### Summary

Built and wired the pre-launch metadata enrichment pipeline — the system that fills bios, images, and genre tags on hundreds of unenriched artist rows before launch. Foundation was laid in the prior session; this pass (a) wired the LLM router into the AI lookup, (b) fixed a duplicate-bio write bug, (c) added pre-write snapshots for safe rollback, and (d) shipped an admin UI tab for running the backfill.

### 1. LLM Router wired into `aiLookup.js`

The multi-provider abstraction at `src/lib/llmRouter.js` is now the primary path for `aiLookupArtist`:

- **Pass 1** (classify + bio + image + source_link) → `callLLMWebGrounded()` → Perplexity → Gemini → Grok. Web grounding matters for artist research; Perplexity's `sonar-pro` is built around it. If Perplexity 429s, the router falls through to Gemini.
- **Pass 2** (genre + vibe tagging from bio text) → `callLLM()` → Gemini → Perplexity → Grok. Pure classification from text already in hand; Gemini-first saves Perplexity quota for Pass 1.

The old `callPerplexity()` helper in `aiLookup.js` is kept for backward-compat (its docstring now marks it DEPRECATED). No external callers bind to it directly — verified with a cross-repo grep.

**Behavioral change for Gemini-only deployments:** the old hard-fail when `PERPLEXITY_API_KEY` is missing was relaxed. `aiLookupArtist` now succeeds as long as ANY of `GOOGLE_AI_KEY`, `PERPLEXITY_API_KEY`, or `XAI_API_KEY` is set. The router skips unconfigured providers.

### 2. Duplicate-bio Bug fixed in `enrich-backfill/route.js`

The prior draft of the backfill endpoint had a broken write gate:

```js
// OLD — broken precedence + duplicate override
if (result.bio && !artist.missing_fields?.includes('bio') === false) { ... }
if (result.bio) { upsertData.bio = result.bio; hasNewData = true; }
```

`!x === false` evaluates before the `&&`, and the second block ran unconditionally — net effect "always write bio". Replaced with a clean `missing_fields` gate:

```js
const canWriteBio = missing.includes('bio');
const canWriteImage = missing.includes('image_url');
if (result.bio && canWriteBio) { ... }
if (result.image_url && canWriteImage) { ... }
```

Also fixed the `image_source` label — it was hardcoded to `'AI (Perplexity)'` which was wrong once the router started producing Gemini-sourced URLs too. Now it reflects the actual provider (`AI (Perplexity)` / `AI (Serper)` / `AI (gemini)` / etc.).

### 3. Pre-write Snapshots

Every batch now captures the pre-write state of each artist row BEFORE writing. The snapshot contains `{artist_name, artist_id, kind, pre_state, post_state, written_at}` per entry. Returned in the response body as `snapshot.entries` and also dumped to `/tmp/mylocaljam-enrich-<ISO>.json` on the server (ephemeral — survives the request for `vercel logs` post-mortem).

**Rollback recipe:** given the downloaded JSON, replay each entry's `pre_state` into Supabase via `upsert(pre_state, { onConflict: 'id' })` to restore the exact pre-write row. `_snapshot_error` key on a pre_state means the read failed and manual reconstruction is needed for that row (rare).

Snapshot is critical because:
1. Vercel's filesystem is ephemeral — the /tmp copy is gone after cold-boot
2. The endpoint CAN overwrite partially-enriched rows' existing bio/image if the priority filter's lock check misses a case (e.g. a future schema change)
3. Any LLM misclassification (MUSICIAN vs VENUE_EVENT) is reversible up until the admin downloads the next batch's snapshot

### 4. Admin UI — "Enrichment" tab

New `src/components/admin/AdminEnrichmentTab.js`, wired as a new tab in `src/app/admin/page.js` (`key: 'enrichment'`). Features:

- Batch size input (1-25, defaults to 2 for safe first runs)
- "Bare only" toggle — restricts to artists missing BOTH bio AND image
- Run / Pause / Resume — cooperative stop via `stopRef.current`, finishes the in-flight batch before halting
- Stats grid: batches run, artists enriched, remaining in queue, LLM calls (broken out by provider)
- Two-column log: enrichment log (kind badge + name + wrote-bio/image indicators) and error log
- Snapshot download button — combines every batch's snapshot into a single timestamped JSON file for the session
- Safety hint at the bottom reminding the admin to download the snapshot before firing the next session

Loop pattern: POST → read `remaining` → sleep 1.5s → POST again → stop on `remaining === 0` or explicit Pause. A 200-iteration safety cap prevents a runaway loop if the `remaining` counter somehow stays non-zero.

### 5. Testing + Rollout Plan

**Local test (recommended first run):**

```bash
npm run dev
# In another terminal:
curl -X POST http://localhost:3000/api/admin/enrich-backfill \
  -H "Authorization: Bearer $(grep '^ADMIN_PASSWORD=' .env.local | cut -d'"' -f2)" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 2, "bareOnly": false}' | jq .
```

**Quality audit checklist — run against the 2 enriched rows after a test batch:**

- Bios ≤ 250 chars (`length(bio) <= 250` in Supabase)
- No banned hype words: `legendary`, `world-class`, `amazing`, `soul-stirring`, `incredible`, `electrifying`, `unforgettable`, `mind-blowing`, `jaw-dropping`, `high-energy`, `captivating`, `mesmerizing`, `powerhouse`, `showstopping`, `breathtaking`
- `image_url` resolves to an actual artist photo — not an Unsplash placeholder (check for `unsplash.com` substring)
- `image_source` is one of `AI (Perplexity) / AI (Serper) / AI (gemini)` — reflects real provider
- `genres` is a subset of `ALLOWED_GENRES` (see `src/lib/aiLookup.js`)
- For VENUE_EVENT names (trivia, karaoke, drink specials), `genres` should be empty — the Classification Fork skips Pass 2

**Prod rollout:** deploy via normal git push → Vercel auto-deploys. Backfill UI lives at `/admin` → Enrichment tab. Start with batchSize 2, audit, then bump to 20-25 once confidence is established. Download snapshot between major batches.

### 6. Files Changed (April 20, enrichment work)

| File | Change |
|------|--------|
| `src/lib/aiLookup.js` | Import from `llmRouter`; Pass 1 uses `callLLMWebGrounded`, Pass 2 uses `callLLM`; relaxed PERPLEXITY_API_KEY hard-require to any-provider-set; marked `callPerplexity()` DEPRECATED in docstring |
| `src/lib/llmRouter.js` | **NEW** (from prior session) — multi-provider abstraction with 429 fallback |
| `src/lib/enrichmentPriority.js` | **NEW** (from prior session) — priority scoring for unenriched artists |
| `src/app/api/admin/enrich-backfill/route.js` | **NEW** — batch endpoint; this session fixed duplicate-bio bug, fixed `image_source` label, added pre-write snapshot capture + /tmp dump + response payload |
| `src/components/admin/AdminEnrichmentTab.js` | **NEW** — admin UI tab with loop runner, progress, logs, and snapshot download |
| `src/app/admin/page.js` | Wired the new tab into the tab array and render block |
| `HANDOVER.md` | This section |
| `SCRAPERS.md` | Cross-reference to enrichment pipeline |

---

## Session — April 21, 2026 — Autocomplete Fix, Event Series Phase 1

### Summary

Two discrete work streams. First, patched an autocomplete regression where drink specials and orphaned artist rows were being dropped from search suggestions. Second, shipped Phase 1 of the Event Series architecture — a first-class parent entity for festivals, town concert series, parades, and other named multi-event umbrellas, with an admin-gated checkbox in the approval modal that opts a submission into a series row. Phases 2 (backfill audit) and 3 (parent/child admin UI) are queued.

### 1. Autocomplete Regression — Drink Specials + Artist Fallback

**Problem:** Searching for strings like `"$2 miller"`, `"bogo burger"`, or `"extended happy hour"` returned no suggestions even though events existed. Additionally, events whose `artist_name` had no row in the `artists` table (un-linked) never populated as search candidates.

**Root cause (two bugs introduced in commit `e0d0ef4`):**
- `classifyTitle()` in `src/app/page.js` returned `null` for drink special strings, so they were filtered out of all three autocomplete buckets (artist / venue / event-type).
- The event bucket dropped any un-classified `rawTitle` instead of falling back to the artist set.

**Fix (committed `103e7b3` + `abe2d4c`):**
- Added a `'special'` classification branch so drink specials get their own badge instead of being silently dropped. `classifyTitle()` now returns `'special'` when `DRINK_SPECIAL_RE` matches.
- Added an artist-set fallback: if a rawTitle has no classification and is ≤ 50 chars, it flows into the artist bucket.
- Added a new dropdown icon (`MATERIAL_ICON_PATHS.restaurant`, pink `#ec4899`) for the `'special'` type so the UI distinguishes a happy-hour match from an artist match.

**Verification:** Typed `"bogo"` and `"$2 miller"` — both return matching events with the pink restaurant icon. Typed an orphan artist name — now shows in results.

### 2. Event Series — Phase 1A: `event_series` Table + `events.series_id` FK

**Problem:** The "Festivals & Event Titles" admin tab grouped events by the free-text `events.event_title` field. Because every admin-approved submission with an OCR-extracted `event_name` ended up with `event_title` populated, the tab surfaced every flyer title as a "festival" — a show called "Kevin Hill and Sandy Mack" showed up as one. Parent-level metadata (banner, description, date range, ticket URL) had no place to live.

**Design (committed `a2513a9`):** New `event_series` parent table with:
- `id`, `name`, `slug` (UNIQUE), `category` (NOT NULL CHECK `IN ('festival','concert_series','parade','other')`)
- `banner_url`, `description`, `start_date`, `end_date`
- `venue_id` (FK → venues, ON DELETE SET NULL), `ticket_url`, `website_url`
- `tags` (text[] NOT NULL DEFAULT `ARRAY[]::text[]`), `status` (`published | draft | canceled`)
- `created_at`, `updated_at` (with `trg_event_series_updated_at` BEFORE UPDATE trigger)
- Indexes: `idx_event_series_name_lower` for case-insensitive find-or-create, plus `status` and `category`
- RLS: `event_series_public_read USING (true)` — matches sibling tables (artists, venues, event_templates); writes gated by the service role

Plus `events.series_id uuid` column with FK `fk_events_series_id ON DELETE SET NULL` and a partial index (`WHERE series_id IS NOT NULL`) since most events won't have a parent series.

**Migration file:** `supabase/migrations/20260421_event_series.sql` (fully commented — category taxonomy, design rationale, post-migration steps). Applied to prod via Supabase MCP `apply_migration` after verifying (a) `pgcrypto` is installed for `gen_random_uuid()` and (b) the `venues` table is safe to FK-reference.

**Category taxonomy:**
- `festival` — Sea Hear Now, Asbury Park Reggae Fest
- `concert_series` — Manasquan Beach Concerts, Belmar Summer Sounds (local town events that fit the umbrella pattern without literally being festivals)
- `parade` — Belmar Parade Day, St. Patrick's Day Parade
- `other` — catch-all for named umbrellas that don't fit above

Category is required. `'other'` is the safe fallback.

### 3. Event Series — Phase 1B: Admin-Gated Opt-In Checkbox

**Problem:** Until the approval code was updated, every OCR-extracted `event_name` would still auto-promote to `event_title` and `is_festival=true`, defeating the purpose of the new schema.

**Fix (committed `5e0548a`):** Three-file change to gate series/festival linkage behind an explicit admin action in the approval modal. The checkbox lives ONLY on the admin page — public submissions never see it.

**`src/hooks/useAdminQueue.js`:**
- Added `is_series: false`, `series_category: 'festival'` to `queueForm` initial state
- `populateQueueForm` now resets these to OFF on every submission load — no cross-contamination between queue rows

**`src/components/admin/AdminSubmissionsTab.js`:**
- Renamed label `"Event / Festival Name"` → `"Event / Series Name"`
- Removed the auto-firing "🔥 Festival mode" hint (it fired on every populated `event_name`, training the admin to ignore it)
- Added a dashed-border opt-in panel below the name field with a "Part of a series / festival" checkbox, disabled until the name field is filled
- When checked, reveals a required category dropdown (festival / concert_series / parade / other) and a reveal hint explaining that a parent series row will be linked on approval

**`src/app/api/admin/queue/route.js` (POST handler):**
- Replaced unconditional `event_title = eventName; is_festival = true` with admin-gated `isSeries = !!event_data.is_series && !!seriesName`
- `event_title` is only stamped when `isSeries` is true
- `is_festival` is only set when `isSeries && seriesCategory === 'festival'` — concert_series / parade / other do NOT get the festival flag
- After the event insert, a find-or-create block slugifies the name, SELECTs `event_series` by slug, INSERTs a new row with the admin-picked category if needed, then UPDATEs `events.series_id` on the just-created event. Failures log and continue — the event stays published even if series linkage fails (try/catch wrapped)

**Slug rule:** `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)`. "Sea Hear Now 2026" → `sea-hear-now-2026`. Case-insensitive dedup is guaranteed by the UNIQUE constraint on `event_series.slug`.

**Deployment:** Pushed to `main`; Vercel built deployment `8BSCWNRCv` (commit `5e0548a`) in 29s. UI verified live — checkbox appears with dashed border when name is populated, ticks into a filled amber panel with category dropdown.

### 4. Phase 2 + Phase 3 (Deferred)

- **Phase 2 — `event_title` backfill audit (task #34).** Existing events with non-null `event_title` need a manual pass: real series/festivals get promoted into `event_series` rows and their events re-linked via `series_id`; non-series values (e.g. "Kevin Hill and Sandy Mack") get NULLed. Start from `SELECT DISTINCT event_title, COUNT(*) FROM events WHERE event_title IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`.
- **Phase 3 — `AdminSeriesTab` parent/child UI (task #35).** Replace the current `AdminFestivalsTab` (which groups by free-text `event_title`) with a proper parent-entity view: series listed as cards, click to expand the child event list with inline spotlight-style metadata. Inline edit for name / banner / description / dates / category.

### 5. Files Changed (April 21)

| File | Change |
|------|--------|
| `src/app/page.js` | `classifyTitle()` returns `'special'` for drink specials; event bucket falls back to artist set for un-classified rawTitles ≤ 50 chars; autocomplete dropdown renders `'special'` type with pink restaurant icon |
| `supabase/migrations/20260421_event_series.sql` | **NEW** — `event_series` table + `events.series_id` FK + RLS + indexes + updated_at trigger. Applied to prod via MCP. |
| `src/hooks/useAdminQueue.js` | `queueForm` adds `is_series` + `series_category`; `populateQueueForm` resets them per submission |
| `src/components/admin/AdminSubmissionsTab.js` | Label renamed; auto-firing festival hint removed; opt-in checkbox + category dropdown panel added |
| `src/app/api/admin/queue/route.js` | `event_title` / `is_festival` writes gated behind `is_series`; find-or-create `event_series` by slug; update `events.series_id` post-insert |
| `HANDOVER.md` | This section |
| `Agent_SOP.md` | Roadmap entry for Event Series Phase 2/3 |
| `SCRAPERS.md` | `series_id` footnote on events column list |

### Safety Locks — Additions

All prior Safety Locks remain in force. This session adds:

- **Series linkage is admin-gated.** `event_title`, `is_festival`, and `series_id` on an `events` row MUST only be set when an admin explicitly ticks the "Part of a series / festival" checkbox in the approval modal. Automation (scrapers, OCR auto-promotion, cron) must NEVER set these fields. The gate lives in `POST /api/admin/queue` — `event_data.is_series === true` is required. Existing scrapers do not touch `series_id`.
- **`event_series.slug` is the dedup key.** Find-or-create uses `slug = lowercase(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)`. Do not change this rule — existing series rows rely on it for lookup. If the rule changes, existing slugs must be backfilled to the new format in the same migration.
- **`event_series.category` is required.** NOT NULL with CHECK `IN ('festival','concert_series','parade','other')`. `'other'` is the safe fallback. Admin UI defaults to `'festival'` — change the default only if a majority of approvals shift to another category.
- **`is_festival` is scoped to `category === 'festival'`.** Concert series, parades, and other named umbrellas get a `series_id` link but NOT `is_festival = true`. This keeps the public-feed "festival" badge meaningful.

---

## Session — April 22, 2026 — Event Series Phase 1 Prod Verification

### Summary

Three-test verification pass on the Series Phase 1 admin approval flow shipped April 21 (commit `5e0548a`). All three tests passed, confirming the admin-gated opt-in works as designed end-to-end — unticked submissions stay clean, ticked submissions correctly stamp `event_title` and create/reuse `event_series` parent rows. Two admin UX gaps surfaced during testing and were logged as new tasks (#36 venue aliases, #37 series name typeahead). Test data cleaned from prod. No code changes this session — verification + docs only.

### 1. Test A — Unticked Checkbox (Negative Case)

**Setup:** Approved a real user submission (Uncle Ebenezer) with the "Part of a series / festival" checkbox left OFF.

**Expected:** `event_title`, `is_festival`, `series_id` all remain null on the resulting events row; no `event_series` row created.

**Result:** Confirmed via SQL — `event_title = NULL`, `is_festival = false`, `series_id = NULL` on the new events row. The April 21 `populateQueueForm` reset correctly defaults to OFF per submission; no series metadata leaks in without an explicit opt-in.

### 2. Test B — Ticked Checkbox, New Series (Creation Path)

**Setup:** Approved Dakota Diehl (single show on 2026-04-19, from an EvenTide Grille April flyer). Ticked the checkbox with series name `"EvenTide Grille April Events TEST"` and category `"Other named umbrella"`.

**Expected:** One new `events` row with `event_title` stamped and `is_festival = false` (category is `other`, not `festival`). One new `event_series` row with slug `eventide-grille-april-events-test`, category `other`. Event's `series_id` = the new series row's ID.

**Result:** Confirmed. event_series row `ddd23763-1380-4950-9313-bc4f00d46eb6` created with correct slug and category. Events row linked via `series_id`. Artist enrichment also fired successfully post-publish — Dakota Diehl now has bio + image populated.

**Feed visibility note:** Event date was 2026-04-19 (3 days in the past on approval day), so it did NOT appear on the public feed — the feed filters `event_date >= today`. Not a bug; expected behavior for past shows.

### 3. Test C — Ticked Checkbox, Existing Series (Find-or-Create Dedup)

**Setup:** Approved Kenny & Rich (upcoming show on 2026-04-26) with the same series name as Test B — `"EvenTide Grille April Events TEST"`, same category (`"Other named umbrella"`). Venue field was manually edited from the OCR-produced `"EvenTide Grille, Navesink Marina"` down to `"Eventide Grille"` to match the existing venue row (see Finding #36 below).

**Expected:** The find-or-create logic in `POST /api/admin/queue` should SELECT the existing `event_series` row by slug and reuse it — NOT create a duplicate. The new events row's `series_id` should equal Test B's series ID. `event_series` table should still contain only one row with slug `eventide-grille-april-events-test`.

**Result:** Confirmed. The new Kenny & Rich events row has `series_id = ddd23763-1380-4950-9313-bc4f00d46eb6` — **identical to Dakota Diehl from Test B**. `event_series` count for that slug remains 1. Venue linkage worked: `venue_id = cd7f6d2c-...` (real Eventide Grille row).

**Feed visibility:** Apr 26 is upcoming, so the event DID appear on the public feed — rendered with the flyer image and the series name as the headline. The pre-existing scraper-sourced Kenny & Rich event on the same date also rendered separately; see Finding #4 (duplicate events on approval) below.

### 4. Incidental Findings

**Task #36 — Venue autocomplete is exact-string only.** The venue field in the approval modal doesn't fuzzy-match or check aliases. The real venue row is named `"Eventide Grille"`, but scraper/OCR output produces `"EvenTide Grille, Navesink Marina"` — these don't match, so the admin either manually trims the string (as in Test C) or accidentally creates a duplicate venue row by clicking "+ Create New Venue". That's exactly how the stray test venue row `8047cffd-...` was created before it was cleaned up. Fix path: mirror the artist-aliases pattern — add a `venue_aliases` column (or table) and update the admin lookup to match canonical name OR any alias.

**Task #37 — Series name field has no typeahead.** The "Event / Series Name" input in `AdminSubmissionsTab.js` is a plain `<input type="text">`. Admins must manually retype the series name for dedup to hit. Slug normalization (`toLowerCase → replace non-alphanumeric with dashes → trim → slice(80)`) is case- and punctuation-tolerant, but not word-tolerant — `"EvenTide Grille April Events TEST 2"` slugs differently than `"EvenTide Grille April Events TEST"` and would create a duplicate parent. Fix path: debounced typeahead against `event_series.name` (ILIKE) that surfaces matches and on-select pre-populates both the name field and the `series_category` dropdown. Could ship standalone or fold into Phase 3 AdminSeriesTab (#35).

**Artist enrichment gaps (fits #27).** Kenny & Rich's artist row post-approval had `image_url` populated (via Wikimedia Commons) but `bio` and `genres` empty. Same partial-enrichment pattern as Uncle Ebenezer from April 21. Possible causes: (a) the artist row pre-existed from a scraper pass so `enrichArtist` short-circuited, (b) the LLM lookup returned a usable image but no bio, (c) a silent `.catch(err => console.warn)` in the queue route swallowed an error. Worth a `vercel logs` check or a manual backfill kick from the Enrichment tab. Folds into the existing cascade-damage audit task.

**Duplicate events on approval (deferred, not logged as a task).** The approval flow creates a new events row without checking for duplicates against existing scraper-sourced events on the same date + artist + venue. Test C produced two Kenny & Rich events on Apr 26 — one from the April 7 scraper run, one from the April 22 approval. Tony opted NOT to log this as a formal task — the submission flow is primarily his own flyer uploads and he'll manually dedup pre-approval. Revisit once volume grows.

### 5. Test Data Cleanup (task #38, completed)

Test rows removed via surgical DELETE by specific ID:

```sql
DELETE FROM events WHERE id IN (
  'a10f13a0-028b-4219-95b2-6b99913696eb',  -- Dakota Diehl Test B
  'aad125a5-16e3-4f40-aa8a-83397677be89'   -- Kenny & Rich Test C
);
DELETE FROM event_series WHERE id = 'ddd23763-1380-4950-9313-bc4f00d46eb6';
DELETE FROM venues WHERE id = '8047cffd-428e-447a-be2f-3859f67c16ab';  -- already gone, no-op
DELETE FROM submissions 
WHERE artist_name IN ('Dakota Diehl', 'Kenny & Rich')
  AND created_at >= '2026-04-21 23:00'
  AND created_at < '2026-04-22 00:30';
```

Verification (all counts returned 0):

```sql
SELECT COUNT(*) FROM events WHERE event_title = 'EvenTide Grille April Events TEST';
SELECT COUNT(*) FROM event_series WHERE slug = 'eventide-grille-april-events-test';
SELECT COUNT(*) FROM submissions WHERE artist_name IN ('Dakota Diehl','Kenny & Rich') 
  AND created_at >= '2026-04-21 23:00' AND created_at < '2026-04-22 00:30';
```

Supabase SQL editor note: the editor returns "Success. No rows returned" for DELETE/UPDATE statements and only shows the last SELECT's result when multiple SELECTs are stacked. Use subquery-column pattern (`SELECT (SELECT COUNT…) AS a, (SELECT COUNT…) AS b`) to get multiple counts in one row.

### 6. Files Changed (April 22)

No code changes this session — verification + documentation only.

| File | Change |
|------|--------|
| `HANDOVER.md` | This section |
| `Agent_SOP.md` | Roadmap entry for tasks #36, #37; Phase 1 prod-verified note |

### Safety Locks — Reaffirmed (No Changes)

All Safety Locks from April 21 remain in force — admin-gated linkage, slug as dedup key, required category, festival scoping. This session adds no new locks; it verifies the existing ones hold under real-data tests.

---

## Session — April 23, 2026 — Ghost-merge cache-drift fix

**Symptom Tony spotted.** Boatyard 401 Apr 30 Mike Dalton event rendered with a fireplace photo and a ghost AI bio instead of the locked canonical Mike Dalton's popmenucloud image + curated bio. After he merged 4 Mike Dalton ghost rows into the canonical, the display was still wrong and autocomplete still showed the ghost variants ("Mike Dalton 6pm", "MIKE DALTON BAND w/ Horns", etc.) as separate ARTIST entries.

**Root cause.** The merge endpoint (`src/app/api/admin/artists/merge/route.js`) correctly repointed events to the canonical artist and wrote aliases, but Step E only nulled `event_image_url` on the repointed event rows. Three other cache columns on `events` — `artist_name`, `artist_bio`, and the legacy `image_url` — kept the ghost values. The waterfall reads those event-row caches before falling through to the artist join, so every merged event kept displaying ghost data until the next scrape. This is the same class of bug that Phase 3 of the Trust Refactor is designed to eliminate structurally (dropping the event-row cache columns).

**Compounding bug in autocomplete.** `src/app/page.js` `autoCompleteSuggestions` added `e.artists?.name` to the ARTIST bucket via one path AND fell through to `e.artist_name` via the rawTitle path (line 545). When a linked event still carried a stale `artist_name`, both paths fired and surfaced the canonical name AND every ghost variant as separate ARTIST rows in the dropdown.

**Fixes shipped (deployed).**

1. **DB heal** (one-off SQL, already applied to prod Supabase):
   ```sql
   UPDATE events e
   SET artist_name = a.name, artist_bio = NULL, image_url = NULL, event_image_url = NULL
   FROM artists a
   WHERE e.artist_id = a.id
     AND e.artist_id IN ('<mike_dalton_id>','<eboro_id>','<ocean_ave_stompers_id>')
     AND e.is_human_edited = false
     AND (e.artist_name IS DISTINCT FROM a.name
          OR e.artist_bio IS NOT NULL
          OR e.image_url IS NOT NULL
          OR e.event_image_url IS NOT NULL);
   ```
   Rows healed: 48 Mike Dalton, 1 E-Boro Bandits, 3 Ocean Avenue Stompers. Event-level locks (4 Mike Dalton rows with `is_human_edited = true`) left untouched. Also linked two orphan "Mike Dalton Trio" event rows (artist_id was NULL, is_human_edited was true) to canonical — safe because `artist_id` is not in the lockable-fields list in `writeGuards.js`.

2. **Merge endpoint Step E rewrite** — `src/app/api/admin/artists/merge/route.js`. Was: `.update({ event_image_url: null })`. Now: `.update({ artist_name: master.name, artist_bio: null, image_url: null, event_image_url: null })` scoped to `is_human_edited = false` so event-level locks are honored. Response key renamed `staleImagesCleaned → staleCacheCleaned` (no frontend consumers of old key). Future ghost merges won't leave drift.

3. **Autocomplete dedup guard** — `src/app/page.js`. Added `!artistName` guard on the rawTitle-fallback ARTIST bucket. When an event has a linked canonical (`e.artists?.name` populated), the rawTitle path no longer falls through and double-adds the stale scraper `artist_name`. Un-linked scraper rows still surface via rawTitle as before (preserves #30's original intent).

**Ghost clusters swept.** Mike Dalton (#64), E-Boro Bandits (#64), Ocean Avenue Stompers (Tony's earlier merge, cache healed retroactively). HOWL and 9 South confirmed already merged at the artist-row level — no drift residue.

**Why this keeps mattering.** Every future artist merge will leave the same kind of cache behind on events unless Phase 3 of the Trust Refactor lands (drop `events.artist_bio` and `events.event_image_url`, read live from the artist join). Until then, the Step E fix is the patch — it heals at merge time, but scrapers can still write stale cache. Track in #62.

### Files Changed (April 23)

| File | Change |
|------|--------|
| `src/app/api/admin/artists/merge/route.js` | Step E now heals 4 cache columns (artist_name, artist_bio, image_url, event_image_url), scoped to unlocked events only |
| `src/app/page.js` | Autocomplete `!artistName` guard on rawTitle ARTIST fallback |
| `HANDOVER.md` | This section |
| `TRUST_REFACTOR.md` | Status bump + cache-drift incident postmortem added as Phase 3 motivation |

### Tasks closed this session

- #59 QA enrichment lock logic on 4 named artists
- #64 Dedupe Mike Dalton and E-Boro Bandits ghost artist rows
- #65 Heal stale events cache from ghost merges
- #66 Fix merge endpoint to clear all event cache columns
- #67 Stop autocomplete double-adding stale artist_name
- #68 Sweep remaining ghost clusters

## Session — April 23/24, 2026 — Hero scroll-jump #2, Osprey scraper, venue-row backfill

### 1. Hero collapse scroll jump #2 — rAF throttle dropped (#69 shipped)

**Symptom Tony spotted.** After the April 23 ResizeObserver fix shipped, a second jump appeared when scrolling UP toward the hero: a thin band of whitespace flashed above the first event card (Mike Dalton, Thu Apr 23) before snapping back into place.

**Root cause.** The `onScroll` handler in `HeroPiston.js` wrapped `applyScrollState` in `requestAnimationFrame` to batch scroll events. On fast reverse flicks, the ~16 ms delay between "last processed scrollTop" and "next scroll event triggering a new rAF" left the wrapper holding its stale collapsed height while the scroll had already moved back up. The next paint snapped to the correct height — that snap is the jump users saw.

**Validation before shipping.** Monkey-patched the live deployment with a synchronous handler + sampler that captured 9 data points during a scroll-down-and-up gesture. 8 of 9 samples showed `delta = 0` from the expected 1:1 scroll math; the 1 outlier was interference from the still-running original rAF-throttled handler (gone post-deploy).

**Fix shipped.** `src/components/HeroPiston.js`. Dropped the `rafPending` ref and made `onScroll` synchronous: `const onScroll = () => applyScrollState();`. `applyScrollState` is pure math + three style writes; running it synchronously on every scroll event (at most ~120/s on high-refresh displays) is cheaper than one frame of jank. Browser batches style writes into paint anyway. Header docblock updated with 2026-04-23b fix notes.

Commit `05d02b9` — "Drop rAF throttle in HeroPiston for true 1:1 scroll tracking."

### 2. Osprey Nightclub scraper (#70 shipped)

**Target.** `https://www.ospreynightclub.com/events` — Manasquan nightclub, ~48 upcoming events across April–December 2026.

**Site profile.** Custom-built single-page listing. No WordPress / Squarespace / Wix / Dice / SeeTickets / Prekindle / bandsintown / JSON-LD. One server-rendered HTML response, no AJAX, no pagination, no detail fetches required. Event rows are `.c-single-event` blocks inside `.c-events-list`, with the DOM shape:

```html
<div class="c-single-event none">
  <a href="detailsevent/<slug>">
    <div class="row align-items-center">
      <div class="col-lg-6"><p>TITLE</p></div>
      <div class="col-lg-6 text-lg-end"><p>DATE TIME</p></div>
    </div>
  </a>
</div>
```

**Two gotchas worth remembering.**

1. **Date formats.** Two shapes in the wild — `"April 25, 2026 5:00-9:00 PM"` (range) and `"May 02, 2026 9:00 PM"` (single). `parseDateTime` takes the START time for ranges; our schema doesn't carry end-time. The `am/pm` only appears once at the tail of ranges, so we match `\b(am|pm)\b` anywhere after the date and apply it to whichever h:mm we picked. Defaults to PM if absent — this is a nightclub.
2. **Title concatenation.** Headliner + opener/DJ are slammed together with no separator in the DOM (`"PulseDJ Cole Pardi"`, `"The KicksChaston"`, `"Big Bang BabyJoe Nichols"`). Per Tony: store titles RAW and let the downstream AI classifier split them. No heuristics to pick a split point in the scraper.

**External ID.** No stable per-event ID exposed — synthesized `osprey-<date>-<titleSlug>`, stable across runs while date + title hold.

**File + wiring.**
- New: `src/lib/scrapers/osprey.js` (175 lines, pattern-copies `parkerHouse.js`)
- `src/app/api/sync-events/route.js` — import, FAST_SHARD_2 set, Promise.all destructure + call array (48 entries both sides, alignment verified), scraperResults map, VENUE_REGISTRY, allEvents spread
- `SCRAPERS.md` — row 21b added

**Parser tested** against mock HTML locally (sandbox proxy blocks ospreynightclub.com, but the parser logic is covered by unit tests against the exact DOM shape scraped earlier in the session). All range-format and single-format datetimes parsed correctly; absolute detail URLs resolved off `BASE_URL`.

Commit `d8e98d7` — "Add Osprey Nightclub venue scraper."

### 3. Venue-row and coordinate backfill — Parker House, Jenks Club, Osprey

**Problem discovered mid-session.** While wiring up Osprey, I checked whether "The Osprey" existed in the `venues` table. It didn't — expected. But neither did **The Parker House** (added April 2026) or **Jenks Club** (added April 2026). Both scrapers had been upserting events with `venue_id = NULL` since their launch. 138 Parker House events and 40 Jenks events were orphaned in the DB.

**Second shoe.** Even after inserting the three venue rows, events weren't appearing in the home-page venue-filter dropdown. Root cause: `src/app/page.js` line 1477 filters out any event whose venue lacks `venue_lat` / `venue_lng`:

```js
if (!e.venue_lat || !e.venue_lng) return false; // exclude venues without coords
```

I'd inserted the venue rows without coordinates. Any new venue row without lat/lng gets its events silently dropped from the feed AND the venue-filter dropdown — it just disappears from the UI entirely. Worth knowing for every future venue add.

**Fixes applied (direct SQL on prod Supabase).**

1. Inserted three rows into `venues`:
   - The Parker House — 1st Ave & Beacon Blvd, Sea Girt, NJ 08750 — `c27e1be7-fd76-4bd2-8369-21fe19216492`
   - Jenks Club — 300 Boardwalk, Point Pleasant Beach, NJ 08742 — `30e8ea16-b2e9-489a-b852-9352bd3782aa`
   - The Osprey — 62 1st Ave, Manasquan, NJ 08736 — `0f8881ab-6d32-4dcc-8f94-898385b16359`
2. Backfilled orphaned events: 138 Parker House + 40 Jenks → now linked to the new venue_ids. 0 orphans remain for any of the three `external_id` prefixes.
3. Set approximate coordinates on all three (Sea Girt ~40.1313/-74.0333, PPB boardwalk ~40.0884/-74.0383, Manasquan ~40.1188/-74.0462) so events pass the lat/lng feed filter.

### Pattern to add to the "Adding a New Scraper" checklist

Every time a scraper ships for a brand-new venue, the `venues` table row needs THREE things, not just `name + address`:

1. The row itself (name exactly matches the scraper's `VENUE` constant + `VENUE_REGISTRY` entry in route.js)
2. `latitude` and `longitude` (or events get dropped from the home feed and filter dropdown — silent failure)
3. Eventually a photo_url, venue_type, and default_start_time (less critical but used by cards + default-time fallbacks)

Worth considering an auto-geocode step on venue insert (admin form or DB trigger) so future additions don't bite us the same way.

### Files Changed (April 23/24)

| File | Change |
|------|--------|
| `src/components/HeroPiston.js` | Dropped rAF throttle on scroll handler; synchronous `applyScrollState` for 1:1 tracking |
| `src/lib/scrapers/osprey.js` | NEW — Osprey Nightclub custom HTML scraper (~48 events/year) |
| `src/app/api/sync-events/route.js` | Wired Osprey into FAST_SHARD_2 + 6 other integration points |
| `SCRAPERS.md` | Row 21b — The Osprey |
| `HANDOVER.md` | This section |
| Supabase `venues` | 3 new rows (Parker House, Jenks, Osprey) + coords |
| Supabase `events` | 178 rows backfilled with venue_id |

### Tasks closed this session

- #69 Fix hero collapse scroll jump
- #70 Build Osprey Nightclub venue scraper

---

## Session — April 27, 2026 — Artist directory cleanup: kind column, monogram fallback, profile screen polish

### Summary

Three threads in one session:

1. **Data model.** Added `artists.kind` discriminator (`musician` | `event` | `billing`). Backfilled 13 obvious events (trivia, drink specials, sip & shop) and 100 billings (concatenated lineups like "Headliner w/ Opener 1, Opener 2") via two review-first SQL passes. 1118 musicians remain as the default.
2. **Image / monogram fallback.** New `ArtistMonogram` component renders a brand-cohesive duotone gradient + first-letter avatar when an artist has no `image_url`. `ArtistProfileScreen` now also falls back to the artists-table row directly via Supabase when the events array doesn't carry image/bio/genres (fixes profile photos disappearing when entered from My Locals).
3. **ArtistProfileScreen polish.** Dropped bio truncation, shrunk the photo-overlay back button to a 32×32 round icon, replaced genre pills with a small-caps metadata line, made Follow the primary action (orange-filled), demoted Share to a 38×38 round icon-only button.

Plus: admin Artists tab now has a 3-way Musician/Billing/Event `<select>` styled as a colored pill on every row, so the team can re-classify any misclassified row in one click. Backend PUT route accepts the new value through the existing arbitrary-update flow with a fresh enum guard.

### 1. `artists.kind` schema + backfill

**Migration 1** — `add_artists_kind_column`:

```sql
ALTER TABLE public.artists
  ADD COLUMN kind text NOT NULL DEFAULT 'musician'
    CHECK (kind IN ('musician', 'event'));
CREATE INDEX IF NOT EXISTS artists_kind_idx ON public.artists (kind);
```

**Migration 2** — `extend_artists_kind_billing` (later in session):

```sql
ALTER TABLE public.artists DROP CONSTRAINT IF EXISTS artists_kind_check;
ALTER TABLE public.artists ADD CONSTRAINT artists_kind_check
  CHECK (kind IN ('musician', 'event', 'billing'));
```

**Backfill — events (13 rows).** Conservative regex against the existing artists list, all 13 reviewed by hand before UPDATE. Patterns matched: `^\*.+\*$` (asterisk-wrapped names like `*Easter Sip & Shop*`) and a small keyword set (`trivia|karaoke|bingo|bogo|sip & shop|wing night|taco tuesday|burger night|drink special|happy hour`). Notable border case: `*Kegs & Eggs w/ Bullzeye Band*` was flipped to `event` — Bullzeye Band is a real artist nested in the wrapper but extracting it cleanly is manual work for later.

**Backfill — billings (100 rows).** Higher-confidence patterns only, no single-comma matches (would have caught real bands like "Crosby, Stills & Nash"):

- 2+ commas in name (multi-artist comma list)
- `\sw/\s` (slash-with abbreviation — e.g. "Tab Benoit w/ Ghalia Volt")
- `\s(feat\.|ft\.|featuring)\s`
- `\spresents\s` (e.g. "North 2 Shore Presents Hot Mulligan")

Zero false positives on review. ~7 rows are arguably events not billings (drink-special listings, "Open Mic w/ PM Ryder", etc.) — left as billings since both kinds are equally hidden from user surfaces, can be flipped later via the admin toggle.

**Final tallies (prod):** 1118 musician / 100 billing / 14 event.

### 2. ArtistMonogram + image fallback

**`src/components/ArtistMonogram.js`** (NEW). Letter-fallback avatar. Hash-by-name picks one of 8 brand-cohesive duotone gradients deterministically (so each artist gets a stable color forever). Outfit Black initial letter, always-orange (`#E8722A`) accent stripe at the bottom. Two sizes: `sm` (56px round, used in lists) and `lg` (square, fills its container — used in earlier mockups but the profile screen ended up using `sm` at 80×80 instead).

**`src/components/FollowingTab.js`.** My Locals tab list rows now render the monogram in place of the music-note SVG placeholder when `image_url` is missing. Same file also got the regex prefilter (`looksLikeEvent` helper) as a launch-time band-aid for the data-quality issue — slated for replacement by `WHERE kind='musician'` on the server (#106 deferred per Tony, "good enough for launch").

**`src/components/ArtistProfileScreen.js` — fallback fetch.** Earlier symptom: Jonathan Kirschner's profile photo disappeared when entered from My Locals if his upcoming Triumph Brewing show wasn't in the current home feed. Root cause was that `ArtistProfileScreen` derived `imageUrl` exclusively from a scan of the `events` prop. Fix: added a `useEffect` that does a case-insensitive `ilike` lookup on the `artists` table when the events scan didn't supply image/bio/genres. Merge order: events first (covers normal flow), artists-table row as fallback (covers My Locals navigation).

### 3. ArtistProfileScreen polish

Five refinements after Tony reviewed in production:

1. **Title** — kept 28px DM Sans for both image and no-image states. Briefly tried Outfit Black uppercase clamp(32–44px) for the no-image case (magazine layout), reverted same session — too loud.
2. **Bio** — dropped the "...more" / `WebkitLineClamp: 3` truncation. Full bio always renders. Removed the now-unused `bioExpanded` state.
3. **Back button (photo overlay case)** — went from a 14px-padded pill with "Back" label to a 32×32 round icon-only button at `rgba(0,0,0,0.35)`. Swipe-right and browser back are still the primary paths; this stays as the discoverability fallback for desktop.
4. **Genres** — replaced individual rounded-pill chips with a single small-caps metadata line (`ROCK · JAZZ · BLUES · R&B`). Reads as descriptive metadata, not as buttons. Stops competing visually with the action pills.
5. **Action buttons** — Follow is now the primary CTA: orange-filled when not followed, neutral outlined when "Following". Share dropped its label and pill — became a 38×38 round icon-only button next to Follow. Clear hierarchy: one CTA, one utility.

**Upcoming Local Shows** — briefly tried a multi-line editorial layout (date + day stacked left, venue + time stacked right). Tony rejected, reverted to the original single-line `APR 27 ──── Pig & Parrot Brielle` listing.

### 4. Admin Artists tab — 3-way kind selector

**`src/components/admin/AdminArtistsTab.js`.** New `KindToggle` component renders a native `<select>` styled to look like a colored pill (so we get free accessibility, keyboard support, click-outside, and a real menu). Three values:

- `musician` — slate gray fill, no border. Default. Most rows.
- `billing` — indigo/blue tint with subtle border.
- `event` — brand-orange fill + orange border. Pops out visually when scrolling the directory.

Inline-SVG chevron baked into the trigger via `background-image`. New "Kind" column on the desktop row layout (rightmost, 92px wide). On mobile, the pill renders under the artist name only when `kind !== 'musician'`, so the 1118-row musician case stays uncluttered.

Selecting a new value calls the existing `PUT /api/admin/artists` endpoint with `{ id, kind: 'X' }` and re-fetches the list. The endpoint's PUT handler already accepts arbitrary updates; only addition was a new `ALLOWED_KINDS = ['musician', 'event', 'billing']` enum guard alongside the existing `default_category` guard.

### 5. Decision: kind vs. delete

Worth recording for future sessions. Tony asked why we kept misclassified rows as `kind='event'`/`'billing'` instead of deleting them via the existing delete-with-blacklist flow. Decision tree:

- **Kind preserves linked-event references.** Events still display "Sweet Lou and The River Rats with Dabble" as their listed artist — exactly the visual the user wants — without the row showing up in the artist directory or follow surfaces.
- **Reversible in one click.** "DJ Rob Busch" might be a real DJ later; flip kind back. Delete is destructive (loses image, bio, genres).
- **Decoupled from the linked-event decision.** The existing DELETE endpoint forces a per-row choice between hide-events / unlink-events / convert-to-special. Kind avoids that friction for the easy 113-row sweep.
- **Future surfaces.** If we ever want a discoverable "Trivia Nights" or "Karaoke" category that surfaces these as events, kind is the discriminator we need.

For genuinely garbage rows the existing delete + ignored_artists blacklist still applies; kind is the soft-hide for the gray area.

### 6. Open follow-ups (Tony deciding on this tomorrow)

- **Billing-row splitting** — should `*Kegs & Eggs w/ Bullzeye Band*` and the 99 other billings get auto-split into individual artist rows with events relinked, or just stay hidden as billings? Tony's call: hidden is fine for now, events keep the lineup string for display.
- **Ambiguous "X and the Y" names** — the conservative regex deliberately did NOT catch "Hump Day and The Mangos" (could be one band or two). Tony will manually flip these to `kind='billing'` via the admin toggle as he spots them.
- **Front-end filters using `kind`** — task #106 is deferred. Today's regex prefilter in `FollowingTab` covers My Locals; home autocomplete + follow-suggest paths still need migrating to `WHERE kind='musician'`. Not blocking launch.

### Files Changed (April 27)

| File | Change |
|------|--------|
| `src/components/ArtistMonogram.js` | NEW — 56px round / square fill letter-fallback avatar with hash-by-name palette |
| `src/components/FollowingTab.js` | `looksLikeEvent` regex prefilter for My Locals + monogram replaces music-note placeholder |
| `src/components/ArtistProfileScreen.js` | artists-table image fallback via useEffect; bio truncation dropped; back button → icon-only; genre pills → small-caps line; Follow → orange primary; Share → round icon-only |
| `src/components/admin/AdminArtistsTab.js` | New `KindToggle` component (3-way `<select>` styled as pill); new "Kind" column header + cell |
| `src/app/api/admin/artists/route.js` | `ALLOWED_KINDS` enum guard added to PUT handler |
| Supabase migration `add_artists_kind_column` | `kind text NOT NULL DEFAULT 'musician'` + CHECK + index + COMMENT |
| Supabase migration `extend_artists_kind_billing` | CHECK constraint expanded to include `'billing'` |
| Supabase `artists` rows | 13 → kind='event', 100 → kind='billing' (1118 musicians remain default) |

### Tasks closed this session

- #102 Build ArtistMonogram + Path A filter + Magazine no-image layout
- #103 Add artists-table image fallback to ArtistProfileScreen
- #104 Revert ArtistProfileScreen title to 28px DM Sans
- #105 Backfill artists.kind via heuristic (events review pass)
- #107 Admin Artists tab: minimal Musician/Event toggle
- #108 Extend artists.kind to allow 'billing' value
- #109 Backfill artists.kind='billing' via conservative regex
- #110 Replace 2-state toggle pill with 3-state dropdown in admin
- #111 ArtistProfileScreen polish (truncation, back button, shows table, action buttons)

### Tasks still open

- #106 Replace regex filter with kind='musician' across My Locals + autocomplete + follow-suggest (deferred — regex prefilter is launch-adequate)

---

## Session — April 27, 2026 (continued) — Hero/Card waterfall, location filter polish, venues.city, autocomplete fix

Same-day continuation. After the artist-directory cleanup we rolled into launch-prep polish on the home feed, search/filter UX, and venue data normalization. This entry documents the post-artist-directory work in one place.

### 1. Hero + Waterfall — title priority and template image precedence

**`src/lib/waterfall.js`.** Restructured the image waterfall so a linked template's image always wins over the legacy `event_image_url`:

```
custom_image_url
  → (template_id ? tpl.image_url)
  → event_image_url
  → legacy
  → artist
```

Locked vs. unlocked branching dropped — locks now act on the *source* fields, not the resolution order.

**`src/components/HeroSection.js`.** Title priority swapped:

- `titleRaw = event_title (waterfall)` is the primary title.
- `artistRaw = artist_name` becomes the italic subtitle.
- Italic subtitle is hidden whenever `ev.template_id` is truthy (templated events read as the event, not as "X performing at Y").
- CTA shortened "Event Details" → "Details".

### 2. EventCardV2 + SavedGigCard — template-aware artist surfaces

**`src/components/EventCardV2.js`** and **`src/components/SavedGigCard.js`** got matching gates so templated events stop pretending to be artist shows:

- `isTemplated` / `canonicalArtistName` / `hasFollowableArtist` derivations.
- `showArtistSubtitle` now requires `!event.template_id` — kills the alias subtitle on template rows.
- "Follow Artist" button gated on `hasFollowableArtist`. Click follows `canonicalArtistName` (the resolved artist, not the literal event title).
- `handlePopoverFollow` updated to use the canonical name.

### 3. Location filter — X-clear, town-only checkbox, venue.city matching

**`src/app/page.js` — X clear.** Clicking the X in the location input no longer auto-repopulates from GPS. It now clears `locationOrigin`, `locationSuggestions`, `locationCoords`, resets `locationLabel` to `'Current Location'`, and unsets `townOnly`.

**Town-only checkbox.** New `townOnly` boolean state, defaults `false`. Renders a "Only events in [town]" checkbox between the autocomplete dropdown and the radius slider. When checked + `locationOrigin` is set, the home feed filter switches from haversine-radius matching to a three-tier text match:

1. `venue_city` equality (priority)
2. `address` ILIKE
3. venue `name` ILIKE

Otherwise the existing haversine path runs. The `useMemo` deps were updated to include `townOnly` and `locationOrigin`. GPS trigger explicitly sets `setTownOnly(false)` so re-locating breaks the local-town pin. `colorScheme: darkMode ? 'dark' : 'light'` was added to the checkbox so it renders correctly in both modes (was reading as filled in light mode).

**`venues.city` column.** New column on the venues table, backfilled from the address parser, with hand-overrides where the parser failed:

- R Bar — corrected to `1114 Main St, Asbury Park, NJ 07712` (was Belmar address).
- Bar Anticipation, Bakes Brewing, Jacks on the Tracks, McCann's — all overridden to `city='Belmar'` per Tony's "Lake Como/Wall/Manasquan should also be treated as Belmar" rule.
- 10th Ave Burrito — address "801 Belmar Plaza, Belmar NJ 07719" parsed to `city='Belmar NJ 07719'` (no comma between town and state). Corrected to `'Belmar'`.
- Several venues lacked `lat`/`lng` (D'Jais, 10th Ave Burrito, Bakes Brewing, Jacks on the Tracks) so they were filtered out of the home feed by the venue-coords prefilter. Approximate centroids added.

**`src/app/api/events/search/route.js`** projects `venue_city` on each transformed event so the client can use it without a second join.

### 4. Location autocomplete — local-first NJ towns list

**The bug.** Nominatim's relevance ranking falls apart for short queries. Typing "as" returned only "Lindenwold, New Jersey" — no Asbury Park anywhere in its top 10. Re-ranking client-side can't help if the desired match isn't in the response at all.

**The fix.** Curated local list, Nominatim as supplement.

- **`src/lib/njTowns.js`** (NEW). ~80 NJ towns (whole Jersey Shore + major NJ cities) with approximate centroids. `matchNjTowns(query, limit)` does prefix-match-then-substring-match, alphabetical within each tier. Easy to extend — just add to the array.
- **`src/app/page.js` — `fetchLocationSuggestions`.** Local matches now render synchronously (zero debounce, zero network) the moment the user types 2+ characters. Nominatim still fires in the background to fill remaining slots with long-tail towns not in the curated list. Nominatim hits get deduped against local hits by lowercased town name.

Result: "as" → Asbury Park first, "be" → Belmar/Bay Head/Beach Haven, "ma" → Manasquan/Mantoloking/Marlboro/Matawan/Middletown.

### Files Changed (April 27 — continued)

| File | Change |
|------|--------|
| `src/lib/waterfall.js` | Template image wins over legacy `event_image_url`; locked/unlocked branching removed |
| `src/components/HeroSection.js` | Title priority swap (`event_title` primary, `artist_name` italic subtitle); subtitle hidden when `template_id`; CTA text trimmed |
| `src/components/EventCardV2.js` | `isTemplated` / `canonicalArtistName` / `hasFollowableArtist`; subtitle + Follow gated on template_id |
| `src/components/SavedGigCard.js` | Same template/follow gates as EventCardV2 |
| `src/app/page.js` | X clear no longer triggers GPS; `townOnly` state + checkbox; town-aware filter (venue_city / address / name); GPS trigger resets townOnly; checkbox `colorScheme`; local-first autocomplete via `matchNjTowns` |
| `src/app/api/events/search/route.js` | Joins `venues.city`; projects `venue_city` on each event |
| `src/lib/njTowns.js` | NEW — curated NJ towns reference list + `matchNjTowns` helper |
| Supabase `venues` table | New `city` column; backfill + hand-overrides; coords added to D'Jais, 10th Ave Burrito, Bakes Brewing, Jacks on the Tracks |

### Tasks closed this continuation

- #119 ArtistProfileScreen: fetch artist's upcoming events directly
- #120 Fix ArtistProfileScreen events query — drop nonexistent start_time column
- #121 Hero title priority — prefer waterfall event_title over raw artist_name
- #122 Hero: hide alias subtitle when template_id; Waterfall: template image wins
- #131 Location filter: stop auto-repopulating town on X clear
- #132 EventCardV2: hide alias subtitle + Follow button on template-only events
- #133 Location filter: "Only events in this town" checkbox
- #134 SavedGigCard: same template/follow gates as EventCardV2
- #135 Add venues.city + backfill + immediate data fixes (UI build is #82, still pending)
- #136 Location autocomplete: alphabetical prefix-match ranking
- #137 Location autocomplete: local-first NJ towns list

### Tasks still open

- **#82** Admin Venues management tab UI — schema + immediate data fixes shipped today; the actual UI (sortable list, edit modal, geocode button, +Add Venue) is the 2-3 hour build deferred to next session.
- **#83** Image curation Phase 1 — Supabase Storage migration for high-profile artists.
- **#84** Backfill historical orphan events with artist_id + venue_id.
- **#85** White-text-on-orange button sweep.
- **#86** Custom scraper for Asbury Park Boardwalk venue family.
- **#106** Replace regex filter with `kind='musician'` across My Locals + autocomplete + follow-suggest.


---

## Apr 29 session — Mac mini, Mott's Creek, weekend metadata polish

Long mixed-mode session: half infrastructure (Mac mini agent host setup), half product polish (admin UX, contrast, save flow, search), half data work (auto-link sweep, compound-name cleanup, AI Enhance fixes). Full session detail in PARKED.md "Recently shipped — Apr 29" block.

### Highlights

- **Mac mini stood up** as the future 24/7 agent host. SSH + Tailscale working from anywhere. Codebase still on MacBook for daily editing; Mini is the runtime target for slow-tier scrapers and future agent loops.
- **Mott's Creek Bar** scraper shipped — Squarespace JSON pattern, 4 events live. Total scraper count up to ~46. Doyle's Pour House confirmed working (the Apr 28 "iCal export disabled" diagnosis was wrong).
- **Auto-link sweep** for Apr 30 – May 3: 26 of 51 unlinked weekend events now linked via exact-name match against `artists.name` (with normalize). Linked pool 84 → 110.
- **Compound artist name cleanup** for ALL THAT REMAINS, The Flatliners, SongsByWeen, The Tacet Mode — renamed to clean band names with bill text moved to `alias_names`.
- **AI Enhance genre fix**: prompt was using a different genre vocabulary than the form. Now imports canonical `GENRES` from utils.js + adds subgenre→canonical mapping. Genres now actually fill in.
- **AI Image Search lightbox**: click a candidate → confirmation lightbox with current vs. candidate side-by-side. Eliminates accidental swap-on-tap.
- **Save confirmation popover** redesigned to centered modal-card with green check + bigger body text + jet-black Follow CTA.
- **White-on-orange contrast pass**: 11 hits fixed across public site + admin (HeroSection, SpotlightCarousel, ArtistProfileScreen, EventCardV2, page.js Search button, EventPageClient signup CTAs, AdminEventsTab Add Event, AdminLoginScreen, admin header).
- **Search autocomplete** switched from substring-anywhere to word-prefix with stopwords. "an" no longer surfaces "wildmAN" etc.
- **AdminEventsTab** stopPropagation fixes for the Suggest template chip and Category dropdown (both were triggering the row-clickable openEditor by accident). Closed PARKED #12 (stale edit pencils — they were already removed in source; the deploy had stalled on a force-push).

### Next session priorities

1. Push the local `route.js` state — Doyle's Pour House line in FAST_SHARD_1 needs to be uncommented before push (deployed version has it active; local has it commented). Otherwise a future deploy disables a working scraper.
2. Continue Tier 1 weekend artist enrichment: ~30 local artists remaining, per-event manual ✨ click. PARKED #18.
3. Manual link the 25 still-unlinked weekend events. PARKED #19.
4. Cleanup pass: Bakes Brewing duplicate-prefix scraper bug (PARKED #16) + EVENT-kind orphan delete (PARKED #9 + today's 18 orphans) + multi-band bill name pattern (PARKED #17) + auto-create artist guardrail (PARKED #15).


---

## Apr 30 session — EventCardV2 action row redesign (rebalanced + variant A pills)

Focused UX polish session on the event card action row. Iterated through several mockup directions before settling on a left-vs-right balanced layout with a tinted-outline identity pill on the far left and a tight icon cluster on the far right. Also wired the venue-only Event badge into the same save-event handler as the ticket-stub icon, eliminating the orphaned "no Follow Artist" treatment that was making event-only cards (e.g. Bingo Night, Open Mic) feel unbalanced underneath flyer-heavy images.

### What shipped

**`src/components/EventCardV2.js`** — single-file refactor of the action row (199 insertions, 132 deletions, commit `c9b2d5f`).

- **Layout: rebalanced row.** `[identity pill]  ←flex spacer→  [Venue 18px] [Share 18px] [Report 18px]`. Identity pill carries the brand color; the icon cluster is tight (gap 14px) and same-weight neutral so it reads as one balanced utility group rather than three loose buttons + an orphan flag at the far edge.
- **Identity pill = one of three states with identical box dimensions.**
  - `Follow Artist` — when there's a canonical linked artist and the user hasn't followed yet. Plus icon.
  - `Following` — same shape as above but with a checkmark. Toggles back via `onFollowArtist`.
  - `Follow Event` — replaces the previous non-interactive "Event" badge on cards with no canonical artist (template-only, fake-artist `kind='event'` rows). Plus icon. Toggles via `onToggleFavorite?.(event.id)` — the SAME handler the ticket-stub icon at the top of the card uses, so the two controls stay in sync. Mirrors the stub's `setShowFollowPopover` trigger and haptic vibration.
- **Variant A — tinted outline.** All three pill states share the exact same visual treatment: `background: rgba(232,114,42,0.08)` (light) / `0.15` (dark), `border: 1.5px solid #E8722A`, `color: #E8722A`. Only the leading icon differentiates state (plus → checkmark). Symmetric across artist and event-only cards. The earlier solid orange CTA was deemed too distracting; the tinted outline keeps brand presence without competing with card content.
- **Pill height matches pre-redesign card.** Padding `6px 14px` (from `9px 18px`). 14px icon (from 16px). Row height now sits ~28-30px instead of ~38px.
- **Icon cluster.** Venue (map pin), Share (3-dot connect), Report (lucide wavy banner) — all 18px, all `currentColor` so they pick up `#F0F0F5` in dark / `#1F2937` in light. Each gets `title` + `aria-label` since the text labels are gone.
- **Box-sizing parity.** Every pill state has a `1.5px solid #E8722A` border (the unfollowed state previously had `border: 'none'`, making it 3px shorter than the followed/Event variants and visibly out of register).
- **Label clarity.** "Follow" → "Follow Artist" so the CTA explicitly tells you what you're following — useful when scrolling a feed where the artist name above is small.

### What got rejected along the way

- **Solid orange CTA with jet-black text** (Option B v2 from Apr 29). Drew the eye too hard. Tony: "the orange is too distracting. it take away from the event card."
- **Magic Patterns single-row generation.** Returned 2-row stacked variations for our brief; fell back to direct mockup design.
- **3-row stacked variations** (button-heavy designs from earlier in session). Wanted single-line balance, not visual density.
- **Variant B (neutral pill, orange icon only)** and **Variant C (text + icon, no pill)** — both shown as alternatives. Tony picked A — pill present but quiet.

### Files changed

| File | Change |
|------|--------|
| `src/components/EventCardV2.js` | Full action row refactor: rebalanced layout, three-state identity pill, variant A tinted outline, Follow Event wired to `onToggleFavorite` for ticket-stub sync |

### Tasks closed this session

- #25 Build rebalanced action row in EventCardV2
- #26 Wire Event badge to save-event action
- #27 Apply variant A tinted outline to follow pills

### Tasks still open

- **#15** Draft VENUE_MANAGEMENT.md skill doc (in_progress)
- **#17** Migrate Agent_SOP content + delete file
- **#19** Housekeeping — fold transient docs into HANDOVER
- **#24** Build Mott's Creek Bar scraper (in_progress — Apr 29 launched 4 events; verify pattern is stable)
- Carryover priorities from Apr 29: Tier 1 weekend artist enrichment (~30 remaining, PARKED #18), manual link 25 still-unlinked weekend events (PARKED #19), Bakes Brewing dedupe (PARKED #16), EVENT-kind orphan delete (PARKED #9), compound artist name pattern (PARKED #17), auto-create artist guardrail (PARKED #15), image curation Phase 1 (PARKED #2).

### Notes for next session

- Watch real cards in production for a day before iterating further on the pill — variant A might still feel "too there" once it's everywhere in the feed, or it might recede correctly. Don't preemptively tune.
- The `onToggleFavorite` wiring on Follow Event means saved-state propagates between the bottom pill and the top ticket stub on a single click. If that ever feels redundant (two controls for the same action visible at once), the cleaner move is to hide the ticket stub when `!hasFollowableArtist` — but only after confirming the bottom pill is discoverable enough on its own.
- The "Event" badge is gone — every venue-only card now has a primary CTA instead of a passive label. Watch for analytics on Follow Event clicks; if they're materially below Follow Artist clicks the pattern's working as intended (artists are the higher-intent target), if they're 0 we may be hiding the ticket stub redundantly.


---

## Apr 30 session — continued (admin venues CRUD, pill iteration to neutral, town clusters, image search)

Long second half of Apr 30. Major shipped work in three workstreams: (a) the action-row pill went through three more iterations and landed on a Soft Fill to Ghost neutral-palette treatment that's the inverse of the morning's variant A; (b) the entire Admin Venues management tab (PARKED #1) shipped end-to-end with sub-tabs, full CRUD, geocode button, and image search; (c) infrastructure — town clusters, ZIP-aware Wall Township documentation, global italic placeholder, AGENT_ARCHITECTURE.md.

### 1. Action row pill — final design (Soft Fill to Ghost, neutral palette)

Iterated three times after the morning's variant A landed. The chain:

1. **Variant A (morning)** — orange tinted outline, same shape both states. Tony: "the orange is too distracting."
2. **Direction A (afternoon)** — outlined neutral pill (gray border, transparent bg). Briefly added a SAVE/SAVED caption under the ticket stub to disambiguate the dual-control on artist cards, then dropped it ("remove Save. i dont like it.").
3. **Soft Fill to Ghost (zinc palette)** — Gemini's recommendation that the visual hierarchy was BACKWARD. Once followed, the action is complete and the button should recede, not advance. Unfollowed gets the soft solid fill (presence, invites click); followed becomes a ghost outline (recedes). This was the conceptual breakthrough — the prior 4 iterations had all been fighting the inverse hierarchy.
4. **Soft Fill to Ghost (neutral palette + WCAG fix)** — initial zinc-400/zinc-600 followed-state colors failed AA contrast (~3:1). Bumped to zinc-500 light / zinc-400 dark (clean AA). Then swapped zinc → Tailwind `neutral` for true achromatic gray (zinc has a tiny cool blue undertone). Bumped unfollowed bg one shade darker (#E5E5E5) so it doesn't merge with white cards. Added hover state via React `onMouseEnter`/`onMouseLeave` flags (no CSS :hover available with inline styles).

**Final values:**

| State | Light bg | Light text | Dark bg | Dark text | Border |
|---|---|---|---|---|---|
| Unfollowed (`Follow Artist`/`Save Event`) | `#E5E5E5` | `#171717` | `#262626` | `#F5F5F5` | none |
| Unfollowed hover | `#D4D4D4` | `#171717` | `#404040` | `#F5F5F5` | none |
| Followed (`Following Artist`/`Saved Event`) | transparent | `#737373` | transparent | `#A3A3A3` | `#D4D4D4` light / `#404040` dark |

Verb-consistent labels: `Follow Artist` ↔ `Following Artist` for the artist subscription pill, `Save Event` ↔ `Saved Event` for the bookmark pill on event-only cards. Bookmark semantics fit events; `Follow` stays reserved for artist subscription.

The hierarchy now reads correctly: active CTA has weight, completed action recedes. Both pills share identical visual language across artist and event-only cards. Brand orange stays exclusively on the timestamp, divider, ticket stub, and `Read More` — earning attention where it belongs without competing with the action row.

### 2. Admin Venues management tab (PARKED #1 — closed)

End-to-end CRUD for the `venues` table. Same skill doc PARKED #1 has been pinned to since Apr 25 launch-prep. Shipped as a parent `AdminVenuesTab` with two sub-tabs (Directory + Scrapers) sharing the existing `useAdminVenues` hook.

**Sub-tab structure.** The previous `AdminVenuesTab.js` was actually the scraper-health view despite the name. Relocated to `AdminVenuesScrapers.js` (zero behavior change, pure rename). New `AdminVenuesDirectory.js` for the CRUD. Parent wrapper handles the sub-tab toggle with sessionStorage persistence + URL hash deep-linking (`#directory`, `#scrapers`). Pattern mirrors `AdminEnrichmentTab` Backfill/Triage.

**Directory features.**
- List view: search by name/city/address, sort by name/city/scraper-fed-first, "+ New Venue" button, indicator chips per row (📍 has-coords, 📷 has-photo, scraper-fed badge).
- Edit modal: name (required, unique-checked), city, slug (auto-suggested from name on create), address, lat/lng, website, photo_url, venue_type (datalist of common values), default_start_time, tags (comma-separated → array).
- **Geocode button** — calls Nominatim via server-side proxy (`/api/admin/geocode`), fills lat/lng on success rounded to 6 decimals. 8s timeout, US country bias.
- **Find images button** — calls Serper Images via server-side proxy (`/api/admin/venues/image-search`). Filters out unstable CDN hosts (FB, IG, Google thumbnail cache, Bing, DuckDuckGo, Pinterest) — those URLs reliably break within weeks. Returns up to 6 candidates with thumbnail, source domain, dimensions. Deny-list on the server so unstable URLs never reach the UI.
- **Lightbox preview** — clicking a candidate opens a centered overlay (z-index 300, sits above edit modal) showing the candidate at full size with a small "Currently:" thumbnail of the existing photo for comparison. Use this image / Cancel buttons. Backdrop click stopPropagated so it doesn't dismiss the parent modal. Source domain caption visible on every thumbnail in the grid.
- **Lightbox prev/next navigation** — chevron buttons absolute-positioned over the preview (40px round, semi-transparent, only when 2+ candidates). Keyboard shortcuts: Left/Right arrow keys cycle, Esc closes. Position chip in header reads "X of N" with orange accent. Both directions wrap at edges.
- **Delete with FK pre-check** — server checks events / event_templates / event_series before allowing delete; returns structured 409 with counts so admin sees "Cannot delete — referenced by 12 events. Reassign or delete those first."

**API routes.**
- `/api/admin/venues` (extended) — POST (full payload, supports legacy quick-create from queue triage), PUT (whitelist-sanitized + cross-row name uniqueness check), DELETE (FK pre-check).
- `/api/admin/geocode` (new) — POST `{address}`, returns `{latitude, longitude, display_name}`. Nominatim-backed. 8s timeout. US country bias.
- `/api/admin/venues/image-search` (new) — POST `{name, city}`, returns `{candidates, query, rejectedUnstable}`. Serper-backed. Filters by `min-width` 300px and unstable-host deny-list.

**Hook surface.** `useAdminVenues` extended with `fetchVenuesFull`, `createVenue`, `updateVenue`, `deleteVenue`, `geocodeAddress`, `searchVenueImages`. Existing minimal `fetchVenues` preserved for any caller that wants the lean payload (admin/page.js's `fetchAll` switched to `fetchVenuesFull`).

### 3. Address QC pass (5 fixes shipped, 25 venues identified for follow-up)

Ran a comprehensive QC against all 72 venues. Findings tiered by severity:

- **Tier 1 (8 venues)** — completely missing address. Manual research needed. Tony to handle via Directory tab when he has time.
- **Tier 2 (3 venues)** — suspect/wrong data. "Asbury Park, New Jersey" name needs delete-or-rename decision; R Bar coords were stale Belmar latitudes (40.17 instead of 40.22); The Saint longitude was truncated to `-74` exactly (whole degree).
- **Tier 3 (3 venues)** — incomplete address (town/state only, no street). The Crab's Claw Inn, The Roost, Water Street Bar & Grill.
- **Tier 4 (3 venues)** — malformed addresses (missing commas). 10th Ave Burrito, ParkStage, Reef & Barrel.
- **Tier 5 (14 venues)** — missing coordinates, geocodable from existing address. Click-by-click in the Geocode button.
- **Tier 6 (5 venues)** — intentional `venues.city` overrides for Wall Township / Lake Como venues that operate as Belmar. Confirmed correct, no fix needed.

**SQL fixes shipped (Tier 4 + R Bar/Saint coord nullification):** added missing commas to the 3 malformed addresses; nulled out R Bar and The Saint coords so the Geocode button can refill them with accurate Nominatim values. Five rows fixed in one execute_sql.

### 4. Town clusters and Wall Township postal geography

New `src/lib/townAliases.js` — defines Jersey Shore "social" clusters that group neighboring municipalities locals treat as one area. Four clusters: Belmar (+ Lake Como, Wall Township), Asbury Park (+ Bradley Beach), Manasquan (+ Sea Girt, Brielle, Wall Township), Spring Lake (+ Spring Lake Heights, Wall Township).

**Wall Township is intentionally a member of three clusters** — it has no ZIP code of its own and shares ZIPs with neighboring boroughs. This isn't arbitrary social mapping; it's literal postal geography. The file's docstring includes the full ZIP→post-office reference table from Tony so admins can deterministically choose the correct `venues.city` for new Wall Township venues by reading the ZIP code in the address (07719 → Belmar, 08736 → Manasquan, 07762 → Spring Lake / Spring Lake Heights, etc.).

`getTownCluster(name)` is the helper. Many-to-many aware — searching `Wall Township` returns the union of all three clusters (broad net for locals searching directly), searching `Belmar` returns just the Belmar cluster, searching `Lake Como` also returns the Belmar cluster (cluster-member reverse lookup).

`src/app/page.js` townOnly filter updated to use cluster expansion instead of literal `venue_city === selectedTown` equality. Existing manual `venues.city` overrides (Bakes Brewing, Bar Anticipation, etc. set to `Belmar` despite Wall/Lake Como addresses) continue to work — the alias map is additive.

**Sanity-checked against live venue data:** Belmar cluster matches 10 venues, Asbury Park 15, Manasquan 8, Spring Lake 2. Numbers align with mental model.

### 5. Global italic placeholder

One-rule fix in `src/app/globals.css`: `input::placeholder, textarea::placeholder, select::placeholder { font-style: italic; opacity: 0.55; }`. Applies to every form across the app — Venue Directory, Event Edit Modal, Artist Edit Modal, queue triage, search inputs. Color is inherited (no override) so it adapts to whatever surface the input is on; opacity + italic combination makes the distinction unmistakable. Existing per-component overrides like `.filter-search-input::placeholder` continue to take precedence by specificity.

### 6. AGENT_ARCHITECTURE.md (new doc)

Captured the planned hybrid local-plus-Claude autonomous agent setup as `AGENT_ARCHITECTURE.md`. Three agents (Maintenance, QC, Marketing), Mac mini host with Ollama + Qwen2.5-Coder 32B and 14B, Claude Sonnet via Max subscription for marketing (no incremental cost), Supabase as shared state, Claude Agent SDK as orchestration. Phased rollout: Phase 1 = Maintenance agent against PARKED #18 (Tier 1 weekend artist enrichment), Phase 2 = QC nightly report, Phase 3 = Marketing draft queue (human-approved before posting), Phase 4 = cross-agent feedback loops. Doc cross-referenced from DOCS_INDEX.md as Tier 5 (active plan) — promotes to Tier 2 (system reference) once running stably.

### Files Changed (Apr 30 continued)

| File | Change |
|------|--------|
| `src/components/EventCardV2.js` | Pill states migrated through 3 designs; final = Soft Fill to Ghost on Tailwind neutral palette with hover handlers |
| `src/components/admin/AdminVenuesTab.js` | Rewrote as parent wrapper with Directory/Scrapers sub-tabs + sessionStorage + URL hash persistence |
| `src/components/admin/AdminVenuesScrapers.js` | NEW — relocation of prior scraper-health view |
| `src/components/admin/AdminVenuesDirectory.js` | NEW — full CRUD + geocode button + image search + lightbox + nav |
| `src/hooks/useAdminVenues.js` | Added fetchVenuesFull, createVenue, updateVenue, deleteVenue, geocodeAddress, searchVenueImages |
| `src/app/api/admin/venues/route.js` | POST expanded for full payload, PUT whitelist-sanitized + name uniqueness, DELETE with FK pre-check |
| `src/app/api/admin/geocode/route.js` | NEW — Nominatim proxy |
| `src/app/api/admin/venues/image-search/route.js` | NEW — Serper Images proxy with unstable-host deny-list |
| `src/app/admin/page.js` | Pass new hook methods to AdminVenuesTab; fetchVenues call sites switched to fetchVenuesFull |
| `src/lib/townAliases.js` | NEW — town cluster map + ZIP→post-office reference table |
| `src/app/page.js` | townOnly filter expanded to use getTownCluster instead of literal equality |
| `src/app/globals.css` | Global italic + 55% opacity placeholder rule |
| `AGENT_ARCHITECTURE.md` | NEW — hybrid agent architecture plan |
| `DOCS_INDEX.md` | Added AGENT_ARCHITECTURE.md entry under Tier 5 |
| Supabase `venues` rows | 5 SQL fixes: 3 malformed addresses + R Bar/Saint coord nullification |

### Tasks closed this continuation

- #28 Update HANDOVER.md with action-row redesign session
- #29 Mock up labeled stub + neutral pill direction
- #30 Apply Direction A — outlined neutral pill + labeled stub
- #31 Draft AGENT_ARCHITECTURE.md
- #32 Verify current venues table schema
- #34 Rename AdminVenuesTab → AdminScrapersHealthTab (actually became sub-tab restructure)
- #35 Build new AdminVenuesTab CRUD component
- #36 Extend useAdminVenues hook for CRUD
- #37 Add venues CRUD API endpoints
- #38 Wire Venues tab into admin nav
- #39 End-to-end verify venues CRUD
- #40 Apply Soft Fill to Ghost pills with WCAG contrast fix
- #41 QC check all venue addresses
- #42 SQL fix Tier 4 + R Bar + The Saint
- #43 Build Geocode button in Directory edit modal
- #44 Switch follow pills to neutral palette + hover states
- #45 Build town alias clusters
- #46 Build venue image search button
- #47 Filter unstable hosts + add lightbox preview
- #48 Apply global italic placeholder style
- #49 Add navigation to image lightbox
- **PARKED #1 closed.** Admin Venues management tab shipped end-to-end.

### Tasks still open

- **#15** Draft VENUE_MANAGEMENT.md skill doc (in_progress) — should incorporate the town-cluster + ZIP-aware Wall Township pattern when next picked up.
- **#17** Migrate Agent_SOP content + delete file
- **#19** Housekeeping — fold transient docs into HANDOVER
- **#24** Build Mott's Creek Bar scraper (in_progress — Apr 29 launched 4 events; verify pattern is stable on a second cron run)
- Carryover: Tier 1 weekend artist enrichment ~30 remaining (PARKED #18), 25 still-unlinked weekend events (PARKED #19), Bakes Brewing dedupe (PARKED #16), EVENT-kind orphan delete (PARKED #9), compound artist name pattern (PARKED #17), auto-create artist guardrail (PARKED #15), image curation Phase 1 (PARKED #2 — launch-blocking).

### Manual follow-up Tony is handling solo

- **Tier 1 venues** (8 with no address) — research one by one via the Directory tab.
- **Tier 2 venues** (3 suspect rows) — investigate "Asbury Park, New Jersey" (delete-or-rename), Geocode R Bar + The Saint via the new button.
- **Tier 3 venues** (3 incomplete) — fill in street addresses for Crab's Claw Inn, The Roost, Water Street.
- **Tier 5 venues** (14 missing coords) — Geocode button click pass.
- **Top 15 high-volume venues** — manual photo research via the new Find Images button. Stone Pony / Wonder Bar / Bar A / Tim McLoone's etc. cover ~70% of event flow.

### Notes for next session

- Don't preemptively iterate the pill again. The Soft Fill to Ghost pattern shipped; let it bake in production for a week and gather usage signal before another design pass. Watch the Following/Saved click rate — if users tap the ghost frequently, it's reading as "click to unfollow" rather than "completed action," and a copy/icon tweak (not redesign) may be warranted.
- The town clusters are conservative for now — only 4 clusters covering today's coverage area. Expansion candidates noted in `townAliases.js` docstring: Farmingdale, Howell, Neptune, Brick. Add when there are venues to cluster.
- Image curation Phase 1 (PARKED #2) is the real long-term answer to image stability. The Find Images button + unstable-host deny-list is the second-best defense; saves to `photo_url` are still pointing at third-party CDNs that we don't control. Phase 1 mirrors chosen images to Supabase Storage so lifetime is fully ours.
- The Mac mini agent loop (Phase 1 of AGENT_ARCHITECTURE) is the natural next big workstream. Concrete first move: install Ollama, pull Qwen2.5-Coder 32B, write a Node script that loops through unenriched weekend artists and calls AI Enhance against the local model. Compare to Claude output. If quality matches, the whole architecture is viable on the existing hardware.


---

## May 1 session — bulk-enrich queue, pill polish, data integrity hardening

Long pre-launch session focused on building the enrichment review pipeline that closes the lock-bypass class of bug + actually unblocks the 446-artist bare-bio backlog. Plus an iteration cycle that landed the EventCardV2 pill on its final pure-ghost-uppercase-tracked-label form, a canvas-vs-card visual pass for the home feed, and a swarm of data integrity fixes triggered by a DJ Bluiz overwrite incident.

### 1. DJ Bluiz incident + the two bugs it surfaced

Tony reported that DJ Bluiz had `is_human_edited.bio = true` set as a per-field lock, but the bio had been overwritten with LLM-generated hedge text ("DJ Bluiz does not appear in available data; closest matches are DJ Bliss…"). The investigation surfaced **two independent bugs** that needed separate fixes.

**Bug 1: enrich-backfill bypasses per-field locks.** The route's gate was `canWriteBio = missing.includes('bio')` — checking a stale `missing_fields` array computed upstream by `enrichmentPriority.js` before the row entered the queue. If an admin set `is_human_edited.bio = true` between the priority scan and the actual write, the gate didn't notice and the bio got clobbered. **Fix:** added a write-time `isFieldLocked` helper in `src/app/api/admin/enrich-backfill/route.js` that re-checks the live pre-write snapshot (`is_locked` row-level, `is_human_edited` legacy boolean, or `is_human_edited.<field>` per-field jsonb). ANDs into `canWriteBio` / `canWriteImage` / `canWriteGenres` so the lock is honored even if the priority queue is stale. Mirrors the helper pattern in `enrichArtist.js`.

**Bug 2: waterfall favored stale artist snapshot over template.** Reading `src/lib/waterfall.js`, the bio resolution had a `humanEdited ? snapshot : template` branch that flipped the priority — when an event was `is_locked` or `is_human_edited`, the waterfall preferred the EVENT'S `e.artist_bio` (denormalized snapshot taken at last sync) over `tpl.bio` (the template's curated value). The intent was "humans set this directly," but `e.artist_bio` is NEVER a human override — that's `e.custom_bio` (Tier 0). The actual per-event human override already won; treating the snapshot as a human override gave a stale/bad artist row priority over admin-curated templates. **Fix:** flattened the bio waterfall to `custom_bio → (template_id ? tpl.bio) → e.artist_bio → tpl.bio → artist.bio`, mirroring the image waterfall pattern. After the fix, six DJ Bluiz events with both `template_id` and `is_locked` (Apr 24 – May 29) immediately rendered the correct template bio instead of the bad artist snapshot.

The bigger lesson here: there are likely OTHER write paths in the codebase that have the same lock-bypass shape as enrich-backfill. The `/api/admin/enrich-queue` endpoint, future cron-triggered enrichment, and any agent loop we eventually add should all be audited against the `isFieldLocked` pattern.

### 2. EventCardV2 pill — final pure-ghost form

The pill went through two more iterations after the Apr 30 Soft Fill to Ghost (neutral palette) landed. Each one was Tony catching a real legibility issue:

**First iteration — verb consistency + bold parity.** The unfollowed pill said "Follow Artist" but the followed said "Following Artist" — verb mismatch between the two states. AND the followed state used font-weight 500 while unfollowed used 600, making the followed pill blend into the surrounding bio prose. **Fix:** unified to verb-consistent `Follow Artist` ↔ `Following Artist` and `Save Event` ↔ `Following Event` (event pill rebranded from `Save` to `Follow` to keep the mental model unified). Bumped followed font-weight from 500 to 600 to match unfollowed; checkmark strokeWidth 2.5 → 3 to match the plus icon. Recede happens via color only.

**Second iteration — pure ghost (no chrome).** Tony decided the pill chrome itself was unnecessary — the icon + verb already carry the affordance. **Fix:** removed background, border, padding entirely. Aggressive CSS reset (`appearance: none; -webkit-appearance: none; box-shadow: none; outline: 0; padding: 0; margin: 0`) to defeat Chrome/Safari user-agent button styling that was leaking through as a faint pill outline. Color forced via `!important` so dark-mode color-scheme overrides don't hide the text. Cursor-pointer is the only hover signal — no underline, no bg pill, no chrome ever appears.

**Third iteration — small uppercase tracked label typography.** Tony noticed the followed text "Following Artist" was reading as another sentence in the bio's column rather than as a UI element — bold lowercase prose looks identical to bold lowercase UI. **Fix:** typography shifted to label pattern: `font-size: 11px`, `text-transform: uppercase`, `letter-spacing: 0.08em`, `font-weight: 700`. Same in both states. `+ FOLLOW ARTIST` / `✓ FOLLOWING ARTIST` now reads as a UI label / status indicator, classified as interactive control rather than narrative content. Same pattern as the admin form labels (`PHOTO URL`, `ADDRESS`).

The pill is at its final form. Color recedes from near-black/near-white (unfollowed) to mid-gray (followed). Icon swaps plus → checkmark. Text label uppercases to small-caps. Zero chrome. This is the version to leave alone and watch in production for a week before any further iteration.

### 3. Bio thresholds + LLM prompt tuning

Cards were showing Read More on every bio because the previous prompts targeted 250 chars and EventCardV2 only rendered ≤150 inline. Tightened both ends.

**LLM prompts (`src/lib/aiLookup.js`, `src/app/api/admin/ai-enhance/route.js`, `src/app/api/admin/enrich-probe/route.js`):** `BIO_MAX_CHARS` now 200 (was 250). Both MUSICIAN and VENUE_EVENT prompt branches updated to "Maximum 200 characters" + "1-2 complete sentences" + explicit "if you would exceed 200, rewrite shorter" instruction. Stronger hard-limit warning so the LLM doesn't try to negotiate the cap. ai-enhance was already at 150 chars for events; bumped to 200 too for consistency.

**Frontend (`src/components/EventCardV2.js`):** new `SHORT_BIO_LIMIT = 250` constant. Bios at or below 250 chars render full text inline with no `-webkit-line-clamp` and no Read More button. Bios over 250 keep the existing 3-line clamp + Read More toggle. The 50-char buffer above the prompt target absorbs LLM responses that occasionally run slightly over.

### 4. Canvas vs card visual pass

Tony reported feed cards "blending together" while scrolling — white-on-white surfaces with no visible boundary between cards. Fixed with the canvas-vs-card pattern.

- **Page bg:** `LIGHT.bg` shifted from `#F7F5F2` (warm beige, ~3% darker than white — too subtle to read as a canvas) to `#F5F5F5` (Tailwind neutral-100, true achromatic gray).
- **Card border:** `borderColor` light mode flipped from `#F3F4F6` (lighter than the OLD page bg, edge disappeared) to `#E5E5E5` (neutral-200) — visible hairline against the gray page.
- **Corner radius:** 12px → 16px (rounded-2xl).
- **Feed gap:** 8px → 24px first pass felt airy → 16px settled value. Cards still read as discrete units, feed no longer feels stretched.

Dark mode untouched — already had clean `#0D0D12` page vs `#1A1A24` card separation.

**Card top + bottom unified.** The expanded section (image, bio, action row) used a slightly different bg (`#F9FAFB` light / `#14141E` dark) plus a `borderTop` divider against the header (time/title/venue). Tony noted this made the card feel like two glued halves. **Fix:** `expandedBg = cardBg` so the surface is uniform top-to-bottom, dropped the heavy divider. Then re-added a much subtler hairline at `rgba(0,0,0,0.08)` light / `rgba(255,255,255,0.05)` dark — about 30-40% as visible as the outer card border. Reads as a structural hint between header and action row without splitting the card.

### 5. Bulk-enrich review queue — Phases 1–3 shipped end-to-end

The biggest single workstream. Closes the DJ Bluiz incident class structurally: every automated enrichment proposal goes through admin review BEFORE writing to the live artist row.

**`pending_enrichments` table** (Supabase migration `create_pending_enrichments_table`). Columns: `proposed_bio / proposed_image_url / proposed_image_candidates / proposed_genres / proposed_vibes / proposed_kind / proposed_is_tribute`, source-tracking (`source / llm_model / bio_source / image_source`), workflow state (`status` enum: pending/approved/rejected/archived/error, `error_message`, `notes`), audit columns (`created_at / reviewed_at / reviewer`). Partial unique index `(artist_id) WHERE status = 'pending'` enforces one-pending-row-per-artist; approved/rejected rows accumulate as audit trail. RLS enabled, admin-only via service-role key.

**Five new API routes:**

- `POST /api/admin/bulk-enrich` — accepts up to 10 artist IDs per call, fetches each artist + their next upcoming event for venue/city context, calls `aiLookupArtist` with `autoMode: true`, upserts proposals into `pending_enrichments`. 400ms throttle between LLM calls (matches enrich-backfill pattern). Per-artist try/catch — failures recorded as `error` rows in the queue so the UI surfaces them. Sync, ~50s for 10 artists.
- `GET /api/admin/pending-enrichments?status=pending&limit=50` — returns queue rows with each pending proposal joined to its current artist state (artists table — bio, image_url, genres, vibes, kind, is_locked, is_human_edited). Drives the side-by-side current-vs-proposed comparison UI in one fetch.
- `POST /api/admin/pending-enrichments/[id]/approve` — promotes a pending proposal to the live artist row. Whitelists fields (bio / image_url / genres / vibes / kind / is_tribute), normalizes `proposed_kind` from LLM uppercase (MUSICIAN/VENUE_EVENT) to schema-allowed lowercase (musician/event/billing) via the new `KIND_NORMALIZE` map (caught at deploy when first approve attempt hit `artists_kind_check` constraint violation), flips per-field `is_human_edited` locks for every field that was written, records `bio_source` / `image_source` / `image_candidates` for provenance. Optional `override.image_url` body lets the lightbox image-swap take effect on approve. Marks queue row `status='approved'` with `reviewed_at` + `reviewer`.
- `POST /api/admin/pending-enrichments/[id]/reject` — marks queue row `rejected`, leaves artist row untouched. Optional `notes` body for audit context.
- `GET /api/admin/bare-artists?limit=10` — returns next priority batch for the queue's "Run next 10" button. Filters: `bio IS NULL OR ''`, `kind = 'musician'`, `is_locked != true`, not already in `pending_enrichments` with `status = 'pending'`. Sorts soonest-upcoming-event first, no-event artists alphabetically last. Returns name + next_event_date + next_event_venue + next_event_city for each.

**UI: Queue sub-tab inside `AdminEnrichmentTab`.** Third sub-tab alongside Backfill and Triage. Persists choice via sessionStorage + URL hash deep-link (`#queue` / `#triage` / `#backfill`) — fixes the bug where opening the artist edit modal from a queue row and returning would land back on Backfill. `QueueView` component holds the queue state, runs the bulk-enrich loop on "Run next 10" (calls bare-artists then bulk-enrich in sequence, ~50s while the LLM works), refetches the queue on every action. Status filter pills: Pending / Approved / Rejected / Errors. `QueueRow` renders a header (artist name + status badges + timestamp), side-by-side `CompareColumn` blocks (CURRENT artist data on left, PROPOSED LLM output on right with orange tint), and a footer with Open Artist / Reject / Approve buttons. Errors get a red ERROR badge with code-block error message. Rows flagged `needs_review` get a yellow REVIEW CAREFULLY badge.

**Image lightbox in the queue.** Click any proposed thumbnail → centered overlay (z-index 300) at full size with prev/next chevrons across `proposed_image_candidates` array, "X of N" position chip, "Use this image" button that stores per-row `chosenImages[item.id]` override. Approve handler passes the chosen URL as `override.image_url` so the swap commits without separate API call. Same pattern as the venue Find Images lightbox.

**Approve flow — kind normalization fix.** First production approve attempt failed with `new row for relation "artists" violates check constraint "artists_kind_check"`. aiLookup emits `kind` as uppercase per prompt contract; `artists.kind` CHECK constraint requires lowercase. **Fix:** added `KIND_NORMALIZE` map (`MUSICIAN → musician`, `VENUE_EVENT → event`, plus lowercase passthrough) and `normalizeKind` helper. Field-mapping loop runs through it before writing kind; unrecognized kinds get silently dropped instead of failing the whole approve so other fields (bio, image, genres) still write.

### 6. kind-classification cleanup — 21 venue-event rows + EventCardV2 respect

Continuation of the Apr 27 113-row reclassification work. 21 more artist rows that should be `kind='event'` instead of `kind='musician'`:

**First batch (15 rows)** — Karaoke, TRIVIA: FRIENDS, Cinco de Mayo Celebration, Happy Memorial Day, Easter Brunch, BAR A's Saturday Night Dance Party, 2026 Summer Season Opening Party, 2026 Opening Party Start 2PM (long compound name), An Opera Celebration, Soup Can Magazine 5 Year Canniversary Party, Aubrey O'Day's Singalong, Maggie party 25-30, Summer House Finale Viewing Party, **Pre-Summer Happy Hour Begins**, Chris and Alexa Party. Reclassified via SQL.

**Second batch (6 more rows from over-500 bio audit):**
- Reclassified to event: AutismMVP Foundation's 9th Annual Brewing Awareness, OFF SITE: Allaire Beer Run.
- Bios cleared (so they re-enter bulk-enrich queue under the new 200-char prompt): Alan Gross, Eddie Testa Band: Classic Hits Of Summer, REPRISE - Recreating Iconic Phish Shows, We May Be Right (Billy Joel Tribute). All four had scraper-junk bios ("21 AND OVER ADMITTED DOORS 7:00 PM..." / "Happy Hour 3pm-6pm $6 house wines...") — clearing them puts them back in the bulk-enrich queue as bare.

**EventCardV2 `hasFollowableArtist` now respects kind.** Was `!!(event.artist_id && canonicalArtistName)`. Updated to also exclude `kind='event'` and `kind='billing'` so even when an event has `artist_id` set pointing to a now-event-classified row, the card renders with Save Event instead of Follow Artist. Without this, the SQL reclassification alone wouldn't change card behavior.

**Events search API projects `artists.kind`.** Was missing from the Supabase select string in `/api/events/search/route.js` — the frontend kind check would have always evaluated `undefined`. Added.

### 7. Just Bob events linked + alias cleanup

Tony curated the Just Bob artist row, but his May 1 event card still rendered as event-only because none of the 6 Just Bob events had `artist_id` set. The Apr 29 auto-link sweep was a one-shot SQL pass — events scraped after that sweep don't get retroactively linked. Linked all 6 via SQL (`UPDATE events SET artist_id = ... WHERE artist_name IN ('Just Bob', 'Just Bob Outside')`). Added `Just Bob Outside` to `alias_names` on the artist row so future scraper hits with that variant auto-link via the existing alias-matcher.

Worth noting for next session: this auto-link gap will keep biting until there's a recurring auto-link cron or a trigger on artist insert/update that re-scans matching events.

### 8. Artist edit modal — row-level lock toggle in footer

Tony's queue → Open Artist → edit → approve loop was missing a row-level lock step (the `is_locked` toggle is only in the directory list view, not inside the edit modal). Added a "🔒 Locked / 🔓 Unlocked" toggle to the modal — initially in the header next to Auto-Fill with AI, then moved to the footer between Save Draft and Approve & Publish per Tony's preference. Click toggles `is_locked` + flips per-field `is_human_edited` locks for all populated fields, persists immediately via PUT `/api/admin/artists`. Independent of the form save — locking doesn't require Approve, and Approve doesn't auto-lock.

### 9. Artist Profile screen — upcoming shows row reorder

Three-column layout went from `DAY DATE | VENUE | TIME` to `DAY DATE | TIME | VENUE`. Time bumped from 64px right-aligned to 80px left-aligned (no longer flush to right edge). Reads as `WHEN | WHERE` with the time clustered into the "when" group. Visually scans like a tour schedule.

### 10. Bio audit — the launch backlog reality check

Cross-table audit revealed the actual scale of the enrichment task:

- **Empty bios: 446 musicians.** The bulk-enrich queue's target population. Significantly larger than the 172-bare number we were working from earlier sessions.
- **Bios under 150 chars: 270.** Render inline with no Read More.
- **Bios 150-200: 103.** Render inline (under the 250 frontend threshold).
- **Bios 200-250: 154.** Render inline.
- **Bios 250-350: 97.** Show Read More on cards.
- **Bios 350-500: 61.** Show Read More.
- **Bios over 500: 38 → 30 after today's cleanup.** Show Read More.

The 446 bare artists are the actual launch backlog. The bulk-enrich queue + 200-char prompt is the path through it. ~17 batches of "Run next 10" to clear if quality holds.

### Files Changed (May 1)

| File | Change |
|------|--------|
| `src/components/EventCardV2.js` | Pill final form: pure ghost + small-uppercase-tracked typography. SHORT_BIO_LIMIT 250. hasFollowableArtist respects kind=event/billing. Card surface unified (expandedBg = cardBg) + subtle hairline divider. Border bumped 12→16, borderColor → #E5E5E5 |
| `src/lib/waterfall.js` | Bio waterfall flattened — template_id beats e.artist_bio regardless of lock |
| `src/lib/aiLookup.js` | BIO_MAX_CHARS 250 → 200; prompt branches updated |
| `src/app/api/admin/enrich-backfill/route.js` | Added isFieldLocked write-time guard + canWrite gates |
| `src/app/api/admin/ai-enhance/route.js` | 150 → 200 char limit |
| `src/app/api/admin/enrich-probe/route.js` | 250 → 200 char limit (prompt mirror) |
| `src/app/api/admin/bulk-enrich/route.js` | NEW — POST handler, calls aiLookup per artist, upserts to pending_enrichments |
| `src/app/api/admin/pending-enrichments/route.js` | NEW — GET queue list with artist join |
| `src/app/api/admin/pending-enrichments/[id]/approve/route.js` | NEW — promote proposal + KIND_NORMALIZE + lock flip |
| `src/app/api/admin/pending-enrichments/[id]/reject/route.js` | NEW — mark rejected |
| `src/app/api/admin/bare-artists/route.js` | NEW — priority list for Run next 10 |
| `src/app/api/events/search/route.js` | Added `artists.kind` to select projection |
| `src/components/admin/AdminEnrichmentTab.js` | Queue sub-tab + QueueView + QueueRow + CompareColumn + image lightbox + sub-tab persistence (sessionStorage + hash) |
| `src/components/admin/AdminArtistsTab.js` | Lock toggle in modal footer |
| `src/components/ArtistProfileScreen.js` | Upcoming shows row reorder DATE → TIME → VENUE |
| `src/app/page.js` | LIGHT.bg #F7F5F2 → #F5F5F5; feed gap 8 → 16 |
| Supabase migration `create_pending_enrichments_table` | NEW table for staged proposals |
| Supabase `artists` rows | 21 reclassified to kind='event' across two batches; 6 cleared bios + linked Just Bob events; alias added |

### Tasks closed this session (#52–#73)

DJ Bluiz lock investigation, waterfall fix, enrich-backfill lock fix, pure ghost pills, bio threshold tuning, canvas vs card pass, hairline divider tuning, bulk-enrich Phase 1 (schema + endpoints), Phase 2 (Queue UI), Phase 3 (approve/reject), kind normalize, lock toggle in modal, sub-tab persistence, profile row reorder, 6-row over-500 cleanup. See task list for full detail.

### Tasks still open

- **#15** Draft VENUE_MANAGEMENT.md skill doc
- **#17** Migrate Agent_SOP content + delete file
- **#19** Housekeeping — fold transient docs into HANDOVER
- **#24** Mott's Creek Bar scraper — verify second cron run is stable
- Carryover: 446 bare artists waiting for bulk-enrich queue runs (the launch-blocking work), compound artist name pattern (PARKED #17 — 5-7 rows still need rename treatment), image curation Phase 1 (PARKED #2 — long-term answer to image stability), Mac mini agent loop (Phase 1 of AGENT_ARCHITECTURE — post-launch).

### Manual follow-up Tony is handling solo

- **Run the bulk-enrich queue.** First batch landed today; 4 of 10 needed rejection because Tony had already curated those artists directly. Pattern is established (`Reject` queue rows where the artist row already has bio + locks). 446 bare artists to chew through across multiple focused sessions.
- **18 over-500 real-artist bios** with upcoming events (Steve Reilly, Felice Brothers, Built to Spill 5350 chars, Sublime 4020 chars, etc.) — bios are legitimate Wikipedia-style content, just longer than the new prompt target. Read More renders fine on cards. Optional clean-up: re-trigger AI Enhance per artist, OR add a "Force re-enrich on over-N artists" endpoint that bypasses the bare-only filter.
- **Multi-artist disambiguation rows** (4): Mango, TBA, Steve, on point — bios begin with "There is more than one artist with this name: 1.) ..." from Last.fm/MusicBrainz import. Need NEEDS_MANUAL_REVIEW or manual artist-section pick.

### Notes for next session

- The bulk-enrich queue is now the central enrichment surface. Don't add more enrichment write paths without routing them through pending_enrichments — the staged-write pattern is what prevents the DJ Bluiz incident class structurally.
- The "approved-via-direct-edit → reject the queue row" pattern is the standard cleanup. If this happens A LOT (more than 5-10 per batch), worth building an "Auto-archive already-curated" button that bulk-rejects pending rows whose linked artist now has `is_human_edited.bio = true`. Saves per-click time.
- The auto-link cron is a real gap. The Just Bob and DJ Bluiz issues both surfaced because events scraped after a manual artist creation don't get retroactively linked. Worth considering a recurring nightly job that runs the auto-link query against `artist_id IS NULL` events. Not blocking launch, but would eliminate this whole class of one-off cleanup.
- `EventCardV2` is at a stopping point. The pill went through ~10 design iterations across two days. Don't preemptively iterate again — let it bake in production for a week and gather usage signal before another design pass.
- The Mac mini agent loop (AGENT_ARCHITECTURE Phase 1) is still the natural post-launch big win. The bulk-enrich queue is now the perfect host surface — Qwen on the mini writes proposals to `pending_enrichments`, Tony reviews via the same Queue UI he's already using. Same exact workflow; only the model URL changes.

---

## May 2 session — three-state cards, image-override fixes, kind taxonomy hardening

Saturday session. Three threads ran in parallel: (a) EventCardV2 expanded into a three-state click cycle and the bio typography got cleanly differentiated between feed cards and the ArtistSpotlight pop-up; (b) two related image-override bugs were fixed in the submission flow and the Mott's Creek scraper, both of which were beating canonical artist images in the waterfall; (c) the kind taxonomy got its overdue UX surface — admin filter pill, live-search labeling, Promote-to-Artist button, and a one-shot orphan stamp + retroactive sweep helper that closes the auto-link gap flagged in the May 1 notes.

### 1. EventCardV2 three-state click cycle + Spotlight typography

The card click behavior expanded from a binary toggle to a three-state cycle: **closed → expanded with bio collapsed → bio expanded (only when the bio is long) → closed**. Single click handler `handleCardClick` in `src/components/EventCardV2.js` drives all three transitions. The long-press detection still works via the existing `longPressFired` ref. Action-row buttons (Follow Artist, Save Event, Share, Venue, Report) `stopPropagation` so they bypass the cycle entirely. Read More keeps its own narrow handler — clicking it inside the expanded card jumps straight to step 3 (or back) without going through the closed state.

`SHORT_BIO_LIMIT` raised 250 → 300. Bios at or below 300 chars render with no clamp and no Read More — middle state of the cycle is suppressed in that case (the cycle effectively becomes 2-state for short-bio cards, which is correct because there's nothing to expand into).

**Bio typography — feed cards.** Event-card bio bumped 15px / 1.65 → **18px / 1.55**. Read More 12 → 13px. Bigger and tighter; reads clearly inside the new 16px-radius card surface.

**Bio typography — ArtistSpotlight pop-up.** This is the bottom-sheet pop-up at `src/components/ArtistSpotlight.js`, NOT EventCardV2. Bio bumped 16px / 1.7 → **20px / 1.5** so the spotlight has a distinct hero treatment versus the feed cards. Spotlight is a dedicated full-attention surface; the larger size + tighter line-height is correct for that context.

**Documented mistake.** This iterated through several wrong surfaces before landing. Tony kept pointing at the spotlight pop-up while the assistant kept editing event cards. **The spotlight pop-up = `src/components/ArtistSpotlight.js`. NOT EventCardV2.** Future agents: when Tony says "the spotlight pop-up" or "the artist pop-up that comes up at the bottom," that's `ArtistSpotlight.js`. EventCardV2 is the feed card. They are different files with different typography requirements.

### 2. Submission flow image override fix

The "Add to the Jar" submission flow was stamping `events.image_url` with the user's uploaded poster — often an Instagram screenshot — and that beat the canonical artist image in the waterfall. Symptom: a submitted enjoy! show at Spring Lake Tap House rendered with a low-res Instagram crop instead of the curated artist photo.

**Fix at `src/app/api/admin/queue/route.js`:** pre-resolve the artist by name BEFORE the event insert. If the artist already has an `image_url`, drop the submission poster (set `image_url: null` on the event). The post-publish enrichment hook also re-checks and clears `events.image_url` defensively if the artist gained an image during enrichment between submission and publish.

Healed the Spring Lake Tap House enjoy! row in DB. The fix applies on a forward basis to all future submissions.

### 3. Mott's Creek scraper image bug

`src/lib/scrapers/mottsCreekBar.js` was pulling `item.assetUrl` from the Squarespace JSON feed. That field is a **directory path with no filename extension** — e.g. `/s/megan-knight` — and returns 404 when the browser tries to load it as an image. The bad URL was getting stamped onto `events.event_image_url`, beating canonical artist images in the waterfall.

**Fix at line 123:** write `image_url: null` always. Let the waterfall fall through to the artist photo. Cleared 3 affected DB rows: Megan Knight, Grass Fedz, Brandon Ireland.

**Pattern note for future agents.** Any other Squarespace-based scraper using `assetUrl` likely has the same bug. Worth auditing — Squarespace's JSON returns `assetUrl` as the raw blob handle, not the public-facing image URL. The image fetch needs `?format=2500w` or similar; without it, the path 404s. For our pipeline, the clean answer is always `image_url: null` from scrapers and let the waterfall do its job.

### 4. Promote to Artist button + endpoint

New `POST /api/admin/artists/promote` at `src/app/api/admin/artists/promote/route.js`. Body: `{ event_id }`. Reads the event's `artist_name`, finds existing artist by case-insensitive name match (links if found, returns `action: 'linked'`), otherwise creates a new bare `kind='musician'` artist row (returns `action: 'created'`). Stamps `events.artist_id`. Idempotent: if already linked returns `action: 'already-linked'`.

Button wired into `src/components/EventFormModal.js`. Visible when the event has `id` set + `artist_name` set + `artist_id` null + no name match in the `artists` prop. Toast on success, modal closes after 700ms so the parent reload flips the EVENT badge to ARTIST.

The endpoint also calls `sweepEventsForArtist` (see #7 below) so promoting one event into a new artist row catches every sibling event sharing the same artist_name. Toast surfaces the `siblings_linked` count returned in the response.

### 5. Per-row event delete confirmation

The AdminEventsTab per-row trash button now confirms via `window.confirm()` showing artist + venue + date. Bulk delete already had this; per-row was the gap. Closes the "wait, did I just delete a row I didn't mean to" footgun. `src/components/admin/AdminEventsTab.js`.

### 6. OG share preview format

The triple-middle-dot listicle ("Sat, May 2 · 9 PM · enjoy! at Spring Lake Tap House") was replaced with natural prose: "**Sat, May 2 at 9 PM — enjoy! at Spring Lake Tap House**". File: `src/app/event/[id]/page.js`. Date+time joined with ` at `; em-dash separates the WHEN block from the WHO/WHERE block. Description fallback also reworded ("Live music **on** ..." instead of stiff "Live music ·").

Order is preserved (WHEN leads) so iMessage's ~75-char preview truncation chops the venue, not the time. That was the original reason for the listicle format; the new prose keeps that property while reading like prose.

**Artist OG metadata at `src/app/artist/[id]/page.js` was left untouched.** The artist page route exists but nothing in the live UI currently links to it — the page is dormant. Tony confirmed leaving it as-is. Worth flagging for a future session: either wire the artist page into the UI (Profile screen → public-share permalink) or formally retire the route.

### 7. Bulk-stamp orphan events + sweep helper (closes the May 1 auto-link gap)

The May 1 notes flagged this directly: "events scraped after a manual artist creation don't get retroactively linked." Closed today.

**One-shot SQL backfill.** Stamped `events.artist_id` on **2,029 of 2,306 upcoming events (88%)** by matching `artist_name` against either `artists.name` (case-insensitive) or any entry in `artists.alias_names`. All three kinds touched (musician, event, billing). The 277 still unlinked are events whose `artist_name` doesn't yet correspond to an `artists` row at all — those will resolve as new artist rows get created via Promote or scraper auto-create.

**`src/lib/artistSweep.js` — new module.** Exports `sweepEventsForArtist(supabase, artistId)`. Reads the artist's current name + alias_names, finds upcoming events with null artist_id matching any of those (case-insensitive), updates in one round-trip. Returns `{ swept, error }`. Non-fatal — the caller decides whether to log or surface.

**Wired into three write paths:**
- `POST /api/admin/artists` (after create) — catches events scraped before the artist row existed.
- `PUT /api/admin/artists` (after update) — catches alias-add and rename cases. If admin adds `Just Bob Outside` to an existing `Just Bob` row, every orphan "Just Bob Outside" event links on save.
- `POST /api/admin/artists/promote` — catches sibling events sharing the artist_name. Endpoint returns `siblings_linked` count, EventFormModal toast surfaces it.

This is the structural fix for the auto-link gap. Three high-traffic admin actions all now sweep automatically. The cron-based recurring sweep is no longer urgent — it'd only catch the narrow case of a scraper renaming an event's `artist_name` after the artist row already exists, which is rare.

### 8. BetaWelcome modal redesign

`WELCOME_KEY` bumped `_v3` → `_v4` so returning users see the refresh.

- **Beta badge:** solid orange pill (button-like) → outlined label. Transparent fill, thin orange border, smaller weight, mixed case "Officially in Beta." Removes the button-confusion — a user mistook the previous pill for the CTA.
- **Intro paragraph removed** entirely. The beta-honesty copy ("Please excuse any hiccups…") was making the modal feel apologetic instead of inviting.
- **Quick Features reordered + Discover dropped.** Now: Spotlight → Event Cards → Follow → Share. Event Cards is the new entry ("Tap any card to expand for full details and artist bio.") with a custom card-with-chevron SVG matching the Follow ticket-stub icon style.
- **Let's Jam button:** 17px / 700 → **20px / 900**, letter-spacing 0.3 → 2px, uppercase. Now unmistakably the action.

### 9. Kind filter on AdminArtistsTab

The artists list was always showing all kinds mixed together — admin curating musicians had to mentally skip past Trivia NIGHT and Mother's Day Brunch rows. Closed.

- New state `artistKindFilter` (default `'musician'`) in `src/hooks/useAdminArtists.js`. Plumbed through `src/app/admin/page.js` to `AdminArtistsTab`.
- Filter pill applied to **both Metadata Triage and Directory sub-tabs**. Options: Musicians / Events / Billings / All kinds. Highlights orange when not on the default Musicians.
- **Default Category field hidden for `kind='musician'`** rows in the artist edit modal. Redundant — the AI categorizer already infers Live Music for musicians. Field stays visible for `event` and `billing` rows where the venue's intent matters (Trivia → Trivia, Brunch → Food, etc.). Helper text reworded honestly: "Auto-categorize FUTURE scraped events for this row. Existing events keep their current category. Templates and per-event edits still override."
- **Directory's count display follows the filter.** Was always "522 approved artists"; now reads "X approved musicians" / "X approved events" / etc.
- **Bypass when searching.** If `artistsSearch` has a value, the kind filter is suspended entirely. Both sub-tabs. Same logic in the count line. Reason: admin needs to find any row by name regardless of kind for cleanup tasks (rename, reclassify, delete).

### 10. Live-site search labels rows by kind

Autocomplete suggestions in `src/app/page.js` (around line 622) used to push every joined `e.artists?.name` as `type: 'artist'`. Now stores `{display, kind}` per artist match and pushes `type: 'event'` when `kind === 'event'` or `'billing'`, otherwise `type: 'artist'`.

End users searching "mother" now see `Mother's Day Brunch · EVENT` instead of a misleading ARTIST badge. Connor Bracken And The Mother Leeds Band still shows as ARTIST. The events search API already includes `kind` in the artists join projection (added line 215 in the May 1 session) — this is the consumer side of that plumbing.

### 11. Spring Lake Tap House data heal

Side effect of fixing #2: the historical bad row (enjoy! at Spring Lake Tap House) was healed in DB. The artist image now renders correctly on that event card.

### Files Changed (May 2)

| File | Change |
|------|--------|
| `src/components/EventCardV2.js` | Three-state click cycle (`handleCardClick`); SHORT_BIO_LIMIT 250→300; bio 15px/1.65→18px/1.55; Read More 12→13px |
| `src/components/ArtistSpotlight.js` | Bio 16px/1.7→20px/1.5 (distinct hero treatment vs feed) |
| `src/app/api/admin/queue/route.js` | Pre-resolve artist before event insert; drop submission poster if artist has image; post-publish enrichment hook re-checks |
| `src/lib/scrapers/mottsCreekBar.js` | Line 123: `image_url: null` always (was broken assetUrl); 3 DB rows cleared |
| `src/app/api/admin/artists/promote/route.js` | NEW — POST endpoint, links or creates artist row from event, sweeps siblings |
| `src/components/EventFormModal.js` | Promote to Artist button (visible when no artist_id + no name match); toast surfaces `siblings_linked` |
| `src/components/admin/AdminEventsTab.js` | Per-row trash now confirms via `window.confirm()` showing artist + venue + date |
| `src/app/event/[id]/page.js` | OG: " at " for date+time, em-dash WHEN/WHO; description "Live music on …" |
| `src/lib/artistSweep.js` | NEW — `sweepEventsForArtist(supabase, artistId)` reads name+aliases, links orphans |
| `src/app/api/admin/artists/route.js` | Calls `sweepEventsForArtist` after POST and after PUT |
| `src/components/BetaWelcome.js` | WELCOME_KEY _v3→_v4; outlined beta badge; intro paragraph removed; features reordered (Spotlight/Event Cards/Follow/Share); Let's Jam 20px/900 uppercase |
| `src/hooks/useAdminArtists.js` | New `artistKindFilter` state (default `'musician'`) |
| `src/app/admin/page.js` | Plumbs kind filter to AdminArtistsTab |
| `src/components/admin/AdminArtistsTab.js` | Kind filter pill (both sub-tabs); search bypasses filter; count follows filter; Default Category hidden for kind='musician'; helper text reworded |
| `src/app/page.js` | Autocomplete `artistSet` keyed by `{display, kind}`; pushes `type: 'event'` when kind=event/billing |
| Supabase `events` rows | One-shot UPDATE: 2,029 of 2,306 upcoming events stamped with `artist_id` via name + alias match |
| `KIND_TAXONOMY.md` | NEW top-level doc — three-kind model, classification heuristics, surface-by-surface behavior, maintenance rules |

### Tasks closed this session (#75–#89)

Three-state card cycle, ArtistSpotlight bio bump, submission image override fix, Mott's Creek scraper image fix, Promote to Artist + endpoint, per-row delete confirmation, OG share format, bulk-stamp orphans + retroactive sweep helper, BetaWelcome redesign, kind filter on AdminArtistsTab (both sub-tabs), live-search kind labeling, search bypasses kind filter. See task list for full detail.

### Tasks still open

- **#15** Draft VENUE_MANAGEMENT.md skill doc (in-progress carryover)
- **#17** Migrate Agent_SOP content + delete file
- **#19** Housekeeping — fold transient docs into HANDOVER
- **#24** Mott's Creek Bar scraper — verify second cron run is stable (now also requires verifying the image_url:null fix holds)
- Carryover: 446 bare artists for bulk-enrich runs, 277 unlinked events with no matching artist row (will resolve via Promote or scraper auto-create), Mac mini agent loop (post-launch).

### Notes for next session

- The kind taxonomy is now a first-class concept in the code AND the docs. New `KIND_TAXONOMY.md` is the training doc — reference it when classifying scraped names or when explaining why a row is `kind='event'` to a confused future agent.
- The retroactive sweep closed the auto-link gap from May 1. The recurring nightly cron mentioned there is no longer needed. Three admin write paths cover the realistic cases.
- The artist page route (`src/app/artist/[id]/page.js`) is dormant. Decide next session: wire it into the UI (Profile screen permalink share?) or retire it. Today's fix only touched the event OG metadata; the artist OG metadata is intentionally left as-is.
- The Squarespace `assetUrl` bug pattern is worth a one-shot grep across all scrapers. If any other scraper writes `image_url` from `assetUrl`, the same fix applies (set null, let waterfall handle it).
- EventCardV2 three-state cycle is novel — watch for confused users who don't realize the card has a third state. If telemetry shows people opening cards but never reaching the bio-expanded state on long-bio events, the affordance might need a hint (e.g. a chevron rotation, a "Tap to read more" inline label).

---

## May 2 (afternoon/evening) — continuation: scroll diagnostics, scrape-time classifier, tickets badge, share-page wiring, scroll-back, security audit

Long second-half of May 2. Six workstreams in parallel: a recurring scroll-jump symptom that resisted three diagnostic fixes (parked), a new scrape-time `kind` classifier wired into three auto-create paths, a multi-revision tickets/cover indicator that took 5 attempts to land, share-landing-page action wires + bio bump, a scroll-back-on-collapse interaction polish, and a full security audit with two findings shipped same-session.

### 1. Scroll-speeds-up symptom — three diagnostic fixes, none resolved (parked #95)

Tony reported a recurring "scroll speeds up" sensation around 3-7 event cards below the hero. Layout-shift flash confirmed via Chrome DevTools (Rendering panel → Layout Shift Regions). Three fixes attempted today, none resolved:

1. **`HeroPiston.measure()` skips synchronous `applyScrollState()` write past the collapse zone.** Theory: ResizeObserver fires during spotlight auto-rotate, causing a wrapper-height shift mid-scroll. Guard added so `measure()` no-ops the synchronous write once `scrollY` is past the collapse zone. File: `src/components/HeroPiston.js` `measure()` function.
2. **Dynamic `overflow-anchor` on the scroll container.** HeroPiston had globally disabled scroll-anchoring on the entire feed scroll container, so any tiny layout shift translated to a visible jump. Fix disables anchoring inside the collapse zone (where the hero is actively resizing) and restores `overflow-anchor: auto` past it. Same file.
3. **`applyScrollState` runs synchronously without rAF throttle.** This was already in place pre-session but documented as part of the diagnostic chain.

User confirmed the symptom persists after all three. Static-read diagnosis couldn't identify the shifting element. **Parked as task #95.** Next move: capture a Performance trace on a real device — a static read of the source can't see what we need.

### 2. Scrape-time kind classifier (`src/lib/classifyArtistKind.js`)

New pure-function classifier. Returns `'event' | 'billing' | 'musician'` from a name string. Patterns drawn directly from `KIND_TAXONOMY.md` Section 3. Conservative on purpose: **false positives (a real musician misclassified as an event) are louder failures than false negatives**, so ambiguous input defaults to `'musician'`.

Wired into three auto-create paths so the scraper / enrichment / admin-promote flows stop creating mis-classified `kind='musician'` rows for venue events:

- `src/app/api/sync-events/route.js` Phase 0 (line ~1248) — scraper-first artist row creation. New rows get `kind: classifyArtistKind(name)`.
- `src/lib/enrichArtist.js` (line ~425) — universal enrichment. Sets kind ONLY when `!cached` (brand new row); preserves admin reclassifications on updates.
- `src/app/api/admin/artists/promote/route.js` — Promote-to-Artist endpoint now classifies the new row instead of hardcoding `'musician'`. Admin can override via KindToggle if the heuristic misses.

This is the structural fix for PARKED #15 ("Auto-create artist flow tags everything as `kind='musician'`"). Closes the new-row case; existing legacy rows still need the cleanup pass tracked in #15 / #9.

**Manual data cleanup tied to the same loop:**
- Reclassified the `"$5 High Noons, White Claws…"` artist row (Boatyard 401) from `kind='billing'` → `kind='event'`. Was misclassified by the comma-count heuristic — it's a drink special, not a multi-artist lineup. Comma-count alone isn't sufficient when the leading token is a price.
- Cleared the `cover` field on 4 affected Boatyard 401 rows (the `cover` was actually drink-promo "$5 Cover" copy from the venue page, not a real door price).
- Reclassified 4 obvious-event artist rows from `kind='musician'` → `'event'`: AYCE SNOW CRAB, Family Funday Monday, Decades night, Monday Night Pizza Night 6p.
- (Earlier in the day): cleared `event_image_url` on 3 Mott's Creek events (Squarespace `assetUrl` directory paths). Already documented in §3 above; noting here because it's the same "scrapers extract noise into ticket / image / cover fields" pattern that motivated the strict gating rules in §3 below.

### 3. Tickets indicator — schema + admin + display (the long iteration)

Multi-revision design loop. Capturing all of it because the rationale matters for future agents.

**Schema layer.** New column on `venues`:
```sql
ALTER TABLE venues ADD COLUMN is_ticketed_venue BOOLEAN NOT NULL DEFAULT false;
```
Migration name: `add_is_ticketed_venue_to_venues`. Backfilled `is_ticketed_venue = true` on 13 venues: Stone Pony, Wonder Bar, The Vogel, Asbury Lanes, House of Independents, The Saint, ParkStage, Algonquin Arts Theatre, Crossroads, PNC Bank Arts Center, Starland Ballroom, Tim McLoone's Supper Club, Stone Pony Summer Stage. Convention Hall + Brighton Bar were named in the list but don't exist in the venues table — skipped.

**Admin layer.**
- `src/app/api/admin/venues/route.js` — `EDITABLE_FIELDS` whitelist now includes `is_ticketed_venue` with boolean coercion in `sanitize()`.
- `src/components/admin/AdminVenuesDirectory.js` — toggle in the venue edit modal labeled "Events at this venue are sold via tickets" with helper text. Orange "TICKETED" badge next to the venue_type pill in the directory list. Both gated on the field.
- `src/hooks/useAdminVenues.js` — `fetchVenuesFull` SELECT now includes `is_ticketed_venue` so the field round-trips. Without this the toggle wouldn't persist visually after save (one-line bug fix; would have been silent corruption otherwise).

**Data flow layer.**
- `src/app/api/events/search/route.js` — venues join projection includes `is_ticketed_venue`; `transformEvent` flattens it onto the event payload as `event.is_ticketed_venue`.
- `src/app/event/[id]/page.js` — share-page server component does the same flatten.
- `src/app/api/sync-events/route.js` line ~238 — added a known-ticketing-host whitelist (`ticketmaster.com`, `livenation.com`, `dice.fm`, `etix.com`, `seetickets.us`, `eventbrite.com`, `showclix.com`, `axs.com`) so the cross-domain check in `ticket_link` resolution doesn't null out Ticketmaster URLs. Previously: both `source_url` and `ticket_url` were on `ticketmaster.com`, the cross-domain heuristic flagged them as suspicious and cleared the ticket_link. Whitelist short-circuits that.

**Display iterations — 5 attempts to land.**

1. **Inline next to venue name** in compact row + on share landing date strip. Tony rejected — wrong surface.
2. **Third line in the time column** (TIME / PM / $25 stack). Rejected — wanted it not in the time area, not in the title row.
3. **In expanded action row, immediately left of the map-pin icon, plain orange text.** Position liked, but it looked "lost" — needed visual definition.
4. **Wrapped in a pill badge with COVER vs TICKETS label prefix.** Cover string vs `is_ticketed_venue` determines label. Smart-prefix to avoid `"COVER $5 COVER"` when the `cover` field already contains the word.
5. **Badge moved to wrap to row 2** when the Follow pill is tight (Following Event longer label). Still in the action row.
6. **FINAL** (#109): badge pulled out of the action row entirely. Renders as its own dedicated block below the action row, only when present. Left-aligned to mirror the Follow Artist pill above. No wrap edge cases.

**Display gating logic (final).**
- Linked artist `kind` must be `'musician'` (drink-special "events", trivia, holiday brunches don't get the badge — their `cover` field is often scraper noise like "From $4" drink promos).
- `cover` string must match `/^\$\s*\d/` (a price-pattern), OR `is_ticketed_venue` must be true.
- Smart prefix: if `cover` already contains "cover" or "tickets" (case-insensitive), don't double-label.

**Why the strict gate.** The Pig & Parrot scraper (and likely several other casual-venue scrapers) extracts drink specials into `events.cover` and artist homepage URLs into `events.ticket_link`. Display-side strict gating prevents these from rendering as price/ticket badges. Data pollution still remains in DB — see PARKED #106 for the data-side audit.

### 4. Share landing page — Save Show + Follow Artist actually wire

`src/app/event/[id]/EventPageClient.js`:

- `handleSoftCTA` was previously a no-op for logged-in users (only fired the sign-up hint for guests). Replaced with `handleSaveShow` + `handleFollowArtist` that POST to `/api/saved-events` and `/api/follows` with the user's bearer token. Optimistic state flip with revert on failure. Posthog events: `share_page_save_show`, `share_page_follow_artist`.
- Bio paragraph bumped 14px → 18px / 1.55 line-height to match the feed.
- Action row split into 4 buttons: **Save Show** / **Follow Artist** / **Venue** (website) / **Map** (Google Maps directions). Was 3 with a confusingly-labeled Venue button that opened Google Maps.
- Venue button uses `event.venue_website` with `source_url` fallback (mirrors EventCardV2's `venueLink` resolution).

This closes a real launch hole: clicking a shared-event link from iMessage / Twitter and tapping Save Show silently did nothing if you were logged in.

### 5. Scroll-back on card collapse

`src/components/EventCardV2.js handleCardClick`: when the user collapses an expanded card (3rd state of the click cycle → closed), the card scrolls itself back into the viewport center. `setTimeout(..., 260)` waits for the max-height collapse transition (250ms) to settle before scrolling. `behavior: 'smooth', block: 'center'` — center avoids the sticky top nav clipping the title flush at top:0.

Closes the "user gets stranded in whitespace below a card after closing a long-bio expansion" footgun. Especially noticeable on long-bio cards where the expanded card pushed the user 600+ pixels below where they started.

### 6. Security audit + initial fixes (full report: `SECURITY_AUDIT_2026-05-02.md`)

Full security audit performed. **22 findings — 4 Critical, 6 High, 8 Medium, 4 Low.** Two fixes shipped same-session:

- **C2 — Admin analytics auth.** `src/app/api/admin/analytics/route.js` + `src/app/admin/page.js`: admin password moved from `?password=` URL query param to `Authorization: Bearer` header. Old query-param shape now rejected explicitly so a stale client fails loudly. The query-param shape was leaking the password into Vercel access logs.
- **C3 partial — Public POST hardening.** New shared library at `src/lib/publicPostGuards.js` exporting `enforceRateLimit(request, NextResponse)`, `capString(s, max)`, `capEmail(s)`, `capUrl(s, max)`. In-memory rate limiter with 1-hour rolling window keyed by `(route, ip)`. Honest doc comment about the Vercel cold-start bypass — flagged for Upstash Redis upgrade. Applied to 4 public POST endpoints: `submissions` (10/hr), `feedback` (20/hr), `support` (20/hr), `reports` (30/hr). All now have length caps, format validation on email/URL, allowlists on enum-shaped fields, and generic error responses (no `err.message` leaks).

**Outstanding from audit (deferred — see `SECURITY_AUDIT_2026-05-02.md`):** C1 secret rotation (Tony's manual task — checklist in the audit doc), C4 (`npm audit fix --force` for protobufjs/next/picomatch — requires Next 16 upgrade), H1 (move admin auth from shared password to Supabase role-based), H2 (SSRF allowlist on upload-image), H3 (anon client for public reads + RLS audit), H4 (`safeHref` helper for scraper-output URLs), H5 (Upstash Redis rate limit on flag-event), H6 (httpOnly cookies via `@supabase/ssr`), M1 security headers, C3 full (Upstash + captcha on the same 4 POSTs).

Tracked in PARKED #4 (security audit follow-ups).

### Files Changed (May 2 PM)

| File | Change |
|------|--------|
| `src/components/HeroPiston.js` | `measure()` skips synchronous write past collapse zone; dynamic `overflow-anchor` (off in zone, `auto` past it). Symptom not resolved — see #1. |
| `src/lib/classifyArtistKind.js` | NEW — `classifyArtistKind(name)` returns `'event' \| 'billing' \| 'musician'`. Patterns from KIND_TAXONOMY §3. Conservative default to `'musician'`. |
| `src/app/api/sync-events/route.js` | Phase 0 (~line 1248) uses `classifyArtistKind` for new artist rows. Line ~238 ticket-host whitelist (Ticketmaster/LiveNation/etc.) for `ticket_link` cross-domain check. |
| `src/lib/enrichArtist.js` | Line ~425: sets `kind` from classifier on `!cached` only (preserves admin overrides on updates). |
| `src/app/api/admin/artists/promote/route.js` | Promote endpoint now classifies new row instead of hardcoding `'musician'`. |
| Supabase `venues` schema | NEW column `is_ticketed_venue BOOLEAN NOT NULL DEFAULT false`. Migration `add_is_ticketed_venue_to_venues`. Backfilled true on 13 venues. |
| `src/app/api/admin/venues/route.js` | `EDITABLE_FIELDS` includes `is_ticketed_venue`; boolean coercion in `sanitize()`. |
| `src/components/admin/AdminVenuesDirectory.js` | Edit-modal toggle ("Events at this venue are sold via tickets"); orange TICKETED badge in directory list. |
| `src/hooks/useAdminVenues.js` | `fetchVenuesFull` SELECT includes `is_ticketed_venue` (round-trip fix). |
| `src/app/api/events/search/route.js` | Venues join projection + `transformEvent` flatten `is_ticketed_venue` onto event payload. |
| `src/app/event/[id]/page.js` | Share-page server component flattens `is_ticketed_venue` (mirrors search API). |
| `src/components/EventCardV2.js` | Tickets/cover badge final form: own block below action row. Strict gate (musician kind + price-pattern OR ticketed venue + smart prefix). Scroll-back on 3rd-click collapse. |
| `src/app/event/[id]/EventPageClient.js` | `handleSaveShow` + `handleFollowArtist` actually POST (was no-op for logged-in users). Bio 14→18px / 1.55. Action row: Save Show / Follow Artist / Venue / Map (was 3 with mislabeled button). |
| `src/app/api/admin/analytics/route.js` | C2: admin auth moved from `?password=` query to `Authorization: Bearer` header. Old shape explicitly rejected. |
| `src/app/admin/page.js` | C2: client sends Bearer header (was query param). |
| `src/lib/publicPostGuards.js` | NEW — `enforceRateLimit(request, NextResponse)`, `capString`, `capEmail`, `capUrl`. In-memory limiter, 1hr window, keyed by `(route, ip)`. Doc comment flags Vercel cold-start bypass for future Upstash upgrade. |
| `src/app/api/submissions/route.js` | C3: rate limit (10/hr), length caps, email/URL format validation, generic errors. |
| `src/app/api/feedback/route.js` | C3: rate limit (20/hr) + caps + validation. |
| `src/app/api/support/route.js` | C3: rate limit (20/hr) + caps + validation. |
| `src/app/api/reports/route.js` | C3: rate limit (30/hr) + caps + validation. |
| Supabase `artists` rows | Reclassified: Boatyard 401 "$5 High Noons…" billing→event; AYCE SNOW CRAB, Family Funday Monday, Decades night, Monday Night Pizza Night 6p musician→event. |
| Supabase `events` rows | Cleared `cover` on 4 Boatyard 401 rows (drink-promo noise). |
| `KIND_TAXONOMY.md` | §6 extended with `classifyArtistKind` reference + three wire points. |
| `PARKED.md` | New entries: #95 scroll jump, #103 venue_type cleanup, #106 Pig & Parrot extraction noise, #4 security follow-ups (cross-ref to SECURITY_AUDIT). |
| `SECURITY_AUDIT_2026-05-02.md` | NEW — 22 findings, status block, rotation checklist. |

### Tasks closed this session (#91–#94, #96–#102, #104–#111)

Scroll diagnosis (3 fixes, parked), scrape-time kind classifier, share-landing Save Show + Follow Artist wires, share-landing action-row split (Venue + Map), `is_ticketed_venue` schema + backfill + admin toggle + badge, tickets indicator (5 design iterations to land #109), scroll-back on collapse, security C2 + C3-partial. See task list.

### Tasks still open / parked

- **#95** Scroll jump near Ilhan Saferali Quartet — needs Performance trace on real device.
- **#103** venue_type cleanup pass — freeform field needs normalization.
- **#106** Pig & Parrot scraper extraction noise — display gate ships, data audit pending.
- Security follow-ups: C1 secret rotation, C4 npm audit, H1–H6, M1, C3 full. See `SECURITY_AUDIT_2026-05-02.md`.

### Notes for next session

- **Scroll-jump diagnosis is data-bound.** Three plausible static-read fixes haven't moved the needle. The next attempt should start with a Performance trace from Tony's iPhone — the Layout Shift Region overlay confirmed *something* shifts, but we can't see what without runtime data. Don't iterate more static fixes until the trace exists.
- **`classifyArtistKind` should be the single source of truth for new-row classification.** If a future scraper or admin path creates artist rows, route it through this module. Don't reimplement the heuristics inline. Update the patterns in this module + KIND_TAXONOMY §3 in lockstep.
- **Tickets badge gate is intentionally strict.** Don't loosen it ("show the cover field even on event-kind rows") without thinking through the Pig & Parrot / Boatyard 401 noise pattern. The strict gate is what prevents drink-special copy from rendering as a door price. PARKED #106 is the data-side companion.
- **Share-page CTAs were silently broken.** `handleSoftCTA` no-op for logged-in users was a launch hole — anyone clicking a shared-link Save/Follow button got no response. Worth scanning other "soft CTA" handlers in the codebase for the same pattern.
- **Security audit is the durable doc.** `SECURITY_AUDIT_2026-05-02.md` is the working list. Don't fold the outstanding items into HANDOVER or PARKED line-by-line; cross-reference and let that doc carry the detail. Fold into HANDOVER when items ship (the "Status as of end of day" block in the audit gets updated as fixes land).

