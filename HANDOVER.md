# myLocalJam — Production Handover

**mylocaljam.com** — Next.js 14 + Tailwind CSS + Supabase live music discovery app for NJ shore venues. Deployed on Vercel. Auto-sync runs twice daily via cron.

---

## 1. Production Milestones (April 1, 2026)

### Public RLS Policies — Shared Links Work for Everyone
Unauthenticated users can now view `/event/[id]` and `/artist/[id]` links (iMessage, Twitter, Slack). `USING (true)` SELECT policies on `events`, `artists`, and `venues` for all roles. Migration: `sql/public-read-rls-policies.sql`. Server-side `getServerClient()` hardened with `.trim()` on env vars and anon-key fallback logging.

### `authReady` Race-Condition Fix
Prevents UI flash of "Create Free Account" banner for already-logged-in users. Pattern: `authReady` boolean set after `supabase.auth.getSession()` resolves; banner wrapped in `{authReady && !isLoggedIn && (...)}`. Applied in `EventPageClient.js`, `ArtistPageClient.js`, and `page.js`. URL param handler split into two `useEffect` hooks — data deep-links (`?event=`) fire immediately, auth redirects (`?signup=`/`?login=`) deferred until `[authReady]`.

### 15-Genre / 6-Vibe Admin Grid
Canonical taxonomy locked across the codebase in `StyleMoodSelector.js` (shared pill-grid component) and `lib/utils.js` (constants for AI lookup + admin pages). CSS Grid layout: 3 columns for genres, 2 for vibes. All options render permanently — selected tags get accent border + tinted background, unselected show muted outline. No `Other` or custom input. `EventFormModal.js` renders `StyleMoodSelector` unconditionally with `disabled` prop when locked (removed conditional ternary that hid unselected tags).

**Genres (15):** Rock / Alternative · Yacht Rock / Surf · R&B / Soul / Funk · Country / Americana · Pop / Top 40 · Acoustic / Singer-Songwriter · Jazz / Blues · Reggae / Island · Jam / Psych · Metal / Hardcore · Punk / Ska · Hip-Hop / Rap · Electronic / DJ · Latin / World · Tributes / Covers

**Vibes (6):** Acoustic / Intimate · Outdoor / Patio · Family-Friendly · High-Energy / Dance · Chill / Low-Key · Late Night / Party

### OG Metadata Fallback Images
OG image tags use absolute URLs (`${baseUrl}/myLocaljam_Logo_v5.png`) in both `/event/[id]/page.js` and `/artist/[id]/page.js`. Required because no `metadataBase` is set in the root layout. Description waterfall: bio (truncated 160 chars) → date-based → venue-based generic text.

### Spotlight Quality Guardrails
`is_featured` toggle moved exclusively into `EventFormModal.js` (removed from list-level quick-toggle). Validation requires both image (custom_image_url || event_image_url || inherited artist image) AND bio (custom_bio || inherited artist bio) before activation. Rejection toast on failure, success toast on save.

### Artist Route (`/artist/[id]`)
Created from scratch: server component with `generateMetadata` + `ArtistPageClient.js` (client display) + `loading.js` (streaming skeleton). Mirrors `/event/[id]` architecture. Soft inline CTA replaces hard-blocking login wall.

---

## 2. Sync & Scraper Infrastructure

### How Sync Works
- **Route:** `src/app/api/sync-events/route.js` — runs all scrapers in parallel, maps to Supabase schema, batches upserts (50 at a time) with `onConflict: 'external_id'`
- **Cron:** `vercel.json` — 6 AM & 6 PM Eastern (UTC `0 11,23 * * *`)
- **Auth:** `SYNC_SECRET` env var (fail-closed). Vercel Cron uses `CRON_SECRET` — both accepted as valid Bearer tokens.
- **Deduplication:** `seen` Set prevents batch errors; unique index on `external_id` column
- **Auto-enrichment:** After upsert, enriches up to 30 new artists per sync via Last.fm → caches in `artists` table
- **Auto-sorter:** Known artists → `Live Music` (reviewed, bypasses triage). Keyword routing for Trivia, Food & Drink, Sports, Other. Unknown events → `triage_status: 'pending'` for admin review.
- **Scraper Memory:** `ignored_artists` blacklist prevents re-creation of deleted artists. `is_human_edited` on events prevents sync from overwriting admin changes.

### Scraper Health Dashboard

| # | Venue | Status | Type | ~Events |
|---|---|---|---|---|
| 1 | Pig & Parrot | ✅ Active | Custom API | ~60 |
| 2 | Ticketmaster (5 venues) | ✅ Active | Ticketmaster API | ~155 |
| 3 | Joe's Surf Shack | ✅ Active | Custom HTML | ~56 |
| 4 | St. Stephen's Green | ✅ Active | Google Calendar iCal | ~65 |
| 5 | McCann's Tavern | ✅ Active | Google Calendar iCal | ~15 |
| 6 | Beach Haus | ✅ Active | Custom HTML | ~35 |
| 7 | Martell's Tiki Bar | ✅ Active | Timely API | ~270 |
| 8 | Bar Anticipation | ✅ Active | AILEC iCal + RDATE | ~211 |
| 9 | Jacks on the Tracks | ✅ Active | Google Calendar iCal | ~34 |
| 10 | Marina Grille | ✅ Active | Squarespace JSON | ~7 |
| 11 | Anchor Tavern | ✅ Active | Squarespace JSON | ~6 |
| 12 | R Bar | ✅ Active | Squarespace JSON | ~8 |
| 13 | ParkStage | ✅ Active | WordPress HTML | ~8 |
| 14 | 10th Ave Burrito | ✅ Active | JetEngine AJAX | 0 (seasonal) |
| 15 | Reef & Barrel | ✅ Active | Google Calendar iCal | ~10 |
| 16 | Idle Hour | ✅ Active | Google Calendar iCal | ~15 |
| 17 | Asbury Lanes | ✅ Active | BentoBox HTML + AJAX | ~18 |
| 18 | Bakes Brewing | ✅ Active | Webflow CMS HTML | ~12 |
| 19 | River Rock | ✅ Active | EventPrime AJAX | ~102 |
| 20 | Wild Air Beerworks | ✅ Active | Square Online API | ~12 |
| 21 | Asbury Park Brewery | ✅ Active | Squarespace JSON | ~54 |
| 22 | Boatyard 401 | ✅ Active | Simple Calendar AJAX | ~40 |
| 23 | Windward Tavern | ✅ Active | Google Calendar iCal | ~15 |
| 24 | Jamian's | ✅ Active | Squarespace HTML (plain text) | ~30 |
| 25 | The Cabin | ✅ Active | Squarespace GetItemsByMonth | ~10 |
| 26 | The Vogel | ✅ Active | WordPress HTML | ~51 |
| 27 | Sun Harbor | ✅ Active | Squarespace JSON | ~19 |
| 28 | Bum Rogers | ✅ Active | BentoBox HTML | ~2 |
| 29 | The Columns | ✅ Active | WordPress HTML | ~112 |
| 30 | The Roost | ✅ Active | Beacon CMS HTML | ~10 |
| 31 | Deal Lake Bar | ✅ Active | Squarespace JSON | ~23 |
| 32 | Crab's Claw Inn | ✅ Active | RestaurantPassion iframe | ~10 |
| 33 | Water Street | ✅ Active | Squarespace JSON | ~5 |
| 34 | Crossroads | ✅ Active | Eventbrite showmore API | ~24 |
| 35 | Tim McLoone's | ✅ Active | Ticketbud HTML (proxy) | ~12 |
| 36 | Algonquin Arts Theatre | ✅ Active | Custom PHP HTML (proxy) | ~16 |
| 37 | MJ's Restaurant | ✅ Active | Vision OCR (Gemini) | ~2 |
| 38 | Pagano's UVA | ✅ Active | Vision OCR (Gemini) | ~6 |
| 39 | Captain's Inn | ✅ Active | Vision OCR (Gemini) | ~4 |
| 40 | Charley's Ocean Grill | ✅ Active | Vision OCR (Gemini) | ~5 |
| 41 | Palmetto | ⚠️ Manual | Hardcoded monthly array | ~21 |
| 42 | Brielle House | ❌ Blocked | EventPrime nonce requires session cookies | 0 |
| 43 | Starland Ballroom | ❌ Blocked | AEG/Carbonhouse — browser fingerprinting | 0 |
| 44 | House of Independents | ❌ Blocked | Etix — browser fingerprinting | 0 |

**Total: ~1,500+ events across 40 active scrapers.**

### Proxy Infrastructure
IPRoyal residential proxy (Pay-As-You-Go, $7/1GB). Shared utility: `src/lib/proxyFetch.js`. Used only by Tim McLoone's and Algonquin Arts. Env vars: `IPROYAL_PROXY_HOST`, `IPROYAL_PROXY_PORT`, `IPROYAL_PROXY_USER`, `IPROYAL_PROXY_PASS`.

### Vision OCR Pipeline (Gemini 2.5 Flash)
Core module: `src/lib/visionOCR.js`. Downloads flyer image → base64 → Gemini structured JSON output. Used by 4 image-poster venues (MJ's, Pagano's, Captain's Inn, Charley's). Env var: `GOOGLE_AI_KEY`.

---

## 3. Database & Security

### RLS Policies

| Table | Policy | Rule |
|---|---|---|
| `events` | Public can read events | `USING (status IS NULL OR status <> 'draft')` |
| `events` | Public read (shared links) | `USING (true)` for SELECT, all roles |
| `artists` | Public read (shared links) | `USING (true)` for SELECT, all roles |
| `venues` | Public read (shared links) | `USING (true)` for SELECT, all roles |
| `user_saved_events` | User owns data | `USING (auth.uid() = user_id)` |
| `user_followed_artists` | User owns data | `USING (auth.uid() = user_id)` |
| `notifications` | User owns data | `USING (auth.uid() = user_id)` |
| `storage.objects (posters)` | Public upload + read | `WITH CHECK / USING (bucket_id = 'posters')` |

### API Auth Matrix

| Auth Type | Routes |
|---|---|
| `ADMIN_PASSWORD` Bearer | `/api/admin/*`, `/api/submissions` GET, `/api/reports` GET/PUT, `/api/geocode-venues` POST |
| `SYNC_SECRET` / `CRON_SECRET` Bearer (fail-closed) | `/api/sync-events`, `/api/enrich-artists`, `/api/notify` |
| Supabase JWT (user session) | `/api/saved-events`, `/api/follows`, `/api/notifications`, `/api/notification-prefs` |
| Public (intentional) | `/api/events` GET, `/api/spotlight` GET, `/api/submissions` POST, `/api/reports` POST |
| Public + rate limited | `/api/flag-event` POST (1 flag per event per 10 min per IP) |

### Artist Metadata Inheritance (Waterfall)
Field-level inheritance with `custom_*` columns on events table. NULL = inherit from linked artist.

**Image waterfall:** `event_image_url` → `artist.image_url` → `venue.photo_url` → branded gradient fallback

**Bio waterfall:** `events.artist_bio` (custom override) → `artists.bio` → empty

**Headline waterfall:** `event_title` → `artist_name`

**Genre/Vibe waterfall:** `events.custom_genres` → `artists.genres` (and same for vibes)

### Key Tables

| Table | Purpose |
|---|---|
| `events` | Core event data. Upsert key: `external_id`. Key columns: `artist_name`, `venue_name`, `venue_id`, `artist_id` (FK), `event_date`, `event_title`, `event_image_url`, `category`, `triage_status`, `is_featured`, `is_human_edited`, `is_time_tbd` |
| `artists` | Enriched artist profiles. Columns: `name`, `bio`, `image_url`, `genres TEXT[]`, `vibes TEXT[]`, `is_tribute`, `is_locked`, `is_human_edited JSONB`, `field_status JSONB`, `image_source`, `bio_source` |
| `venues` | Venue data with `latitude`/`longitude` for distance filtering. `venue_type`, `tags TEXT[]` |
| `artist_aliases` | Maps old names → current artist ID. Prevents scraper from re-creating renamed/merged artists. |
| `ignored_artists` | Blacklist. Names added on admin delete. Sync skips matching names. |
| `spotlight_events` | Manual carousel pins per date (max 5). |
| `shortcut_pills` | Dynamic filter pills managed via Supabase dashboard. `filter_type` + `filter_config JSONB` + optional `seasonal_start`/`seasonal_end`. |
| `notifications` | In-app notifications with `user_id`, `event_id`, `trigger`, `read_at` |
| `support_requests` | Unified help/feedback with optional 1-5 rating |
| `scraper_health` | Per-venue sync status with `website_url` and `platform` columns |

### Timezone Rule
Events stored as UTC. An 8:30 PM Eastern show = `2026-03-21T00:30:00Z` (next UTC day). **Never use `.slice(0, 10)` on UTC strings to compare dates.** Always convert with `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` or use extended UTC ranges (`T04:00:00` to `T05:59:59` next day).

### DST Offset Pattern
All iCal scrapers use `easternOffset()` to dynamically detect EDT (`-04:00`) vs EST (`-05:00`) via `Intl.DateTimeFormat`. Never hardcode `-05:00`.

---

## 4. Prioritized Technical Debt

### High Priority

| Item | Context |
|---|---|
| **Google Auth Brand Verification** | Consent screen shows raw Supabase URL. Submit in Google Cloud Console → OAuth consent screen. Privacy + Terms pages deployed at `/privacy` and `/terms`. |
| **Headless Browsers for Blocked Scrapers** | Starland Ballroom (AEG/Carbonhouse) + House of Independents (Etix) need JS execution. Options: Browserless.io, Puppeteer Lambda, Playwright Cloud. Scraper files exist with parsing logic ready. |
| **Run `sql/public-read-rls-policies.sql`** | Must be executed in Supabase SQL Editor for shared links to work for unauthenticated users. |

### Medium Priority

| Item | Context |
|---|---|
| **5 Ungeocodable Venues** | Jacks on the Tracks, 10th Ave Burrito, Bakes Brewing, Boatyard 401 need manual lat/lng in Supabase. Nominatim couldn't resolve. |
| **Trending Algorithm** | Current trending pill shows ~909 events (top 25% busiest venues). Needs real popularity signal: view count, click tracking, or admin curation. |
| **Genre Chips on Feed Cards** | Currently commented out in `EventCardV2.js` pending backend data cleanup. Re-enable after artist genre coverage improves. |
| **Notification End-to-End Testing** | Cron triggers deployed (`vercel.json`) but need full production verification. Resend email integration requires `RESEND_API_KEY`. |

### Low Priority

| Item | Context |
|---|---|
| **Delete unused files** | `GoogleOAuthWrapper.js` (reverted), `SpotlightCarousel.js` (replaced by HeroSection), `ArtistListItem.js` (unused), `FilterBar.js` (replaced by omnibar). |
| **Uninstall `@react-oauth/google`** | Unused after GIS revert. Harmless dep. |
| **Drop `user_follows` table** | Legacy, no code references it, has wide-open RLS policies. |
| **Palmetto monthly update** | Image-poster scraper needs manual `MONTHLY_EVENTS` update each month. |
| **iOS Safari bugs** | Submit modal date field buried under keyboard; `scrollIntoView` + spacer not fully working. |

---

## 5. Repository State

### Branches
- **`main`** — production. Push to main = auto-deploy on Vercel.
- **`fix-event-link-ux`** — Public Link & Taxonomy Overhaul (completed, ready to merge into `main`)
- **`feature/spotlight-update`** — Spotlight refinements (completed, ready to merge into `main`)
- **`admin-refactor`** — Admin modular refactor (completed, UAT verified as 1:1 with production)

### Key Architecture

**Admin Page Modular Refactor:** `src/app/admin/page.js` reduced from 1,699 → 728 lines. Eight custom hooks in `src/hooks/` with 2-letter prefix convention (`ev.`, `ve.`, `q.`, `tr.`, `ar.`, `sp.`, `fe.`, `re.`). Page.js contains only auth, `fetchAll`, analytics, tab routing, modals, and toast. No domain logic in page file.

**iOS Safari Swipe:** `overflow-x: hidden` on html/body blocks ALL horizontal scroll in child containers on iOS Safari. The only working pattern: custom touch handlers + CSS `transform: translateX()`. Reference: `HeroSection.js`.

**Portal Pattern:** `EventCardV2.js` uses `createPortal` to `document.body` for follow popover (escapes `overflow: hidden` on card). Requires `mounted` state guard for SSR safety.

**Deep-Link Pattern:** `?event=<id>` stored in `deepLinkEventId` state, auto-expands target card with orange highlight after data loads.

### Environment Variables (Vercel)

| Var | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access bypassing RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side DB access (respects RLS) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SYNC_SECRET` | Sync route auth (fail-closed) |
| `CRON_SECRET` | Vercel Cron auth (also accepted by sync routes) |
| `ADMIN_PASSWORD` | Admin dashboard auth (`freshdoily`) |
| `LASTFM_API_KEY` | Artist enrichment |
| `PERPLEXITY_API_KEY` | AI auto-fill (bios, genres, vibes) |
| `GOOGLE_AI_KEY` | Gemini 2.5 Flash vision OCR |
| `OPENAI_API_KEY` | AI Enhance for event descriptions |
| `TICKETMASTER_API_KEY` | Ticketmaster Discovery API |
| `IPROYAL_PROXY_HOST/PORT/USER/PASS` | Residential proxy for blocked scrapers |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Email notifications via Resend |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog analytics |
| `POSTHOG_PERSONAL_API_KEY` | PostHog admin dashboard queries |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth |
| `NEXT_PUBLIC_SITE_URL` | Base URL for emails (defaults to `https://mylocaljam.com`) |

### Adding a New Scraper (Checklist)
1. Create `src/lib/scrapers/venueName.js` — export `async function scrapeVenueName() { return { events: [], error: null } }`
2. Each event: `title`, `venue` (exact DB name), `date` (YYYY-MM-DD), `time` (12h), `external_id`, optionally `ticket_url`, `price`, `description`, `source_url`, `image_url`
3. Wire into `sync-events/route.js`: import, Promise.all, scraperResults, allEvents spread
4. Add venue row to Supabase `venues` table
5. Deploy + manual sync to verify

### Platform Detection Quick Reference

| Clue | Platform | Approach |
|---|---|---|
| `squarespace-cdn` | Squarespace | `?format=json` on collection URL |
| `calendar.google.com` iframe | Google Calendar | iCal feed (`.ics` URL) |
| `wp-content`, `wp-json` | WordPress | REST API or AJAX inspection |
| `wix.com` | Wix | Check for Google Calendar embed |
| `getbento.com` | BentoBox | Parse listing HTML + detail page JSON-LD |
| `ticketmaster.com` links | Ticketmaster | Discovery API with venue ID |
| `eventbrite.com` | Eventbrite | showmore API (`/org/{orgId}/showmore/`) |
| Image poster only | Any | Gemini vision OCR or hardcoded monthly array |

---

## Scraper Recipe & Data Standards

This section is the canonical blueprint for any AI agent building a new scraper for myLocalJam. Follow every rule exactly.

### 1. Targeting & Behavior

**User-Agent:** Every scraper must send a mobile User-Agent string. Use the project constant:
```javascript
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};
```

**Politeness delay:** When making sequential requests to the same host (pagination, detail-page fetches), insert a minimum 2-second delay between calls:
```javascript
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Between requests:
await sleep(2000);
```

**Parallel batching:** When fetching multiple detail pages, batch in groups of 5 with a 2-second gap between batches. Never fire all requests simultaneously against a single host.

**Headless browser:** Only required for sites that do JavaScript-based browser fingerprinting (Etix, AEG/Carbonhouse). All other sites use standard `fetch()` or `proxyFetch()`. If a scraper returns 0 events with no error from Vercel, suspect datacenter IP blocking before reaching for a headless solution — try `proxyFetch()` first.

**Proxy routing:** Only use `proxyFetch()` (from `src/lib/proxyFetch.js`) when a site actively blocks datacenter IPs (HTTP 403 or empty responses from Vercel). Never proxy by default — it costs bandwidth.

### 2. Selector Hierarchy

Every scraper must identify elements in this order. Do not extract sub-fields without first anchoring to the container.

**Step 1 — Container:** Identify the repeating parent element that wraps a single event (e.g., `<article class="event">`, `<div class="card">`, a JSON array item). All sub-field selectors are scoped within this container.

**Step 2 — Required sub-fields (extract from each container):**

| Field | Selector priority | Notes |
|---|---|---|
| `title` | Heading tag (`h2`, `h3`) > `aria-label` > link text | Strip HTML entities. Remove embedded dates/times from title string. |
| `date` | `datetime` attribute > structured date field > inline text parse | Must resolve to `YYYY-MM-DD`. See Data Transformation below. |
| `time` | Dedicated time element > title-embedded time > `null` | 12h format preferred. If none found, return `null` (not midnight). |
| `external_id` | Platform-native ID > URL slug > deterministic hash | Must be globally unique. See External ID rules below. |

**Step 3 — Optional sub-fields:**

| Field | Selector priority | Notes |
|---|---|---|
| `image_url` | Custom flyer > artist promo image > venue logo | Never use placeholder/stock images. Skip Instagram/Facebook CDN URLs (they block hotlinking). |
| `ticket_url` | Direct ticket link > event detail page URL | Only if different domain from venue `source` URL. If same domain, store `null`. |
| `price` | Structured price field > inline text regex | See price normalization below. |
| `description` | Event detail text > excerpt | Cap at 300 chars. Do not scrape artist bios here — enrichment handles that. |
| `source_url` | The canonical URL for this specific event on the venue's site | Used for the "Venue Website" button. |

**Image extraction priority (strict order):**
1. Custom event flyer (uploaded poster specific to this show)
2. Artist promotional image (headshot, band photo from event listing)
3. Venue logo or default venue image
4. `null` — never use a generic placeholder. The frontend waterfall handles fallbacks.

### 3. Data Transformation (The Supabase Bridge)

Every scraper returns `{ events: [], error: null }`. Each event object must conform to this shape before reaching `route.js`:

```javascript
{
  title: 'Artist Name',           // String, required
  venue: 'Exact Venue Name',      // Must match venues.name in Supabase exactly
  date: '2026-04-15',             // ISO-8601 date string, required
  time: '8:00 PM',                // 12h format string, or null
  external_id: 'venueslug-2026-04-15-artist-name',  // Unique, required
  ticket_url: 'https://...',      // Or null
  price: '$15',                   // String, or null. See normalization.
  description: '...',             // Or null. Max 300 chars.
  source_url: 'https://...',      // Or null
  image_url: 'https://...',       // Or null
}
```

**Date normalization:**
- All date strings must resolve to `YYYY-MM-DD` format before returning.
- Epoch milliseconds: `new Date(epoch).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`.
- Relative dates ("Tonight", "Tomorrow"): resolve against current Eastern time.
- If a date's month is before the current month with no year specified, assume next year.
- Always use Eastern timezone for date comparison: `toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`.

**Time normalization:**
- Return `null` if no real time is found. Do not default to midnight — `route.js` uses `null` to set `is_time_tbd: true`.
- Strip "Doors at" prefixes. Prefer show time over door time.
- Use `easternOffset()` for iCal dates — never hardcode `-05:00`.

**External ID generation (deterministic, collision-free):**
- Preferred: platform-native unique ID (e.g., Eventbrite event ID, Ticketmaster event ID, calendar UID).
- Fallback: `venueslug-YYYY-MM-DD-titleslug` where slugs are lowercase, alphanumeric, hyphens only.
- For recurring events (same UID, different dates): always include the date in the external_id: `venueslug-YYYY-MM-DD-uidclean`.
- The `external_id` is the upsert conflict key. If two events share an ID, the second overwrites the first.

**Price normalization:**
- `"Free"`, `"No Cover"`, `"FREE"`, `"0"` → store as string `"Free"` (the frontend renders this as "🎵 Free Admission").
- Dollar amounts: store as-is with `$` prefix (e.g., `"$15"`, `"$25 - $35"`).
- Ticketmaster decimal totals (include service fees): estimate base price by dividing by 1.27 and rounding to nearest $5.
- `null` if no price information found. Do not guess.

**Genre mapping to canonical list:**
If the scraper encounters genre/tag data, map to the 15-item canonical list:

| Scraped tag (examples) | Canonical genre |
|---|---|
| hardcore, heavy metal, thrash | Metal / Hardcore |
| punk rock, ska, oi | Punk / Ska |
| singer-songwriter, folk, unplugged | Acoustic / Singer-Songwriter |
| cover band, tribute, tribute act | Tributes / Covers |
| edm, house, techno, dj set | Electronic / DJ |
| classic rock, alt-rock, indie | Rock / Alternative |
| smooth jazz, delta blues | Jazz / Blues |
| salsa, cumbia, afrobeat, bossa nova | Latin / World |
| yacht rock, beach, surf | Yacht Rock / Surf |
| country, bluegrass, americana | Country / Americana |
| rnb, soul, funk, motown | R&B / Soul / Funk |
| pop, top 40, dance pop | Pop / Top 40 |
| reggae, ska-reggae, island, dub | Reggae / Island |
| jam band, psychedelic, grateful dead | Jam / Psych |
| rap, hip hop, trap | Hip-Hop / Rap |

If a tag doesn't map cleanly, omit it. Do not invent new genres. The enrichment pipeline will fill gaps via AI lookup.

### 4. Semantic Intelligence Layer

**Auto-enrichment triggers (handled by the sync pipeline — no scraper code needed):**
- After `route.js` upserts events, it automatically runs the enrichment loop.
- Artists missing `image_url` or `bio` in the `artists` table are looked up via Last.fm (up to 30 per sync).
- Artists not found on Last.fm can be enriched manually via the admin "AI Auto-Fill" button, which calls Perplexity `sonar-pro`.
- The scraper does NOT need to fetch bios or artist images. Return `description: null` and `image_url: null` for artist metadata — the pipeline handles it.

**Price intelligence:**
- If the source lists `"Free"`, `"No Cover"`, `"Free Admission"`, or `"$0"`: set `price` to `"Free"`.
- If the source lists `"TBA"`, `"At Door"`, or similar non-numeric text: set `price` to `null`.
- The admin can override any price via the Event Edit modal.

**Category auto-routing (handled by sync pipeline):**
- Known artist names (matched against `artists` table) → `category: 'Live Music'`, `triage_status: 'reviewed'` → live feed immediately.
- Keyword matches (trivia, bingo, happy hour, ufc, etc.) → routed to appropriate category → live feed.
- No match → `triage_status: 'pending'` → admin triage inbox.
- The scraper does NOT set `category` or `triage_status`. Return events with the standard fields only.

**Blacklist awareness (handled by sync pipeline):**
- The `ignored_artists` table prevents re-creation of deleted artist profiles.
- The `is_human_edited` flag on events prevents the sync from overwriting admin changes.
- Scrapers do not need to check either — the pipeline handles both.

**What the scraper IS responsible for:**
1. Fetching raw event data from the source.
2. Parsing it into the standard event object shape.
3. Filtering to future events only (compare against current Eastern date).
4. Deduplicating within its own result set (use a `seen` Set on `external_id`).
5. Returning `{ events: [...], error: null }` on success or `{ events: [], error: 'message' }` on failure.

**What the scraper is NOT responsible for:**
- Artist bios, artist images, genre tagging, category routing, triage status, blacklist checking, or any enrichment. The sync pipeline and admin dashboard own all of that.

---

## Repo
GitHub: `https://github.com/antfocus/mylocaljam.git`
Push to main = auto-deploy on Vercel.
User's local path: `~/mylocaljam` (NOT `~/Documents/mylocaljam`)
