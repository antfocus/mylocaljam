-- ============================================================================
--  Ghost Hunt Blacklist — ignored_artists
-- ============================================================================
--  Purpose: suppress noise names ("Pizza Night", "Drink Specials", "Karaoke")
--  from the Metadata Triage / Ghost Hunt surface so the admin can one-click
--  silence repeat offenders instead of seeing them forever.
--
--  Naming note: the table is called `ignored_artists` (not
--  `ignored_artist_names`) to match the upsert that already exists in
--  src/app/api/admin/artists/route.js DELETE handler, which writes a row
--  here whenever an admin deletes an artist. Keeping one table means the
--  "Delete artist" path and the new "Ignore ghost" path share the same
--  blacklist — no drift, no confusion.
--
--  Schema:
--    id           UUID PK
--    name         TEXT   — canonical form as typed (preserved for display)
--    name_lower   TEXT   — lowercased + trimmed, UNIQUE (matching key)
--    reason       TEXT   — freeform: 'ghost_ignored', 'admin_deleted', etc.
--    created_at   TIMESTAMPTZ
--
--  The `name_lower` column (not a LOWER(name) expression index) is used so
--  supabase-js upserts can specify `onConflict: 'name_lower'` directly.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ignored_artists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  name_lower  TEXT        NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: one row per distinct name, regardless of casing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_artists_name_lower
  ON ignored_artists (name_lower);

-- Lookup by created_at for the admin list view (most-recent first).
CREATE INDEX IF NOT EXISTS idx_ignored_artists_created_at
  ON ignored_artists (created_at DESC);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'ignored_artists'
--  ORDER BY ordinal_position;
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--  WHERE tablename = 'ignored_artists';
