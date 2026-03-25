-- ============================================================
-- Deduplication Fix: Unique constraint on external_id
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Ensure the external_id column exists
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Step 2: Purge exact duplicates across ALL venues (not just Crossroads)
-- Keeps the OLDEST row (earliest created_at) for each external_id
DELETE FROM events
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY created_at ASC) AS rn
    FROM events
    WHERE external_id IS NOT NULL
  ) dupes
  WHERE rn > 1
);

-- Step 3: Add the unique constraint so upsert actually works
-- The sync route already does .upsert(batch, { onConflict: 'external_id' })
-- but without this constraint, Postgres just inserts a new row every time
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_id_unique
  ON events (external_id)
  WHERE external_id IS NOT NULL;

-- Step 4: Fallback composite unique constraint for events without external_id
-- Covers manually created events or scrapers that fail to set external_id
-- Uses venue_name + date (truncated to day) + artist_name (lowercased)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_venue_date_artist_unique
  ON events (venue_name, (event_date::date), LOWER(artist_name))
  WHERE external_id IS NULL AND venue_name IS NOT NULL AND artist_name IS NOT NULL;

-- Step 5: Verify — check for any remaining duplicates
SELECT external_id, COUNT(*) as dupes
FROM events
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING COUNT(*) > 1
ORDER BY dupes DESC
LIMIT 20;
