-- =============================================================================
-- Migration: event_series table + FK from events.series_id -> event_series.id
-- Date: 2026-04-21
-- Purpose: Give festivals, town concert series, parades, and other named
--          multi-event umbrellas their own first-class parent row, replacing
--          the current free-text `events.event_title` grouping convention.
-- =============================================================================
--
-- CONTEXT:
-- Today, the "Festivals & Event Titles" admin tab groups events by
-- `events.event_title` (free text). Every admin-approved submission with an
-- OCR-extracted event_name ends up with event_title set, which pollutes the
-- tab — a show called "Kevin Hill and Sandy Mack" is not a festival.
--
-- This migration introduces a real parent entity (event_series) with its own
-- banner, description, date range, category, and optional ticket URL. Each
-- event row gets a nullable FK (series_id) pointing at the parent. The old
-- event_title column is retained for backward compat; a follow-up audit
-- backfills existing event_title values into event_series rows or NULLs them.
--
-- CATEGORIES:
--   'festival'        — Sea Hear Now, Asbury Park Reggae Fest, etc.
--   'concert_series'  — Manasquan Beach Concerts, Belmar Summer Sounds, etc.
--   'parade'          — Belmar Parade Day, St. Patrick's Day Parade, etc.
--   'other'           — catch-all for named umbrellas that don't fit above
--
-- Category is required (NOT NULL). 'other' is the safe fallback.
-- =============================================================================

-- ── 1. event_series table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_series (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  category     text NOT NULL
                 CHECK (category IN ('festival','concert_series','parade','other')),
  banner_url   text,
  description  text,
  start_date   date,
  end_date     date,
  venue_id     uuid REFERENCES venues(id) ON DELETE SET NULL,
  ticket_url   text,
  website_url  text,
  tags         text[] NOT NULL DEFAULT ARRAY[]::text[],
  status       text NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','draft','canceled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive name lookup for find-or-create at approval time
CREATE INDEX IF NOT EXISTS idx_event_series_name_lower
  ON event_series (lower(name));

CREATE INDEX IF NOT EXISTS idx_event_series_status
  ON event_series (status);

CREATE INDEX IF NOT EXISTS idx_event_series_category
  ON event_series (category);

-- ── 2. updated_at trigger ──────────────────────────────────────────────────
-- Keep updated_at fresh on every UPDATE so the admin UI can sort/display it.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_series_updated_at ON event_series;
CREATE TRIGGER trg_event_series_updated_at
  BEFORE UPDATE ON event_series
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

-- ── 3. events.series_id column + FK ────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS series_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_events_series_id'
      AND table_name = 'events'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT fk_events_series_id
      FOREIGN KEY (series_id)
      REFERENCES event_series(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Partial index — most events won't have a series_id, so skip NULLs
CREATE INDEX IF NOT EXISTS idx_events_series_id
  ON events (series_id)
  WHERE series_id IS NOT NULL;

-- ── 4. RLS ────────────────────────────────────────────────────────────────
-- Enable RLS on event_series. Public reads allowed wide-open (matching the
-- pattern used on artists / venues / event_templates); writes are gated by
-- service role (admin API routes use the service key, which bypasses RLS).
-- Status filtering is handled at the application layer in the fetch routes.
ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_series_public_read" ON event_series;
CREATE POLICY "event_series_public_read"
  ON event_series FOR SELECT
  USING (true);

-- =============================================================================
-- AFTER RUNNING THIS MIGRATION:
--   1. NOTIFY pgrst, 'reload schema';   -- or wait ~60s for auto-reload
--   2. The new events -> event_series FK enables PostgREST embedded selects
--      like: events?select=*,event_series(name,banner_url,category)
--   3. Existing events.event_title values are untouched — Phase 2 audit
--      handles the backfill.
-- =============================================================================
