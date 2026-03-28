-- ============================================================================
-- Backfill image_source, bio_source, and metadata_source for existing artists
-- Run once in Supabase SQL Editor to stamp source columns based on URL patterns
-- ============================================================================

-- 1. Image source: detect from image_url patterns
-- Last.fm images
UPDATE artists
SET image_source = 'lastfm'
WHERE image_url ILIKE '%last.fm%'
  AND image_source IS NULL;

UPDATE artists
SET image_source = 'lastfm'
WHERE image_url ILIKE '%lastfm%'
  AND image_source IS NULL;

-- Discogs images
UPDATE artists
SET image_source = 'discogs'
WHERE image_url ILIKE '%discogs.com%'
  AND image_source IS NULL;

-- MusicBrainz / Cover Art Archive images
UPDATE artists
SET image_source = 'musicbrainz'
WHERE (image_url ILIKE '%musicbrainz.org%' OR image_url ILIKE '%coverartarchive.org%')
  AND image_source IS NULL;

-- Any remaining artists with images but no source → mark as scraped
UPDATE artists
SET image_source = 'scraped'
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND image_source IS NULL;

-- 2. Bio source: detect from metadata_source or content patterns
-- Artists enriched via Last.fm
UPDATE artists
SET bio_source = 'lastfm'
WHERE metadata_source = 'lastfm'
  AND bio IS NOT NULL
  AND bio != ''
  AND bio_source IS NULL;

-- Artists with manual edits
UPDATE artists
SET bio_source = 'manual'
WHERE metadata_source = 'manual'
  AND bio IS NOT NULL
  AND bio != ''
  AND bio_source IS NULL;

-- Artists enriched via AI
UPDATE artists
SET bio_source = 'ai_generated'
WHERE metadata_source = 'ai_generated'
  AND bio IS NOT NULL
  AND bio != ''
  AND bio_source IS NULL;

-- Any remaining artists with bios but no source → mark as scraped
UPDATE artists
SET bio_source = 'scraped'
WHERE bio IS NOT NULL
  AND bio != ''
  AND bio_source IS NULL;

-- 3. Stamp metadata_source for artists that have data but no source recorded
-- If they have a Last.fm image, they were enriched via Last.fm
UPDATE artists
SET metadata_source = 'lastfm'
WHERE (image_url ILIKE '%last.fm%' OR image_url ILIKE '%lastfm%')
  AND metadata_source IS NULL;

-- If they have a Discogs image
UPDATE artists
SET metadata_source = 'discogs'
WHERE image_url ILIKE '%discogs.com%'
  AND metadata_source IS NULL;

-- If they have a MusicBrainz image
UPDATE artists
SET metadata_source = 'musicbrainz'
WHERE (image_url ILIKE '%musicbrainz.org%' OR image_url ILIKE '%coverartarchive.org%')
  AND metadata_source IS NULL;

-- Remaining artists with any data → scraped
UPDATE artists
SET metadata_source = 'scraper'
WHERE (image_url IS NOT NULL OR (bio IS NOT NULL AND bio != ''))
  AND metadata_source IS NULL;

-- ============================================================================
-- Verification: Check distribution after running
-- ============================================================================
-- SELECT image_source, COUNT(*) FROM artists WHERE image_url IS NOT NULL GROUP BY image_source ORDER BY count DESC;
-- SELECT bio_source, COUNT(*) FROM artists WHERE bio IS NOT NULL AND bio != '' GROUP BY bio_source ORDER BY count DESC;
-- SELECT metadata_source, COUNT(*) FROM artists GROUP BY metadata_source ORDER BY count DESC;
