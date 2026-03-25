-- Scraper Health Tracking
-- Stores the result of each scraper run per venue

CREATE TABLE IF NOT EXISTS scraper_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scraper_key TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  events_found INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'fail', 'warning')),
  error_message TEXT,
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only keep the latest row per scraper (upsert by scraper_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_health_key
  ON scraper_health (scraper_key);

ALTER TABLE scraper_health ENABLE ROW LEVEL SECURITY;
