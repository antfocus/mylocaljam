import { createClient } from '@supabase/supabase-js';
import EventPageClient from './EventPageClient';

/** Force fresh server render on every request — no ISR / route cache */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Dynamic event page — server component for OG meta tags.
 * URL: /event/[id]
 *
 * Fetches event data server-side so we can generate rich Open Graph
 * metadata for link previews in iMessage, Twitter, Slack, etc.
 *
 * IMPORTANT: The events table does NOT contain artist bio, image, genres,
 * or venue details directly. Those live on the `artists` and `venues`
 * tables and must be fetched via joins, matching how /api/events works.
 */

/**
 * Build a Supabase client for server-side fetching.
 * Prefers the service-role key (bypasses RLS) but falls back to the
 * anon key so shared links still work for unauthenticated visitors.
 * Requires public SELECT RLS policies on events/artists/venues when
 * using the anon key fallback.
 */
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

  if (!url) {
    console.error('[event/page] Missing NEXT_PUBLIC_SUPABASE_URL');
    return null;
  }

  // Prefer service-role (bypasses RLS); fall back to anon (requires public RLS policies)
  const key = serviceKey || anonKey;
  if (!key) {
    console.error('[event/page] No Supabase key available — set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return null;
  }

  if (!serviceKey) {
    console.warn('[event/page] Using anon key — public SELECT RLS policies must be enabled on events/artists/venues');
  }

  return createClient(url, key);
}

// ── Shared select string — columns that exist on the events table + joins ───
// Mirrors the query in /api/events/route.js
const EVENT_SELECT = [
  'id', 'artist_name', 'event_title', 'venue_name', 'event_date',
  'genre', 'vibe', 'cover', 'ticket_link', 'artist_bio',
  'source', 'status', 'category', 'artist_id', 'event_image_url',
  'custom_bio', 'custom_genres', 'custom_vibes', 'custom_image_url', 'is_custom_metadata',
  'venues(name, address, color, photo_url, venue_type)',
  'artists(name, bio, image_url, genres, vibes, is_tribute)',
].join(', ');

/**
 * Flatten joined Supabase row into the shape EventPageClient expects.
 * Same mapping as the `mapped` transform in page.js.
 */
function flattenEvent(e) {
  // Extract start time from event_date timestamp
  let startTime = null;
  if (e.event_date && e.event_date.includes('T')) {
    try {
      const d = new Date(e.event_date);
      const parts = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: false,
        timeZone: 'America/New_York',
      }).split(':');
      const h = String(parseInt(parts[0])).padStart(2, '0');
      const m = parts[1];
      startTime = `${h}:${m}`;
    } catch {}
  }

  return {
    id:             e.id,
    artist_name:    e.artists?.name || e.artist_name,
    event_title:    e.event_title || null,
    venue_name:     e.venues?.name || e.venue_name || '',
    event_date:     e.event_date,
    start_time:     startTime,
    genre:          e.genre,
    vibe:           e.vibe,
    cover:          e.cover || null,
    source:         e.source,
    status:         e.status,
    ticket_link:    e.ticket_link || null,
    category:       e.category || 'Live Music',
    // Waterfall: custom event override → event-level field → global artist field
    description:    e.custom_bio || e.artist_bio || e.artists?.bio || '',
    event_image:    e.custom_image_url || e.event_image_url || null,
    artist_image:   e.artists?.image_url || null,
    artist_genres:  e.custom_genres?.length ? e.custom_genres : (e.genre ? [e.genre] : (e.artists?.genres || [])),
    is_tribute:     e.artists?.is_tribute || false,
    // Flattened from venues join
    venue_photo:    e.venues?.photo_url || null,
    venue_address:  e.venues?.address || '',
    venue_color:    e.venues?.color || null,
    venue_type:     e.venues?.venue_type || null,
  };
}

/** Format event date for OG — e.g. "Friday, Mar 27" */
function formatOGDate(eventDate) {
  if (!eventDate) return '';
  try {
    return new Date(eventDate).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch {
    return '';
  }
}

/**
 * Format a 24h time string (e.g. "20:00") into "8:00 PM".
 * Returns '' for midnight/null (midnight typically means "no time provided").
 */
function formatOGTime(startTime) {
  if (!startTime) return '';
  const [h, m] = startTime.split(':').map(Number);
  if (h === 0 && m === 0) return ''; // midnight = no time
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mins = m ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${mins} ${period}`;
}

// ── Dynamic OG metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }) {
  const { id } = await params;
  const supabase = getServerClient();

  if (!supabase) {
    console.error('[event/meta] Could not create Supabase client');
    return { title: 'Event — MyLocalJam', description: 'Live music on the Jersey Shore.' };
  }

  const { data: raw, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .single();

  if (error) {
    console.error('[event/meta] Supabase query error:', error.message, '| code:', error.code, '| id:', id);
  }

  if (!raw) {
    return {
      title: 'Event Not Found — MyLocalJam',
      description: 'This event could not be found on MyLocalJam.',
    };
  }

  const event = flattenEvent(raw);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mylocaljam.com';
  const artistName = event.artist_name || 'Live Music';
  const venueName = event.venue_name || 'a local venue';
  const dateStr = formatOGDate(event.event_date);
  const timeStr = formatOGTime(event.start_time);
  const eventBio = event.description || '';
  // Waterfall: event flyer → artist photo → venue photo → branded fallback (absolute URL)
  const rawImage = event.event_image || event.artist_image || event.venue_photo || null;
  const imageUrl = rawImage || `${baseUrl}/myLocaljam_Logo_v5.png`;

  // Build the date/time slug that appears in the OG title — e.g. "Friday, Mar 27 at 8 PM"
  const when = timeStr
    ? `${dateStr} at ${timeStr}`
    : dateStr;

  // OG title: "Artist at Venue | Friday, Mar 27 at 8 PM"
  const ogTitle = when
    ? `${artistName} at ${venueName} | ${when}`
    : `${artistName} at ${venueName}`;

  // Page <title> keeps the brand suffix
  const title = `${ogTitle} — MyLocalJam`;

  // OG description: prefer event bio, then date-based, then generic
  const description = eventBio
    ? eventBio.slice(0, 160) + (eventBio.length > 160 ? '...' : '')
    : when
      ? `Live music ${when}. Tap to see details and save this show on myLocalJam.`
      : `Live music at ${venueName}. Tap to see details and save this show on myLocalJam.`;

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: 'website',
      url: `${baseUrl}/event/${id}`,
      siteName: 'MyLocalJam',
      images: [{ url: imageUrl, width: 800, height: 420, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [imageUrl],
    },
  };
}

// ── Page component ──────────────────────────────────────────────────────────────────────

export default async function EventPage({ params }) {
  const { id } = await params;
  const supabase = getServerClient();

  let event = null;

  if (supabase) {
    const { data: raw, error } = await supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[event/page] Supabase query error:', error.message, '| code:', error.code, '| hint:', error.hint, '| id:', id);
    }

    if (raw) {
      event = flattenEvent(raw);
    }
  } else {
    console.error('[event/page] No Supabase client available — check env vars');
  }

  if (!event) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0D0D12', color: '#F0F0F5',
        fontFamily: "'DM Sans', sans-serif", textAlign: 'center', padding: '32px',
      }}>
        <span style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</span>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Event Not Found</h1>
        <p style={{ fontSize: '14px', color: '#7878A0', marginBottom: '24px' }}>
          This event may have been removed or the link is incorrect.
        </p>
        <a href="/" style={{
          padding: '12px 32px', borderRadius: '999px', background: '#E8722A',
          color: '#1C1917', textDecoration: 'none', fontWeight: 700, fontSize: '14px',
        }}>
          Browse Events
        </a>
      </div>
    );
  }

  return <EventPageClient event={event} />;
}
