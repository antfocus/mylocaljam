-- ============================================================================
-- PHASE 0: Custom Event Metadata — Unified Visual Metadata CMS
-- ============================================================================
-- Adds event-level override columns so events can "break sync" from their
-- linked artist profile. When a column is NULL, the event inherits from the
-- artist. When populated, it represents a custom override.
--
-- ZERO-IMPACT DEPLOY: All columns default to NULL / false, so every existing
-- event continues to inherit artist data until manually overridden.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ============================================================================

-- 1. Custom bio — overrides artists.bio when set
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS custom_bio TEXT DEFAULT NULL;

-- 2. Custom genres — overrides artists.genres when set
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS custom_genres TEXT[] DEFAULT NULL;

-- 3. Custom vibes — overrides artists.vibes when set
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS custom_vibes TEXT[] DEFAULT NULL;

-- 4. Custom image — overrides artists.image_url when set
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS custom_image_url TEXT DEFAULT NULL;

-- 5. Flag: does this event have ANY custom metadata?
--    Used by the live feed to quickly identify and prioritize overrides.
--    Automatically managed by the admin API on save.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_custom_metadata BOOLEAN DEFAULT false;

-- 6. Add a comment for documentation
COMMENT ON COLUMN events.custom_bio IS 'Event-specific bio override. NULL = inherit from linked artist.';
COMMENT ON COLUMN events.custom_genres IS 'Event-specific genres override. NULL = inherit from linked artist.';
COMMENT ON COLUMN events.custom_vibes IS 'Event-specific vibes override. NULL = inherit from linked artist.';
COMMENT ON COLUMN events.custom_image_url IS 'Event-specific image override. NULL = inherit from linked artist.';
COMMENT ON COLUMN events.is_custom_metadata IS 'True if any custom_* field is set. Used by live feed for quick detection.';

-- ============================================================================
-- Verification query — run after migration to confirm columns exist:
--
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'events'
--     AND column_name LIKE 'custom_%' OR column_name = 'is_custom_metadata'
--   ORDER BY column_name;
--
-- Expected: 5 rows (custom_bio, custom_genres, custom_image_url,
--           custom_vibes, is_custom_metadata)
-- ============================================================================
