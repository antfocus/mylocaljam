-- ═══════════════════════════════════════════════════════════════════════════
-- Taxonomy Flat-18 Migration — Genres
-- Migrates legacy compound-label genres to the flat 18-item canonical list.
--
-- New canonical (18): Rock, Pop, Country, Acoustic, Cover Band, DJ,
--   Electronic, Jazz, Blues, Reggae, R&B, Hip Hop, Latin, Emo, Punk, Metal,
--   Indie, Folk
--
-- Touches:
--   • artists.genres          TEXT[]   (multi-valued, array)
--   • events.custom_genres    TEXT[]   (multi-valued array override)
--   • events.genre            TEXT     (single-valued, scalar — LOSSY)
--
-- Safe to run multiple times: unrecognized strings pass through, results
-- are deduplicated, and already-canonical strings are left alone.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Helper: translate a TEXT[] with 1-to-N expansion ──────────────────
-- old_vals[i] matches → produces new_vals[i] split on ';'. Unknown elements
-- pass through untouched. Output is deduplicated in first-seen order so a
-- 1-to-N split ('Jazz;Blues') never creates duplicates with existing values.
CREATE OR REPLACE FUNCTION _flat18_translate(
  arr       TEXT[],
  old_vals  TEXT[],
  new_vals  TEXT[]
) RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result  TEXT[] := '{}';
  elem    TEXT;
  idx     INT;
  parts   TEXT[];
  piece   TEXT;
BEGIN
  IF arr IS NULL THEN RETURN NULL; END IF;

  FOREACH elem IN ARRAY arr LOOP
    idx := array_position(old_vals, elem);
    IF idx IS NOT NULL THEN
      parts := string_to_array(new_vals[idx], ';');
      FOREACH piece IN ARRAY parts LOOP
        IF piece IS NOT NULL AND piece <> '' AND NOT (piece = ANY(result)) THEN
          result := array_append(result, piece);
        END IF;
      END LOOP;
    ELSE
      IF NOT (elem = ANY(result)) THEN
        result := array_append(result, elem);
      END IF;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- Scalar version for events.genre (TEXT). LOSSY: 'Jazz / Blues' → 'Jazz'
-- (first element of the split). If you need to preserve both, promote the
-- row to custom_genres[] before running this migration.
CREATE OR REPLACE FUNCTION _flat18_translate_scalar(
  val       TEXT,
  old_vals  TEXT[],
  new_vals  TEXT[]
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  idx   INT;
  parts TEXT[];
BEGIN
  IF val IS NULL OR TRIM(val) = '' THEN RETURN val; END IF;
  idx := array_position(old_vals, val);
  IF idx IS NULL THEN RETURN val; END IF;
  parts := string_to_array(new_vals[idx], ';');
  RETURN parts[1];
END;
$$;


-- ─── 2. artists.genres (TEXT[]) ───────────────────────────────────────────
UPDATE artists
SET genres = _flat18_translate(
  genres,
  ARRAY[
    -- Compact-slash legacy (pre-taxonomy-translation rows)
    'Jazz/Blues','R&B/Soul','EDM/DJ','Tribute/Cover',
    'Alternative','Jam Band','Hip-Hop','Latin',
    -- Spaced-slash labels written by sql/taxonomy-translation.sql (current DB)
    'Rock / Alternative','Pop / Dance / Top 40','Country / Bluegrass',
    'Reggae / Island / Ska','Jazz / Blues','R&B / Soul / Funk',
    'Hip-Hop / Rap','Electronic / DJ','Metal / Hardcore',
    'Folk / Americana / Singer-Songwriter','Punk / Ska','Acoustic / Intimate',
    'Latin / Reggaeton',
    -- Older utils.js-era labels that may still exist on untouched rows
    'Yacht Rock / Surf','Acoustic / Singer-Songwriter','Reggae / Island',
    'Jam / Psych','Tributes / Covers','Pop / Top 40','Country / Americana',
    'Latin / World'
  ],
  ARRAY[
    'Jazz;Blues','R&B','Electronic;DJ','Cover Band',
    'Rock','Rock','Hip Hop','Latin',
    'Rock','Pop','Country',
    'Reggae','Jazz;Blues','R&B',
    'Hip Hop','Electronic;DJ','Metal',
    'Folk','Punk','Acoustic',
    'Latin',
    'Rock','Acoustic','Reggae',
    'Rock','Cover Band','Pop','Country',
    'Latin'
  ]
)
WHERE genres IS NOT NULL AND array_length(genres, 1) > 0;


-- ─── 3. events.custom_genres (TEXT[]) ─────────────────────────────────────
UPDATE events
SET custom_genres = _flat18_translate(
  custom_genres,
  ARRAY[
    'Jazz/Blues','R&B/Soul','EDM/DJ','Tribute/Cover',
    'Alternative','Jam Band','Hip-Hop','Latin',
    'Rock / Alternative','Pop / Dance / Top 40','Country / Bluegrass',
    'Reggae / Island / Ska','Jazz / Blues','R&B / Soul / Funk',
    'Hip-Hop / Rap','Electronic / DJ','Metal / Hardcore',
    'Folk / Americana / Singer-Songwriter','Punk / Ska','Acoustic / Intimate',
    'Latin / Reggaeton',
    'Yacht Rock / Surf','Acoustic / Singer-Songwriter','Reggae / Island',
    'Jam / Psych','Tributes / Covers','Pop / Top 40','Country / Americana',
    'Latin / World'
  ],
  ARRAY[
    'Jazz;Blues','R&B','Electronic;DJ','Cover Band',
    'Rock','Rock','Hip Hop','Latin',
    'Rock','Pop','Country',
    'Reggae','Jazz;Blues','R&B',
    'Hip Hop','Electronic;DJ','Metal',
    'Folk','Punk','Acoustic',
    'Latin',
    'Rock','Acoustic','Reggae',
    'Rock','Cover Band','Pop','Country',
    'Latin'
  ]
)
WHERE custom_genres IS NOT NULL AND array_length(custom_genres, 1) > 0;


-- ─── 4. events.genre (TEXT — single-valued, LOSSY) ────────────────────────
UPDATE events
SET genre = _flat18_translate_scalar(
  genre,
  ARRAY[
    'Jazz/Blues','R&B/Soul','EDM/DJ','Tribute/Cover',
    'Alternative','Jam Band','Hip-Hop','Latin',
    'Rock / Alternative','Pop / Dance / Top 40','Country / Bluegrass',
    'Reggae / Island / Ska','Jazz / Blues','R&B / Soul / Funk',
    'Hip-Hop / Rap','Electronic / DJ','Metal / Hardcore',
    'Folk / Americana / Singer-Songwriter','Punk / Ska','Acoustic / Intimate',
    'Latin / Reggaeton',
    'Yacht Rock / Surf','Acoustic / Singer-Songwriter','Reggae / Island',
    'Jam / Psych','Tributes / Covers','Pop / Top 40','Country / Americana',
    'Latin / World'
  ],
  ARRAY[
    'Jazz;Blues','R&B','Electronic;DJ','Cover Band',
    'Rock','Rock','Hip Hop','Latin',
    'Rock','Pop','Country',
    'Reggae','Jazz;Blues','R&B',
    'Hip Hop','Electronic;DJ','Metal',
    'Folk','Punk','Acoustic',
    'Latin',
    'Rock','Acoustic','Reggae',
    'Rock','Cover Band','Pop','Country',
    'Latin'
  ]
)
WHERE genre IS NOT NULL AND TRIM(genre) <> '';


-- ─── 5. Cleanup helpers ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _flat18_translate(TEXT[], TEXT[], TEXT[]);
DROP FUNCTION IF EXISTS _flat18_translate_scalar(TEXT, TEXT[], TEXT[]);

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- POST-FLIGHT VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════
-- After COMMIT, run the query below. Anything returned is a leftover label
-- that wasn't covered by the translation map and needs a follow-up decision.
--
-- SELECT g, SUM(n) AS occurrences FROM (
--   SELECT unnest(genres) AS g, 1 AS n FROM artists WHERE genres IS NOT NULL
--   UNION ALL
--   SELECT unnest(custom_genres), 1 FROM events WHERE custom_genres IS NOT NULL
--   UNION ALL
--   SELECT genre, 1 FROM events WHERE genre IS NOT NULL AND TRIM(genre) <> ''
-- ) t
-- WHERE g NOT IN (
--   'Rock','Pop','Country','Acoustic','Cover Band','DJ','Electronic',
--   'Jazz','Blues','Reggae','R&B','Hip Hop','Latin','Emo','Punk','Metal',
--   'Indie','Folk'
-- )
-- GROUP BY g
-- ORDER BY occurrences DESC, g;
