-- ============================================================================
--  G Spot Protocol — Verified Lock column on events
-- ============================================================================
--  Adds `is_category_verified` to the events table. When true, ALL automated
--  categorization handlers must skip the row. This is the hard lock that
--  protects human judgment from AI regressions.
--
--  Flip rules (enforced by the API, not the DB):
--    - Default         → false
--    - Admin manually picks a category in the dropdown → true
--    - AI auto-categorize endpoint                     → never writes true
--    - Scraper ingest                                  → never writes true
--
--  Companion columns (also provisioned here so the G Spot protocol has
--  somewhere to record its work):
--    - category_source        TEXT   — 'manual' | 'ai' | 'template' | 'scraper' | 'manual_review'
--    - category_confidence    NUMERIC(4,3)  — LLM self-reported 0.000–1.000
--    - category_ai_flagged_at TIMESTAMPTZ   — when AI flagged for human review
--
--  These aren't strictly required for the current task but drop cost is near
--  zero and they close the audit loop: for any event you can ask "who set
--  this category, how confident were they, and was it ever flagged?"
-- ============================================================================

BEGIN;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_category_verified  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_source       TEXT,
  ADD COLUMN IF NOT EXISTS category_confidence   NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS category_ai_flagged_at TIMESTAMPTZ;

-- Fast lookup for "give me every event that still needs a human category
-- decision" (the Manual Review queue).
CREATE INDEX IF NOT EXISTS idx_events_category_flagged
  ON events (category_ai_flagged_at)
  WHERE category_ai_flagged_at IS NOT NULL;

-- Fast lookup for "verified vs unverified" filters in the admin UI.
CREATE INDEX IF NOT EXISTS idx_events_is_category_verified
  ON events (is_category_verified);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'events'
--    AND column_name IN ('is_category_verified', 'category_source', 'category_confidence', 'category_ai_flagged_at')
--  ORDER BY column_name;
--
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE tablename = 'events' AND indexname LIKE 'idx_events_category%';
