-- Cleanup: remove OCR-duplicated events where the same artist appears twice
-- at the same venue on the same date (case-insensitive), keeping the row
-- that has a valid time and deleting the is_time_tbd duplicate.
--
-- Schema notes:
--   - Time is embedded in event_date (timestamp), not a separate column
--   - is_time_tbd = true means the scraper couldn't parse a time
--   - event_title holds the artist/event name
--
-- DRY RUN first — inspect the results before uncommenting the DELETE:

-- Step 1: Preview what will be deleted
SELECT
  d.id,
  d.event_title,
  d.event_date,
  d.is_time_tbd,
  v.name AS venue
FROM events d
JOIN venues v ON v.id = d.venue_id
WHERE d.is_time_tbd = true
  AND d.status = 'published'
  AND EXISTS (
    SELECT 1 FROM events k
    WHERE k.venue_id = d.venue_id
      AND k.event_date::date = d.event_date::date
      AND k.is_time_tbd IS NOT TRUE
      AND k.status = 'published'
      AND k.id != d.id
      AND LOWER(TRIM(k.event_title)) = LOWER(TRIM(d.event_title))
  )
ORDER BY d.event_date, v.name, d.event_title;

-- Step 2: Once confirmed, run the DELETE:
-- DELETE FROM events
-- WHERE id IN (
--   SELECT d.id
--   FROM events d
--   WHERE d.is_time_tbd = true
--     AND d.status = 'published'
--     AND EXISTS (
--       SELECT 1 FROM events k
--       WHERE k.venue_id = d.venue_id
--         AND k.event_date::date = d.event_date::date
--         AND k.is_time_tbd IS NOT TRUE
--         AND k.status = 'published'
--         AND k.id != d.id
--         AND LOWER(TRIM(k.event_title)) = LOWER(TRIM(d.event_title))
--     )
-- );
