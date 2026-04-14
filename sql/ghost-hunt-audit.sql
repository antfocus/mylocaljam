-- ═══════════════════════════════════════════════════════════════════════════
-- Ghost Hunt — unlinked Live-Music events grouped by artist_name string
--
-- A "ghost" is an event row whose artist_name did not resolve to an artists
-- row during sync (artist_id IS NULL). Grouping by the raw string reveals
-- the biggest offenders — usually spelling drift, missing aliases, or
-- scraper-specific formatting (e.g. "The Jukes" vs "Southside Johnny &
-- the Asbury Jukes").
--
-- Workflow:
--   1. Run this query in Supabase SQL Editor.
--   2. Pick the top names with high occurrence_count.
--   3. In the admin UI, search the Artist Directory for a canonical match.
--   4. Open an affected event in the Event Edit Modal and click "Link to
--      existing artist" — the PUT handler will append the ghost name to
--      artists.alias_names, so future syncs auto-resolve.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  artist_name,
  COUNT(*)                               AS occurrence_count,
  COUNT(DISTINCT venue_name)             AS venue_count,
  MIN(event_date)                        AS first_seen,
  MAX(event_date)                        AS last_seen,
  ARRAY_AGG(DISTINCT source)             AS scraper_sources,
  ARRAY_AGG(DISTINCT venue_name ORDER BY venue_name) FILTER (WHERE venue_name IS NOT NULL) AS venues
FROM events
WHERE artist_id IS NULL
  AND artist_name IS NOT NULL
  AND TRIM(artist_name) <> ''
  AND category = 'Live Music'
  AND status = 'published'
  -- Ghost Hunt Blacklist: suppress names the admin has explicitly ignored.
  AND LOWER(TRIM(artist_name)) NOT IN (
    SELECT name_lower FROM ignored_artists
  )
GROUP BY artist_name
ORDER BY occurrence_count DESC, last_seen DESC
LIMIT 100;


-- ─── Variant: upcoming-only (biggest actionable offenders) ────────────────
-- SELECT artist_name, COUNT(*) AS upcoming_count, ARRAY_AGG(DISTINCT venue_name) AS venues
-- FROM events
-- WHERE artist_id IS NULL
--   AND event_date >= NOW()
--   AND category = 'Live Music'
--   AND status = 'published'
-- GROUP BY artist_name
-- ORDER BY upcoming_count DESC
-- LIMIT 50;
