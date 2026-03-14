-- ============================================================
-- MyLocalJam: Venue Geocoding Migration
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================================

-- 1. ADD LATITUDE & LONGITUDE COLUMNS TO VENUES
ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. SEED KNOWN NJ SHORE VENUE COORDINATES
-- These are the default venues from supabase-setup.sql, geocoded accurately.
UPDATE venues SET latitude = 40.2201, longitude = -73.9973 WHERE name = 'The Stone Pony' AND latitude IS NULL;
UPDATE venues SET latitude = 40.2207, longitude = -73.9988 WHERE name = 'House of Independents' AND latitude IS NULL;
UPDATE venues SET latitude = 40.2196, longitude = -73.9966 WHERE name = 'The Wonder Bar' AND latitude IS NULL;
UPDATE venues SET latitude = 40.2210, longitude = -74.0000 WHERE name = 'The Saint' AND latitude IS NULL;
UPDATE venues SET latitude = 40.2193, longitude = -74.0008 WHERE name = 'Asbury Lanes' AND latitude IS NULL;
UPDATE venues SET latitude = 40.2200, longitude = -73.9969 WHERE name = 'Danny Clinch Transparent Gallery' AND latitude IS NULL;

-- 3. CREATE INDEX FOR FASTER SPATIAL QUERIES
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng ON venues (latitude, longitude);

-- 4. OPTIONAL: Verify the update
-- SELECT name, address, latitude, longitude FROM venues ORDER BY name;
