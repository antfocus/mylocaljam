# Artist Kind Taxonomy

Training doc for future AI agents. Explains the three-value `artists.kind` model, why all three live in one table, how to classify a scraped name, and where each surface in the app respects the distinction.

Read this before:
- Classifying scraped event titles into artist rows
- Reviewing pending_enrichments queue rows where `proposed_kind` is set
- Touching any code path that branches on `artists.kind`
- Cleaning up "weird" rows in the admin Artists list

---

## 1. The model

`artists.kind` has three allowed values, enforced by a check constraint on the column:

- **`musician`** — a real performer. Single human or band. Default for new rows. Examples in our DB: Megan Knight, The Mangos, DJ Bluiz, Mike Dalton, Just Bob.
- **`event`** — a branded recurring or one-off venue event with no single performer. Examples: Trivia NIGHT, Mother's Day Brunch, BOGO Burger, Karaoke with Wildman Manny, Happy Hour, Cinco de Mayo Celebration.
- **`billing`** — a multi-artist lineup stitched together as a single row when the venue advertises them collectively. Examples: "Kirkby Kiss, Hundreds Of Au, Medicinal, Disappearances, Knife City"; "Stressed Out, Dab Nebula, Brain Rot, Bum Ticker"; "The Flatliners & A Wilhelm Scream w/ Signals Midwest" (before manual cleanup).

Schema:

```
artists.kind: text NOT NULL DEFAULT 'musician'
CHECK (kind IN ('musician', 'event', 'billing'))
```

LLM prompts emit kind as uppercase (`MUSICIAN` / `VENUE_EVENT`). The approve handler at `src/app/api/admin/pending-enrichments/[id]/approve/route.js` runs values through a `KIND_NORMALIZE` map (`MUSICIAN → musician`, `VENUE_EVENT → event`, plus lowercase passthrough) before writing. Unknown kinds get silently dropped so other fields still write.

---

## 2. Why one table

Every event row has an `artist_id` foreign key. To keep the rendering / linking / metadata pipeline uniform, the artists table holds all three kinds. The `kind` field discriminates them.

Sharing the table buys:

- **Consistent bio + image across venues.** A single `Mother's Day Brunch` row supplies the same metadata to every venue's Mother's Day brunch event. Twelve venues × one canonical row beats twelve duplicate scraped strings.
- **Uniform waterfall.** The image and bio waterfall in `src/lib/waterfall.js` doesn't branch on kind — it always reads `artists.image_url` and `artists.bio` regardless of whether the row represents a person or a venue event.
- **Uniform alias matching.** `artists.alias_names` is a text array. Variant names ("Mother's Day Sunday Brunch", "Mom's Day Brunch") fold into the canonical row by alias, same mechanism as a band's nicknames or alternate spellings.
- **Uniform retroactive sweep.** `src/lib/artistSweep.js`'s `sweepEventsForArtist` reads name + alias_names and links orphan events. Doesn't care about kind — works for musicians and events the same way.

The trade-off is that the admin Artists list mixes all three kinds by default, which is why the kind filter pill exists (see Section 4).

---

## 3. How to classify a name

For an AI agent classifying a scraped string into a kind, use these heuristics in order: check `event` first (most distinctive), then `billing`, then default to `musician`. Flag edge cases for human review rather than guessing.

### Likely `kind='event'` if the name contains:

- **Activity nouns:** Trivia, trivia night, quiz, pub quiz, Karaoke, Bingo, Open mic, Comedy night
- **Brunch** when not preceded by an artist's name. ("Mother's Day Brunch" = event. "Megan Knight Brunch Set" = musician.)
- **Holiday names:** Mother's Day, Father's Day, Valentine's Day, July 4th, Memorial Day, Labor Day, Halloween, Christmas, New Year's, Cinco de Mayo, Easter
- **Drink/food specials:** `$N drinks`, BOGO, Happy Hour, Wing Night, Taco Tuesday, Burger Night, Ladies Night, Power Hour, Bottomless, "Miller Lite/Coors Light/Bud Light/Yuengling pints", Drink Special
- **Branded venue events:** "Sunday Funday", "Monday Funday", "Family Funday", "Throwback Thursday", "Sip & Shop", "Saturday Night Dance Party", "Opening Party"
- **Time markers attached to a recurring activity:** "Karaoke 8pm every", "Trivia with Jenn every", "Pat Guadagno every". The trailing `every` suffix is a scraper artifact for recurring events — strip it, then classify what remains.

### Likely `kind='billing'` if:

- **Comma-separated multi-artist string:** "Artist A, Artist B, Artist C"
- **`w/` or `with` between two distinct artist-shaped names:** "DJ Funsize & MC Joe", "Ben Shooter, Structure Sounds, Nine O Pony, Heavy Mouth"
- **Named DJ-set lineup wrapping multiple performers:** "Pulse – DJ High Def, DJ Encore on the Beach", "The Band of Make Believe – DJ Case Ace on the Beach"

When you classify as `billing`, also consider whether to break it apart instead — extract the headliner as a `musician` row and push the bill text into `alias_names`. Apr 29 had a one-shot SQL pass that did exactly this for five rows: "ALL THAT REMAINS with Special Guests Born of Osiris and Dead Eyes" became `ALL THAT REMAINS` + the full string in alias_names. That pattern is preferred for tour packages where there's a clear headliner; pure `billing` is for festival-style equal-weight lineups.

### Likely `kind='musician'` if:

- Single human or band name with no event/special keywords
- Has Spotify / MusicBrainz / Last.fm / Bandsintown / gigsalad presence
- **Tribute bands count as musicians**, not events. "The BStreetBand – Bruce Springsteen Tribute" → `musician` with `is_tribute: true`. The act is real performers playing real shows.
- Cover bands, solo acts, full bands

### Edge cases — flag for human review, don't auto-classify:

- **Ambiguous solo names:** "Steve" — could be a band, could be a placeholder, could be a real solo artist. Last.fm has multiple artists named Steve. Needs disambiguation.
- **Generic single-word names:** "TBA", "Mango", "On Point" — Last.fm/MusicBrainz import typically returns "There is more than one artist with this name…" bios. Don't classify; flag.
- **Tribute acts whose name is the original artist:** "Green Day's American Idiot" — could be a tribute band OR a theatrical Broadway-style production OR a venue's branded show night. Agent should check the venue context (is it a theater? a bar?) before classifying.
- **Compound names with both artist + event language:** "The Pickles Kegs & Eggs", "Oso Oso w/ Last Minet, & Roe Knows Best" — usually `kind='billing'` (multi-act package), but sometimes the lead is a real headliner and the rest are openers. If unsure, flag.
- **Multi-artist disambiguation rows from Last.fm:** any artist whose bio begins with "There is more than one artist with this name: 1.) …" needs `NEEDS_MANUAL_REVIEW` — Tony picks the right artist section by hand.

---

## 4. Where each surface respects kind

| Surface | Behavior by kind |
|---|---|
| **Live event card** (`src/components/EventCardV2.js`) | `musician` → `+ FOLLOW ARTIST` pill (becomes `✓ FOLLOWING ARTIST` after follow). `event` / `billing` → `+ FOLLOW EVENT` pill that wires to the same save handler as the ticket-stub icon. The `hasFollowableArtist` check explicitly excludes `kind='event'` and `kind='billing'`. |
| **Live-site search autocomplete** (`src/app/page.js`) | `musician` → ARTIST badge + music icon. `event` / `billing` → EVENT badge + calendar icon. Implemented via `artistSet` map keyed by `{display, kind}` (line ~622). Consumed kind from the events.search API's artists join projection. |
| **Admin Artists tab list** (`src/components/admin/AdminArtistsTab.js`) | Filter pill defaults to `musician`. Flip to Events / Billings / All to see others. **Search bypasses the filter** — when `artistsSearch` has a value, the kind filter is suspended on both Metadata Triage and Directory sub-tabs. Count display ("X approved musicians") follows the filter too. |
| **Admin Artists modal — Default Category field** | Hidden for `kind='musician'` (redundant — AI infers Live Music). Visible for `event` and `billing`. Helper text: "Auto-categorize FUTURE scraped events for this row. Existing events keep their current category. Templates and per-event edits still override." |
| **Admin Event Feed list** | Shows ARTIST badge if `event.artist_id` is linked, EVENT badge if null. Doesn't read kind directly — proxy via the foreign-key link. (An event linked to a `kind='event'` artist row still reads as ARTIST in this list; classification happens at the artist row level, not the event level.) |
| **Sync events flow** (`src/app/api/sync-events/route.js`) | Auto-link logic on insert checks `artists.alias_names` + `name` regardless of kind. Default category seeding only fires when `artists.default_category` is set, which is more common on `event` and `billing` rows. |
| **Promote to Artist** (`src/app/api/admin/artists/promote/route.js`) | Always creates as `kind='musician'` when no name match. If admin needs a different kind, they edit the row afterwards via the artist modal. |
| **Bulk-enrich queue** (`src/app/api/admin/bulk-enrich/route.js`) | Targets `kind='musician'` only via the `bare-artists` filter. Event/billing rows aren't put through the LLM enrichment pipeline — their bios come from manual curation. |

---

## 5. Maintenance rules

- **Don't delete `kind='event'` rows just because they look weird in the artists list.** They're plumbing for venue events. Either filter the list (admin's kind filter pill — defaults to Musicians) or use the kind toggle on the row to reclassify. Deleting a row that's still referenced by events orphans the events.

- **When deleting an artist (via admin), the name auto-adds to `ignored_artists` blacklist.** Future scrapes won't recreate the artist row but WILL still create the event. Events appear unlinked unless an alias-match catches them. If the deletion was a mistake, remove from `ignored_artists` and re-create the row — the new `sweepEventsForArtist` hook will re-link the orphans on creation.

- **When admin saves an artist (`PUT`) or creates one (`POST`) or promotes an event to an artist (`POST /promote`), `sweepEventsForArtist` runs automatically** and links any orphan events whose `artist_name` matches the canonical name or any alias. Caller decides whether to surface the count — the Promote endpoint returns `siblings_linked` and the EventFormModal toast shows it.

- **The "Mother's Day Brunch" row is correctly classified as `kind='event'`.** So is "BOGO Burger", "Trivia NIGHT", "Happy Hour", "Cinco de Mayo Celebration", "Saturday Night Dance Party", etc. **These should NOT be promoted to musicians.** If a future agent sees one of these in the artists list and is tempted to "fix" it by reclassifying to musician — don't. Check the kind filter first.

- **Tribute bands stay `kind='musician'`** with `is_tribute: true`. Don't reclassify "REPRISE - Recreating Iconic Phish Shows" or "We May Be Right (Billy Joel Tribute)" as events. They're real bands playing real shows; the tribute flag is the right signal.

- **The kind filter on AdminArtistsTab defaults to Musicians.** If you need to find an event-classified row by name, use the search box — it bypasses the filter automatically. Don't switch the filter to All just to find one row.

---

## 6. Reference code

Files that implement or consume this taxonomy:

- **Schema check constraint** — `artists.kind` ∈ `{'musician', 'event', 'billing'}`. Enforced on the column.
- **Filter logic** — `src/components/admin/AdminArtistsTab.js` (filter pill + bypass-on-search). Hook state in `src/hooks/useAdminArtists.js`. Plumbed via `src/app/admin/page.js`.
- **Live search labeling** — `src/app/page.js` (autocomplete suggestions, `artistSet` map keyed by `{display, kind}`, around line 622).
- **Events search API kind projection** — `src/app/api/events/search/route.js` (artists join select line ~215).
- **Event card behavior** — `src/components/EventCardV2.js` (`hasFollowableArtist` excludes `kind='event'` / `'billing'`).
- **Auto-link sweep** — `src/lib/artistSweep.js` (`sweepEventsForArtist(supabase, artistId)`).
- **Sweep wired into write paths** — `src/app/api/admin/artists/route.js` (POST + PUT) and `src/app/api/admin/artists/promote/route.js` (POST).
- **Promote endpoint** — `src/app/api/admin/artists/promote/route.js` (links existing or creates `kind='musician'`).
- **Kind normalization on approve** — `src/app/api/admin/pending-enrichments/[id]/approve/route.js` (`KIND_NORMALIZE` map: `MUSICIAN → musician`, `VENUE_EVENT → event`).
- **Default Category visibility rule** — `src/components/admin/AdminArtistsTab.js` (modal hides field for `kind='musician'`).
