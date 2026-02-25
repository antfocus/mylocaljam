-- ============================================================
-- MyLocalJam Database Setup
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================================

-- 1. VENUES TABLE
CREATE TABLE venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  color TEXT DEFAULT '#FF6B35',
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EVENTS TABLE
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  artist_bio TEXT,
  venue_id UUID REFERENCES venues(id),
  venue_name TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  genre TEXT,
  vibe TEXT,
  cover TEXT DEFAULT 'TBA',
  ticket_link TEXT,
  recurring BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft', 'cancelled')),
  source TEXT DEFAULT 'Admin',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SUBMISSIONS TABLE (community-submitted events)
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  genre TEXT,
  vibe TEXT,
  cover TEXT,
  artist_bio TEXT,
  notes TEXT,
  submitter_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. REPORTS TABLE (user-reported issues)
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. INSERT DEFAULT VENUES (Asbury Park)
INSERT INTO venues (name, address, color) VALUES
  ('The Stone Pony', '913 Ocean Ave, Asbury Park, NJ', '#E84855'),
  ('House of Independents', '572 Cookman Ave, Asbury Park, NJ', '#3185FC'),
  ('The Wonder Bar', '1213 Ocean Ave, Asbury Park, NJ', '#F9A620'),
  ('The Saint', '601 Main St, Asbury Park, NJ', '#23CE6B'),
  ('Asbury Lanes', '209 4th Ave, Asbury Park, NJ', '#A846A0'),
  ('Danny Clinch Transparent Gallery', '1300 Ocean Ave, Asbury Park, NJ', '#FF6B6B');

-- 6. ROW LEVEL SECURITY
-- Enable RLS on all tables
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Public read access for venues and published events
CREATE POLICY "Public can read venues" ON venues FOR SELECT USING (true);
CREATE POLICY "Public can read published events" ON events FOR SELECT USING (status = 'published');

-- Public can insert submissions and reports
CREATE POLICY "Public can submit events" ON submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can submit reports" ON reports FOR INSERT WITH CHECK (true);

-- Service role (admin) has full access (handled by service_role key bypassing RLS)

-- 7. INDEX FOR PERFORMANCE
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_venue ON events(venue_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_reports_status ON reports(status);

-- 8. AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
