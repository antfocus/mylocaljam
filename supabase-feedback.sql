-- ============================================================
-- App Feedback Table
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

CREATE TABLE IF NOT EXISTS app_feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  type        TEXT DEFAULT 'general',       -- 'general', 'bug', 'feature'
  message     TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Allow inserts from anon/authenticated users (public feedback form)
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert feedback
CREATE POLICY IF NOT EXISTS "Anyone can submit feedback"
  ON app_feedback FOR INSERT
  WITH CHECK (true);

-- Only service_role (admin) can read feedback
CREATE POLICY IF NOT EXISTS "Only admins can read feedback"
  ON app_feedback FOR SELECT
  USING (auth.role() = 'service_role');
