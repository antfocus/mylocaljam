# myLocalJam — Venue Scraping Handover

## Project Overview
**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase site aggregating live music events from NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via Vercel cron.

---

## Current Event Count
**311 events** (as of last sync)

---

## Sync Infrastructure (complete ✅)
- **Route:** `src/app/api/sync-events/route.js` — runs all scrapers in parallel, maps to Supabase schema, batches upserts (50 at a time) with `onConflict: 'external_id'`
- **Cron:** `vercel.json` at root — runs at 6am & 6pm Eastern (UTC 11:00 and 23:00)
- **Auth:** `SYNC_SECRET` env var on Vercel — Bearer token required for GET/POST
- **Manual trigger from browser console (on mylocaljam.com):**
  ```javascript
  fetch('/api/sync-events', {method:'POST', headers:{'Authorization':'Bearer YOUR_SYNC_SECRET'}}).then(r=>r.json()).then(console.log)
  ```

---

## Scrapers — Status

| Venue | File | Status |
|---|---|---|
| Pig & Parrot | `pigAndParrot.js` | ✅ Working |
| Ticketmaster | `ticketmaster.js` | ✅ Working |
| Joe's Surf Shack | `joesSurfShack.js` | ✅ Working |
| St. Stephen's Green | `stStephensGreen.js` | ✅ Working |
| Beach Haus | `beachHaus.js` | ✅ Working |
| McCann's Tavern | `mccanns.js` | ⚠️ Returns 404 — private Google Calendar. Keep in route; contact venue to make public. |
| Bar Anticipation | `barAnticipation.js` | ⚠️ Placeholder — AILEC v3 is JS-rendered, no API. Revisit with Facebook Graph API (Page: `BarAlakecomo`) |

All working scrapers are imported and running in `sync-events/route.js`.

---

## Next Venues to Add

### 1. Martell's Tiki Bar 🔄 IN PROGRESS
- **URL:** https://tikibar.com/tiki-events/
- **Calendar type:** Timely SaaS embed (iframe from `https://calendar.time.ly/ixnvhbv0/`)
- **Calendar ID:** `ixnvhbv0`
- **API to test:**
  ```javascript
  fetch('https://calendar.time.ly/api/v1/calendar/ixnvhbv0/event?start_date=' + new Date().toISOString().split('T')[0] + '&per_page=50')
    .then(r => r.json())
    .then(d => console.log(JSON.stringify(d).substring(0, 1000)));
  ```
  Run this from the **tikibar.com** console tab. Paste the response to confirm the API shape, then write `src/lib/scrapers/martells.js`.
- **Venue name for DB:** `Martell's Tiki Bar`
- **external_id pattern:** `martells-{event.id}` (confirm field name from API response)

### 2. Spring Lake Tap House
- Not yet investigated. Start by inspecting https://springlaketaphouse.com for events page.

### 3. Wharfside Seafood and Patio Bar
- Not yet investigated.

### 4. Broadway Bar and Grill
- Not yet investigated.

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

---

## Repo
GitHub repo connected to Vercel — push to main = auto-deploy.
