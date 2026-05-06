# myLocalJam — Analytics Plan

> **Scope.** Active feature plan for PostHog-based product analytics. Requirements, status of each, and what's still open.
>
> **Originally drafted:** March 14, 2026
> **Last audited:** May 5, 2026
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

### REQ-A2: Core Metrics Dashboard (DAU, MAU, Session Length, Retention) 🟠 (Recipe shipped, awaiting Tony's UI clicks)

**Rationale:** All four metrics come free from PostHog once the SDK is initialized — no custom code needed. Requirement is to actually build the dashboard tiles in the PostHog UI.

**Dashboard tiles to create in PostHog UI:**
1. DAU/MAU Trend — `$pageview` unique users, daily + 30-day rolling.
2. Session Duration Distribution — histogram from session data.
3. Retention Curve — week-over-week (Day 0, 1, 7, 30).
4. Top Pages — breakdown of `$pageview` by `$current_url`.
5. Device/Browser Split — breakdown by `$browser` and `$device_type`.

**Files touched:** None (PostHog dashboard config only). Step-by-step recipe in `POSTHOG_SETUP.md`.

---

### REQ-A3: Custom Events — `spotlight_tapped` + `spotlight_impression` ✅ (Shipped May 5, 2026)

**`spotlight_tapped`** — User taps/clicks a spotlight card in the hero carousel. Properties: `event_id`, `artist_name`, `venue_name`, `position`, `slot_type` ('main' | 'runner_up'), `event_date`.

**`spotlight_impression`** — Fires when a slide becomes the active one (visible to the user). Same property shape. Pairs with `spotlight_tapped` so admin can compute CTR = taps / impressions.

**File:** `src/components/HeroSection.js`.

---

### REQ-A4: Custom Event — `filter_applied` ✅ (Shipped May 5, 2026)

**Trigger:** Two fire points on the main search modal — Search-button commit (`filter_type: 'search_committed'`) snapshots all current filters, and Clear filters (`filter_type: 'cleared_all'`).

**Properties:** `filter_type`, plus on commit: `has_search_query`, `search_query` (typed string, PII-guarded — see below), `date_key`, `date_picked`, `active_shortcut`, `miles_radius`, `venue_count`, `town_only`, `active_filter_count`.

**`search_query` PII guard (May 5 PM):** before capture, the typed query is rejected if it contains `@` (email-shaped) or matches `/^[0-9\-()\s.+]{7,}$/` (phone-shaped). Otherwise truncated to 64 chars and lowercased for aggregation. Powers the Top Searched Term admin tile (see Audience section below).

**Renamed companion:** `List Sorted/Filtered` (FollowingTab sort menu) → `following_list_sorted` for snake_case consistency.

**Files:** `src/app/page.js`, `src/components/FollowingTab.js`.

---

### REQ-A5: Custom Event — `event_bookmarked` ✅ (Shipped; renamed from spec, action property added May 5, 2026)

**Decision:** kept the shipped name `event_bookmarked` (instead of renaming to spec's `event_saved`) because of accumulated history in PostHog.

**Properties:** `event_id`, `artist_name`, `venue_name`, `action` ('saved' | 'unsaved').

**May 5, 2026 fix:** previously fired only on save. Now fires on both save and unsave with the `action` property so admin can measure abandoned saves.

**File:** `src/app/page.js`.

---

### REQ-A6: Custom Events — `add_to_jar_clicked` + `add_to_jar_submitted` ✅ (Shipped May 5, 2026)

**`add_to_jar_clicked`** fires once on modal mount (intent signal).

**`add_to_jar_submitted`** fires on successful POST. Properties: `method` ('poster' | 'manual'), plus on manual: `artist_name`, `venue_name`.

**File:** `src/components/SubmitEventModal.js`.

---

### REQ-A7: Funnel Analysis 🟠 (Recipe shipped, awaiting Tony's UI clicks)

**Funnel:** `$pageview → spotlight_tapped → event_bookmarked (action='saved') → user_signed_in`.

**Purpose:** Measures conversion from visitor → engaged → contributor.

**Files touched:** None (PostHog funnel config). Step-by-step recipe in `POSTHOG_SETUP.md` Part 2.

---

## Bonus events (shipped but not in original spec)

| Event | File | Notes |
|---|---|---|
| `$pageview` | PostHogProvider.js | Auto-fired by SDK; powers DAU/MAU. |
| `local_followed` | page.js | Artist follow action. **Renamed from `Local Followed` May 5, 2026.** |
| `user_signed_in` | page.js | Login event with `method` and `is_new_user`. **Renamed from `User Signed In` May 5, 2026.** |
| `venue_link_clicked` | EventCardV2.js, EventPageClient.js | Added April 27 with the venue-website fix. Includes `link_type: 'official' \| 'scraper_source'`. |
| `venue_map_clicked` | EventPageClient.js | Tracks share-page Map button taps. |
| `share_page_save_show` | EventPageClient.js | Save Show button tap on the share landing page (May 2 wire-up). |
| `share_page_follow_artist` | EventPageClient.js | Follow Artist button tap on the share landing page (May 2 wire-up). |
| `following_list_sorted` | FollowingTab.js | **Renamed from `List Sorted/Filtered` May 5, 2026.** |

---

## Open work, prioritized

1. ✅ **REQ-A4 + REQ-A5 reconciliation** — shipped May 5, 2026.
2. ✅ **REQ-A3 spotlight_tapped + spotlight_impression** — shipped May 5, 2026.
3. ✅ **REQ-A6 add_to_jar_clicked + add_to_jar_submitted** — shipped May 5, 2026.
4. 🟠 **REQ-A2 dashboards** — recipe in `POSTHOG_SETUP.md`, awaiting Tony's UI clicks.
5. 🟠 **REQ-A7 funnel** — recipe in `POSTHOG_SETUP.md`, awaiting Tony's UI clicks.
6. ✅ **Naming normalization** — `local_followed`, `user_signed_in`, `following_list_sorted` shipped May 5, 2026.

## Admin dashboard — Audience section (May 5, 2026)

Seven tiles, each driving a specific admin decision. All powered by HogQL queries in `src/app/api/admin/analytics/route.js`. Range-aware (Today / 7d / 30d / All).

| Tile | Source | What it tells you |
|---|---|---|
| Activation Rate | engagement events / `$pageview` distinct person_ids | The PMF watch metric. <10% = problem; 30%+ = nailed it. |
| Spotlight CTR | `spotlight_tapped` / `spotlight_impression` raw counts | Carousel engagement. Read with auto-rotation caveat — see PARKED #9 for the dedup-when-volume-justifies note. |
| Top Referrer | `$referring_domain` autocapture, dedup by person, NJ-self filtered | Acquisition channel. `$direct` = no-referrer (typed URL, iMessage, etc.). |
| Top Non-NJ State | `$geoip_subdivision_1_code` autocapture, dedup by person, excludes NJ | Out-of-state traffic source. NY/PA = commuter / vacation; random = potential bot. **Replaced the original NJ % tile (May 5 PM)** because for a Jersey-Shore-specific product the answer was always "mostly NJ" — uninformative. |
| Top Searched Term | `properties.search_query` from `filter_applied`, lowercased, PII-guarded | Content-backlog signal — what users want indexed. |
| Top Saved Artist | `properties.artist_name` from `event_bookmarked` (saves only) | Content patterns for spotlight / promotion decisions. |
| New vs Returning | min(timestamp) vs cutoff over 30-day inner window | Retention signal. New = first-ever pageview in window. |

## Deferred

- **Off-by-one bookmark drift investigation** — at current volume (5/day) we can't distinguish a real drift from one user's double-tap. Revisit when volume hits ~50/day. See May 5 audit notes in HANDOVER.

---

## What moved out of this doc

The original `ARCHITECTURE-PLAN.md` mixed two unrelated feature areas. The submission/approval workflow content (formerly Category 2 here, REQ-E1 through E4) has been split out:

- **Canonical submission → approval → publication flow** (state model + invariants) → documented in `DATA_LIFECYCLE.md`.
- **Open bug-fix REQs** (E1 reject button wiring, E2 approve-updates-status, E3 Discord webhook) → tracked in `PARKED.md`.

This doc is now focused on analytics only.
