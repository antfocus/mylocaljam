-- ============================================================
-- Genre & Vibe Migration: Map freeform text → controlled vocabulary
-- Run in Supabase SQL Editor
--
-- New Genres: Rock, Pop, Country, Reggae, Jazz/Blues, R&B/Soul,
--             Hip-Hop, EDM/DJ, Tribute/Cover, Alternative, Jam Band
-- New Vibes:  High-Energy, Chill/Acoustic, Dance Heavy, Sing-Along,
--             Background Music, Family Friendly, Late Night
-- ============================================================

-- Helper function: map a single old genre string to the new vocabulary
CREATE OR REPLACE FUNCTION _migrate_genre(old_val TEXT) RETURNS TEXT AS $$
DECLARE
  v TEXT := LOWER(TRIM(old_val));
BEGIN
  -- Exact or near-exact matches
  IF v IN ('rock', 'classic rock', 'rock and roll', 'rock & roll', 'hard rock', 'soft rock') THEN RETURN 'Rock'; END IF;
  IF v IN ('pop', 'pop rock', 'synth pop', 'synthpop', 'power pop') THEN RETURN 'Pop'; END IF;
  IF v IN ('country', 'country music', 'country rock', 'americana', 'outlaw country') THEN RETURN 'Country'; END IF;
  IF v IN ('reggae', 'ska', 'ska punk', 'reggae rock', 'dub') THEN RETURN 'Reggae'; END IF;
  IF v IN ('jazz', 'blues', 'jazz/blues', 'jazz blues', 'smooth jazz', 'blues rock', 'soul jazz', 'funk jazz') THEN RETURN 'Jazz/Blues'; END IF;
  IF v IN ('r&b', 'r&b/soul', 'rnb', 'soul', 'neo soul', 'motown', 'funk', 'r & b') THEN RETURN 'R&B/Soul'; END IF;
  IF v IN ('hip hop', 'hip-hop', 'rap', 'hiphop', 'hip hop/rap', 'trap') THEN RETURN 'Hip-Hop'; END IF;
  IF v IN ('dj', 'edm', 'electronic', 'edm/dj', 'house', 'techno', 'dance', 'electronica', 'dubstep') THEN RETURN 'EDM/DJ'; END IF;
  IF v IN ('cover band', 'tribute', 'tribute/cover', 'covers', 'cover', 'tribute band', 'tribute act') THEN RETURN 'Tribute/Cover'; END IF;
  IF v IN ('alternative', 'alt rock', 'alt-rock', 'indie', 'indie rock', 'indie pop', 'grunge') THEN RETURN 'Alternative'; END IF;
  IF v IN ('jam band', 'jam', 'jamband', 'jam rock', 'progressive rock', 'prog rock', 'psychedelic') THEN RETURN 'Jam Band'; END IF;
  -- Catch remaining known terms that map clearly
  IF v IN ('folk', 'folk rock', 'singer-songwriter', 'singer songwriter') THEN RETURN 'Country'; END IF;
  IF v IN ('acoustic', 'unplugged') THEN RETURN 'Alternative'; END IF;
  IF v IN ('punk', 'punk rock', 'emo', 'hardcore', 'post punk', 'post-punk') THEN RETURN 'Rock'; END IF;
  IF v IN ('metal', 'heavy metal', 'thrash', 'death metal') THEN RETURN 'Rock'; END IF;
  -- Catch-all: anything unrecognized → Alternative
  RETURN 'Alternative';
END;
$$ LANGUAGE plpgsql;

-- Helper function: map a single old vibe string to the new vocabulary
CREATE OR REPLACE FUNCTION _migrate_vibe(old_val TEXT) RETURNS TEXT AS $$
DECLARE
  v TEXT := LOWER(TRIM(old_val));
BEGIN
  IF v IN ('high energy', 'high-energy', 'energetic', 'hype', 'rowdy') THEN RETURN 'High-Energy'; END IF;
  IF v IN ('chill', 'chill/acoustic', 'acoustic', 'mellow', 'laid back', 'laid-back', 'relaxed', 'easy listening') THEN RETURN 'Chill/Acoustic'; END IF;
  IF v IN ('dance party', 'dance heavy', 'dance', 'dancing', 'club') THEN RETURN 'Dance Heavy'; END IF;
  IF v IN ('sing-along', 'sing along', 'singalong', 'karaoke', 'crowd participation') THEN RETURN 'Sing-Along'; END IF;
  IF v IN ('background music', 'background', 'ambient', 'dinner music', 'lounge') THEN RETURN 'Background Music'; END IF;
  IF v IN ('family friendly', 'family-friendly', 'all ages', 'kid friendly', 'kids') THEN RETURN 'Family Friendly'; END IF;
  IF v IN ('late night', 'late-night', 'after hours', 'heavy', 'intense', 'dark', 'gritty') THEN RETURN 'Late Night'; END IF;
  -- Catch-all: anything unrecognized → High-Energy (most common default)
  RETURN 'High-Energy';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ARTISTS TABLE: migrate genres[] and vibes[] arrays
-- ============================================================

-- Step 1: Migrate genres (array column)
UPDATE artists
SET genres = (
  SELECT ARRAY(
    SELECT DISTINCT _migrate_genre(elem)
    FROM unnest(genres) AS elem
    WHERE elem IS NOT NULL AND TRIM(elem) <> ''
  )
)
WHERE genres IS NOT NULL AND array_length(genres, 1) > 0;

-- Step 2: Migrate vibes (array column)
UPDATE artists
SET vibes = (
  SELECT ARRAY(
    SELECT DISTINCT _migrate_vibe(elem)
    FROM unnest(vibes) AS elem
    WHERE elem IS NOT NULL AND TRIM(elem) <> ''
  )
)
WHERE vibes IS NOT NULL AND array_length(vibes, 1) > 0;

-- ============================================================
-- EVENTS TABLE: migrate genre and vibe (single text columns)
-- ============================================================

UPDATE events
SET genre = _migrate_genre(genre)
WHERE genre IS NOT NULL AND TRIM(genre) <> '';

UPDATE events
SET vibe = _migrate_vibe(vibe)
WHERE vibe IS NOT NULL AND TRIM(vibe) <> '';

-- ============================================================
-- Verification: check for any values that didn't migrate cleanly
-- ============================================================

-- Check artists genres
SELECT DISTINCT unnest(genres) AS genre, COUNT(*)
FROM artists
WHERE genres IS NOT NULL
GROUP BY genre
ORDER BY genre;

-- Check artists vibes
SELECT DISTINCT unnest(vibes) AS vibe, COUNT(*)
FROM artists
WHERE vibes IS NOT NULL
GROUP BY vibe
ORDER BY vibe;

-- Check events genre
SELECT DISTINCT genre, COUNT(*)
FROM events
WHERE genre IS NOT NULL
GROUP BY genre
ORDER BY genre;

-- Check events vibe
SELECT DISTINCT vibe, COUNT(*)
FROM events
WHERE vibe IS NOT NULL
GROUP BY vibe
ORDER BY vibe;

-- ============================================================
-- Cleanup: drop helper functions
-- ============================================================
DROP FUNCTION IF EXISTS _migrate_genre(TEXT);
DROP FUNCTION IF EXISTS _migrate_vibe(TEXT);
