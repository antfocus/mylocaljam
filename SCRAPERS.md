# myLocalJam — Scraper Reference

> **Purpose:** Standalone technical reference for building, debugging, and maintaining venue scrapers.
>
> Last meaningful update: April 2026 — sharded crons, added Jenks + Parker House, folded in the scraper-health cache gotcha.
>
> Read `Agent_SOP.md` (Workflow 4) alongside this doc for behavioral guardrails when adding new scrapers.

---

## Architecture Overview

**Pipeline:** Scraper files → `sync-events/route.js` (parallel execution) → `mapEvent()` transform → Supabase upsert → post-sync enrichment

**Crons:** The old single fast-tier run overshot the Vercel Hobby 60s cap as the venue list grew past ~35 scrapers, so as of April 2026 the daily run is split into two staggered shards plus a weekly slow tier (`vercel.json`):

| Cron | Schedule (UTC) | Eastern (EST) | Runtime budget | What runs |
|------|---------------|---------------|-----------------|-----------|
| `/api/sync-events?shard=1&skipEnrich=true` | `0 2 * * *`  | 9 PM daily   | ~18s / 60s cap | ~18 fast-tier scrapers (shard 1) |
| `/api/sync-events?shard=2&skipEnrich=true` | `15 2 * * *` | 9:15 PM daily | ~21s / 60s cap | ~19 fast-tier scrapers (shard 2) |
| `/api/sync-events?tier=slow&skipEnrich=true` | `0 11 * * 0` | 6 AM Sundays | longer ok      | 9 slow scrapers (Vision OCR + proxy) |

`skipEnrich=true` is set on cron to keep each run under the 60s cap — enrichment runs are scheduled separately (see `notify` crons in `vercel.json`). Playwright scrapers (Brielle House, HOI) run ~90 min after shard 2 via GitHub Actions.

Shard membership is defined in `src/app/api/sync-events/route.js` (`FAST_SHARD_1`, `FAST_SHARD_2`, `SLOW_SCRAPER_KEYS`). See "Sharding & Tier Assignment" below.

**Auth:** `CRON_SECRET` (Vercel cron) or `SYNC_SECRET` (manual trigger) as Bearer token.

**Manual trigger (browser console on mylocaljam.com):**
```javascript
// All scrapers (both shards + slow tier) — only safe locally or on demand
fetch('/api/sync-events', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))

// Single shard (mirrors the cron — use for timing checks / isolated debug)
fetch('/api/sync-events?shard=1&skipEnrich=true', {method:'POST', headers:{'Authorization':'Bearer ' + atob('JCp7RyxiJCREZEpseCNDTw==')}}).then(r=>r.json()).then(d => console.log(JSON.stringify(d, null, 2)))
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

## Sharding & Tier Assignment

Source of truth: `src/app/api/sync-events/route.js` (~line 346+). When adding a new scraper, assign it to a shard/tier or the `shouldRunScraper` gate will skip it in cron.

**Slow tier** (Vision OCR + proxy-routed — need more runtime, run weekly):
`TenthAveBurrito`, `Palmetto`, `MjsRestaurant`, `PaganosUva`, `CaptainsInn`, `CharleysOcean`, `EventideGrille`, `AlgonquinArts`, `TimMcLoones`

**Fast shard 1** (~18s runtime, ~845 events):
`Ticketmaster`, `Martells`, `AsburyParkBrewery`, `IdleHour`, `TheVogel`, `WindwardTavern`, `JenksClub`, `StStephensGreen`, `Crossroads`, `DealLakeBar`, `WildAir`, `TheRoost`, `JacksOnTheTracks`, `BumRogers`, `TheColumns`, `TheCabin`, `AnchorTavern`, `Boatyard401`

**Fast shard 2** (~21s runtime, ~850 events — paired with the detail-fetch-heavy RiverRock and ParkerHouse):
`BarAnticipation`, `ParkerHouse`, `RiverRock`, `McCanns`, `BakesBrewing`, `PigAndParrot`, `JoesSurfShack`, `Jamians`, `BeachHaus`, `AsburyLanes`, `TriumphBrewing`, `ReefAndBarrel`, `SunHarbor`, `BlackSwan`, `RBar`, `WaterStreet`, `CrabsClaw`, `MarinaGrille`, `BrielleHouse`

**How the gate works:** `shouldRunScraper(key)` returns true when the scraper's set matches the incoming query. `?shard=1` runs only FAST_SHARD_1; `?shard=2` runs only FAST_SHARD_2; `?tier=slow` runs only SLOW_SCRAPER_KEYS; no params runs everything.

**Rebalance when a shard approaches ~40s.** We have ~20s of headroom each. When adding a new heavy scraper (detail fetches, OCR), move a light one to the other shard to keep both under 40s.

**Global health row per run:** each shard writes its own `_global_sync_shard_1` / `_global_sync_shard_2` / `_global_sync_slow` row — don't read `_global_sync` expecting a combined view; the admin UI shows all three.

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

> **Note:** `events` also has `series_id` (FK → `event_series`, ON DELETE SET NULL), `event_title`, and `is_festival`. These columns are admin-only — scrapers MUST NOT set them. The `series_id` link is written exclusively by the approval flow in `POST /api/admin/queue` when the admin ticks the "Part of a series / festival" checkbox. See `HANDOVER.md` — Session April 21, 2026 for the full schema and Session April 22, 2026 for the prod-verification test record (Tests A/B/C all passing).

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
| Admin Venues tab shows stale FAIL / counts after successful sync | Next.js Data Cache caching the Supabase `fetch()` read path (the DB row is correct) | `getAdminClient()` in `src/lib/supabase.js` must pass `cache: 'no-store'` — see "Scraper Health Cache Gotcha" below |
| Scraper silently missing from cron output | New scraper not added to `FAST_SHARD_1` / `FAST_SHARD_2` / `SLOW_SCRAPER_KEYS` — `shouldRunScraper` returns false | Add key to the appropriate set in `sync-events/route.js` |

---

## Active Scrapers (46 fetch-based + 2 Playwright)

Status legend: ✅ working · ⚠️ working but intermittent / degraded · ❌ disabled

| # | Venue | File | Platform | Shard / Tier | Status |
|---|-------|------|----------|-------------|--------|
| 1 | Pig & Parrot | `pigAndParrot.js` | PopMenu GraphQL | Fast 2 | ✅ |
| 2 | Ticketmaster Venues | `ticketmaster.js` | Ticketmaster API | Fast 1 | ✅ |
| 3 | Joe's Surf Shack | `joesSurfShack.js` | Custom HTML | Fast 2 | ✅ |
| 4 | St. Stephen's Green | `stStephensGreen.js` | Google Calendar iCal | Fast 1 | ✅ |
| 5 | McCann's Tavern | `mccanns.js` | Google Calendar iCal | Fast 2 | ✅ |
| 6 | Beach Haus | `beachHaus.js` | Custom HTML | Fast 2 | ✅ |
| 7 | Martell's Tiki Bar | `martells.js` | Timely API | Fast 1 | ✅ |
| 8 | Bar Anticipation | `barAnticipation.js` | AILEC iCal + RDATE | Fast 2 | ✅ |
| 9 | Jacks on the Tracks | `jacksOnTheTracks.js` | Google Calendar iCal | Fast 1 | ✅ |
| 10 | Marina Grille | `marinaGrille.js` | Squarespace JSON | Fast 2 | ✅ |
| 11 | Anchor Tavern | `anchorTavern.js` | Squarespace JSON | Fast 1 | ✅ |
| 12 | R Bar | `rBar.js` | Squarespace JSON | Fast 2 | ✅ |
| 13 | 10th Ave Burrito | `tenthAveBurrito.js` | WordPress AJAX | Slow | ✅ |
| 14 | Reef & Barrel | `reefAndBoatyard.js` | Google Calendar iCal | Fast 2 | ✅ |
| 15 | Palmetto | `palmetto.js` | Vision OCR (Gemini) | Slow | ✅ |
| 16 | Idle Hour | `idleHour.js` | Google Calendar iCal | Fast 1 | ✅ |
| 17 | Asbury Lanes | `asburyLanes.js` | BentoBox HTML + AJAX | Fast 2 | ✅ |
| 18 | Bakes Brewing | `bakesBrewing.js` | Webflow CMS HTML | Fast 2 | ✅ |
| 19 | River Rock | `riverRock.js` | WordPress EventPrime AJAX | Fast 2 | ✅ |
| 20 | Jenks Club | `jenksClub.js` | Custom HTML | Fast 1 | ✅ (added April 2026) |
| 21 | Parker House | `parkerHouse.js` | Custom HTML + detail fetch | Fast 2 | ✅ (added April 2026) |
| 22 | Wild Air Beerworks | `wildAir.js` | Square Online HTML + API | Fast 1 | ✅ |
| 23 | Asbury Park Brewery | `asburyParkBrewery.js` | Squarespace JSON | Fast 1 | ✅ |
| 24 | Boatyard 401 | `boatyard401.js` | WordPress Simple Calendar AJAX | Fast 1 | ⚠️ Returning 0 events (Task #53 — investigate parser, upstream may have changed markup) |
| 25 | Tim McLoone's | `timMcLoones.js` | Ticketbud HTML (proxy) | Slow | ✅ |
| 26 | Windward Tavern | `windwardTavern.js` | Google Calendar iCal | Fast 1 | ✅ |
| 27 | Jamian's | `jamians.js` | Squarespace HTML (text) | Fast 2 | ✅ |
| 28 | The Cabin | `theCabin.js` | Squarespace GetItemsByMonth | Fast 1 | ✅ |
| 29 | The Vogel | `theVogel.js` | WordPress HTML | Fast 1 | ✅ |
| 30 | Sun Harbor | `sunHarbor.js` | Squarespace JSON | Fast 2 | ✅ |
| 31 | Bum Rogers | `bumRogers.js` | Astro/BentoBox HTML | Fast 1 | ✅ |
| 32 | The Columns | `theColumns.js` | WordPress HTML | Fast 1 | ✅ |
| 33 | The Roost | `theRoost.js` | Beacon CMS HTML | Fast 1 | ✅ |
| 34 | Deal Lake Bar | `dealLakeBar.js` | Squarespace JSON | Fast 1 | ✅ |
| 35 | Crab's Claw Inn | `crabsClaw.js` | RestaurantPassion HTML | Fast 2 | ✅ |
| 36 | Water Street | `waterStreet.js` | Squarespace JSON | Fast 2 | ✅ |
| 37 | Crossroads | `crossroads.js` | Eventbrite showmore API | Fast 1 | ✅ |
| 38 | Black Swan | `blackSwan.js` | Custom | Fast 2 | ✅ |
| 39 | Triumph Brewing | `triumphBrewing.js` | Custom | Fast 2 | ✅ |
| 40 | Algonquin Arts | `algonquinArts.js` | PHP HTML (proxy) | Slow | ✅ |
| 41 | MJ's Restaurant | `mjsRestaurant.js` | Vision OCR (Gemini) | Slow | ✅ |
| 42 | Pagano's UVA | `paganosUva.js` | Vision OCR (Gemini) | Slow | ✅ |
| 43 | Captain's Inn | `captainsInn.js` | Vision OCR (Gemini) | Slow | ✅ |
| 44 | Charley's Ocean Grill | `charleysOceanGrill.js` | Vision OCR (Gemini) | Slow | ✅ |
| 45 | Eventide Grille | `eventideGrille.js` | Vision OCR (Gemini) | Slow | ✅ |
| 46 | ~~ParkStage~~ | `parkStage.js` | WordPress HTML | — | ❌ Disabled (missing from shard sets) |
| 47 | ~~Starland Ballroom~~ | `starlandBallroom.js` | AXS/Carbonhouse | — | ❌ Disabled (needs headless) |
| 48 | ~~House of Independents~~ | `houseOfIndependents.js` | Etix JSON-LD (fetch) | — | ❌ Disabled (Etix removed JSON-LD) |
| P1 | House of Independents | `houseOfIndependents.playwright.js` | Playwright (Etix SPA) | GH Actions | ⚠️ Blocked by AWS WAF on GH Actions IPs |
| P2 | Brielle House | `brielleHouse.playwright.js` | Playwright (FullCalendar) | GH Actions | ⚠️ Intermittent HTTP 500 from admin-ajax (Task #54) |

---

## Post-Sync Enrichment Pipeline

After upserting events, sync-events automatically runs (in order):

1. **Auto-Sorter** — keyword routing for non-music events (trivia, food specials, etc.)
2. **Price Extractor** — pulls cover charges from bios and descriptions
3. **Scraper-First Artist Enrichment** — seeds `artists` table with scraper-provided bios/images
4. **Artist-ID Linking (Pass 1)** — links ALL unlinked events to `artists.id` by name match, including `is_human_edited` / `is_locked` rows. Non-destructive (only sets null FK).
5. **Bio/Image Enrichment (Pass 2)** — `enrichArtist.js` waterfall (MusicBrainz → Discogs → Last.fm → AI fallback via `aiLookupArtist`). Skips locked fields. Cap is 50 uncached artists per sync (raised from 30 in April 2026).
6. **Event-Template Matcher** — links raw events to master templates by (venue, title)
7. **Follower Notifications** — fires POST to `/api/notify` for new events

These are all wrapped in try/catch — enrichment failures never break the sync.

**Important (April 2026 fix):** Artist-ID linking was previously bundled into Pass 2, which skipped `is_human_edited` rows entirely. This meant OCR-scraped and manually edited events never got linked to their artist records (no image/bio cascade). The fix splits into two passes so linking always happens.

---

## Metadata Enrichment Backfill (pre-launch sprint)

The nightly sync enrichment at step 5 has a 50-artist cap, so artists that entered the database long ago (before enrichment was wired, before AI fallback, or during a stretch where Last.fm missed them) can sit indefinitely with no bio or image. The backfill pipeline is the admin-triggered catch-up path that chews through this backlog in priority order.

**Entry point:** `POST /api/admin/enrich-backfill` — admin auth via `Authorization: Bearer {ADMIN_PASSWORD}`.

**Priority scoring** — `src/lib/enrichmentPriority.js` ranks unenriched artists by:

- **Day-of-week weight** — Thu–Sun events × 2.0 (the nights people actually go out)
- **Completeness weight** — bare rows (no bio AND no image) × 2.0
- **Recency weight** — `10 / daysAway`, capped at 10 for tomorrow's shows
- **Artist-level dedup** — one artist playing 4 venues = 1 call

Rows with `is_locked` or `is_human_edited === true` are filtered before scoring — never backfilled.

**LLM Router** — `src/lib/llmRouter.js` is the multi-provider abstraction used by `aiLookupArtist`:

- **Pass 1** (bio + image research) → `callLLMWebGrounded()` → Perplexity → Gemini → Grok. Web grounding is material for artist research.
- **Pass 2** (genre + vibe tagging) → `callLLM()` → Gemini → Perplexity → Grok. Pure classification from bio text; Gemini-first saves Perplexity quota.
- Router handles 429s by falling through; missing-key providers are skipped silently.
- Env: at least one of `GOOGLE_AI_KEY`, `PERPLEXITY_API_KEY`, `XAI_API_KEY`. Grok is NOT configured in prod as of April 2026.

**Batch loop** — Vercel Hobby has a 60s function timeout. Each POST processes up to 20-25 artists (`MAX_BATCH = 25`, default 20), then returns `{ enriched, remaining, errors, usageStats, snapshot }`. The admin UI re-fires until `remaining === 0`.

**Pre-write snapshots** — every row's current state is captured BEFORE the write and returned in the response body as `snapshot.entries[]`. Each entry has `pre_state` and `post_state`, so a batch is fully reversible via `supabase.artists.upsert(pre_state, { onConflict: 'id' })`. Server also dumps to `/tmp/mylocaljam-enrich-<ISO>.json` (ephemeral, survives the request — useful for `vercel logs` post-mortem).

**Admin UI** — `src/components/admin/AdminEnrichmentTab.js`, mounted at `/admin` → Enrichment tab. Runs the loop client-side, renders progress + LLM usage + per-artist log + errors, and exposes a "Download snapshot" button that serialises every batch in the session into one JSON file for rollback. Default batchSize is 2 for safe first runs; bump to 20-25 after verifying quality.

**Quality contract** (enforced by `aiLookupArtist` + prompt):

- Bios ≤ 250 characters (client-side trim on sentence boundary as backup)
- No banned hype words: legendary, world-class, amazing, soul-stirring, incredible, electrifying, unforgettable, mind-blowing, jaw-dropping, high-energy, captivating, mesmerizing, powerhouse, showstopping, breathtaking
- `kind` classification: MUSICIAN or VENUE_EVENT (trivia, karaoke, food specials classified as VENUE_EVENT; no fake band bios written)
- `genres` ⊆ `ALLOWED_GENRES` — hallucinated labels are stripped client-side
- `image_url` validated against hotlink blacklist (no Instagram CDN, no SVGs, no placeholder hits)
- Real images preferred over Serper Google hits preferred over Unsplash placeholders; `autoMode` refuses placeholders

**Safe ordering — always download the snapshot before firing the next session.** Vercel's `/tmp` copy evaporates on cold-boot, so the response JSON is the durable backup.

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
| Brielle House | `brielleHouse.playwright.js` | ⚠️ HTTP 500 (Task #54) | FullCalendar admin-ajax endpoint returning intermittent 500s — parser is solid, upstream is flaky. Might need to retry with backoff or fall back to full-page fetch + HTML parse |
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

---

## Scraper Health Cache Gotcha

**Symptom:** Admin Venues tab shows "FAIL" for scrapers that actually ran successfully. Status, event counts, and `last_sync` timestamps appear stale. Force-sync response says `"ok": true` with the right counts, but the UI doesn't reflect it. Querying `scraper_health` directly via the Supabase MCP or dashboard shows the correct data.

**Root cause:** Next.js auto-caches every `fetch()` made in server-side code — including the `fetch()` calls Supabase-js uses internally. So the admin read path returned a cached response from a previous request instead of hitting the DB. The data was always correct in the DB; the problem was entirely in the read path.

**Fix** — `src/lib/supabase.js` must pass `cache: 'no-store'` on the admin client:

```javascript
export function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
```

**If it happens again, diagnose in this order:**

1. Check the DB directly. Supabase MCP or dashboard:
   ```sql
   SELECT scraper_key, status, events_found, last_sync
   FROM scraper_health
   WHERE scraper_key = 'BakesBrewing'
   ORDER BY last_sync DESC;
   ```
   Prod project ID: `ugmyqucizialapfulens`. Staging: `arjswrmsissnsqksjtht`. `.env.local` points to staging; deployed Vercel app uses prod.

2. If the DB has correct data but the UI doesn't — caching regression. Verify `cache: 'no-store'` is still on `getAdminClient()`.

3. If the DB also has stale data — check for missing columns on `scraper_health`. A missing column silently fails the entire upsert. Required columns as of April 2026: `scraper_key`, `venue_name`, `website_url`, `platform`, `events_found`, `status`, `error_message`, `last_sync`, `last_sync_count`.

**Related gotchas:**

- Supabase MCP `execute_sql` does NOT commit — it rolls back. Use `apply_migration` for DDL that needs to persist.
- `scraper_health` has a unique index on `scraper_key`; upserts use `onConflict: 'scraper_key'`. Duplicates won't happen, but don't try to INSERT without `onConflict`.
- RLS is enabled on `scraper_health` with no policies — only the service_role key (used by `getAdminClient()`) can read/write. The anon key cannot.

---

## Open Scraper Bugs (as of April 2026)

| # | Venue | Issue | Notes |
|---|-------|-------|-------|
| 53 | Boatyard 401 | Returning 0 events (shard 1) | Scraper is running (no error), just parsing nothing. Likely upstream WordPress Simple Calendar markup change. Investigate by fetching the URL locally and comparing to the parser. |
| 54 | Brielle House | HTTP 500 from admin-ajax (Playwright) | Upstream intermittent. Consider: retry-with-backoff in the scraper, or switch to parsing the rendered FullCalendar grid directly instead of hitting admin-ajax. |

When either is fixed, update the "Active Scrapers" table above and drop the row here.
