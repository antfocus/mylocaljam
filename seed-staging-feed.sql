-- ============================================================================
-- myLocalJam — 10 Regular Feed Events for 2026-03-31
-- Run in Supabase SQL Editor AFTER the main seed + fix scripts
-- These do NOT go into spotlight_events — they populate the scrollable feed.
-- ============================================================================

BEGIN;

-- ── Option A: Add the missing photo_url column to venues ────────────────────
-- The fetchEvents query in page.js selects venues(... photo_url ...) which
-- will cause a Supabase 400 error if this column doesn't exist.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ── 10 regular feed events for today (2026-03-31) ──────────────────────────
-- Spread across all 5 venues and all 5 artists, varied genres and times.

INSERT INTO events (
  id, artist_name, artist_id, venue_id, venue_name, event_date,
  genre, vibe, cover, status, source, category, is_time_tbd
) VALUES

  -- 1. Afternoon acoustic @ Transparent Gallery — 2 PM
  ('d4000000-0000-0000-0000-000000000001',
   'Pine Barrens',
   'b2000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '2026-03-31 14:00:00-04',
   'Country', 'Chill/Acoustic', 'Free', 'published', 'Seed', 'Live Music', false),

  -- 2. Happy hour jazz @ Wonder Bar — 5 PM
  ('d4000000-0000-0000-0000-000000000002',
   'Moonglow Collective',
   'b2000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-03-31 17:00:00-04',
   'Jazz/Blues', 'Chill/Acoustic', 'Free', 'published', 'Seed', 'Live Music', false),

  -- 3. Early show @ The Saint — 6 PM
  ('d4000000-0000-0000-0000-000000000003',
   'The Battery Electric',
   'b2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-03-31 18:00:00-04',
   'Alternative', 'High-Energy', '$8', 'published', 'Seed', 'Live Music', false),

  -- 4. Tribute night @ Asbury Lanes — 7 PM
  ('d4000000-0000-0000-0000-000000000004',
   'Asbury Jukes Tribute',
   'b2000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-03-31 19:00:00-04',
   'Rock', 'Sing-Along', '$15', 'published', 'Seed', 'Live Music', false),

  -- 5. Rock showcase @ Stone Pony — 7:30 PM
  ('d4000000-0000-0000-0000-000000000005',
   'Levy & the Oaks',
   'b2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-03-31 19:30:00-04',
   'Rock', 'High-Energy', '$12', 'published', 'Seed', 'Live Music', false),

  -- 6. Late jazz @ Transparent Gallery — 8 PM
  ('d4000000-0000-0000-0000-000000000006',
   'Moonglow Collective',
   'b2000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '2026-03-31 20:00:00-04',
   'Jazz/Blues', 'Late Night', '$10', 'published', 'Seed', 'Live Music', false),

  -- 7. Indie night @ The Saint — 8:30 PM
  ('d4000000-0000-0000-0000-000000000007',
   'The Battery Electric',
   'b2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-03-31 20:30:00-04',
   'Alternative', 'Dance Heavy', '$10', 'published', 'Seed', 'Live Music', false),

  -- 8. Headliner @ Stone Pony — 9 PM
  ('d4000000-0000-0000-0000-000000000008',
   'Levy & the Oaks',
   'b2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-03-31 21:00:00-04',
   'Rock', 'Sing-Along', '$20', 'published', 'Seed', 'Live Music', false),

  -- 9. Folk set @ Wonder Bar — 9:30 PM
  ('d4000000-0000-0000-0000-000000000009',
   'Pine Barrens',
   'b2000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-03-31 21:30:00-04',
   'Country', 'Chill/Acoustic', '$5', 'published', 'Seed', 'Live Music', false),

  -- 10. Late-night cover set @ Asbury Lanes — 10 PM
  ('d4000000-0000-0000-0000-000000000010',
   'Asbury Jukes Tribute',
   'b2000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-03-31 22:00:00-04',
   'Rock', 'High-Energy', '$15', 'published', 'Seed', 'Live Music', false)

ON CONFLICT (id) DO NOTHING;


-- ── Verify ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  feed_count INT;
  spotlight_count INT;
BEGIN
  SELECT count(*) INTO feed_count FROM events
    WHERE event_date >= '2026-03-31' AND event_date < '2026-04-01' AND status = 'published';
  SELECT count(*) INTO spotlight_count FROM spotlight_events
    WHERE spotlight_date = '2026-03-31';
  RAISE NOTICE '';
  RAISE NOTICE '  Today''s published events: %  (includes spotlight + feed)', feed_count;
  RAISE NOTICE '  Spotlight pins:            %  (hero carousel only)', spotlight_count;
  RAISE NOTICE '  Regular feed events:       %', feed_count - spotlight_count;

  -- Check that photo_url column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venues' AND column_name = 'photo_url'
  ) THEN
    RAISE NOTICE '  venues.photo_url column:   ✅ exists';
  ELSE
    RAISE WARNING '  venues.photo_url column:   ❌ MISSING — fetchEvents will fail!';
  END IF;
END $$;

COMMIT;
