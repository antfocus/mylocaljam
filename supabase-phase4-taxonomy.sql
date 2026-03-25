-- ============================================================
-- MyLocalJam — Phase 4: Database Taxonomy & Dynamic Pills
-- Run this in Supabase SQL Editor BEFORE deploying the code changes
-- Safe to re-run (all statements are idempotent)
-- ============================================================

-- ─── 1. VENUES: Add venue_type and tags ──────────────────────
-- venue_type = single classification (e.g., 'Brewery', 'Beach Bar', 'Restaurant')
-- tags = flexible array for multi-label (e.g., {'outdoor', 'food', 'craft-beer'})
ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ─── 2. ARTISTS: Add is_tribute boolean ──────────────────────
-- genres TEXT[] and vibes TEXT[] already exist from prior migration
-- is_tribute distinguishes cover/tribute bands from original artists
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_tribute BOOLEAN DEFAULT false;

-- ─── 3. EVENTS: Add artist_id foreign key ────────────────────
-- Links each event to its canonical artist row for relational joins
ALTER TABLE events ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES artists(id);
CREATE INDEX IF NOT EXISTS idx_events_artist_id ON events(artist_id);

-- ─── 4. SHORTCUT PILLS TABLE ─────────────────────────────────
-- Dynamic, admin-managed filter pills for the search UI
CREATE TABLE IF NOT EXISTS shortcut_pills (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label        TEXT NOT NULL,                       -- Display text: "Beach Bars"
  icon_name    TEXT NOT NULL DEFAULT 'label',       -- Material icon name: "beach_access"
  filter_type  TEXT NOT NULL DEFAULT 'search',      -- One of: 'venue_type', 'genre', 'search', 'trending', 'is_tribute', 'time'
  filter_config JSONB NOT NULL DEFAULT '{}',        -- Type-specific config (see examples below)
  sort_order   INT NOT NULL DEFAULT 0,              -- Display order (ascending)
  active       BOOLEAN NOT NULL DEFAULT true,       -- Toggle on/off without deleting
  seasonal_start DATE,                              -- Optional: auto-activate on this date
  seasonal_end   DATE,                              -- Optional: auto-deactivate after this date
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: public read, admin write
ALTER TABLE shortcut_pills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active pills"
  ON shortcut_pills FOR SELECT
  USING (true);
-- Service role (admin) has full write access via service_role key

-- ─── 5. BACKFILL: Link existing events to artists ────────────
-- One-time: for each event with an artist_name, find the matching artist
-- row and set the FK. Safe to re-run.
UPDATE events e
SET artist_id = a.id
FROM artists a
WHERE lower(trim(e.artist_name)) = lower(trim(a.name))
  AND e.artist_id IS NULL;

-- ─── 6. SEED VENUES with venue_type ──────────────────────────
-- Update known venues with their types (safe to re-run, uses WHERE clause)
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%beach haus%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%bar anticipation%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%martell%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%reef%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%boatyard%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%palmetto%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Beach Bar'  WHERE lower(name) LIKE '%sun harbor%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Brewery'    WHERE lower(name) LIKE '%bakes brewing%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Brewery'    WHERE lower(name) LIKE '%asbury park brewery%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Brewery'    WHERE lower(name) LIKE '%wild air%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Restaurant' WHERE lower(name) LIKE '%jamian%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Restaurant' WHERE lower(name) LIKE '%marina grille%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Restaurant' WHERE lower(name) LIKE '%cabin%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Restaurant' WHERE lower(name) LIKE '%tenth ave burrito%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Restaurant' WHERE lower(name) LIKE '%idle hour%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Bar'        WHERE lower(name) LIKE '%pig%parrot%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Bar'        WHERE lower(name) LIKE '%joe%s surf shack%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Bar'        WHERE lower(name) LIKE '%st. stephen%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Bar'        WHERE lower(name) LIKE '%mccann%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Venue'      WHERE lower(name) LIKE '%stone pony%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Venue'      WHERE lower(name) LIKE '%house of independents%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Venue'      WHERE lower(name) LIKE '%wonder bar%' AND venue_type IS NULL;
UPDATE venues SET venue_type = 'Venue'      WHERE lower(name) LIKE '%asbury lanes%' AND venue_type IS NULL;

-- ─── 7. SEED SHORTCUT PILLS ─────────────────────────────────
-- Initial 6 pills + 1 seasonal example (St. Patty's)
--
-- filter_type + filter_config combos:
--   'trending'    → {} (code sorts by event count per venue)
--   'venue_type'  → {"venue_types": ["Beach Bar"]}
--   'genre'       → {"genres": ["Rock", "Acoustic"]}
--   'search'      → {"terms": ["tribute", "cover band"]}
--   'is_tribute'  → {} (filters artists where is_tribute = true)
--   'time'        → {"before_hour": 17} (afternoon sets)

INSERT INTO shortcut_pills (label, icon_name, filter_type, filter_config, sort_order, active)
VALUES
  ('Trending',      'local_fire_department', 'trending',   '{}',                                                   1, true),
  ('Beach Bars',    'beach_access',          'venue_type', '{"venue_types": ["Beach Bar"]}',                        2, true),
  ('Breweries',     'sports_bar',            'venue_type', '{"venue_types": ["Brewery"]}',                          3, true),
  ('Tribute Bands', 'music_note',            'is_tribute', '{}',                                                    4, true),
  ('Acoustic',      'mic',                   'genre',      '{"genres": ["Acoustic"], "terms": ["acoustic", "solo", "singer songwriter", "unplugged", "open mic"]}', 5, true),
  ('Food & Music',  'restaurant',            'venue_type', '{"venue_types": ["Restaurant"]}',                       6, true)
ON CONFLICT DO NOTHING;

-- Additional utility pills
INSERT INTO shortcut_pills (label, icon_name, filter_type, filter_config, sort_order, active)
VALUES
  ('Karaoke',  'karaoke_mic',  'search', '{"terms": ["karaoke", "open mic", "sing"]}',                              7, true),
  ('Trivia',   'quiz',         'search', '{"terms": ["trivia", "quiz", "game night", "bingo"]}',                     8, true),
  ('Specials', 'local_offer',  'search', '{"terms": ["special", "happy hour", "ladies night", "wing", "taco"]}',     9, true)
ON CONFLICT DO NOTHING;

-- Seasonal pill — St. Patrick's (Mar 1–22 to cover Belmar parade weekend)
INSERT INTO shortcut_pills (label, icon_name, filter_type, filter_config, sort_order, active, seasonal_start, seasonal_end)
VALUES
  ('St. Pattys', 'sports_bar', 'search', '{"terms": ["st. patrick", "irish", "celtic", "shamrock", "paddy", "patty", "green"]}', 0, true, '2026-03-01', '2026-03-22')
ON CONFLICT DO NOTHING;
