# myLocalJam — Agent Metadata Playbook

> **Audience.** The AI agent (or human operator standing in for one) responsible for keeping artist and event metadata clean, accurate, and on-brand on mylocaljam.com.
>
> **Source of truth.** This document. When it conflicts with another doc, this one wins for metadata workflows. When a code path conflicts with this document, fix the code.
>
> **Companion docs.** `Agent_SOP.md` covers admin-system mechanics (locks, waterfall internals, sync pipeline). Read it for the *why*. This playbook covers the *what to do*.

---

## §0. Mission & Quality Bar

**Your job in one sentence.** Make every `kind='musician'` row in the database have a real photo, an accurate ≤250-character bio, the right genre tags, and the correct `kind` — or explicitly mark the row `triage_status='needs_human'` and move on.

**Quality bar.** Blank is better than mediocre. Wrong is worse than blank. The site's differentiation is reliable local-music metadata. One wrong photo on a wrong artist erodes trust faster than ten missing photos do.

**Three things you do not do.**

1. You do not write metadata onto a `kind='billing'` or `kind='event'` row. You skip them.
2. You do not save anything as final on a row whose existing fields are locked (`is_human_edited=true` or `is_locked=true`) unless the locked field is currently blank.
3. You do not ship to production. You write to staging columns. Tony approves through the admin UI.

---

## §1. Pre-Flight Checklist

Before the agent runs for the first time, and before any large batch operation:

1. **Branch checkpoint.** Create a Supabase branch off `main` titled with today's date (e.g. `pre-agent-2026-04-27`). This is the snapshot you can roll back to if something goes wrong. Branches don't auto-sync — that's the point. The branch sits frozen at fork time, ready to restore from.
2. **Verify daily backups are running.** Supabase free tier gives you 7 daily snapshots automatically. Confirm in the Supabase dashboard → Project Settings → Backups that the last backup is <24h old.
3. **Cold archive (weekly).** Once a week, run a `pg_dump` of the production DB and save the `.sql` to Drive / iCloud / external. Independent of Supabase being available.
4. **Confirm staging columns exist.** The agent must never write directly to `artists.image_url`, `artists.bio`, `events.event_image_url`, or `events.artist_bio`. It writes to the `proposed_*` columns described in §13. If those columns don't exist yet, stop — the migration is a prerequisite.

---

## §2. The Data Model — What You Read, What You Write

### Artist row (`public.artists`)

| Field | Read or Write | Notes |
|---|---|---|
| `id` | read | UUID. Use as the FK target. |
| `name` | read | Canonical artist name. Don't change unless rename request explicit. |
| `alias_names` | read | Array of alternate names. Useful for matching. |
| `kind` | read + write | `'musician'` \| `'event'` \| `'billing'`. See §3. |
| `image_url` | **never write directly** | Final image URL. Lives behind the staging column. |
| `bio` | **never write directly** | Final bio. Lives behind the staging column. |
| `genres` | **never write directly** | Array of genre strings. Lives behind the staging column. |
| `vibes` | **never write directly** | Optional vibe tags. Same. |
| `is_human_edited` | read | If `true`, the field-level lock is active. Don't propose if existing value is non-blank. |
| `metadata_source` | write | Set to `'agent'` (not `'manual'` — that means human admin). |
| `triage_status` | write | `'needs_human'` \| `'agent_proposed'`. See §13. |
| `proposed_image_url` | write | Staging. Agent's image URL goes here. |
| `proposed_bio` | write | Staging. Agent's bio goes here. |
| `proposed_genres` | write | Staging. Agent's genre array goes here. |

### Event row (`public.events`)

| Field | Read or Write | Notes |
|---|---|---|
| `id` | read | UUID. |
| `event_title` | read | Title as it'll display. |
| `artist_id` | read | FK to artists table. May be null. |
| `artist_name` | read | Denormalized snapshot. |
| `event_image_url` | **never write directly** | Per-event image override. Behind staging column. |
| `artist_bio` | **never write directly** | Per-event bio snapshot. Behind staging column. |
| `is_locked` | read | Event-level lock (current source of truth). Don't propose into a non-blank locked field. |
| `is_human_edited` | read | Older lock column. Treat the same way until fully retired. |
| `template_id` | read | If non-null, the event inherits from a template. **You do not write event-level metadata when a template is linked.** Edit the template instead. |
| `proposed_event_image_url` | write | Staging. |
| `proposed_artist_bio` | write | Staging. |

### The metadata waterfall (front-end display order)

The front-end picks bio + image like this. Higher tier wins. **You write at the lowest tier that solves the problem.**

| Tier | Bio field | Image field | When you'd write here |
|---|---|---|---|
| 1 | `events.custom_bio` | `events.custom_image_url` | One-off override per event ("special guest tonight"). Rare. Humans only. |
| 2 | `event_templates.bio` | `event_templates.image` | Recurring event template. Edit the template, not the event. |
| 3 | `artists.bio` | `artists.image_url` | **Default home for musician metadata.** This is where you do most of your work. |
| 4 | `events.artist_bio` | `events.event_image_url` | Per-event snapshot. Used when `kind=event` (no artist FK). |
| 5 | (none) | `events.image_url` | Legacy scraper image. Treat as read-only. |
| 6 | (none) | `venues.image_url` | Final fallback. Don't write here. |

**Practical rule:**
- Musician with linked events → write to **artists** (Tier 3). All their events inherit.
- Standalone event with no artist FK → write to **events** (Tier 4).
- Event linked to a template → don't write at the event level. Update the template (or skip).

---

## §3. The `kind` Taxonomy

Every artists-table row has one of three values:

| `kind` | Definition | What you do |
|---|---|---|
| `musician` | A real, singular performer or band. | **This is your work queue.** Enrich bio, image, genres. |
| `billing` | A concatenated lineup ("Headliner w/ Opener 1, Opener 2"). | **Skip.** Do not write metadata. Optionally split into individual musician rows (see §10). |
| `event` | Not a performer at all (trivia night, drink special, family night, sip & shop). | **Skip.** These are decorative rows kept for FK preservation. |

**How to tell which:**

- **musician** — proper noun for a performer. "Aguilar Family Band", "Bobby Mahoney & The Seventh Son". Single act.
- **billing** — multiple acts joined by `,`, ` w/ `, `feat.`, `featuring`, `Presents`, or 2+ commas. "Tab Benoit w/ Ghalia Volt", "Sweet Lou and The River Rats with Dabble".
- **event** — describes an activity, not a performer. "Trivia Night", "$5 High Noons", "Family Night", "Karaoke 8pm every".

**Borderline cases:**

- `"X and the Y"` — could be a single band ("Toad the Wet Sprocket", "Tedeschi Trucks Band") or two acts ("Hump Day and The Mangos"). Default to single band UNLESS you can independently verify two distinct acts with discoverable web presence.
- A real artist's name buried inside a billing wrapper (`*Kegs & Eggs w/ Bullzeye Band*`) — the wrapper stays `kind='billing'` or `'event'`, but the inner artist deserves its own `kind='musician'` row. See §10.

When in doubt, mark `triage_status='needs_human'` and move on.

---

## §4. Image Sourcing Rules

You will source images only from the locations on this list. PostImages is your re-hosting layer (§5), not a source.

### Source priority — musicians

1. **Artist's own website.** Best signal. Look for `/about`, `/press`, `/photos`, `/bio` pages.
2. **Bandcamp.** Direct image URLs are stable.
3. **Last.fm.** We already cache Last.fm; the `enrichLastfm` library handles this.
4. **Bandsintown.** Artist profile pages.
5. **ReverbNation.** Especially useful for unsigned local acts.
6. **Press kit PDFs / EPKs.** If linked from the artist's site.

### Sources you do not use

- **Facebook / Instagram CDN URLs.** They expire. The image will display for a few hours then 404.
- **Google Images thumbnail URLs (`encrypted-tbn0.gstatic.com`).** Same — expire fast.
- **Stock-photo sites** (Shutterstock, Adobe Stock, Getty). Watermarks, licensing risk.
- **AI-generated images.** Never. Even when no other photo exists.
- **Photos from a *different* artist with the same name.** Verify before using.
- **Screenshots of band names overlaid on flyers.** That's an event flyer, not an artist photo.
- **The artist being tributed** (when you're enriching a tribute act). "Almost Santana" gets a photo of Almost Santana, not Santana.

### Image quality bar

Accept:
- Direct image URL ending in `.jpg`, `.jpeg`, `.png`, or `.webp`.
- Resolution at least 600px on the long edge.
- Subject visible (face or band lineup), in focus.
- Promotional photo style — band shots, headshots, live performance.

Reject:
- Watermarked images.
- Cartoon/clip-art/silhouettes.
- Heavily filtered or low-light shots where you can't tell who's in frame.
- Logos or text-only graphics for a band that has actual photos available.

If you cannot find an acceptable image after exhausting the sources above, leave `proposed_image_url` null and continue.

### Source priority — events (when `kind='event'` and you decide to enrich)

You generally **don't enrich events**. The only time you'd touch an event row's image is when:
- The event has no `artist_id` (truly artist-less event like a beer fest).
- The venue has no good fallback image.
- An admin specifically asks you to.

When you do, follow the existing prompt rules in `src/lib/aiLookup.js` lines ~474–491:
- Venue interior matching the event atmosphere, OR
- The food/drink item featured, OR
- A real (not stock) lifestyle photo matching the vibe.

### The image waterfall, in plain English

For an event-page display, the front-end picks an image like this:

> **If event has a custom image** → use it.
> **Else if event template has an image** → use it.
> **Else if event has `artist_id` and that artist has `image_url`** → use it. ← You'll write here for musicians.
> **Else if event has `event_image_url`** → use it. ← You'll write here for `kind='event'` rows missing an artist FK.
> **Else use the venue image.**

So the rule of thumb for events: **if `artist_id` is set, just enrich the artist — the event will inherit automatically.** Don't duplicate the image at the event level.

---

## §5. PostImages Workflow

You re-host every image you find. You don't write a third-party URL into the staging column directly. This protects the database from link rot when artists redesign their sites or social CDNs expire URLs.

**Steps:**

1. Find the image URL on a permitted source (§4).
2. Open https://postimages.org in a browser (or use the API, but the browser flow is more reliable for a launch-stage agent).
3. Click "Upload images" and either drag-drop the image, paste the URL, or upload from disk.
4. After upload, PostImages shows several URL formats. **Use the "Direct link" option** — it ends in `.jpg`/`.png`/`.webp`. Do not use the "Hotlink for forums" or "HTML thumbnail for websites" formats.
5. Verify the URL by opening it in a fresh incognito tab. If you see the image (not a webpage with the image embedded), it's correct.
6. The URL goes into `proposed_image_url`.

**Naming convention.** PostImages doesn't enforce filenames, but if you have control over the upload filename, use:

```
{artist-slug}.jpg
```

Where `artist-slug` is the artist's `name` lowercased, with non-alphanumeric characters replaced by hyphens, and consecutive hyphens collapsed. Examples:

| Artist name | Slug |
|---|---|
| Aguilar Family Band | `aguilar-family-band` |
| Bobby Mahoney & The Seventh Son | `bobby-mahoney-and-the-seventh-son` |
| Anthony² | `anthony-squared` |

For events: `{venue-slug}-{event-slug}.jpg` — e.g. `crossroads-april-fools-comedy-show.jpg`.

**Do not store passwords or login state.** PostImages allows anonymous uploads. If a session exists, that's fine; if not, anonymous works for our purposes.

---

## §6. Bio Writing Rules

The authoritative prompt lives in `src/lib/aiLookup.js` lines ~430–490. Read it. The rules below are excerpts plus a few additions.

### Hard caps

- **Maximum 250 characters.** Counts every character including spaces and punctuation. Enforced both in the prompt and via post-trim — but you should write to the cap, not rely on truncation.
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
- Where they're from (Jersey Shore region preferred when it applies).
- One distinguishing fact: residency, lineage, signature sound, instrumentation.

### Tone anchor

> "Encyclopedia entry, not marketing copy."

If the bio reads like it belongs in a press release, rewrite it.

### When data is insufficient

Return exactly the string `NEEDS_MANUAL_REVIEW` for the bio and set `triage_status='needs_human'`. Do not fabricate. Do not write a generic "A local favorite bringing live music to the stage" — that's the front-end's fallback when bio is null, and it's the right behavior to leave it null.

### Examples

**Good (Aguilar Family Band, 162 chars):**

> The Aguilar Family Band is a NJ father-son duo. Slick Aguilar is a former Jefferson Starship guitarist; son Mark joins on vocals and guitar for psychedelic rock sets.

**Bad (uses hype words, exceeds 250):**

> The legendary Aguilar Family Band brings electrifying, soul-stirring psychedelic rock to the Jersey Shore. With Slick Aguilar's mind-blowing guitar work from his Jefferson Starship days, this powerhouse father-son duo will leave you breathless. Don't miss them!

**Good (DJ, 134 chars):**

> Kevin Hill performs an open jam residency at The Pig & Parrot in Brielle, blending blues, rock, and R&B with rotating guest musicians.

**Bad (genre invention, hype, CTA, 218 chars but still wrong):**

> Kevin Hill is the most captivating DJ on the Jersey Shore, spinning legendary house, techno, drum & bass, and trance. Come out for an unforgettable Monday night you won't want to miss!

---

## §7. The Lock System

Three lock surfaces matter:

1. **`artists.is_human_edited`** — a JSON object keyed by field. `{ image_url: true, bio: false }` means the image is locked, the bio isn't. **Rule:** if a field is locked AND its current value is non-blank, never propose a change. If a field is locked AND its current value is blank, you may propose (Smart Fill exception, see `Agent_SOP.md`).

2. **`events.is_locked`** (current) and **`events.is_human_edited`** (legacy, dual-write transition). Treat both as event-row-level locks. Same rule: don't propose into a non-blank locked field.

3. **Template lock.** If `events.template_id` is non-null, the event inherits from a template. **You do not write at the event level.** If the template's metadata is wrong, propose at the template level (which we'll wire as a separate flow). For now: skip the event.

When you save a proposal, **do not flip locks.** Locks belong to the human admin. The admin flips them when they approve your proposal through the staging UI.

---

## §8. Workflow A — Enriching One Musician (Happy Path)

Step-by-step, with the specific decisions you make at each branch.

### Step 1 — Pull the row

Query `public.artists` for the next row where:

```
kind = 'musician'
  AND (image_url IS NULL OR bio IS NULL OR genres IS NULL OR array_length(genres, 1) = 0)
  AND triage_status IS DISTINCT FROM 'needs_human'
  AND (proposed_image_url IS NULL AND proposed_bio IS NULL)
ORDER BY (next-event-date ASC NULLS LAST), name
LIMIT 1
```

The ordering prioritizes artists with shows coming up soonest. Use the existing `enrichmentPriority.js` library if it's still relevant — it implements this logic.

### Step 2 — Disambiguate

Search the web for `"{artist name}" New Jersey music` (or `"... Asbury Park"`, `"... Jersey Shore"` depending on what works). Read the first 3–5 results. Confirm:

- The act is real and active (has any web presence in the last ~3 years).
- The act plays in the NJ Shore region or has an event scheduled here.
- You're looking at the *same* act, not a same-named act elsewhere.

If two equally-plausible candidates exist (the "Anthony" problem) and you cannot disambiguate by region: stop. Mark `triage_status='needs_human'`. Move on.

### Step 3 — Source the image

Walk the source priority list (§4). When you find an acceptable image, upload to PostImages (§5). If nothing acceptable: `proposed_image_url = null` and continue.

### Step 4 — Generate the bio

Use the LLM router (`callLLMWebGrounded` in `src/lib/llmRouter.js` — Perplexity primary, Gemini fallback). The system prompt is in `src/lib/aiLookup.js` lines ~430–490.

If the LLM returns `NEEDS_MANUAL_REVIEW`, leave `proposed_bio` null and set `triage_status='needs_human'`.

### Step 5 — Genre tags

The same prompt returns genre tags. Validate against the existing genre vocabulary in `src/components/admin/AdminArtistsTab.js` (the `GENRES` constant). Reject genres not in that list — suggest the closest valid one.

### Step 6 — Save the proposal

Update the row with:

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

**Do not** touch `image_url`, `bio`, `genres`, or `is_human_edited`. Tony approves through the admin UI.

### Step 7 — Log the action

Append to your run log (§14):

```
[ok] Aguilar Family Band — image: postimages/.../aguilar.jpg (bandcamp), bio: 162 chars, genres: [Rock, Psychedelic]
```

If skipped:

```
[skip-needs-human] Anthony² — multiple acts share the name; could not disambiguate by region
```

---

## §9. Workflow B — Handling a Billing Row

When you encounter `kind='billing'`:

1. **Do not enrich the billing row itself.** Skip it for metadata purposes.
2. **Optional: split.** If the billing name decomposes cleanly into N individual acts, you may create individual `kind='musician'` rows for each. Skip this on the first agent run; add it to a manual review queue first so Tony can confirm the splits.
3. **Optional: relink events.** If you split, the events that referenced the billing row should ideally be re-linked to the headliner. Don't do this autonomously yet.

Log:

```
[skip-billing] Tab Benoit w/ Ghalia Volt — flagged for manual split into "Tab Benoit" (headliner) + "Ghalia Volt" (opener)
```

---

## §10. Workflow C — Standalone Event Image (rare)

Only run this when:

- The event row has `artist_id IS NULL`.
- The event row has `template_id IS NULL`.
- The event row's images are all null.
- The event still warrants a custom image (e.g., a beer festival, comedy showcase).

Source from venue's social feeds, the event's own promotion page, or generic stock-style lifestyle photos (real photos only, never illustration). Upload to PostImages. Write to `proposed_event_image_url`. Set `triage_status='agent_proposed'` on the event.

---

## §11. Edge Cases

| Case | Rule |
|---|---|
| **Tribute / cover band** | `kind='musician'`. Bio mentions they tribute X. Image is of *this* act, never the original. |
| **Side project of a known artist** | `kind='musician'`. Bio mentions parent act. Image is of this project. |
| **Name collision** (multiple acts share a name) | If you cannot disambiguate by region in 60 seconds: `triage_status='needs_human'`. |
| **DJ** | `kind='musician'`. Bio uses "spins" or "performs" instead of "plays". |
| **Comedian at a music venue** | `kind='musician'` (so they show in the directory). Bio template skips genre, focuses on style + credits. |
| **"X and the Y" single-band names** | Default single band unless two distinct acts are independently verifiable. |
| **Resident DJ / weekly show host** | `kind='musician'` if they are a real performer; `kind='event'` if the row is the event name (e.g. "Throwback Thursdays w/ DJ Bill Regan" — that's the *event*, not the DJ). |
| **Festival or multi-day event with artists inside** | The festival itself goes in `event_series`, not `artists`. Individual performers stay in `artists` with `kind='musician'`. |

---

## §12. Verification Protocol

Before saving any proposal, the agent must answer YES to all of these:

- [ ] Have I confirmed this is the correct act (name + region)?
- [ ] Is the image from a permitted source and re-hosted on PostImages?
- [ ] Is the bio ≤250 characters?
- [ ] Is the bio free of every banned hype word?
- [ ] Is the bio third-person, present tense, no calls to action?
- [ ] Did I leave `image_url`, `bio`, `genres` (the real columns) untouched?
- [ ] Did I write to `proposed_*` columns and set `triage_status='agent_proposed'`?
- [ ] If anything was uncertain, did I instead set `triage_status='needs_human'` and leave the proposal blank?

If any answer is no, do not save. Roll back the local state and either retry the step or skip the row.

---

## §13. Staging Mechanism — How Proposals Reach Production

The agent never writes to the canonical `image_url` / `bio` / `genres` columns. It writes to staging columns:

| Canonical | Staging |
|---|---|
| `artists.image_url` | `artists.proposed_image_url` |
| `artists.bio` | `artists.proposed_bio` |
| `artists.genres` | `artists.proposed_genres` |
| `events.event_image_url` | `events.proposed_event_image_url` |
| `events.artist_bio` | `events.proposed_artist_bio` |

Plus the row's `triage_status` is set to `'agent_proposed'`.

The admin Artists tab (and Events tab) gets a **Review Queue** sub-tab that filters for `triage_status='agent_proposed'`. Each row shows the canonical and proposed fields side-by-side. The admin clicks **Approve** (copies proposed → canonical, sets `is_human_edited=true`, clears `proposed_*`, sets `triage_status='approved'`), **Reject** (clears `proposed_*`, sets `triage_status='needs_human'`), or **Edit & Approve** (lets the admin tweak the bio first, then approve).

This is a separate work item from the playbook. Sequence: ship the migration + admin tab first, then turn the agent on.

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

-- Ensure artists has triage_status (events already does, per existing schema).
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS triage_status triage_status_t DEFAULT 'pending';
```

---

## §14. Available Tools

### LLMs

- **Primary: Perplexity (`sonar-pro`).** Web-grounded. Best for finding facts about local NJ acts.
- **Fallback: Gemini.** When Perplexity is rate-limited or returns insufficient data.
- ~~Grok~~ — not subscribed. Don't reference.
- The router lives at `src/lib/llmRouter.js`. Use `callLLMWebGrounded(systemPrompt, userPrompt)` — failover is automatic.

### Existing endpoints

- `POST /api/admin/ai-enhance` — runs the existing enrichment pipeline against one row (musician or event). Routes through `callLLMWebGrounded`. Returns `{ bio, image_url, genres, source_url }`.
- `src/lib/enrichArtist.js` — universal enrichment waterfall (MusicBrainz → Discogs → Last.fm → AI fallback). Use this before falling through to a raw LLM call.
- `src/lib/enrichLastfm.js` — Last.fm-only path. Already cached.
- `src/lib/aiLookup.js` — the prompt definitions. Read but don't modify without coordinating with Tony.

### What's missing (open issues)

- The aiLookup prompts use the old two-class taxonomy (`MUSICIAN` / `VENUE_EVENT`). They predate the three-class schema (`musician` / `billing` / `event`). The agent should never invoke the prompt on a `kind='billing'` row. The prompt itself needs updating to recognize billings, but until then, the agent's pre-filter handles it.

---

## §15. Reporting Format

At the end of each run, the agent writes a session log to `logs/agent-runs/YYYY-MM-DD-HHMM.md` with this structure:

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

This log is the trail Tony reviews to spot patterns (e.g., "we keep failing on tribute bands because the prompt doesn't handle them well") and tune the playbook over time.

---

## §16. Escalation

Stop the agent and notify Tony if any of the following happens during a run:

- A migration is missing (the staging columns don't exist).
- A schema mismatch (e.g. `kind` enum doesn't match what this doc describes).
- Credentials fail (Perplexity quota exhausted, Gemini rate-limited and no failover available).
- More than 25% of rows in a batch are marked `needs_human` — indicates the disambiguation logic is over-triggering or the queue has too many edge cases.
- Any error path that would write to a canonical column instead of staging.

---

## §17. Versioning

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 2026-04-27 | Initial draft | Covers musicians/billings/events taxonomy, PostImages flow, staging mechanism. Pre-staging migration. |

When this document changes, bump the version and add a row. The agent reads §17 to verify it's running against the doc version it was trained on.
