-- ============================================================
-- Add is_time_tbd flag to events table
-- Replaces the brittle UTC-midnight-detection approach
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add the column (safe to re-run)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_time_tbd BOOLEAN DEFAULT false;

-- 2. Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_events_is_time_tbd ON events (is_time_tbd) WHERE is_time_tbd = true;

-- 3. RESET all flags to false
--    We CANNOT reliably backfill from timestamps alone because:
--    - Real 8 PM EDT shows are stored as 00:00 UTC (same as "no time found")
--    - The old backfill incorrectly flagged those real shows as TBD
--    Instead, reset everything and let the next sync set is_time_tbd correctly
--    (the sync endpoint knows at scrape-time whether a real time was found)
UPDATE events SET is_time_tbd = false WHERE is_time_tbd = true;

-- 4. Verify: After running this, trigger a sync to correctly populate the flags
--    The sync endpoint's mapEvent() sets is_time_tbd = true ONLY when
--    no real time is found and no venue default time exists
SELECT
  COUNT(*) FILTER (WHERE is_time_tbd = true) AS flagged_tbd,
  COUNT(*) FILTER (WHERE is_time_tbd = false OR is_time_tbd IS NULL) AS has_time,
  COUNT(*) AS total
FROM events
WHERE event_date >= NOW();
