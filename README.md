# MyLocalJam 🎵

**Never miss a local show.** MyLocalJam is a community-powered music event aggregator for Asbury Park and the Jersey Shore.

## Features
- 📅 Browse events by Today, Tomorrow, This Weekend, or Calendar view
- 🔍 Search by artist, venue, genre, or vibe
- 🎫 Filter by venue, genre, and vibe
- 📝 Community event submissions
- 🚩 Report inaccurate event info
- 🔐 Admin panel for event management
- 📱 Mobile-friendly responsive design

## Tech Stack
- **Frontend:** Next.js 14 + React + Tailwind CSS
- **Backend:** Supabase (PostgreSQL)
- **Hosting:** Vercel

## Setup

1. Clone the repo
2. Run the SQL in `supabase-setup.sql` in your Supabase SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in your keys
4. `npm install && npm run dev`

## Admin
Visit `/admin` to manage events, review submissions, and handle reports.
