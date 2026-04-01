-- ═══════════════════════════════════════════════════════════════════════════
-- myLocalJam — Shortcut Pills: Clean Table Reset
-- Wipes all legacy pills and inserts only the definitive Big 5.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Nuke everything
TRUNCATE shortcut_pills;

-- 2. Insert the Big 5
INSERT INTO shortcut_pills (id, label, icon_name, filter_type, filter_config, sort_order, active) VALUES

  ('e5000000-0000-0000-0000-000000000011',
   'Breweries',
   'sports_bar',
   'venue_type',
   '{"venue_types": ["Brewery", "Brewpub", "Taproom"]}',
   1, true),

  ('e5000000-0000-0000-0000-000000000012',
   'Karaoke',
   'karaoke_mic',
   'keyword',
   '{"terms": ["karaoke", "open mic karaoke", "sing along"]}',
   2, true),

  ('e5000000-0000-0000-0000-000000000013',
   'Trivia',
   'quiz',
   'keyword',
   '{"terms": ["trivia", "pub quiz", "game night", "quiz night"]}',
   3, true),

  ('e5000000-0000-0000-0000-000000000014',
   'Specials',
   'celebration',
   'keyword',
   '{"terms": ["special", "happy hour", "ladies night", "industry night", "wine night", "taco tuesday"]}',
   4, true),

  ('e5000000-0000-0000-0000-000000000015',
   'Outdoor',
   'park',
   'vibes',
   '{"vibes": ["Outdoor / Patio"]}',
   5, true);

COMMIT;

-- 3. Verify
SELECT id, label, filter_type, sort_order, active FROM shortcut_pills ORDER BY sort_order;
