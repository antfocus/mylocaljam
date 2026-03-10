# MyLocalJam 🎵

**Never miss a local show.** MyLocalJam is a community-powered music event aggregator for the Jersey Shore, covering 20+ venues from Asbury Park to Point Pleasant and beyond.

🌐 **Live at [mylocaljam.com](https://mylocaljam.com)**

## Features

- 📅 Browse events by Today, Tomorrow, This Weekend, or Calendar view
- 🔍 Search by artist, venue, genre, or vibe
- 🎫 Filter by venue, genre, and vibe with smart category chips (Music, Happy Hours, Daily Specials, Community)
- 🎟️ Direct ticket links and venue page buttons on every event card
- 🖼️ Event images from venue sites with venue photo fallbacks
- 🎤 Artist enrichment via Last.fm (bio, genre, tags) with caching
- 📝 Community event submissions
- 🚩 Report inaccurate event info
- 🔐 Admin panel for event management
- 📱 Mobile-friendly responsive design with smooth card expand animations
- 🌙 Dark mode support

## Venues

Automated scrapers pull events from 20+ Jersey Shore venues including:

**Ticketmaster venues:** The Stone Pony, House of Independents, The Wonder Bar, ParkStage at Bradley Park

**Squarespace venues:** Anchor Tavern, R Bar, Marina Grille, Langosta Lounge

**WordPress / EventPrime:** Brielle House, Reef and Barrel

**Google Calendar / iCal:** Joe's Surf Shack, McCanns, St. Stephen's Green, BeachHaus

**Custom integrations:** Asbury Lanes (BentoBox JSON-LD), Martells (Timely API), Pig & Parrot (PopMenu GraphQL), Bar Anticipation, JacksOnTheTracks, Palmetto, Idle Hour, Tenth Ave Burrito

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + React + Tailwind CSS
- **Backend:** Supabase (PostgreSQL) with Row Level Security
- **Hosting:** Vercel
- **Data:** 20+ automated venue scrapers, Ticketmaster Discovery API, Last.fm artist enrichment
- **Auth:** SYNC_SECRET for API endpoints

## Setup

1. Clone the repo
2. Run the SQL in `supabase-setup.sql` in your Supabase SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in your keys:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project
   - `SUPABASE_SERVICE_ROLE_KEY` — for admin/sync operations
   - `SYNC_SECRET` — protects the sync and enrichment API endpoints
   - `TICKETMASTER_API_KEY` — for Ticketmaster Discovery API venues
   - `LASTFM_API_KEY` — for artist enrichment (bio, genre, tags)
4. `npm install && npm run dev`

## API Endpoints

- **POST `/api/sync-events`** — Runs all venue scrapers and upserts events to Supabase. Requires `Authorization: Bearer <SYNC_SECRET>` header.
- **POST `/api/enrich-artists`** — Enriches uncached artists with Last.fm data (bio, genre, tags). Processes up to 100 artists per call. Requires auth header.

## Admin

Visit `/admin` to manage events, review submissions, and handle reports.

## Architecture Notes

- Event times are stored as full ISO timestamps in `event_date` (UTC). The front-end extracts display times in Eastern timezone.
- For all-day calendar events (midnight timestamps), the scraper and front-end both fall back to parsing times from event titles (e.g. "8pm" in "$2 Miller Lite... Every Tuesday 8pm - Close").
- Events are deduplicated via `external_id` using Supabase upsert with `onConflict`.
- Each scraper returns a standardized format: `{ title, venue, date, time, description, ticket_url, price, source_url, external_id, genre, image_url }`.
