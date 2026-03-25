-- Add event_title column to events table
-- When set, this overrides artist_name as the display header on public cards
-- Use case: festival events like "Annual Mushfest" that feature artist "Mushmouth"
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT NULL;

-- Optional: add a comment for documentation
COMMENT ON COLUMN events.event_title IS 'Custom event title. When set, displayed as primary header instead of artist_name. Used for festivals, multi-act shows, etc.';
