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
  'source', 'status', 'category', 'artist_id', 'template_id',
  'event_image_url', 'image_url',
  'custom_bio', 'custom_genres', 'custom_vibes', 'custom_image_url', 'is_custom_metadata',
  'venues(name, address, color, photo_url, website, venue_type, is_ticketed_venue)',
  'artists(name, bio, image_url, genres, vibes, is_tribute)',
  // New: pull the AI-enriched template name + bio + image so the priority ladders
  // (title, bio, image) can reach them without a second round-trip.
  'event_templates(template_name, bio, image_url, category, start_time, genres)',
].join(', ');

/**
 * Flatten joined Supabase row into the shape EventPageClient expects.
 * Same mapping as the `mapped` transform in page.js.
 */
// Treat "" and "None" as null so the image waterfall keeps falling
const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;

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
    // Title ladder:
    //   1. custom_title                   — manual override (column may not exist yet)
    //   2. event_templates.template_name  — clean name from master library
    //   3. event_title                    — raw scraper title fallback
    event_title:    e.custom_title || e.event_templates?.template_name || e.event_title || null,
    venue_name:     e.venues?.name || e.venue_name || '',
    event_date:     e.event_date,
    // Start-time ladder: template Master Time wins. Otherwise keep the
    // pre-existing timestamp-extracted startTime (computed above).
    start_time:     e.event_templates?.start_time || startTime,
    genre:          e.genre,
    vibe:           e.vibe,
    cover:          e.cover || null,
    source:         e.source,
    status:         e.status,
    ticket_link:    e.ticket_link || null,
    // Category ladder: template category > scraper category > 'Other'
    category:       e.event_templates?.category || e.category || 'Other',
    // Hierarchy of Truth (bio):
    //   1. custom_bio                — admin manual override
    //   2. event_templates.bio       — AI-enriched template bio (recurring show)
    //   3. artists.bio               — curated band bio
    //   4. artist_bio                — raw scraper description fallback
    description:    e.custom_bio || e.event_templates?.bio || e.artists?.bio || e.artist_bio || '',
    // Image waterfall:
    //   1. custom_image_url          — admin manual override
    //   2. event_templates.image_url — AI-enriched template image
    //   3. event_image_url/image_url — per-event scraper flyer
    //   4. artists.image_url         — band photo (set separately below)
    event_image:    cleanImg(e.custom_image_url) || cleanImg(e.event_templates?.image_url) || cleanImg(e.event_image_url) || cleanImg(e.image_url) || null,
    artist_image:   cleanImg(e.artists?.image_url) || null,
    artist_genres:  e.custom_genres?.length ? e.custom_genres : (e.genre ? [e.genre] : (e.artists?.genres || [])),
    is_tribute:     e.artists?.is_tribute || false,
    // Flattened from venues join
    venue_photo:    e.venues?.photo_url || null,
    venue_website:  e.venues?.website || null,
    venue_address:  e.venues?.address || '',
    venue_color:    e.venues?.color || null,
    // Drives the inline "Tickets" indicator on the share landing page.
    // Same field flattened on the events search API for the in-app feed.
    is_ticketed_venue: !!e.venues?.is_ticketed_venue,
    venue_type:     e.venues?.venue_type || null,
  };
}

/** Format event date for OG — e.g. "Mon Apr 27".
 *  Short form so the headline + venue have room before iMessage truncates. */
function formatOGDate(eventDate) {
  if (!eventDate) return '';
  try {
    return new Date(eventDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch {
    return '';
  }
}

/** Reject low-quality image URLs so the OG preview never falls back to a
 *  200px Google search thumbnail. Mirrors opengraph-image.js. */
function isLowQualityImage(url) {
  if (!url) return false;
  return /encrypted-tbn\d*\.gstatic\.com/i.test(url) || /\.gstatic\.com\/.*tbn:/i.test(url);
}
function preferQuality(v) {
  return (v && !isLowQualityImage(v)) ? v : null;
}

/**
 * Format a 24h time string (e.g. "20:00") into "8 PM" or "8:30 PM".
 * Drops the ":00" on top-of-hour times to keep the OG title short.
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
  // Title ladder mirrors EventCardV2 (line 100): eventTitle || artistName.
  // For venue/special events the scraper writes a raw artist_name like
  // "AYCE SNOW CRAB" while flattenEvent resolves event_title to the cleaned
  // template name ("Snow Crabs! (All You Can Eat)"). Without this ladder
  // the OG preview disagreed with the in-app share text.
  const headline = event.event_title || event.artist_name || 'Live Music';
  const venueName = event.venue_name || 'a local venue';
  const dateStr = formatOGDate(event.event_date);
  const timeStr = formatOGTime(event.start_time);
  const eventBio = event.description || '';

  // Image waterfall — used to declare og:image directly (bypassing the
  // dynamic letterbox canvas in opengraph-image.js) so iMessage gets the
  // source image at its natural aspect ratio. Apple then picks TALL preview
  // for portrait posters and BANNER preview for landscape band photos,
  // filling either way with no dark bars. Each step rejects gstatic thumbs.
  let rawImage =
    preferQuality(event.event_image) ||
    preferQuality(event.artist_image) ||
    null;

  // If artist join returned no usable image, try matching by artist_name
  if (!rawImage && event.artist_name) {
    try {
      const { data: matchedArtist } = await supabase
        .from('artists')
        .select('image_url')
        .ilike('name', event.artist_name)
        .not('image_url', 'is', null)
        .limit(1)
        .single();
      rawImage = preferQuality(matchedArtist?.image_url) || null;
    } catch { /* name lookup failed — fall through to venue/logo */ }
  }

  // Continue waterfall: venue photo → null (let opengraph-image.js render the wordmark fallback)
  if (!rawImage) rawImage = preferQuality(event.venue_photo) || null;

  // Build the date/time slug. Date and time joined with " at " so the
  // pair reads as natural English ("Sat, May 2 at 9 PM") instead of a
  // listicle of middle-dots. The major break between WHEN and WHAT uses
  // an em-dash below — distinct enough that the reader's eye lands on
  // the artist + venue cleanly.
  const when = timeStr
    ? `${dateStr} at ${timeStr}`
    : dateStr;

  // OG title leads with date+time so the WHEN survives iMessage's ~75-char
  // truncation. Worst case the venue gets cut, not the time. Format:
  //   "Mon, Apr 27 at 4 PM — Snow Crabs! at Sun Harbor Seafood and Grill"
  //   "Fri, May 1 at 5 PM — Steve Johnson at River Rock"
  // Yes there are two "at"s — one for the time, one for the venue — but
  // each lands in a distinct phrase separated by the em-dash, so it
  // reads as prose rather than as awkward repetition.
  const ogTitle = when
    ? `${when} — ${headline} at ${venueName}`
    : `${headline} at ${venueName}`;

  // Page <title> keeps the brand suffix
  const title = `${ogTitle} — MyLocalJam`;

  // OG description: prefer event bio, then date-based, then generic. The
  // date-based fallback prepends "on" so "${when}" reads naturally —
  // "Live music on Sat, May 2 at 9 PM" rather than the bare-juxtaposed
  // "Live music Sat, May 2 at 9 PM" which scans as a list.
  const description = eventBio
    ? eventBio.slice(0, 160) + (eventBio.length > 160 ? '...' : '')
    : when
      ? `Live music on ${when}. Tap to see details and save this show on myLocalJam.`
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
      // When we have a real source image, declare it directly so iMessage
      // gets the image at its natural dimensions and picks the right
      // preview style (TALL for portrait, BANNER for landscape) — no bars.
      // When we don't, fall through to opengraph-image.js which renders
      // the brand wordmark on a portrait canvas.
      ...(rawImage && { images: [{ url: rawImage }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      ...(rawImage && { images: [rawImage] }),
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
