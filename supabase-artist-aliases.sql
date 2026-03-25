-- Artist Aliases — tracks old/scraped names so the scraper doesn't create duplicates
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS artist_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_lower TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: same alias can't point to two different artists
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_aliases_lower
  ON artist_aliases (alias_lower);

-- Fast lookup index for scraper
CREATE INDEX IF NOT EXISTS idx_artist_aliases_artist_id
  ON artist_aliases (artist_id);

-- RLS: service role bypasses, no public access needed
ALTER TABLE artist_aliases ENABLE ROW LEVEL SECURITY;
