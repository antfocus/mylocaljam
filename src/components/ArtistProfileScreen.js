'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import ArtistMonogram from '@/components/ArtistMonogram';
import { supabase } from '@/lib/supabase';
const BRAND_ORANGE = '#E8722A';

export default function ArtistProfileScreen({
  artistName,
  events = [],
  darkMode = true,
  isFollowed = false,
  onFollow,
  onUnfollow,
  onBack,
}) {
  // Fallback artist row from the artists table — only fetched when the events
  // array doesn't carry image/bio/genres for this artist (e.g., user lands
  // here from My Locals and none of their upcoming events are in the current
  // home feed). This is what keeps Jonathan Kirschner's photo on screen even
  // when no event for him is loaded.
  const [dbArtist, setDbArtist] = useState(null);

  // ── Gather artist data from events ──────────────────────────────────────
  const eventsArtistData = useMemo(() => {
    const nameL = artistName.toLowerCase();
    let imageUrl = null;
    let bio = '';
    let genres = [];
    const upcoming = [];
    const now = new Date();

    for (const e of events) {
      const eName = (e.name || e.artist_name || '').toLowerCase();
      if (eName !== nameL) continue;

      // Grab first available image, bio, genres
      if (!imageUrl) imageUrl = e.artist_image || e.image_url || null;
      if (!bio) bio = e.artist_bio || e.description || '';
      if (genres.length === 0 && e.artist_genres?.length) genres = e.artist_genres;

      // 6:00 AM rollover — keep visible until 6 AM the morning after the event
      if (e.date) {
        const cutoff = new Date(e.date.substring(0, 10) + 'T06:00:00');
        cutoff.setDate(cutoff.getDate() + 1);
        if (now < cutoff) upcoming.push(e);
      }
    }

    // Sort upcoming by date + time
    upcoming.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });

    return { imageUrl, bio, genres, upcoming };
  }, [artistName, events]);

  // Fetch the artists-table row when events don't supply enough. We re-run
  // whenever the artist changes; if we already have all three fields from
  // events we skip the network call.
  useEffect(() => {
    setDbArtist(null);
    if (!artistName) return;
    const { imageUrl: evImg, bio: evBio, genres: evGenres } = eventsArtistData;
    if (evImg && evBio && evGenres.length) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('artists')
        .select('id, name, image_url, bio, genres')
        .ilike('name', artistName)
        .limit(1);
      if (cancelled) return;
      if (error) {
        console.error('[ArtistProfileScreen] artists fallback fetch failed:', error.message);
        return;
      }
      if (data && data.length) setDbArtist(data[0]);
    })();
    return () => { cancelled = true; };
  }, [artistName, eventsArtistData]);

  // Merge: events first, artists-table row as fallback.
  const imageUrl = eventsArtistData.imageUrl || dbArtist?.image_url || null;
  const bio      = eventsArtistData.bio      || dbArtist?.bio       || '';
  const genres   = eventsArtistData.genres.length
    ? eventsArtistData.genres
    : (dbArtist?.genres || []);
  const upcoming = eventsArtistData.upcoming;

  // Theme
  const bgColor      = darkMode ? '#0D0D12' : '#F7F5F2';
  const textPrimary  = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted    = darkMode ? '#8A8AA8' : '#6B7280';
  const sectionTitle = darkMode ? '#7878A0' : '#6B7280';

  // ── Swipe-to-back gesture ────────────────────────────────────────────────
  // Swipe right (L→R) to trigger onBack. Live translateX tracks the thumb.
  const SWIPE_THRESHOLD = 75;      // px — minimum dx to trigger back
  const containerRef = useRef(null);
  const swipeRef = useRef(null);    // { startX, startY, tracking }

  const handleTouchStart = useCallback((e) => {
    swipeRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      tracking: false, // will lock to horizontal once we confirm direction
    };
    // Reset any lingering transform
    if (containerRef.current) {
      containerRef.current.style.transition = 'none';
      containerRef.current.style.transform = 'translateX(0)';
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!swipeRef.current) return;
    const dx = e.touches[0].clientX - swipeRef.current.startX;
    const dy = e.touches[0].clientY - swipeRef.current.startY;

    // On first significant move, decide: horizontal or vertical?
    if (!swipeRef.current.tracking) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // too small, wait
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical — abort swipe tracking, let normal scroll happen
        swipeRef.current = null;
        return;
      }
      swipeRef.current.tracking = true;
    }

    // Only track rightward movement (dx > 0). Clamp so it can't go left.
    const offset = Math.max(0, dx);
    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${offset}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!swipeRef.current || !swipeRef.current.tracking) {
      swipeRef.current = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    swipeRef.current = null;

    if (dx > SWIPE_THRESHOLD) {
      // Animate off-screen to the right, then trigger back
      if (containerRef.current) {
        containerRef.current.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        containerRef.current.style.transform = 'translateX(100%)';
      }
      // Call onBack after the exit animation
      setTimeout(() => { onBack?.(); }, 200);
    } else {
      // Snap back to original position
      if (containerRef.current) {
        containerRef.current.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        containerRef.current.style.transform = 'translateX(0)';
      }
    }
  }, [onBack]);

  // Follow / unfollow with confirmation
  const handleFollowToggle = () => {
    if (isFollowed) {
      const confirmed = window.confirm(`Unfollow ${artistName}?`);
      if (confirmed) onUnfollow?.();
    } else {
      onFollow?.();
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 200, background: bgColor,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        maxWidth: '480px', margin: '0 auto',
        touchAction: 'pan-y',
        willChange: 'transform',
      }}
    >
      {/* ── 1. Hero Header (only if image exists) ─────────────────────── */}
      {imageUrl ? (
        <div style={{ position: 'relative', width: '100%', height: '300px', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={artistName}
            style={{
              width: '100%', height: '100%',
              // Top-aligned — see HeroSection.js / EventCardV2.js for
              // rationale. Keep faces in frame on artist headshots.
              objectFit: 'cover', objectPosition: 'center top',
              display: 'block',
            }}
          />
          {/* Bottom fade gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '160px',
            background: `linear-gradient(to top, ${bgColor} 0%, ${bgColor}CC 30%, transparent 100%)`,
            pointerEvents: 'none',
          }} />
          {/* Back button — icon-only, low-key. Swipe-right is the primary
              back gesture on mobile; this is the discoverability fallback
              for desktop and first-time users. Small enough to not dominate
              the photo. */}
          <button
            onClick={onBack}
            aria-label="Back"
            style={{
              position: 'absolute', top: '14px', left: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '32px', height: '32px',
              background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)',
              border: 'none', borderRadius: '50%',
              cursor: 'pointer', padding: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="rgba(255,255,255,0.85)" />
            </svg>
          </button>
        </div>
      ) : (
        /* No image — Magazine layout. Back button + small monogram avatar.
            The artist name immediately below (in the shared title block)
            switches to Outfit Black + uppercase + larger size when there's
            no image, since the typography becomes the visual hero rather
            than the photo. The whole top section stays compact (~180-220px)
            so Upcoming Local Shows lives above the fold. */
        <div style={{ padding: '52px 20px 0', flexShrink: 0 }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none',
              cursor: 'pointer', padding: 0,
              color: textMuted, fontSize: '14px', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: '20px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill={textMuted} />
            </svg>
            Back
          </button>
          <ArtistMonogram
            name={artistName}
            size="sm"
            style={{ width: '80px', height: '80px' }}
          />
        </div>
      )}

      {/* ── 2. Bio & Action Bar ──────────────────────────────────────────── */}
      <div style={{ padding: '0 20px', marginTop: imageUrl ? '-40px' : '16px', position: 'relative', zIndex: 1 }}>
        {/* Artist name — same 28px DM Sans treatment whether or not there's
            an image. With image, the -40px margin pulls it over the photo's
            bottom gradient; without, it sits below the small monogram circle. */}
        <h1 style={{
          fontSize: '28px', fontWeight: 800, color: textPrimary,
          fontFamily: "'DM Sans', sans-serif",
          margin: 0, lineHeight: 1.1,
          textShadow: darkMode && imageUrl ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
        }}>
          {artistName}
        </h1>

        {/* Genre metadata — single muted small-caps line. Looks like a print
            byline, not interactive. Keeps the only "buttony" elements on the
            page (Follow / Share) clearly distinct from descriptive metadata. */}
        {genres.length > 0 && (
          <div style={{
            marginTop: '10px',
            fontSize: '11px', fontWeight: 600, color: textMuted,
            fontFamily: "'DM Sans', sans-serif",
            textTransform: 'uppercase', letterSpacing: '1.2px',
          }}>
            {genres.join(' \u00B7 ')}
          </div>
        )}

        {/* Action row — Follow is the primary action (pill, brand-coloured
            when actionable). Share is utility (round icon-only, no label) so
            it doesn't compete visually with Follow. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
          {/* Follow / Unfollow — orange-filled when not followed (primary
              CTA), neutral outlined when already followed. */}
          <button
            onClick={handleFollowToggle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '999px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px', fontWeight: 700,
              letterSpacing: '0.2px',
              transition: 'all 0.2s ease',
              border: isFollowed
                ? '1px solid rgba(255,255,255,0.18)'
                : `1px solid ${BRAND_ORANGE}`,
              background: isFollowed ? 'transparent' : BRAND_ORANGE,
              color: isFollowed ? 'rgba(255,255,255,0.7)' : '#FFFFFF',
            }}
          >
            {isFollowed ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="rgba(255,255,255,0.7)" />
                </svg>
                Following
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" fill="#FFFFFF" />
                </svg>
                Follow
              </>
            )}
          </button>

          {/* Share — round icon-only button, no label. Lives next to Follow
              as a quiet utility, not a sibling CTA. */}
          <button
            onClick={() => {
              const shareText = `Check out ${artistName} on myLocalJam!`;
              const shareUrl = 'https://mylocaljam.com';
              if (navigator.share) {
                navigator.share({ title: shareText, text: shareText, url: shareUrl }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(`${shareText} ${shareUrl}`);
              }
            }}
            aria-label="Share"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '38px', height: '38px',
              borderRadius: '50%',
              cursor: 'pointer', padding: 0,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="rgba(255,255,255,0.7)" />
            </svg>
          </button>
        </div>

        {/* Bio — full text, no truncation. Most bios are 2–4 sentences;
            the ...more affordance was adding click-cost without payoff. */}
        <div style={{ marginTop: '14px' }}>
          <p style={{
            fontSize: '14px', color: '#A0A0A0', lineHeight: 1.5, margin: 0,
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: 'pre-wrap',
          }}>
            {bio || 'A local favorite bringing live music to the stage.'}
          </p>
        </div>
      </div>

      {/* ── 3. Upcoming Shows (lightweight text list) ────────────────────── */}
      <div style={{ padding: '24px 20px 100px' }}>
        <p style={{
          fontSize: '12px', fontWeight: 700, color: textMuted,
          textTransform: 'uppercase', letterSpacing: '1.5px',
          marginBottom: '12px',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Upcoming Local Shows
        </p>

        {upcoming.length === 0 ? (
          <p style={{ fontSize: '14px', color: textMuted, fontFamily: "'DM Sans', sans-serif" }}>
            No upcoming shows scheduled yet.
          </p>
        ) : (
          <div>
            {upcoming.map((event, i) => {
              const venueRaw = event.venue || event.venue_name || '';
              let dateLabel = '';
              const rawDate = event.date || event.event_date || '';
              if (rawDate) {
                try {
                  const d = new Date(rawDate.substring(0, 10) + 'T12:00:00');
                  dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
                } catch { /* skip */ }
              }
              const isLast = i === upcoming.length - 1;

              return (
                <div
                  key={event.id ?? i}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '16px 0',
                    borderBottom: isLast ? 'none' : `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                  }}
                >
                  {/* Date — fixed width, orange */}
                  {dateLabel && (
                    <span style={{
                      width: '62px', flexShrink: 0,
                      fontSize: '13px', fontWeight: 700, color: BRAND_ORANGE,
                      fontFamily: "'DM Sans', sans-serif",
                      letterSpacing: '0.3px',
                    }}>
                      {dateLabel}
                    </span>
                  )}
                  {/* Venue — title case, light */}
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: '14px', fontWeight: 500,
                    color: darkMode ? '#E0E0F0' : '#374151',
                    fontFamily: "'DM Sans', sans-serif",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {venueRaw}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
