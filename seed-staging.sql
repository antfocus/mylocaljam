-- ============================================================================
-- myLocalJam — Staging Seed Script
-- Run in Supabase SQL Editor against an EMPTY staging database
-- (schema must already be deployed)
-- ============================================================================

BEGIN;

-- ── 1. VENUES ───────────────────────────────────────────────────────────────

INSERT INTO venues (id, name, address, color, website, venue_type, latitude, longitude, tags) VALUES
  ('a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '913 Ocean Ave, Asbury Park, NJ 07712',
   '#E8722A',
   'https://stoneponyonline.com',
   'Venue',
   40.2201, -73.9976,
   ARRAY['live-music', 'indoor', 'outdoor', 'iconic']),

  ('a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '1213 Ocean Ave, Asbury Park, NJ 07712',
   '#3B82F6',
   'https://wonderbarasburypark.com',
   'Bar',
   40.2205, -73.9970,
   ARRAY['live-music', 'dog-friendly', 'outdoor']),

  ('a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '601 Main St, Asbury Park, NJ 07712',
   '#A855F7',
   'https://thesaintasburypark.com',
   'Venue',
   40.2207, -74.0003,
   ARRAY['live-music', 'intimate', 'indie']),

  ('a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '209 4th Ave, Asbury Park, NJ 07712',
   '#EC4899',
   'https://asburylanes.com',
   'Venue',
   40.2216, -74.0001,
   ARRAY['live-music', 'bowling', 'retro']),

  ('a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '711 Cookman Ave, Asbury Park, NJ 07712',
   '#22C55E',
   'https://dannyclinch.com',
   'Venue',
   40.2213, -73.9993,
   ARRAY['live-music', 'art', 'acoustic']);


-- ── 2. ARTISTS ──────────────────────────────────────────────────────────────

INSERT INTO artists (id, name, image_url, bio, genres, vibes, tags, is_tribute, metadata_source) VALUES
  ('b2000000-0000-0000-0000-000000000001',
   'Levy & the Oaks',
   'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
   'Jersey Shore roots-rock outfit blending Americana storytelling with E Street energy. Known for marathon three-hour sets that leave crowds hoarse.',
   ARRAY['Rock', 'Alternative'],
   ARRAY['High-Energy', 'Sing-Along'],
   'rock,americana,jersey shore,roots',
   false,
   'manual'),

  ('b2000000-0000-0000-0000-000000000002',
   'The Battery Electric',
   'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
   'High-octane indie rock trio from Asbury Park. Fuzz pedals, four-on-the-floor drums, and hooks that refuse to quit.',
   ARRAY['Alternative', 'Rock'],
   ARRAY['High-Energy', 'Dance Heavy'],
   'indie rock,garage,alternative',
   false,
   'manual'),

  ('b2000000-0000-0000-0000-000000000003',
   'Moonglow Collective',
   'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400',
   'Neo-soul and jazz fusion ensemble. Lush horns, silky vocals, and grooves that make you forget which decade you''re in.',
   ARRAY['Jazz/Blues', 'R&B/Soul'],
   ARRAY['Chill/Acoustic', 'Late Night'],
   'neo-soul,jazz fusion,r&b',
   false,
   'manual'),

  ('b2000000-0000-0000-0000-000000000004',
   'Pine Barrens',
   'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=400',
   'Atmospheric folk act weaving fingerpicked guitar with haunting harmonies. Their sound feels like a campfire on the edge of the world.',
   ARRAY['Country', 'Alternative'],
   ARRAY['Chill/Acoustic', 'Sing-Along'],
   'folk,acoustic,americana,indie folk',
   false,
   'manual'),

  ('b2000000-0000-0000-0000-000000000005',
   'Asbury Jukes Tribute',
   'https://images.unsplash.com/photo-1501612780327-45045538702b?w=400',
   'Faithful tribute to Southside Johnny & the Asbury Jukes. Full horn section, all the classics, and the soul of the Jersey Shore.',
   ARRAY['Rock', 'Tribute/Cover'],
   ARRAY['High-Energy', 'Sing-Along'],
   'tribute,cover,southside johnny,asbury jukes',
   true,
   'manual');


-- ── 3. EVENTS (10 upcoming, spread across venues & artists) ────────────────
--    Dates start from 2026-04-03 (a few days after "today" = 2026-03-31)
--    so they show up as upcoming in the feed.

INSERT INTO events (
  id, artist_name, artist_id, venue_id, venue_name, event_date,
  genre, vibe, cover, status, source, category, is_time_tbd
) VALUES

  -- Event 1: Levy & the Oaks @ Stone Pony — Fri Apr 3
  ('c3000000-0000-0000-0000-000000000001',
   'Levy & the Oaks',
   'b2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-04-03 20:00:00-04',
   'Rock', 'High-Energy', '$15', 'published', 'Seed', 'Live Music', false),

  -- Event 2: The Battery Electric @ The Saint — Sat Apr 4
  ('c3000000-0000-0000-0000-000000000002',
   'The Battery Electric',
   'b2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-04-04 21:00:00-04',
   'Alternative', 'High-Energy', '$10', 'published', 'Seed', 'Live Music', false),

  -- Event 3: Moonglow Collective @ Wonder Bar — Sat Apr 4
  ('c3000000-0000-0000-0000-000000000003',
   'Moonglow Collective',
   'b2000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-04-04 19:30:00-04',
   'Jazz/Blues', 'Chill/Acoustic', 'Free', 'published', 'Seed', 'Live Music', false),

  -- Event 4: Pine Barrens @ Transparent Gallery — Sun Apr 5
  ('c3000000-0000-0000-0000-000000000004',
   'Pine Barrens',
   'b2000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '2026-04-05 18:00:00-04',
   'Country', 'Chill/Acoustic', '$12', 'published', 'Seed', 'Live Music', false),

  -- Event 5: Asbury Jukes Tribute @ Asbury Lanes — Fri Apr 10
  ('c3000000-0000-0000-0000-000000000005',
   'Asbury Jukes Tribute',
   'b2000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-04-10 20:30:00-04',
   'Rock', 'High-Energy', '$20', 'published', 'Seed', 'Live Music', false),

  -- Event 6: Levy & the Oaks @ Wonder Bar — Sat Apr 11
  ('c3000000-0000-0000-0000-000000000006',
   'Levy & the Oaks',
   'b2000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-04-11 20:00:00-04',
   'Rock', 'Sing-Along', 'Free', 'published', 'Seed', 'Live Music', false),

  -- Event 7: The Battery Electric @ Asbury Lanes — Sat Apr 11
  ('c3000000-0000-0000-0000-000000000007',
   'The Battery Electric',
   'b2000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-04-11 21:30:00-04',
   'Alternative', 'Dance Heavy', '$10', 'published', 'Seed', 'Live Music', false),

  -- Event 8: Moonglow Collective @ Stone Pony — Fri Apr 17
  ('c3000000-0000-0000-0000-000000000008',
   'Moonglow Collective',
   'b2000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-04-17 19:00:00-04',
   'Jazz/Blues', 'Late Night', '$18', 'published', 'Seed', 'Live Music', false),

  -- Event 9: Pine Barrens @ The Saint — Sat Apr 18
  ('c3000000-0000-0000-0000-000000000009',
   'Pine Barrens',
   'b2000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-04-18 20:00:00-04',
   'Country', 'Sing-Along', '$8', 'published', 'Seed', 'Live Music', false),

  -- Event 10: Asbury Jukes Tribute @ Stone Pony — Sat Apr 25
  ('c3000000-0000-0000-0000-000000000010',
   'Asbury Jukes Tribute',
   'b2000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-04-25 20:00:00-04',
   'Rock', 'High-Energy', '$25', 'published', 'Seed', 'Live Music', false);


-- ── 4. VERIFY ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count INT; a_count INT; e_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM venues;
  SELECT count(*) INTO a_count FROM artists;
  SELECT count(*) INTO e_count FROM events;
  RAISE NOTICE '✅ Seed complete — % venues, % artists, % events', v_count, a_count, e_count;
END $$;

COMMIT;
