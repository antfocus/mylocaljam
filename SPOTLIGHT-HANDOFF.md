# Spotlight Redesign — Handoff Note

Temporary scratch file. Delete when this work is merged.

## IMPORTANT: Use connectors, don't reinvent

This project has live MCP connectors set up. **USE them** rather than asking
the user to run things manually:

- **Supabase MCP** (project_id: `ugmyqucizialapfulens`) — for any DB read/write,
  schema checks, drift queries. Tools: `mcp__73332671-...__execute_sql`,
  `list_tables`, `apply_migration`, `get_logs`, etc.
- **GitHub MCP** — for PRs, branches, file edits at the repo level. Tools:
  `mcp__github__create_pull_request`, `create_branch`, `get_file_contents`,
  `create_or_update_file`, `list_commits`, etc.
- **Claude in Chrome MCP** — for live testing on the deployed site (mylocaljam.com)
  and for checking how the redesigned Spotlight renders in production after deploy.
  Tools: `mcp__Claude_in_Chrome__navigate`, `read_page`, `javascript_tool`,
  `screenshot` via the extension.
- **Scheduled tasks MCP** — already has `trust-refactor-phase1-drift-check`
  running daily at 8 AM. Don't recreate; check with `list_scheduled_tasks`.

If a tool feels deferred (schema not loaded), use `ToolSearch` with
`query: "supabase"`, `"github"`, `"chrome"`, etc. and `max_results: 30` to
load the whole toolkit at once — don't load tools one at a time.

When in doubt: prefer the connector over asking Tony to copy/paste from a
terminal. He's already wired everything up.

## Status

Design is locked in. Mockup lives at `spotlight-mockup.html` (workspace root).
The top card in that file ("Hybrid overlay") is the one we're implementing.
The middle card (full Gig Poster) is parked — revisit for Local Lineup highlights
and shared-artist pages later.

## Design spec (Hybrid overlay)

- Aspect ratio: `16 / 10`, full-bleed background photo
- Bottom-heavy scrim: `linear-gradient(180deg, rgba(19,19,28,0.15) 0%, rgba(19,19,28,0) 35%, rgba(19,19,28,0.55) 60%, rgba(19,19,28,0.92) 100%)`
- Radial orange glow lower-left: `radial-gradient(ellipse at 15% 100%, rgba(232,114,42,0.22) 0%, transparent 55%)`
- Corner sticker top-right: "SPOTLIGHT" on #E8722A orange, 4deg tilt, IBM Plex Mono, pulsing dot in dark color
- Artist name: Outfit 900, 32px, -3% letter-spacing, uppercase, white
- Event title: DM Serif Display italic, 19px, soft white, with orange Outfit quote marks
- Meta line: IBM Plex Mono caps, 11px, reads "FRI · 7:00 PM · BAR ANTICIPATION" (day-of-week in orange #E8722A)
- "Meet Artist" is a right-aligned text link (no button chrome), thin underline, hovers to orange
- NO pager dots — removed entirely, carousel behavior is swipe-discoverable
- Google Fonts already imported in mockup (Outfit 900, IBM Plex Mono, DM Serif Display italic)

## The 5-step plan

1. **New Spotlight card component** — port the hybrid overlay from `spotlight-mockup.html` into the actual Spotlight component, wire real event data (artist, title, venue, time, date → day-of-week), verify no carousel regression
2. **Carousel loop** — wrap-around on swipe at either end (simple circular, no cloned slides)
3. **Pause carousel on ArtistSpotlight open** — contingent on whether it currently auto-advances (need to check); pause on open, resume on close
4. **Share button in ArtistSpotlight modal** — reuse the exact share logic from EventCardV2
5. *(optional)* Factor `shareEvent()` helper into `/src/lib/` since it's now used in 3 places

## Share button spec (matches EventCardV2 exactly)

From `src/components/EventCardV2.js` around line 533:

- `shareText = \`${name} at ${venue}\`` (e.g. "Suit & Mai Tai at Bar Anticipation")
- `shareUrl = event.id ? \`https://mylocaljam.com/event/${event.id}\` : (event.ticket_link || event.source || window.location.href)`
- Flow: `navigator.share()` first, fall back to `navigator.clipboard.writeText(\`${shareText} — ${shareUrl}\`)` with toast via `onFlag?.('Link copied to clipboard!')`
- Swallow `AbortError` so dismissing the share sheet isn't treated as an error

Same three call sites use near-identical code already:
- `src/components/EventCardV2.js` (~L533, L631)
- `src/components/SavedGigCard.js` (~L312-320)
- `src/components/SiteEventCard.js` (~L170-175)

Target placement: small share icon in ArtistSpotlight modal header, next to close button.

## Next step on resume

Start with step 1 — wire the hybrid overlay into the actual Spotlight component.
The carousel lives in the current spotlight component; need to locate it
(start by grep'ing for "Today's Spotlight" or `ArtistSpotlight` in `src/`)
and swap the card rendering without breaking the carousel mechanics.

Use the GitHub connector to create a feature branch + PR when the implementation is ready.
Use the Chrome connector to verify the result on the deployed site after merge.
