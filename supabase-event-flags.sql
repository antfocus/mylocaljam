-- ============================================================
-- MyLocalJam: Event Flag Columns Migration
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================================

-- 1. ADD FLAG COUNT COLUMNS TO EVENTS
-- These track crowdsourced reports. They do NOT change the public UI.
-- Admin reviews flags manually before changing event status.
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancel_flag_count INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_flag_count INTEGER DEFAULT 0;

-- 2. VERIFY
-- SELECT id, artist_name, status, cancel_flag_count, cover_flag_count FROM events LIMIT 10;
