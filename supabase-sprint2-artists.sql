-- ============================================================
-- Sprint 2: AI Artist Command Center
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

-- 1. is_human_edited — tracks which fields were manually edited (locked from AI overwrite)
-- { "bio": true, "image_url": true, "genres": true, "vibes": true }
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_human_edited JSONB DEFAULT '{}';

-- 2. field_status — traffic light per field
-- { "bio": "live", "image_url": "pending", "genres": null }
-- null = missing (Red), "pending" = AI-generated awaiting review (Yellow), "live" = approved (Green)
ALTER TABLE artists ADD COLUMN IF NOT EXISTS field_status JSONB DEFAULT '{}';

-- 3. Backfill: any artist that already has data gets "live" status for those fields
UPDATE artists SET field_status = jsonb_build_object(
  'bio', CASE WHEN bio IS NOT NULL THEN 'live' ELSE null END,
  'image_url', CASE WHEN image_url IS NOT NULL THEN 'live' ELSE null END,
  'genres', CASE WHEN genres IS NOT NULL AND array_length(genres, 1) > 0 THEN 'live' ELSE null END,
  'vibes', CASE WHEN vibes IS NOT NULL AND array_length(vibes, 1) > 0 THEN 'live' ELSE null END
)
WHERE field_status = '{}' OR field_status IS NULL;
