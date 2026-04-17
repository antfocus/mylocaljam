-- =============================================================================
-- GHOST FK HUNTER
-- Run this in the Supabase SQL Editor to find ALL relationships between
-- the `events` and `event_templates` tables.
--
-- PostgREST error: "more than one relationship was found" means there are
-- duplicate FK paths. This query finds them all.
-- =============================================================================

-- ── 1. All FK constraints FROM events TO event_templates ────────────────────
SELECT
  'FK Constraint' AS type,
  tc.constraint_name,
  kcu.column_name AS fk_column,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  tc.table_schema
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'events'
  AND ccu.table_name = 'event_templates'
ORDER BY tc.constraint_name;

-- ── 2. All FK constraints FROM event_templates TO events (reverse) ──────────
SELECT
  'Reverse FK' AS type,
  tc.constraint_name,
  kcu.column_name AS fk_column,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  tc.table_schema
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'event_templates'
  AND ccu.table_name = 'events'
ORDER BY tc.constraint_name;

-- ── 3. ALL constraints on the events table (full picture) ───────────────────
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'events'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.constraint_name;

-- ── 4. Check for MULTIPLE columns pointing at event_templates ───────────────
-- (e.g., both template_id AND some other column referencing event_templates.id)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'events'
  AND table_schema = 'public'
  AND (column_name LIKE '%template%' OR column_name LIKE '%event_template%')
ORDER BY ordinal_position;

-- ── 5. Nuclear option: pg_catalog (most authoritative source) ───────────────
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  rel.relname AS table_name,
  att.attname AS column_name,
  frel.relname AS foreign_table,
  fatt.attname AS foreign_column
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
JOIN pg_catalog.pg_class frel ON frel.oid = con.confrelid
JOIN pg_catalog.pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = ANY(con.confkey)
WHERE con.contype = 'f'
  AND (
    (rel.relname = 'events' AND frel.relname = 'event_templates')
    OR
    (rel.relname = 'event_templates' AND frel.relname = 'events')
  )
ORDER BY con.conname;
