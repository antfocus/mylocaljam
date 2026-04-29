# Parked Work

Living list of work that came up during sessions but was deliberately deferred. Cross-referenced with the TaskList; check there for status. Delete an entry once it ships.

---

## Recently shipped — Apr 25 launch-prep session

Major work that landed today. Listed for context so the deferred items below make sense in light of what's already built.

**Brand / verification**
- Google OAuth brand verification cleared and **published** — consent screen now shows "myLocalJam" instead of `ugmyqucizialapfulens.supabase.co`. Required: homepage title fix (`mylocaljam` → `myLocalJam`), description rewrite ("...helps you discover live music events at Jersey Shore venues..."), visually-hidden h1 in `page.js`, and a visible Privacy/Terms footer in the home feed.
- 2-Step Verification enabled on `mylocaljam@gmail.com` (Google Cloud requirement as of March 31, 2026).

**Modal refresh pass — all four major modals polished**
- `BetaWelcome`: dark refresh, bigger text, ticket-stub Follow icon, solid orange "OFFICIALLY IN BETA!", pulsing white-dot Spotlight icon (matches the home Hero sticker), tightened copy, "Territory: Jersey Shore *(for now)*" caveat.
- `AuthModal`: dark surface, brand wordmark inline in title, "Welcome to **myLocalJam**" universal headline with proper inline Wordmark component, Google as visual primary (white-on-dark), Magic Link as orange secondary (smaller padding/font), email input with translucent dark bg + orange focus ring, single drag-handle dismiss.
- `SubmitEventModal`: dark refresh, bumped text, dropped the inline "Recent Submissions" list (replaced with a small `View past submissions →` link routing to `/profile`).
- Event share page (`EventPageClient`): editorial header (Outfit Black title + orange pin venue + IBM Plex Mono date/time strip), full-bleed poster (was `objectFit: cover` 16:9 cropping portrait flyers), three-action footer (Save Show / Follow Artist / Venue), dismissible upsell banner with localStorage persistence.

**Admin / data correctness**
- Festivals tab → renamed to **Event Series** tab. Now queries the `event_series` table directly (instead of grouping events by `event_title`). Sea Hear Now 2026 migrated into `event_series` as a `festival`-category row with all 31 child events linked via `series_id`. New API actions: `rename_series`, `delete_series` (replacing `bulk_rename_festival` / `bulk_clear_festival`).
- `useAdminFestivals` and `AdminFestivalsTab.js` deleted (dead).
- Admin event POST/PUT now auto-resolves `artist_id` and `venue_id` from name via `resolveFkByName()` — case-insensitive with `"the "` prefix stripped. Mirrors the same fix landed in `sync-events/route.js` earlier in the session. Closes the bug class where typed-name events arrived with FKs null and broke the image waterfall (Wallnutz / Wonder Bar / Stone Pony / Pagano's all manifested this).
- Pagano's UVA Ristorante venue row created (800 Main St, Bradley Beach) + 28 historical events backfilled.
- Search autocomplete now includes `event_series` rows (so "sea hear now" surfaces in the dropdown year-round, not just when child events are in the loaded feed window).
- Venue dropdown in the search modal sources from server-aggregated facets (every venue with ≥1 upcoming event), not the paginated home feed — fixed Wonder Bar / Stone Pony being invisible from the picker.

**Spotlight carousel**
- 5-dash slide indicator (orange, top-left, opacity differentiates active).
- Smooth last→first wrap via cloned slide + post-animation snap-back.
- Time stays on one line when venue is long (`whiteSpace: nowrap` + `flexShrink: 0` on day/time wrappers; venue absorbs the squeeze).

**Search modal**
- Symmetrical 1/2/1 trio footer (Reset ghost / Search orange primary / Close ghost with X icon).
- Search button label simplified from "Show N events" to "Search" (the count was capped at PAGE_SIZE=20 and misleading).
- White text on the orange Search button.

---

## Recently shipped — Apr 26 follow-up session

Shorter session focused on Spotlight polish + admin AI resilience.

**Spotlight**
- Slide indicator iterated multiple times: top-left orange dashes (read as glitch) → bottom-center pill+dots with glassmorphism (collided with the meta row) → top-left subtle pill+dots in brand orange, no glassmorphism, ~50% smaller, soft drop-shadow for legibility on bright posters. Active pill expands; inactive at 35% opacity.
- **Desktop nav chevrons.** Two glassmorphism circle buttons at left/right edges, hover-only via `.hero-viewport:hover .hero-chevron { opacity: 1 }`. Hidden entirely on touch via `@media (hover: none)`. Click handlers route through existing `handleDotClick`, so they pause auto-rotate, navigate via modulo wrap, and schedule resume.
- **Context-aware CTA label.** `Meet Artist →` only shows when an artist record is linked (`ev.artists?.name || ev.artist_id`). Otherwise renders `Event Details →`. Stops the page from promising "meet" content when a Spotlight is event-only (R Bar Oyster Roast, etc.).
- **Pull-to-refresh now refreshes Spotlight too.** Was only refreshing the events feed; the spotlight fetch was a one-shot useEffect on mount. Refactored into `fetchSpotlight` useCallback + a `fetchSpotlightRef` bridge so `handlePullRefresh` can call it without TDZ issues. Both run in parallel via Promise.all.

**Image presentation**
- Top-aligned cropping (`object-position: center top` / `background-position: center top`) across Spotlight Hero, EventCardV2, SavedGigCard, and ArtistProfileScreen. Most artist photos have the face in the upper third — center-cropping was lopping heads off (Mushmouth at Reef & Barrel). Trade-off: landscape stage shots may lose some ceiling. Acceptable.

**Welcome modal**
- Spotlight icon now uses the same pulsing white dot as the home Hero's SPOTLIGHT sticker (visual system unity). Follow icon is the ticket-stub. Copy shortened across all five features. "Territory: Jersey Shore" stays as a one-line scope (the `(for now)` suffix was tried and rejected). Follow desc says "Save events and artists" (was "venues and artists" — wrong nouns).

**Genres**
- Added `Bluegrass` to both `GENRES` (utils.js) and `ALLOWED_GENRES` (aiLookup.js). The two arrays must stay in lockstep per the existing comment.

**Admin enrichment resilience**
- `/api/admin/ai-enhance` was making a direct fetch to Perplexity, which broke today when the Perplexity account hit `insufficient_quota`. Refactored to use the existing `callLLMWebGrounded` LLM router (Perplexity → Gemini → Grok auto-failover). 52 lines net deleted. Now any single-provider quota event won't take admin enrichment offline.

**Manual data fixes**
- Belmar Grass artist row's `image_url` populated via Postimages-hosted poster (interim — proper Phase 1 image curation still parked).

---

## Recently shipped — Apr 29 session

Long session — Mac mini agent host stood up, fourth scraper landed, contrast pass, save-confirmation redesign, AI enrichment polish, weekend metadata work begun.

**Mac mini agent host (foundation for self-hosted scrapers + agents)**
- Brand-new M4 Mac mini provisioned end-to-end as a 24/7 headless host: account `jammaster` / FileVault on / SSH + Screen Sharing enabled / Tailscale on both Macs / iCloud explicitly skipped. SSH from the MacBook works on local Wi-Fi (`agent-mini.local`) and over Tailscale from anywhere (`agent-mini`). Energy/Lock settings tuned to never sleep so future cron jobs don't get knocked offline. Foundation for future migrations (slow-tier OCR, Drifthouse retry, local LLM agents).

**Scrapers**
- **Mott's Creek Bar** (Galloway, Squarespace): new scraper `src/lib/scrapers/mottsCreekBar.js`. Wired into FAST_SHARD_2. Venue row inserted (id `a0e05904-a73c-4834-b983-849f84c3f730`). 4 upcoming events landing cleanly on first run. Total venue count up to ~46.
- **Doyle's Pour House**: original parking diagnosis was wrong. The iCal export DOES work — DB now has 30+ Doyle's events (Apr 30 → July). See updated PARKED #14 below.
- **Per-scraper filter**: still parked (#13). The `tier=all` test path still hits the 60s cap. Worth a 15-min ship next session.

**Spotlight + admin**
- Spotlight CTA: "Meet Artist" demoted to "Details" when the linked artist has `kind='event'` (legacy fake-artist rows). Defensive check; once orphans are cleaned the path is dormant.
- Spotlight staging rule reverted — ☆ now appends to next open slot (Main fills first, then Runner-Ups). The Apr 28 "stage-to-Runner-Ups-only" rule was over-engineered; admin couldn't stage candidates while Main had gaps.
- AdminEventsTab `stopPropagation` fixes — the row-clickable change had broken the "Suggest" template chip and the Category dropdown (clicks bubbled to row's `openEditor`). Both fixed. Side effect: closed PARKED #12 (stale edit pencils — they were already removed in source; force-push had stalled the deploy).
- Auto-link sweep — 26 of 51 weekend unlinked events linked via exact-name match against existing artists (excluding 4 known event-misclassified-as-artist rows). Linked pool 84 → 110 for Apr 30 – May 3.

**Save confirmation popover redesign (`EventCardV2`)**
- Anchored 260px popover replaced with a centered modal-card. Big green check + bold "Event saved" headline leads, then event title + venue context, then secondary outline-pill Follow CTA. Eliminates the "tight corner + giant orange button competing with confirmation" UX issues. Body text bumped to 16/15px after first-pass feedback. Follow button label switched to jet black (was orange-on-orange ~3:1 contrast → now ~14:1).

**Search autocomplete word-prefix**
- `app/page.js` autocomplete switched from `.includes(q)` (substring-anywhere) to word-prefix with stopword filter. Typing "an" no longer surfaces Wildman / Can Eat / Bank / "and". "the" still finds "The Stone Pony" via full-string-prefix. Stopword set: a, an, and, the, of, to, in, on, at, or, but, with, by, for, is, as, from.

**White-on-orange contrast pass (round 1 + round 2)**
- 11 hits across the codebase fixed (jet black on orange, ~14:1 contrast):
  - HeroSection Spotlight chip (already fixed earlier; reverified).
  - SpotlightCarousel ★ badge label, ArtistProfileScreen Follow button + plus icon, home-page venue-filter count pill, EventFormModal admin checkmark badge.
  - Round 2 (CSS-variable + Tailwind variants the regex missed): home Search button, event-page "Sign up free" + "Create free account" CTAs, admin "+ Add Event" button, admin Settings icons (login screen + header), admin Login button.

**AI Enhance + image lightbox (admin enrichment polish)**
- AI Enhance genre fix: the prompt was using its own genre list ("Metal / Hardcore", "Hip-Hop / Rap"...) that didn't match the form's canonical `GENRES` list ("Metal", "Hip Hop"...). Even when AI correctly identified the band, the value didn't match a button. Fixed: imports `GENRES` from `utils.js` directly into the prompt + adds case-insensitive recovery + subgenre→canonical mapping (metalcore→Metal, hip-hop→Hip Hop, tribute→Cover Band, etc.).
- AI Image Search lightbox: clicking a candidate thumbnail used to silently swap the preview. Now opens a centered confirmation lightbox with current vs. candidate side-by-side and explicit "Use This Image" / "Cancel" buttons. Backdrop click dismisses (with `stopPropagation` so it doesn't bubble to the parent EventFormModal).

**Compound-name artist cleanup (one-shot SQL)**
- Renamed 5 polluted artist rows to clean band names + pushed the bill text into `alias_names` (so any future scraper run with the same compound string still resolves to the canonical):
  - "ALL THAT REMAINS with Special Guests Born of Osiris and Dead Eyes" → **ALL THAT REMAINS**
  - "The Flatliners & A Wilhelm Scream w/ Signals Midwest" → **The Flatliners**
  - "SongsByWeen The WEEN Tribute" → **SongsByWeen**
  - "The Tacet Mode, w/ Sunfade, Osukasu, & Sean Marshall Trio" → **The Tacet Mode**
  - John Eddie kept as-is (real band name).
- Their bios (mostly scraper junk like "ALL AGE SHOW DOORS 6:00 PM") were cleared so AI Enhance has blank fields to fill.
- Tested AI Enhance + AI Image Search on ALL THAT REMAINS, John Eddie, The Flatliners, SongsByWeen — bio + genre + vibe filled correctly; image lightbox flow validated.

---

---

## ⚡ Launch priority (Apr 25 reframe)

User has decided the priority before launch is **data enrichment** — getting bios, images, and tags onto the artist roster. As of Apr 25:

- 724 artists have upcoming events
- 172 are completely bare (no bio, no image)
- 219 are half-enriched (bio xor image)
- 347 are fully enriched (48%)

Auto-enrichment (LLM router → Perplexity-grounded research → MusicBrainz / Discogs / Last.fm waterfall) handles the easy cases but reliably struggles to find images for local / regional artists with no major-label web presence. **Manual image upload is the safety net we don't have yet** — that's why item #2 below is bumped from "later" to launch-blocking.

**Suggested order of operations:**
1. Run the existing automated backfill (`/api/admin/enrich-backfill`) against the 172 bare artists. Free passes, may fill ~30-50% of the gap automatically.
2. Ship image curation Phase 1 (#2 below). Without manual upload, the long tail can't be closed before launch.
3. Add a triage view in admin: "needs enrichment, sorted by next event date." Lets the admin work the worst gaps first.
4. Run automated backfill again on what remains.

---

## 1. Admin Venues management tab

**Why parked:** Came up Friday Apr 25 while adding "Pagano's UVA Ristorante" — there's no admin UI for the `venues` table, so a missing venue means dropping into SQL. User explicitly deferred to Monday.

**Scope (basic CRUD):**
- New tab alongside "Venue Scrapers" called "Venues"
- List view: searchable, sortable. Show name, address, type, tag count, photo presence
- Create / Edit form: `name`, `address`, `slug`, `latitude`, `longitude`, `photo_url`, `venue_type`, `tags[]`, `default_start_time`, `website`
- Delete (soft delete or hard — TBD). Events with this `venue_id` get the FK set to null via existing ON DELETE behavior
- Image upload uses the same Supabase Storage bucket if/when image curation Phase 1 lands

**Scope creep to consider:**
- Outdoor metadata: Outdoor / Patio / Rooftop / Dog Friendly tags surface in the existing shortcut pills, so a tag editor here would unblock "Dog Friendly" filter accuracy (currently broken — see CATEGORIES-HANDOFF.md)
- Photo upload to Supabase Storage instead of pasting URLs
- **Scraper-source assignment per venue.** Today, Wonder Bar (and probably others in the Asbury Park Boardwalk family) is being indirectly fed by the Ticketmaster API search rather than the venue's own calendar at `wonderbarasburypark.com/calendar/`. Result: only Ticketmaster-listed shows surface; smaller direct bookings are missed. The venue admin form should expose: which scraper key feeds this venue, the source URL, and an override flag if multiple scrapers should fan in. Also need a custom HTML scraper for the APB family (`.apb-event` markup is consistent across Wonder Bar, Asbury Lanes, etc. — one scraper covers the group).

**Why it matters:** Closes the loop on the venue normalization fixes from this session — admins can correct mismatches and add missing venues without touching SQL.

**Files to touch:**
- `src/app/admin/page.js` — add nav item + route
- `src/components/admin/AdminVenuesTab.js` — new component (currently `AdminVenuesTab.js` is the *Scrapers* view despite the name; rename or pick a new path)
- `src/hooks/useAdminVenues.js` — already exists, has fetch logic for scraper health; extend for CRUD
- `src/app/api/admin/route.js` — add venue create/update/delete handlers

---

## 2. Image curation — Phase 1 (Supabase Storage for high-profile artists) — ⚡ LAUNCH-BLOCKING

**Why parked:** Originally deferred Apr 25 to ship deployment fixes first. Re-prioritized later that day after user named data enrichment the launch priority and confirmed automated tools struggle with images. This is now the highest-leverage manual fallback for closing the image gap on the 172 bare artists. Confirmed Supabase Storage is the right home (free tier 1GB; ~5,000 artist photos at typical compression).

**Scope (Phase 1):**
- Create `artist-photos/` bucket in Supabase Storage with public read + admin-only write (RLS)
- Add `curated_image_url` column to `artists` table (and optionally `event_series`)
- Add an "Upload curated photo" button on the admin Artists tab — accepts a file, uploads to bucket, stores public URL on the row
- Update the image waterfall in 3-4 places to prefer `curated_image_url` over scraped `image_url`:
  - `src/app/event/[id]/page.js` (event share page metadata)
  - `src/app/event/[id]/opengraph-image.js` (per-event OG card)
  - `src/components/HeroSection.js` (Spotlight)
  - `src/components/EventCardV2.js` (event row image, if used)
- Image waterfall sketch: `custom_image_url → curated_image_url → event_image_url → image_url → artist.curated_image_url → artist.image_url → venue.photo_url`

**Phase 2 (later):**
- Auto-format / auto-quality optimization. If curated images grow past free tier or need transformations on the fly, evaluate Cloudinary's 25GB free tier as a swap. But adds a vendor.

**Phase 3 (much later):**
- Allow venues to upload event flyers via a public submission form (auth required) for Spotlight consideration.

**Why "high-profile only":** Owning copies of headliner photos prevents dead Bandsintown/Songkick CDN links from breaking the page later. Local act photos cycle weekly and aren't worth the curation cost. Plus rights/copyright is much cleaner when curating ~200 artists than scraping 5,000.

---

## 3. Backfill historical orphan events

**Why parked:** This session's `normalizeVenueName` (sync-events route) and `resolveFkByName` (admin route) both fix the *forward* path — new events arrive with FKs resolved. Existing rows with `artist_id IS NULL` or `venue_id IS NULL` despite having a name match are not retroactively linked.

**Scope:**
- One-shot SQL pass mirroring the Wonder Bar / Stone Pony fix from this session
- `UPDATE events e SET artist_id = a.id FROM artists a WHERE e.artist_id IS NULL AND LOWER(TRIM(REGEXP_REPLACE(e.artist_name, '^the\s+', '', 'i'))) = LOWER(TRIM(REGEXP_REPLACE(a.name, '^the\s+', '', 'i')));`
- Same shape for `venue_id` ↔ `venues.name`
- Audit query first: `SELECT COUNT(*) FILTER (WHERE artist_id IS NULL), COUNT(*) FILTER (WHERE venue_id IS NULL) FROM events WHERE event_date >= NOW();`

**Risk:** Low. Only fills nulls; doesn't overwrite existing FKs. Same matcher logic that's already validated on the venue backfill.

---

## 4. White-text-on-orange CTA sweep

**Why parked:** User said "the text within the Orange should always be white" while we were redesigning the search modal footer. Fixed in the search Search button only; user said leave the rest for now.

**Scope:** Audit + fix every orange-background button across the app to use `color: '#FFFFFF'` for the label. Known offenders:
- BetaWelcome.js — "Let's Jam" CTA uses `color: '#1C1917'`
- Possibly other CTAs in modals (AuthModal, signup hint, etc.)
- Sticky upsell banner on event share page already uses white (recent change)

**Implementation:** Single grep pass for `background: '#E8722A'` or `background: t.accent` across `src/`, audit each, flip dark text to white.

---

## 5. Sync artist-linking pass should honor `is_human_edited` on NULL-`artist_id` rows

**Why parked:** Surfaced Apr 28 while diagnosing a one-off Idle Hour event ("Burning sun" on May 29) that was incorrectly linked to Kevin Hill via stale FK. The fix was to set `artist_id = NULL` and `is_human_edited = true` on the row. Sync's smart-upsert at `sync-events/route.js:715` correctly treats the row as protected and only refreshes safe fields (ticket_link, cover, source) on re-scrape — that side is fine. But the artist-id linking pass at `sync-events/route.js:1349` filters only on `!e.artist_id` and doesn't check `is_human_edited`. That means a deliberately-unlinked-and-locked row could get re-linked if a canonical artist matching its `artist_name` is ever created later.

**Concrete failure case:** May 29 row currently has `artist_name = "Burning sun"`, `artist_id = NULL`, `is_human_edited = true`. No canonical "Burning sun" artist exists today. Stable. If an admin (or scraper) ever creates a "Burning sun" artist row, the linking pass will auto-link the May 29 event back to it, ignoring the row's lock. The user's deliberate "this is unlinked, don't touch it" intent gets silently overwritten on the next sync.

**Scope:**
- Tighten the filter at `src/app/api/sync-events/route.js:1349` from `!e.artist_id` to `!e.artist_id && !e.is_human_edited && !e.is_locked`.
- Audit the alias-based linking path around `sync-events/route.js:1186` for the same pattern; apply the same fix if needed.
- Preserve the existing comment's intent (line 1343-1349 says "ALL events, including locked/human-edited" because skipping locked rows broke the OCR-scraped Captain's Inn / Palmetto enrichment loop). The fix is narrower than what that comment warns against: a *locked row with non-null artist_id* is already skipped by the existing `!e.artist_id` filter, unchanged. We're only adding "skip rows with NULL artist_id when they're deliberately locked."

**Risk:** Low. Tightens a filter; touches no new field. Sanity-check before shipping: query for rows with `artist_id IS NULL AND is_human_edited = true` and confirm they're all deliberately-unlinked, not regressions waiting to be re-linked.

**Why it matters:** Closes a hole in the Layer 2 defense pattern documented in `DATA_LIFECYCLE.md` §3.2 (Lock semantics). Without it, "once locked, the next scrape can't undo your correction" is true for upserts but NOT for the artist-id linking pass — a subtle gap that doesn't bite today (no "Burning sun" artist exists) but will the moment an adjacent artist row is created.

**See also:** `TRUST_REFACTOR.md` (this is Phase-3 adjacent — same lock-respecting logic, different code path); `DATA_LIFECYCLE.md` §3 invariant 2.

---

## 6. Follow recurring events / templates — Post-launch, low priority

**Why parked:** Launch decision (Apr 28): keep follow as artist-only at launch to avoid over-complicating the product. A meaningful chunk of the watchable inventory is template-backed and *not* artist-driven — weekly trivia, monthly residencies, "Snow Crabs! All You Can Eat" Tuesdays at Sun Harbor, "80's Power Hour" Fridays at River Rock — events without a linked artist that recur on a schedule. Users will likely ask for "tell me when the next one is scheduled" once they've used the artist-follow flow and noticed the parallel doesn't exist for venue specials.

**Scope:**
- Extend the `mlj_following` localStorage shape to include `entity_type: "template"` (already designed extensibly — current entries use `entity_type: "artist"`).
- Add a "Follow this event" affordance on cards where `template_id` is non-null AND `artist_id` is null. When both are present, prefer artist-follow so the user doesn't get duplicate notifications.
- Update the save-popover at `EventCardV2.js:929` to add a third branch: "no artist, but a template exists" → "Want to know when the next one is scheduled?" with a follow-template button. Today the popover correctly shows `Event Saved!` only for these rows; the addition is a *new affordance*, not a fix.
- Wire `/api/notify/route.js` to iterate over followed templates the same way it iterates over followed artists, surfacing upcoming instances.
- Decide whether to extend the same affordance to `event_series` (festivals). Lower priority still — series are rarer than templates and the existing series page can serve as a passive "follow."

**Why low priority:** The current save-only path is already honest — no false promise. A user who cares about a recurring event can save the current instance and check back. Follow-template is a nice-to-have that doesn't fix anything broken; it adds capability. Worth shipping once post-launch usage data shows whether users actually look for it (PostHog `event_bookmarked` events filtered to template-backed rows would be a good leading indicator).

**Implementation effort estimate:** ~half a day. localStorage shape extension is trivial; notify-route extension is ~30 lines mirroring the artist path; popover and card affordance are small. The bulk is testing edge cases (both artist + template linked, template that has no upcoming instances, user follows a template whose venue closes, etc.).

**See also:** `DATA_LIFECYCLE.md` §1 (entity model — templates and series both already exist as first-class tables); `ANALYTICS_PLAN.md` REQ-A5 / `event_bookmarked` (once template-following ships, an analogous `template_followed` capture lets us measure adoption).

---

## 7. Refactor seven call sites to import from `src/lib/taxonomy.js`

**Why parked:** Apr 27 shipped the canonical `taxonomy.js` constant and ran the DB migration that collapsed `events.category` (11→7 distinct values) and `event_templates.category` (10→5). The DATA layer is now canonical. The CODE layer still has seven writer/reader paths carrying their own local `CATEGORY_OPTIONS` / `ALLOWED_CATEGORIES` / `CATEGORY_CONFIG` arrays — they're correct today only because someone hand-aligned them. Closing this loop makes drift structurally impossible (the next contributor can't accidentally introduce a new vocabulary because there's only one to import).

**Scope:** seven files. Each is a one-import refactor — replace the local constant with the appropriate export from `taxonomy.js`.

1. `src/hooks/useAdminEvents.js` — replace `CATEGORY_OPTIONS` (line 42). Build dropdown options from `CATEGORIES` + `CATEGORY_LABELS`.
2. `src/components/admin/AdminEventTemplatesTab.js` — replace `CATEGORY_OPTIONS` (line 17). Same pattern.
3. `src/lib/eventClassifier.js` — replace `ALLOWED_CATEGORIES` (line 23). The LLM prompt's per-category guidance can pull from `CATEGORY_DESCRIPTIONS`.
4. `src/components/EventCardV2.js` — drop local `CATEGORY_CONFIG`, import from taxonomy.
5. `src/components/SiteEventCard.js` — same.
6. `src/app/page.js` — pill values (lines 119–126) reference canonical strings via `import { CATEGORIES }`. Today's pill values happen to be canonical, but moving to the import prevents future drift.
7. `src/lib/waterfall.js` line 131 — change literal `'Other'` fallback to `DEFAULT_CATEGORY`.

**Risk:** Low. Each file is a one-import refactor. Verify side-by-side: every category badge still renders on every card type, every admin dropdown saves the right value, the LLM classifier still produces canonical outputs.

**Effort:** ~30 minutes. Can ship as one PR (easier to review) or seven (more granular revert).

**See also:** `DATA_LIFECYCLE.md` §3 invariant 1 (canonical category strings) and §5.6 drift finding; `ANALYTICS_PLAN.md` is unaffected.

---

## 8. Backfill `events.artist_name` to match canonical `artists.name`

**Why parked:** `DATA_LIFECYCLE.md` §3 invariant 5: when an event is FK-linked to an artist (`artist_id IS NOT NULL`), the denormalized `events.artist_name` SHOULD equal `artists.name`. Drift causes ghost autocomplete entries — today's Kevin Hill investigation surfaced "Burning sun", "KEVIN HILL" (uppercase), and other variants on rows linked to canonical Kevin Hill. Hand-cleaned for that cluster; the pattern repeats across the artist roster.

**Scope:** SQL-only one-shot pass. For every event with non-NULL `artist_id` whose `artist_name` differs from the canonical and matches a known alias on the canonical, normalize. For anomalies (no match in name OR aliases — e.g., the May 29 "Burning sun" event before we unlinked it), leave the row alone and flag for human review. Sketch:

```sql
-- Audit first
SELECT a.name AS canonical, e.artist_name AS current, COUNT(*) AS rows
  FROM events e JOIN artists a ON a.id = e.artist_id
 WHERE e.artist_name <> a.name
 GROUP BY a.name, e.artist_name
 ORDER BY rows DESC;

-- Backfill where the current value is a recognized alias
UPDATE events e
   SET artist_name = a.name, updated_at = NOW()
  FROM artists a
 WHERE e.artist_id = a.id
   AND e.artist_name <> a.name
   AND lower(e.artist_name) = ANY(
     SELECT lower(unnest(COALESCE(a.alias_names, ARRAY[]::text[])))
   );
```

**Risk:** Low if the alias-match clause holds. Audit produces the worklist; review a sample before committing.

**Effort:** ~30 minutes including the audit.

**See also:** `DATA_LIFECYCLE.md` §3 invariant 5; §5.3 drift finding.

---

## 9. Orphan artist row audit + cleanup beyond Kevin Hill

**Why parked:** Kevin Hill cluster (Apr 28) showed the pattern: a manual merge updated `events.artist_id` to canonical but left the source rows behind in the artists table. Six rows became two; the other four were orphans with 0 events linked OR linked-but-name-drifted. The pattern almost certainly repeats across other clusters that were ever merged.

**Scope:** SQL audit to find candidates, then per-cluster cleanup. The audit:

```sql
-- "Definitely orphan" — unlocked, no aliases, no events linked
SELECT a.id, a.name, a.kind, a.last_fetched
  FROM artists a
 WHERE a.is_locked = false
   AND COALESCE(a.alias_names, ARRAY[]::text[]) = '{}'
   AND NOT EXISTS (SELECT 1 FROM events e WHERE e.artist_id = a.id)
 ORDER BY a.name;

-- "Probably alias" — name has telltale prefixes/suffixes that suggest it's
-- a scraper-emitted variant of a canonical artist
SELECT a.id, a.name FROM artists a
 WHERE a.name ~* '^(live music - |^.* solo$|^grateful mondays |^.* trio$)';
```

For each candidate, admin decides: truly orphan (delete) or a real artist (keep). For the "probably alias" set, find the canonical and run the same four-step transaction we did for Kevin Hill: push source name into `alias_names`, reassign events, normalize event `artist_name`, delete source.

**Risk:** Medium per cluster (each merge is destructive). Mitigate with a dry-run manifest before any DELETE.

**Effort:** ~1–2 hours for the audit + several cluster cleanups. More if the worklist surfaces many candidates.

**See also:** `DATA_LIFECYCLE.md` §5.2 drift finding; today's Kevin Hill cleanup in HANDOVER.

---

## 10. Reconcile remaining 64 template/event category disagreements

**Why parked:** Apr 27 taxonomy migration dropped event/template category disagreements from 99 → 64 (upcoming events only). The remainder is a mix of (a) deliberate event-level overrides where the admin chose a different category than the linked template, and (b) cascade damage where `events.category` was set incorrectly by AI or scraper before locks took effect. Reconciling them closes drift §5.1 in `DATA_LIFECYCLE.md`.

**Scope:** Pull the 64 rows, classify by lock state:

```sql
SELECT e.id, e.event_date, e.category AS event_cat, t.category AS tpl_cat,
       e.is_human_edited, e.artist_name
  FROM events e JOIN event_templates t ON t.id = e.template_id
 WHERE e.category IS DISTINCT FROM t.category
   AND e.event_date >= NOW()
 ORDER BY e.is_human_edited, e.event_date;
```

For `is_human_edited = false` rows: targeted UPDATE that adopts the template's category. Safe because unlocked = "automated processes may overwrite this."

For `is_human_edited = true` rows: leave alone. The admin deliberately set them differently from the template; that's a feature, not a bug.

**Risk:** Low for the unlocked subset. Locked rows untouched. Run an audit COUNT first to know the unlocked split.

**Effort:** ~20 minutes — audit query, eyeball the unlocked count, run the UPDATE.

**See also:** `DATA_LIFECYCLE.md` §5.1 drift finding.

---

## 11. Drifthouse scraper — returns 0 events from Vercel runtime, root cause unknown

**Why parked:** Apr 28, 2026. Onboarded the venue (id `5d0dc9f5-61a5-4ec2-9ce1-5c5a874a86b2`) and built the scraper for `https://drifthousenj.com/events/` — WordPress + Elementor + EBI events plugin. Three attempts to make it work, none succeeded:

1. **Initial scraper** (commit `4d92a0e`): `fetch()` with `Mozilla/5.0 (compatible; MyLocalJam/1.0; ...)` UA. First sync produced 17 Thursday events (the `.ebi-card` parse path); subsequent syncs returned count=0. Tuesday/Friday synth never produced anything.
2. **Browser UA + regex close-tag fix** (commits `fd89ac9` and `04ccc30a`): Switched to a real Chrome UA, added `Accept` and `Accept-Language` headers, fixed the regex bug where `</h6 >` (with trailing whitespace) didn't match `</h\d>`. Verified the regex correctly extracts `'Chad Acoustic'` against the actual page HTML in Node. Still returned count=0.
3. **proxyFetch via IPRoyal residential proxy** (this commit): Same pattern as AlgonquinArts / TimMcLoones / Starland / HOI. Drop-in swap. Still returned count=0.

**What we know for certain:**

- Browser fetches from a residential connection — both with the original `compatible` UA and with the Chrome UA — return the full ~160KB HTML containing all three music-section anchors and 18 `.ebi-card` elements. The page is server-rendered.
- The first sync succeeded enough to insert 17 Thursday rows (created_at = 17:31:36). Then subsequent syncs returned count=0 even though the deployed code was identical.
- proxyFetch didn't help, so it's not a simple datacenter-IP block.
- The diagnostic warn-line we added to log html_length / qodef-m-title count / ebi-card count / first 200 chars never came back to us — Vercel MCP auth is currently scoped without team access, and Tony didn't pull the line manually before parking.

**Disabled cleanly.** Removed `'Drifthouse'` from `FAST_SHARD_1` so it stops attempting on every cron. The scraper file, all sync-events wiring (import, destructure, Promise.all entry, scraperResults, VENUE_REGISTRY, allEvents spread), the venue row, and the 17 already-landed Thursday events all stay in place. Re-enabling is a one-line edit (uncomment the line in `FAST_SHARD_1`).

**State left in DB:** 17 Thursday events (Apr 30 → Aug 27, 2026), all with `is_human_edited=false`. They'll display correctly on the public feed but won't update or refresh until the scraper works again.

**Things to try when this is picked back up:**

1. **Pull the diagnostic warn line from Vercel logs** — `[Drifthouse] 0 events parsed. html_length=N, qodef-m-title_count=N, ebi-card_count=N. First 200 chars: ...`. Either reconnect the Vercel MCP with team scope, or paste manually. This is the missing data point that would have told us in 30 seconds where the failure actually happens. Most likely path: html_length tiny / counts all 0 means the response is being blocked or interstitial-replaced; counts non-zero means it's a parsing issue we missed.
2. **Try a different UA / header set** — possibly the IPRoyal proxy itself is being identified by Drifthouse's host (some hosts maintain proxy-IP blocklists). Use the Chrome MCP to fetch from your residential connection and capture every header sent (including the ones Chrome adds automatically), then match them in the scraper.
3. **Use Playwright** as a heavier last resort. The `houseOfIndependents.playwright.js` and `brielleHouse.playwright.js` files in the codebase show the pattern — runs as a separate GitHub Actions job, full headless browser. Heavyweight but bypasses any anti-bot heuristic that depends on JS execution / browser fingerprinting.
4. **Direct contact with Drifthouse** — they might whitelist a UA / IP if asked. Lowest engineering cost if they're amenable.

**Files in current state:**
- `src/lib/scrapers/drifthouse.js` — proxyFetch + BROWSER_HEADERS, three-section parsing, regex fix, diagnostic warn-line. Ready to re-enable.
- `src/app/api/sync-events/route.js` — Drifthouse line in `FAST_SHARD_1` is COMMENTED OUT. Wiring everywhere else stays.
- `venues` row id `5d0dc9f5-61a5-4ec2-9ce1-5c5a874a86b2` — populated, geocoded, default_start_time `19:00`. Stays.

**Effort estimate when revisiting:** ~30 min if the Vercel log has a clear "blocked" signature. ~1-2 hours if it requires a Playwright build-out. The site is server-rendered so there's no JS-execution requirement that forces Playwright; it'd be a fallback only.

---

## ~~12. Edit pencils still rendering in EventsTab + ArtistsTab~~ — RESOLVED Apr 29

Closed during the Apr 29 stopPropagation fix on AdminEventsTab. The pencils were correctly removed in source code; the previous deploy had stalled on the force-push (the diagnosis was right). When the new stopPropagation commit deployed cleanly, the pencils disappeared along with the click-bubbling fix. Two-for-one.

---

## 13. Add per-scraper filter to `/api/sync-events` for isolated testing

**Why parked:** Apr 28, 2026. Adding Lighthouse Tavern (commit pending) blew past Vercel's 60s function timeout when manually triggering `tier=slow` from the browser console. The slow-tier production path is fine — it runs via GitHub Actions cron with a 6-hour budget — but the manual-test path is unusable for any scraper that lives in a tier alongside multiple OCR scrapers. Same friction was present for Drifthouse debugging (PARKED #11): we couldn't easily isolate one scraper to inspect its diagnostic output.

**Scope:** Tiny route change in `src/app/api/sync-events/route.js`. Add a `?scraper=` query param that, when set, overrides the tier/shard gate and runs only the named scraper:

```javascript
// Existing — leave the tier/shard params alone:
const tier = searchParams.get('tier') || ...;
const shardParam = searchParams.get('shard') || ...;

// NEW — per-scraper override:
const scraperFilter = searchParams.get('scraper');

function shouldRunScraper(key) {
  if (scraperFilter) return key === scraperFilter; // exact match wins
  if (SLOW_SCRAPER_KEYS.has(key)) return includeSlow;
  if (FAST_SHARD_1.has(key)) return includeShard1;
  if (FAST_SHARD_2.has(key)) return includeShard2;
  return false;
}
```

**Usage after it ships:**

```js
fetch('/api/sync-events?scraper=LighthouseTavern&skipEnrich=true', { method: 'POST', headers: {...} })
fetch('/api/sync-events?scraper=Drifthouse&skipEnrich=true', { method: 'POST', headers: {...} })
fetch('/api/sync-events?scraper=IdleHour&skipEnrich=true', { method: 'POST', headers: {...} })
```

Each runs in ~3-10s, well under the 60s Vercel cap. Backwards-compatible — existing `tier=` / `shard=` callers keep working unchanged.

**Why not split the slow tier into two shards instead:** considered. Solves the wrong problem. Splitting helps tier-level manual triggers but still runs ~half the scrapers (overkill when testing one). Per-scraper filter handles every case the shard split would, without the infra overhead of a second cron entry.

**Risk:** Low. Adds a single conditional at the top of `shouldRunScraper`. Doesn't change cron behavior. Doesn't change production paths. Could ship as a hotfix.

**Effort:** ~15 minutes including writing and testing the filter against one or two scrapers locally.

**See also:** `SCRAPERS.md` (tier/shard model); PARKED #11 (Drifthouse — would have benefited from this filter when we were trying to pull diagnostic output).

---

## ~~14. Doyle's Pour House scraper — iCal export disabled~~ — DIAGNOSIS WAS WRONG, WORKING NOW

The Apr 28 parking diagnosis was incorrect. The Google Calendar iCal export DOES work for Doyle's. On Apr 29 we discovered 30+ Doyle's events in the production DB (created at `2026-04-29 03:39:59 UTC`), all sourced cleanly from the iCal endpoint. The original count=0 was likely a transient Google-side hiccup — the scraper has been running fine since.

**Action item (small):** Tony's local copy of `src/app/api/sync-events/route.js` still has `'DoylesPourHouse'` commented out in `FAST_SHARD_1`. The deployed Vercel version has it uncommented (which is why scraping has been working). Next push needs to **uncomment the line locally** before pushing, otherwise a future deploy disables a working scraper. ~30-second fix, just don't forget.

**State left in DB:** ~30 events confirmed (Todd Meredith, Chuck Miller, Problem Child, Jack Mangan, Dale and Amy, Jimmy Brogan, Steamboat Messiah, Chuck DeBruyn, Brandon Ireland Duo, Sapp and Oak, Shay Mac, etc.) rolling Apr 30 → July.

---

## 15. Auto-create artist flow tags everything as `kind='musician'`

**Why parked:** Apr 29, 2026. Surfaced during the EVENT-kind audit and the auto-link sweep. The scraper / auto-create path tags every new artist row with `kind='musician'` regardless of whether the source string is actually a musician. Result: the artists table has rows like "Asbury Park Rodeo For Recreation" (community event), "Corona Promo" (promotional event), "2026 Summer Season Opening Party", "Emo In Bloom on The Rooftop" — all marked `kind='musician'`. The audit query that excludes `kind='event'` doesn't catch them, so they slip through any musician-targeted enrichment or cleanup pass.

**Two complementary fixes:**

1. **Detect non-musician patterns at create time.** Scraper / admin auto-create flow should pattern-match the candidate name and either skip artist creation OR tag as `kind='event'` when the name contains: a year (`/\b20\d{2}\b/`), promo/event keywords ("Party", "Promo", "Celebration", "Fundraiser", "Rodeo", "Recreation", "Opening", "Industry Night"), or food/drink keywords ("Happy Hour", "Wine Tasting", "Trivia", "Karaoke", "Bingo"). These are templates / events, not artists.
2. **Hide the kind setter in admin UI.** The artists tab shouldn't expose `kind='event'` as a manual choice. New artists default to `musician` (or null), and the `event` value only exists for legacy rows already flagged for deletion. Removes the temptation to mis-classify going forward.

**Why it matters:** Every new EVENT-kind-misclassified-as-musician row is a future "Meet Artist" CTA pointing nowhere, a Magic-Wand AI lookup wasted on a non-existent band, and an enrichment-target that pollutes the audit query. Fixing it at create time stops the bleeding; the orphan cleanup (PARKED #9, plus today's discoveries) handles the legacy.

**See also:** PARKED #9 (orphan artist audit); the 18 orphan rows + 4 currently-linked rows (Jazz Arts Jam Sessions, Spring Sip & Shop, Asbury Park Rodeo, etc.) are the existing legacy that this fix would prevent in future.

---

## 16. Bakes Brewing scraper — `LIVE MUSIC[:|-]` prefix creates duplicate artist rows

**Why parked:** Apr 29, 2026. The Bakes Brewing scraper output contains TWO rows for the same act, one with a "LIVE MUSIC: " or "LIVE MUSIC-" prefix and one without:

- "Grateful Dave" + "LIVE MUSIC-Grateful Dave" — both for Sat May 2 at 21:00
- "P Dub Assassins Acoustic" + "LIVE MUSIC: P Dub Assassins Acoustic" — both for Fri May 1 at 22:00

Same artist, same time, different `external_id`, both get inserted as separate events AND both create separate artist rows.

**Fix:** In `src/lib/scrapers/bakesBrewing.js`, strip the `LIVE MUSIC[:|-]\s*` prefix before computing `artist_name` / `external_id`. Both spellings normalize to the same canonical name and dedupe naturally. Existing duplicate rows need a one-shot SQL pass: merge events.artist_id on the prefixed row to the canonical row, then delete the prefixed artist row.

**Effort:** ~15 minutes for the scraper fix + 10 minutes for the cleanup SQL.

**See also:** today's PARKED.md "Recently shipped — Apr 29" entry mentions the audit caught these.

---

## 17. Compound artist names from multi-band bills — generalize the fix

**Why parked:** Apr 29, 2026. The Apr 29 cleanup hand-fixed five compound names (ALL THAT REMAINS, The Flatliners, SongsByWeen, The Tacet Mode + minor ones) by renaming to the headliner and pushing the bill text into `alias_names`. The pattern repeats across the artists table — anywhere a touring bill or "with special guests" formatting got captured as the artist name.

**Pattern-match heuristics for an automated cleanup:**

- Names containing `, ` (commas separate co-bills): `"Hunchback, Either Either, The Long Defeats, Johnny Nameless"` — first segment is the headliner.
- Names containing ` w/ ` or ` with `: `"The Flatliners & A Wilhelm Scream w/ Signals Midwest"` — text before w/ is the bill, headliner is the leftmost solo segment.
- Names containing `with Special Guests`, `featuring`, `feat.`, `ft.`: split on the marker, keep the left side, push right side to alias.
- Names with a tribute suffix: `"SongsByWeen The WEEN Tribute"` — strip "The X Tribute" suffix, keep canonical band name.

**Approach:** SQL audit query first to surface candidates. Then a per-cluster transaction (rename + push to alias_names + clear bio if scraper-junk) for each. Could be a one-shot script or a button in the artist admin tab ("Clean polluted name").

**Risk:** Medium — destructive renames. Mitigate with a dry-run manifest (audit shows candidates with current and proposed names side by side; admin reviews before committing).

**Effort:** ~1-2 hours for the audit + cleanup pass. Or several smaller passes as the pattern surfaces in future enrichment work.

**See also:** PARKED #9 (orphan artist audit — overlapping pattern, but #9 is "rows with no events," #17 is "rows with events but polluted names"); today's session shipped 5 of these by hand.

---

## 18. Continue Tier 1 weekend artist enrichment (~30 artists remaining)

**Why parked:** Apr 29 session ran out of time after validating the AI Enhance + image lightbox flow on 4 artists (ALL THAT REMAINS, John Eddie, The Flatliners, SongsByWeen). The remaining ~30 Tier 1 weekend artists (Apr 30 – May 3) are local solo/duo/band/DJ acts that need the same per-event manual run.

**Workflow per artist (proven on 4):**

1. Open the event in admin Event Feed
2. Click ✨ "AI Enhance (Bio + Genre + Vibe)" — fills custom_bio, custom_genres, custom_vibes (the canonical-list fix from today means genres now match buttons)
3. Click ✨ "AI Image Search" — opens 5 candidates
4. Click candidate → confirmation lightbox → review side-by-side → "Use This Image" or Cancel
5. Click "Update Event" to commit

**Tier 1 priority list (clean band names, real database presence):**
- DJs: DJ Dominic Longo, DJ Funsize, DJ Patman, DJ JADEN T
- Local headliners: Tony Pontari, Megan Knight, Eddie Testa, Jack Mangan, Bob Boross, Kevin Koczan
- Bands: Wrong Exit, Friend Zone Band, Lick of Sense, Undisputed, El Ka Bong, Goldenseal, Big John + Little Maria, The Snark Twins
- Tribute / cover: Rob Messina (Dave Matthews Cover Band), Jr Paul's
- Duos: Jill McCoy Duo, Todd Robbins Duo, Wayne Bilotti & Co, Serious FM Duo, Steve Reilly
- Etc. — full list in the audit query already run.

**Tier 2 (multi-band bills) and Tier 3 (events disguised as artists)** were identified in the Apr 29 audit and intentionally skipped — they need cleanup (PARKED #15 + #17), not enrichment.

**Effort:** ~2-3 minutes per artist × ~30 = 60-90 min of focused clicking. Best done in one sitting once ready.

---

## 19. Manually link the 25 still-unlinked weekend events

**Why parked:** Apr 29 auto-link sweep knocked the unlinked weekend pool from 51 → 25. Remaining 25 events couldn't be auto-matched because either (a) their `artist_name` doesn't exact-match any existing artist row, or (b) the artist row exists but with a different spelling/casing/punctuation that `LOWER(REGEXP_REPLACE(name, '^the\s+', ''))` didn't catch.

**Two paths for each:**

1. **Existing artist, just typo'd name** — link manually via admin event edit (artist autocomplete → pick canonical → save). Fast for clear cases.
2. **No matching artist exists** — create a new artist row, then link. Slower but unavoidable for new acts.

**Triage tip:** the audit query that surfaced the 25 includes the event's current `artist_name`. Eyeball the list against the existing artists list and most will sort into pile 1 (typo) or pile 2 (genuinely new) within a minute each.

**Effort:** ~30 min for all 25.

---

## See also

- **CATEGORIES-HANDOFF.md** — category/shortcut audit + auto-templates from event history (parking lot section)
- **HANDOVER.md** — venue scraping status board
- **SERIES_AUTOMATCH.md** — event_series automatch ideas
