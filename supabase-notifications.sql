-- ============================================================
-- MyLocalJam — Notification System Tables
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. In-app notifications (the bell icon feed)
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  target_url  TEXT,               -- e.g. "/events/abc-123"
  trigger     TEXT,               -- 'tracked_show' | 'new_show' | 'artist_discovery'
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups: "unread notifications for this user"
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

-- RLS: users can only read/update their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- 2. User notification preferences (global toggles from Profile tab)
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled       BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled      BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prefs"
  ON user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own prefs"
  ON user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own prefs"
  ON user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Email send log (audit trail — prevents duplicate sends)
CREATE TABLE IF NOT EXISTS notification_emails_sent (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  trigger     TEXT NOT NULL,      -- 'tracked_show' | 'new_show'
  email       TEXT NOT NULL,
  subject     TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate emails: one email per user per event per trigger type
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_sent_dedup
  ON notification_emails_sent (user_id, event_id, trigger);
