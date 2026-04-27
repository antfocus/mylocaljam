'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import ArtistMonogram from '@/components/ArtistMonogram';
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
  const [bioExpanded, setBioExpanded] = useState(false);

  // ── Gather artist data from events ──────────────────────────────────────
  const artistData = useMemo(() => {
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

  const { imageUrl, bio, genres, upcoming } = artistData;

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
          {/* Back button — over hero */}
          <button
            onClick={onBack}
            style={{
              position: 'absolute', top: '16px', left: '16px',
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
              border: 'none', borderRadius: '999px',
              padding: '8px 14px', cursor: 'pointer',
              color: '#FFFFFF', fontSize: '14px', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="#FFFFFF" />
            </svg>
            Back
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
        {/* Artist name.
            With image: 28px DM Sans, sits at -40px to overlay the photo.
            No image: Outfit Black + uppercase + larger size — the typography
            IS the hero. Compact enough to keep Upcoming Shows above the fold. */}
        <h1 style={imageUrl ? {
          fontSize: '28px', fontWeight: 800, color: textPrimary,
          fontFamily: "'DM Sans', sans-serif",
          margin: 0, lineHeight: 1.1,
          textShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
        } : {
          fontSize: 'clamp(32px, 9vw, 44px)', fontWeight: 900, color: textPrimary,
          fontFamily: "'Outfit', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          margin: 0, lineHeight: 1.0,
        }}>
          {artistName}
        </h1>

        {/* Genre chips */}
        {genres.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            {genres.map(g => (
              <span key={g} style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '999px',
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                color: textMuted,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Action row — Follow pill + Share button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          {/* Follow / Unfollow pill */}
          <button
            onClick={handleFollowToggle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 14px', borderRadius: '999px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.5px',
              transition: 'all 0.2s ease',
              border: isFollowed
                ? '1px solid rgba(255,255,255,0.25)'
                : `1px solid ${BRAND_ORANGE}`,
              background: 'transparent',
              color: isFollowed
                ? 'rgba(255,255,255,0.5)'
                : BRAND_ORANGE,
            }}
          >
            {isFollowed ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="rgba(255,255,255,0.45)" />
                </svg>
                FOLLOWING
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill={BRAND_ORANGE} />
                </svg>
                FOLLOW
              </>
            )}
          </button>

          {/* Share button */}
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
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 14px', borderRadius: '999px',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.5px',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Material: ios_share */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="rgba(255,255,255,0.45)" />
            </svg>
            SHARE
          </button>
        </div>

        {/* Bio */}
        <div style={{ marginTop: '12px' }}>
          <p style={{
            fontSize: '14px', color: '#A0A0A0', lineHeight: 1.5, margin: 0,
            fontFamily: "'DM Sans', sans-serif",
            ...(bioExpanded ? {} : {
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }),
          }}>
            {bio || 'A local favorite bringing live music to the stage.'}
          </p>
          {bio && bio.length > 150 && (
            <button
              onClick={() => setBioExpanded(prev => !prev)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 0 0', fontSize: '13px', fontWeight: 700,
                color: BRAND_ORANGE,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {bioExpanded ? 'Show less' : '...more'}
            </button>
          )}
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
