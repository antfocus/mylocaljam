-- ============================================================================
-- myLocalJam — Shortcut Pills Seed for Staging
-- Run in Supabase SQL Editor
-- Populates the horizontal filter pill row in the search/filter panel.
-- ============================================================================

BEGIN;

INSERT INTO shortcut_pills (id, label, icon_name, filter_type, filter_config, sort_order, active) VALUES

  -- 1. Trending (top venues by event density)
  ('e5000000-0000-0000-0000-000000000001',
   'Trending',
   'local_fire_department',
   'trending',
   '{}',
   1, true),

  -- 2. Rock
  ('e5000000-0000-0000-0000-000000000002',
   'Rock',
   'music_note',
   'genre',
   '{"genres": ["Rock"], "terms": ["rock"]}',
   2, true),

  -- 3. Alternative / Indie
  ('e5000000-0000-0000-0000-000000000003',
   'Indie',
   'music_note',
   'genre',
   '{"genres": ["Alternative"], "terms": ["indie", "alternative"]}',
   3, true),

  -- 4. Jazz & Blues
  ('e5000000-0000-0000-0000-000000000004',
   'Jazz',
   'music_note',
   'genre',
   '{"genres": ["Jazz/Blues"], "terms": ["jazz", "blues", "soul"]}',
   4, true),

  -- 5. Acoustic / Chill
  ('e5000000-0000-0000-0000-000000000005',
   'Acoustic',
   'mic',
   'search',
   '{"terms": ["acoustic", "chill", "folk", "singer"]}',
   5, true),

  -- 6. Tribute Bands
  ('e5000000-0000-0000-0000-000000000006',
   'Tributes',
   'music_note',
   'is_tribute',
   '{}',
   6, true),

  -- 7. Free Shows
  ('e5000000-0000-0000-0000-000000000007',
   'Free Shows',
   'local_offer',
   'search',
   '{"terms": ["free"]}',
   7, true),

  -- 8. Beach Bars (venue type filter)
  ('e5000000-0000-0000-0000-000000000008',
   'Beach Bars',
   'beach_access',
   'venue_type',
   '{"venue_types": ["Beach Bar"]}',
   8, true),

  -- 9. Happy Hour / Early Shows (before 7 PM)
  ('e5000000-0000-0000-0000-000000000009',
   'Happy Hour',
   'schedule',
   'time',
   '{"before_hour": 19}',
   9, true),

  -- 10. Reggae & Funk
  ('e5000000-0000-0000-0000-000000000010',
   'Reggae',
   'music_note',
   'genre',
   '{"genres": ["Reggae", "R&B/Soul"], "terms": ["reggae", "funk", "ska"]}',
   10, true)

ON CONFLICT (id) DO NOTHING;


-- ── Verify ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pill_count INT;
BEGIN
  SELECT count(*) INTO pill_count FROM shortcut_pills WHERE active = true;
  RAISE NOTICE '';
  RAISE NOTICE '  Active shortcut pills: %', pill_count;
  RAISE NOTICE '  Labels: %', (SELECT string_agg(label, ', ' ORDER BY sort_order) FROM shortcut_pills WHERE active = true);
END $$;

COMMIT;
