# myLocalJam — Frontend UI/UX Standards & Agent SOP

> **Last updated:** April 17, 2026
> **Scope:** Public-facing Next.js 14 frontend (`src/app/page.js`, `src/components/EventCardV2.js`, `src/app/globals.css`). Does NOT cover admin dashboard or scraper infrastructure — see `Agent_SOP.md` and `HANDOVER.md` for those.

---

## Architecture & Styling

### Styling System: Inline Styles with `darkMode` Ternaries

The entire frontend uses **inline styles** with a `darkMode` boolean. There are no Tailwind utility classes on UI elements. Do not introduce Tailwind classes into existing components — it creates an inconsistent codebase that is harder to maintain.

```javascript
// ✅ CORRECT — inline style with darkMode ternary
style={{ color: darkMode ? '#F0EDE6' : '#1C1917' }}

// ❌ WRONG — Tailwind class
className="text-white dark:text-gray-900"
```

**Exception:** The `globals.css` file uses a small number of utility classes for things that can't be done inline (pseudo-elements like `::placeholder`, scrollbar hiding, range input thumbs). These are namespaced (e.g., `.filter-search-input`, `.distance-slider`) and scoped tightly.

### Icon System: Inline SVGs via `MATERIAL_ICON_PATHS`

Icons are rendered as inline `<svg>` elements using path data stored in the `MATERIAL_ICON_PATHS` object (defined near the top of `page.js`). This is a zero-dependency approach — no icon libraries.

```javascript
// ✅ CORRECT — inline SVG with path from MATERIAL_ICON_PATHS
<svg width="16" height="16" viewBox="0 0 24 24">
  <path d={MATERIAL_ICON_PATHS.music_note} fill={darkMode ? '#FFF' : '#000'} />
</svg>

// ❌ WRONG — importing from react-icons or any icon library
import { MdMusicNote } from 'react-icons/md';
```

**When adding a new icon:** Find the SVG path data from Google Material Icons (or equivalent), add it to `MATERIAL_ICON_PATHS`, and reference it by key. Do not install `react-icons`, `lucide-react`, `phosphor-react`, or any other icon package.

### Theme Colors

The brand palette is defined as CSS custom properties in `globals.css`:

| Token | Value | Usage |
|---|---|---|
| `--accent` / `t.accent` | `#E8722A` | Primary orange — active states, CTAs, brand highlights |
| `--text-primary` / `t.text` | `#F0EDE6` (dark) | Primary text |
| `--text-secondary` | `#9994A8` (dark) | Secondary text |
| `--text-muted` / `t.textMuted` | `#666078` (dark) | Muted/disabled text |
| `--bg-primary` | `#0A0A0F` (dark) | Page background |
| `--bg-card` | `#1A1A25` (dark) | Card backgrounds |

Light mode equivalents are defined in the `t` theme object and selected via `darkMode` ternaries.

### Font Stack

- **Body:** `'DM Sans', sans-serif` — used for all UI text
- **Display/Headings:** `'Outfit', sans-serif` — used for the logo and major headings
- **Accent:** `'Syne', sans-serif` — used sparingly for stylistic emphasis

---

## Component Architecture

### Single-File Pattern

The main homepage (`src/app/page.js`) is a large single-file component (~3000+ lines). Filter panel, event feed, saved tab, profile tab, and bottom nav all live here. This is intentional — it avoids prop-drilling complexity for shared state (`darkMode`, `favorites`, `activeTab`, filter states, etc.).

**Event cards** are the exception — `EventCardV2` lives in `src/components/EventCardV2.js` because it's reused across multiple views (home feed, saved tab, search results).

### State Management

All state is React `useState` + `useCallback` + `useRef`. No Redux, Zustand, or Context providers. Key state variables:

| State | Type | Purpose |
|---|---|---|
| `activeTab` | `'home' \| 'search' \| 'saved' \| 'profile'` | Current bottom nav tab |
| `darkMode` | `boolean` | Theme toggle |
| `favorites` | `Set<string>` | Saved event IDs (synced with Supabase) |
| `filtersExpanded` | `boolean` | Whether the filter panel overlay is open |
| `activeFilterCard` | `'when' \| 'distance' \| 'venue' \| null` | Which accordion is expanded |
| `dateKey` | `'all' \| 'today' \| 'tomorrow' \| 'weekend' \| 'pick'` | Date filter selection |
| `milesRadius` | `number \| null` | Distance filter (null = no limit) |
| `activeVenues` | `string[]` | Selected venue names |
| `activeShortcut` | `string \| null` | Active shortcut pill ID |
| `locationCoords` | `{ lat, lng } \| null` | User's location for distance filtering |
| `locationLabel` | `string` | Display name — defaults to `'Current Location'` for GPS, town name for geocoded |

---

## Mobile-First Standards

### Touch Targets

Every interactive element must meet **44px minimum** touch target size (WCAG 2.5.8 / Apple HIG). Use `minHeight: '44px'` as a safety net on buttons.

```javascript
// ✅ Accordion trigger — generous padding + minHeight guarantee
style={{
  display: 'flex', alignItems: 'center', width: '100%',
  padding: '14px 16px',  // 14 + 16px icon + 14 = 44px
  minHeight: '44px',
  background: 'transparent', border: 'none', cursor: 'pointer',
}}
```

### WCAG AA Contrast

All text must meet **4.5:1 contrast ratio** against its background (AA standard for normal text). This was audited across all filter panel elements in both light and dark modes. Key compliant values:

- Inactive pill text (dark): `#B0B0C8` on `#0A0A0F` — 7.3:1 ✓
- Inactive pill text (light): `#4B5563` on `#FFFFFF` — 7.5:1 ✓
- Muted text (dark): `#8C8CA4` on `#0A0A0F` — 4.6:1 ✓
- Placeholder text (dark): `#9898B0` — 5.1:1 ✓
- Placeholder text (light): `#5C6370` — 5.9:1 ✓

### Flexbox Overflow Protection

On narrow viewports, flex containers must protect fixed-size elements (badges, icons) and allow text to truncate:

```javascript
// Badge/icon — never shrink
style={{ flexShrink: 0 }}

// Text — allowed to truncate
style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
```

**Critical:** `minWidth: 0` is required on flex children that need to shrink below their content width. Without it, the flex algorithm uses the content's intrinsic width as the minimum, preventing truncation.

---

## Search Filter Panel

### Structure

The filter panel is a full-screen overlay triggered by the search header pill. Layout from top to bottom:

1. **Search bar + Close X** — inline row, search input with autocomplete
2. **Shortcut pills** — horizontal scrolling row of 8 category filters
3. **Accordion cards** — DATE, LOCATION, VENUE (in that order)
4. **Footer** — "Clear All" ghost button + "Show N events" primary CTA

### Accordion Cards

Three cards with consistent styling:

| Card | State key | Active condition |
|---|---|---|
| DATE | `activeFilterCard === 'when'` | `dateKey !== 'all'` |
| LOCATION | `activeFilterCard === 'distance'` | `locationCoords` (truthy) |
| VENUE | `activeFilterCard === 'venue'` | `activeVenues.length > 0` |

**Header pattern** — single-row, iOS-style with right-aligned value:

```
[icon] LABEL                        value [chevron]
```

- Icon, label, value, and chevron all turn `#E8722A` when the filter is active
- Value uses sentence case defaults: `"Any time"`, `"Any distance"`, `"Any venue"`
- Labels are uppercase: `DATE`, `LOCATION`, `VENUE`

### Location Accordion Value — Priority Display

The LOCATION value follows a 4-tier priority:

1. **Town + Radius:** `"Manasquan + 5 mi"` — when `locationCoords && milesRadius !== null`
2. **Town only:** `"Manasquan"` — when `locationCoords` but no radius
3. **GPS + Radius:** `"Current Location + 5 mi"` — handled by tier 1 (locationLabel defaults to `'Current Location'`)
4. **Neither:** `"Any distance"` — fallback

### Shortcut Pills — Neon Glow

Active pills use a multi-layer box shadow for a "neon glow" effect:

```javascript
boxShadow: isActive
  ? '0 0 10px rgba(232,114,42,0.5), 0 0 25px rgba(232,114,42,0.2), inset 0 0 8px rgba(232,114,42,0.15)'
  : 'none',
```

Inactive pills are deliberately muted (`rgba(255,255,255,0.04)` bg, subtle borders) to maximize visual contrast with the active glow state.

### Button Logic Separation

- **X (Close):** `setFiltersExpanded(false); setActiveFilterCard(null)` — closes the panel, preserves filter state
- **Clear All:** `clearAllFilters()` — resets all filter state, keeps panel open
- **Show events:** closes panel (same as X)

---

## Event Cards — Save Interaction

### The Ticket Stub

The save button uses a **ticket stub** metaphor (not a plus icon, bookmark, or music note):

- **Unsaved (ghost):** Outlined ticket with semicircle notches, muted color (`rgba(255,255,255,0.35)` dark / `rgba(0,0,0,0.25)` light)
- **Saved (filled):** Same ticket shape, solid `#E8722A` orange fill
- **Animation:** `save-pop` keyframe (scale bounce) fires on save
- **Hover:** `fill: #E8722A` on the path via `.save-btn:hover svg path`

The ticket stub icon is also used for the **My Jam** tab in the bottom navigation, tying the save metaphor to the saved events view.

SVG paths (viewBox `0 0 24 24`):

```javascript
// Filled (saved)
"M22 10V6a2 2 0 00-2-2H4a2 2 0 00-2 2v4a2 2 0 100 4v4a2 2 0 002 2h16a2 2 0 002-2v-4a2 2 0 100-4z"

// Outlined (unsaved)
"M22 10V6a2 2 0 00-2-2H4a2 2 0 00-2 2v4a2 2 0 100 4v4a2 2 0 002 2h16a2 2 0 002-2v-4a2 2 0 100-4zm-2-1.46a4 4 0 000 6.92V18H4v-2.54a4 4 0 000-6.92V6h16v2.54z"
```

### Long Press → Follow Artist

Long-pressing an event card opens the `QuickActions` sheet, which includes the option to follow the artist. This is the "power user" shortcut for artist follows. Do not add swipe gestures — they conflict with vertical scrolling and have near-zero discoverability.

### Follow Popover

When a user saves an event (first save, not unsave), a follow-artist popover appears anchored to the bookmark button. It auto-dismisses after 8 seconds with a fade-out animation. This provides a natural discovery path for the follow feature without requiring a separate UI element.

---

## Bottom Navigation

### Tab Structure

```javascript
[
  { key: 'home',    label: 'Home'    },  // House icon
  { key: 'search',  label: 'Search'  },  // Magnifying glass
  { key: 'saved',   label: 'My Jam'  },  // Ticket stub (matches save button)
  { key: 'profile', label: 'Profile' },  // Person silhouette
]
```

All icons: 22x22 SVG, `fill="currentColor"`, inside a 24x24 container. Active tab color: `t.accent` (`#E8722A`). Inactive: `t.textMuted`.

### Home Toggle Pattern

Tapping an already-active tab has special behavior:

| Tab | Already active? | Action |
|---|---|---|
| Home | Yes | Scroll to top, clear all filters, re-fetch events |
| Search | N/A | Toggles filter panel open/closed (not tied to `activeTab`) |
| My Jam | Yes | Returns to Home |
| Profile | Yes | Returns to Home |

This is implemented as a simple state check — `if (activeTab === tab.key) setActiveTab('home')` — not router-based navigation. There are no file-based routes for tabs; everything is driven by the `activeTab` state variable.

---

## Decisions Log — What We Tried and Rejected

| Proposal | Decision | Reason |
|---|---|---|
| `react-icons` library | Rejected | Adds dependency; inline SVG system is already established and working |
| Tailwind classes on UI elements | Rejected | Codebase uses inline styles; mixing creates inconsistency |
| Guitar icon for save button | Rejected | Unrecognizable at 26px — too much geometry for icon scale |
| Music note for save button | Replaced | Works at 26px but too generic; ticket stub is more semantically aligned |
| Swipe gestures on event cards | Rejected | Conflicts with vertical scroll; zero discoverability; long press already covers artist follow |
| Standalone `SaveEventButton` component | Rejected | Save logic is tightly coupled with follow popover in EventCardV2; extraction creates unnecessary prop-drilling |
| Framer Motion for card interactions | Not adopted | Not in the project; CSS transitions handle all current animation needs |
| Text labels on save button ("Save Event" / "Saved") | Rejected | Cards are dense on mobile; icon-only is sufficient with outline/filled states |
| `useRouter` / `usePathname` for tab navigation | N/A | Tabs are state-driven (`activeTab`), not route-driven |

---

## For Future Agents

Before implementing any frontend feature:

1. **Use inline styles with `darkMode` ternaries.** No Tailwind on UI elements.
2. **Use inline SVGs from `MATERIAL_ICON_PATHS`.** No icon libraries.
3. **Ensure 44px touch targets** on all interactive elements.
4. **Test both light and dark modes** — every color must have a `darkMode` ternary.
5. **Consider the truncated state** — long town names, artist names, and venue names must truncate gracefully via `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` with `minWidth: 0` on flex children.
6. **Consider the empty/default state** — use sentence case: "Any time", "Any distance", "Any venue".
7. **Do not add swipe gestures to event cards.** Long press covers the "power user" path.
8. **The save icon is a ticket stub.** Do not revert to plus-circle, bookmark, or other metaphors.
9. **If a suggestion conflicts with these standards, flag it before writing code.**
