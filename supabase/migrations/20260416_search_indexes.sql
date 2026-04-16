-- =============================================================================
-- Migration: Server-Side Search Indexes for myLocalJam
-- Date: 2026-04-16
-- Purpose: Enable fast fuzzy text search + optimize the public feed query
-- =============================================================================
--
-- ARCHITECTURAL DECISION: pg_trgm (trigram) vs tsvector
-- ─────────────────────────────────────────────────────
-- We use pg_trgm GIN indexes, NOT tsvector, for the following reasons:
--
-- 1. PARTIAL PREFIX MATCHING. Users type "stone po" and expect "The Stone Pony".
--    tsvector only matches whole lexemes — it would require "stone" AND "pony"
--    as complete words. pg_trgm matches any substring, including mid-word and
--    prefix fragments, via the % (similarity) and ILIKE operators.
--
-- 2. TYPO TOLERANCE. pg_trgm naturally handles minor misspellings because
--    trigram overlap stays high even with 1–2 character errors. tsvector has
--    zero typo tolerance without a separate fuzzy layer.
--
-- 3. SHORT-STRING DOMAIN. Our searchable columns are band names (~3-30 chars),
--    venue names (~5-30 chars), and event titles (~5-60 chars). These are not
--    document-length text. tsvector's stemming/ranking overhead buys nothing
--    on strings this short; trigram similarity is the right tool.
--
-- 4. SIMPLE QUERY PATTERN. A single ILIKE '%term%' (or similarity threshold)
--    across 3 columns is all we need. tsvector would require maintaining a
--    generated column with ts_vector concatenation + plainto_tsquery, which
--    adds schema complexity for no benefit here.
--
-- Trade-off acknowledged: pg_trgm GIN indexes are slightly larger than
-- tsvector GIN indexes on the same data. At our scale (~1500 events, growing
-- to maybe 10K), this is irrelevant — both fit comfortably in shared_buffers.
--
-- =============================================================================

-- ── 1. Enable the pg_trgm extension ──────────────────────────────────────────
-- Required for GIN trigram indexes and the % similarity operator.
-- Safe to run multiple times; no-op if already enabled.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Trigram GIN indexes on searchable text columns ────────────────────────
-- These accelerate ILIKE '%term%' and similarity() queries by decomposing
-- each value into 3-character grams and indexing them in an inverted list.
--
-- We index three columns that the client-side search currently filters on:
--   • event_title  — the scraper/template-resolved event name
--   • artist_name  — the raw artist name from the scraper
--   • venue_name   — denormalized venue name on the events row
--
-- COALESCE to '' ensures NULLs don't break the trigram decomposition.
-- gin_trgm_ops is the operator class that enables ILIKE and % matching.

CREATE INDEX IF NOT EXISTS idx_events_event_title_trgm
  ON events USING gin (COALESCE(event_title, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_events_artist_name_trgm
  ON events USING gin (COALESCE(artist_name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_events_venue_name_trgm
  ON events USING gin (COALESCE(venue_name, '') gin_trgm_ops);

-- ── 3. Composite index on (status, event_date) ──────────────────────────────
-- Every public feed query filters WHERE status = 'published' AND event_date >= X.
-- The existing separate indexes (idx_events_date, idx_events_status) force
-- Postgres to bitmap-AND two index scans or pick one and filter the other.
-- A composite index in (status, event_date) order lets the planner do a
-- single index scan: seek to status='published', then range-scan event_date.
--
-- status is low-cardinality (published/draft/cancelled) so it's the equality
-- column (leading); event_date is the range column (trailing). This order
-- matches the B-tree access pattern for = + >= queries.

CREATE INDEX IF NOT EXISTS idx_events_status_date
  ON events (status, event_date);

-- =============================================================================
-- NOTES FOR REVIEW
-- =============================================================================
-- • CONCURRENTLY was intentionally removed. The Supabase SQL Editor wraps
--   executions in a transaction block, which is incompatible with
--   CREATE INDEX CONCURRENTLY. At ~1,500 rows the table lock is sub-second.
--   If the table grows past ~100K rows and you need zero-downtime reindexing,
--   run CONCURRENTLY via psql outside a transaction block.
--
-- • Index size estimate at 1,500 rows: each trigram GIN index ≈ 200-400 KB.
--   The composite B-tree index ≈ 50-100 KB. Total overhead: ~1-2 MB.
--   At 10K rows: ~5-10 MB total. Negligible.
--
-- • To verify indexes were created:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'events'
--     AND indexname LIKE 'idx_events_%' ORDER BY indexname;
--
-- • To test trigram search performance:
--   EXPLAIN ANALYZE SELECT * FROM events
--     WHERE COALESCE(event_title, '') ILIKE '%stone po%'
--        OR COALESCE(artist_name, '') ILIKE '%stone po%'
--        OR COALESCE(venue_name, '') ILIKE '%stone po%';
-- =============================================================================
