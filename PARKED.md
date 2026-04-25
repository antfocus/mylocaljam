# Parked Work

Living list of work that came up during sessions but was deliberately deferred. Cross-referenced with the TaskList; check there for status. Delete an entry once it ships.

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

**Why it matters:** Closes the loop on the venue normalization fixes from this session — admins can correct mismatches and add missing venues without touching SQL.

**Files to touch:**
- `src/app/admin/page.js` — add nav item + route
- `src/components/admin/AdminVenuesTab.js` — new component (currently `AdminVenuesTab.js` is the *Scrapers* view despite the name; rename or pick a new path)
- `src/hooks/useAdminVenues.js` — already exists, has fetch logic for scraper health; extend for CRUD
- `src/app/api/admin/route.js` — add venue create/update/delete handlers

---

## 2. Image curation — Phase 1 (Supabase Storage for high-profile artists)

**Why parked:** Discussed Friday Apr 25. Confirmed Supabase Storage is the right home (free tier 1GB; ~5,000 artist photos at typical compression). User wanted to ship deployment fixes first.

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
