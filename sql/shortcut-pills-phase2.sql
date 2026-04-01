-- ═══════════════════════════════════════════════════════════════════════════
-- myLocalJam — Shortcut Pills Phase 2: Discovery Shortcuts
-- Adds 5 new pills: Breweries, Karaoke, Trivia, Specials, Outdoor
-- Run in Supabase SQL Editor after taxonomy-translation.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO shortcut_pills (id, label, icon_name, filter_type, filter_config, sort_order, active) VALUES

  -- 11. Breweries — venue_type filter for Brewery venues
  ('e5000000-0000-0000-0000-000000000011',
   'Breweries',
   'sports_bar',
   'venue_type',
   '{"venue_types": ["Brewery", "Brewpub", "Taproom"]}',
   11, true),

  -- 12. Karaoke — keyword search in title, name, and description
  ('e5000000-0000-0000-0000-000000000012',
   'Karaoke',
   'karaoke_mic',
   'keyword',
   '{"terms": ["karaoke", "open mic karaoke", "sing along"]}',
   12, true),

  -- 13. Trivia — keyword search in title, name, and description
  ('e5000000-0000-0000-0000-000000000013',
   'Trivia',
   'quiz',
   'keyword',
   '{"terms": ["trivia", "pub quiz", "game night", "quiz night"]}',
   13, true),

  -- 14. Specials — keyword search matching event categories and titles
  ('e5000000-0000-0000-0000-000000000014',
   'Specials',
   'celebration',
   'keyword',
   '{"terms": ["special", "happy hour", "ladies night", "industry night", "wine night", "taco tuesday"]}',
   14, true),

  -- 15. Outdoor — vibes filter for Outdoor / Patio events
  ('e5000000-0000-0000-0000-000000000015',
   'Outdoor',
   'park',
   'vibes',
   '{"vibes": ["Outdoor / Patio"]}',
   15, true)

ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  icon_name = EXCLUDED.icon_name,
  filter_type = EXCLUDED.filter_type,
  filter_config = EXCLUDED.filter_config,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ── Verify ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pill_count INT;
BEGIN
  SELECT count(*) INTO pill_count FROM shortcut_pills WHERE active = true;
  RAISE NOTICE '';
  RAISE NOTICE '  Active shortcut pills: %', pill_count;
  RAISE NOTICE '  New pills: %', (
    SELECT string_agg(label, ', ' ORDER BY sort_order)
    FROM shortcut_pills
    WHERE id IN (
      'e5000000-0000-0000-0000-000000000011',
      'e5000000-0000-0000-0000-000000000012',
      'e5000000-0000-0000-0000-000000000013',
      'e5000000-0000-0000-0000-000000000014',
      'e5000000-0000-0000-0000-000000000015'
    )
  );
END $$;

COMMIT;
