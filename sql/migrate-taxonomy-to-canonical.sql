-- ============================================================================
-- Taxonomy Migration: Map old genre/vibe values → canonical 15-genre / 6-vibe list
-- Run BEFORE deploying the updated ai-lookup route and AdminArtistsTab code.
-- Safe to re-run (idempotent).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: Replace a value in a TEXT[] column, deduplicating the result.
-- If old_val is present, it is removed and new_val is added (if not already there).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _migrate_array_tag(
  arr TEXT[],
  old_val TEXT,
  new_val TEXT
) RETURNS TEXT[] AS $$
DECLARE
  cleaned TEXT[];
BEGIN
  IF arr IS NULL THEN RETURN NULL; END IF;
  -- Remove the old value
  cleaned := array_remove(arr, old_val);
  -- Add the new value only if it isn't already present
  IF new_val IS NOT NULL AND NOT (new_val = ANY(cleaned)) THEN
    cleaned := array_append(cleaned, new_val);
  END IF;
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. ARTISTS TABLE — vibes column
-- ════════════════════════════════════════════════════════════════════════════

-- Mapping: 'Acoustic / Intimate' → 'Chill / Low-Key'
UPDATE artists
SET vibes = _migrate_array_tag(vibes, 'Acoustic / Intimate', 'Chill / Low-Key')
WHERE vibes @> ARRAY['Acoustic / Intimate'];

-- Mapping: 'Late Night / Party' → 'High-Energy / Dance'
UPDATE artists
SET vibes = _migrate_array_tag(vibes, 'Late Night / Party', 'High-Energy / Dance')
WHERE vibes @> ARRAY['Late Night / Party'];


-- ════════════════════════════════════════════════════════════════════════════
-- 2. ARTISTS TABLE — genres column (old AI values → canonical)
--    These are the stale values the old ALLOWED_GENRES list could have written.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE artists SET genres = _migrate_array_tag(genres, 'Rock',          'Rock / Alternative')    WHERE genres @> ARRAY['Rock'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Alternative',   'Rock / Alternative')    WHERE genres @> ARRAY['Alternative'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Pop',           'Pop / Top 40')          WHERE genres @> ARRAY['Pop'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Country',       'Country / Americana')   WHERE genres @> ARRAY['Country'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Reggae',        'Reggae / Island')       WHERE genres @> ARRAY['Reggae'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Jazz/Blues',    'Jazz / Blues')           WHERE genres @> ARRAY['Jazz/Blues'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'R&B/Soul',      'R&B / Soul / Funk')     WHERE genres @> ARRAY['R&B/Soul'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Hip-Hop',       'Hip-Hop / Rap')         WHERE genres @> ARRAY['Hip-Hop'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'EDM/DJ',        'Electronic / DJ')       WHERE genres @> ARRAY['EDM/DJ'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Tribute/Cover', 'Tributes / Covers')     WHERE genres @> ARRAY['Tribute/Cover'];
UPDATE artists SET genres = _migrate_array_tag(genres, 'Jam Band',      'Jam / Psych')           WHERE genres @> ARRAY['Jam Band'];

-- Also handle old vibes from the stale ALLOWED_VIBES list
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'High-Energy',      'High-Energy / Dance')   WHERE vibes @> ARRAY['High-Energy'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Chill/Acoustic',   'Chill / Low-Key')       WHERE vibes @> ARRAY['Chill/Acoustic'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Dance Heavy',      'High-Energy / Dance')   WHERE vibes @> ARRAY['Dance Heavy'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Sing-Along',       'High-Energy / Dance')   WHERE vibes @> ARRAY['Sing-Along'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Background Music', 'Chill / Low-Key')       WHERE vibes @> ARRAY['Background Music'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Family Friendly',  'Family-Friendly')       WHERE vibes @> ARRAY['Family Friendly'];
UPDATE artists SET vibes = _migrate_array_tag(vibes, 'Late Night',       'Late Night / Party')    WHERE vibes @> ARRAY['Late Night'];


-- ════════════════════════════════════════════════════════════════════════════
-- 3. EVENTS TABLE — custom_vibes column
-- ════════════════════════════════════════════════════════════════════════════

-- Mapping: 'Acoustic / Intimate' → 'Chill / Low-Key'
UPDATE events
SET custom_vibes = _migrate_array_tag(custom_vibes, 'Acoustic / Intimate', 'Chill / Low-Key')
WHERE custom_vibes @> ARRAY['Acoustic / Intimate'];

-- Mapping: 'Late Night / Party' → 'High-Energy / Dance'
UPDATE events
SET custom_vibes = _migrate_array_tag(custom_vibes, 'Late Night / Party', 'High-Energy / Dance')
WHERE custom_vibes @> ARRAY['Late Night / Party'];

-- Old stale vibes (same mappings as artists)
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'High-Energy',      'High-Energy / Dance')   WHERE custom_vibes @> ARRAY['High-Energy'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Chill/Acoustic',   'Chill / Low-Key')       WHERE custom_vibes @> ARRAY['Chill/Acoustic'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Dance Heavy',      'High-Energy / Dance')   WHERE custom_vibes @> ARRAY['Dance Heavy'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Sing-Along',       'High-Energy / Dance')   WHERE custom_vibes @> ARRAY['Sing-Along'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Background Music', 'Chill / Low-Key')       WHERE custom_vibes @> ARRAY['Background Music'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Family Friendly',  'Family-Friendly')       WHERE custom_vibes @> ARRAY['Family Friendly'];
UPDATE events SET custom_vibes = _migrate_array_tag(custom_vibes, 'Late Night',       'Late Night / Party')    WHERE custom_vibes @> ARRAY['Late Night'];


-- ════════════════════════════════════════════════════════════════════════════
-- 4. EVENTS TABLE — custom_genres column (same old→new mappings)
-- ════════════════════════════════════════════════════════════════════════════

UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Rock',          'Rock / Alternative')    WHERE custom_genres @> ARRAY['Rock'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Alternative',   'Rock / Alternative')    WHERE custom_genres @> ARRAY['Alternative'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Pop',           'Pop / Top 40')          WHERE custom_genres @> ARRAY['Pop'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Country',       'Country / Americana')   WHERE custom_genres @> ARRAY['Country'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Reggae',        'Reggae / Island')       WHERE custom_genres @> ARRAY['Reggae'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Jazz/Blues',    'Jazz / Blues')           WHERE custom_genres @> ARRAY['Jazz/Blues'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'R&B/Soul',      'R&B / Soul / Funk')     WHERE custom_genres @> ARRAY['R&B/Soul'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Hip-Hop',       'Hip-Hop / Rap')         WHERE custom_genres @> ARRAY['Hip-Hop'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'EDM/DJ',        'Electronic / DJ')       WHERE custom_genres @> ARRAY['EDM/DJ'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Tribute/Cover', 'Tributes / Covers')     WHERE custom_genres @> ARRAY['Tribute/Cover'];
UPDATE events SET custom_genres = _migrate_array_tag(custom_genres, 'Jam Band',      'Jam / Psych')           WHERE custom_genres @> ARRAY['Jam Band'];


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Cleanup: drop the helper function
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS _migrate_array_tag(TEXT[], TEXT, TEXT);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Verification (run after COMMIT to spot-check)
-- ════════════════════════════════════════════════════════════════════════════

-- Should return 0 rows if all old values are migrated:
SELECT id, name, genres, vibes FROM artists
WHERE genres && ARRAY['Rock','Pop','Country','Reggae','Jazz/Blues','R&B/Soul','Hip-Hop','EDM/DJ','Tribute/Cover','Alternative','Jam Band']
   OR vibes  && ARRAY['Acoustic / Intimate','Late Night / Party','High-Energy','Chill/Acoustic','Dance Heavy','Sing-Along','Background Music','Family Friendly','Late Night'];

SELECT id, artist_name, custom_genres, custom_vibes FROM events
WHERE custom_genres && ARRAY['Rock','Pop','Country','Reggae','Jazz/Blues','R&B/Soul','Hip-Hop','EDM/DJ','Tribute/Cover','Alternative','Jam Band']
   OR custom_vibes  && ARRAY['Acoustic / Intimate','Late Night / Party','High-Energy','Chill/Acoustic','Dance Heavy','Sing-Along','Background Music','Family Friendly','Late Night'];
