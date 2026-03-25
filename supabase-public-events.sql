-- ============================================================
-- Migration: Allow public read access to events for shared links
-- Run this in Supabase SQL Editor
-- ============================================================
-- Problem: The existing RLS policy only allows SELECT where status = 'published'.
-- Scraped events may have NULL status or 'cancelled' status, causing shared
-- event links to return 404 for unauthenticated users when the service role
-- key isn't being used.
--
-- Fix: Replace the restrictive policy with one that allows reading any
-- non-draft event (published, cancelled, or NULL status). Draft events
-- remain hidden from public view.
-- ============================================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Public can read published events" ON events;

-- Create a more permissive policy: public can read any event that isn't a draft
CREATE POLICY "Public can read events"
  ON events FOR SELECT
  USING (status IS NULL OR status <> 'draft');

-- Verify: run this to confirm the policy exists
-- SELECT * FROM pg_policies WHERE tablename = 'events';
