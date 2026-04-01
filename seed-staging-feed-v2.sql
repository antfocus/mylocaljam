-- ============================================================================
-- myLocalJam — Feed Seed v2: 10 new artists + 10 regular events
-- Run in Supabase SQL Editor
-- ============================================================================

BEGIN;

-- ── 1. Ensure photo_url column exists on venues ────────────────────────────
ALTER TABLE venues ADD COLUMN IF NOT EXISTS photo_url TEXT;


-- ── 2. Ten new artists ─────────────────────────────────────────────────────

INSERT INTO artists (id, name, image_url, bio, genres, vibes, tags, is_tribute, metadata_source) VALUES

  ('b2000000-0000-0000-0000-000000000101',
   'Saltwater Sons',
   'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400',
   'Beach-town Americana band with lap steel, upright bass, and three-part harmonies that hit like a shore breeze.',
   ARRAY['Rock', 'Country'],
   ARRAY['Chill/Acoustic', 'Sing-Along'],
   'americana,shore rock,roots', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000102',
   'Neon Parkway',
   'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400',
   'Synth-driven indie pop duo from Red Bank. Drum machines, arpeggiated bass lines, and vocals drenched in reverb.',
   ARRAY['Alternative', 'Pop'],
   ARRAY['Dance Heavy', 'Late Night'],
   'synth pop,indie,electronic', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000103',
   'Brass & Bones',
   'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400',
   'Seven-piece brass-funk ensemble. Trombone solos, pocket grooves, and enough energy to power the boardwalk lights.',
   ARRAY['Jazz/Blues', 'R&B/Soul'],
   ARRAY['High-Energy', 'Dance Heavy'],
   'funk,brass,jazz,soul', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000104',
   'Concrete Flowers',
   'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400',
   'Post-punk four-piece channeling angular guitars and brooding baritone vocals. Dark, danceable, deliberate.',
   ARRAY['Alternative', 'Rock'],
   ARRAY['High-Energy', 'Late Night'],
   'post-punk,indie rock,darkwave', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000105',
   'The Milk Crates',
   'https://images.unsplash.com/photo-1529518969858-8baa65152fc8?w=400',
   'Garage-rock revivalists playing fast, loud, and slightly out of tune on purpose. Three chords and the truth.',
   ARRAY['Rock', 'Alternative'],
   ARRAY['High-Energy', 'Sing-Along'],
   'garage rock,punk,lo-fi', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000106',
   'Velvet Dusk',
   'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
   'Smoky jazz vocalist backed by keys and stand-up bass. Torch songs, Cole Porter covers, and originals that feel like old friends.',
   ARRAY['Jazz/Blues'],
   ARRAY['Chill/Acoustic', 'Late Night'],
   'jazz vocals,torch song,standards', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000107',
   'Shore Thing',
   'https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=400',
   'Reggae-rock party band built for summer. Steel drums meet power chords, every set ends with the crowd on stage.',
   ARRAY['Reggae', 'Rock'],
   ARRAY['High-Energy', 'Dance Heavy'],
   'reggae rock,ska,surf', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000108',
   'Ghost Pavilion',
   'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=400',
   'Ambient electronic project layering field recordings, modular synth, and processed guitar into cinematic soundscapes.',
   ARRAY['EDM/DJ', 'Alternative'],
   ARRAY['Chill/Acoustic', 'Background Music'],
   'ambient,electronic,experimental', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000109',
   'River Foxes',
   'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400',
   'Indie folk trio with banjo, cello, and voice. Songs about leaving home and the long drive back.',
   ARRAY['Country', 'Alternative'],
   ARRAY['Chill/Acoustic', 'Sing-Along'],
   'indie folk,folk,acoustic', false, 'manual'),

  ('b2000000-0000-0000-0000-000000000110',
   'Full Send Brass Band',
   'https://images.unsplash.com/photo-1504704911898-68304a7d2571?w=400',
   'New Orleans-style street brass band that relocated to the Shore. Second lines, bounce beats, and pure joy.',
   ARRAY['Jazz/Blues', 'R&B/Soul'],
   ARRAY['High-Energy', 'Dance Heavy'],
   'brass band,new orleans,funk', true, 'manual')

ON CONFLICT (id) DO NOTHING;


-- ── 3. Ten regular feed events for 2026-03-31 ─────────────────────────────
--    All linked to the NEW artists above. Spread across all 5 venues.

INSERT INTO events (
  id, artist_name, artist_id, venue_id, venue_name, event_date,
  genre, vibe, cover, status, source, category, is_time_tbd
) VALUES

  -- 1. Saltwater Sons @ Wonder Bar — 2 PM (afternoon patio set)
  ('d4000000-0000-0000-0000-000000000101',
   'Saltwater Sons',
   'b2000000-0000-0000-0000-000000000101',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-03-31 14:00:00-04',
   'Rock', 'Chill/Acoustic', 'Free', 'published', 'Seed', 'Live Music', false),

  -- 2. Neon Parkway @ Asbury Lanes — 5 PM (early synth set)
  ('d4000000-0000-0000-0000-000000000102',
   'Neon Parkway',
   'b2000000-0000-0000-0000-000000000102',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-03-31 17:00:00-04',
   'Alternative', 'Dance Heavy', '$8', 'published', 'Seed', 'Live Music', false),

  -- 3. Brass & Bones @ Stone Pony — 6 PM (happy hour funk)
  ('d4000000-0000-0000-0000-000000000103',
   'Brass & Bones',
   'b2000000-0000-0000-0000-000000000103',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-03-31 18:00:00-04',
   'Jazz/Blues', 'High-Energy', '$10', 'published', 'Seed', 'Live Music', false),

  -- 4. Concrete Flowers @ The Saint — 7 PM
  ('d4000000-0000-0000-0000-000000000104',
   'Concrete Flowers',
   'b2000000-0000-0000-0000-000000000104',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-03-31 19:00:00-04',
   'Alternative', 'High-Energy', '$12', 'published', 'Seed', 'Live Music', false),

  -- 5. The Milk Crates @ Asbury Lanes — 7:30 PM
  ('d4000000-0000-0000-0000-000000000105',
   'The Milk Crates',
   'b2000000-0000-0000-0000-000000000105',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-03-31 19:30:00-04',
   'Rock', 'High-Energy', '$8', 'published', 'Seed', 'Live Music', false),

  -- 6. Velvet Dusk @ Transparent Gallery — 8 PM (intimate jazz)
  ('d4000000-0000-0000-0000-000000000106',
   'Velvet Dusk',
   'b2000000-0000-0000-0000-000000000106',
   'a1000000-0000-0000-0000-000000000005',
   'Danny Clinch Transparent Gallery',
   '2026-03-31 20:00:00-04',
   'Jazz/Blues', 'Chill/Acoustic', '$15', 'published', 'Seed', 'Live Music', false),

  -- 7. Shore Thing @ Wonder Bar — 8:30 PM (reggae rock party)
  ('d4000000-0000-0000-0000-000000000107',
   'Shore Thing',
   'b2000000-0000-0000-0000-000000000107',
   'a1000000-0000-0000-0000-000000000002',
   'Wonder Bar',
   '2026-03-31 20:30:00-04',
   'Reggae', 'Dance Heavy', '$10', 'published', 'Seed', 'Live Music', false),

  -- 8. Ghost Pavilion @ The Saint — 9 PM (ambient late show)
  ('d4000000-0000-0000-0000-000000000108',
   'Ghost Pavilion',
   'b2000000-0000-0000-0000-000000000108',
   'a1000000-0000-0000-0000-000000000003',
   'The Saint',
   '2026-03-31 21:00:00-04',
   'EDM/DJ', 'Chill/Acoustic', '$10', 'published', 'Seed', 'Live Music', false),

  -- 9. River Foxes @ Stone Pony — 9:30 PM (folk headliner)
  ('d4000000-0000-0000-0000-000000000109',
   'River Foxes',
   'b2000000-0000-0000-0000-000000000109',
   'a1000000-0000-0000-0000-000000000001',
   'The Stone Pony',
   '2026-03-31 21:30:00-04',
   'Country', 'Sing-Along', '$18', 'published', 'Seed', 'Live Music', false),

  -- 10. Full Send Brass Band @ Asbury Lanes — 10 PM (late-night closer)
  ('d4000000-0000-0000-0000-000000000110',
   'Full Send Brass Band',
   'b2000000-0000-0000-0000-000000000110',
   'a1000000-0000-0000-0000-000000000004',
   'Asbury Lanes',
   '2026-03-31 22:00:00-04',
   'Jazz/Blues', 'High-Energy', '$12', 'published', 'Seed', 'Live Music', false)

ON CONFLICT (id) DO NOTHING;


-- ── 4. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  a_count INT; e_today INT; e_total INT; v_photo BOOLEAN;
BEGIN
  SELECT count(*) INTO a_count  FROM artists;
  SELECT count(*) INTO e_today  FROM events WHERE event_date >= '2026-03-31' AND event_date < '2026-04-01' AND status = 'published';
  SELECT count(*) INTO e_total  FROM events WHERE status = 'published';
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venues' AND column_name = 'photo_url') INTO v_photo;

  RAISE NOTICE '';
  RAISE NOTICE '── Seed v2 Verification ────────────────────────';
  RAISE NOTICE '  Total artists:          %', a_count;
  RAISE NOTICE '  Today''s feed events:    %', e_today;
  RAISE NOTICE '  Total published events:  %', e_total;
  RAISE NOTICE '  venues.photo_url:        %', CASE WHEN v_photo THEN '✅' ELSE '❌' END;
  RAISE NOTICE '────────────────────────────────────────────────';
END $$;

COMMIT;
