-- ============================================================================
-- Add event_image_url column to events table
-- Run once in Supabase SQL Editor
-- ============================================================================

-- Event-specific image that takes priority over artist/venue images
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_image_url TEXT;

-- Optional: add description column if not already present
-- (Currently artist_bio on events table serves as event description)
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
