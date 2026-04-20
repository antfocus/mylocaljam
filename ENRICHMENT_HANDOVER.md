# Data Enrichment Pipeline — Session Handover

## Project Context

**MyLocalJam** is a Next.js 14 live-music discovery app for the Jersey Shore (Asbury Park, Red Bank, etc.). It scrapes ~45 venue websites nightly, stores events in Supabase (Postgres), and displays them with artist bios, images, and genre tags. We're preparing for launch and need to backfill metadata on hundreds of unenriched artists.

**Stack:** Next.js 14 (App Router), Supabase (Postgres), Tailwind, Vercel Hobby tier (60s function limit), Framer Motion.

**Repo root is the folder you have mounted.** All paths below are relative to it.

---

## What Was Just Built (April 20, 2026)

I built the foundation of the enrichment pipeline in the previous session. All files are committed and syntactically valid but **have NOT been tested end-to-end yet**. Here's what exists:

### 1. LLM Router — `src/lib/llmRouter.js` (NEW)

Multi-provider LLM abstraction with automatic failover:
- **Gemini 2.5 Flash** (primary) — `GOOGLE_AI_KEY` env var, user's $20/month plan
- **Perplexity sonar-pro** (web-grounded specialist) — `PERPLEXITY_API_KEY` env var
- **Grok** (overflow backup) — `XAI_API_KEY` env var — **NOT configured yet, skip for now**

Key exports:
- `callLLM(systemPrompt, userPrompt, options?)` → parsed JSON | null
- `callLLMWebGrounded(systemPrompt, userPrompt)` → Perplexity-first routing
- `callPerplexityWithFallback(systemPrompt, userPrompt)` → backward compat
- `getUsageStats()` → in-memory call/failure/rateLimit counters
- Options: `{ route: string[], webGrounded: bool, preferProvider: string }`

**IMPORTANT:** The router is built but **not yet wired into `aiLookup.js`**. Currently `aiLookupArtist()` still calls the old `callPerplexity()` function directly (line 491 of aiLookup.js). This needs to be migrated to use `callLLMWebGrounded()` from the router.

### 2. Priority Scoring — `src/lib/enrichmentPriority.js` (NEW)

`fetchPrioritizedArtists({ limit, bareOnly })` returns unenriched artists ranked by:
- Day-of-week weight: Thu–Sun = 2x (when people go out)
- Completeness: bare (no bio AND no image) = 2x
- Recency: 10/daysAway (tomorrow's events score 10x vs. 30 days away)
- Deduplicates at artist level (one artist at 4 venues = 1 enrichment call)

### 3. Backfill Endpoint — `src/app/api/admin/enrich-backfill/route.js` (NEW)

`POST /api/admin/enrich-backfill` — batch processes 20-25 artists per call:
- Auth: `Authorization: Bearer {ADMIN_PASSWORD}`
- Body: `{ batchSize?: number, bareOnly?: boolean }`
- Returns: `{ ok, batch, enriched, remaining, errors, duration, usageStats }`
- Designed for client-driven loop (UI fires POST, gets progress, re-fires until `remaining === 0`)

### 4. Bio Limit Reduced — `src/lib/aiLookup.js` (MODIFIED)

`BIO_MAX_CHARS` changed from 500 → 250 everywhere (constant, all prompt text, all comments). The LLM system prompt and client-side trim both enforce 250 chars now.

### 5. OCR Rate Limit Handling — `src/lib/visionOCR.js` (MODIFIED)

Added 429 retry logic: tries Gemini Flash, retries Flash once with backoff, then falls back to Gemini Pro. Also handles 500/503 with model fallback.

### 6. Sync Enrichment Cap Raised — `src/app/api/sync-events/route.js` (MODIFIED)

Line ~1088: uncached artist enrichment cap raised from 30 → 50 per nightly sync.

---

## Existing Enrichment Architecture (What Already Works)

### The Waterfall — `src/lib/enrichArtist.js`

Universal pipeline called during nightly sync for every new artist:
1. **MusicBrainz** → MBID identity + Wikidata image (rate: 1 req/sec)
2. **Discogs** → Artist image fallback (rate: 1 req/min token)
3. **Last.fm** → Biography, genre tags, image fallback
4. **AI Fallback** → `aiLookupArtist()` when all three miss (common for local Jersey Shore bands)

### The AI Lookup — `src/lib/aiLookup.js`

`aiLookupArtist({ artistName, venue, city, autoMode })`:
- **Pass 1:** Classify (MUSICIAN vs VENUE_EVENT) + bio + image + source_link (Perplexity sonar-pro)
- **Pass 2:** Genre + vibe tagging (skipped for VENUE_EVENT)
- **Pass 3:** Serper image fallback if Perplexity returned no image
- Has a Classification Fork that prevents writing musician bios onto trivia nights
- `callPerplexity()` (line 297) is the low-level API call — this is what should be swapped to use the LLM router

### The Magic Wand — `src/app/api/admin/enrich-date/route.js`

Single-day bulk enrichment triggered from admin UI:
- Input: `{ date: 'YYYY-MM-DD' }` or `{ eventId: 'uuid' }`
- Smart Fill: fills blanks even on locked rows (rescues stale locks)
- Uses `aiLookupArtist` with venue+city context
- 40 artist cap per call, 300ms throttle

### Write Guards — `src/lib/writeGuards.js`

- `isFieldLocked(cached, fieldName)` — checks both JSONB per-field `{bio: true}` and boolean `true`
- `buildLockSafeRecord(cached, record)` — strips locked fields from upsert payload
- Human-edited fields are NEVER overwritten

---

## Database Schema (Key Columns)

**`events` table:**
- `id`, `artist_name`, `artist_id` (FK → artists), `event_date` (timestamptz), `venue_name`
- `image_url`, `event_image_url`, `custom_image_url` — image columns (legacy layering)
- `artist_bio` — denormalized bio on the event row
- `is_human_edited` (boolean), `is_locked` (boolean)
- `category`, `is_category_verified`, `category_source`, `template_id`
- `status` ('published', 'draft', etc.)

**`artists` table:**
- `id` (UUID), `name` (UNIQUE), `bio`, `image_url`, `genres` (array), `tags` (text)
- `mbid`, `image_source`, `bio_source`, `metadata_source`
- `is_human_edited` (JSONB — `{bio: true, image_url: true}` or boolean `true`)
- `is_locked` (boolean), `last_fetched` (timestamptz)
- `default_category` — admin override for auto-categorization

**`artist_aliases` table:**
- `artist_id` (FK), `alias_lower` — fuzzy name matching

---

## Env Vars Available

- `GOOGLE_AI_KEY` — Gemini (already in .env.local + Vercel)
- `PERPLEXITY_API_KEY` — Perplexity sonar-pro (already configured)
- `SERPER_API_KEY` — Google Images fallback (already configured)
- `LASTFM_API_KEY` — Last.fm (already configured)
- `ADMIN_PASSWORD` — auth for admin endpoints
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase
- `XAI_API_KEY` — Grok (**NOT configured, skip for now**)

---

## What Needs To Happen Next

### Priority 1: Wire the LLM Router into aiLookup.js

The `callPerplexity()` function in `aiLookup.js` (line 297) is the low-level API wrapper. The new `callLLMWebGrounded()` from `llmRouter.js` should replace it as the default path in `aiLookupArtist()`. The router tries Gemini first (higher quota), falls back to Perplexity (web-grounded), then Grok.

**Key consideration:** Perplexity has built-in web search which helps for artist research. Gemini does not. For bio/image lookup (Pass 1), web-grounding matters. For genre/vibe tagging (Pass 2), it doesn't — any LLM can do that from the bio text alone. So the routing should be:
- Pass 1 (bio + image): `callLLMWebGrounded()` — Perplexity first
- Pass 2 (genre/vibe tagging): `callLLM()` — Gemini first (cheaper, doesn't need web)

### Priority 2: Test the Backfill Endpoint

Run a small test batch against the live Supabase DB:
```
curl -X POST https://mylocaljam.vercel.app/api/admin/enrich-backfill \
  -H "Authorization: Bearer freshdoily" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 3}'
```
Or test locally with `npm run dev` and hit `localhost:3000/api/admin/enrich-backfill`.

### Priority 3: Build Admin UI for Backfill

The admin panel needs a "Run Backfill" button that:
1. Fires POST to `/api/admin/enrich-backfill`
2. Shows progress (X/Y artists enriched, Z remaining)
3. Auto-re-fires until `remaining === 0`
4. Displays errors and LLM usage stats

### Priority 4: Quality Audit

After running a batch, check the results:
- Are bios actually ≤250 characters?
- Are bios neutral/informative (no hype words)?
- Are VENUE_EVENT items being classified correctly (trivia, karaoke, etc.)?
- Are images real artist photos (not stock/placeholder)?
- Are genres sensible?

### Priority 5: Update Documentation

Update `HANDOVER.md` and `SCRAPERS.md` with the enrichment pipeline details once everything is tested and working.

---

## Key Constraints

- **Vercel Hobby tier = 60s function timeout.** Batch sizes must stay at 20-25 artists max. The client-driven loop pattern handles this.
- **Perplexity billing.** Each `aiLookupArtist` call = 2 API calls (Pass 1 + Pass 2). At ~$0.005/call, a 200-artist backfill ≈ $2. Not expensive but don't waste on re-enriching cached artists.
- **Rate limits.** MusicBrainz 1/sec, Discogs 1/sec, Last.fm 5/sec. The waterfall in enrichArtist.js already handles this with 1100ms delays.
- **Lock system.** Never overwrite `is_human_edited` or `is_locked` artist data. The write guards handle this but double-check any new write paths.
- **Classification Fork.** The MUSICIAN vs VENUE_EVENT distinction is critical. Without it, the LLM writes fictional band bios for "Taco Tuesday" entries.
