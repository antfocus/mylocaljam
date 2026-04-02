-- ============================================================================
-- Fix remaining stale vibes: brute-force UPDATE with UNNEST dedup.
-- No helper functions, no PL/pgSQL. Pure SQL.
-- ============================================================================

-- ── artists.vibes ──────────────────────────────────────────────────────────

-- 'Late Night / Party' → 'High-Energy / Dance'
UPDATE artists
SET vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(vibes, 'Late Night / Party', 'High-Energy / Dance')
  ))
)
WHERE 'Late Night / Party' = ANY(vibes);

-- 'Energetic / Party' → 'High-Energy / Dance'
UPDATE artists
SET vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(vibes, 'Energetic / Party', 'High-Energy / Dance')
  ))
)
WHERE 'Energetic / Party' = ANY(vibes);

-- 'Acoustic / Intimate' → 'Chill / Low-Key'
UPDATE artists
SET vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(vibes, 'Acoustic / Intimate', 'Chill / Low-Key')
  ))
)
WHERE 'Acoustic / Intimate' = ANY(vibes);


-- ── events.custom_vibes ────────────────────────────────────────────────────

-- 'Late Night / Party' → 'High-Energy / Dance'
UPDATE events
SET custom_vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(custom_vibes, 'Late Night / Party', 'High-Energy / Dance')
  ))
)
WHERE 'Late Night / Party' = ANY(custom_vibes);

-- 'Energetic / Party' → 'High-Energy / Dance'
UPDATE events
SET custom_vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(custom_vibes, 'Energetic / Party', 'High-Energy / Dance')
  ))
)
WHERE 'Energetic / Party' = ANY(custom_vibes);

-- 'Acoustic / Intimate' → 'Chill / Low-Key'
UPDATE events
SET custom_vibes = (
  SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(
    array_replace(custom_vibes, 'Acoustic / Intimate', 'Chill / Low-Key')
  ))
)
WHERE 'Acoustic / Intimate' = ANY(custom_vibes);


-- ── Verification ───────────────────────────────────────────────────────────
-- Both queries should return 0 rows:

SELECT id, name, vibes FROM artists
WHERE vibes && ARRAY['Late Night / Party', 'Energetic / Party', 'Acoustic / Intimate'];

SELECT id, artist_name, custom_vibes FROM events
WHERE custom_vibes && ARRAY['Late Night / Party', 'Energetic / Party', 'Acoustic / Intimate'];
