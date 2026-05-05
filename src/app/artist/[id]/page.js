import { createClient } from '@supabase/supabase-js';
import ArtistPageClient from './ArtistPageClient';

/** Force fresh server render on every request — no ISR / route cache */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Dynamic artist page — server component for OG meta tags.
 * URL: /artist/[id]
 *
 * Fetches artist data + upcoming events server-side so we can generate
 * rich Open Graph metadata for link previews.
 */

/**
 * Build a Supabase client for server-side fetching.
 * Prefers the service-role key (bypasses RLS) but falls back to the
 * anon key so shared links work for unauthenticated visitors.
 * Requires public SELECT RLS policies on artists/events/venues when
 * using the anon key fallback.
 */
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

  if (!url) {
    console.error('[artist/page] Missing NEXT_PUBLIC_SUPABASE_URL');
    return null;
  }

  const key = serviceKey || anonKey;
  if (!key) {
    console.error('[artist/page] No Supabase key available — set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return null;
  }

  if (!serviceKey) {
    console.warn('[artist/page] Using anon key — public SELECT RLS policies must be enabled');
  }

  return createClient(url, key);
}

// ── Dynamic OG metadata ─────────────────────────────────────────────────────

export async function generateMetadata({ params }) {
  const { id } = await params;
  const supabase = getServerClient();

  if (!supabase) {
    return { title: 'Artist — MyLocalJam', description: 'Live music on the Jersey Shore.' };
  }

  const { data: artist, error } = await supabase
    .from('artists')
    .select('id, name, bio, image_url, genres, vibes, is_tribute')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[artist/meta] Supabase query error:', error.message, '| id:', id);
  }

  if (!artist) {
    return {
      title: 'Artist Not Found — MyLocalJam',
      description: 'This artist could not be found on MyLocalJam.',
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mylocaljam.com';
  const name = artist.name || 'Artist';
  const bio = artist.bio || '';
  // Brand-consistent OG fallback (May 5, 2026) — wordmark-on-dark-navy
  // avatar matching the OG card and social media accounts. v9 includes
  // the soundwave glyph from the ChatGPT rebrand.
  const imageUrl = artist.image_url || `${baseUrl}/myLocaljam_avatar_v9_dark_1024.png`;
  const genres = artist.genres || [];

  const ogTitle = `${name} — MyLocalJam`;
  const description = bio
    ? bio.slice(0, 160) + (bio.length > 160 ? '...' : '')
    : genres.length > 0
      ? `${name} plays ${genres.slice(0, 3).join(', ')}. See upcoming shows on myLocalJam.`
      : `See upcoming shows for ${name} on myLocalJam.`;

  return {
    title: ogTitle,
    description,
    openGraph: {
      title: name,
      description,
      type: 'profile',
      url: `${baseUrl}/artist/${id}`,
      siteName: 'MyLocalJam',
      images: [{ url: imageUrl, width: 400, height: 400, alt: name }],
    },
    twitter: {
      card: 'summary',
      title: name,
      description,
      images: [imageUrl],
    },
  };
}

// ── Page component ──────────────────────────────────────────────────────────

export default async function ArtistPage({ params }) {
  const { id } = await params;
  const supabase = getServerClient();

  let artist = null;
  let upcomingEvents = [];

  if (supabase) {
    // Fetch artist
    const { data: raw, error } = await supabase
      .from('artists')
      .select('id, name, bio, image_url, genres, vibes, is_tribute')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[artist/page] Supabase query error:', error.message, '| id:', id);
    }

    if (raw) {
      artist = raw;

      // Fetch upcoming events for this artist
      const now = new Date().toISOString();
      const { data: events } = await supabase
        .from('events')
        .select('id, event_title, artist_name, venue_name, event_date, cover, status, event_image_url, custom_image_url, venues(name, address)')
        .eq('artist_id', id)
        .eq('status', 'published')
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(20);

      upcomingEvents = (events || []).map(e => ({
        id: e.id,
        event_title: e.event_title || null,
        artist_name: e.artist_name || artist.name,
        venue_name: e.venues?.name || e.venue_name || '',
        venue_address: e.venues?.address || '',
        event_date: e.event_date,
        cover: e.cover,
        event_image: e.custom_image_url || e.event_image_url || null,
      }));
    }
  } else {
    console.error('[artist/page] No Supabase client available — check env vars');
  }

  if (!artist) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0D0D12', color: '#F0F0F5',
        fontFamily: "'DM Sans', sans-serif", textAlign: 'center', padding: '32px',
      }}>
        <span style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</span>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Artist Not Found</h1>
        <p style={{ fontSize: '14px', color: '#7878A0', marginBottom: '24px' }}>
          This artist may have been removed or the link is incorrect.
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

  return <ArtistPageClient artist={artist} upcomingEvents={upcomingEvents} />;
}
