# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**~1500+ events** across 39 active scrapers (as of March 24, 2026)

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
| 5 | The Stone Pony | `stonePony.js` | Custom scrape | ✅ Working | ~50 |
| 6 | Driftwood Bar | `driftwood.js` | Custom scrape | ✅ Working | ~45 |
| 7 | Inlet Cafe | `inletCafe.js` | HTML scrape | ✅ Working | ~40 |
| 8 | Viking Village | `vikingVillage.js` | Custom | ✅ Working | ~35 |
| 9 | The Aztec | `aztec.js` | Custom API | ✅ Working | ~30 |
| 10 | Brickyard Tavern | `brickyardTavern.js` | Custom scrape | ✅ Working | ~28 |
| ... | ...and 29 more | ... | ... | ✅ | ... |

See `scrapers/` directory for all 39 implementations.

---

## Database Schema — Events & Artists

### `events` table (Supabase)

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT UNIQUE NOT NULL,         -- Scraper-generated ID (venue + date + artist)
  event_title TEXT,                        -- Cleaned event name
  artist_name TEXT,                        -- Primary artist (for filters/search)
  venue_name TEXT,                         -- Venue
  event_date DATE,                         -- Event date (YYYY-MM-DD)
  event_time TIME,                         -- Event start time
  event_url TEXT,                          -- Booking URL (for detail view)
  external_image_url TEXT,                 -- Image from scraper source
  image_url TEXT,                          -- Final waterfall image (artist or override)
  custom_image_url TEXT,                   -- Operator override for this event
  artist_id BIGINT REFERENCES artists(id), -- FK to artists table
  template_id BIGINT,                      -- FK to event_templates (nullable)
  category TEXT,                           -- Live Music, Comedy, etc.
  status TEXT,                             -- published, draft, hidden
  notes TEXT,                              -- Operator notes
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### `artists` table (Supabase)

```sql
CREATE TABLE artists (
  id BIGSERIAL PRIMARY KEY,
  artist_name TEXT UNIQUE NOT NULL,
  image_url TEXT,                          -- From Last.fm or Serper top image
  artist_bio TEXT,                         -- Short bio from Last.fm
  last_fm_url TEXT,                        -- Last.fm profile link
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### `event_templates` table (Supabase)

```sql
CREATE TABLE event_templates (
  id BIGSERIAL PRIMARY KEY,
  template_name TEXT UNIQUE NOT NULL,      -- e.g., "Jam Night at The Pony"
  venue_name TEXT,
  category TEXT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Image Waterfall Resolution

When rendering an event card, the system applies a **waterfall** to select the best image:

1. **Custom override** — If operator set `custom_image_url`, use it.
2. **Artist image** — If `artist_id` exists and artist has `image_url`, use it.
3. **Event image** — If event has `external_image_url`, use it.
4. **Default placeholder** — Fallback image.

This waterfall is applied in:
- `src/lib/waterfall.js` (server-side, used in API calls)
- Event detail modal (client-side hydration)

---

## Event Enrichment Pipeline

### Sync Flow (happens after all scrapers ingest data)

1. **Identify unenriched events** — Find rows where `artist_id` is NULL OR (image_url is NULL AND external_image_url is NULL)
2. **Batch lookup on Last.fm** — Extract unique artist names, query Last.fm API for bios + image URLs
3. **Upsert artists table** — Store or update artist records
4. **Link events to artists** — Update `events.artist_id` FK
5. **Optional:** Call Serper Image Search for extra image options (if time permits)

### Operator Enrichment (manual override via Edit Event Modal)

- Operator can set `custom_image_url` to override the waterfall
- Operator can edit `artist_name`, `event_title`, `category` to improve search results
- Operator can manually link to a `template_id` to bundle recurring events

---

## Frontend Architecture

### Pages

- **Home page** (`src/app/page.js`) — Infinite-scroll feed, filters (date range, venue, category)
- **Event detail** (`src/app/event/[id]/page.js`) — Full event card, links to booking URL, artist bio
- **Admin dashboard** (`src/app/admin/page.js`) — Event grid, bulk edit, sync trigger

### Styling

- Tailwind CSS (global `src/app/globals.css` + component scopes)
- Dark theme optimized for live music aesthetic

### Key Components

- `EventCard.js` — Reusable card with waterfall image + artist info
- `EventModal.js` — Detail view + image gallery for artist
- `EditEventModal.js` — Operator controls for event fields, image override, template linking
- `AdminGrid.js` — Paginated event list with bulk actions

---

## Deployment & CI/CD

### Vercel

- **Repo:** GitHub `antfocus/mylocaljam` (public)
- **Branch:** `main`
- **Preview deployments:** Auto-enabled on all PRs
- **Production:** Deploy on merge to `main`
- **Environment variables:** `SYNC_SECRET`, Supabase `NEXT_PUBLIC_*` keys

### Sync Cron Job

- **Config:** `vercel.json` at root
  ```json
  {
    "crons": [{
      "path": "/api/sync-events",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/sync-events",
      "schedule": "0 18 * * *"
    }]
  }
  ```
- **Runs at:** 6am & 6pm Eastern (UTC 11:00 & 23:00)
- **Manual trigger:** Browser console on mylocaljam.com (see above)

### Secrets Management

- **Vercel dashboard** → Project Settings → Environment Variables
- All scraper API keys stored here (Last.fm, Ticketmaster, etc.)
- Sync route reads `process.env.SYNC_SECRET` for auth

---

## Known Limitations & Roadmap

### Current Gaps

1. **Image search** — Using Serper API, but coverage is ~80%. Some venues/artists have sparse web presence.
2. **Template coverage** — Only ~10% of events have been linked to recurring templates. Automated linker pending (see roadmap).
3. **Admin pagination** — Currently loads all events client-side (80-event limit in filters). Server-side pagination coming soon.
4. **Duplicate detection** — Heuristic-based (venue + date + artist name + time). Some events may be listed twice if venue/scraper names differ.
5. **Category wiring** — Comedy category not fully tested. Drink/Food Special overlaps with Live Music.

### Next Steps (Roadmap)

1. **Automated Template Linker** — ML model to suggest template matches based on event recurrence patterns
2. **Server-side Search & Pagination** — Replace 80-event client-side limit
3. **Punctuation-insensitive Fuzzy Match** — Better handling of event names with special characters
4. **Artist DELETE cleanup** — Remove artists with no linked events (runs nightly)
5. **Venue Detail Page** — Click venue name → see all events at that venue

---

## Handover Checklist

### Code & Configuration

- [x] GitHub repo is public and contains all source code
- [x] Vercel project is linked to main branch
- [x] Environment variables are set (see Secrets Management above)
- [x] Cron job is active on Vercel (6am & 6pm Eastern)
- [x] Supabase project is configured (see Database Schema above)
- [x] Local dev setup is documented in README.md

### Data & Monitoring

- [x] Database contains ~1500 events
- [x] All 39 scrapers are active
- [x] Last.fm enrichment is running (artist bios + images)
- [x] Sync logs are visible in Vercel dashboard

### Documentation

- [x] This handover document (you're reading it now!)
- [x] Scraper implementations are self-documenting (headers + comments)
- [x] Database schema is defined in migrations
- [x] Admin checklist is in the dashboard UI

### Next Owner Tasks

1. **Monitor sync logs** — Check Vercel dashboard daily for any failures
2. **Tune image search** — Adjust Serper API queries if coverage is low
3. **Implement roadmap** — Start with Automated Template Linker
4. **Gather feedback** — Talk to operators about missing features
5. **Scale infrastructure** — Plan for growth beyond 2000 events

---

## Session History

## Session — April 14, 2026: Initial Scrapers & DB Schema

### Summary

Built out the core scraping infrastructure for 39 venue data sources across NJ, from Ticketmaster API to custom HTML scrapers. Deployed to Vercel, wired Supabase, and created a basic event feed.

### Scrapers Built

1. **Ticketmaster API** (`ticketmaster.js`)
   - Live data for major venues
   - Pagination via `size=250`
   - Maps `venueName`, `dateTime`, `images[0].url`, event URL

2. **Pig & Parrot** (`pigAndParrot.js`)
   - Custom JSON API at `pigandparrot.com/api/events`
   - Lightweight, stable, ~60 events

3. **St. Stephen's Green** (`stStephensGreen.js`)
   - Google Calendar iCal export
   - Parses `ICS` format, extracts date/time/description

4. **Joe's Surf Shack** (`joesSurfShack.js`)
   - HTML scrape via Cheerio
   - Event grid with artist name + date/time

...and 35 more (all 39 are working, status tracked above).

### Database Setup

- Created `events` table with schema above
- Created `artists` table for enrichment
- Set up Supabase auth (RLS policies in progress)
- Verified upsert logic (`onConflict: 'external_id'`)

### Frontend

- Basic event feed in `/src/app/page.js`
- Tailwind CSS styling
- Filter UI (date, venue, category)
- Event detail modal

### Known Issues (From April 14)

- Admin grid loads all events client-side (80-event limit)
- Image enrichment is basic (Serper API sometimes returns irrelevant results)
- No template linking yet
- Category taxonomy needs refinement

### Safety Locks — Cumulative Snapshot (Apr 14)

Established foundational invariants:

- **§0.0 — external_id uniqueness** — All scrapers must generate reproducible `external_id` values (venue + date + artist + time hash). No duplicates allowed; upserts use `onConflict: 'external_id'`.
- **§0.1 — Waterfall image resolution** — `image_url` is computed on-the-fly via waterfall (custom → artist → event → default). Never store the waterfall result in the database; always compute at render time.
- **§0.2 — Artist enrichment is opt-in** — After scrapers run, sync route checks for unenriched events and looks up Last.fm data asynchronously. Enrichment failures do NOT block the sync.
- **§0.3 — Template linking is manual** — Operators link events to templates via the Admin dashboard. No automated linking yet.
- **§0.4 — `event_image` is virtual** — Do not store `event_image` in the database. Use the waterfall to resolve it at query time.
- **§0.5 — G Spot invariant** — All date/time filtering and display uses UTC internally. Venue local time is derived from venue timezone (in venue metadata). Until timezone data is added, assume all venues are US/Eastern.
- **§0.6 — Scraper error isolation** — If one scraper fails, continue with others. Wrap each scraper in try/catch. Log errors to Vercel logs but do not block the sync.

---

## Session — April 16, 2026 (Session 1): Image Enrichment & Event Templates

### Summary

Implemented **Serper Image Search** for richer event galleries and created **Event Templates** to bundle recurring shows. Built operator controls to override images and manually link events to recurring templates.

### Image Enrichment: Serper API Integration

- **New route:** `src/app/api/enrich-image/route.js` (133 lines)
- **Trigger:** Edit Event Modal → "Refresh Images" button
- **Flow:**
  1. Client sends `event_id` + `artist_name`
  2. Server calls Serper Image Search API (top 5 results)
  3. Returns ranked images with relevance scores
  4. Modal displays gallery, operator selects one
  5. Selected image URL saved to `custom_image_url` (or cached in `artists.image_url`)

- **Relevant Images** — Serper usually returns photos of the artist performing, album art, or promotional shots
- **Edge cases:**
  - "Jam Night" events with generic names → Serper returns low-relevance images
  - Solution: Manual override via URL input field

### Event Templates

- **New table:** `event_templates` (see schema above)
- **Purpose:** Group recurring shows ("Jam Night at The Pony every Friday")
- **Workflow:**
  1. Operator creates template in Admin dashboard
  2. Operator links events to template (multi-select in Edit Modal)
  3. Template displays on event card ("Part of Jam Night at The Pony")
  4. Future: Automated linker suggests matches

- **Data model:**
  ```javascript
  {
    template_name: "Jam Night at The Stone Pony",
    venue_name: "The Stone Pony",
    category: "Live Music",
    description: "Every Friday night, open jam with rotating musicians",
    image_url: "..." // Gallery featured image
  }
  ```

### Frontend Updates

- `EditEventModal.js` — Added Serper image gallery + template picker
- `EventCard.js` — Displays template badge if linked
- `AdminDashboard.js` — Template management UI

### Test Coverage

- `scripts/test-enrich-image.mjs` — 8 tests covering Serper edge cases
- Verified: Empty artist names, special characters, Serper API errors

### Known Limitations (Accepted)

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