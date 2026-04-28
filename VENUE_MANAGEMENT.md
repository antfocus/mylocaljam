# myLocalJam — Venue Management Skill

> **Skill scope.** Maintaining venue data integrity over time. Adding a new venue, updating one, merging duplicates, deactivating one, and the per-field invariants every venue row must satisfy. Owns: required fields, geocoding, CMS identification + scraper linkage, venue name aliases, and town aliases.
>
> **Companion docs.** `IMAGE-MANAGEMENT.md` owns the actual image sourcing and PostImages re-host logic — when this skill hits an image step, it delegates there. `SCRAPERS.md` owns scraper authoring; this doc handles the *linkage* between a venue row and its scraper but doesn't teach you how to write one. `DATA_LIFECYCLE.md` is the cross-cutting reference for invariants.

---

## §1. Required fields per venue

Every row in `venues` must satisfy:

- `name` — canonical display name. No "and Grill" or "Bar & Restaurant" appended unless that's how the venue actually presents itself. No leading article ("The") unless it's part of the venue's branding ("The Stone Pony" — yes; "The Sun Harbor Grill" — no, just "Sun Harbor Seafood and Grill").
- `address` — full street address including city, state, zip. Format: `123 Main St, Belmar, NJ 07719`.
- `city` — the canonical city. NOT necessarily the city in `address` — if the address says "Belmar" but the venue is actually in Lake Como (a 0.25-sq-mi borough surrounded by Belmar), set `city = 'Lake Como'` and rely on the town aliases system (§6) to surface it under "Belmar" searches.
- `latitude`, `longitude` — geocoded coords. See §3.
- `website` — the venue's OFFICIAL site, NOT the scraper origin URL. The 🌐 Venue button on event cards reads this.
- `photo_url` — venue exterior or interior photo, sourced and re-hosted per `IMAGE-MANAGEMENT.md`.
- `venue_type` — one of: `Bar`, `Restaurant`, `Brewery`, `Brewpub`, `Music Hall`, `Theater`, `Outdoor Venue`, `Festival Site`, `Other`. (Dropdown lives in `AdminVenuesTab.js`.)
- `tags` — array of feature tags: `Outdoor`, `Outdoor Seating`, `Patio`, `Rooftop`, `Dog Friendly`, `Pet Friendly`, etc. Drives the home-page filter pills (Outdoor, Dog Friendly).
- `default_start_time` — the venue's typical event start time, e.g., `'19:00'`. Used as the lowest tier of the start-time waterfall when scraper, template, and event_date all fail to produce one. Optional but recommended.
- `slug` — URL-safe slug derived from name. Optional today; reserved for future per-venue pages.
- `cms_type` — see §4. Optional today, will be required after backfill.
- `scraper_key` — see §4. Optional today, will be required after backfill.

If any of the required fields above are missing, the venue is in a degraded state. The admin venue tab should flag these — that's a follow-on to this skill (build the lint UI).

---

## §2. Image sourcing

Delegate to `IMAGE-MANAGEMENT.md` for the full procedure. One paragraph for venues specifically:

The right photo is a venue exterior shot or a clean interior wide-angle. Avoid event flyers, food close-ups, or staff portraits — those age out and don't visually anchor the venue. Permitted sources for venue photos: the venue's own website (about / press / interior pages), Google Maps Street View screenshots cropped to the storefront (re-hosted), Yelp business photos (re-hosted), Instagram business profile (only the venue's own posts, never user content). PostImages re-host is mandatory — never write a third-party CDN URL into `venues.photo_url`.

Banned sources for venues: Facebook CDN URLs (expire in hours), Google Images thumbnails (`encrypted-tbn0.gstatic.com` — same), stock photos, AI-generated imagery, screenshots of menus.

---

## §3. Geocoding

When a new venue lands without coords, run the address through a geocoder. Recommended: Google Maps Geocoding API (paid but accurate) or Nominatim (free, OSM-backed). For our scale (50–200 venues) Nominatim is fine.

Sanity check: the resulting `(lat, lng)` should plot somewhere in coastal Monmouth/Ocean County NJ. Any result outside the bounding box `[39.0, 40.5]` lat / `[-74.5, -73.7]` lng is a geocoder fail — investigate the address before saving. The home-page distance filter relies on these coords; bad coords mean events disappear from radius searches even when the user is right next to the venue.

`venues.latitude` and `venues.longitude` are `double precision`. Keep at least 5 decimal places (~1m precision). Don't round to 2 decimals — that quantizes to a 1km grid and breaks neighborhood-level distance ranking.

---

## §4. CMS identification and scraper linkage

Two new columns on `venues` (planned, see `DATA_LIFECYCLE.md` §6 prioritized work):

- `cms_type` — what platform the venue's events page is built on. Values: `Squarespace`, `WordPress`, `Wix`, `Webflow`, `BackSpace`, `BandsInTown`, `Eventbrite`, `Custom`, `None`. Determined by curling the venue site and inspecting headers + meta tags + DOM patterns.
- `scraper_key` — the file name under `src/lib/scrapers/` that handles this venue (e.g., `'sunHarbor'` for `src/lib/scrapers/sunHarbor.js`). NULL if no scraper exists yet.

When onboarding a new venue:

1. **Fetch the events page** via curl. Look at the response: HTML structure, meta tags, framework signatures.
   - Squarespace: `<meta name="generator" content="Squarespace">` + `assets.squarespace.com` references.
   - WordPress: `wp-content/` paths in asset URLs.
   - Wix: `wix.com` in asset URLs, distinct DOM patterns.
   - BackSpace (used by some shore venues): distinct event-list shape, `backspaceeventcalendar.com` references.
   - BandsInTown / Eventbrite: external widget; usually means scraping their API rather than the site itself.

2. **Check if an existing scraper handles this CMS.** Several venues share patterns: most NJ-shore Squarespace venues fit the same scraper template. Most BackSpace venues fit a single scraper. Reuse first.

3. **If reuse possible**, add the venue to the existing scraper's URL list. Set `scraper_key` to the existing file. Done.

4. **If new scraper needed**, see `SCRAPER_PROMPT.md` for the agent kickoff that walks through writing one. Keep `scraper_key` NULL until the scraper file lands.

5. **Add to the right shard** in `src/app/api/sync-events/route.js`. See `SCRAPERS.md` for shard membership rules — fast scrapers go in shard 1 or 2 (alternating to balance the 60-second Vercel cap), slow scrapers (Vision OCR, proxy-required, Playwright) go in `SLOW_SCRAPER_KEYS` and run weekly via GitHub Actions.

---

## §5. Venue name aliases

Task #36 from older backlog. Status: not yet implemented.

**The problem.** Scrapers and OCR produce venue name strings that don't match the canonical row. Examples observed in production:

- Canonical: `"Eventide Grille"` → scraper emits `"EvenTide Grille, Navesink Marina"`
- Canonical: `"The Stone Pony"` → some sources emit `"Stone Pony Asbury Park"`
- Canonical: `"Sun Harbor Seafood and Grill"` → some emit `"Sun Harbor Seafood & Grill"` (ampersand vs "and")

The admin approval modal does exact-string matching on venue lookup. When scraper output doesn't match a canonical row, the admin either trims the string manually OR clicks "+ Create New Venue" and accidentally creates a duplicate venue row. Both happen.

**Proposed fix.** Add `name_aliases text[]` to the `venues` table. Update the venue lookup in `POST /api/admin/queue` and the admin autocomplete to match `name OR ANY(name_aliases)` ILIKE-fuzzy.

When merging duplicate venues, push the merged row's name into the canonical's `name_aliases` before deletion (mirrors the artist-merge pattern from `ENRICHMENT.md` §11).

---

## §6. Town aliases

New requirement. Status: not yet implemented.

**The problem.** Lake Como is colloquially "Belmar" — it's a 0.25-sq-mi borough completely surrounded by Belmar. Bradley Beach venues are often searched as "Belmar." Loch Arbour overlaps with Allenhurst. Today's town filter does exact-match on `venues.city`, so a user searching "Belmar" sees only venues with `city = 'Belmar'`, missing Lake Como/Bradley Beach venues that locals consider Belmar.

**Schema decision.** Two shapes considered:

A) **Flat `town_aliases (canonical_town_name, alias_name)` table.** Simple. Cheap to query.

B) **Richer `towns (id, name, aliases text[], default_radius_miles, lat, lng)` table.** More extensible — eventually we'll want a town-level page, default search radius per town (Asbury Park = 1mi; Wall Township = 5mi), centroid coords for radius math.

Recommendation: **B**. The flat table forces another migration when we add per-town attributes. The richer table costs nothing extra today and accommodates obvious follow-on features.

**Schema sketch:**

```sql
CREATE TABLE towns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text UNIQUE NOT NULL,
  aliases         text[] DEFAULT '{}',
  default_radius  numeric DEFAULT 5.0,     -- miles
  latitude        double precision,
  longitude       double precision,
  created_at      timestamptz DEFAULT NOW()
);

CREATE INDEX towns_name_lower_idx ON towns (lower(name));
CREATE INDEX towns_aliases_gin    ON towns USING GIN (aliases);
```

**Search-side change.** Home-page town filter currently filters `venues.city = 'X'`. After the change, it expands `'X'` into `[X] + towns.aliases WHERE name = 'X' OR 'X' = ANY(aliases)` and filters `venues.city IN (expanded_set)`.

**Initial seed (representative, not exhaustive — admin curates the full list):**

```
Belmar         aliases: [Lake Como, Bradley Beach (partial)]
Asbury Park    aliases: [Ocean Grove (partial), Bradley Beach (partial)]
Allenhurst     aliases: [Loch Arbour, Deal (partial)]
Sea Bright     aliases: [Monmouth Beach (partial)]
Manasquan      aliases: [Brielle (partial), Sea Girt (partial)]
Point Pleasant aliases: [Point Pleasant Beach, Bay Head (partial)]
```

Aliases are NOT symmetric by default. Searching "Lake Como" would NOT auto-expand to include Belmar venues — the user typed Lake Como, they probably mean Lake Como specifically. The aliasing is one-direction: `Belmar` includes Lake Como, but Lake Como doesn't include Belmar. (If symmetric is desired later, that's an admin checkbox per pair.)

Admin UI for managing aliases: a new tab under venues — `AdminTownsTab.js` — lists all towns and lets the admin add/remove aliases.

---

## §7. Common operations

### Add a new venue

1. Confirm the venue isn't already in the DB. Search by name and aliases (when §5 ships).
2. Geocode the address (§3). Sanity-check the coords.
3. Identify the CMS (§4). Decide reuse vs new scraper.
4. Source a venue photo per `IMAGE-MANAGEMENT.md`. Re-host to PostImages.
5. Insert via admin venues tab. All required fields from §1 populated.
6. Wire scraper: add to the existing scraper's URL list OR write a new one (`SCRAPER_PROMPT.md`). Set `scraper_key`.
7. Run a manual sync to verify events come through. Spot-check the first 3–5 events on the public feed.

### Merge two venues

The same physical venue exists under two names — usually because a scraper accidentally created a duplicate (§5). The fix is the four-step transaction (mirrors artist merge):

1. Decide which row is canonical (usually the one with the cleaner name + more linked events).
2. Reassign all `events.venue_id` from source to canonical.
3. Push the source's `name` into the canonical's `name_aliases` (when §5 ships).
4. Delete the source row.

Today the admin merge UI may not do all four steps in one transaction — verify before relying on it.

### Deactivate a venue (closed permanently)

DON'T hard-delete. The historical events should remain queryable for users who saved them.

Today there's no `status` flag on `venues`. Either:

- Leave the row in place but stop running the scraper against it (drop it from the scraper's URL list, set `scraper_key = NULL`).
- Add a `status` column (`active` / `closed`) and update the admin lookup to exclude `closed` venues from new submissions.

Recommendation: add the `status` column when you have a venue to close. For now, the scraper-removal approach is fine.

### Deal with a duplicate-venue submission from an admin

A community-submitted event lists a venue that doesn't quite match any existing row. Admin clicks "+ Create New Venue" and creates a duplicate.

Today: prevented only by admin discipline. After §5 ships: the lookup will fuzzy-match aliases and surface the canonical row before the admin reaches the "+ Create" path.

---

## §8. Open work specific to this skill

Cross-references with `DATA_LIFECYCLE.md` §6 prioritized remediation:

1. Backfill `venues.website` for all venues currently NULL where an obvious official URL exists. Manual admin pass via AdminVenuesTab.
2. Add `cms_type` and `scraper_key` columns; backfill from current scraper file inventory.
3. Add `name_aliases text[]` (§5); update venue lookup query in `POST /api/admin/queue` and admin autocomplete.
4. Build `towns` table + seed (§6); update home-page town filter to expand-via-aliases.
5. Build `AdminTownsTab.js` for managing aliases.
6. Add `status` column to `venues` for soft-deactivation (§7).
7. Make the venue-merge admin UI atomic and complete (the four-step transaction).

Each of these is a small-to-medium PR. Order is suggested but not strict — (3), (4), (5) form a natural cluster (alias system end-to-end); (1), (2) are independent backfills that can happen any time; (6), (7) are quality-of-life that wait until the alias work lands.
