-- Spotlight Events: Manual admin-pinned events for the hero carousel
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS spotlight_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  spotlight_date DATE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- One event can only be pinned once per date
  UNIQUE(event_id, spotlight_date)
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_spotlight_date ON spotlight_events(spotlight_date);

-- Enable RLS (service role key bypasses it, anon key blocked)
ALTER TABLE spotlight_events ENABLE ROW LEVEL SECURITY;

-- Allow public read access (the GET endpoint uses admin client anyway, but just in case)
CREATE POLICY "Public can read spotlight" ON spotlight_events
  FOR SELECT USING (true);
