-- ============================================================
-- Add is_time_tbd flag to events table
-- Replaces the brittle UTC-midnight-detection approach
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add the column
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_time_tbd BOOLEAN DEFAULT false;

-- 2. Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_events_is_time_tbd ON events (is_time_tbd) WHERE is_time_tbd = true;

-- 3. Backfill: Mark existing events as TBD if their time is midnight in any
--    timezone interpretation (UTC midnight, EDT midnight = 04:00 UTC, EST midnight = 05:00 UTC)
--    Only for future events to avoid touching historical data
UPDATE events
SET is_time_tbd = true
WHERE event_date >= NOW()
  AND EXTRACT(MINUTE FROM event_date) = 0
  AND EXTRACT(HOUR FROM event_date) IN (0, 4, 5);

-- 4. Verify: Show how many events were flagged
SELECT
  COUNT(*) FILTER (WHERE is_time_tbd = true) AS flagged_tbd,
  COUNT(*) FILTER (WHERE is_time_tbd = false OR is_time_tbd IS NULL) AS has_time,
  COUNT(*) AS total
FROM events
WHERE event_date >= NOW();
