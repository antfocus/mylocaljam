-- Migration: Drop instagram_url column from artists table
-- This field is no longer used in the UI, API, or AI enrichment pipeline.
-- Run this in the Supabase SQL Editor.

ALTER TABLE artists DROP COLUMN IF EXISTS instagram_url;
