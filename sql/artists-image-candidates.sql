-- ═══════════════════════════════════════════════════════════════════════════
-- artists.image_candidates — persist Serper image search results
--
-- Previously the artists AI-lookup route returned `image_candidates` only
-- transiently (React state during enrichment, lost on reload). The Event
-- Edit Modal's image carousel reads this array via the linked artist, so
-- it must survive page navigation.
--
-- Idempotent. Safe to run on a live DB — adds a nullable column.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS image_candidates TEXT[] DEFAULT NULL;

COMMENT ON COLUMN artists.image_candidates IS
  'Cached Serper Google Image Search results from ai-lookup enrichment. '
  'Fuels the admin Image Candidate Carousel in Event Edit Modal. '
  'NULL = never enriched. Empty array = enriched but zero results.';

COMMIT;


-- ─── Verification ─────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'artists' AND column_name = 'image_candidates';
