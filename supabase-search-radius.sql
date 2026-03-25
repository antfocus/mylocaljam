-- Add search_radius column to user_notification_preferences table
-- NULL (default) means "Show All" (no distance filter).
ALTER TABLE user_notification_preferences
  ADD COLUMN IF NOT EXISTS search_radius INTEGER DEFAULT NULL;
