# MyLocalJam — Architecture Plan: Analytics & Approval Workflow

> **Status:** Requirements gathering (not yet implemented)
> **Last updated:** March 14, 2026

---

## Category 1: Analytics & Metrics Integration

### REQ-A1: Analytics Platform — PostHog

**Rationale:** PostHog over GA4/Mixpanel — 1M events/month free tier, better button-level click tracking, built-in funnels, cookieless mode (no consent banner needed).

**Implementation:**
- Install `posthog-js`, create `src/lib/analytics.js` with `initAnalytics()`, `trackEvent()`, `identifyDevice()`
- Add `<AnalyticsProvider>` wrapper in `src/app/layout.js`
- Re-use existing `mlj_device_id` from localStorage for user continuity
- Env vars: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

**Files touched:** `package.json`, `.env.local`, NEW `src/lib/analytics.js`, `src/app/layout.js`

---

### REQ-A2: Core Metrics Dashboard (DAU, MAU, Session Length, Retention)

**Rationale:** All four metrics come free from PostHog once the SDK is initialized — no custom code.

**Dashboard tiles to create in PostHog UI:**
1. DAU/MAU Trend — `$pageview` unique users, daily + 30-day rolling
2. Session Duration Distribution — histogram from session data
3. Retention Curve — week-over-week (Day 0, 1, 7, 30)
4. Top Pages — breakdown of `$pageview` by `$current_url`
5. Device/Browser Split — breakdown by `$browser` and `$device_type`

**Files touched:** None (PostHog dashboard config only)

---

### REQ-A3: Custom Event — `spotlight_tapped`

**Trigger:** User taps/clicks a spotlight card in the hero carousel.

**Properties:** `event_id`, `artist_name`, `venue_name`, `position` (0–4), `event_date`

**File:** `src/components/HeroSection.js` — add `trackEvent('spotlight_tapped', {...})` inside carousel card onClick

---

### REQ-A4: Custom Event — `filter_applied`

**Trigger:** Any filter value changes (genre, vibe, venue, date, search text).

**Properties:** `filter_type`, `filter_value`, `active_filters` (snapshot of all current filters)

**File:** `src/components/SearchFilterRedesign.js` (and/or `FilterBar.js`) — add `trackEvent('filter_applied', {...})` inside each filter onChange

---

### REQ-A5: Custom Event — `event_saved`

**Trigger:** User taps the heart/save button on an event card.

**Properties:** `event_id`, `artist_name`, `venue_name`, `genre`, `action` ('saved' or 'unsaved')

**File:** `src/components/EventCardV2.js` — add `trackEvent('event_saved', {...})` inside heart button onClick

---

### REQ-A6: Custom Event — `add_to_jar_clicked`

**Trigger:** Two tracking points — modal open (intent) and form submit (completion).

**Properties (open):** `source` (which UI element triggered the modal)
**Properties (submit):** `artist_name`, `venue_name`, `genre`, `has_email`

**File:** `src/components/SubmitEventModal.js` — add `trackEvent('add_to_jar_clicked', {...})` on open, `trackEvent('add_to_jar_submitted', {...})` on successful POST

---

### REQ-A7: Funnel Analysis

**Funnel:** `$pageview → spotlight_tapped → event_saved → add_to_jar_clicked`

**Purpose:** Measures conversion from visitor → engaged → contributor.

**Files touched:** None (PostHog funnel config only, created after REQ-A3 through REQ-A6 are live)

---

## Category 2: Event Submission & Approval Workflow

### REQ-E1: Fix Reject Button (Bug)

**Current state:** The Reject button in the admin Submissions tab has an empty `onClick` handler (line ~420 of `admin/page.js`).

**Fix:** Wire it to `PATCH /api/submissions` with `{ id: sub.id, status: 'rejected' }`, add confirmation dialog.

**Also required:** Add a `PATCH` handler to `src/app/api/submissions/route.js` (currently only has `GET` and `POST`).

**Files touched:** `src/app/admin/page.js`, `src/app/api/submissions/route.js`

---

### REQ-E2: Approve Should Update Submission Status (Bug)

**Current state:** The Approve button creates a new event in the `events` table (status: published) but does NOT update the submission's own status from `pending` to `approved`. This means approved submissions still show as pending in the admin list.

**Fix:** After the `POST /api/admin` call in the Approve handler, add a `PATCH /api/submissions` call to set `status: 'approved'`.

**Files touched:** `src/app/admin/page.js`

---

### REQ-E3: Admin Notification on New Submission

**Recommendation:** Discord Webhook (zero infrastructure, free forever, instant alerts).

**Implementation:** After successful insert in `POST /api/submissions`, fire a `fetch()` to Discord webhook URL with an embed containing artist name, venue, date, genre, and a link to the admin panel.

**Alternative:** Resend (email) — `npm install resend`, 100 emails/day free tier. Sends formatted email to `ADMIN_EMAIL` env var.

**Env vars:** `DISCORD_WEBHOOK_URL` (or `RESEND_API_KEY` + `ADMIN_EMAIL`)

**Files touched:** `src/app/api/submissions/route.js`, `.env.local`

---

### REQ-E4: Database Schema (Already Complete)

**Current state — no changes needed:**
- `submissions` table already has `status: 'pending' | 'approved' | 'rejected'`
- `events` table already gates public feed on `status = 'published'`
- User submissions via "Add to the Jar" already default to `pending`
- Only `approved` → `published` events render on the public feed

---

## Architecture Diagram

```
User Actions                    Analytics Pipeline
─────────────                   ──────────────────
Spotlight Tap ──┐
Filter Apply ───┤               ┌──────────────┐
Event Save ─────┼──trackEvent──▶│   PostHog    │──▶ Dashboard
Add to Jar ─────┘               │  (Cloud)     │    (DAU/MAU/Funnels)
                                └──────────────┘

Submission Flow
───────────────
User submits ──▶ POST /api/submissions ──┬──▶ submissions table (status: pending)
                                         └──▶ Discord webhook (instant alert)
                                                    │
Admin reviews ──▶ /admin → Submissions tab ◀────────┘
    │
    ├── Approve ──▶ POST /api/admin (create event, status: published)
    │              + PATCH /api/submissions (status: approved)
    │              → Event appears on public feed
    │
    └── Reject ───▶ PATCH /api/submissions (status: rejected)
                   → Nothing changes on public feed
```

---

## Implementation Summary

| Req | Category | File(s) | Effort |
|-----|----------|---------|--------|
| A1 | Analytics | `package.json`, `.env.local`, NEW `src/lib/analytics.js`, `layout.js` | 15 min |
| A2 | Analytics | PostHog dashboard (no code) | 10 min |
| A3 | Analytics | `HeroSection.js` | 3 min |
| A4 | Analytics | `SearchFilterRedesign.js` | 5 min |
| A5 | Analytics | `EventCardV2.js` | 3 min |
| A6 | Analytics | `SubmitEventModal.js` | 5 min |
| A7 | Analytics | PostHog funnel (no code) | 5 min |
| E1 | Event Approval | `admin/page.js`, `api/submissions/route.js` | 15 min |
| E2 | Event Approval | `admin/page.js` | 5 min |
| E3 | Event Approval | `api/submissions/route.js`, `.env.local` | 10 min |
| E4 | Event Approval | None (already complete) | 0 min |

**Total: ~1 hour**

---

## Pending Requirements

_Add new requirements below as they come in. Use `REQ-A#` for Analytics, `REQ-E#` for Event Approval, or create a new category prefix as needed._
