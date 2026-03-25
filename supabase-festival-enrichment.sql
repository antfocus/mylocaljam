-- Festival architecture + Universal Enrichment support
-- Run this in Supabase SQL editor

-- 1. Add is_festival flag to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_festival BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN events.is_festival IS 'True if this event is part of a multi-act festival (e.g. Sea.Hear.Now). Used for frontend grouping.';

-- 2. Add event_name to submissions table (so OCR can pass festival name through the queue)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS event_name TEXT DEFAULT NULL;

-- 3. Add MusicBrainz MBID to artists table for identity linking
ALTER TABLE artists ADD COLUMN IF NOT EXISTS mbid TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_artists_mbid ON artists (mbid) WHERE mbid IS NOT NULL;
COMMENT ON COLUMN artists.mbid IS 'MusicBrainz Artist ID — canonical identity for enrichment pipeline.';

-- 4. Backfill: mark existing event_title entries as festivals
UPDATE events SET is_festival = TRUE
WHERE event_title IS NOT NULL AND event_title != '' AND is_festival IS NOT TRUE;
