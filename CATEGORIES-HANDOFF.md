# Category / Shortcut System — Handoff Note

Temporary scratch file. Delete when this work is shipped.

> **Apr 25 update:** The Festivals tab is now the **Event Series** tab and queries `event_series` directly. Sea Hear Now 2026 migrated. The `series_id` FK is the new way taxonomy attaches to events for series/festivals — separate from the category/shortcut system this doc covers, but worth knowing about because some shortcut-pill candidates (e.g. "Festivals") could now key off `event_series.category = 'festival'` instead of substring-matching `event_title`. Worth revisiting when you resume.

## Where we are

Finished mapping the architecture. Haven't run a data audit or picked a strategy yet.

## What the system looks like today

**Shortcut pills** are hardcoded at `src/app/page.js:115-125`. Each declares a `filter_type`:

| Pill | filter_type | How it matches |
|---|---|---|
| Live Music | keyword | substring in event title/name/description/category |
| Happy Hour | keyword | substring in event text |
| Nightlife | time | start_time >= 21:00 |
| Breweries | venue_type | `venues.venue_type` in `['Brewery','Brewpub']` |
| Karaoke | keyword | substring match |
| Trivia | keyword | substring match on "trivia" or "quiz" |
| Outdoor | venue_tag | `venues.tags[]` includes Outdoor / Patio / Rooftop |
| Dog Friendly | venue_tag | `venues.tags[]` includes Dog Friendly / Pet Friendly |

**Filter logic** runs client-side in a big `useMemo` at `src/app/page.js:1463-1597` after the server returns paginated events from `/api/events/search`.

**Three overlapping category concepts** fight each other:

1. `events.category` (text, waterfall-resolved: scraper → template → admin override) — what the keyword pills search
2. Artist `genres[]` / `vibes[]` arrays — flow into events only when `artist_name` matches a real artist row
3. Venue `venue_type` / `tags[]` — only source for Breweries / Outdoor / Dog Friendly

**Waterfall cascade** lives in `src/lib/waterfall.js`: overrides → template → event → artist → venue. Resolved fields materialize as `artist_genres`, `artist_vibes`, `venue_type`, `venue_tags` at API response time (`/api/events/search/route.js:133-173`).

**Dead code to know about:** there's a `shortcut_pills` Supabase table + a `dbPills` fetch at `page.js:1037-1058` that's meant to drive seasonal/admin-curated pills. Fetched but never actually used in the filter — the filter always falls back to the hardcoded array.

## Specific accuracy red flags

- **"Dog Friendly"** has no event-level or artist-level data. Depends entirely on venue tagging. If a venue isn't tagged "Dog Friendly" exactly, zero events surface.
- **"Happy Hour"** requires the literal string "happy hour" in event text. An event titled "5-9pm Specials" doesn't match.
- **"Nightlife"** silently drops events with null or `00:00` start_time (many scraped events default to midnight).
- **Breweries** requires `venue_type` to be exactly `"Brewery"` or `"Brewpub"` — needs a values audit.
- **Duplicate taxonomy:** "Rock" could live in `artist.genres`, `event.category`, `event.custom_genres`, or nowhere.

## Next step when you resume

**Run a data audit via Supabase.** Questions to answer:

1. How many events have a non-null `category`? What's the distinct set of `category` values actually in the table?
2. What % of events link to an `artist_id` (thus inherit genres/vibes)?
3. What distinct `venue_type` values exist? What % of venues have `tags` populated?
4. How many events would each current pill return if we ran it today?

That tells us whether this is a **"fix the data"** problem or a **"fix the schema"** problem.

## Three strategic directions to choose between (after audit)

- **A. Centralize on a canonical `event.category` enum.** One source of truth, populated via scraper rules → template → AI fallback → admin. Pills all query that one column. Simpler, but requires a taxonomy decision.
- **B. Keep the multi-signal architecture, fix the weak spots.** Make pills smarter (e.g., "Happy Hour" = keywords OR venue-serves-alcohol + start_time 4-7 PM OR venue tags). More flexible, more code.
- **C. Admin-driven venue curation.** Invest in the venue editor so tagging Dog Friendly / Outdoor / Brewery is trivial. Accept event-level category is hard; venue-level is tractable (~hundreds of venues, not thousands).

**My lean (pre-audit):** A + C combined. Enum-backed `event.category` as the primary filter signal, plus a venue-tag system for venue-inherent traits. Validate with audit numbers first.

## Open tasks (in TaskList)

- #22 — Audit category data coverage + accuracy (pending)
- #23 — Propose enrichment strategy (pending, blocked on #22)

## Files worth having open when you resume

- `src/app/page.js:115-125` (SHORTCUT_PILLS array)
- `src/app/page.js:1463-1597` (filteredEvents useMemo with filter logic)
- `src/app/page.js:1037-1058` (dbPills fetch — dead code)
- `src/app/api/events/search/route.js:133-173` (transformEvent — materializes resolved fields)
- `src/lib/waterfall.js` (override → template → event → artist → venue cascade)
- `src/components/EventFormModal.js` (admin event editor, custom_genres / custom_vibes)
- `supabase/migrations/` (relevant: `phase2_shortcut.sql`, `20260421_event_series.sql`)
- `src/app/api/admin/auto-categorize/route.js` (existing LLM categorize endpoint — worth inspecting)

## Parking lot: future enrichment ideas

### Auto-templates from event history (venue + title match)

**The problem it solves:** Non-artist recurring events (Trivia Night, Karaoke, Open Mic, Happy Hour specials, etc.) can't benefit from artist-based inheritance because there's no `artist_id` to fall back on. Today they rely on manually-created `event_templates` rows — 18 exist and only link to ~5% of events.

**The idea:** At sync time, if a new event has no matched artist, search for sibling events at the **same venue** with a **similar event name / title**. If a trusted sibling exists (`is_human_edited=true` OR `is_category_verified=true`), inherit its `description`, `image_url`, `category`, `start_time`, and `custom_genres`/`custom_vibes`. Treat this as an implicit template derived from history, without the admin having to create one explicitly.

**Where it slots in the waterfall (Agent_SOP L2):**

```
L1  Human Edits
L2a Explicit Templates (template_id)        ← existing
L2b Implicit Venue Templates (derived)      ← this idea
L3  Artist Defaults
L4  AI Inference
L5  Raw Scraper
```

**Hardest part: title matching.** Scraped strings are messy ("Trivia Night" / "Tuesday Trivia" / "TRIVIA @ The Crab's" / "Quiz Night"). Three levels of sophistication to consider:

1. Normalized exact match (strip whitespace, digits, filler words like night/every/weekly) — fast, deterministic, safe, probably catches 60-70% of trivial cases
2. Fuzzy via Postgres `pg_trgm` trigram similarity — catches 80-90%, risk of false positives
3. LLM match ("are these the same recurring event?") — highest precision, costs money + latency

Start at #1, measure gap, add #2 only if needed.

**Before building, run a Phase 0 data probe:**
- How many upcoming events have `artist_id IS NULL`?
- Among those, how many share a `venue_id` with ≥1 past/upcoming sibling?
- What are the most common titles (ranked by recurrence)?

If recurring non-artist events are common enough (my guess: 100-200 events/year worth), it's worth building. If they're rare, skip and keep explicit templates as-is.
