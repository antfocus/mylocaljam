# Trust Refactor — Lock Model Simplification

**Status:** Phase 1 dual-write landed 2026-04-24 (Task #60). Backfill populated `events.is_locked` on 663 rows (was 0; drifted up from the planned 657 by a few admin saves between the doc and the migration). All writers now dual-write both columns; all readers OR both columns so pre-flip data still reads as locked. Phase 2–4 still pending. See §Phase-1-landed for the one-week bake-and-verify plan.

Ghost-dedupe prerequisite (#64) shipped 2026-04-23 along with a tactical cache-drift fix (#65, #66, #67, #68). See §Incident-2026-04-23 below for the concrete bug pattern Phase 3 must eliminate structurally.
**Owner:** Tony
**Context:** 2026-04-23 QA of enrichment lock logic on Big John & Lil Maria, Mike Dalton, E Boro Bandits, Ocean Avenue Stompers surfaced three flag-consistency issues. Short version: the locks work, but we carry three overlapping signals (`is_locked` boolean, `is_human_edited` JSONB/boolean, `field_status` JSONB) that drift apart and confuse both humans and code.

---

## Mental model (Tony's, now the spec)

> **Locked = trusted. Unlocked = untrusted.** No middle ground.

- Admin curated a row and locked it → scrapers, AI, and cron writers never touch it.
- Row is unlocked → any automated writer may update it.
- `field_status` stays as a separate signal tracking "AI tried and came back empty" sentinels. It is NOT a lock; it's an exhaustion flag that prevents redundant LLM calls. Keep it, but rename mental category so nobody confuses it with trust.

---

## Field ownership (the other half of the fix)

Every field in the UI belongs to exactly one table. No cached copies, no duplicates.

| Field | Owner | Governed by |
|---|---|---|
| bio, image_url, genres, vibes, tags, aliases, mbid | `artists` | `artists.is_locked` |
| start_time, end_time, event_title, ticket_link, cover, special_notes, is_festival, category | `events` | `events.is_locked` |
| custom_bio, custom_image_url, custom_genres, custom_vibes (per-show artist overrides) | `events` | `events.is_locked` |

Event modal displays artist-owned fields as **read-only badges** ("🎤 from Mike Dalton, locked"). To change them, admin opens the artist modal. To override for one specific show, admin clicks "Override for this show" — the value is copied into the event's `custom_*` column and becomes event-owned.

---

## §1 — Phase 1: events table cleanup (Task #60)

**Current state:**
- `events.is_locked` exists (boolean, default false) — **0 rows set to true**. Dead column.
- `events.is_human_edited` exists (boolean, default false) — **657 rows true**. Currently-used lock.
- `events.is_custom_metadata` exists (boolean, default false) — 84 rows true. Flags events with any custom_* override.

**Migration:**

```sql
-- Backfill the real lock flag onto the (currently-unused) is_locked column
UPDATE events
SET is_locked = true
WHERE is_human_edited = true;

-- Update all code paths to read/write is_locked instead of is_human_edited
-- (see "Writer audit" below)

-- After one week of co-existence with both columns updated in lockstep,
-- drop the old column.
ALTER TABLE events DROP COLUMN is_human_edited;
```

**Writer audit — grep targets for phase 1:**
- `src/app/api/admin/route.js` — sets `is_human_edited: true` on admin event PUT
- `src/app/api/admin/route.js:284` — rename event series
- `src/app/api/admin/route.js:298` — clear festival flag
- `src/app/api/admin/artists/route.js:421` — delete-artist archive-events path (already has "DO NOT set" comment — remove now-irrelevant comment)
- `src/app/api/admin/enrich-date/route.js:781` — enrich-date write
- `src/app/api/sync-events/route.js` — scraper guard in sync path (check both shapes during transition)
- `src/lib/waterfall.js:167-172` — bio priority flip based on `is_human_edited`
- `src/hooks/useAdminSpotlight.js:409` — admin spotlight enrichment
- Admin UI components that display or toggle the flag

**Rule during transition:** writers write to BOTH columns. Readers read from `is_locked`. After one week with no incidents, drop `is_human_edited`.

---

## §Phase-1-landed — 2026-04-24 dual-write rollout

**Backfill:** `UPDATE events SET is_locked = true WHERE is_human_edited = true AND is_locked IS NOT TRUE;` — post-migration verification: 663/663 rows in lockstep, `out_of_sync = 0`. (Doc's original 657 was a stale count; five admin saves between the doc write and the migration lifted it to 663. No semantic surprise.)

**Writers patched to dual-write both columns:**
- `src/app/api/admin/route.js:288` — bulk festival rename
- `src/app/api/admin/route.js:303` — bulk clear festival
- `src/app/api/admin/route.js:350` — admin event PUT (primary path)
- `src/app/api/admin/artists/route.js:425` — delete-artist "hide events" archive path
- `src/app/api/admin/artists/route.js:450` — delete-artist "unlink events" patch
- `src/app/api/admin/enrich-date/route.js:779-780` — Magic Wand event promote-to-locked

Paths that explicitly do NOT lock (convert-to-special, dissolve-artist-links at `admin/artists/route.js:479, 514`) stay unchanged — they still don't set either column.

**Readers flipped to OR both columns:**
- `src/lib/waterfall.js:39` — `shouldTreatEventTimeAsEmpty`
- `src/lib/waterfall.js:116` — `applyWaterfall` humanEdited detection (propagates into every downstream `w.is_human_edited` read, including the spotlight chips and the source-label badges)
- `src/lib/writeGuards.js:40-51` — `isFieldLocked` now checks `is_locked` first, falls back to legacy shapes
- `src/app/api/sync-events/route.js:673` — community-submission dedup (was `.eq('is_human_edited', true)`)
- `src/app/api/admin/force-sync/route.js:342` — protected-IDs query
- `src/app/api/admin/artists/merge/route.js:193-194` — stale-cache heal skip (now checks both, most cautious)
- `src/components/EventFormModal.js:110` — modal-level lock detection
- `src/components/admin/AdminSpotlightTab.js:1387` — `sourceLabel` helper (one `const isLocked` computed, used throughout the switch)
- `src/app/api/admin/route.js:433` — event PUT pre-read now selects both columns so stripLockedFields sees the row-level lock

Selects that already pulled both columns stayed as-is (`sync-events/route.js:1238`, `enrich-date/route.js:252`, admin GET `select('*')` at `admin/route.js:91`).

Paths that already OR'd both columns pre-Phase-1 (not changed): `sync-events/route.js:708` protected-IDs query, `sync-events/route.js:1249` enrichment skip, `sync-events/route.js:1374` category chain-of-command, `enrich-date/route.js:386` Smart Fill rescue count, `AdminSpotlightTab.js:222` rescue tally.

**Writers NOT updated (not events-scope, Phase 2/3 work):** `src/app/api/admin/artists/route.js:227` (artists table PUT), `src/lib/enrichArtist.js:454` (artists JSONB merge), `src/app/api/admin/enrich-date/route.js:695` (artists JSONB merge), `src/app/api/admin/event-templates/route.js:174` (templates JSONB). These stay on the old column until Phase 2 (#61) and the templates sub-refactor.

**Smoke test results (20/20 passed):** waterfall detects locks from either column; `shouldTreatEventTimeAsEmpty` honors both; `isFieldLocked` handles `is_locked=true`, legacy boolean, JSONB per-field, and the "is_locked wins even if JSONB says unlock" precedence correctly; `stripLockedFields` strips under any lock shape, passes through when unlocked.

**Bake-and-verify checklist (before dropping `is_human_edited`):**
1. Run for 7 days with dual-write live.
2. Daily sanity: `SELECT count(*) FROM events WHERE (is_human_edited = true) IS DISTINCT FROM (is_locked = true);` — must stay at 0. Any drift means a writer slipped through the audit; fix before dropping.
3. Grep for any new code that writes `is_human_edited` without `is_locked` on events. Add to the dual-write list if found.
4. Verify admin event save + lock icon still renders on a known-locked row (e.g. the 7:12 PM Ghost rescue set).
5. Verify scraper cron skips locked rows (check `humanSkipped` in the sync summary after a run).
6. Spot-check the community-submission dedup path — it now reads both columns.

**After bake-and-verify — Phase 1 cleanup (follow-up commit):**
- Drop the legacy column: `ALTER TABLE events DROP COLUMN is_human_edited;`
- Remove `is_human_edited` writes from every file in the "dual-write" list above.
- Remove the OR fallback from every file in the "reader" list above (simplify `is_locked || is_human_edited` → `is_locked`).
- Rename `humanEdited` variable in `waterfall.js` to `locked`.
- Remove the legacy boolean branch in `writeGuards.isFieldLocked` (keep JSONB branch for artists until Phase 2 collapses it).
- Delete the "is_human_edited" mentions from in-code comments where they no longer apply.
- Update the `events.is_custom_metadata` grep pass if Phase 1 follow-up coincides with its drop (see Open Question #3).

---

## §2 — Phase 2: artists table cleanup (Task #61, blocked by #60)

**Current state:**
- `artists.is_locked` BOOLEAN — row-level lock, works correctly.
- `artists.is_human_edited` JSONB — per-field locks (e.g. `{bio: true, image_url: true}`). Also accepts boolean `true` (end-to-end lock) for legacy reasons. Gets flipped `true` on AI-filled fields — semantic drift.
- `artists.field_status` JSONB — `{bio: "live" | "no_data", image_url: "live" | "no_data"}`. Separate concern. Keeps.

**Migration:**

```sql
-- Collapse any existing JSONB or boolean lock into is_locked
UPDATE artists
SET is_locked = true
WHERE
  is_locked IS NOT TRUE
  AND (
    is_human_edited = 'true'::jsonb
    OR (
      jsonb_typeof(is_human_edited) = 'object'
      AND EXISTS (
        SELECT 1 FROM jsonb_each(is_human_edited)
        WHERE value = 'true'::jsonb
      )
    )
  );

-- Co-exist period: writers write both columns, readers use is_locked only.
-- After one week, drop is_human_edited.
ALTER TABLE artists DROP COLUMN is_human_edited;
```

**What we lose:** per-field locking on artists. The four sample artists we inspected were all all-or-nothing locked anyway, so this is a theoretical loss. If admin needs to change one field on a locked artist, they unlock → edit → re-lock, which is one extra click and matches the new simpler mental model.

**Writer audit — artists table:**
- `src/lib/enrichArtist.js:448-455` — AI-fill flips per-field keys on JSONB. Remove entirely: AI doesn't lock its own writes anymore; scraper / AI both respect `is_locked`.
- `src/lib/enrichArtist.js:305-306` — `bioLocked` / `imageLocked` via `isFieldLocked`. Collapse to single `locked = cached?.is_locked` check, skip enrichment entirely if locked.
- `src/lib/enrichArtist.js:296` — already correctly skips on `cached?.is_locked`. Keep.
- `src/lib/writeGuards.js` — `stripLockedFields` / `isFieldLocked` — simplify to single boolean check; `opts.allowUnlock` stays for the admin unlock-and-overwrite escape hatch.
- `src/lib/enrichmentPriority.js:170-171` — already gates on `is_locked`; just drop line 171 (`is_human_edited === true` check) after migration.
- `src/app/api/admin/artists/route.js` — admin PUT that accepts `is_human_edited` body; convert to `is_locked` with optional unlock-and-write-this-field semantics.
- `src/components/admin/AdminArtistsTab.js:1451` — lock toggle UI.
- `src/hooks/useAdminArtists.js:75` — local state mirror.
- `src/app/api/admin/event-templates/route.js:168-172` — same collapse for templates (templates follow artists' model).

---

## §3 — Phase 3: stop caching artist data on events (Task #62, blocked by #61)

**Problem:** `events.artist_bio` and `events.event_image_url` are cached copies of artist data that drift when the artist is updated. The waterfall reads the cached values, so locked artist changes don't propagate to old events until a resync.

**Solution:** drop the cache. Waterfall reads live from `artists` via `artist_id` join.

**New waterfall rules:**

```
BIO:
  event.custom_bio (admin override)
  → template.bio (if event linked to a template)
  → artist.bio (via artist_id join)
  → null

IMAGE:
  event.custom_image_url (admin override)
  → template.image_url (if templated)
  → artist.image_url (via artist_id join)
  → null

GENRES / VIBES:
  event.custom_genres / custom_vibes
  → artist.genres / vibes
  → null
```

No more `event.is_human_edited`-based priority flipping. The waterfall picks the highest-specificity source with a non-null value.

**Migration:**

```sql
-- Drop the cache columns after the waterfall is rewritten and deployed.
-- Do NOT drop without migrating custom overrides first: if
-- event.artist_bio differs from linked artist.bio, that difference
-- represents an implicit override that needs to move to custom_bio.

-- Step 1: promote implicit overrides to explicit custom_* columns
UPDATE events e
SET custom_bio = e.artist_bio
FROM artists a
WHERE e.artist_id = a.id
  AND e.artist_bio IS NOT NULL
  AND e.artist_bio != ''
  AND e.artist_bio != a.bio
  AND (e.custom_bio IS NULL OR e.custom_bio = '');

UPDATE events e
SET custom_image_url = e.event_image_url
FROM artists a
WHERE e.artist_id = a.id
  AND e.event_image_url IS NOT NULL
  AND e.event_image_url != ''
  AND e.event_image_url != a.image_url
  AND (e.custom_image_url IS NULL OR e.custom_image_url = '');

-- Step 2 (only after code reads live from artists): drop the caches
ALTER TABLE events DROP COLUMN artist_bio;
ALTER TABLE events DROP COLUMN event_image_url;
```

**Code changes:**
- `src/lib/waterfall.js` — rewrite bio/image/genres/vibes resolution to require an `artist` object passed alongside the event. All callers already load the artist for the tooltip/modal; formalize that.
- All event fetches (admin feed, public feed, spotlight, search) — add `artist:artists(bio, image_url, genres, vibes, is_locked)` to the select.
- Drop all writes to `events.artist_bio` / `events.event_image_url` in scrapers, enrichment endpoints, admin routes.

**What stays:** `custom_bio`, `custom_image_url`, `custom_genres`, `custom_vibes` — explicit per-event overrides. These are the *only* fields on an event that represent artist-data-for-this-show. Admin "Override for this show" button writes to these.

---

## §4 — Phase 4: event modal UI (Task #63, blocked by #62)

**Event edit modal layout:**

```
┌────────────────────────────────────────────┐
│ Edit Event                        [🔒 Lock]│   ← event-level lock button
├────────────────────────────────────────────┤
│ Event-owned fields (governed by event lock)│
│   Start time: [____________]               │
│   Event title: [___________]               │
│   Ticket link: [___________]               │
│   Cover: [________________]                │
│                                            │
│ Artist-derived (read-only, artist owns)    │
│   Bio: [read-only preview]                 │
│     🎤 From Mike Dalton (locked)           │
│     [Edit in artist] [Override for show]   │
│   Image: [thumbnail]                       │
│     🎤 From Mike Dalton (locked)           │
│     [Edit in artist] [Override for show]   │
│                                            │
│ Overrides (event lock governs)             │
│   (empty unless admin clicked Override)    │
└────────────────────────────────────────────┘
```

**Field state indicators (in order of precedence):**

| State | Badge | Editable here? | Who can write? |
|---|---|---|---|
| Artist-owned, artist locked | 🎤 locked | no | manual artist edit only |
| Artist-owned, artist unlocked | 🎤 unlocked | no | scraper / AI / manual |
| Override (event custom_*), event locked | 🔒 override | yes | manual only |
| Override (event custom_*), event unlocked | ⚪ override | yes | scraper / AI / manual |
| Event-owned, event locked | 🔒 | yes | manual only |
| Event-owned, event unlocked | ⚪ | yes | scraper / AI / manual |

**Event list row icons (right side, next to pencil):**

- **Event lock:** 🔒 (orange) if `events.is_locked = true`, else ⚪ (gray)
- **Linked artist state:** 🎤 (green) if linked to locked artist, 🎤 (gray) if linked to unlocked artist, hidden if no `artist_id`

Hover tooltips:
- 🔒 event: "Event-owned fields are locked (time, title, ticket link)"
- 🎤 green: "Bio and image are locked on Mike Dalton's artist record"
- 🎤 gray: "Bio and image are on Mike Dalton but not locked — scraper may update them"

---

## Rollout sequence

1. **Phase 1 (Task #60):** events column consolidation. Low risk, dead column already exists. Writers write both for one week, readers read `is_locked`. Drop `is_human_edited` after verification.
2. **Phase 2 (Task #61):** artists column consolidation. Medium risk, JSONB→boolean is destructive. Migrate + write-both for one week, then drop JSONB.
3. **Phase 3 (Task #62):** event cache removal. Highest risk — changes waterfall behavior. Deploy behind a feature flag, test on staging, then flip prod.
4. **Phase 4 (Task #63):** UI. Lowest risk, visual only. Can ship in parallel with Phase 3 rollout.

Ghost artist dedupe (Task #64) is independent and can go first — it's the actual user-facing bug Tony spotted (Boatyard 401 Mike Dalton showing wrong image). Don't block the ghost fix on this refactor.

---

## Open questions before we write code

1. **Template lock precedence.** When an event links to an `event_template`, does template lock state matter? Current `event_templates` table has its own `is_locked` and JSONB `is_human_edited` — does template lock mean "this template's defaults are sacred, don't let scraper touch events using this template"? Confirm with Tony.

2. **What does "🎤 Override for this show" actually save?** Proposal: copy the live artist value into `custom_bio` / `custom_image_url`, then let admin edit. Confirm UI flow with Tony.

3. **Legacy `is_custom_metadata` flag on events (84 rows).** Currently flips when any custom_* is set. Keep as derived flag, or collapse into "is any custom_* non-null"? Probably drop and compute on read.

4. **Mike Dalton immediate fix.** Do we (a) fix the canonical locked image first (unlock, replace, relock), (b) just repoint the event to the ghost with the better image, or (c) dedupe (merge ghost into canonical, keeping the better image)? (c) is the right long-term answer and aligns with Task #64. **Resolved 2026-04-23: chose (c). See Incident-2026-04-23 below.**

---

## Incident — 2026-04-23 — Cache drift exposed by ghost merges

**What happened.** Tony merged 4 Mike Dalton ghost rows into the locked canonical. The merge succeeded at the `artists` table level (ghosts deleted, aliases written, events repointed), but the Boatyard 401 Apr 30 event kept rendering a fireplace photo + ghost AI bio, and autocomplete kept surfacing the ghost variants as separate ARTIST entries. Same pattern hit Ocean Avenue Stompers' earlier merge.

**Why the locks didn't save us.** The locks worked correctly — canonical Mike Dalton was fully locked, enrichment never touched him. The bug lives one level down: `events.artist_bio`, `events.image_url` (legacy), and `events.event_image_url` are *cached copies* of artist data that sit on the event row. The waterfall reads the cached event-row values before falling through to the live artist join, so any row that still carries a ghost's cache will display ghost data even after the ghost artist is deleted. The pre-patch merge endpoint only nulled `event_image_url` — the other three columns drifted.

**Tactical patch shipped (not a structural fix):**
- SQL heal on 52 affected event rows (48 Mike Dalton + 1 E-Boro + 3 Ocean Ave), scoped to `is_human_edited = false`.
- `src/app/api/admin/artists/merge/route.js` Step E now heals all four cache columns.
- `src/app/page.js` autocomplete guards against double-adding stale `artist_name` when the row has a linked canonical.

**Why this proves Phase 3 needs to happen.** The scraper still writes to these cache columns on every sync. Any future event that gets repointed to a different artist (or whose canonical's bio/image changes) will rot the same way. Phase 3 (drop `events.artist_bio` + `events.event_image_url`, make the waterfall read live from the artist join) is the only structural fix. Until it lands, the merge endpoint heals at merge time but scrapers can still introduce drift.

**Open items this unlocked:**
- #62 Phase 3 remains the highest-value refactor — concrete user-facing bug now documented.
- The `events.image_url` legacy column (separate from `event_image_url`) should be audited and dropped as part of Phase 3. It carried the squarespace and mikedaltonevents.com ghosts in this incident. Grep for writers before dropping.
- Scraper audit: which scrapers currently write to `artist_bio` / `image_url` / `event_image_url` on events? Each needs to stop writing them once Phase 3 lands.

