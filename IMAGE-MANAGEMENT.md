# myLocalJam — Image Management Skill

> **Skill scope.** Sourcing, validating, re-hosting, and linking images for artists and events. Only image work. Bios, classification, genre tagging, and pipeline orchestration live in `ENRICHMENT.md`.
>
> **Companion docs.** `ENRICHMENT.md` is the parent skill that calls into this one. When an enrichment workflow hits an image step, it follows this doc. `FRONTEND_SOP.md` covers how images render on the page (`object-fit`, `object-position`, etc.); this doc stops at "image URL is saved to the right field."

---

## §1. Quality bar

Three rules before anything else:

1. **Blank > mediocre.** A monogram avatar is fine. A wrong photo is not.
2. **Verify, don't guess.** If you can't tell whether the photo is *this* artist or another act with the same name, stop and mark `triage_status='needs_human'`.
3. **Re-host everything.** Never write a third-party URL into the database directly. Source online → upload to PostImages → write the PostImages URL.

---

## §2. Permitted sources

Walk this list in order. Stop at the first source that yields an acceptable image (§3).

### For artists (`kind='musician'`)

1. **Artist's own website.** Look for `/about`, `/press`, `/photos`, `/bio`, `/epk`. Best signal — the artist chose this image to represent themselves.
2. **Bandcamp.** Profile banner or release artwork that's actually a band photo.
3. **Last.fm.** We already cache Last.fm via `enrichLastfm.js`. Use existing cache before re-fetching.
4. **Bandsintown.** Artist profile pages.
5. **ReverbNation.** Especially useful for unsigned local NJ acts.
6. **Press kit PDFs / EPKs.** If linked from the artist's site.

### For events (`kind='event'` rows that need their own image — rare)

Only enrich event-level images when the event has no `artist_id` AND no `template_id` AND the venue fallback isn't appropriate (e.g., a beer festival).

1. **Venue's own website / social.** A real photo of the event's atmosphere.
2. **The food/drink item** photographed (for specials).
3. **Generic real-photo lifestyle shots** matching the vibe (real trivia-night crowd, real burger photo). Never illustration.

---

## §3. Banned sources

Hard-no list. The agent must reject these even when they look convenient.

| Source | Why |
|---|---|
| **Facebook / Instagram CDN URLs** (`scontent-*.fbcdn.net`, `cdninstagram.com`) | Expire within hours. The image will 404 by tomorrow. |
| **Google Images thumbnails** (`encrypted-tbn0.gstatic.com`) | Same — short-lived. |
| **Stock-photo sites** (Shutterstock, Adobe Stock, Getty, iStock) | Watermarks, licensing risk. |
| **AI-generated images** | Never, even when no other photo exists. |
| **Photo of the band being tributed** when enriching a tribute act | "Almost Santana" gets a photo of Almost Santana, not Santana. |
| **Photo of a same-named act from a different region** | Verify before using. |
| **Screenshots of band names overlaid on event flyers** | That's an event flyer, not an artist photo. |
| **Cartoons, clip-art, silhouettes** | Even if the band uses them as a brand mark; we want a real photo. |
| **Wikipedia thumbnails (`upload.wikimedia.org/.../<size>px-...`)** | Use the full-size version (drop the `<size>px-` prefix), not the thumbnail. |

---

## §4. Quality bar — accept / reject

### Accept
- Direct image URL ending in `.jpg`, `.jpeg`, `.png`, or `.webp`.
- Resolution at least 600px on the long edge.
- Subject visible and in focus (face or band lineup, or for events the activity/item).
- Promotional, live, or candid photo style.

### Reject
- Webpage URL (HTML page, not an image file).
- Watermarked images.
- Heavily filtered or low-light shots where you can't identify the subject.
- Logos or text-only graphics for an artist that has actual photos available elsewhere.
- Anything you don't have ≥90% confidence about ("is this even the right person?").

When the source has multiple photos, prefer in this order:
1. Full band lineup (for groups)
2. Live performance shot
3. Studio/promo headshot
4. Logo or brand mark (last resort)

---

## §5. PostImages workflow

You re-host every image. This protects the database from link rot when artists redesign their sites or social CDNs expire URLs.

### Steps

1. Find the image URL on a permitted source (§2).
2. Open https://postimages.org in a browser.
3. Click "Upload images". Drag-drop the image, paste the URL, or upload from disk.
4. After upload, PostImages shows several URL formats. **Use the "Direct link" option** — the URL ends in `.jpg`/`.png`/`.webp`. Do not use "Hotlink for forums", "HTML thumbnail", or the page link.
5. Verify the URL by opening it in a fresh incognito tab. If you see the image (not a webpage with the image embedded), it's correct.
6. The verified URL goes into `proposed_image_url` (artists) or `proposed_event_image_url` (events).

### Naming convention

PostImages doesn't enforce filenames, but if you control the upload filename, use:

```
{slug}.jpg
```

Where `slug` is lowercased, non-alphanumeric replaced with hyphens, consecutive hyphens collapsed.

| Subject | Slug |
|---|---|
| Aguilar Family Band | `aguilar-family-band` |
| Bobby Mahoney & The Seventh Son | `bobby-mahoney-and-the-seventh-son` |
| Anthony² | `anthony-squared` |
| Kevin Hill - Secret Sound Check | `kevin-hill-secret-sound-check` |

For events: `{venue-slug}-{event-slug}.jpg` — e.g. `crossroads-april-fools-comedy-show.jpg`.

### Login state

Anonymous uploads are fine. If a PostImages account session exists, that's a bonus (lets you organize uploads), but don't require login.

---

## §6. The image waterfall — which field to write to

The front-end picks an image to display in this order. **Higher tier wins.** You write at the lowest tier that solves the problem.

| Tier | Field | When you'd write here |
|---|---|---|
| 1 | `events.custom_image_url` | One-off override per event ("special guest tonight"). Rare; humans only. |
| 2 | `event_templates.image` | Recurring event template. Edit the template, not the event. |
| 3 | `artists.image_url` | **Default home for musician images.** All linked events inherit. |
| 4 | `events.event_image_url` | Per-event image override. Used when `kind='event'` and there's no artist FK. |
| 5 | `events.image_url` | Legacy scraper field. Read-only. |
| 6 | `venues.image_url` | Final fallback. Don't write here. |

### Practical rules

- **Musician with linked events** → write to `artists.image_url`. Every event by that artist inherits automatically. Most of your work is here.
- **Standalone event with no artist FK** → write to `events.event_image_url`.
- **Event linked to a template** → don't write at the event level. The template controls the image. Update the template (separate workflow).
- **Same artist appears at 12 different venues** → still just write once to `artists.image_url`. The waterfall handles inheritance.

### Don't duplicate work

Before writing, check whether the image is already inherited from a higher or lower tier. If `artists.image_url` already has a good photo and `events.artist_id` is set on the event you're looking at, the event will display the artist photo automatically. **Don't add a redundant `event_image_url`** — it'll override your artist photo and you'll have to update both forever.

---

## §7. Edge cases

### Tribute / cover bands

Treat as `kind='musician'`. **Image must be of the tribute act, not the original.** "Almost Santana" gets Almost Santana's promo photo. The bio mentions they tribute Santana (that's bio's job, not images).

If the only photo you can find for "Almost Santana" is a Santana photo, mark `triage_status='needs_human'`. Do not use the original artist's photo.

### Side projects

A real artist's project under a different name (e.g., "Greg Attonito of The Bouncing Souls"). Image is of *this* project, not the parent act. If the project shares photos with the parent act, that's fine — but verify.

### DJs

Image is of the DJ. Promo shots are usually fine. If only event flyers exist (DJ name overlaid on a club photo), keep looking — flyer != portrait.

### Comedians at music venues

Headshot or stand-up performance photo. Avoid event flyers with their name written across them.

### Festivals / multi-day events

Don't write at the artists table — festivals live in `event_series`. Festival logo or hero image goes on the series row, not on individual events. (See `SERIES_AUTOMATCH.md`.)

### Same-name disambiguation

If "Anthony" could be three different acts and you can't tell which is playing the venue: stop. Mark `triage_status='needs_human'`. Picking the wrong photo is worse than having no photo.

---

## §8. Verification checklist

Before saving any image proposal, the agent must answer YES to all of these:

- [ ] Is the image from a permitted source (§2), not a banned one (§3)?
- [ ] Is it a direct file URL ending in `.jpg`/`.jpeg`/`.png`/`.webp`?
- [ ] Resolution ≥600px on the long edge?
- [ ] Have I verified this is the *right* artist (name + region match)?
- [ ] If it's a tribute act, is the photo of the tribute act, not the original?
- [ ] Did I re-host through PostImages (the URL is on `postimg.cc` or `i.postimg.cc`, not the original source)?
- [ ] Am I writing to the lowest waterfall tier that solves the problem (`artists.image_url` for musicians)?
- [ ] Did I write to `proposed_image_url`, not `image_url`? (The agent never writes canonical fields directly. See `ENRICHMENT.md` §13 for the staging mechanism.)

If any answer is no, do not save. Re-run the step or skip the row with `triage_status='needs_human'`.

---

## §9. Reporting

Log every image action in the per-session log (`logs/agent-runs/YYYY-MM-DD-HHMM.md`). Format:

```
[image-ok]   Aguilar Family Band      bandcamp → postimg.cc/abc123/aguilar-family-band.jpg
[image-skip] DJ Smith                 multiple acts share name; flagged needs_human
[image-fail] The Foes of Fern         no acceptable source found after exhausting tiers
```

Counts roll up at the end of the session into the summary block (see `ENRICHMENT.md` §15).

---

## §10. Versioning

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-04-27 | Initial. Split off from AGENT-METADATA-PLAYBOOK.md when scope was narrowed to images only. |
