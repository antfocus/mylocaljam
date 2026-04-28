# myLocalJam — Data Lifecycle

> **Purpose.** The system reference for how data enters, changes, and leaves myLocalJam. Entity model, every CRUD operation, the invariants that hold across all of them, the canonical user-submission/approval flow, and current drift findings.
>
> **What this doc is NOT.** Not a feature plan (those live per-feature: `ANALYTICS_PLAN.md`, etc.). Not a skill manual (those live per-skill: `ENRICHMENT.md`, `IMAGE-MANAGEMENT.md`, `FRONTEND_SOP.md`, `SCRAPERS.md`, `SERIES_AUTOMATCH.md`, `VENUE_MANAGEMENT.md`). Not a session log (`HANDOVER.md`). Not a backlog (`PARKED.md`). This doc tells you *what data exists, what operations can change it, and what must always be true* — regardless of when you read it.
>
> **When to update this doc.** Whenever you (a) add a new table, column, or relationship; (b) introduce a new code path that creates/updates/deletes any of these entities; (c) discover a new invariant violation in the wild. The doc is meant to stay current — old entries in §6 get crossed out as they're fixed, new ones get added as they're found.

---

## §1. Entity model

The public feed is built from six core tables. Each owns specific fields; cross-entity drift is the source of most observable bugs.

**`artists`** — the canonical roster of musicians, DJs, comedians, billing names, and event-only acts. Owns: `name`, `bio`, `image_url`, `genres`, `vibes`, `aliases` (`alias_names text[]`), `mbid`, `kind` (`musician` / `billing` / `event`), `is_locked`, `is_human_edited` (jsonb per-field). One canonical row per real-world act. Source-of-truth for artist metadata that gets joined into events.

**`events`** — individual instances of something happening at a venue on a specific date+time. Owns: `event_date`, `start_time`, `event_title`, `category`, `cover`, `ticket_link`, `source` (scraper origin URL), `status` (`published` / `cancelled` / etc.), `template_id`, `artist_id`, `venue_id`. Carries denormalized copies of `artist_name` and `venue_name` for resilience when scrapers haven't yet linked the FK. Per-event admin overrides live in `custom_*` columns (`custom_title`, `custom_bio`, `custom_image_url`, `custom_genres`, `custom_vibes`, `is_custom_metadata`).

**`venues`** — the physical (or logical) places events happen. Owns: `name`, `address`, `city`, `website`, `photo_url`, `latitude`, `longitude`, `venue_type`, `tags`, `default_start_time`, `slug`, `color`. See `VENUE_MANAGEMENT.md` for the full skill of maintaining venue rows.

**`event_templates`** — recurring/repeating events that share editorial metadata. A weekly trivia night, a monthly residency, "Snow Crabs! (All You Can Eat)." Owns: `template_name`, `bio`, `image_url`, `category`, `start_time`, `genres`, `aliases`. Multiple events can link to one template via `events.template_id`. The waterfall reads from templates when an event row's own fields are blank.

**`event_series`** — parent rows for festivals and named series with multiple child events ("Sea.Hear.Now," "Asbury Park Music in Film"). Owns: `name`, `slug`, `category`, `banner_url`, `description`, `start_date`, `end_date`. Children link via `events.series_id`. Distinct from templates: a template is *editorial repetition*; a series is a *named umbrella* over a finite set of dated events.

**`submissions`** — community-submitted events sitting in a triage queue before they hit the public feed. Owns: `status` (`pending` / `approved` / `rejected`), `artist_name`, `venue_name`, `event_date`, `category`, plus everything an admin needs to decide. On approval, the submission becomes a row in `events` (status `published`) and the submission is marked `approved`. See §5 for the canonical flow.

There are also smaller tables (`favorites`, `flags`, `following`) and a `town_aliases` table planned for `VENUE_MANAGEMENT.md`. Those don't drive feed content; they're orthogonal.

---

## §2. Operations matrix

Every way data gets created, changed, or removed. Each cell calls out *which code path* performs the operation and *which invariants apply*. Use this as a checklist when adding a new code path: if your code creates an event row, every "Create event" cell below must hold true after your code runs.

### Create

| Entity | Code paths that create | Invariants |
|---|---|---|
| `events` | Scraper sync (`/api/sync-events`), admin manual create (`AdminEventsTab` → `POST /api/admin`), submission approval (`POST /api/admin/queue` from `AdminSubmissionsTab`), community submit (`POST /api/submissions`) | (a) `status` must be one of the published states. (b) `category`, when set, must be canonical per `taxonomy.js`. (c) If linked to an artist, `artist_name` SHOULD equal `artists.name` (drift mitigation, see §6). (d) `event_date` is timestamptz UTC; display conversion to Eastern happens at render time. (e) See `ENRICHMENT.md` §5 for lock semantics on subsequent writes to this row. |
| `artists` | Scraper auto-creation (sync detects a new `artist_name`, inserts a row), admin manual create, AI enrichment first-time-seeing-this-name | (a) `name` must be non-empty after trim. (b) `kind` defaults to `musician` until classification proves otherwise; do NOT treat unset `kind` as "musician" without checking. (c) `is_locked` defaults `false`. (d) See `ENRICHMENT.md` §1–§3 for the quality bar before this row is enrichment-eligible. |
| `venues` | Admin manual create only (intentional — scrapers must NOT create venue rows ad-hoc) | See `VENUE_MANAGEMENT.md` for required-field invariants. |
| `event_templates` | Admin manual create (Magic Wand from a "No Match" event), admin templates tab, AI seed (`/api/admin/event-templates/seed`) | (a) `category` must be canonical per `taxonomy.js`. (b) `template_name` is the editorial label; raw scraper alias goes in `aliases`, not `template_name`. (c) See `ENRICHMENT.md` for image/bio quality. |
| `event_series` | Admin manual create, find-or-create dedup in `POST /api/admin/queue` (when a submission ticks "is series") | (a) `slug` is the dedup key — find-or-create reuses on slug match. (b) `category` defaults to `'festival'` if the submission flagged series. See `SERIES_AUTOMATCH.md`. |
| `submissions` | Community submit only (`POST /api/submissions`) | (a) `status` always starts `pending`. (b) Free-text fields are sanitized but not normalized to canonical values until approval. |

### Edit

| Entity | Code paths that edit | Invariants |
|---|---|---|
| `events` | Admin form save (`POST /api/admin`), sync (`/api/sync-events` may overwrite *unlocked* fields when re-scraping), enrichment (`/api/admin/enrich-date`), Smart Fill rescue, auto-categorize (`/api/admin/auto-categorize`) | (a) Lock semantics from `ENRICHMENT.md` §5 (Lock System) apply. `is_human_edited = true` means "don't clobber populated fields"; blank fields on a locked row are still fillable via Smart Fill. (b) `category` must be canonical (`taxonomy.js`). (c) The waterfall priority `Admin Override → Template → Linked Artist → Raw Scraper` is canonical — see Agent_SOP §0 (migrating to `ENRICHMENT.md`) for the cross-cutting invariants. |
| `artists` | Admin form save (`PUT /api/admin/artists`), AI enrichment (`/api/admin/enrich-date`, `/api/enrich-artists`, `/api/admin/enrich-backfill`), merge (writes to `alias_names` on canonical) | (a) Per-field JSONB locks via `is_human_edited` block automated overwrites of populated fields. The PUT handler strips locked-field updates unless the same request explicitly unlocks. (b) See `ENRICHMENT.md` for the prompt and waterfall. |
| `venues` | Admin form save only | See `VENUE_MANAGEMENT.md`. |
| `event_templates` | Admin templates tab, AI lookup (`/api/admin/event-templates/ai-lookup`) | (a) `category` canonical. (b) Per-field locks honored. |
| `event_series` | Admin series tab (`PUT /api/admin/series/[id]` — pending Phase 3), automatic backfill from existing `event_title` values (planned, see Phase 2) | Slug uniqueness on rename — disallow rename or re-slug + collision-check. |
| `submissions` | Admin Approve (sets `status='approved'`), admin Reject (sets `status='rejected'`) | Status transitions are one-way: pending → approved or pending → rejected. No re-opening. |

### Delete

| Entity | Code paths that delete | Invariants |
|---|---|---|
| `events` | Admin (`DELETE /api/admin?id=…`), test-data cleanup. Soft-cancel via `status='cancelled'` is preferred over hard delete for any event the public has seen. | Hard delete is destructive; the row is gone. Cancel-via-status preserves the historical record and any user favorites/flags pointing at it. |
| `artists` | Admin merge (deletes the source row after reassigning events). Direct admin delete should be rare. | (a) Before deletion, ALL `events.artist_id` references must be reassigned (or NULLed). FK constraints prevent the delete otherwise. (b) Source `name` should be pushed into the target's `alias_names` first so future scrapes route to canonical. (c) Artist-merge cleanup is a `VENUE_MANAGEMENT.md`-style skill; the Kevin Hill cluster is the documented pattern. |
| `venues` | Admin only, very rare. Prefer soft-cancel (a `status` flag — not yet implemented) over hard delete. | Hard delete cascades to events via FK. Don't. |
| `event_templates` | Admin templates tab. | Detach `events.template_id` first — leaving it dangling means the FK breaks. Or set ON DELETE SET NULL via migration. |
| `event_series` | Admin series tab. | Detach `events.series_id` first. |
| `submissions` | Admin (rare — usually the row is just rejected). | If deleted post-approval, the spawned event in `events` is unaffected. |

### Merge / link / unlink

| Operation | Code paths | Invariants |
|---|---|---|
| Merge artists | Admin merge UI (currently incomplete — leaves source rows; see Kevin Hill case in §6) | Reassign all `events.artist_id`, push source name into target `alias_names`, normalize `events.artist_name` to canonical, then delete source. Four-step transaction. |
| Link event → artist | Sync (auto-detect by name match or alias match), admin form (manual FK pick) | When linking, `events.artist_name` should be set to the canonical `artists.name`. Drift here causes ghost-artist autocomplete entries (see §6). |
| Link event → template | Sync (auto-match by alias), admin Linking Station dropdown, Magic Wand (creates + links in one step) | Linking a template doesn't auto-rewrite `events.event_title` — the waterfall handles display priority. |
| Link event → series | Find-or-create on submission approval (slug-based dedup), admin manual link, planned Phase 2 backfill | Slug match in `event_series.slug` is the dedup key. |
| Link event → venue | Sync (auto-match by name), admin form. NOT auto-creation — venues are admin-curated only. | Mismatches between scraper-emitted venue names and canonical venue rows produce duplicate venue creation attempts; mitigated by venue name aliases (`VENUE_MANAGEMENT.md` §5). |

---

## §3. Cross-cutting invariants

Read these alongside the per-skill invariants in the destination docs. The skill-level invariants are more specific; the ones here apply system-wide.

1. **Canonical category strings.** Every write to `events.category` or `event_templates.category` MUST normalize to a canonical key in `src/lib/taxonomy.js`. Use `normalizeCategory(input)` at every ingestion boundary; reject (or flag) anything that returns null. The home-page filter pills and admin dropdowns all import from `taxonomy.js` — drift between writers breaks search results silently.

2. **Lock semantics across all enrichment writers.** `is_human_edited = true` means "don't clobber populated fields." It does NOT mean "skip the row entirely." Blank fields on a locked row remain Smart-Fill-eligible. Per-field JSONB locks on `artists.is_human_edited` are stripped from incoming writes by the PUT handler unless the same request explicitly unlocks. Full detail: `ENRICHMENT.md` §5 (Lock System).

3. **Waterfall priority.** Resolution is `Admin Override → Template → Linked Artist → Raw Scraper`. Higher tiers win absolutely. The five-field ladder (Title, Category, Start Time, Description, Image) is canonical. Full detail: `ENRICHMENT.md` §4 (Metadata Waterfall) and the Triple Crown appendix.

4. **No phantom columns on events.** `event_image` is a VIRTUAL field produced by `applyWaterfall` in `src/lib/waterfall.js`. It is NOT a DB column. Don't SELECT it (PostgREST drops the row); don't WRITE to it (silent no-op). Real image columns: `custom_image_url`, `event_image_url`, legacy `image_url`. Mirror caveat: `events.start_time` is a real column but the canonical resolved `start_time` comes from the template join + event_date extraction; see the waterfall.

5. **`artist_name` ↔ `artists.name` parity.** When an event is FK-linked to an artist (`artist_id IS NOT NULL`), the denormalized `events.artist_name` SHOULD equal `artists.name`. Drift here surfaces as ghost autocomplete entries and confuses search ranking. Backfilling is part of the merge workflow (see Kevin Hill case in §6).

6. **`venues.website` ≠ `events.source`.** `events.source` is the SCRAPER ORIGIN URL (where the row came from); `venues.website` is the venue's OFFICIAL website. The 🌐 Venue button in `EventCardV2.js` and `SiteEventCard.js` prefers `venue_website` (joined from the venues table) and falls back to `source` only when the venue row has no website set. Don't conflate them.

7. **Submissions are a one-way pipeline.** A submission row's `status` only moves forward (pending → approved or pending → rejected). Approving spawns an event in the `events` table; rejecting changes nothing on the public feed. There is no "un-approve" path; if needed, the spawned event gets `status='cancelled'`.

---

## §4. The user submission → approval → publication pipeline

This was originally documented in `ARCHITECTURE-PLAN.md` Category 2; lifting the canonical flow here so it lives in the right doc. The bug-fix REQs (E1 reject button wiring, E2 approve-updates-status, E3 Discord webhook) live in `PARKED.md` until they're picked up.

```
Community user
    │
    ▼  POST /api/submissions
    submissions table (status: pending)
    │
    ├─▶ (planned) Discord webhook fires → admin alert
    │
    ▼
Admin opens AdminSubmissionsTab
    │
    ├─▶ Approve action
    │       ├─▶ POST /api/admin/queue
    │       │       ├─▶ INSERT into events (status: published)
    │       │       ├─▶ Find-or-create event_series (if "is series" ticked)
    │       │       ├─▶ Find-or-link artist row (by name match + aliases)
    │       │       └─▶ Find-or-link venue row (by name match + aliases)
    │       └─▶ PATCH /api/submissions (status: approved)
    │       → Event appears on public feed
    │
    └─▶ Reject action
            └─▶ PATCH /api/submissions (status: rejected)
                → Submission stays in queue with rejected badge; nothing
                  appears on public feed
```

Invariants on this pipeline:

- The submission's status flips ONLY after the events insert succeeds. If insert fails, submission stays pending and the admin can retry. (Today this is not actually atomic — the approve handler fires two separate requests, and a partial failure leaves the submission as pending while a row exists in events. PARKED.md REQ-E2 tracks the fix.)
- Every approval produces exactly ONE row in events. Duplicate prevention (same artist + venue + date already exists from a scraper) is the admin's responsibility today; HANDOVER §Test C documents the duplicate-on-approval pattern.
- Find-or-create on series uses slug as the dedup key. Slug normalization: `toLowerCase → replace non-alphanumeric with dashes → trim → slice(80)`.

---

## §5. Current drift findings

Specific invariant violations we've observed in the wild. Each entry references the invariant from §3 it violates, the scope (how many rows), and the fix path. Cross out fixed entries; add new ones as they're found.

### 5.1 — Category drift (~~99~~ → 64 events disagree with linked template)

*Violates §3.1 (canonical category strings).*

Pre-April-27 audit: 99 upcoming events had `events.category` ≠ `event_templates.category` for their linked template. After the April 27 taxonomy migration (events 11→7 distinct values, templates 10→5, all on-canonical), the count dropped to 64. The remaining gap is a mix of (a) deliberate event-level overrides where the human chose a different category than the template, and (b) lingering cascade damage where the events.category was set incorrectly by AI or scraper before locks.

**Status:** Partial — taxonomy is canonical, drift count needs case-by-case review.
**Next:** Pull the 64 rows and decide per-row whether template or event wins. Likely: a one-shot migration that picks the template's category for anything where `is_human_edited = false`, leaves `is_human_edited = true` rows alone for human review.

### 5.2 — Orphan artist rows post-merge

*Violates §2 Delete-artist invariants (must reassign + push aliases + delete source).*

The admin merge UI updates `events.artist_id` to point to the canonical row but leaves the source row in the artists table. April 27 cleanup of the Kevin Hill cluster found 6 artist rows that should be 2; the other 4 were orphans with 0 events linked OR linked-but-name-drifted.

**Status:** Hand-fixed for Kevin Hill cluster (2 canonical rows + 6 alias names recorded). Pattern is general — other clusters likely have the same problem.

**Next:** Run a similar audit + cleanup across all `artists` rows that have `is_locked = false AND events_linked_count = 0 AND alias_names = '{}'`. These are the "definitely orphan" rows. Tracked in PARKED.md as a follow-on to the Kevin Hill cleanup.

### 5.3 — `events.artist_name` drift from `artists.name`

*Violates §3.5 (artist_name ↔ artists.name parity).*

Post-Kevin-Hill cleanup: events FK-linked to canonical "Kevin Hill" still had `artist_name` values like "Burning sun", "KEVIN HILL" (uppercase), and similar. Most of these came from raw scraper data that was never normalized.

**Status:** Backfilled for Kevin Hill cluster's known aliases. Anomalies (like "Burning sun") flagged for human review — left untouched by automated cleanup.

**Next:** A general backfill that, for every event with a non-NULL `artist_id`, compares `artist_name` to the canonical `artists.name` and updates if the current value matches a known alias on that artist. Anomalies (no match in canonical OR aliases) get flagged for human triage.

### 5.4 — Search punctuation mismatch

*Violates the implicit "user query intent should match source data" contract on the public search.*

Before April 27, a single-substring ILIKE meant `"Snow Crabs! (All You Can Eat)"` (autocomplete-filled with parens) failed to match the template_name `"Snow Crabs! (All You Can Eat)"` because the sanitizer stripped parens to spaces and broke the substring.

**Status:** Fixed April 27 via tokenized AND-of-ORs in `src/app/api/events/search/route.js`. Each token is matched independently; per-token template lookups fire in parallel.

### 5.5 — Venue link → Ticketmaster instead of official site

*Violates §3.6 (`venues.website` ≠ `events.source`).*

Wonder Bar and both Stone Pony venues had `venues.website = NULL` and their events came in via the Ticketmaster scraper, so `events.source` was a Ticketmaster URL. The 🌐 Venue button used `events.source` exclusively — landing users on Ticketmaster instead of the venue's own calendar page.

**Status:** Fixed April 27. (a) Populated `venues.website` for the three venues. (b) Updated 5 event-fetching queries to include `website` in the venues join + flatten as `venue_website`. (c) Updated `EventCardV2.js` and `SiteEventCard.js` to prefer `venue_website` and fall back to `source`.

**Next:** Backfill `venues.website` for every venue that has an obvious official URL but currently NULL. Audit can be a one-time human pass via the AdminVenuesTab. Tracked in `VENUE_MANAGEMENT.md`.

### 5.6 — Multiple `CATEGORY_OPTIONS` / `ALLOWED_CATEGORIES` constants

*Violates §3.1 (canonical category strings) at the source-code level.*

Pre-April-27, six writers used four different vocabularies: `useAdminEvents.js` had its own `CATEGORY_OPTIONS`, `AdminEventTemplatesTab.js` had a different one, `eventClassifier.js` had `ALLOWED_CATEGORIES`, and the home-page filter pills had hardcoded strings. They didn't agree (e.g., "Food & Drink" vs "Food & Drink Special" vs "Drink/Food Special").

**Status:** Partial — `src/lib/taxonomy.js` now exists as the canonical source of truth. The DB is migrated to canonical values.

**Next:** Update every writer to import from `taxonomy.js` instead of carrying its own constant. Seven call sites identified (see HANDOVER session-of-record). Each is a one-file change.

### 5.7 — Town aliases don't exist yet

*New requirement, not yet a violation but flagged for design.*

Lake Como is colloquially "Belmar" (it's a 0.25-square-mile borough surrounded by Belmar). Bradley Beach venues are often searched as "Belmar." Loch Arbour overlaps with Allenhurst. Today, a user searching "Belmar" gets only venues whose `city = 'Belmar'`; other towns that should match aren't surfaced.

**Status:** Open. Schema not yet designed.

**Next:** Decide on table shape — flat `town_aliases (town_id, alias_name)` vs richer `towns (id, name, aliases text[], default_radius, lat, lng)`. Recommendation in `VENUE_MANAGEMENT.md` §6: go with a `towns` table for future-extensibility. Then update home-page town filter to expand the user's typed town into [town + aliases] before filtering.

---

## §6. Prioritized remediation

Items grouped by category. Quick wins first.

**Quick wins (can run as one-shot SQL or single-file code edits):**

1. Backfill `events.artist_name` to match `artists.name` for all FK-linked events where the current value is a known alias. SQL-only.
2. Audit + delete orphan artist rows (`is_locked = false AND events_linked_count = 0 AND alias_names = '{}'`). One SQL pass, with a dry-run first.
3. Update the 7 call sites to import from `src/lib/taxonomy.js` (drift §5.6). One PR per file or one big PR; either way, scoped.

**Medium-effort (multi-file or schema work):**

4. Reconcile the 64 remaining template/event category disagreements (drift §5.1). Pull the rows, classify by `is_human_edited`, run a targeted UPDATE on the unlocked subset.
5. Audit + populate `venues.website` for all venues currently NULL where an official URL is obvious (drift §5.5 follow-on).
6. Add `cms_type` and `scraper_key` columns to `venues`; backfill from existing scraper file inventory (`VENUE_MANAGEMENT.md` §4).

**Structural (new schema, new code paths):**

7. Town aliases table + search-side expansion (drift §5.7).
8. Venue name aliases (`name_aliases text[]` on `venues`) + scraper-side normalization (task #36 from older backlog).
9. Make the artist-merge admin UI atomic and complete (the four-step transaction): reassign events, push name into aliases, normalize event_artist_name, delete source. Today the UI does step 1 only.
10. Phase 3 of the Trust Refactor (`TRUST_REFACTOR.md`) — `events.is_locked` consolidation. Already in progress.

---

## §7. Cross-references

When working in a specific area, the skill doc has the operational detail. This doc tells you *what's true*; the skill docs tell you *how to operate*.

| Domain | Skill doc | What it covers |
|---|---|---|
| Artist + event metadata enrichment | `ENRICHMENT.md` | Bio, classification (`kind`), genre/vibe tagging, lock semantics, the LLM prompts |
| Image sourcing + validation | `IMAGE-MANAGEMENT.md` | Permitted sources, banned sources, PostImages re-host, image waterfall |
| Frontend rendering | `FRONTEND_SOP.md` | Inline styles + darkMode ternaries, CSS variables, accessibility |
| Scraper authoring + maintenance | `SCRAPERS.md` | Pipeline architecture, sharded crons, all 50+ existing scrapers |
| New venue scraper onboarding | `SCRAPER_PROMPT.md` | Agent kickoff prompt for adding a new venue's scraper |
| Event series matching | `SERIES_AUTOMATCH.md` | Slug normalization, find-or-create dedup |
| Venue data integrity + town aliases | `VENUE_MANAGEMENT.md` | Required venue fields, image sourcing (delegates to IMAGE-MANAGEMENT), CMS identification, name aliases, town aliases |
| Spotlight admin + public hero | `SPOTLIGHT_OPERATIONS.md` | 8-slot pin model (5 Main + 3 Runner-Ups), autopilot tiers, source tracking, staging discipline, image warnings, common ops |
| Active refactor: lock model | `TRUST_REFACTOR.md` | Phases 1–4 of consolidating `is_locked` / `is_human_edited` |
| Open feature work: analytics | `ANALYTICS_PLAN.md` | PostHog requirements, status, open items |
| Backlog | `PARKED.md` | Deferred work, cross-referenced with task tracker |
| Session diary | `HANDOVER.md` | Per-session log of what changed and why |

---

*This doc is meant to stay current. If you discover a new invariant violation, add it to §5. If you add a new entity, update §1. If you add a new code path that creates/edits/deletes data, update §2.*
