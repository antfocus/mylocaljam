-- ═══════════════════════════════════════════════════════════════════════════
-- artists.alias_names — inline alias array on the artists row
--
-- WHY A SECOND ALIAS STORE?
-- The codebase already has a separate `artist_aliases` table
-- (src/app/api/admin/artists/merge/route.js, src/lib/enrichArtist.js,
-- src/app/api/sync-events/route.js). That table is read by the sync
-- pipeline to collapse scraper variants into canonical artists.
--
-- This new `alias_names` array is the "learning system" store for the
-- admin Smart Match utility (src/lib/artistMatcher.js) and the Event
-- Edit Modal's Link-to-Artist flow. It's colocated on the artist row
-- for cheap reads when hydrating an artist card. We keep both stores
-- in sync: the admin PUT /api/admin (events) handler appends to BOTH
-- when a ghost event is linked.
--
-- Idempotent. Safe to run on a live DB.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add the column ---------------------------------------------------------
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS alias_names TEXT[] DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN artists.alias_names IS
  'Alternate names this artist is known by. Populated manually via the '
  'Admin Link flow and by backfill from the artist_aliases table. '
  'Used by src/lib/artistMatcher.js Smart Match for O(1) ghost-event linking.';

-- 2. GIN index for fast array containment/overlap queries -------------------
--    Supports: WHERE 'The Jukes' = ANY(alias_names)
--    Supports: WHERE alias_names && ARRAY['The Jukes']
--    Supports: WHERE alias_names @> ARRAY['The Jukes']
CREATE INDEX IF NOT EXISTS idx_artists_alias_names_gin
  ON artists
  USING GIN (alias_names);

-- 3. Backfill from the existing artist_aliases table ------------------------
--    One-shot: collapse each artist's aliases into a deduped TEXT[] array.
--    Safe to run multiple times — ON CONFLICT not needed (UPDATE, not INSERT).
UPDATE artists a
SET alias_names = sub.aliases
FROM (
  SELECT artist_id,
         ARRAY_AGG(DISTINCT alias ORDER BY alias) AS aliases
  FROM artist_aliases
  GROUP BY artist_id
) sub
WHERE a.id = sub.artist_id
  AND (a.alias_names IS NULL OR COALESCE(cardinality(a.alias_names), 0) = 0);

COMMIT;


-- ─── Verification ─────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'artists' AND column_name = 'alias_names';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'artists' AND indexname = 'idx_artists_alias_names_gin';
--
-- SELECT name, alias_names
-- FROM artists
-- WHERE cardinality(alias_names) > 0
-- ORDER BY cardinality(alias_names) DESC
-- LIMIT 20;
