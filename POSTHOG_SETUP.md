# PostHog Setup Recipe

> Step-by-step for the dashboards and funnel called out in `ANALYTICS_PLAN.md` REQ-A2 and REQ-A7. Everything here is PostHog UI clicking — no code. Time: ~30 minutes.

**Before you start:** make sure your PostHog project is the **Production** one (not Dev). Top-left dropdown should say "Production" or whatever you named the prod project. The events listed below have been live since May 5, 2026 — older snapshots won't have `spotlight_tapped`, `spotlight_impression`, `add_to_jar_clicked`, `add_to_jar_submitted`, or the renamed `local_followed` / `user_signed_in` versions.

---

## Part 1 — REQ-A2: Four standard dashboards

PostHog has a "+ New Dashboard" button (top right of the Dashboards page). Each dashboard below is a separate one — easier to scan than cramming everything into a single 12-tile dashboard.

### Dashboard 1 — "DAU/MAU & Growth"

Name: `myLocalJam — DAU/MAU & Growth`

**Tile 1: DAU trend**
- Add Insight → Trends
- Series: `$pageview`, **count of unique users**
- Date range: Last 30 days
- Interval: Day
- Save as: "Daily Active Users"

**Tile 2: WAU trend**
- Add Insight → Trends
- Series: `$pageview`, **count of unique users**
- Date range: Last 90 days
- Interval: Week
- Save as: "Weekly Active Users"

**Tile 3: MAU trend**
- Add Insight → Trends
- Series: `$pageview`, **count of unique users**
- Date range: Last 365 days
- Interval: Month
- Save as: "Monthly Active Users"

**Tile 4: Stickiness (DAU/MAU ratio)**
- Add Insight → Stickiness
- Event: `$pageview`
- Returning user threshold: 2 days/week
- Date range: Last 30 days
- Save as: "Stickiness — DAU/MAU"

---

### Dashboard 2 — "Top Pages"

Name: `myLocalJam — Top Pages`

**Tile 1: Most-visited URLs**
- Add Insight → Trends
- Series: `$pageview`, **count of events**, breakdown by `$current_url`
- Date range: Last 7 days
- Display: Bar chart, top 10
- Save as: "Most-visited Pages (7d)"

**Tile 2: Most-visited URLs (30d)**
- Same as Tile 1 but date range: Last 30 days
- Save as: "Most-visited Pages (30d)"

**Tile 3: Time on page**
- Add Insight → Trends
- Series: `$pageleave`, **average of $session_duration**
- Breakdown by `$current_url`
- Date range: Last 7 days
- Save as: "Avg Time on Page"

---

### Dashboard 3 — "Device & Browser Split"

Name: `myLocalJam — Device & Browser Split`

**Tile 1: Device type breakdown**
- Add Insight → Trends
- Series: `$pageview`, **count of unique users**, breakdown by `$device_type`
- Date range: Last 7 days
- Display: Pie chart
- Save as: "Device Type"

**Tile 2: Browser breakdown**
- Same shape but breakdown by `$browser`
- Save as: "Browser"

**Tile 3: OS breakdown**
- Same shape but breakdown by `$os`
- Save as: "Operating System"

**Tile 4: Country breakdown**
- Same shape but breakdown by `$geoip_country_code`
- Save as: "Country"

---

### Dashboard 4 — "Retention"

Name: `myLocalJam — Retention`

**Tile 1: Day-7 retention curve**
- Add Insight → Retention
- Cohort entry event: First-time `$pageview`
- Returning event: any `$pageview`
- Period: Day, look back 7 days
- Save as: "Day-7 Retention"

**Tile 2: Week-4 retention curve**
- Add Insight → Retention
- Cohort entry: First-time `$pageview`
- Returning event: any `$pageview`
- Period: Week, look back 4 weeks
- Save as: "Week-4 Retention"

**Tile 3: First-action retention**
- Add Insight → Retention
- Cohort entry: First-time `$pageview`
- Returning event: `event_bookmarked` (action='saved') OR `local_followed`
- Period: Day, look back 14 days
- Save as: "Engagement Retention" — measures whether new visitors come back AND act, not just pageview-bounce

---

## Part 2 — REQ-A7: Conversion funnel

Name: `myLocalJam — Conversion Funnel`

This is a single Insight, not a dashboard. Save it as a standalone insight then pin it to the top of any dashboard above (or its own dashboard).

- Add Insight → Funnel
- Steps in order:
  1. `$pageview`
  2. `spotlight_tapped`  (filter: `event_id` is set, to exclude the loading-state firing)
  3. `event_bookmarked`  (filter: `action = 'saved'`)
  4. `user_signed_in`
- Date range: Last 30 days
- Conversion window: 1 hour (typical session length)
- Save as: "Visitor → Spotlight → Save → Sign In"

What this tells you:
- Stage 1→2: how many visitors engage with the spotlight at all
- Stage 2→3: how many spotlight viewers go on to save an event
- Stage 3→4: how many savers convert to registered users (the value moment)

---

## Part 3 — Migration note for existing dashboards

If you had any dashboards built against the old event names, the May 5, 2026 rename pass changed:

| Old name | New name |
|---|---|
| `Local Followed` | `local_followed` |
| `User Signed In` | `user_signed_in` |
| `List Sorted/Filtered` | `following_list_sorted` |

The old events still exist in PostHog history (PostHog doesn't rename events retroactively). Two options:
1. Update existing dashboards to query the new names — cleanest, accept a discontinuity in the data on May 5.
2. Use a "matches any of" filter to query both old and new names — preserves continuity.

For Tony's volume, option 1 is fine.

---

## Part 4 — One last check before launch

After the May 5 deploy lands and people use the site for a day or two, verify the new events are arriving:

- PostHog → Activity → Live events
- Filter: event name = `spotlight_tapped` (or any of the new ones)
- Should see entries appearing in real-time as you tap spotlight cards

If `spotlight_impression` events arrive but `spotlight_tapped` doesn't, the click handler isn't firing — likely a swipe vs tap detection issue in `HeroSection.js`. If neither arrives, the PostHogProvider isn't initializing — check the browser console for `[PostHog]` warnings.
