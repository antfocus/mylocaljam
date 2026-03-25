-- ============================================================
-- My Jam Tables: user_saved_events & user_followed_artists
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Saved Events — user bookmarks individual events
CREATE TABLE IF NOT EXISTS user_saved_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_saved_events_user ON user_saved_events(user_id);

-- 2. Followed Artists — user follows an artist by name
--    Uses artist_name (text) rather than artist_id because scraped events
--    don't always have a matching artists table entry.
CREATE TABLE IF NOT EXISTS user_followed_artists (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_name             TEXT NOT NULL,
  receives_notifications  BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, artist_name)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_followed_artists_user ON user_followed_artists(user_id);

-- 3. RLS Policies — users can only read/write their own rows
ALTER TABLE user_saved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_followed_artists ENABLE ROW LEVEL SECURITY;

-- Saved events: users manage their own saves
CREATE POLICY "Users manage own saved events"
  ON user_saved_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Followed artists: users manage their own follows
CREATE POLICY "Users manage own followed artists"
  ON user_followed_artists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
