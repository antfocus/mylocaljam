-- ============================================================
-- Scraper Memory & Deduplication
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

-- 1. IGNORED ARTISTS TABLE — blacklist for deleted/fake artists
-- The scraper checks this before creating new artist profiles
CREATE TABLE IF NOT EXISTS ignored_artists (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  name_lower  TEXT NOT NULL,                    -- lowercase for fast matching
  reason      TEXT DEFAULT 'admin_deleted',     -- why it was blacklisted
  deleted_by  TEXT DEFAULT 'admin',             -- who deleted it
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_artists_name
  ON ignored_artists(name_lower);

-- RLS: service role only (no public access needed)
ALTER TABLE ignored_artists ENABLE ROW LEVEL SECURITY;

-- 2. Add is_human_edited flag to EVENTS table
-- When an admin manually changes category, unlinks artist, etc. — the scraper will never overwrite it
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_human_edited BOOLEAN DEFAULT false;

-- 3. Backfill: mark events that were manually categorized as human-edited
-- (events where triage_status is 'reviewed' and category was manually set)
-- Conservative: only mark events that have been explicitly categorized as non-Live-Music
UPDATE events SET is_human_edited = true
WHERE is_human_edited = false
  AND triage_status = 'reviewed'
  AND category IS NOT NULL
  AND category != 'Live Music';
