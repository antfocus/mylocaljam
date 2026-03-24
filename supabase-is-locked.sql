-- Add is_locked column to artists and events tables
-- When true, scrapers and Last.fm enrichment will never overwrite the row

-- Artists table
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

-- Events table (extends existing is_human_edited protection)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

-- Index for fast filtering in sync pipeline
CREATE INDEX IF NOT EXISTS idx_artists_is_locked ON artists (is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_events_is_locked ON events (is_locked) WHERE is_locked = true;
