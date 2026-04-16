-- ═════════════════════════════════════════════════════════════════════════
-- Forensic query: why are 5 events on 2026-04-21 showing as "Human-locked"?
-- ═════════════════════════════════════════════════════════════════════════
-- Paste the whole file into the Supabase SQL editor and run. Four result
-- sets come back, in order: (A) matched events, (B) update-time cluster,
-- (C) linked artist lock state, (D) linked venue link timing.
--
-- All reads only. Safe to run in production.
-- ═════════════════════════════════════════════════════════════════════════

-- ── (A) Per-row state: timestamps + lock flags + venue/artist FK ──────────
-- One row per matched event. Look for identical updated_at values and the
-- gap between created_at and updated_at. A tight cluster (< 60s span across
-- all 5 rows) strongly suggests a single bulk write — almost certainly one
-- of the known write sites in the codebase.
SELECT
  e.id,
  e.artist_name,
  e.event_title,
  e.event_date,
  e.created_at,
  e.updated_at,
  e.is_human_edited    AS event_is_human_edited,
  e.is_locked          AS event_is_locked,
  e.venue_id,
  e.artist_id,
  e.status,
  -- Eastern-time readable columns for the human eye.
  to_char(e.updated_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI:SS TZ') AS updated_at_et,
  to_char(e.created_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI:SS TZ') AS created_at_et,
  -- Seconds between create and update — tiny gaps mean "set on insert",
  -- big gaps mean "touched later by a cron/bulk op".
  EXTRACT(EPOCH FROM (e.updated_at - e.created_at))::int AS secs_since_create
FROM events e
WHERE e.event_date >= '2026-04-21 04:00:00+00'
  AND e.event_date <  '2026-04-22 04:00:00+00'
  AND e.status = 'published'
  AND (
       e.artist_name ILIKE '%Spring Wine Dinner%'
    OR e.event_title ILIKE '%Spring Wine Dinner%'
    OR e.artist_name ILIKE '%Al Holmes%'
    OR e.event_title ILIKE '%Al Holmes%'
    OR e.artist_name ILIKE '%Frankie%'
    OR e.event_title ILIKE '%Frankie%'
    OR e.artist_name ILIKE '%Karaoke%'
    OR e.event_title ILIKE '%Karaoke%'
    OR e.artist_name ILIKE '%Stan Steele%'
    OR e.event_title ILIKE '%Stan Steele%'
  )
ORDER BY e.updated_at ASC;


-- ── (B) Cluster view: group by updated_at bucketed to the minute ──────────
-- If 5 events share the same minute bucket, a single request did it. The
-- "count > 1" filter pulls suspicious buckets to the top.
SELECT
  date_trunc('minute', e.updated_at) AS update_minute_utc,
  to_char(date_trunc('minute', e.updated_at) AT TIME ZONE 'America/New_York',
          'YYYY-MM-DD HH24:MI TZ')   AS update_minute_et,
  count(*)                            AS rows_touched,
  array_agg(e.artist_name ORDER BY e.artist_name) AS artist_names
FROM events e
WHERE e.event_date >= '2026-04-21 04:00:00+00'
  AND e.event_date <  '2026-04-22 04:00:00+00'
  AND e.status = 'published'
  AND (
       e.artist_name ILIKE '%Spring Wine Dinner%'
    OR e.event_title ILIKE '%Spring Wine Dinner%'
    OR e.artist_name ILIKE '%Al Holmes%'
    OR e.event_title ILIKE '%Al Holmes%'
    OR e.artist_name ILIKE '%Frankie%'
    OR e.event_title ILIKE '%Frankie%'
    OR e.artist_name ILIKE '%Karaoke%'
    OR e.event_title ILIKE '%Karaoke%'
    OR e.artist_name ILIKE '%Stan Steele%'
    OR e.event_title ILIKE '%Stan Steele%'
  )
GROUP BY 1, 2
ORDER BY update_minute_utc ASC;


-- ── (C) Linked artist JSONB lock state ────────────────────────────────────
-- For each matched event, pull the connected artists row. Per the schema,
-- `artists.is_human_edited` can be TRUE (full-row lock) or a JSONB object
-- like `{ "bio": true, "image_url": true }` (per-field lock written by the
-- Magic Wand). If we see per-field JSONB locks here with an updated_at that
-- matches bucket (B), the Magic Wand cron is the smoking gun.
SELECT
  e.artist_name,
  e.event_title,
  a.id                AS artist_id,
  a.name              AS artist_name_canonical,
  a.is_human_edited   AS artist_is_human_edited_raw,
  -- Typed views of the JSONB so "true" (boolean) vs {"bio": true} (object)
  -- is obvious in the result grid.
  jsonb_typeof(CASE WHEN a.is_human_edited IS NULL THEN NULL
                    ELSE to_jsonb(a.is_human_edited) END)  AS lock_shape,
  a.updated_at                                             AS artist_updated_at,
  to_char(a.updated_at AT TIME ZONE 'America/New_York',
          'YYYY-MM-DD HH24:MI:SS TZ')                       AS artist_updated_at_et,
  a.bio_source,
  a.image_source
FROM events e
LEFT JOIN artists a ON a.id = e.artist_id
WHERE e.event_date >= '2026-04-21 04:00:00+00'
  AND e.event_date <  '2026-04-22 04:00:00+00'
  AND e.status = 'published'
  AND (
       e.artist_name ILIKE '%Spring Wine Dinner%'
    OR e.event_title ILIKE '%Spring Wine Dinner%'
    OR e.artist_name ILIKE '%Al Holmes%'
    OR e.event_title ILIKE '%Al Holmes%'
    OR e.artist_name ILIKE '%Frankie%'
    OR e.event_title ILIKE '%Frankie%'
    OR e.artist_name ILIKE '%Karaoke%'
    OR e.event_title ILIKE '%Karaoke%'
    OR e.artist_name ILIKE '%Stan Steele%'
    OR e.event_title ILIKE '%Stan Steele%'
  )
ORDER BY e.updated_at ASC;


-- ── (D) Venue-link trait ──────────────────────────────────────────────────
-- Do the 5 events share a venue? We originally wanted to also check whether
-- they were linked to their venue at the same time by comparing
-- v.updated_at to e.updated_at, but the `venues` table in this schema has
-- no updated_at column — so that diagnostic isn't available. We can still
-- see whether all 5 share a single venue_id (a bulk venue-link operation
-- would produce that) and when the venue row itself was created.
SELECT
  e.artist_name,
  e.venue_id,
  v.name              AS venue_name_canonical,
  v.created_at        AS venue_created_at,
  e.updated_at        AS event_updated_at
FROM events e
LEFT JOIN venues v ON v.id = e.venue_id
WHERE e.event_date >= '2026-04-21 04:00:00+00'
  AND e.event_date <  '2026-04-22 04:00:00+00'
  AND e.status = 'published'
  AND (
       e.artist_name ILIKE '%Spring Wine Dinner%'
    OR e.event_title ILIKE '%Spring Wine Dinner%'
    OR e.artist_name ILIKE '%Al Holmes%'
    OR e.event_title ILIKE '%Al Holmes%'
    OR e.artist_name ILIKE '%Frankie%'
    OR e.event_title ILIKE '%Frankie%'
    OR e.artist_name ILIKE '%Karaoke%'
    OR e.event_title ILIKE '%Karaoke%'
    OR e.artist_name ILIKE '%Stan Steele%'
    OR e.event_title ILIKE '%Stan Steele%'
  )
ORDER BY e.updated_at ASC;


-- ═════════════════════════════════════════════════════════════════════════
-- HOW TO READ THE RESULTS — mapped to known suspects in the codebase
-- ═════════════════════════════════════════════════════════════════════════
--
-- If (B) shows all 5 rows in the SAME minute bucket, a single call did it.
-- Match the bucket's ET time against:
--
--   • Any hour close to when Magic Wand was last clicked
--     → src/app/api/admin/enrich-date/route.js:348 sets is_human_edited=true
--       on EVERY candidate event on the selected date. If bucket (B) lines
--       up with a click on Spotlight date 2026-04-21, this is it.
--
--   • Any time that matches a PUT /api/admin (per-event save) request
--     → src/app/api/admin/route.js:329 sets is_human_edited=true on every
--       single-event save. Only one row at a time though, so 5 events in
--       one bucket rules this one out.
--
--   • Any time aligned with a DELETE on an artist whose name overlaps one
--     of these 5 performers
--     → src/app/api/admin/artists/route.js:418 does an UNSCOPED update:
--         .update({ artist_id: null, is_human_edited: true })
--         .ilike('artist_name', artist.name)
--       NO date filter, NO status filter. If someone deleted an artist
--       with e.g. name "Frankie", this flips is_human_edited=true on every
--       future-dated "Frankie" event too. This is the most likely cause of
--       a 5-row cluster that WASN'T triggered by a Magic Wand run.
--
--   • A recurring HH:00 or HH:30 bucket (03:00, 04:00, etc. ET) with no
--     human admin action close in time
--     → a scheduled cron. We don't currently have one that writes
--       is_human_edited=true, but if (B) shows an oddly round time with
--       nothing in the admin logs, we have a script we don't know about.
--
-- If (C) shows the ARTIST rows have a JSONB object (not boolean `true`)
-- like `{"bio": true, "image_url": true}` and the artist_updated_at is in
-- the same cluster as (B), the Magic Wand is the culprit (only that path
-- writes the JSONB-object shape to artists).
--
-- If (D) shows all 5 rows share the SAME venue_id, a bulk venue-link
-- operation may have been applied (no admin UI does this today, so it
-- would have to be a hand-written SQL UPDATE). We can't time-correlate the
-- venue-link to the event-flip directly because `venues` has no updated_at
-- column in this schema — but if all 5 event.updated_at values still
-- cluster tightly (from STEP B) and all 5 share a venue_id, the
-- combination is still a strong signal for a targeted bulk UPDATE.
-- ═════════════════════════════════════════════════════════════════════════
