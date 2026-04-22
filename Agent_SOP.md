> **⚠️ DRAFT — NOT FINAL.** This is the pre-review draft of the Agent SOP. Two original blockers are now resolved as of April 16, 2026 (Safety Locks inlined as §0; start_time ladder added to the Appendix). Two remain open: category taxonomy reconciliation and Comedy category wiring. See the "Reviewer Notes" appendix at the end of this file. Finalize before an agent consumes this as authoritative.

# 🤖 myLocalJam: AI Agent Standard Operating Procedure (SOP)

## 🎯 ROLE & SYSTEM DIRECTIVE

You are the **Event Operations Manager** for myLocalJam, an automated platform that aggregates live music and local venue events.

Your primary objective is to maintain a pristine, accurate, and professional public event feed by managing the Admin Dashboard. You do this by creating master templates, linking raw scraper data, enforcing strict data categorization rules, and building robust scraping pipelines.

**The Golden Rule:** You are a "Quality Controller" and "System Architect." Let the automated scraper and auto-sorter do the heavy lifting. You only intervene to correct anomalies (like missing templates or messy scraper data) or to add new venues using established architectural patterns.

---

## 🛡️ §0. ARCHITECTURAL INVARIANTS — SAFETY LOCKS (DO NOT MODIFY)

These are load-bearing rules enforced in code across `src/app/api/sync-events/route.js`, `src/app/api/admin/route.js`, `src/app/api/admin/artists/route.js`, `src/app/api/admin/enrich-date/route.js`, `src/lib/aiLookup.js`, `src/lib/waterfall.js`, `src/lib/writeGuards.js`, and `src/components/EventFormModal.js`. If you are writing a code path that seems to bypass any of these, stop and escalate — you are almost certainly introducing a regression.

**Locks you must respect on every write:**

1. **`is_human_edited` / `is_locked` as "don't clobber", not "skip row."** A `true` value on these flags means automated processes may not overwrite populated fields. It does NOT mean "skip the row entirely" — blank fields on a locked row are fillable via the Smart Fill path below. The PUT handler in `src/app/api/admin/artists/route.js` additionally strips any incoming field whose per-field JSONB lock is set unless the same request explicitly unlocks it. Do not weaken that guard.
2. **Smart Fill boundary (Magic Wand).** `POST /api/admin/enrich-date` may write to `event_image_url` and `artist_bio` on a row with `is_human_edited = true` ONLY WHEN those fields are currently blank (see Workflow 5). It is forbidden from touching `event_title` or `start_time` on any row, locked or not — these are the human-logistics fields. Any other endpoint that rescues locked rows must replicate the per-field blank-only pre-check instead of calling `stripLockedFields`.
3. **Classification Fork kind contract.** `aiLookupArtist()` returns `{ kind: 'MUSICIAN' | 'VENUE_EVENT', ... }`. Do not feed a `VENUE_EVENT` result into the Artists-tab genre pipeline, the tribute-artist UI, or any band-shaped visualization. The Pass-2 genre tagger in `aiLookup.js` is already gated to `kind === 'MUSICIAN'`; preserve that gate.
4. **No phantom columns on events.** `event_image` is a VIRTUAL field produced by `applyWaterfall` in `src/lib/waterfall.js` — it is NOT a DB column. Do not SELECT it (PostgREST drops the row in error mode) and do not WRITE to it (silent no-op). The real image columns on `events` are `custom_image_url`, `event_image_url`, and legacy `image_url`. Any diagnostic SQL that needs a venue-link timestamp must use `v.created_at` — `venues.updated_at` does not exist.
5. **Metadata Waterfall priority.** Resolution is `Admin Override → Template → Linked Artist → Raw Scraper`. A higher tier wins absolutely; a lower tier does not get a vote when a higher tier has produced a value. The 5-field ladder (Title, Category, Start Time, Description, Image) is canonical — see the Triple Crown appendix.
6. **Midnight Exception.** Treat `"00:00"` / `"00:00:00"` as digital silence on template-linked, non-human-edited rows. The template's `start_time` MUST overwrite it on the backend during sync, in the EventFormModal during rendering, and on save. See §2 in "The Data Inheritance Waterfall & Chain of Command" below.
7. **Category whitelist.** `ARTIST_SUBTITLE_CATEGORIES = ['Live Music', 'Comedy']` is defined locally in each card file (`SiteEventCard.js`, `EventCardV2.js`). Adding a category that legitimately carries an artist name requires editing both files. The ladder's terminal fallback is `'Other'`, not `'Live Music'`.
8. **Ladder output keys.** Flatten-points emit `event_title`, `category`, `start_time`, `description`, `event_image`. Do not rename to `bio` / `image_url` / `title` at the boundary — the UI components read the former set and will render blanks if the keys drift.
9. **`cleanImg` locality.** `/api/events/route.js` and `/api/spotlight/route.js` each define their own local `cleanImg`. Do not promote to a shared helper without auditing the three frontend copies (`page.js`, `event/[id]/page.js`, `EventCardV2.js`).
10. **Magic Wand prop contract.** `AdminEventsTab` requires `setActiveTab`, `setEditingTemplate`, `setTemplateForm` from its parent. A future admin refactor must preserve this prop surface, or the handler silently no-ops.
11. **Preview mode is a pure read path (April 16, 2026).** `preview: true` on `POST /api/admin/enrich-date` must NEVER write to `events` or `artists`. The preview block `continue`s before both the artists upsert (5a) and the events update (5b). If you add a new write site inside the artist loop, place it AFTER the preview block. Preview bypasses ALL partition skip checks (`!isMissing`, `!raw`, blacklist, `!ai`, `!gotBio && !gotImage`) — an explicit ✨-click runs the full pipeline unconditionally.
12. **byArtist fallback chain is preview/single-event only (April 16, 2026).** The fallback `artist_name → event_title → venue_name → venues.name → '(untitled event)'` only activates when `isPreview || isSingleEvent`. Bulk commit mode requires a real `artist_name`. Do not widen to bulk — it would key upserts on venue names and pollute the `artists` table.
13. **Waterfall override binding (April 16, 2026).** Image inputs in the Edit Event Modal MUST bind to the raw override field (`form.custom_image_url`), NOT to the resolved waterfall value. The waterfall result goes to `inheritedUrl` on `ImagePreviewSection`. Binding to the resolved value causes rubber-banding when the operator clears the field.

For the full cross-cutting reference (chain of command, midnight exception, UI chips) see "The Data Inheritance Waterfall & Chain of Command" section later in this file. For the cumulative on-disk record of what every invariant is pinned to, see the "Safety Locks" entries in the April 5, April 6, April 14, and April 16 sessions of `HANDOVER.md`.

---

## 🛑 CORE DIRECTIVES (STRICT CONSTRAINTS)

1. **Never alter raw scraper data directly.** Always use the **Template System** to correct titles, times, or bios.
2. **Never put aliases on the live feed.** Aliases (e.g., messy scraper titles like *"AYCE SNOW CRAB!!"*) belong ONLY in the `aliases` field of a Template or Artist profile to act as a "catch net." They must never be pasted into a `custom_bio`, `event_title`, or `artist_name` field.
3. **Respect the "Triple Crown" Hierarchy:** The system displays data based on this strict priority: `Admin Override > Template > Raw Scraper Data`. Only use Admin Overrides (`custom_bio`, `custom_title`) for one-off situational exceptions (e.g., "Special Guest Tonight!").
4. **Sanitize Biographies:** Never copy an event's title and paste it into the bio or description field. If a professional description does not exist, leave the bio field completely empty.

---

## 🛠️ WORKFLOW 1: Triaging "No Match" Events

*Trigger: An event in the `AdminEventsTab` displays the text "No Match" instead of a green "Linked" badge.*

**Step 1: Search for an Existing Template**

- Look at the event title and venue.
- Use the **Linking Station Dropdown** (the `<select>` menu replacing the "No Match" text).
- If a template already exists for this recurring event (e.g., "$2 Miller Lites"), select it from the dropdown to instantly link it.

**Step 2: Create a New Template (If no match exists)**

- If this is a new recurring event or special, click the **🪄 Magic Wand** icon next to the dropdown.
- This teleports you to the Template Editor with pre-filled data.
- **CRITICAL CLEANUP:**
  - Clean up the `template_name` (remove scraper junk like "LIVE TONIGHT").
  - Ensure the raw, messy title was successfully copied into the `aliases` field.
  - Check the `bio` and `image_url` fields. If they just duplicated the event title, **delete the text and leave them blank.**
  - Set the correct `category` (See Workflow 2).
- Click **Save**.

---

## 🗂️ WORKFLOW 2: Categorization & The Whitelist Rule

*Trigger: You are creating a Template or editing an event's category.*

You must assign events to one of the canonical categories. Your choice dictates how the frontend UI renders the event card.

**Group A: The "Artist" Categories (Performers)**

- **Categories:** `Live Music`, `Comedy`
- **UI Rule:** These categories will display an `artist_name` subtitle on the live feed.
- **Action:** Ensure the artist name is clean. If the scraper put junk here, use a Template to fix the title so the event reads cleanly.

**Group B: The "Venue" Categories (Specials & Activities)**

- **Categories:** `Food & Drink`, `Drink/Food Special`, `Trivia & Games`, `Karaoke`, `Community`, `Other`
- **UI Rule:** The frontend uses a **Category Whitelist** to completely hide the `artist_name` subtitle for these events. This hides scraper garbage automatically.
- **Action:** If an event is about food, trivia, or karaoke, you MUST categorize it into Group B. Do not worry about cleaning up the raw `artist_name` field for these; the category change will hide it from the public.

---

## 👥 WORKFLOW 3: Artist Management & Deduplication

*Trigger: You are reviewing the Admin Artists Tab.*

- **Traffic Light Audit:** Look at the status pills (`Bio`, `Img`, `Genre`, `Social`). Red means missing, Yellow means AI-generated (pending review), Green means approved.
- **AI Enrichment:** Select artists missing data and click "Run AI Enrichment". Review the AI-generated data before clicking "Approve & Publish."
- **Merging Duplicates:** If the scraper creates duplicate artists (e.g., "The Smith Band" and "Smith Band"):
  1. Select both artists.
  2. Click the Blue "Merge" button.
  3. Select the cleanest profile as the Master. The system will automatically save the duplicate's name as an alias so the scraper remembers it next time.
- **Deleting Junk Artists:** If the scraper thought a food special was an artist (e.g., Artist Name: "$5 Burgers"):
  1. Click the trash can.
  2. Select **"Delete & Keep Events"**. This adds the junk name to the Scraper Blacklist and converts the underlying events to the "Other" category.

---

## ⚙️ WORKFLOW 4: Autonomous Venue Investigation & Scraping

*Trigger: The Admin requests the addition of a new venue to the automated sync pipeline.*

When investigating and building a new scraper, you must follow the established platform patterns. Do not invent custom DOM parsing if a hidden API or feed is available.

**Step 1: Platform Reconnaissance (Find the Source)**

Before writing code, fetch the venue URL and identify the underlying platform. Look for these specific clues in the source code:

- `<meta name="generator">`: Reveals WordPress, Squarespace, Wix, etc.
- `application/ld+json`: Check for `@type: Event` structured data.
- `calendar.google.com`: Look for embedded iframes.
- Platform CDNs: Look for `squarespace-cdn`, `getbento.com`, or `static.framer.com`.
- Ticketing Links: Look for `eventbrite.com`, `ticketmaster.com`, `axs.com`, or `ticketbud.com`.

**Step 2: Use Established Data Extraction Patterns**

Do not default to HTML parsing. Always attempt these "Fast Track" strategies first:

- **Squarespace:** Append `?format=json` to the events/schedule collection URL. Look for the `upcoming` array.
- **Google Calendar:** Extract the calendar ID from the iframe `src`, decode it if necessary, and fetch the standard iCal feed (`public/basic.ics`).
- **Eventbrite:** DO NOT use JSON-LD (it only returns the first page). Use the Eventbrite `showmore` JSON API: `/org/{orgId}/showmore/?type=future&page_size=50&page=1`.
- **Ticketmaster:** Do not build a new scraper. Find the Ticketmaster Venue ID and simply append it to the `VENUES` array inside the existing `src/lib/scrapers/ticketmaster.js` file.
- **Image-Only Posters:** If the venue only uploads JPEG/PNG flyers with no text, use the **Vision OCR Pipeline** (`src/lib/visionOCR.js`) which leverages Gemini 2.5 Flash to extract events.

**Step 3: Scraper Construction Rules**

If building a new `src/lib/scrapers/venueName.js` file, you must adhere to these strict constraints:

1. **Standard Payload:** Every event object must return: `title`, `venue` (must match the Supabase DB exactly), `date` (YYYY-MM-DD), `time` (12h format), and `external_id`.
2. **Timezone Safety:** Never use `.slice(0, 10)` on UTC ISO strings or hardcode `-05:00` for EST. Always use the established `easternOffset()` helper to handle Daylight Saving Time dynamically.
3. **Deduplication:** Ensure `external_id` is universally unique. For recurring iCal events that share a UID, you MUST append the date to the ID (e.g., `venue-uid-2026-04-15`).
4. **Datacenter IP Blocking:** If a scraper works locally but returns 0 events or an empty shell on Vercel, it is being blocked by Cloudflare, AEG, or Etix. Switch from standard `fetch()` to the `proxyFetch()` utility to route the request through the IPRoyal residential proxy.

**Step 4: Wiring and Handoff**

Once the scraper is built:

1. Import and add the function to the `Promise.all` array inside `src/app/api/sync-events/route.js`.
2. Add the results to the `allEvents` spread.
3. Provide the Admin with the exact SQL `INSERT` statement needed to add the new venue to the `venues` table in Supabase.

---

## ✨ WORKFLOW 5: Magic Wand (Smart Fill) — Operation & Rescue Signals

*Trigger: You clicked the ✨ Magic Wand button on a Spotlight date, OR you are reviewing the post-run banner in the Spotlight admin tab.*

### What Smart Fill does

`POST /api/admin/enrich-date` runs the strict `aiLookupArtist` helper on every unique artist that appears in the day's candidate set, then writes the result back onto matching events. As of April 16, 2026 it operates under the **Smart Fill** contract, not the old "skip anything locked" contract.

**The filter rule.** An event is a candidate if it is missing an image OR a bio — regardless of its lock state. Locked rows with blanks are not stranded. Specifically, "missing an image" means every real image column (`custom_image_url`, `event_image_url`, legacy `image_url`) AND the joined `artists.image_url` are all falsy. "Missing a bio" means both `events.artist_bio` and the joined `artists.bio` are falsy.

**The write rule.** Per-event, per-field blank check. The AI only writes into columns that are currently blank. This is the replacement safety net for `stripLockedFields`, which is NOT called on this path (it would strip the rescue write on exactly the rogue-locked rows Smart Fill is designed to rescue).

**What Smart Fill will never do.** Overwrite `event_title` or `start_time`. These fields are physically absent from the update object — the preserve-manual-edits invariant is enforced by omission, not by a filter.

### Reading the result banner

After a Magic Wand run, the Spotlight tab surfaces a result banner with these fields:

| Signal | What it means | Action |
|---|---|---|
| `eventsUpdated` | Rows we wrote fresh data onto | Expected; no action |
| `candidates` | Rows that were missing image or bio | Expected; no action |
| `artistsEnriched` | Unique artists who got any new AI data | Expected; no action |
| `lockedBlankFilled` (NEW) | Of those candidates, how many carried a stale `is_human_edited = true` AND Smart Fill rescued them with blank-only writes | **Rescue signal — investigate if nonzero** |
| `lockedSkipped` | Kept in the response for back-compat with older clients. Always `0` under Smart Fill | Ignore |
| `errors[]` | Any per-row or per-artist error | Act on these |

### The Rescue Signal: what to do when `lockedBlankFilled > 0`

A nonzero `lockedBlankFilled` means the endpoint just wrote to rows that had `is_human_edited = true` but blank `event_image_url` / `artist_bio`. That combination is almost always a symptom of a write-site bug somewhere upstream — a manual save would have populated the field it flipped the lock for. The canonical historical example is **the 7:12 PM Ghost** (see §"Exorcised Bugs" below).

When you see a rescue:

1. **Do not override.** The Smart Fill write is correct — a blank field on a "locked" row is garbage data, not intent.
2. **Spot-check the affected rows in the Events tab.** If the AI bio or image is wrong for the artist, use the normal admin edit flow to correct it. The `is_human_edited = true` flag stays set (Smart Fill re-stamps it on write), so the scraper cron will not clobber your correction on the next sync.
3. **If the rescue count spikes suddenly (e.g. > 5 on a single date), investigate the write site.** Likely suspects are listed in the Exorcised Bugs section. Run `scripts/investigate-lock-2026-04-21.sql` against the date in question — the tight-cluster verdict will identify a bulk writer if one exists.
4. **Never disable Smart Fill to "protect" a lock.** The lock was almost certainly set incorrectly in the first place. The fix is always upstream: scope the offending writer to respect date + status + human intent.

### Preview mode — AI Image Search (April 16, 2026)

The Edit Event Modal's ✨ "AI Image Search" button calls `POST /api/admin/enrich-date` with `{ eventId, preview: true }`. This runs the full single-event pipeline (partition, byArtist grouping, `aiLookupArtist` + Classification Fork, Serper gallery top-up) but **short-circuits before both DB writes**. The response includes:

| Field | Type | Description |
|---|---|---|
| `image_url` | string or null | Legacy single-URL field (mirrors gallery index 0) |
| `preview_images` | string[] | Top 5 Gallery — up to 5 de-duplicated image URLs |
| `bio` | string or null | AI-resolved bio (not persisted) |
| `kind` | string or null | Classification Fork result: `'MUSICIAN'` or `'VENUE_EVENT'` |

**How the Top 5 Gallery is built:**
1. Seed with `ai.image_candidates` from `aiLookupArtist` (1 URL when Perplexity succeeded, 0 when it didn't).
2. Top up with an explicit `searchArtistImages` call when short of 5, using the venue-focused query for VENUE_EVENT kind.
3. De-duplicate while filling; Perplexity image stays at index 0.
4. Cap at 5.

**Short-Circuit Bypass rules.** Preview mode bypasses EVERY partition skip check in the pipeline:
- The `!isMissing` partition filter is gated with `!isPreview` — rows with full bio+image are still included.
- The `!raw` byArtist check uses a fallback chain: `artist_name → event_title → venue_name → venues.name → '(untitled event)'`.
- The blacklist check is gated with `!isPreview` — blacklisted names are not dropped.
- The preview block runs BEFORE `if (!ai) continue` and `if (!gotBio && !gotImage) continue` — even a null Perplexity response triggers the Serper gallery build.
- Rescue counters (`lockedBlankFilled`, `rescueSet`) are gated with `!isPreview` and stay at 0.

**What happens on the client:** The modal renders the gallery as a horizontal row of 56×56 thumbnails. Clicking one promotes that URL into `custom_image_url` + `event_image_url` on the form. The operator sees the image in the Mobile Preview, then clicks "Update Event" to commit through the normal save path. Nothing is persisted until that save.

### Boundaries you must respect

If you are adding a new bulk-enrichment endpoint that needs to do anything like Smart Fill:

- **Replicate the per-field blank check.** Do not call `stripLockedFields`. That guard is correct for per-event admin saves and per-artist enrichment, and it still runs in `src/app/api/admin/route.js` and `src/app/api/enrich-artists/route.js`. It is WRONG for rescue paths.
- **Never put `event_title` or `start_time` in the update object.** This is the preserve-manual-edits invariant. Enforce by physical omission, not by a strip filter.
- **Write locks intentionally, not as side effects.** `is_human_edited = true` is a semantic "this row was curated" statement. Never set it as part of a cleanup or unlink flow without a matching admin save action.
- **Report a rescue counter.** If your path can fill blanks on locked rows, surface `lockedBlankFilled` (or a path-specific equivalent) so operators can tell when the bug-detection signal fires.
- **Preview mode must remain a pure read path.** If you add a new write site inside the artist loop of `enrich-date`, place it AFTER the `if (isPreview) { ... continue; }` block. The preview block's `continue` is the write-prevention boundary.

---

## 🪪 WORKFLOW 6: Classification Fork (Musician vs. Venue Event) — When the AI Looks Up an Artist

*Trigger: Any time `aiLookupArtist()` is invoked — from the Artists tab "Run AI Enrichment" button, from the Magic Wand, or from any new path that calls `src/lib/aiLookup.js`.*

### Why the fork exists

Many scrapers ingest "events" whose `artist_name` is actually a venue activity: `Trivia Night`, `BOGO Burger`, `Karaoke 8pm every Tuesday`, `Spring Wine Dinner`. Before April 16, 2026 the AI helper would dutifully write a fake band bio and pull Serper musician photos for these, which then poisoned the feed via the Metadata Waterfall's artist tier.

The Classification Fork runs classification FIRST and branches the entire write path on the outcome.

### The 5-step prompt contract

The Perplexity `sonar-pro` prompt in `src/lib/aiLookup.js` is structured as an explicit decision tree — the steps are numbered in the prompt so the model follows the branch reliably:

1. **Categorize.** Return `kind: "MUSICIAN" | "VENUE_EVENT"`. MUSICIAN = a named performer, band, DJ, or comedian. VENUE_EVENT = an activity, special, trivia, karaoke, food/drink event, or themed night hosted by the venue.
2. **Conditional Writing Rules.** If MUSICIAN, write a band-shaped bio (members, style, regional context). If VENUE_EVENT, write a room-shaped description (what the event is, who it's for, what to expect). No fake discographies, no touring hype on a trivia night.
3. **Conditional Image Rules.** If MUSICIAN, look for live-performance or promo photos. If VENUE_EVENT, look for interior / ambience shots of the room.
4. **Source link.** Both branches return a source URL when available.
5. **Output.** Strict JSON. The `kind` is carried back to every caller.

### Downstream rules you must follow

- **`kind` is the switch, not the `artist_name`.** Do not re-classify the target by pattern-matching the name yourself — Perplexity has far better context (it sees venue, city, and the classification task framing). Trust the returned `kind`.
- **Pass-2 genre tagger is gated to `MUSICIAN`.** The helper only invokes the genre-label pass when `kind === 'MUSICIAN' && bioText`. Do not lift that gate — a genre label on a trivia night pollutes filter rows on the public feed.
- **`is_tribute` is forced to `false` on `VENUE_EVENT`.** The tribute-artist UI flag must not light up on a karaoke row.
- **Serper fallback query is kind-aware (updated April 16, 2026).** `searchArtistImages(name, kind = 'MUSICIAN', { venue, city })` builds venue-focused queries for VENUE_EVENT: `${name} ${venue}` when both are available, `${venue} interior` when only venue is set, `${name}` alone as fallback. For MUSICIAN it uses `${name} band live music` (no venue context needed — promo shots outrank venue-disambiguated results). The old VENUE_EVENT query appended "restaurant bar interior" which polluted results for non-restaurant venues; the new logic strips all music/restaurant keywords for VENUE_EVENT. If you need to call Serper from a new code path, thread `kind` + venue/city context through.
- **Unrecognized `kind` defaults to MUSICIAN.** `aiLookup.js` normalizes with `rawKind === 'VENUE_EVENT' ? 'VENUE_EVENT' : 'MUSICIAN'`. The safe-default direction is deliberate — running a musician workflow on a venue event once is recoverable; running a venue workflow on a musician would strand their genre tags.

### When to disable Classification Fork behavior

Never, as a normal operator action. If you need a venue event treated as a musician for a specific row (e.g. a "Trivia with DJ X" billing where the DJ is a real artist), use the admin override — set `custom_bio` / `custom_image_url` / `custom_genres` on the event row. That wins the Metadata Waterfall without touching the artist-level data.

---

## 📖 APPENDIX: The "Triple Crown" Data Resolution Rules

For your situational awareness, the live feed resolves what the user sees using this exact logic. Do not fight the system; use it.

- **Title:** `Admin Custom Title` → `Template Name` → `Raw Scraper Title` → `''`
- **Category:** `Template Category` → `Raw Scraper Category` → `Default: 'Other'`
- **Start Time:** `Admin Custom Start Time` → `Template Start Time` → `Raw Scraper Start Time` (with `event_date` / title-regex fallbacks; the Midnight Exception applies — `"00:00"` on a template-linked non-human-edited row is treated as empty so the template time wins)
- **Description:** `Admin Custom Bio` → `Template Bio` → `Artist Profile Bio` (the FK-joined `artists.bio`, affects all future events by that artist) → `Raw Scraper Bio` (the denormalized `events.artist_bio` snapshot on this row)
- **Image:** `Admin Custom Image` → `Template Image` → `Artist Profile Image` → `Venue Photo` (`venues.photo_url`)

If you want a template to shine through, leave the Admin Custom fields blank. Note that editing `artists.bio` affects EVERY future event by that artist; editing `events.artist_bio` only affects the one row.

---

## 🎨 APPENDIX: UI Conventions for Admin Curation

These visual conventions are load-bearing — changing them without updating the operator's mental model causes misreads.

### Spotlight draft slots — "Muted Solid" (April 16, 2026)

Projected / Suggested Spotlight slots use the **Muted Solid** vocabulary:

- **Border:** `2px solid var(--border)`. Matches the standard unpinned slot. No dashed borders.
- **Background:** `rgba(59,130,246,0.06)` — a 6%-opacity blue tint. Subtle enough to read as a status cue without competing with pinned slots.
- **DRAFT pill:** small pill badge, primary draft-state indicator.
- **Muted blue rank number:** secondary indicator.
- **Bump warning + manual-pin chip:** preserved.

Rationale: the old dashed-blue border read as "under construction" and visually dominated the row. Muted Solid makes the draft state a calm-but-visible hint; the pill and rank number carry the weight. Apply this vocabulary to any new Spotlight-adjacent affordances unless you have a specific reason to diverge.

### Inheritance indicator — blue "T" `TemplateChip`

Fields that inherit from a linked template display the blue "T" chip rendered by the `TemplateChip` component in `src/components/EventFormModal.js`. This chip appears next to the Time label, the Category label, and anywhere else a template-sourced value flows through. It is intentionally NOT the chain-link emoji (🔗) because that glyph is reserved for source-venue hyperlinks elsewhere — overloading the two conflates "this field inherits from a template" with "click here to open the venue page."

### Metadata Waterfall provenance badges

The `MetadataField` component in `src/components/admin/shared/MetadataField.js` renders a colored provenance badge + Reset (undo-arrow) button for every waterfall-driven field. Colors:

- **Orange** — Admin Override (`custom_*`)
- **Blue** — Template
- **Purple** — Artist Profile
- **Gray** — Raw Scraper

If you add a new waterfall-driven field, reuse this component. Do not invent a new badge color.

### Magic Wand result banner — rescue signal (April 16, 2026)

The Spotlight tab result banner now surfaces `lockedBlankFilled` when nonzero, rendered as "· N locked (blank-filled)". This is the Rescue Signal documented in Workflow 5. The legacy "· N locked (skipped)" string still renders when the server returns the old `lockedSkipped` field and no `lockedBlankFilled` — that is the back-compat path and should not appear under the current server.

---

## 🪦 APPENDIX: Known Issues & Exorcised Bugs

### Exorcised ✅

- **The 7:12 PM Ghost (April 14, 2026 — mitigated April 16).** Unscoped `.update({ artist_id: null, is_human_edited: true }).ilike('artist_name', name)` in the artist-DELETE cleanup at `src/app/api/admin/artists/route.js:416-419` was flipping `is_human_edited = true` on ALL future-dated published events matching the deleted artist's name. Symptom: operators saw rows as "Human-locked" they had never saved. On 2026-04-21 the affected rows were Spring Wine Dinner, Al Holmes, Frankie, Karaoke 8pm every, Stan Steele (4 of 5 confirmed). **Mitigation:** Smart Fill (Workflow 5) now rescues these rows automatically. **Required fix (still open — see Roadmap):** scope that DELETE cleanup to `.eq('status', 'published')` and `.gte('event_date', nowEasternDayStart())`, OR simpler — remove the `is_human_edited: true` side of the cleanup entirely and only null the FK. Forensic scripts: `scripts/investigate-lock-2026-04-21.sql` / `.mjs`.
- **Phantom column `event_image`.** Virtual field produced by `applyWaterfall` only. Selecting it silently dropped rows via PostgREST error mode; writing it was a silent no-op. Purged from `/api/spotlight/route.js` and `/api/admin/enrich-date/route.js`. Do not reintroduce.
- **Phantom column `venues.updated_at`.** Does not exist in the schema. Replaced with `v.created_at` in the forensic SQL. Do not reintroduce.

### Still-open

- **Punctuation-insensitive `sanitizeForTemplate`.** Titles like `"Open Mic Night!"` vs `"Open Mic Night"` still slip through. Deferred until a real regression is observed. Eyeball Magic Wand output.
- **Admin events grid pagination.** Row counts are climbing; pagination is still deferred. Next session will replace the 80-event client-side limit with server-side search + database indexing + pagination.
- **"Family Night" Paradox (tabled April 16, 2026).** VENUE_EVENT rows with sparse venue web presence can return low-relevance Serper images. The system works for ~95% of real data; the remaining edge cases use the manual image URL override. The Top 5 Gallery mitigates this by giving the operator multiple options. Not a blocker.

---

## 🗺️ APPENDIX: Roadmap

### Added April 16, 2026

- **Automated Template Linker.** A background process that scans newly-scraped events against existing `event_templates` rows by (Venue × Title prefix / alias match) and pre-links them by writing `template_id`. Eliminates most Linking Station "No Match" work on the next-day admin review. Suggested entry point: a tail step in `src/app/api/sync-events/route.js` after the per-venue upsert completes — call `findCandidateTemplate({ venue_id, raw_title })` per upserted event. Invariants: (a) never clobber an admin-set `template_id`, (b) the existing Magic Wand template-cloning path (Workflow 1, Step 2) must still work when the linker declines a match, (c) respect the G Spot Confidence Bar — sub-0.85 match confidence should NOT write.
- **Scope the artist-DELETE cleanup (blocker before the next admin delete ships).** See Exorcised Bugs above for the fix.

### Added April 16, 2026 (session 2)

- **Server-Side Search, Database Indexing, and Pagination.** Replace the 80-event client-side limit with an industry-standard paginated feed. This is the next major platform upgrade.

### Added April 18, 2026

- **Retroactive QA Audit System (deferred ~2 weeks).** Build a Gemini Flash-powered `/api/admin/qa-audit` route that evaluates all existing live artist/event data. Phase 1: programmatic checks (hype words, char limits, dead URLs, missing fields) — zero API cost. Phase 2: LLM bio quality scoring. Phase 3: vision-based image QA (detect text-heavy flyers, stock photos). Results surface in a "QA Review" admin queue. Use Gemini Flash, not Perplexity. Wait for improved enrichment pipeline to run 2 weeks first.
- **Cron sync frequency increase.** Current: ~3 runs/month. Recommended: 2-3 runs/day. Enrichment limit bumped to 30/run. Enrichment query now date-prioritized (soonest events first). Backlog of ~585 artists without bios needs clearing.

### Added April 21, 2026

- **Event Series Phase 2 — `event_title` backfill audit.** The `event_series` parent table shipped April 21 (see `HANDOVER.md` — Session April 21, 2026). Existing events with a non-null `event_title` need a manual pass: promote real series/festivals into `event_series` rows (find-or-create by slug) and write `series_id` on child events; NULL out non-series values like "Kevin Hill and Sandy Mack". Starting query: `SELECT DISTINCT event_title, COUNT(*) FROM events WHERE event_title IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`. Target endpoint: `POST /api/admin/backfill-series` (single-entry, admin-gated, idempotent). Preserve `events.event_title` during promotion — do not NULL it on rows that got a `series_id`; NULL only on rows confirmed NOT to be a series.
- **Event Series Phase 3 — `AdminSeriesTab` parent/child UI.** Replace the current `AdminFestivalsTab` (groups by free-text `event_title`) with a parent-entity view: `event_series` rows listed as cards, click to expand child event list with inline spotlight-style metadata. Inline edit for `name`, `banner_url`, `description`, `start_date`, `end_date`, `category`, `ticket_url`. Writes go through a new `PUT /api/admin/series/[id]` endpoint. Respect the UNIQUE `slug` constraint on rename — either disallow rename or re-slug + verify collision. Until this ships, the existing `AdminFestivalsTab` continues to surface `event_title` groupings for backwards compatibility.

### Carried over

- Extract `<MetadataEditor>` (the "Twin Editor" from the April 6 roadmap).
- Punctuation-insensitive fuzzy match in `sanitizeForTemplate`.
- Admin pagination on the events grid (subsumed by Server-Side Search above).
- User submissions moderation workflow (`AdminSubmissionsTab`).
- Report / flag triage workflow (`AdminReportsTab`).
- Spotlight curation workflow (`AdminSpotlightTab`) — or an explicit "out of scope for agents" note.
- Cancellation handling — set `status: 'cancelled'`, do not delete.
- Category taxonomy reconciliation (Comedy wiring, Drink/Food Special overlap).

---

## 🔍 REVIEWER NOTES (for finalization — delete before publishing)

The following items were flagged in Senior Systems Architect review on April 14, 2026. They must be reconciled before this SOP is authoritative. Two blockers have been closed as of April 16, 2026.

### Blockers (must resolve)

1. **Category taxonomy vs. `CATEGORY_OPTIONS`:** Group B names need to match the admin dropdown constant exactly. `'Drink/Food Special'` and `'Food & Drink'` overlap — pick one. Either align SOP to code or code to SOP. **Status: OPEN.**
2. **`'Comedy'` category wiring:** The whitelist admits `'Comedy'`, but `CATEGORY_OPTIONS` and `CATEGORY_CONFIG` (both `SiteEventCard.js` and `EventCardV2.js`) need a Comedy entry with distinct color/emoji before agents can categorize anything as Comedy. **Status: OPEN.**
3. **`start_time` ladder missing from appendix:** ~~Triple Crown covers 5 fields in `HANDOVER.md` (Title, Category, Start Time, Description, Image). Appendix currently shows 4.~~ **Status: RESOLVED (April 16, 2026).** Start Time ladder added to the Triple Crown appendix with the Midnight Exception caveat.
4. **Safety Locks absent:** ~~Add a §0 "Architectural Invariants (Do Not Modify)" section that inlines or references the `HANDOVER.md` Safety Lock list (ladder priority order, output key names, `cleanImg` locality, sanitizer presence, `'Other'` default, Magic Wand prop contract, etc.).~~ **Status: RESOLVED (April 16, 2026).** §0 added at the top of this file with 10 invariants, including the new Smart Fill boundary, Classification Fork kind contract, phantom-column purge, and venues schema invariant.

### Drift / accuracy (should fix)

5. **Scraper payload field names** — actual scrapers emit `event_date` / `start_time`, not `date` / `time`. Also list `artist_name` for music-category scrapers, plus `source`, `end_time`, `cover`, `ticket_link` where applicable.
6. **`is_human_edited` / `is_locked` locks** — ~~SOP should at minimum say "If a field has `is_locked: true`, do not overwrite via `custom_*` without first unlocking."~~ **Status: RESOLVED (April 16, 2026).** §0 rule 1 now explicitly frames the locks as "don't clobber populated fields, not skip row entirely" and points to the Smart Fill rescue behavior (Workflow 5) for the blank-field case. Workflow 5 documents how `lockedBlankFilled` surfaces a rescue signal.
7. **"Delete & Keep Events" behavior claim** — verify Scraper Blacklist table and automatic `'Other'` recategorization are actually implemented before the SOP commits agents to that flow.
8. **Description ladder rungs** — ~~distinguish `e.artists?.bio` (FK-joined, affects all future events by that artist) from `e.artist_bio` (denormalized snapshot on the event row).~~ **Status: RESOLVED (April 16, 2026).** Triple Crown appendix now spells this out inline on the Description row.
9. **Magic Wand sanitizer scope** — case-insensitive + trim only. Punctuation variants ("Open Mic Night!" vs "Open Mic Night") still slip through. Agents must eyeball bio/image after Magic Wand.

### Missing workflows (nice to have)

10. User submissions moderation (`AdminSubmissionsTab` — "Add to the Jar").
11. Report / flag triage (`AdminReportsTab`).
12. Spotlight curation (`AdminSpotlightTab`) — or explicit "out of scope" note.
13. Cancellation handling — set `status: 'cancelled'`, do not delete.

### Minor

14. New venue SQL — include `lat`/`lng` when known; reference Nominatim geocoder + `not_found` cache gotcha.
15. Title fallback terminal value is `''` not "Raw Scraper Title" (scraper title IS the raw rung).
16. Google Calendar path correct, but flag DST requirement via `easternOffset()`.

---

## 🛡️ Protocol: G Spot (Safety & Confidence Enforcement)

When building or modifying automated data handlers, the Agent must prioritize **data integrity over speed**.

### Required invariants

1. **Verified Lock column.** The Agent is required to implement an `is_category_verified` boolean on relevant tables (`events`, `artists`). Default `false`. Flips to `true` only on explicit human action (save-from-modal, triage categorize, bulk approve). Automation logic must skip any "Verified" records without exception.
2. **Confidence threshold.** All LLM-based categorization must return a numeric confidence score alongside its label. If the score is below **0.85**, the handler must fail-safe to `'Other / Special Event'` (or `triage_status: 'pending'` for artist metadata) and flag the row for human review rather than auto-saving. Scores should be persisted in a `category_confidence` (or field-scoped) column for auditability.
3. **Enum Prison.** AI outputs must be validated against the canonical whitelist before any DB write:
   - Categories → `CATEGORY_OPTIONS` in `src/hooks/useAdminEvents.js`
   - Genres → `GENRES` Flat-20 in `src/lib/utils.js` (also mirrored as `ALLOWED_GENRES` in `src/lib/aiLookup.js`). Added April 18, 2026: `'Disco'`, `'Jam'`.
   - Vibes (artists) → `ARTIST_VIBES` in `src/lib/utils.js` (3 items: Chill / Low Key, Energetic / Party, Family-Friendly). Excludes "Outdoor / Patio" which describes a venue, not a performer.
   - Vibes (events) → `VIBES` in `src/lib/utils.js` (4 items, includes Outdoor / Patio).
   Any value not in the whitelist is dropped (not coerced).
4. **Chain of Command.** Resolution order for categorization and metadata is non-negotiable: **Templates → Linked Artist → AI Suggestion → Default.** AI never overrides a template-linked or artist-linked value. This is the Metadata Waterfall — see HANDOVER.md §1 for field-by-field enforcement.
5. **Batch Economy.** Where the endpoint supports it, AI operations must be processed in server-side batches. Reference pattern: `POST /api/admin/ignored-names` accepts `names[]` and upserts via `onConflict: 'name_lower'` in a single round-trip. Do not issue N serial requests when the API exposes a batch shape.

### Sacrosanct locks (existing, reinforced)

These pre-existing locks still apply and are complemented — not replaced — by the G Spot protocol:
- `is_human_edited` on `artists` (JSONB field map) — per-field lock. PUT handler in `src/app/api/admin/artists/route.js` strips any incoming field that is locked unless the same request explicitly unlocks it.
- `is_human_edited` on `events` (boolean) — row-level lock. Interpreted as "don't clobber populated fields," not "skip row entirely." Smart Fill (Workflow 5) may write to BLANK image/bio fields on such rows; it must never write to `event_title` or `start_time`.
- `is_locked` on `artists` (boolean) — Master Lock. When `true`, AI enrichment skips the row entirely.
- Admin "save" stamps `metadata_source: 'manual'` automatically; AI writes stamp `'ai_generated'`. Never overwrite `'manual'` with `'ai_generated'`.
- **Classification Fork kind gate.** `aiLookupArtist()` returns `kind: 'MUSICIAN' | 'VENUE_EVENT'`. The Pass-2 genre tagger and the tribute-artist flag are gated to MUSICIAN. Do not lift the gate. The vibe tagger is also kind-aware: MUSICIAN uses `ARTIST_VIBES` (3 items), VENUE_EVENT uses `ALLOWED_VIBES` (4 items).
- **`stripLockedFields` applicability.** The guard is correct for per-event admin saves (`src/app/api/admin/route.js`) and per-artist enrichment (`src/app/api/enrich-artists/route.js`). It is WRONG for rescue paths like Smart Fill, where the rescue target is precisely the rogue-locked row with blank data — it would strip the rescue write. Any new rescue endpoint must replicate the per-field blank-only pre-check instead.

### Rollout requirement

Any PR that introduces a new automated classifier, enrichment job, or cron-backed data writer must cite this protocol in its description and demonstrate each of the five invariants is satisfied. PRs that fail the protocol are blocked at review, regardless of test coverage.

---

## 🗄️ DATABASE & DEPLOYMENT RULES (Added April 16, 2026 — Session 3)

These rules were established after a production incident where a botched deployment caused the site to show 0 events. They are mandatory for all future database and deployment work.

### Rule 1: PostgREST Explicit Join Hints (MANDATORY)

Whenever two tables are connected by foreign keys, all PostgREST/Supabase `.select()` queries that join those tables **MUST** use explicit FK hint syntax:

```javascript
// ✅ CORRECT — explicit hint tells PostgREST exactly which FK to traverse
.select('*, event_templates!fk_events_template_id(template_name, bio, category, start_time)')

// ❌ WRONG — relies on PostgREST schema cache auto-detection, which fails when:
//   - Multiple FKs exist between the same tables (ghost/duplicate constraints)
//   - The schema cache hasn't reloaded after a migration
//   - NOTIFY pgrst doesn't stick on the instance
.select('*, event_templates(template_name, bio, category, start_time)')
```

**Why:** PostgREST auto-detects FK paths from its schema cache. If two FKs point from the same column to the same table (e.g., after a manual DB repair creates a duplicate), PostgREST throws "more than one relationship was found" and the query returns an error. The explicit hint (`table!fk_name(*)`) bypasses the cache entirely and works regardless of cache state or duplicate constraints.

**Scope:** This applies to ALL Supabase `.select()` calls that embed related tables — not just the search route. Any new route or query that joins tables via FK must use the hint syntax.

### Rule 2: No Direct Production Schema Changes (MANDATORY)

All database schema changes — including adding/dropping columns, constraints, indexes, or extensions — **MUST** follow this path:

1. Write a migration file in `supabase/migrations/`
2. Test the migration against the **Staging** Supabase instance first
3. Verify application code works with the schema change on staging (run test suite)
4. Deploy to production only after staging validation passes

**Never** use the Supabase Dashboard SQL Editor or Table Editor to make structural changes directly on the production database. Manual mutations create schema drift that is invisible to version control and can produce ghost constraints, duplicate FKs, or missing columns that are extremely difficult to diagnose.

**Exception:** Read-only diagnostic queries (SELECT, EXPLAIN) are fine to run against production for debugging purposes.

### Rule 3: PostgREST Schema Cache Troubleshooting Protocol

If PostgREST returns stale schema errors after a migration (e.g., "Could not find a relationship" or "more than one relationship"), follow this escalation path:

**Level 1 — Standard reload (often insufficient):**
```sql
NOTIFY pgrst, 'reload schema';
```

**Level 2 — DDL comment change (forces event-trigger-based reload):**
```sql
-- Pick any constraint on any table and change its comment. The DDL change
-- triggers PostgREST's event-trigger-based reload, which is more reliable
-- than the NOTIFY channel.
COMMENT ON CONSTRAINT fk_events_template_id ON events IS 'FK reload trigger - updated YYYY-MM-DD';
```

**Level 3 — Combined nuclear reload:**
```sql
-- 1. DDL change to trigger event-trigger reload
COMMENT ON CONSTRAINT fk_events_template_id ON events IS 'FK reload trigger - updated YYYY-MM-DD';

-- 2. Function-based notify (belt)
SELECT pg_notify('pgrst', 'reload schema');

-- 3. Raw NOTIFY (suspenders)
NOTIFY pgrst, 'reload schema';
```

**Why Level 1 alone is unreliable:** The `NOTIFY pgrst` channel requires PostgREST to be actively listening at the moment the notification fires. On Supabase-hosted instances, the PostgREST process may not pick up the notification reliably (especially after restarts or on instances with connection pooling). DDL changes (ALTER, COMMENT, CREATE) trigger PostgREST's built-in event trigger (`pgrst_ddl_watch`), which is a fundamentally different and more reliable mechanism.

---

## 🌊 The Data Inheritance Waterfall & Chain of Command

> **READ THIS BEFORE TOUCHING ANY CODE PATH THAT WRITES TO `events`, `artists`, OR THE CATEGORIZATION PIPELINE.** The rules below are load-bearing. Every sync run, every AI call, every admin save flows through this hierarchy. Violate any level and you will silently corrupt live data. These rules are NOT suggestions — they are invariants enforced across `src/app/api/sync-events/route.js`, `src/app/api/admin/auto-categorize/route.js`, `src/app/api/admin/artists/route.js`, and `src/components/EventFormModal.js`. Future agents: if you find yourself writing a code path that seems to bypass one of these levels, stop and escalate. You are almost certainly introducing a regression.

### 1. The Precedence Hierarchy (Highest → Lowest)

Resolution runs top-down. A higher level wins absolutely; lower levels do not get a vote if a higher level has produced a value.

**Level 1 — Human Edits (`is_human_edited`, `is_locked`).**
The ultimate lock. A field that a human has touched is immutable to every automated process downstream. The sync pipeline, the template inheritor, the AI categorizer, and the artist-default bypass must all check these flags and skip the row (or the specific field) when set. The admin PUT handler for artists already strips locked fields from incoming update payloads as defense-in-depth — do not weaken that guard. If a new writer needs to overwrite a human-edited value, the human must explicitly unlock it first via the admin UI.

**Level 2 — Event Templates (`template_id`).**
When an event is linked to a template, the template's Master Time (`start_time`), Category, Image, and Bio forcefully clobber the raw scraper payload on every sync. This is an unconditional overwrite — sync-events calls `stampMasterTime(event_date, template.start_time)` and writes `category_source = 'template'`, `is_category_verified = true`, `triage_status = 'reviewed'`. Templates exist precisely to neutralize scraper noise; do not add conditional "only if empty" guards to this block. The only thing that can beat a template is Level 1.

**Level 3 — Artist Defaults (`category_source = 'artist_default'`).**
If a linked artist has a non-null `default_category`, the event inherits it deterministically — no LLM call, no triage, no confidence threshold. The sync-events bypass stamps `category_source = 'artist_default'` and `is_category_verified = true`, and the auto-categorize route skips any row it finds at this source. This is Tier 1 of the Confidence Cascade. It exists to turn known entities (e.g. every Frankie Frogg show is Live Music) into zero-cost, zero-ambiguity classifications.

**Level 4 — AI Inference (Perplexity `sonar-pro`, gated at 0.85).**
Only reached for events that are (a) not template-linked, (b) not human-verified, (c) not sourced from an artist default. The prompt MUST inject bio + genres from the linked artist row when available (Confidence Cascade Tier 2) before falling through to a cold classification call (Tier 3). Outputs are whitelisted against `ALLOWED_CATEGORIES` (Enum Prison). A confidence below 0.85 writes `category_source = 'manual_review'` + `triage_status = 'pending'` and does NOT overwrite the existing category. AI never stamps `is_category_verified = true`. Humans do.

**Level 5 — Raw Scraper Data.**
The default floor. Used only if Levels 1–4 produced nothing. Category falls through to `'Other'`; time falls through to whatever the scraper emitted (typically `"00:00"` when missing — see the Midnight Exception below).

### 2. The Midnight Exception

Jersey Shore scrapers (iCal, Squarespace JSON, Eventbrite, Ticketmaster) overwhelmingly default missing start times to `"00:00"` (12:00 AM). That value is digital silence, not data. A naive truthy check (`form.event_time || templateTime`) treats `"00:00"` as valid and lets the scraper default win over the template's Master Time. This is a bug class, not a one-off.

**The rule, stated precisely:** if `event.event_time === "00:00"` (or `"00:00:00"`) AND `is_human_edited === false` AND a template is linked, the system MUST treat the time as empty/null, and the template's `start_time` MUST overwrite it — on the backend during sync, in the EventFormModal during rendering, and on save.

The exception is scoped to template-linked, non-human-edited rows. If a human explicitly saves `00:00` on a row, that is a legitimate midnight show and it is preserved. Implementation anchor: `isMidnight()` + `shouldTreatTimeAsEmpty` + `effectiveFormTime` in `src/components/EventFormModal.js`. Do not reintroduce `form.event_time || templateTime` anywhere in the codebase.

### 3. UI Indicators

The admin UI must make inheritance visible so humans can see at a glance what the automation has decided.

Fields currently inheriting their value from a linked template display the **blue "T" badge** rendered by the `TemplateChip` component in `src/components/EventFormModal.js`. This chip appears next to the Time label, the Category label, and anywhere else a template-sourced value flows through. The chip is intentionally NOT the chain-link emoji (🔗) because that glyph is reserved elsewhere for source-venue hyperlinks — overloading it conflates "this field inherits from a template" with "click here to open the venue page" and confuses operators.

Events that are successfully linked to a template display a **blue "Template Linked" header badge** (which itself includes a TemplateChip) in place of the gray "Standalone Event" badge. Standalone events can be manually bridged to a template via the Linked Template selector in the Logistics block of the event modal; selecting a template there triggers `applyTemplateLink`, which force-clobbers any empty or midnight `event_time` with the template's Master Time and fills a blank category with the template's category (human-set categories are preserved).

### 4. Enforcement Summary for Future Agents

Before writing, modifying, or reviewing any code that touches categorization, time assignment, or template/artist inheritance, confirm each of the following is true. If any answer is "no," the code is wrong.

Does the writer check `is_human_edited` / `is_locked` before overwriting? Does template inheritance clobber unconditionally rather than fill-only? Does the artist-default bypass skip the AI entirely and stamp `category_source = 'artist_default'`? Does the AI path inject artist bio/genres context when available? Does the AI path refuse to write when confidence < 0.85? Does any truthy check on `event_time` treat `"00:00"` as empty when a template is linked? Do inheritance-indicator chips render as the blue "T" `TemplateChip` rather than 🔗?

If you cannot answer yes to all of the above, do not merge.