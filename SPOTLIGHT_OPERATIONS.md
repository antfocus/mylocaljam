# myLocalJam — Spotlight Operations Skill

> **Skill scope.** Operating the Spotlight admin tab and the public hero carousel. Pin model, slot lifecycle, autopilot tiers, source tracking (manual vs suggested), staging discipline, image-quality gates, and common admin operations.
>
> **Companion docs.** Image enrichment for spotlight cards lives in `IMAGE-MANAGEMENT.md` (the image waterfall + PostImages rule). Bio/category resolution flows through `ENRICHMENT.md` (the metadata waterfall). UI rendering conventions live in `FRONTEND_SOP.md`. The data invariants this skill respects are in `DATA_LIFECYCLE.md` §3.
>
> **Code surface.** Admin: `src/components/admin/AdminSpotlightTab.js`, `src/hooks/useAdminSpotlight.js`. Public: `src/app/api/spotlight/route.js`, `src/components/HeroSection.js`. Persistence: `spotlight_events` table.

---

## §1. The slot model

The Spotlight has **8 slots in a dense pin list** (no gaps). Slot semantics:

- **Slots 0–4 = Main Spotlight.** What users see in the hero carousel. Live on the public site. Five slots, ranked by admin order (or autopilot ranking when admin doesn't pin).
- **Slots 5–7 = Runner-Ups.** Admin staging area. NOT displayed on the public hero. Three slots. Used to queue candidates the admin wants to vet, swap into Main later, or hold in reserve.

Code constants:

- `MAX_PINS = 8` (in `useAdminSpotlight.js`) — the dense pin list cap.
- `AUTOPILOT_CAP = 5` (in `/api/spotlight/route.js`) — autopilot fills only Main, never Runner-Ups.
- `MAX_SLOTS = 5` for public callers, `8` when admin caller passes `?all_pins=true`.

The pin list is dense. There is no "empty slot 5 while slot 4 is also empty" — slots fill in order. A row's index in the pin array IS its slot number.

---

## §2. Autopilot tiers (server-side)

When the admin hasn't pinned 5 events for a date, `/api/spotlight/route.js` autopilots the rest. Tiers are evaluated in order; within a tier, ranked by favorite count (desc) then start time (asc).

- **Tier 0 — Sacred.** Admin pins from `spotlight_events`, in admin order. Always respected. Pinning two of the same artist is allowed — admin override beats de-dup.
- **Tier 1 — Hero image.** Events with a real hero-quality image: `events.event_image_url`, `custom_image_url`, legacy `image_url`, or a linked `artists.image_url`. The visually strongest candidates.
- **Tier 2 — Venue photo.** Events with only a `venues.photo_url` (no hero image). Visually workable, less specific.
- **Tier 3 — Template image.** Events with only `event_templates.image_url` (generic category stock art). Last resort.
- **No-image events are skipped entirely.** Better to show 4 cards than 5 with a blank.

De-dup: an artist appears at most once in the 5 visible slots (manual pins seed the seen-set; autopilot won't add another show by the same artist on top of an admin pin for that artist). Manual pins themselves are not blocked by de-dup.

---

## §3. Source tracking — manual vs suggested

Every pin carries a `source` flag in `spotlight_events`:

- **`manual`** — admin explicitly placed this pin (drag-to-slot, ☆ star, or kept an autopilot suggestion). Renders as a solid card in the admin UI.
- **`suggested`** — autopilot picked this; admin hasn't touched it. Renders as a DRAFT card (dashed border, DRAFT badge) so the admin can see what's auto vs deliberate.

Auto-promotion: any mutation through `commitPins` flips every current pin to `manual`, because `spotlight_events` has no concept of a draft row. Touching a slot makes the whole list manual.

The public route doesn't care about source — both render identically on the hero. The admin UI uses `spotlightSources[eventId]` to differentiate.

---

## §4. Staging discipline (the ☆ star contract)

The ☆ star button on each event row in the admin table is a **stage-to-Runner-Ups** action. It does NOT publish to the live feed, ever.

Behavior:

- Already pinned → unpin (toggle off).
- New pin, Main has empty slots (`prev.length < 5`) → **refuse** with banner: "Main Spotlight has N empty slots. Fill them via drag-to-slot first." The pin list is dense, so we can't slide into Runner-Up territory while Main has gaps.
- New pin, Main full and Runner-Ups have room (`5 ≤ prev.length < 8`) → append to end (lands in slot 5, 6, or 7).
- New pin, all 8 slots full → **refuse** with banner: "All 3 Runner-Up slots are full. Clear or promote a Runner-Up before staging another."

Drag-to-slot (DnD) is the only way to put something into Main slots 0–4. Drag is an explicit admin action; ☆ is a "save for review" action. Two distinct UX intents.

When the discipline matters: the public hero updates as soon as the pin list mutates (revalidatePath fires in the POST handler). A misclick on ☆ that landed something in slot 0 would change what users see immediately. The Runner-Up gate prevents that class of accident.

---

## §5. Image warnings

When an admin attempts to add an event whose images are all blank or low-quality, `useAdminSpotlight` raises a `spotlightImageWarning`. The admin sees a confirmation modal with "this event has no hero image — pin anyway?" and can proceed if they want.

This is a soft gate, not a refusal. Pin still happens after acknowledgment via `toggleSpotlightPin(spotlightImageWarning.id)`. **Note:** that path now goes through the staging gate (§4), so an acknowledged image warning when Main has empty slots will still be refused with the staging banner. That's the right behavior — the image warning and the staging discipline are independent guards.

For sourcing or curating images for spotlight-eligible artists, see `IMAGE-MANAGEMENT.md`.

---

## §6. Common operations

### Pin a deliberate Main slot

Drag the event row from the candidate list onto the specific Main slot you want (0–4). The slot accepts and the rest of the list shifts down. If the list is full, the last entry slides off the bottom.

### Stage a Runner-Up

Click the ☆ star on the event row. Confirmation modal appears: "Stage to Runner-Ups?" → confirm → lands in the next empty Runner-Up slot. Refused if Main isn't full.

### Promote a Runner-Up to Main

Drag the Runner-Up card up into a Main slot. Same reorder semantics as any drag.

### Unpin

Click the ☆ on a pinned event row (toggles off), drag the slot card off the strip, or click ✕ on the slot.

### Clear all pins for a date

Use the "Clear" action in the admin tab header. Wipes `spotlight_events` rows for that date; autopilot will refill Main on next public hero load.

### Bulk auto-fill via Magic Wand

The ✨ button on the date row enriches every event for that date (bio, image, genre) via the LLM router. Different action from pinning — see `ENRICHMENT.md`.

### Single-event Magic Wand

The ✨ button on each event card runs the same enrichment for one event only. State tracked per-card in `enrichingEventIds` (Set) and `singleEnrichErrors`.

---

## §7. Persistence + caching

- **Auto-save debounce.** Pin mutations don't fetch the global admin state — `commitPins` debounces a POST to `/api/spotlight` so rapid reorders collapse into a single write. Optimistic UI; rollback ref captures pre-mutation state for restore on failure.
- **Public cache invalidation.** The POST handler calls `revalidatePath` on the hero route, so visitors see admin changes without a manual refresh.
- **Cache guards on the GET.** `dynamic = 'force-dynamic'`, `revalidate = 0`, `fetchCache = 'force-no-store'` — prevents Next.js Data Cache and Vercel Edge Cache from replaying stale spotlight responses. (These exports were added after the 7:12 PM Mariel "Heisenbug" — see HANDOVER.)

---

## §8. Open work + cross-references

- **Smart Curator improvements** — autopilot tier ranking is currently favorite-count then start-time. Other signals worth experimenting with: artist follower count, recency of admin curation, event_series membership.
- **Promote-to-Main button on Runner-Ups** — today the only way to promote is drag. A button shortcut would be friendlier on mobile.
- **Bulk slot operations** — clear-all-Runner-Ups, swap Main↔Runner-Ups, etc. Probably not needed at current scale; revisit if the queue gets noisy.

**See also:**

- `useAdminSpotlight.js` — pin list state, `toggleSpotlightPin`, `insertPin`, `reorderPins`, `removePin`, debounced auto-save.
- `/api/spotlight/route.js` — public GET (autopilot tiers, dedup, image classification) + admin POST (persist `spotlight_events`, revalidate hero).
- `DATA_LIFECYCLE.md` §3 invariants — system-wide rules this skill respects.
- `IMAGE-MANAGEMENT.md` — image sourcing for spotlight cards.
- `ENRICHMENT.md` — Magic Wand bulk + single-event enrichment.
