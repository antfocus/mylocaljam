# myLocalJam — Analytics Plan

> **Scope.** Active feature plan for PostHog-based product analytics. Requirements, status of each, and what's still open.
>
> **Originally drafted:** March 14, 2026
> **Last audited:** April 27, 2026
>
> **Companion docs.** Once analytics events are wired up, `DATA_LIFECYCLE.md` covers how user actions move data through the system. This doc is purely about *what we measure and why*, not about state changes the events trigger.

---

## Status legend

- ✅ **Shipped** — implemented and live in production.
- 🟡 **Diverged** — shipped under a different name or shape than originally specified. Either rename to spec, or update spec to match shipped.
- 🟠 **Partial** — pieces are in but the requirement isn't fully satisfied.
- ⏳ **Open** — not yet implemented.
- 🚫 **Dropped** — explicitly deferred or replaced.

---

## Category 1: Analytics & Metrics Integration

### REQ-A1: Analytics Platform — PostHog ✅

**Rationale:** PostHog over GA4/Mixpanel — 1M events/month free tier, better button-level click tracking, built-in funnels, cookieless mode (no consent banner needed).

**Implemented:** `posthog-js` installed, `src/components/PostHogProvider.js` provides the SDK initialization, `mlj_device_id` from localStorage threads through as the distinct ID. Env vars `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` configured.

**Files:** `src/components/PostHogProvider.js`, `src/app/layout.js`, `package.json`, `.env.local`.

---

### REQ-A2: Core Metrics Dashboard (DAU, MAU, Session Length, Retention) ⏳

**Rationale:** All four metrics come free from PostHog once the SDK is initialized — no custom code needed. Requirement is to actually build the dashboard tiles in the PostHog UI.

**Dashboard tiles to create in PostHog UI:**
1. DAU/MAU Trend — `$pageview` unique users, daily + 30-day rolling.
2. Session Duration Distribution — histogram from session data.
3. Retention Curve — week-over-week (Day 0, 1, 7, 30).
4. Top Pages — breakdown of `$pageview` by `$current_url`.
5. Device/Browser Split — breakdown by `$browser` and `$device_type`.

**Files touched:** None (PostHog dashboard config only).

---

### REQ-A3: Custom Event — `spotlight_tapped` ⏳

**Trigger:** User taps/clicks a spotlight card in the hero carousel.

**Properties:** `event_id`, `artist_name`, `venue_name`, `position` (0–4), `event_date`.

**File:** `src/components/HeroSection.js` — add `posthog.capture?.('spotlight_tapped', {...})` inside carousel card onClick.

---

### REQ-A4: Custom Event — `filter_applied` 🟡

**Original spec:** Single event named `filter_applied` fired on any filter change with `filter_type`, `filter_value`, `active_filters` properties.

**As shipped:** Captured as `List Sorted/Filtered` (different name, different shape) in `src/components/FollowingTab.js` only. The main filter bar in `SearchFilterRedesign.js` / `FilterBar.js` does NOT emit a filter event yet.

**Resolution path:** either rename `List Sorted/Filtered` → `filter_applied` and extend coverage to the main filter bar, or update this REQ to match the shipped name and acknowledge the gap on the main filter bar. Recommendation: rename + extend, because the current shape leaks the implementation detail (component name) into the event vocabulary.

**Files:** `src/components/SearchFilterRedesign.js`, `src/components/FilterBar.js`, `src/components/FollowingTab.js`.

---

### REQ-A5: Custom Event — `event_saved` 🟡

**Original spec:** Event `event_saved` fired on heart/save tap with `event_id`, `artist_name`, `venue_name`, `genre`, `action` ('saved' or 'unsaved').

**As shipped:** Captured as `event_bookmarked` in `src/app/page.js:787`. Same intent, different name.

**Resolution path:** rename `event_bookmarked` → `event_saved` to match the spec, or update spec to match shipped. Recommendation: keep `event_bookmarked` (it's already in the data warehouse with history) and update this REQ to reflect.

**File:** `src/app/page.js`.

---

### REQ-A6: Custom Event — `add_to_jar_clicked` ⏳

**Trigger:** Two tracking points — modal open (intent) and form submit (completion).

**Properties (open):** `source` (which UI element triggered the modal).
**Properties (submit):** `artist_name`, `venue_name`, `genre`, `has_email`.

**File:** `src/components/SubmitEventModal.js` — add `posthog.capture?.('add_to_jar_clicked', {...})` on open, `add_to_jar_submitted` on successful POST.

---

### REQ-A7: Funnel Analysis ⏳ (blocked on A3, A6)

**Funnel:** `$pageview → spotlight_tapped → event_saved → add_to_jar_clicked`.

**Purpose:** Measures conversion from visitor → engaged → contributor.

**Files touched:** None (PostHog funnel config). Cannot be built until A3 and A6 ship.

---

## Bonus events (shipped but not in original spec)

The following events were added during ad-hoc work and aren't tracked above. Either add formal REQ rows for them or accept them as "implementation details we can query against."

| Event | File | Notes |
|---|---|---|
| `$pageview` | PostHogProvider.js:20 | Auto-fired by SDK; powers DAU/MAU. |
| `Local Followed` | page.js:909 | Artist follow action. Title-case naming diverges from the snake_case convention for other custom events — worth normalizing. |
| `User Signed In` | page.js:1292 | Login event with `method` and `is_new_user`. Same naming inconsistency as above. |
| `venue_link_clicked` | EventCardV2.js:568, EventPageClient.js:442 | Added April 27 with the venue-website fix. Includes `link_type: 'official' \| 'scraper_source'` to track whether the user reached the venue's own site or fell back to the scraper origin. |

**Recommendation:** standardize on snake_case event names (`local_followed`, `user_signed_in`) for consistency. Renames break dashboard history, so do this once, after A3/A6 ship, in a single coordinated rename pass.

---

## Open work, prioritized

1. **REQ-A4 + REQ-A5 reconciliation** — decide rename direction, update the spec or the code, ship the gap on the main filter bar.
2. **REQ-A3 spotlight_tapped** — small, one-component change.
3. **REQ-A6 add_to_jar_clicked** — small, one-component change.
4. **REQ-A2 dashboards** — PostHog UI work, no code, can happen any time.
5. **REQ-A7 funnel** — depends on A3 and A6.
6. **Naming normalization** — once A3 and A6 ship, sweep all event names to snake_case in one PR.

Total remaining effort: ~30 minutes of code + 30 minutes of PostHog dashboard config.

---

## What moved out of this doc

The original `ARCHITECTURE-PLAN.md` mixed two unrelated feature areas. The submission/approval workflow content (formerly Category 2 here, REQ-E1 through E4) has been split out:

- **Canonical submission → approval → publication flow** (state model + invariants) → documented in `DATA_LIFECYCLE.md`.
- **Open bug-fix REQs** (E1 reject button wiring, E2 approve-updates-status, E3 Discord webhook) → tracked in `PARKED.md`.

This doc is now focused on analytics only.
