# Kick-Off Prompt: Server-Side Search, Indexing & Pagination

> Copy everything below this line and paste it as the first message in a new Claude session.

---

## Context: What You're Working On

You are continuing development on **myLocalJam** (mylocaljam.com), a Next.js 14 + React 18 + Supabase + Tailwind CSS platform that aggregates live music and venue events from NJ shore venues. It's deployed on Vercel with a twice-daily cron sync. The codebase lives in the folder I've selected for you.

Before you write any code, read `HANDOVER.md` and `Agent_SOP.md` in the project root. These are your authoritative references for architecture, safety locks, and conventions. The handover is ~4000 lines — skim the session headers and read the April 16 entries closely, as they document the most recent architectural state.

## The Problem

The public event feed (`src/app/page.js`) fetches events directly from Supabase on the client using the anon key:

```javascript
const { data, error } = await supabase
  .from('events')
  .select('*, venues(name, address, color, photo_url, latitude, longitude, venue_type, tags), artists(name, bio, genres, vibes, is_tribute, image_url), event_templates(template_name, bio, image_url, category, start_time, genres)')
  .gte('event_date', floor)
  .eq('status', 'published')
  .order('event_date', { ascending: true })
  .limit(80);
```

**The 80-event cap is a hard ceiling.** Once we have more than 80 upcoming published events (which we already routinely do — our scraper network pulls ~1500+ events from 44 venues), users simply cannot see events beyond position 80. There is no pagination, no "load more," no server-side search. All filtering (search by name/venue/genre, date filters, distance radius) happens client-side on whatever 80 rows came back. If your event is #81, it's invisible.

**Search is also client-side only.** The search bar filters the already-fetched 80 events in memory:

```javascript
if (debouncedSearch.trim()) {
  const q = normalizeVenue(debouncedSearch);
  list = list.filter(e =>
    normalizeVenue(e.name).includes(q) ||
    normalizeVenue(e.venue).includes(q) ||
    normalizeVenue(e.genre ?? '').includes(q) ||
    normalizeVenue(e.event_title ?? '').includes(q)
  );
}
```

This means searching for "Jazz at River Rock" will return nothing if that event fell outside the first 80 rows.

## The Plan: Backend-First (Bottom-Up), 4 Steps

We are executing a **strict backend-first approach**. No frontend/UI code until the backend is tested and confirmed working.

### Step 1: Supabase `pg_trgm` Text Indexes

Create a Supabase migration that:

1. Enables the `pg_trgm` extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
2. Creates GIN trigram indexes on the searchable text columns on `events`: `event_title`, `artist_name`, `venue_name`. These are the three columns the client-side search currently filters on.
3. Creates a composite index on `(status, event_date)` if one doesn't already exist — this is the WHERE clause every feed query hits. There is already an `idx_events_date` on `event_date` and `idx_events_status` on `status`, but a composite covering both in the right order will eliminate a merge step.
4. Consider whether a `tsvector` generated column + GIN index would be better than raw `pg_trgm` for our use case (fuzzy partial match on short strings like band names and venue names — users type "stone po" and expect "The Stone Pony"). Make a recommendation and implement whichever is stronger.

**Deliverable:** A `.sql` migration file in `supabase/migrations/` (or `scripts/` if no migrations folder exists). Include comments explaining each index. Do NOT run this against production — just produce the file for review.

### Step 2: Paginated + Searchable API Endpoint

Create a new API route: `src/app/api/events/search/route.js` (or enhance the existing `src/app/api/events/route.js` — your call on which is cleaner). This endpoint must:

1. Accept query parameters: `q` (search string), `page` (1-indexed, default 1), `limit` (default 20, max 100), `date_from` (ISO date string, defaults to today Eastern), `date_to` (optional), `venues` (comma-separated venue IDs), `category` (optional).
2. Run the search query server-side using the service role key (via `getAdminClient()` from `src/lib/supabase.js`), NOT the anon key.
3. Use Supabase's `.range(from, to)` for cursor-based pagination OR offset-based — justify your choice.
4. If `q` is provided, use the trigram/tsvector index for fuzzy text search across `event_title`, `artist_name`, and `venue_name`. The search should be case-insensitive and match partial strings.
5. Always filter `status = 'published'` and `event_date >= date_from`.
6. Return the same joined shape the frontend expects: `events` with nested `venues`, `artists`, and `event_templates`.
7. Include pagination metadata in the response: `{ data: [...], page, limit, total, hasMore }`.
8. Apply the same data transformations the frontend currently does (title ladder, category ladder, image waterfall, start time extraction) on the SERVER so the client receives clean, display-ready objects. Reference `src/app/page.js` lines ~180-280 for the current client-side transformation logic, and `src/lib/waterfall.js` for `applyWaterfall`.
9. Auth: this is a public endpoint (no Bearer token required), but use the service role key server-side so RLS doesn't interfere with the joined selects.

**Deliverable:** The working route file + a test script (curl commands or a small Node script) that exercises the endpoint with various query combos (empty search, partial match, pagination, date range, venue filter).

### Step 3: Frontend Wiring (DO NOT START YET)

Wire `src/app/page.js` to call the new API endpoint instead of querying Supabase directly. Replace the `.limit(80)` fetch with paginated API calls. Preserve all existing client-side filters (date, venue, distance) but move search to the server. Add "Load More" or infinite scroll.

**Do not touch this step until Steps 1 and 2 are reviewed and confirmed.**

### Step 4: UI Polish (DO NOT START YET)

Skeleton loading states, smooth infinite scroll, search debounce UX, empty states, error handling.

**Do not touch this step until Step 3 is reviewed and confirmed.**

## Critical Constraints

- **Read `HANDOVER.md` and `Agent_SOP.md` before writing code.** They contain safety locks that govern how events, artists, and templates interact.
- **Do not modify `src/app/page.js` or any frontend files in Steps 1–2.** Backend only.
- **Do not modify the existing `src/app/api/events/route.js`** if you create a new search route — the admin dashboard and other consumers may depend on its current shape.
- **The `events` table has NO `start_time` column.** Time lives inside `event_date` (timestamptz) and `is_time_tbd`. The `start_time` column is on `event_templates` only. Do not SELECT `events.start_time` — it will throw a PostgREST error and fail the query.
- **`event_image` is a VIRTUAL field** produced by `applyWaterfall` — it is NOT a real DB column. Do not SELECT it.
- **Preserve the Metadata Waterfall.** Title, category, image, and bio all resolve through a priority ladder (Admin Override → Template → Artist → Scraper). The new endpoint must respect this — see `src/lib/waterfall.js`.

## Tech Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14.2 (App Router) | Deployed on Vercel |
| UI | React 18 + Tailwind CSS | Client components (`'use client'`) |
| Database | Supabase (PostgreSQL) | PostgREST API, service role + anon keys |
| Client SDK | `@supabase/supabase-js` ^2.39 | `src/lib/supabase.js` |
| Auth | Custom admin password (Bearer token) | Public feed is unauthenticated |
| Cron | Vercel cron (6am/6pm Eastern) | `src/app/api/sync-events/route.js` |
| AI | Perplexity sonar-pro + Serper | Artist enrichment only, not relevant here |

## Your Immediate Deliverables

1. **Step 1:** The migration SQL file with `pg_trgm` (or `tsvector`) indexes + composite status/date index.
2. **Step 2:** The paginated search API route + test script.
3. A brief summary of architectural decisions (why offset vs cursor, why trgm vs tsvector, index sizing estimates if relevant).

Do NOT proceed to Step 3 or 4. We will review the backend together before touching the frontend. Let's go.
