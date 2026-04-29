# myLocalJam — New Session Kickoff (April 28, 2026)

Paste this whole file into the new chat as the opening message.

---

You're picking up work on **mylocaljam.com** — a Next.js 14 + Supabase + Vercel live music aggregator for the Jersey Shore. Tony is the founder. The site is in launch-prep with a target of early May 2026.

## Read these first, in this order

1. **`HANDOVER.md`** — the full ops journal. Search for "April 27, 2026" to read the last two session entries (artist-directory cleanup, then the same-day continuation covering Hero/Card waterfall, location filter polish, venues.city, autocomplete fix). Everything else in HANDOVER is older and only worth scanning.
2. **`FRONTEND_SOP.md`** — UI/UX standards. Inline styles only (no Tailwind classes), inline SVGs only (no icon libraries), darkMode ternaries everywhere. New sections at the bottom cover the local-first location autocomplete and town-only filter.
3. **`Agent_SOP.md`** — broader operational SOP (deprecated; mostly migrated into the skill-specific MDs below, but still has useful sections on sync infrastructure, scraper conventions, and Vercel auth).
4. **`ENRICHMENT.md`** — the metadata-enrichment playbook (LLM router, kind taxonomy, locks, image verification, vibe inference). Read this before touching anything in `src/lib/aiLookup.js` or `src/lib/enrichmentPriority.js`.
5. **`IMAGE-MANAGEMENT.md`** — narrow scope: just artist/event image handling (waterfall, Triple Crown precedence, Supabase Storage migration plan).
6. **`SCRAPERS.md`** — venue-by-venue scraper notes. Reach for this when a specific scraper is acting up.

Don't read the rest unless something points you there.

## Outstanding tasks (in rough priority order)

### #82 — Admin Venues management tab (CRUD) ⭐ HIGH PRIORITY

The schema is already in place: `venues.city` column exists, populated for ~50 venues. We hand-fixed seven city-data issues at the end of the April 27 session (Boatyard 401 was assigned to Manasquan but is actually in Point Pleasant Beach; several venues had `city='NJ'` or `'Garden State Pkwy'` from parser mangling). The town-only filter (now live) makes these data-quality issues user-visible, so the admin UI to fix them is now urgent.

**Scope:**

1. New admin tab `src/components/admin/AdminVenuesTab.js` — sortable list of all venues (search by name + city).
2. Edit modal per venue: name, address, city, latitude, longitude, photo_url, website, color, venue_type, tags, default_start_time, slug.
3. **"Geocode this address" button** — calls Nominatim with the address, writes lat/lng/city back into the row. This is what closes the loop on parser-munged cities.
4. **"+ Add Venue"** — manual creation for the long tail.
5. Bulk audit view at the top: rows where `city IS NULL`, or `city ~ ' NJ$'`, or `city ~ '\d{5}$'`, or `latitude IS NULL`. Show count, click to filter list.
6. **Stretch:** duplicate detection (same name, different cities/addresses) with merge button.

**Estimated time:** 2–3 hours. Pattern: model after `AdminArtistsTab.js` — list rendering, edit modal, PUT to `/api/admin/venues`. The artists tab uses the same Supabase RLS-protected admin route pattern; mirror it.

### #83 — Image curation Phase 1: Supabase Storage migration

Migrate high-profile artists' images from external URLs (Last.fm, Perplexity-found Google CDN URLs) to Supabase Storage so we control the asset and don't break when the source rotates. Phase 1 = top ~100 artists by upcoming-event count. See `IMAGE-MANAGEMENT.md` for the design doc.

### #84 — Backfill historical orphan events with artist_id + venue_id

When sync ingests events, it's supposed to resolve `artist_id` and `venue_id` from string matches against the artists/venues tables. Many old rows are missing these FKs, which breaks the artist profile screen (events don't show up under their artist). Need a one-shot backfill script that walks all events and tries to resolve.

### #85 — White-text-on-orange button sweep

A handful of CTAs across the site still use white text on the orange (`#E8722A`) brand color, which fails WCAG contrast. Find them all and switch to dark text (`#1C1917`). Greppable. Should be 30 min.

### #86 — Custom scraper for Asbury Park Boardwalk venue family

Wonder Bar, Stone Pony, Convention Hall, etc. all share an AXS/Carbonhouse-style booking system that the existing scraper doesn't handle. Currently we're getting these via Ticketmaster which misses local-only shows. Build a custom scraper. See `SCRAPERS.md` line near "Wonder Bar" for prior debugging notes.

### #106 — Replace regex `looksLikeEvent` filter with `kind='musician'` server-side

Today the My Locals tab uses a regex prefilter (`FollowingTab.js`) as a launch-time band-aid for the artist-vs-event distinction. The proper fix is to filter `WHERE kind='musician'` server-side. Now that the `kind` column is populated (1118 musicians / 100 billing / 14 event), this is cleanup work, not invention. Affected surfaces: My Locals tab, home autocomplete, follow-suggest.

## Today's working state

- All April 27 changes are committed and pushed. Production is current.
- Vercel auto-deploy from `main`. Branches are fine; PRs aren't required.
- Supabase project ID: `ugmyqucizialapfulens` (prod). Staging: `arjswrmsissnsqksjtht`.
- Tony tests on iPhone Safari + desktop Chrome. Always check both.

## Conventions Tony cares about

- **Don't add lists to chat replies** unless there's a real reason. Tony pushes back on bullet-point overuse.
- **Don't pay for premium LLMs** for backfill work without asking — Tony would rather hire a freelancer.
- **Always show the actual diff** before claiming work is done. He'll catch anything you handwave.
- **The launch window is Thu–Sun, 4/30–5/31.** Anything that ships affects the demo. If a change is risky, ship it behind a feature flag or split it into staging-only first.
- **Light mode matters.** It's the default for new visitors. Always test both modes.

## First step

Open the new chat and ask Tony which of #82–#106 he wants to tackle first. He'll likely pick #82 (venues management) since the data-quality issues are now visible to users.
