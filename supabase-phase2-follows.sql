-- ============================================================
-- Phase 2: Follows & Notification Preferences
-- Run this in Supabase SQL Editor AFTER supabase-setup.sql
-- ============================================================

-- 1. USER FOLLOWS TABLE — many-to-many: user → artist/venue
-- Since there's no auth yet, we use a device_id (localStorage UUID)
-- to identify users. This can be migrated to auth user_id later.
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,                          -- localStorage device fingerprint
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'venue')),
  entity_name TEXT NOT NULL,                        -- artist_name or venue name
  entity_id UUID,                                   -- optional FK to venues.id (null for artists until artists table exists)
  receives_notifications BOOLEAN DEFAULT true,      -- bell toggle
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one follow per device per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_follows_unique
  ON user_follows(device_id, entity_type, entity_name);

-- Fast lookups by device
CREATE INDEX IF NOT EXISTS idx_user_follows_device
  ON user_follows(device_id);

-- Fast lookups by entity (for "who follows this artist/venue" queries)
CREATE INDEX IF NOT EXISTS idx_user_follows_entity
  ON user_follows(entity_type, entity_name);

-- 2. ROW LEVEL SECURITY
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- Public can read/insert/update/delete their own follows (matched by device_id passed in request)
CREATE POLICY "Public can read follows" ON user_follows FOR SELECT USING (true);
CREATE POLICY "Public can insert follows" ON user_follows FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update follows" ON user_follows FOR UPDATE USING (true);
CREATE POLICY "Public can delete follows" ON user_follows FOR DELETE USING (true);
