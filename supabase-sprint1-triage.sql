-- ============================================================
-- Sprint 1: Event Triage & Categorization
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

-- 1. Add triage_status to events — tracks whether an event has been reviewed
-- 'pending' = new from scraper, needs review
-- 'reviewed' = admin has categorized it
ALTER TABLE events ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'pending';

-- 2. Ensure category column exists (may already from prior migration)
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Live Music';

-- 3. Index for fast triage queries (pending events sorted by date)
CREATE INDEX IF NOT EXISTS idx_events_triage ON events(triage_status, event_date);

-- 4. Backfill: mark all existing events as 'reviewed' since they've been live
-- Only new scraped events going forward will be 'pending'
UPDATE events SET triage_status = 'reviewed' WHERE triage_status IS NULL OR triage_status = 'pending';

-- 5. Add category_type to admin PUT allowlist (handled in code, not SQL)
