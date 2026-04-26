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

## See also

- **CATEGORIES-HANDOFF.md** — category/shortcut audit + auto-templates from event history (parking lot section)
- **HANDOVER.md** — venue scraping status board
- **SERIES_AUTOMATCH.md** — event_series automatch ideas
