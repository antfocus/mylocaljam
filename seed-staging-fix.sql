-- ============================================================================
-- myLocalJam — Staging Fix: RLS policies + tonight's events + spotlight pins
-- Run in Supabase SQL Editor AFTER the main seed script
-- ============================================================================

BEGIN;

-- ── 1. FIX RLS GAPS ────────────────────────────────────────────────────────
--    If RLS is enabled on artists but no public SELECT policy exists,
--    the frontend Supabase client (anon key) gets empty joins.
--    These are safe to run even if the policies already exist.

DO $$ BEGIN
  -- Ensure artists table is readable by public (anon key)
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'artists'
    AND rowsecurity = true
  ) THEN
    RAISE NOTICE 'artists table has RLS enabled — ensuring public SELECT policy exists';
  END IF;
END $$;

-- Drop-if-exists + recreate pattern (idempotent)
DROP POLICY IF EXISTS "Public can read artists" ON artists;
CREATE POLICY "Public can read artists" ON artists FOR SELECT USING (true);

-- Same safety net for venues (should already exist, but just in case)
DROP POLICY IF EXISTS "Public can read venues" ON venues;
CREATE POLICY "Public can read venues" ON venues FOR SELECT USING (true);

-- Ensure the permissive events policy is in place (not just 'published')
DROP POLICY IF EXISTS "Public can read published events" ON events;
DROP POLICY IF EXISTS "Public can read events" ON events;
CREATE POLICY "Public can read events" ON events FOR SELECT
  USING (status IS NULL OR status <> 'draft');


-- ── 2. ADD EVENTS FOR TONIGHT (2026-03-31) ─────────────────────────────────
--    The spotlight API only looks at events happening on the requested date.
--    Without tonight's events, every tier in the waterfall returns [].

INSERT INTO events (
  id, artist_name, artist_id, venue_id, venue_name, event_date,
  genre, vibe, cover, status, source, category, is_time_tbd
) VALUES
  -- Tonight @ Stone Pony — 8 PM
  ('c3000000-0000-0000-0000-000000000011',
   'Levy & the Oaks',
   'b2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-03-31 20:00:00-04',
   'Rock', 'High-Energy', '$15', 'published', 'Seed', 'Live Music', false),

  -- Tonight @ Wonder Bar — 7:30 PM
  ('c3000000-0000-0000-0000-000000000012',
   'Moonglow Collective',
   'b2000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-03-31 19:30:00-04',
   'Jazz/Blues', 'Chill/Acoustic', 'Free', 'published', 'Seed', 'Live Music', false),

  -- Tonight @ The Saint — 9 PM
  ('c3000000-0000-0000-0000-000000000013',
   'The Battery Electric',
   'b2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-03-31 21:00:00-04',
   'Alternative', 'High-Energy', '$10', 'published', 'Seed', 'Live Music', false),

  -- Tomorrow @ Asbury Lanes — 8:30 PM (gives the feed depth for "upcoming")
  ('c3000000-0000-0000-0000-000000000014',
   'Pine Barrens',
   'b2000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-04-01 20:30:00-04',
   'Country', 'Chill/Acoustic', '$12', 'published', 'Seed', 'Live Music', false),

  -- Tomorrow @ Transparent Gallery — 7 PM
  ('c3000000-0000-0000-0000-000000000015',
   'Asbury Jukes Tribute',
   'b2000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '2026-04-01 19:00:00-04',
   'Rock', 'Sing-Along', '$20', 'published', 'Seed', 'Live Music', false)

ON CONFLICT (id) DO NOTHING;


-- ── 3. PIN TONIGHT'S EVENTS TO THE SPOTLIGHT ────────────────────────────────
--    This populates the hero carousel via Tier 0 of the spotlight API.

INSERT INTO spotlight_events (event_id, spotlight_date, sort_order) VALUES
  ('c3000000-0000-0000-0000-000000000012', '2026-03-31', 0),  -- Moonglow @ Wonder Bar (7:30)
  ('c3000000-0000-0000-0000-000000000011', '2026-03-31', 1),  -- Levy @ Stone Pony (8:00)
  ('c3000000-0000-0000-0000-000000000013', '2026-03-31', 2)   -- Battery Electric @ Saint (9:00)
ON CONFLICT DO NOTHING;


-- ── 4. VERIFY ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  tonight_count INT;
  spotlight_count INT;
  total_events INT;
  policy_count INT;
BEGIN
  SELECT count(*) INTO tonight_count FROM events
    WHERE event_date >= '2026-03-31' AND event_date < '2026-04-01' AND status = 'published';
  SELECT count(*) INTO spotlight_count FROM spotlight_events
    WHERE spotlight_date = '2026-03-31';
  SELECT count(*) INTO total_events FROM events WHERE status = 'published';
  SELECT count(*) INTO policy_count FROM pg_policies
    WHERE tablename IN ('events', 'venues', 'artists') AND cmd = 'SELECT';

  RAISE NOTICE '';
  RAISE NOTICE '── Verification ──────────────────────────────────';
  RAISE NOTICE '  Tonight''s events:    %', tonight_count;
  RAISE NOTICE '  Spotlight pins:       %', spotlight_count;
  RAISE NOTICE '  Total published:      %', total_events;
  RAISE NOTICE '  SELECT RLS policies:  % (need ≥ 3 for events/venues/artists)', policy_count;
  RAISE NOTICE '──────────────────────────────────────────────────';
END $$;

COMMIT;
