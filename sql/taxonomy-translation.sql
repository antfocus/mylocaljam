-- ═══════════════════════════════════════════════════════════════════════════
-- Taxonomy Translation Script — Genres & Vibes
-- Upgrades legacy tag strings in artists.genres[] and artists.vibes[]
-- to the new AI-optimized taxonomy. Leaves unrecognized strings untouched.
-- Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper function ────────────────────────────────────────────────────
-- Accepts a TEXT[] array and a set of (old_value, new_value) translation
-- pairs. For each element, if it matches an old_value it is replaced with
-- new_value; otherwise it passes through unchanged. The final array is
-- deduplicated (preserving first-occurrence order) so merges like
-- 'Rock' + 'Alternative' → 'Rock / Alternative' don't create duplicates.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _translate_tags(
  arr       TEXT[],
  old_vals  TEXT[],
  new_vals  TEXT[]
) RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result TEXT[] := '{}';
  elem   TEXT;
  idx    INT;
BEGIN
  IF arr IS NULL THEN RETURN NULL; END IF;

  FOREACH elem IN ARRAY arr LOOP
    -- Find this element in the old_vals lookup array
    idx := array_position(old_vals, elem);
    IF idx IS NOT NULL THEN
      elem := new_vals[idx];  -- translate it
    END IF;
    -- Deduplicate: only append if not already present
    IF NOT (elem = ANY(result)) THEN
      result := array_append(result, elem);
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- ─── Genre Translation ──────────────────────────────────────────────────
-- Map: old_value => new_value (parallel arrays, matched by index)
--   'Rock'            => 'Rock / Alternative'
--   'Alternative'     => 'Rock / Alternative'
--   'Pop'             => 'Pop / Dance / Top 40'
--   'Country'         => 'Country / Bluegrass'
--   'Reggae'          => 'Reggae / Island / Ska'
--   'Jazz/Blues'       => 'Jazz / Blues'
--   'R&B/Soul'        => 'R&B / Soul / Funk'
--   'Funk'            => 'R&B / Soul / Funk'
--   'Hip-Hop'         => 'Hip-Hop / Rap'
--   'EDM/DJ'          => 'Electronic / DJ'
--   'Metal/Punk'      => 'Metal / Hardcore'
--   'Folk/Americana'  => 'Folk / Americana / Singer-Songwriter'
--   'Latin'           => 'Latin / Reggaeton'
--   'Tribute/Cover'   => 'Pop / Dance / Top 40'
-- ─────────────────────────────────────────────────────────────────────────
UPDATE artists
SET genres = _translate_tags(
  genres,
  ARRAY[
    'Rock', 'Alternative',
    'Pop',
    'Country',
    'Reggae',
    'Jazz/Blues',
    'R&B/Soul', 'Funk',
    'Hip-Hop',
    'EDM/DJ',
    'Metal/Punk',
    'Folk/Americana',
    'Latin',
    'Tribute/Cover'
  ],
  ARRAY[
    'Rock / Alternative', 'Rock / Alternative',
    'Pop / Dance / Top 40',
    'Country / Bluegrass',
    'Reggae / Island / Ska',
    'Jazz / Blues',
    'R&B / Soul / Funk', 'R&B / Soul / Funk',
    'Hip-Hop / Rap',
    'Electronic / DJ',
    'Metal / Hardcore',
    'Folk / Americana / Singer-Songwriter',
    'Latin / Reggaeton',
    'Pop / Dance / Top 40'
  ]
)
WHERE genres IS NOT NULL AND array_length(genres, 1) > 0;

-- ─── Vibe Translation ───────────────────────────────────────────────────
-- Map:
--   'High-Energy'      => 'Energetic / Party'
--   'Dance Heavy'      => 'Energetic / Party'
--   'Chill/Acoustic'   => 'Acoustic / Intimate'
--   'Background Music'  => 'Acoustic / Intimate'
--   'Family Friendly'  => 'Family-Friendly'
--   'All Ages'         => 'Family-Friendly'
--   'Outdoors'         => 'Outdoor / Patio'
-- ─────────────────────────────────────────────────────────────────────────
UPDATE artists
SET vibes = _translate_tags(
  vibes,
  ARRAY[
    'High-Energy', 'Dance Heavy',
    'Chill/Acoustic', 'Background Music',
    'Family Friendly', 'All Ages',
    'Outdoors'
  ],
  ARRAY[
    'Energetic / Party', 'Energetic / Party',
    'Acoustic / Intimate', 'Acoustic / Intimate',
    'Family-Friendly', 'Family-Friendly',
    'Outdoor / Patio'
  ]
)
WHERE vibes IS NOT NULL AND array_length(vibes, 1) > 0;

-- ─── Cleanup: drop the helper function ──────────────────────────────────
DROP FUNCTION IF EXISTS _translate_tags(TEXT[], TEXT[], TEXT[]);

COMMIT;

-- ─── Verification Queries (run after to spot-check) ─────────────────────
-- Uncomment these to verify results:
--
-- SELECT name, genres FROM artists WHERE 'Rock' = ANY(genres) OR 'Alternative' = ANY(genres) LIMIT 10;
-- SELECT name, vibes FROM artists WHERE 'High-Energy' = ANY(vibes) OR 'Dance Heavy' = ANY(vibes) LIMIT 10;
-- SELECT DISTINCT unnest(genres) AS genre FROM artists ORDER BY genre;
-- SELECT DISTINCT unnest(vibes) AS vibe FROM artists ORDER BY vibe;
