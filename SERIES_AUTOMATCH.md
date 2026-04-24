# Scraper-Time Series Auto-Match — Design Brief

**Status:** Proposal (2026-04-23)
**Author:** Tony + Claude
**Depends on:** Phase 3 of Trust Refactor (#62) — "drop events.artist_bio + event_image_url, read live from artist join"
**Size estimate:** 3–4 hours of build + 1 hour of audit/backfill

---

## Problem statement

MyLocalJam has three inheritance mechanisms for metadata today, and there is a
visible gap between them:

1. **Artists** — performer-level bio + image + vibes + genres. Inherited via
   the `artist_id` join on every event. Works great when the thing recurring
   is a person.
2. **`event_templates`** — fixed-cadence recurring events (Taco Tuesday,
   Karaoke Nights). Linked at scrape time when title matches a known template.
   Works great when the thing recurring is a weekly named ritual.
3. **`event_series`** (shipped in Phase 1) — irregularly recurring named
   events (festivals, quarterly tribute nights, "Summer Kickoff 2026"). Linked
   **only at admin approval time** in the submission modal.

The gap is between (2) and (3): an event that recurs **sometimes**, that isn't
a weekly template, that the scraper has no way to know was approved with rich
metadata last time. When the scraper picks it up again, enrichment re-runs
from scratch — bio gets regenerated, image gets re-scraped, vibes get
re-inferred — and any admin edits from the prior occurrence are lost unless
the admin manually clicks the series dropdown in the approval modal every
single time.

Example: "Howl at the Moon Summer Series" at Boatyard 401. Admin curates bio
and image on the May 15 occurrence. Scraper finds the June 12 occurrence a
month later. Currently: new event row, fresh enrichment, no series link,
admin has to re-curate OR find-and-link in the modal. The approved metadata
from May 15 exists in the database but isn't reached.

This design extends `event_series` from admin-only linkage to
**scraper-time auto-match**, so events that have already been curated as part
of a series inherit on subsequent scrapes without admin intervention.

---

## Proposal

Add a matcher step to the scrape pipeline that runs **after** normalization
and **before** enrichment. For each incoming event:

1. Look up past + future events at the same `venue_id` whose normalized title
   is sufficiently similar to the incoming event's normalized title.
2. If a match is found **and** the matched event already has a `series_id`,
   set the incoming event's `series_id` to the same value. Skip enrichment
   for series-owned fields (they'll resolve via the series join).
3. If a match is found **and** the matched event is a standalone curated
   event (admin-edited, no `series_id`), **promote it**: create a new series
   row, set `series_id` on both the historical event and the new event.
   First promotion happens silently but is logged for admin review.
4. If no match or similarity below threshold, proceed with normal enrichment
   (no regression vs today's behavior).

The matcher is deterministic-first; AI is a tiebreaker, not the primary
mechanism.

---

## Match strategy

**Key: `venue_id` + normalized title trigram similarity.**

- `venue_id` is the coarse filter — a title-similar event at a different
  venue is almost never the same recurring series.
- Normalize titles before comparison: lowercase, strip punctuation, strip
  date-like tokens (`"May 15"`, `"5/15"`, `"2026"`), strip performer suffixes
  that already resolve via `artist_id` (`"with Mike Dalton"`, `"feat. ..."`)
  — otherwise the matcher gets fooled by the performer rotation, which is
  the thing that's *supposed* to vary across occurrences.
- Use `pg_trgm` `similarity()` with a threshold starting at **0.85**, then
  loosen based on audit. Too-strict is the safer failure mode — a missed
  match just means we fall back to today's behavior (no regression); a false
  positive means we inherit wrong metadata (visible bug).

**Candidate window:** ±180 days from the incoming event's date, at the same
venue. That's wide enough to catch annual events, narrow enough that a venue
that changes programming entirely won't drag stale series into the new era.

**Optional secondary signal:** category. If two candidates are above the
trigram threshold and one shares the incoming event's `category`, prefer it.

**AI as tiebreaker, not primary matcher.** When the deterministic filter
returns 3–5 candidates all above threshold (which will happen for venues
that run multiple adjacent series), send just those titles + bios to an LLM
and ask "which of these is the same recurring event as X?" Keeps cost low
(tiny prompts, cold only in the ambiguous case), keeps behavior auditable
(deterministic filter logs the candidate set, LLM decision logs the winner
and reasoning). Do **not** use the LLM as the primary matcher — 100% of
scrapes hitting the LLM is both expensive and noisy compared to pg_trgm.

---

## Inheritance scope — what transfers, what doesn't

This is the same question Phase 3 (#62) is already answering for artists,
and the answer should be consistent: **series owns narrative fields, events
own occurrence-specific fields.**

| Field | Inherits from series? | Rationale |
|---|---|---|
| `bio` / `artist_bio` | **Yes** | Narrative describes the series, not the night |
| `image_url` / `event_image_url` | **Yes** | Series has a canonical promo image |
| `vibes` / `genres` | **Yes** | Stable across occurrences |
| `category` | **Yes** | "Tribute Band Night" doesn't change category mid-run |
| `start_time` | **No** | Per-occurrence |
| `end_time` | **No** | Per-occurrence |
| `date` / `event_date` | **No** | Obviously per-occurrence |
| `ticket_link` | **No** | Different URL every time |
| `cover` / price | **No** | Varies per show |
| `artist_id` / `artist_name` | **No** | Performer rotates — that's what the artist waterfall is for |
| `custom_*` fields | **No** | Always admin override, never auto-inherited |

Field-ownership here is the same refactor Trust Phase 3 is doing for
artists: instead of **denormalizing** inherited fields onto events (which
caused today's ghost-merge cache-drift bug), resolve live via the series
join. If we ship auto-match **before** Phase 3, we'll just be recreating
that same cache-drift bug on a new axis. **This is the hard prerequisite.**

---

## Implementation sketch

### Schema
- `event_series` already has `id`, `name`, `slug`, `description`, `image_url`
  (verify current columns match this list — add `bio`, `vibes`, `genres`,
  `category` as needed).
- `events.series_id` already exists from Phase 1.
- Add `events.auto_matched_series` BOOLEAN — distinguishes "admin linked
  this" from "scraper auto-linked this" so the admin UI can flag auto-links
  for review without obscuring manual ones.

### Pipeline hook
New step in the scrape normalize → enrich pipeline, between normalization
and enrichment:

```
normalize(rawEvent)
  → matchSeries(normalizedEvent)   ← NEW
     ↓
     if matched:     set series_id, mark auto_matched_series=true, skip enrichment for series-owned fields
     if promoted:    create series, backfill historical event, set series_id on new
     if no match:    proceed to enrichment unchanged
  → enrich(normalizedEvent)
  → persist
```

### New file: `src/lib/seriesMatcher.js`
Exports `matchEventToSeries(normalizedEvent, { supabase })`:
- Query candidates via SQL: `venue_id = ? AND event_date BETWEEN now() - 180d AND now() + 180d AND similarity(normalized_title, ?) > 0.85 ORDER BY similarity DESC LIMIT 5`
- If 1 candidate → return match.
- If 2+ candidates → apply category filter → if still ambiguous, call LLM tiebreaker.
- If 0 candidates → return null.
- Returns `{ seriesId, promotedFrom, confidence, auditTrail }`.

### Admin surface
- Add "Auto-linked" badge to admin event view when `auto_matched_series = true`
  so admin can audit / unlink if the matcher got it wrong.
- First-promotion events (scraper created a new series from a historical
  curated event) should land in a review queue for 7 days before being
  treated as authoritative.

---

## Risks

1. **False positives.** A venue runs "Blues Night" in March and an unrelated
   "Blues Night Fundraiser" in April. Trigram says yes, but it's the wrong
   inheritance. Mitigation: start threshold high (0.85+), require category
   match when ambiguous, admin audit queue on first-promotion.
2. **Interaction with existing `template_id` and `artist_id`.** An event
   could in theory hit all three — template match, artist match, series
   match. Precedence: custom_* > series > template > artist. Need to make
   this explicit in the waterfall, not leave it to whichever field happens
   to get populated first.
3. **Custom overrides on auto-inherited events.** If admin later edits
   `custom_bio` on an auto-matched event, that edit must persist even when
   the series bio changes. This is just the existing custom_* waterfall rule
   — but worth calling out in tests.
4. **Regression on today's cache-drift class.** If Phase 3 isn't done first,
   we'll be writing denormalized `artist_bio` / `event_image_url` copies of
   series fields onto events, and the next merge-like operation will leave
   those drifted. Block on #62.
5. **Trigram performance.** `pg_trgm` similarity with an index on
   `normalized_title` is fast up to mid-five-digit event counts; verify with
   EXPLAIN on current event table size before shipping. If slow, add a
   GIN trigram index on `normalized_title`.

---

## Acceptance criteria

- [ ] Scraper picks up a previously-curated event at the same venue with a
      similar title → new event inherits `series_id`, bio, image without
      admin intervention.
- [ ] Scraper picks up a new event at a venue with no prior match → behaves
      identically to today (enrichment runs from scratch).
- [ ] First-time match against a curated standalone event → series is
      auto-promoted, lands in admin review queue, both events carry
      `series_id`.
- [ ] Admin can see "auto-linked" badge in event admin view and unlink if
      needed.
- [ ] Custom_* overrides on auto-matched events survive series metadata
      changes.
- [ ] No regression on artist-level bio/image waterfall.

---

## Why this is worth doing

The curation work Tony does on approved events currently has a **half-life
of one occurrence**. For true weekly events that's fine (templates handle
it). For one-off events that's also fine (no recurrence). For the middle
tier — summer series, quarterly tribute nights, monthly standups — the
curation decays because the scraper has no memory. This proposal gives the
scraper that memory, using infrastructure (`event_series`) that already
exists and a matcher step that's cheap, auditable, and fails safely.

Dependency note: **do not build this before Phase 3.** The whole point is
to make inheritance cleaner, and denormalizing inherited fields onto events
would replicate the exact cache-drift failure mode that cost a week of
ghost-fireplace bugs to track down.

---

## Open questions

1. **Series vs template overlap.** If an event matches both a template and
   a series, which wins? Suggest: series > template (series is more
   specific — it's a named instance, template is a pattern).
2. **Cross-venue series.** "Howl at the Moon Tour" plays three different
   venues on three nights. Current proposal ties match to `venue_id`, so
   each venue would get its own auto-promoted series. Probably wrong. Punt
   for v1 (no cross-venue match); revisit if the data shows this matters.
3. **Naming the auto-created series.** When scraper promotes a standalone
   into a series on first match, what's the series name? Suggest: use the
   normalized title of the earliest matched event, flag for admin rename in
   the review queue.
4. **Title normalization rules** — which date/performer tokens to strip —
   need a small test suite against real scraped titles before shipping.
