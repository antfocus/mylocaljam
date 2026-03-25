-- ============================================================
-- Metadata Source Tracking
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

-- 1. Add metadata_source column to artists table
-- Values: 'lastfm', 'scraper', 'ai_generated', 'manual', NULL (unknown/legacy)
ALTER TABLE artists ADD COLUMN IF NOT EXISTS metadata_source TEXT DEFAULT NULL;

-- 2. Backfill: stamp existing artists based on heuristics
-- Artists with Last.fm tags → likely came from Last.fm
UPDATE artists
SET metadata_source = 'lastfm'
WHERE metadata_source IS NULL
  AND tags IS NOT NULL
  AND tags != '';

-- Artists with bio or image but no tags → likely from scraper seeding
UPDATE artists
SET metadata_source = 'scraper'
WHERE metadata_source IS NULL
  AND (bio IS NOT NULL OR image_url IS NOT NULL)
  AND (tags IS NULL OR tags = '');

-- Artists manually edited (is_human_edited has any true value) → manual
UPDATE artists
SET metadata_source = 'manual'
WHERE metadata_source IS NULL
  AND is_human_edited IS NOT NULL
  AND is_human_edited != '{}'
  AND (
    (is_human_edited->>'bio')::boolean = true
    OR (is_human_edited->>'image_url')::boolean = true
    OR (is_human_edited->>'genres')::boolean = true
  );

-- 3. Create index for filtering by source
CREATE INDEX IF NOT EXISTS idx_artists_metadata_source ON artists (metadata_source);
