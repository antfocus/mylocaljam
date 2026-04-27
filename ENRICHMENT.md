# myLocalJam — Enrichment Skill

> **Skill scope.** Bio writing, classification (`kind` taxonomy), genre + vibe tagging, workflows, locks, staging, and the LLM prompts that drive it. The full enrichment pipeline from "we have a name" to "the canonical metadata is approved and live."
>
> **Image work has its own doc.** When this skill hits an image step, follow `IMAGE-MANAGEMENT.md`. It owns sourcing, PostImages, validation, and the image waterfall.
>
> **Companion docs.** `IMAGE-MANAGEMENT.md` (image work), `FRONTEND_SOP.md` (UI rendering), `HANDOVER.md` (running session log + postmortems), `PARKED.md` (deferred work).

---

## §1. Mission & Quality Bar

**Your job in one sentence.** Make every `kind='musician'` row in the database have a real photo, an accurate ≤250-character bio, the right genre tags, and the correct `kind` — or explicitly mark the row `triage_status='needs_human'` and move on.

**Quality bar.** Blank is better than mediocre. Wrong is worse than blank. The site's differentiation is reliable local-music metadata. One wrong photo on a wrong artist erodes trust faster than ten missing photos do.

**Three things you do not do.**

1. You do not write metadata onto a `kind='billing'` or `kind='event'` row. You skip them.
2. You do not save anything as final on a row whose existing fields are locked unless the locked field is currently blank.
3. You do not ship to production. You write to staging columns. The admin approves through the UI.

---

## §2. Pre-Flight Checklist

Before the agent runs for the first time, and before any large batch operation:

1. **Branch checkpoint.** Create a Supabase branch off `main` titled with today's date (e.g. `pre-agent-2026-04-27`). The branch sits frozen at fork time, ready to restore from. Branches don't auto-sync — that's the point.
2. **Verify daily backups are running.** Supabase free tier gives 7 daily snapshots automatically. Confirm in the dashboard → Project Settings → Backups that the last backup is <24h old.
3. **Cold archive (weekly).** Once a week, run a `pg_dump` of production and save the `.sql` to Drive / iCloud / external. Independent of Supabase being available.
4. **Confirm staging columns exist.** The agent must never write directly to `artists.image_url`, `artists.bio`, `events.event_image_url`, or `events.artist_bio`. It writes to the `proposed_*` columns described in §13. If those don't exist, stop — the migration is a prerequisite.

---

## §3. The `kind` Taxonomy

Every artists-table row has one of three values:

| `kind` | Definition | What you do |
|---|---|---|
| `musician` | A real, singular performer or band. | **Your work queue.** Enrich bio, image, genres. |
| `billing` | A concatenated lineup ("Headliner w/ Opener 1, Opener 2"). | **Skip.** Optionally split into individual musician rows (see §11). |
| `event` | Not a performer at all (trivia, drink special, family night, sip & shop). | **Skip.** Decorative rows kept for FK preservation. |

**How to tell:**

- **musician** — proper noun for a performer. "Aguilar Family Band", "Bobby Mahoney & The Seventh Son". Single act.
- **billing** — multiple acts joined by `,`, ` w/ `, `feat.`, `featuring`, `Presents`, or 2+ commas. "Tab Benoit w/ Ghalia Volt", "Sweet Lou and The River Rats with Dabble".
- **event** — describes an activity, not a performer. "Trivia Night", "$5 High Noons", "Family Night", "Karaoke 8pm every".

**Borderline cases:**

- `"X and the Y"` — could be a single band ("Toad the Wet Sprocket", "Tedeschi Trucks Band") or two acts ("Hump Day and The Mangos"). Default to single band UNLESS you can independently verify two distinct acts with discoverable web presence.
- A real artist's name buried inside a billing wrapper (`*Kegs & Eggs w/ Bullzeye Band*`) — the wrapper stays `billing`/`event`, but the inner artist deserves its own `musician` row. See §11.

When in doubt, mark `triage_status='needs_human'` and move on.

---

## §4. The Data Model — What You Read, What You Write

### Artist row (`public.artists`)

| Field | R/W | Notes |
|---|---|---|
| `id` | read | UUID. |
| `name` | read | Canonical name. Don't change without an explicit rename. |
| `alias_names` | read | Array of alternates. Useful for matching. |
| `kind` | read + write | `'musician'` \| `'event'` \| `'billing'`. See §3. |
| `image_url` | **never write directly** | Final image URL. Lives behind staging. |
| `bio` | **never write directly** | Final bio. Lives behind staging. |
| `genres` | **never write directly** | Genre array. Lives behind staging. |
| `vibes` | **never write directly** | Optional vibe tags. Same. |
| `is_human_edited` | read | Field-level lock (JSONB). See §7. |
| `metadata_source` | write | Set to `'agent'` (not `'manual'`). |
| `triage_status` | write | `'needs_human'` \| `'agent_proposed'`. See §13. |
| `proposed_image_url` | write | Staging. |
| `proposed_bio` | write | Staging. |
| `proposed_genres` | write | Staging. |

### Event row (`public.events`)

| Field | R/W | Notes |
|---|---|---|
| `id` | read | UUID. |
| `event_title` | read | Display title. |
| `artist_id` | read | FK to artists. May be null. |
| `artist_name` | read | Denormalized snapshot. |
| `event_image_url` | **never write directly** | Per-event image override. Behind staging. |
| `artist_bio` | **never write directly** | Per-event bio snapshot. Behind staging. |
| `is_locked` | read | Event lock (current source). See §7. |
| `is_human_edited` | read | Older lock (legacy, dual-write transition). |
| `template_id` | read | If non-null, event inherits from template. **Don't write event-level metadata; edit the template instead.** |
| `proposed_event_image_url` | write | Staging. |
| `proposed_artist_bio` | write | Staging. |

### The metadata waterfall (display-order precedence)

The front-end picks bio + image like this. Higher tier wins. **You write at the lowest tier that solves the problem.**

| Tier | Bio field | Image field | When you'd write here |
|---|---|---|---|
| 1 | `events.custom_bio` | `events.custom_image_url` | One-off override. Humans only. |
| 2 | `event_templates.bio` | `event_templates.image` | Recurring event template. |
| 3 | `artists.bio` | `artists.image_url` | **Default home for musician metadata.** |
| 4 | `events.artist_bio` | `events.event_image_url` | Per-event snapshot for `kind='event'` rows with no artist FK. |
| 5 | (none) | `events.image_url` | Legacy scraper image. Read-only. |
| 6 | (none) | `venues.image_url` | Final fallback. Don't write here. |

**Practical rule:**
- Musician with linked events → write to **artists** (Tier 3). Events inherit.
- Standalone event with no artist FK → write to **events** (Tier 4).
- Event linked to a template → don't write at the event level. Update the template.

---

## §5. The Lock System

Three lock surfaces matter:

1. **`artists.is_human_edited`** — JSON object keyed by field. `{ image_url: true, bio: false }` means image is locked, bio isn't. **Rule:** if a field is locked AND its current value is non-blank, never propose a change. If a field is locked AND its current value is blank, you may propose (the Smart Fill exception).

2. **`events.is_locked`** (current) and **`events.is_human_edited`** (legacy, dual-write). Treat both as event-row-level locks. Same rule.

3. **Template lock.** If `events.template_id` is non-null, the event inherits from a template. **Don't write at the event level.** If the template's metadata is wrong, propose at the template level. For now: skip the event.

When you save a proposal, **do not flip locks.** Locks belong to the human admin. They flip them when they approve your proposal through the staging UI.

---

## §6. LLM Prompts (Source of Truth)

> **Canonical location:** `src/lib/aiLookup.js`. The prompts below are mirrored from there for readability.
> **If you change a prompt, change it in BOTH places** — the JS file is what the LLM actually sees; this section is what humans (and external agents) read to understand the contract. They must stay in sync. Bump the "Last synced" date below whenever you touch either copy.
>
> **Last synced:** 2026-04-27 against `aiLookup.js` lines ~422–555.

### Taxonomy note (open issue)

The prompts below use the legacy two-class taxonomy: `MUSICIAN` and `VENUE_EVENT`. The DB schema now has a three-class `kind` column (`musician` / `billing` / `event`). Until the prompt is updated to recognize `billing`, the agent must pre-filter and never invoke `aiLookupArtist` on a row where `kind='billing'`. See §17 for the open issue.

### Pass 1 — Classification + Bio + Image (Perplexity sonar-pro, web-grounded)

**System prompt:**

```text
You are a professional listings writer for a local live-music and nightlife site. Follow these rules STRICTLY.

═══════════════════════════════════════════════════════
STEP 1 — CATEGORIZATION (do this FIRST, before writing anything):
═══════════════════════════════════════════════════════
Analyze the provided name and decide which of these two categories it belongs to:

- MUSICIAN: a band, solo artist, DJ, duo, tribute act, or other live-music performer.
    Examples: "The Nerds", "Bruce Springsteen", "DJ Shadow", "Elton John Tribute".

- VENUE_EVENT: a recurring or themed venue activity that is NOT a specific performer.
    Examples: "Trivia Night", "Karaoke Tuesday", "BOGO Burger", "Taco & Margarita Night",
    "Open Mic", "Comedy Night", "Happy Hour", "Paint and Sip", "Brunch Bingo".

If the name clearly refers to a person or band playing music, it is MUSICIAN.
If the name describes an activity, food/drink special, or theme night, it is VENUE_EVENT.
If ambiguous, use the venue and city context to decide. When still unsure, default to
MUSICIAN only if the name reads like a proper noun for a performer; otherwise VENUE_EVENT.

Set the output field "kind" to exactly "MUSICIAN" or "VENUE_EVENT".

═══════════════════════════════════════════════════════
STEP 2 — CONDITIONAL WRITING RULES
═══════════════════════════════════════════════════════

IF kind === "MUSICIAN":
  BIO RULES (MUSICIAN):
  - Maximum 250 characters (count every character including spaces and punctuation).
  - Focus STRICTLY on the artist's musical style, genre, vocal range, and instrumentation — what kind of music they play and how they sound.
  - DO NOT list past venues, tour history, award history, or any places the band has performed. Not even one example.
  - AVOID hype words: "legendary", "world-class", "amazing", "soul-stirring", "incredible", "electrifying", "unforgettable", "mind-blowing", "jaw-dropping", "high-energy", "captivating", "mesmerizing", "powerhouse", "showstopping", "breathtaking". Never use promotional adjectives.
  - DO NOT use generic filler sentences such as "Come out for a night of music" or "Don't miss this show" or "You won't want to miss…". Never address the reader or call them to action.
  - Tone: neutral, informative, professional — like an encyclopedia entry, not marketing copy.
  - Write 1–3 complete sentences. End on a period. If you would exceed 250 characters, rewrite shorter rather than truncating mid-sentence.
  - DO NOT include citation markers like [1], [2], [3] in the bio text. Write clean prose with no references or footnotes.
  - If the data is insufficient to confidently identify the artist, return exactly: "NEEDS_MANUAL_REVIEW" for bio.

IF kind === "VENUE_EVENT":
  BIO RULES (VENUE_EVENT):
  - Maximum 250 characters (same hard cap).
  - Describe THE ACTIVITY, the venue's atmosphere, and what attendees can expect (e.g. trivia format and prize structure, karaoke vibe, food/drink special details, comedy lineup style).
  - Keep it informative and punchy. 1–3 complete sentences. End on a period.
  - DO NOT invent musical genres, vocal ranges, or performer details for food/trivia/drink events. This event has no "sound".
  - Same banned hype-word list applies: "legendary", "world-class", "amazing", "soul-stirring", "incredible", "electrifying", "unforgettable", "mind-blowing", "jaw-dropping", "high-energy", "captivating", "mesmerizing", "powerhouse", "showstopping", "breathtaking".
  - Same no-call-to-action rule: DO NOT write "Come out…", "Don't miss…", or address the reader.
  - Tone: neutral, informative, professional — a listings description, not marketing copy.
  - If the data is insufficient to describe the event meaningfully, return exactly: "NEEDS_MANUAL_REVIEW" for bio.

═══════════════════════════════════════════════════════
STEP 3 — CONDITIONAL IMAGE RULES
═══════════════════════════════════════════════════════

IF kind === "MUSICIAN":
  - Find the most likely OFFICIAL promotional image for this specific artist/band.
  - Prefer high-resolution sources: the artist's official website, their primary social-media profile banner, or a press kit photo.
  - The URL must point DIRECTLY to an image file (.jpg, .jpeg, .png, .webp). Not a webpage.
  - If you cannot find a confident direct image URL, return null for image_url. Do not guess.

IF kind === "VENUE_EVENT":
  - Find a high-quality photo of EITHER:
      (a) the venue's interior matching the event's atmosphere, OR
      (b) the specific food/drink item featured in the event, OR
      (c) a generic but high-quality lifestyle photo matching the event vibe
          (e.g. a real photo of a trivia night crowd, a photographed burger
          for a burger special, a candid karaoke shot).
  - Prefer the venue's own website or social media if they have a real photo.
  - DO NOT return clip-art, cartoon icons, generic silhouettes, stock vector
    illustrations, or Shutterstock-style watermarked thumbnails.
  - High-res direct image URLs only (.jpg, .jpeg, .png, .webp). Not a webpage.
  - If you cannot find a confident direct image URL, return null for image_url.

═══════════════════════════════════════════════════════
STEP 4 — SOURCE LINK
═══════════════════════════════════════════════════════
Return the web page you used to source the bio/image (artist website, venue website, Wikipedia, primary social). Null if none.

═══════════════════════════════════════════════════════
STEP 5 — OUTPUT
═══════════════════════════════════════════════════════
Respond with valid JSON ONLY, no markdown, no code fences, no commentary:
{ "kind": "MUSICIAN" or "VENUE_EVENT", "bio": "string or NEEDS_MANUAL_REVIEW", "image_url": "string or null", "source_link": "string or null", "is_tribute": boolean }

"is_tribute" only applies when kind === "MUSICIAN". For VENUE_EVENT, always set is_tribute to false.
```

**User prompt (per-call template):**

```text
Research this listing for a local live-music and nightlife site.

Name: "{artistName}"
Listed at venue: {venue}            ← omitted if not provided
Location: {city}                    ← omitted if not provided

First, classify this name as either MUSICIAN or VENUE_EVENT per the CATEGORIZATION step in the system prompt. The venue/location context above is especially useful when the name alone is ambiguous — e.g. "Bingo" at a restaurant is a VENUE_EVENT; "Bingo Players" at a club is a MUSICIAN.

Then apply the conditional BIO RULES and IMAGE RULES for the chosen kind. If the name is MUSICIAN and appears to be a local act tied to the Jersey Shore region, research accordingly; if they are a nationally known act, search broadly.

Return the strict JSON object defined in STEP 5. Obey every rule for the chosen branch.
```

**Routing:** Pass 1 uses `callLLMWebGrounded` (Perplexity sonar-pro primary, Gemini fallback — Grok is not subscribed). Web grounding is required because bio + image research benefits from live web access.

**Output contract:**

```json
{
  "kind": "MUSICIAN" | "VENUE_EVENT",
  "bio": "string ≤250 chars" | "NEEDS_MANUAL_REVIEW",
  "image_url": "string (direct .jpg/.png/.webp)" | null,
  "source_link": "string (web page used)" | null,
  "is_tribute": true | false
}
```

### Pass 2 — Genre + Vibe Tagger (Gemini, no web)

Skipped when Pass 1 returns `kind="VENUE_EVENT"` or when bio is empty/`NEEDS_MANUAL_REVIEW`.

**System prompt:**

```text
You are a music categorization engine. Review the provided artist bio and assign up to 3 Genres and up to 2 Vibes.

CRITICAL RULE: You may ONLY select from the allowed lists. Do not invent new labels. If the artist is "Alternative Rock", output "Rock". If the artist plays jam-band, improvisational, or Grateful Dead / Phish-style music, output "Jam".

Allowed Genres: {ALLOWED_GENRES JSON}
Allowed Vibes: {ARTIST_VIBES JSON}

"Outdoor / Patio" is NOT a valid vibe for artists — it describes a venue, not a performer.

Respond with strict JSON only, no markdown, no commentary, no code fences:
{ "genres": ["string"], "vibes": ["string"] }
```

**User prompt:**

```text
Artist: "{artistName}"
Bio: "{bioFromPass1}"

Categorize using ONLY the allowed lists.
```

**Routing:** Pass 2 uses `callLLM` (default route — Gemini primary, Perplexity fallback). Pure classification from text; no web search needed. Gemini-first saves Perplexity quota for Pass 1.

**Allowed lists:** `ALLOWED_GENRES` and `ARTIST_VIBES` are defined at the top of `aiLookup.js`. Do not invent vibes/genres outside those lists — the validator strips them.

### Post-processing applied client-side after the LLM returns

1. **Bio trim to 250 chars.** Even though the prompt enforces it, post-trim catches LLM overshoots.
2. **Hype-word scrub.** `containsHypeWords()` rejects any bio containing the banned list above.
3. **`NEEDS_MANUAL_REVIEW` detection.** If bio === that exact string, treat as no bio and skip the genre pass.
4. **Image URL validation.** Must end in `.jpg|.jpeg|.png|.webp`. Webpage URLs are rejected.
5. **Genre/vibe whitelist.** Anything not in `ALLOWED_GENRES` / `ARTIST_VIBES` is dropped.

---

## §7. Bio Writing Rules

The authoritative prompt is in §6. The summary below is what an agent (or human) writing a bio by hand needs to internalize.

### Hard caps

- **Maximum 250 characters.** Counts every character including spaces and punctuation. Write to the cap, don't rely on truncation.
- **1–3 complete sentences.** Always end on a period.
- **Third person, present tense.** "The Foes of Fern blends garage rock with…" — not "We blend…" or "They blended in 2015…"

### Banned hype words

Never use any of these:

> legendary, world-class, amazing, soul-stirring, incredible, electrifying, unforgettable, mind-blowing, jaw-dropping, high-energy, captivating, mesmerizing, powerhouse, showstopping, breathtaking

Also banned:

- Calls to action: "Come out…", "Don't miss…", "You won't want to miss…"
- Tour-history laundry lists ("They've played at A, B, C, D…")
- Award bragging unless deeply notable.
- Citation markers like `[1]`, `[2]`.

### Required content (musicians)

- Style / genre in plain language.
- Where they're from (Jersey Shore region preferred when applicable).
- One distinguishing fact: residency, lineage, signature sound, instrumentation.

### Tone anchor

> "Encyclopedia entry, not marketing copy."

If the bio reads like a press release, rewrite it.

### When data is insufficient

Return exactly the string `NEEDS_MANUAL_REVIEW` for the bio and set `triage_status='needs_human'`. Do not fabricate. Do not write a generic "A local favorite bringing live music to the stage" — that's the front-end's fallback when bio is null, and it's the right behavior to leave it null.

### Examples

**Good (Aguilar Family Band, 162 chars):**

> The Aguilar Family Band is a NJ father-son duo. Slick Aguilar is a former Jefferson Starship guitarist; son Mark joins on vocals and guitar for psychedelic rock sets.

**Bad (uses hype words, exceeds 250):**

> The legendary Aguilar Family Band brings electrifying, soul-stirring psychedelic rock to the Jersey Shore. With Slick Aguilar's mind-blowing guitar work from his Jefferson Starship days, this powerhouse father-son duo will leave you breathless. Don't miss them!

**Good (DJ, 134 chars):**

> Kevin Hill performs an open jam residency at The Pig & Parrot in Brielle, blending blues, rock, and R&B with rotating guest musicians.

**Bad (genre invention, hype, CTA):**

> Kevin Hill is the most captivating DJ on the Jersey Shore, spinning legendary house, techno, drum & bass, and trance. Come out for an unforgettable Monday night you won't want to miss!

---

## §8. Workflow A — Enriching One Musician (Happy Path)

### Step 1 — Pull the row

Query `public.artists` for the next row where:

```sql
kind = 'musician'
  AND (image_url IS NULL OR bio IS NULL OR genres IS NULL OR array_length(genres, 1) = 0)
  AND triage_status IS DISTINCT FROM 'needs_human'
  AND (proposed_image_url IS NULL AND proposed_bio IS NULL)
ORDER BY (next-event-date ASC NULLS LAST), name
LIMIT 1
```

The ordering prioritizes artists with shows coming up soonest. Use the existing `enrichmentPriority.js` library if it's still relevant — it implements this logic.

### Step 2 — Disambiguate

Search the web for `"{artist name}" New Jersey music` (or `"... Asbury Park"`, `"... Jersey Shore"`). Read the first 3–5 results. Confirm:

- The act is real and active (any web presence in the last ~3 years).
- The act plays in the NJ Shore region or has a scheduled event here.
- You're looking at the *same* act, not a same-named act elsewhere.

If two equally-plausible candidates exist (the "Anthony" problem) and you cannot disambiguate by region: stop. Mark `triage_status='needs_human'`.

### Step 3 — Source the image

**Follow `IMAGE-MANAGEMENT.md`** for the full image workflow (sourcing tier list, banned sources, PostImages upload, naming convention, image waterfall). The output is a verified PostImages URL or null.

### Step 4 — Generate the bio

Use the LLM router (`callLLMWebGrounded` in `src/lib/llmRouter.js` — Perplexity primary, Gemini fallback). The system prompt is in §6. Apply the post-processing rules listed there.

If the LLM returns `NEEDS_MANUAL_REVIEW`, leave `proposed_bio` null and set `triage_status='needs_human'`.

### Step 5 — Genre tags

The same prompt returns genre tags. Validate against `ALLOWED_GENRES` in `aiLookup.js` (mirrored in `src/components/admin/AdminArtistsTab.js` `GENRES` constant). Reject anything not in the list — suggest the closest valid one.

### Step 6 — Save the proposal

```sql
UPDATE public.artists
SET proposed_image_url = $1,
    proposed_bio = $2,
    proposed_genres = $3,
    triage_status = 'agent_proposed',
    metadata_source = 'agent',
    updated_at = now()
WHERE id = $4
```

**Do not** touch `image_url`, `bio`, `genres`, or `is_human_edited`. The admin approves through the UI.

### Step 7 — Log the action

Append to your run log (§14):

```
[ok] Aguilar Family Band — image: postimg.cc/.../aguilar.jpg (bandcamp), bio: 162 chars, genres: [Rock, Psychedelic]
```

Skipped:

```
[skip-needs-human] Anthony² — multiple acts share name; could not disambiguate by region
```

---

## §9. Workflow B — Handling a Billing Row

When you encounter `kind='billing'`:

1. **Do not enrich.** Skip for metadata purposes.
2. **Optional: split.** If the billing decomposes cleanly into N individual acts, you may create individual `kind='musician'` rows for each. Skip on the first agent run; flag for manual review.
3. **Optional: relink events.** If you split, the events that referenced the billing row should ideally be relinked to the headliner. Don't do this autonomously yet.

Log:

```
[skip-billing] Tab Benoit w/ Ghalia Volt — flagged for manual split into "Tab Benoit" (headliner) + "Ghalia Volt" (opener)
```

---

## §10. Workflow C — Standalone Event Image (rare)

Only run this when:

- The event has `artist_id IS NULL`.
- The event has `template_id IS NULL`.
- All image fields are null.
- The event still warrants a custom image (beer fest, comedy showcase).

Follow `IMAGE-MANAGEMENT.md` for the image step. Write to `proposed_event_image_url`. Set `triage_status='agent_proposed'` on the event.

---

## §11. Edge Cases

| Case | Rule |
|---|---|
| **Tribute / cover band** | `kind='musician'`. Bio mentions they tribute X. Image of *this* act — see `IMAGE-MANAGEMENT.md` §7. |
| **Side project of a known artist** | `kind='musician'`. Bio mentions parent act. Image of this project. |
| **Name collision** | If you can't disambiguate by region in 60s: `triage_status='needs_human'`. |
| **DJ** | `kind='musician'`. Bio uses "spins" or "performs" instead of "plays". |
| **Comedian at a music venue** | `kind='musician'` (so they show in the directory). Bio template skips genre, focuses on style + credits. |
| **"X and the Y" single-band names** | Default single band unless two distinct acts are independently verifiable. |
| **Resident DJ / weekly show host** | `kind='musician'` if they're a real performer; `kind='event'` if the row is the event name (e.g. "Throwback Thursdays w/ DJ Bill Regan"). |
| **Festival or multi-day event** | Festival itself goes in `event_series`, not `artists`. Individual performers stay in `artists` with `kind='musician'`. |

---

## §12. Verification Protocol

Before saving any proposal, the agent must answer YES to all of these:

- [ ] Have I confirmed this is the correct act (name + region)?
- [ ] Is the image from a permitted source and re-hosted on PostImages? (See `IMAGE-MANAGEMENT.md` §8.)
- [ ] Is the bio ≤250 characters?
- [ ] Is the bio free of every banned hype word?
- [ ] Is the bio third-person, present tense, no calls to action?
- [ ] Did I leave `image_url`, `bio`, `genres` (canonical columns) untouched?
- [ ] Did I write to `proposed_*` columns and set `triage_status='agent_proposed'`?
- [ ] If anything was uncertain, did I instead set `triage_status='needs_human'` and leave the proposal blank?

If any answer is no, do not save. Roll back local state and either retry or skip.

**Confidence threshold.** ≥90% confidence required to propose. Below that, skip with `needs_human`. Tony reviews. If too many rows are skipped, the threshold can be relaxed — until then, err strict.

---

## §13. Staging Mechanism — How Proposals Reach Production

The agent never writes to canonical `image_url` / `bio` / `genres` columns. It writes to staging:

| Canonical | Staging |
|---|---|
| `artists.image_url` | `artists.proposed_image_url` |
| `artists.bio` | `artists.proposed_bio` |
| `artists.genres` | `artists.proposed_genres` |
| `events.event_image_url` | `events.proposed_event_image_url` |
| `events.artist_bio` | `events.proposed_artist_bio` |

Plus `triage_status='agent_proposed'`.

The admin Artists tab (and Events tab) gets a **Review Queue** sub-tab that filters for `triage_status='agent_proposed'`. Each row shows canonical and proposed fields side-by-side. The admin clicks **Approve** (copies proposed → canonical, sets `is_human_edited=true`, clears `proposed_*`, sets `triage_status='approved'`), **Reject** (clears `proposed_*`, sets `triage_status='needs_human'`), or **Edit & Approve** (admin tweaks bio first, then approves).

This is a separate work item. Sequence: ship the migration + admin tab first, then turn the agent on.

**Migration sketch** (the schema that needs to land before the agent goes live):

```sql
ALTER TABLE public.artists
  ADD COLUMN proposed_image_url text,
  ADD COLUMN proposed_bio text,
  ADD COLUMN proposed_genres text[];

ALTER TABLE public.events
  ADD COLUMN proposed_event_image_url text,
  ADD COLUMN proposed_artist_bio text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'triage_status_t') THEN
    CREATE TYPE triage_status_t AS ENUM ('pending', 'agent_proposed', 'needs_human', 'approved');
  END IF;
END $$;

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS triage_status triage_status_t DEFAULT 'pending';
```

---

## §14. Available Tools

### LLMs

- **Primary: Perplexity (`sonar-pro`).** Web-grounded. Best for finding facts about local NJ acts.
- **Fallback: Gemini.** When Perplexity is rate-limited or returns insufficient data.
- ~~Grok~~ — not subscribed.
- The router lives at `src/lib/llmRouter.js`. Use `callLLMWebGrounded(systemPrompt, userPrompt)` — failover is automatic.

### Existing endpoints

- `POST /api/admin/ai-enhance` — runs the existing enrichment pipeline against one row (musician or event). Routes through `callLLMWebGrounded`. Returns `{ bio, image_url, genres, source_url }`.
- `POST /api/admin/enrich-backfill` — batch processor for unenriched artists, ~20–25 per call. Returns `{ ok, batch, enriched, remaining, errors, duration, usageStats }`.
- `POST /api/admin/enrich-date` — Magic Wand. Single-day bulk enrichment with venue+city context.

### Pipeline modules

- `src/lib/enrichArtist.js` — universal enrichment waterfall (MusicBrainz → Discogs → Last.fm → AI fallback). Use this before falling through to a raw LLM call.
- `src/lib/enrichLastfm.js` — Last.fm-only path. Cached.
- `src/lib/aiLookup.js` — the prompt definitions (canonical source). Read but don't modify without coordinating.
- `src/lib/writeGuards.js` — `isFieldLocked()` and `buildLockSafeRecord()`. Use these before any update.
- `src/lib/enrichmentPriority.js` — `fetchPrioritizedArtists()` for the queue order.

---

## §15. Reporting Format

At the end of each run, write a session log to `logs/agent-runs/YYYY-MM-DD-HHMM.md`:

```markdown
# Agent Run — 2026-04-27 14:30

## Summary
- Artists processed: 47
- Proposals saved: 38
- Marked needs_human: 6
- Errors: 3

## Successful proposals
- Aguilar Family Band — image, bio, genres
- The Foes of Fern — bio, genres (no image found)
- ...

## Marked needs_human
- Anthony² — name collision, could not disambiguate
- DJ Smith — three regional DJs share this name
- ...

## Errors
- Bobby Mahoney & The Seventh Son — Perplexity timeout, Gemini fallback also timed out
- ...
```

Tony reviews the log to spot patterns ("we keep failing on tribute bands") and tune the playbook over time.

---

## §16. Escalation

Stop the agent and notify Tony if any of the following happens:

- A migration is missing (staging columns don't exist).
- A schema mismatch (`kind` enum doesn't match what this doc describes).
- Credentials fail (Perplexity quota exhausted, Gemini rate-limited and no failover available).
- More than 25% of rows in a batch are marked `needs_human` — the disambiguation logic is over-triggering or the queue has too many edge cases.
- Any error path that would write to a canonical column instead of staging.

---

## §17. Open Issues

- **Prompt taxonomy lag.** The `aiLookup.js` prompts use the legacy two-class `MUSICIAN` / `VENUE_EVENT` taxonomy. The DB has three classes (`musician` / `billing` / `event`). Until the prompt is updated, the agent must pre-filter and never call `aiLookupArtist` on `kind='billing'` rows.
- **Staging migration not applied yet.** The `proposed_*` columns and `triage_status` enum are specified in §13 but not yet run against production. Pre-flight (§2) blocks until they exist.
- **Admin Review Queue tab.** Not yet built. Needed before the agent goes live in autonomous mode.
- **Magic Wand → router migration.** `aiLookup.js` `callPerplexity()` (around line 297) still calls Perplexity directly. Should be swapped to `callLLMWebGrounded()` from `llmRouter.js` so failover works.

---

# Architecture Reference

The sections below are the technical reference for the existing pipeline. They predate the skill-doc rewrite (April 27, 2026) but the code patterns described here are still active. Use them when you need to know *how the system actually works under the hood.*

## A. Existing Pipeline Architecture

### The Waterfall — `src/lib/enrichArtist.js`

Universal pipeline called during nightly sync for every new artist:
1. **MusicBrainz** → MBID identity + Wikidata image (rate: 1 req/sec)
2. **Discogs** → Artist image fallback (rate: 1 req/min token)
3. **Last.fm** → Biography, genre tags, image fallback
4. **AI Fallback** → `aiLookupArtist()` when all three miss (common for local Jersey Shore bands)

### The AI Lookup — `src/lib/aiLookup.js`

`aiLookupArtist({ artistName, venue, city, autoMode })`:
- **Pass 1:** Classify (MUSICIAN vs VENUE_EVENT) + bio + image + source_link (Perplexity sonar-pro). See §6.
- **Pass 2:** Genre + vibe tagging (skipped for VENUE_EVENT). See §6.
- **Pass 3:** Serper image fallback if Perplexity returned no image.
- Has a Classification Fork (the prompt's STEP 1) that prevents writing musician bios onto trivia nights.

### The Magic Wand — `src/app/api/admin/enrich-date/route.js`

Single-day bulk enrichment triggered from admin UI:
- Input: `{ date: 'YYYY-MM-DD' }` or `{ eventId: 'uuid' }`.
- Smart Fill: fills blanks even on locked rows (rescues stale locks).
- Uses `aiLookupArtist` with venue+city context.
- 40 artist cap per call, 300ms throttle.

### Write Guards — `src/lib/writeGuards.js`

- `isFieldLocked(cached, fieldName)` — checks both JSONB per-field `{bio: true}` and boolean `true`.
- `buildLockSafeRecord(cached, record)` — strips locked fields from upsert payload.
- Human-edited fields are NEVER overwritten.

---

## B. LLM Router — `src/lib/llmRouter.js`

Multi-provider LLM abstraction with automatic failover:
- **Gemini 2.5 Flash** (primary) — `GOOGLE_AI_KEY` env var
- **Perplexity sonar-pro** (web-grounded specialist) — `PERPLEXITY_API_KEY`
- ~~**Grok**~~ — `XAI_API_KEY` — **NOT configured.**

Key exports:
- `callLLM(systemPrompt, userPrompt, options?)` → parsed JSON | null
- `callLLMWebGrounded(systemPrompt, userPrompt)` → Perplexity-first routing
- `callPerplexityWithFallback(systemPrompt, userPrompt)` → backward compat
- `getUsageStats()` → in-memory call/failure/rateLimit counters

---

## C. Priority Scoring — `src/lib/enrichmentPriority.js`

`fetchPrioritizedArtists({ limit, bareOnly })` returns unenriched artists ranked by:
- Day-of-week weight: Thu–Sun = 2x
- Completeness: bare (no bio AND no image) = 2x
- Recency: 10/daysAway (tomorrow's events score 10x vs. 30 days away)
- Deduplicates at artist level (one artist at 4 venues = 1 enrichment call)

---

## D. Backfill Endpoint — `src/app/api/admin/enrich-backfill/route.js`

`POST /api/admin/enrich-backfill` — batch processes 20-25 artists per call:
- Auth: `Authorization: Bearer {ADMIN_PASSWORD}`
- Body: `{ batchSize?: number, bareOnly?: boolean }`
- Returns: `{ ok, batch, enriched, remaining, errors, duration, usageStats }`
- Designed for client-driven loop (UI fires POST, gets progress, re-fires until `remaining === 0`)

---

## E. Database Schema (Key Columns)

**`events`:** `id`, `artist_name`, `artist_id` (FK → artists), `event_date` (timestamptz), `venue_name`, `image_url`, `event_image_url`, `custom_image_url`, `artist_bio`, `is_human_edited` (boolean), `is_locked` (boolean), `category`, `is_category_verified`, `category_source`, `template_id`, `status`, `proposed_event_image_url`*, `proposed_artist_bio`*.

**`artists`:** `id` (UUID), `name` (UNIQUE), `bio`, `image_url`, `genres` (array), `tags` (text), `kind`, `mbid`, `image_source`, `bio_source`, `metadata_source`, `is_human_edited` (JSONB), `is_locked` (boolean), `last_fetched`, `default_category`, `proposed_image_url`*, `proposed_bio`*, `proposed_genres`*, `triage_status`*.

**`artist_aliases`:** `artist_id` (FK), `alias_lower`.

\* Pending migration — see §13.

---

## F. Env Vars

- `GOOGLE_AI_KEY` — Gemini
- `PERPLEXITY_API_KEY` — Perplexity sonar-pro
- `SERPER_API_KEY` — Google Images fallback
- `LASTFM_API_KEY` — Last.fm
- `ADMIN_PASSWORD` — auth for admin endpoints
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase
- `XAI_API_KEY` — Grok (**NOT configured**)

---

## G. Key Constraints

- **Vercel Hobby tier = 60s function timeout.** Batch sizes must stay at 20–25 artists max. Client-driven loop pattern handles this.
- **Perplexity billing.** Each `aiLookupArtist` call = 2 API calls (Pass 1 + Pass 2). At ~$0.005/call, a 200-artist backfill ≈ $2.
- **Rate limits.** MusicBrainz 1/sec, Discogs 1/sec, Last.fm 5/sec. The waterfall in `enrichArtist.js` already handles this with 1100ms delays.
- **Lock system.** Never overwrite `is_human_edited` or `is_locked` artist data. Write guards handle this but double-check any new write paths.
- **Classification Fork.** The MUSICIAN vs VENUE_EVENT distinction in the prompt (§6 STEP 1) is critical. Without it, the LLM writes fictional band bios for "Taco Tuesday" entries.

---

## §X. Versioning

| Version | Date | Notes |
|---|---|---|
| 2.0 | 2026-04-27 | Restructured into a skill manual. Absorbed operating procedure from former AGENT-METADATA-PLAYBOOK.md. Image work moved to `IMAGE-MANAGEMENT.md`. LLM prompts mirrored from `aiLookup.js`. Old "What Was Just Built (April 20, 2026)" section condensed into Architecture Reference. |
| 1.0 | 2026-04-20 | Original handover doc — pipeline foundation, LLM router, priority scoring, backfill endpoint, OCR rate-limit handling, sync cap raise. |
