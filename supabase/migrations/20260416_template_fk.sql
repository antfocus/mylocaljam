-- =============================================================================
-- Migration: Add Foreign Key from events.template_id → event_templates.id
-- Date: 2026-04-16
-- Purpose: PostgREST requires a FK constraint to auto-detect relationships
--          for embedded joins like events?select=*,event_templates(...)
-- =============================================================================
--
-- CONTEXT:
-- The events.template_id column exists (the sync route writes to it), and
-- the event_templates table exists (created via the Supabase dashboard), but
-- there is no formal FK constraint linking them. Without this FK, PostgREST
-- cannot resolve the embedded select `event_templates(template_name, ...)`,
-- producing: "Could not find a relationship between 'events' and
-- 'event_templates' in the schema cache."
--
-- The anon-key client in page.js happens to work because PostgREST may have
-- detected the relationship through column naming conventions in an earlier
-- schema cache cycle, or the relationship was manually configured. The
-- service-role client used by /api/events/search hits the same PostgREST
-- instance but triggers a fresh schema resolution that fails without the FK.
--
-- This migration adds the FK constraint. It is safe to run on existing data
-- because template_id values already reference valid event_templates rows
-- (written by the sync route's template matchmaker).
-- =============================================================================

-- Ensure the column exists (it should — sync-events writes to it)
ALTER TABLE events ADD COLUMN IF NOT EXISTS template_id UUID;

-- Add the FK constraint. IF NOT EXISTS is not supported for constraints in
-- all Postgres versions, so we use a DO block to check first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_events_template_id'
      AND table_name = 'events'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT fk_events_template_id
      FOREIGN KEY (template_id)
      REFERENCES event_templates(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Index on template_id for fast FK lookups and join performance.
-- The sync route's template matchmaker queries events by template_id,
-- and every public feed query joins on this FK.
CREATE INDEX IF NOT EXISTS idx_events_template_id
  ON events (template_id);

-- =============================================================================
-- AFTER RUNNING THIS MIGRATION:
-- PostgREST needs to reload its schema cache to detect the new FK. Either:
--   1. Wait ~60 seconds (Supabase auto-reloads periodically), or
--   2. Run: NOTIFY pgrst, 'reload schema';
-- Then re-run the test script: node scripts/test-search-api.mjs
-- =============================================================================

-- Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
