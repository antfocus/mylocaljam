-- ============================================================================
-- Public READ RLS Policies for Shared Links
-- ============================================================================
-- Problem: Shared links (/event/[id]) fail for unauthenticated users because
-- the Supabase anon key respects RLS, and there are no public SELECT policies.
--
-- Fix: Allow anyone (anon or authenticated) to SELECT from events, artists,
-- and venues. These are public-facing tables — there is no sensitive data.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent — no-op if already on)
ALTER TABLE events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues  ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist (prevents duplicate errors)
DROP POLICY IF EXISTS "Public read access for events"  ON events;
DROP POLICY IF EXISTS "Public read access for artists" ON artists;
DROP POLICY IF EXISTS "Public read access for venues"  ON venues;

-- 3. Create public SELECT policies — allow all roles (anon + authenticated)
CREATE POLICY "Public read access for events"
  ON events
  FOR SELECT
  USING (true);

CREATE POLICY "Public read access for artists"
  ON artists
  FOR SELECT
  USING (true);

CREATE POLICY "Public read access for venues"
  ON venues
  FOR SELECT
  USING (true);

-- 4. Verify: list policies for each table
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('events', 'artists', 'venues')
ORDER BY tablename, policyname;
