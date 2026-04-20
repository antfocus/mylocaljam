# myLocalJam — Scraper Reference

> **Purpose:** Standalone technical reference for building, debugging, and maintaining venue scrapers.
> Read this + `Agent_SOP.md` (Workflow 4) before building any new scraper.

---

## Architecture Overview

**Pipeline:** Scraper files → `sync-events/route.js` (parallel execution) → `mapEvent()` transform → Supabase upsert → post-sync enrichment

**Cron:** Nightly at 10 PM Eastern via Vercel (`vercel.json` → `0 2 * * *` UTC). Playwright scrapers run ~90 min later via GitHub Actions.

**Auth:** `CRON_SECRET` (Vercel cron) or `SYNC_SECRET` (manual trigger) as Bearer token.

**Manual trigger (browser console on mylocaljam.com):**
```javascript
fetch('/api/sync-events', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
```

---

## File Locations

| What | Where |
|------|-------|
| Scraper files | `src/lib/scrapers/<camelCaseVenueName>.js` |
| Playwright scrapers | `src/lib/scrapers/<venue>.playwright.js` |
| Sync route (orchestrator) | `src/app/api/sync-events/route.js` (`maxDuration = 60`) |
| Playwright runner | `scripts/playwright-sync.mjs` |
| Playwright GH Actions | `.github/workflows/playwright-scrapers.yml` |
| Proxy utility | `src/lib/proxyFetch.js` |
| Vision OCR utility | `src/lib/visionOCR.js` |
| Scraper health API | `src/app/api/admin/scraper-health/route.js` |
| Cron config | `vercel.json` (root) |

---

## Standard Scraper Template

Every scraper exports a single async function returning `{ events: [], error: null | string }`.

```javascript
const CALENDAR_URL = 'https://www.venuename.com/events';

export async function scrapeVenueName() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(CALENDAR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)',
        'Accept': 'text/html',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Parse events from HTML/JSON/iCal...
    // Push each event with the required payload fields

    events.push({
      title: 'Artist Name',                          // required
      venue: 'Venue Display Name',                    // required — MUST match venues.name in DB exactly
      date: '2026-04-21',                             // required — YYYY-MM-DD only
      time: '9:00 PM',                                // 12-hour format, or null if unknown
      end_time: null,                                 // optional
      description: null,                              // optional — artist bio / event description
      image_url: 'https://...',                       // optional — poster / hero image
      ticket_url: 'https://ticketmaster.com/...',     // optional — external ticketing link
      price: '$15',                                   // optional — cover charge
      source_url: CALENDAR_URL,                       // required — venue calendar page
      external_id: 'venuename-2026-04-21-artist-slug', // required — UNIVERSALLY UNIQUE
      approved: true,                                 // legacy, always true
    });

    console.log(`[VenueName] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[VenueName] Scraper error:', err.message);
  }

  return { events, error };
}
```

---

## Required Payload Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | **Yes** | Artist or event name (can be dirty, gets cleaned in mapEvent) |
| `venue` | string | **Yes** | **EXACT match** to `venues.name` in Supabase |
| `date` | string | **Yes** | `YYYY-MM-DD` only — never include time here |
| `time` | string/null | No | 12-hour format (`"7:30 PM"`). Null → `is_time_tbd: true` |
| `external_id` | string | **Yes** | Universally unique dedup key |
| `source_url` | string | **Yes** | Venue's calendar URL |
| `end_time` | string/null | No | 12-hour format or null |
| `description` | string/null | No | Bio or event description |
| `image_url` | string/null | No | Poster or hero image URL |
| `ticket_url` | string/null | No | External ticketing URL (mapEvent filters same-domain links) |
| `price` | string/null | No | `"$25"` or `"Free"` or null |

---

## External ID Rules

The `external_id` is the dedup key (UNIQUE constraint in the DB). Get it wrong and you get duplicates or lost events.

- Must be globally unique across ALL scrapers
- Pattern: `venueslug-date-titleslug` (e.g., `stonepony-2026-04-21-malcolm-mcdonald`)
- For iCal recurring events that share a UID: append the date (`venue-uid-2026-04-15`)
- For Ticketmaster: use the TM event ID (`tm-event-G5eZZ9KpcV...`)
- Never use an index counter — IDs must be stable across syncs

---

## Timezone Safety

**CRITICAL:** Never hardcode `-05:00` (EST). Use the `easternOffset()` helper to handle DST dynamically.

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

**Also never:** `.slice(0, 10)` on a UTC ISO string to get the date — after 7 PM Eastern (midnight UTC), this returns tomorrow's date. Always convert to Eastern first.

---

## Platform Playbook

Before writing custom HTML parsing, check if a hidden API or structured feed exists.

### Squarespace
Append `?format=json` to the `/events` or schedule collection URL. Look for the `upcoming` array.
**Examples:** `marinaGrille.js`, `anchorTavern.js`, `rBar.js`, `asburyParkBrewery.js`, `dealLakeBar.js`, `waterStreet.js`, `sunHarbor.js`

### Google Calendar (iCal)
Extract the calendar ID from the embedded iframe `src`, URL-decode it, fetch the standard iCal feed at `calendar.google.com/calendar/ical/{calId}/public/basic.ics`.
**Examples:** `stStephensGreen.js`, `mccanns.js`, `jacksOnTheTracks.js`, `windwardTavern.js`, `idleHour.js`, `reefAndBoatyard.js`

### Eventbrite
**DO NOT** use JSON-LD (only returns first page). Use the showmore JSON API:
`/org/{orgId}/showmore/?type=future&page_size=50&page=1`
**Example:** `crossroads.js`

### Ticketmaster
Do NOT build a new scraper. Find the TM Venue ID and add it to the `VENUES` array in `src/lib/scrapers/ticketmaster.js`.

### Vision OCR (Image Flyers)
For venues that only post JPEG/PNG monthly flyers with no structured data. Uses Gemini 2.5 Flash (free tier) via `src/lib/visionOCR.js`.
**Examples:** `mjsRestaurant.js`, `paganosUva.js`, `captainsInn.js`, `charleysOceanGrill.js`

### WordPress EventPrime AJAX
Some WordPress sites expose calendar data via AJAX endpoints.
**Example:** `riverRock.js`

### PopMenu GraphQL
Venues using PopMenu have a GraphQL endpoint at their domain. Query `customPageCalendarSection`.
**Example:** `pigAndParrot.js`

### BentoBox HTML + AJAX Pagination
Fetch page, parse cards, paginate via `?p=N` with `X-Requested-With: XMLHttpRequest`.
**Example:** `asburyLanes.js`

---

## Proxy Routing

If a scraper works locally but returns 0 events or an empty HTML shell on Vercel, the venue is blocking datacenter IPs (Cloudflare, AEG, Etix).

Switch from `fetch()` to `proxyFetch()`:

```javascript
import { proxyFetch, BROWSER_HEADERS } from '@/lib/proxyFetch';

const res = await proxyFetch(url, { headers: BROWSER_HEADERS });
```

Uses IPRoyal rotating residential proxies. Env vars: `IPROYAL_PROXY_HOST`, `IPROYAL_PROXY_PORT`, `IPROYAL_PROXY_USER`, `IPROYAL_PROXY_PASS`. Falls back to direct `fetch()` if proxy isn't configured.

**Currently proxied:** `timMcLoones.js`, `algonquinArts.js`

---

## Wiring a New Scraper

After the scraper file is built and tested:

1. **Import** in `src/app/api/sync-events/route.js`:
   ```javascript
   import { scrapeVenueName } from '@/lib/scrapers/venueName';
   ```

2. **Add to `Promise.all`** (all scrapers run in parallel):
   ```javascript
   const [pigAndParrot, ..., venueName] = await Promise.all([
     scrapePigAndParrot(),
     ...,
     scrapeVenueName(),
   ]);
   ```

3. **Add to `scraperResults`** for health tracking:
   ```javascript
   VenueName: { count: venueName.events.length, error: venueName.error },
   ```

4. **Add to `VENUE_REGISTRY`** for health dashboard display:
   ```javascript
   VenueName: { venue: 'Venue Display Name', url: 'https://...', source: 'Platform Type' },
   ```

5. **Spread into `allEvents`**:
   ```javascript
   const allEvents = [
     ...pigAndParrot.events,
     ...,
     ...venueName.events,
   ];
   ```

6. **Add venue to Supabase** — provide the admin with the SQL:
   ```sql
   INSERT INTO venues (name, address, website)
   VALUES ('Venue Display Name', '123 Main St, Town NJ', 'https://...');
   ```
   The `name` MUST exactly match the `venue` field in the scraper payload.

---

## Scraper Health System

Each sync writes to the `scraper_health` table:

| Status | Meaning |
|--------|---------|
| `success` | Events found, no errors |
| `warning` | 0 events found, no errors (venue may not have posted yet) |
| `fail` | Scraper threw an error |

A `_global_sync` row tracks the overall sync (total upserted, batch errors).

The admin dashboard shows green/yellow/red badges per scraper. Clicking a failing scraper shows the error message.

---

## mapEvent() Transform (route.js)

The sync route's `mapEvent()` does these transforms on every scraper event:

1. **HTML entity decode** — `&amp;` → `&`, etc.
2. **Venue ID resolve** — matches `ev.venue` → `venues.name` → `venue_id`
3. **Time extraction from title** — if no time provided, regex-extracts from title (e.g., `"Malcolm 730-1030"` → `time: "7:30 PM"`, `title: "Malcolm"`)
4. **Date + time + timezone merge** — combines `YYYY-MM-DD` + `HH:MM` + `easternOffset()` → full ISO timestamp
5. **is_time_tbd flag** — set true if time is missing or midnight
6. **Smart ticket_link** — only keeps links to external domains (filters out same-domain venue links)
7. **Default time fallback** — uses `venues.default_start_time` if scraper has no time

---

## DB Schema (Key Tables)

### events (scraper-relevant columns)
`artist_name`, `venue_name`, `venue_id` (FK), `event_date` (ISO timestamp), `is_time_tbd`, `event_image_url`, `ticket_link`, `cover`, `source`, `external_id` (UNIQUE), `status`, `category`, `template_id` (FK), `artist_id` (FK), `is_human_edited`, `is_locked`

### venues
`id`, `name` (UNIQUE — scrapers match on this), `address`, `website`, `default_start_time`, `color`, `photo_url`

### scraper_health
`scraper_key` (PK), `venue_name`, `website_url`, `platform`, `events_found`, `status`, `error_message`, `last_sync`

---

## Common Pitfalls & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Events off by 1 hour after March/November | Hardcoded EST offset | Use `easternOffset()` helper |
| Wrong date after 7 PM Eastern | `.slice(0,10)` on UTC ISO string | Convert to Eastern first |
| Duplicate events in DB | `external_id` not unique (e.g., shared iCal UID) | Append date to external_id |
| 0 events on Vercel, works locally | Datacenter IP blocked | Switch to `proxyFetch()` |
| Events come in as wrong venue | `venue` field doesn't match DB `venues.name` | Must be exact string match |
| Recurring iCal events missing | Only parsing DTSTART, not RDATE | Parse all RDATE values, create event per date |
| Scraper returns HTML shell but no events | Bot detection (BentoBox, Cloudflare) | Add `BROWSER_HEADERS`, try proxy |
| Batch upsert fails | Duplicate `external_id` in same batch | Global `seen` Set deduplicates before upsert |

---

## Active Scrapers (44 total)

| # | Venue | File | Platform | Status |
|---|-------|------|----------|--------|
| 1 | Pig & Parrot | `pigAndParrot.js` | PopMenu GraphQL | ✅ |
| 2 | Ticketmaster Venues | `ticketmaster.js` | Ticketmaster API | ✅ |
| 3 | Joe's Surf Shack | `joesSurfShack.js` | Custom HTML | ✅ |
| 4 | St. Stephen's Green | `stStephensGreen.js` | Google Calendar iCal | ✅ |
| 5 | McCann's Tavern | `mccanns.js` | Google Calendar iCal | ✅ |
| 6 | Beach Haus | `beachHaus.js` | Custom HTML | ✅ |
| 7 | Martell's Tiki Bar | `martells.js` | Timely API | ✅ |
| 8 | Bar Anticipation | `barAnticipation.js` | AILEC iCal + RDATE | ✅ |
| 9 | Jacks on the Tracks | `jacksOnTheTracks.js` | Google Calendar iCal | ✅ |
| 10 | Marina Grille | `marinaGrille.js` | Squarespace JSON | ✅ |
| 11 | Anchor Tavern | `anchorTavern.js` | Squarespace JSON | ✅ |
| 12 | R Bar | `rBar.js` | Squarespace JSON | ✅ |
| 13 | ParkStage | `parkStage.js` | WordPress HTML | ✅ |
| 14 | 10th Ave Burrito | `tenthAveBurrito.js` | WordPress AJAX | ✅ |
| 15 | Reef & Barrel | `reefAndBoatyard.js` | Google Calendar iCal | ✅ |
| 16 | Palmetto | `palmetto.js` | Vision OCR | ✅ |
| 17 | Idle Hour | `idleHour.js` | Google Calendar iCal | ✅ |
| 18 | Asbury Lanes | `asburyLanes.js` | BentoBox HTML + AJAX | ✅ |
| 19 | Bakes Brewing | `bakesBrewing.js` | Webflow CMS HTML | ✅ |
| 20 | River Rock | `riverRock.js` | WordPress EventPrime AJAX | ✅ |
| 21 | Wild Air Beerworks | `wildAir.js` | Square Online HTML + API | ✅ |
| 22 | Asbury Park Brewery | `asburyParkBrewery.js` | Squarespace JSON | ✅ |
| 23 | Boatyard 401 | `boatyard401.js` | WordPress Simple Calendar AJAX | ✅ |
| 24 | Tim McLoone's | `timMcLoones.js` | Ticketbud HTML (proxy) | ✅ |
| 25 | Windward Tavern | `windwardTavern.js` | Google Calendar iCal | ✅ |
| 26 | Jamian's | `jamians.js` | Squarespace HTML (text) | ✅ |
| 27 | The Cabin | `theCabin.js` | Squarespace GetItemsByMonth | ✅ |
| 28 | The Vogel | `theVogel.js` | WordPress HTML | ✅ |
| 29 | Sun Harbor | `sunHarbor.js` | Squarespace JSON | ✅ |
| 30 | Bum Rogers | `bumRogers.js` | Astro/BentoBox HTML | ✅ |
| 31 | The Columns | `theColumns.js` | WordPress HTML | ✅ |
| 32 | The Roost | `theRoost.js` | Beacon CMS HTML | ✅ |
| 33 | Deal Lake Bar | `dealLakeBar.js` | Squarespace JSON | ✅ |
| 34 | Crab's Claw Inn | `crabsClaw.js` | RestaurantPassion HTML | ✅ |
| 35 | Water Street | `waterStreet.js` | Squarespace JSON | ✅ |
| 36 | Crossroads | `crossroads.js` | Eventbrite showmore API | ✅ |
| 37 | Algonquin Arts | `algonquinArts.js` | PHP HTML (proxy) | ✅ |
| 38 | MJ's Restaurant | `mjsRestaurant.js` | Vision OCR (Gemini) | ✅ |
| 39 | Pagano's UVA | `paganosUva.js` | Vision OCR (Gemini) | ✅ |
| 40 | Captain's Inn | `captainsInn.js` | Vision OCR (Gemini) | ✅ |
| 41 | Charley's Ocean Grill | `charleysOceanGrill.js` | Vision OCR (Gemini) | ✅ |
| 42 | Eventide Grille | `eventideGrille.js` | Vision OCR (Gemini) | ✅ |
| 43 | ~~Starland Ballroom~~ | `starlandBallroom.js` | AXS/Carbonhouse | ❌ Disabled (needs headless) |
| 44 | ~~House of Independents~~ | `houseOfIndependents.js` | Etix JSON-LD (fetch) | ❌ Disabled (Etix removed JSON-LD) |
| 45 | House of Independents | `houseOfIndependents.playwright.js` | Playwright (Etix SPA) | ⚠️ Built but blocked by AWS WAF on GH Actions IPs |
| 46 | Brielle House | `brielleHouse.playwright.js` | Playwright (FullCalendar) | ✅ Running via GitHub Actions |

---

## Post-Sync Enrichment Pipeline

After upserting events, sync-events automatically runs (in order):

1. **Auto-Sorter** — keyword routing for non-music events (trivia, food specials, etc.)
2. **Price Extractor** — pulls cover charges from bios and descriptions
3. **Scraper-First Artist Enrichment** — seeds `artists` table with scraper-provided bios/images
4. **Artist-ID Linking (Pass 1)** — links ALL unlinked events to `artists.id` by name match, including `is_human_edited` / `is_locked` rows. Non-destructive (only sets null FK).
5. **Bio/Image Enrichment (Pass 2)** — Last.fm / MusicBrainz / Discogs lookups for unlocked events only. Writes bio, image, genre, category.
6. **Event-Template Matcher** — links raw events to master templates by (venue, title)
7. **Follower Notifications** — fires POST to `/api/notify` for new events

These are all wrapped in try/catch — enrichment failures never break the sync.

**Important (April 2026 fix):** Artist-ID linking was previously bundled into Pass 2, which skipped `is_human_edited` rows entirely. This meant OCR-scraped and manually edited events never got linked to their artist records (no image/bio cascade). The fix splits into two passes so linking always happens.

---

## Playwright Pipeline (GitHub Actions)

Venues with JavaScript-rendered calendars (FullCalendar, React SPAs, AJAX
that requires a real browser session) can't run on Vercel's serverless
runtime. They run instead in a separate GitHub Actions workflow that spins
up headless Chromium.

**Files:**
- Workflow: `.github/workflows/playwright-scrapers.yml` (nightly cron + manual dispatch)
- Runner: `scripts/playwright-sync.mjs` (loads scrapers, upserts to Supabase, writes `scraper_health`)
- Scraper naming: `<venue>.playwright.js` alongside any fetch-based version

**Secrets required on GitHub:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Schedule:** 03:30 UTC (≈10:30 PM EST / 11:30 PM EDT), just after the Vercel cron.

**Active Playwright scrapers:**

| Venue | File | Status | Notes |
|-------|------|--------|-------|
| Brielle House | `brielleHouse.playwright.js` | ✅ Working | FullCalendar — AJAX path blocked from Vercel IPs |
| House of Independents | `houseOfIndependents.playwright.js` | ⚠️ WAF blocked | Etix React SPA with AWS WAF. Stealth plugin loads but GH Actions IPs still blocked. Needs residential proxy or API interception. |

**Migration candidates (future):**

| Venue | Current file | Why Playwright helps |
|-------|-------------|----------------------|
| Starland Ballroom | `starlandBallroom.js` | AXS/Carbonhouse AJAX fragment endpoint; currently disabled. A Playwright scraper can wait for `.entry.starland` on the live `/events/all` page. |

**HOI WAF bypass options to try next:**
- Residential proxy routed through Playwright (`proxy` option in `browser.newContext()`)
- Intercept and replay Etix `/ticket/api/online/search` POST endpoint with correct WAF token
- Run scraper from a non-datacenter IP (self-hosted runner, local cron)

Other candidates to monitor (currently working via `proxyFetch` but one block away from needing Playwright): `algonquinArts.js`, `asburyLanes.js`, `timMcLoones.js`, `triumphBrewing.js`.

**Cost note:** one nightly run takes ~1–2 min including Chromium install (cached). Well under the 2,000-minute/month free tier even if we add several more venues.
