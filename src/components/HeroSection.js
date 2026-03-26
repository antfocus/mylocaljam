'use client';

/**
 * HeroSection.js — "Today's Spotlight" swipeable hero with auto-rotate.
 *
 * Full-bleed artist imagery with gradient overlay, "Meet the Artist" pill
 * that opens a bottom-sheet bio drawer with swipe-to-dismiss.
 *
 * Auto-rotates every 5s, loops back to start at the end.
 * Pauses on touch/mouse interaction, resumes 2s after release.
 * Uses custom touch handlers with translateX (proven on iOS Safari).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const SKELETON = '__skeleton__';

// Branded gradient fallbacks for events without images
const BRANDED_GRADIENTS = [
  'linear-gradient(135deg, #E8722A 0%, #1A1A24 60%, #0D0D14 100%)',
  'linear-gradient(135deg, #d35f1a 0%, #1A1A24 50%, #0D0D14 100%)',
  'linear-gradient(135deg, #3AADA0 0%, #1A1A24 60%, #0D0D14 100%)',
];

const AUTO_ROTATE_MS = 5000;
const RESUME_DELAY_MS = 2000;

function formatTimeFull(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (h === 0 && m === 0) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  const mins = m ? `:${String(m).padStart(2, '0')}` : ':00';
  return `${h12}${mins} ${period}`;
}

export default function HeroSection({ events = [], spotlightEvents = [], isToday = true }) {
  const hasSpotlight = spotlightEvents.length > 0;
  const featured = hasSpotlight
    ? spotlightEvents.slice(0, 8)
    : (events.length > 0 ? events.slice(0, 5) : [SKELETON]);

  const canSwipe = featured.length > 1;

  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const trackRef = useRef(null);
  const viewportRef = useRef(null);

  // Bio bottom sheet state
  const [bioSheet, setBioSheet] = useState(null); // event object or null
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetRef = useRef(null);
  const sheetDragY = useRef(0);
  const sheetStartY = useRef(0);
  const sheetDragging = useRef(false);

  // Touch state refs
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentTranslate = useRef(0);
  const prevTranslate = useRef(0);
  const animFrame = useRef(null);
  const directionLocked = useRef(null);

  // Auto-rotate refs
  const autoTimer = useRef(null);
  const resumeTimer = useRef(null);

  // Keep activeRef in sync
  useEffect(() => { activeRef.current = active; }, [active]);

  const getSlideWidth = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return 300;
    return vp.offsetWidth;
  }, []);

  const snapTo = useCallback((idx, smooth = true) => {
    const clamped = Math.max(0, Math.min(idx, featured.length - 1));
    const sw = getSlideWidth();
    const target = -(clamped * sw);
    currentTranslate.current = target;
    prevTranslate.current = target;
    setActive(clamped);
    activeRef.current = clamped;
    if (trackRef.current) {
      trackRef.current.style.transition = smooth
        ? 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)'
        : 'none';
      trackRef.current.style.transform = `translateX(${target}px)`;
    }
  }, [featured.length, getSlideWidth]);

  const applyTransform = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${currentTranslate.current}px)`;
    }
  }, []);

  // ── Auto-rotate ─────────────────────────────────────────────────────────────
  const startAutoRotate = useCallback(() => {
    if (!canSwipe) return;
    if (autoTimer.current) clearInterval(autoTimer.current);
    autoTimer.current = setInterval(() => {
      const next = (activeRef.current + 1) % featured.length;
      snapTo(next);
    }, AUTO_ROTATE_MS);
  }, [canSwipe, featured.length, snapTo]);

  const pauseAutoRotate = useCallback(() => {
    if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null; }
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      startAutoRotate();
    }, RESUME_DELAY_MS);
  }, [startAutoRotate]);

  // Start auto-rotate on mount (when multiple slides)
  useEffect(() => {
    if (canSwipe) startAutoRotate();
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [canSwipe, startAutoRotate]);

  // ── Touch swipe handlers ────────────────────────────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !canSwipe) return;

    const onTouchStart = (e) => {
      pauseAutoRotate();
      if (trackRef.current) trackRef.current.style.transition = 'none';
      dragging.current = true;
      directionLocked.current = null;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      prevTranslate.current = currentTranslate.current;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };

    const onTouchMove = (e) => {
      if (!dragging.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (directionLocked.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        directionLocked.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      }

      if (directionLocked.current === 'y') {
        dragging.current = false;
        scheduleResume();
        return;
      }

      if (directionLocked.current === 'x') {
        e.preventDefault();
        e.stopPropagation();
        currentTranslate.current = prevTranslate.current + dx;
        animFrame.current = requestAnimationFrame(applyTransform);
      }
    };

    const onTouchEnd = () => {
      if (!dragging.current && directionLocked.current !== 'x') {
        scheduleResume();
        return;
      }
      dragging.current = false;

      const movedBy = currentTranslate.current - prevTranslate.current;
      let newIdx = activeRef.current;
      if (movedBy < -50 && activeRef.current < featured.length - 1) newIdx = activeRef.current + 1;
      else if (movedBy > 50 && activeRef.current > 0) newIdx = activeRef.current - 1;

      directionLocked.current = null;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      snapTo(newIdx);
      scheduleResume();
    };

    const onMouseDown = () => { pauseAutoRotate(); };
    const onMouseUp = () => { scheduleResume(); };

    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd, { passive: true });
    vp.addEventListener('touchcancel', onTouchEnd, { passive: true });
    vp.addEventListener('mousedown', onMouseDown, { passive: true });
    vp.addEventListener('mouseup', onMouseUp, { passive: true });

    return () => {
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
      vp.removeEventListener('touchcancel', onTouchEnd);
      vp.removeEventListener('mousedown', onMouseDown);
      vp.removeEventListener('mouseup', onMouseUp);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [featured.length, canSwipe, snapTo, applyTransform, pauseAutoRotate, scheduleResume]);

  // Initial snap
  useEffect(() => {
    if (featured.length) snapTo(0, false);
  }, [featured.length, snapTo]);

  const handleDotClick = useCallback((i) => {
    pauseAutoRotate();
    snapTo(i);
    scheduleResume();
  }, [pauseAutoRotate, snapTo, scheduleResume]);

  // ── Bio Bottom Sheet ──────────────────────────────────────────────────────
  const openBioSheet = useCallback((ev) => {
    setBioSheet(ev);
    // Trigger animation on next frame
    requestAnimationFrame(() => setSheetVisible(true));
  }, []);

  const closeBioSheet = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => setBioSheet(null), 300); // wait for slide-down animation
  }, []);

  // Swipe-to-dismiss on the bottom sheet
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !bioSheet) return;

    const onStart = (e) => {
      sheetDragging.current = true;
      sheetStartY.current = e.touches[0].clientY;
      sheetDragY.current = 0;
      el.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!sheetDragging.current) return;
      const dy = e.touches[0].clientY - sheetStartY.current;
      if (dy > 0) { // only allow dragging down
        sheetDragY.current = dy;
        el.style.transform = `translateY(${dy}px)`;
        e.preventDefault();
      }
    };

    const onEnd = () => {
      if (!sheetDragging.current) return;
      sheetDragging.current = false;
      el.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      if (sheetDragY.current > 80) {
        closeBioSheet();
      } else {
        el.style.transform = 'translateY(0)';
      }
      sheetDragY.current = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [bioSheet, closeBioSheet]);

  return (
    <div style={{
      position: 'relative', flexShrink: 0,
      width: '100%', maxWidth: '100%', boxSizing: 'border-box',
    }}>
      {/* Viewport — overflow hidden, custom touch handlers */}
      <div
        ref={viewportRef}
        style={{
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Track — translateX driven */}
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            willChange: 'transform',
          }}
        >
          {featured.map((ev, i) => {
            // Skeleton loading state
            if (ev === SKELETON) {
              return (
                <div key="skeleton" style={{
                  width: '100%', flexShrink: 0, position: 'relative',
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  padding: '12px 20px 24px', minHeight: '220px',
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1A1A24, #2A2A3A)', animation: 'shimmer 1.5s ease-in-out infinite alternate' }} />
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ width: '60%', height: '20px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ width: '40%', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                </div>
              );
            }

            const name = ev.name || ev.artist_name || '';
            const venue = ev.venue || ev.venue_name || '';
            const timeStr = formatTimeFull(ev.start_time);
            const realImage = ev.artist_image || ev.image_url || ev.venues?.photo_url || null;
            const brandedGradient = BRANDED_GRADIENTS[i % BRANDED_GRADIENTS.length];
            const hasBio = !!(ev.description && ev.description.trim());
            // const hasGenres = ev.artist_genres && ev.artist_genres.length > 0; // Hidden until genre data is audited
            const showMeetArtist = hasBio;

            return (
              <div
                key={ev.id || i}
                style={{
                  width: '100%',
                  flexShrink: 0,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '0',
                  minHeight: '240px',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                {/* Full-bleed background — real image or branded gradient fallback */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  ...(realImage
                    ? { backgroundImage: `url(${realImage})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
                    : { background: brandedGradient }
                  ),
                }} />
                {/* Branded watermark when using gradient fallback */}
                {!realImage && (
                  <div style={{
                    position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                    fontSize: '28px', fontWeight: 900, color: 'rgba(255,255,255,0.06)',
                    fontFamily: "'DM Sans', sans-serif", letterSpacing: '2px', whiteSpace: 'nowrap',
                    pointerEvents: 'none', textTransform: 'uppercase',
                  }}>
                    myLocalJam
                  </div>
                )}

                {/* Gradient overlay — heavier at bottom for text readability */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: realImage
                    ? 'linear-gradient(to top, rgba(15,15,20,0.95) 0%, rgba(15,15,20,0.7) 35%, rgba(15,15,20,0.2) 60%, transparent 100%)'
                    : 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.75) 100%)',
                }} />

                {/* Subtle warm glow accents */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: `
                    radial-gradient(circle at 10% 80%, rgba(232,114,42,0.1) 0%, transparent 45%),
                    radial-gradient(circle at 90% 20%, rgba(58,173,160,0.06) 0%, transparent 40%)`,
                }} />

                {/* Content — positioned at bottom */}
                <div style={{ position: 'relative', zIndex: 10, padding: '16px 20px 24px' }}>
                  {/* Spotlight badge — grouped above text with breathing room */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                    <span style={{
                      background: 'rgba(94,42,132,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                      color: '#FFFFFF', fontSize: '10px', fontWeight: 900,
                      textTransform: 'uppercase', letterSpacing: '1.5px', padding: '5px 11px 5px 8px', borderRadius: '999px',
                      display: 'inline-flex', alignItems: 'center', gap: '4px', lineHeight: 1,
                      fontFamily: "'Arial Black', 'Anton', 'Archivo Black', sans-serif",
                      textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}>
                      {/* Material: bolt */}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFFFFF" style={{ flexShrink: 0 }}>
                        <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
                      </svg>
                      {isToday ? "Today's Spotlight" : 'Coming Up'}
                    </span>
                  </div>

                  {/* Artist name */}
                  <h2 style={{
                    color: 'white', fontSize: 'clamp(20px, 6vw, 26px)', fontWeight: 900, lineHeight: 1.15,
                    margin: '0 0 6px 0',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {name}
                  </h2>

                  {/* Venue + Time */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'nowrap',
                    color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 500,
                    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {timeStr && (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {/* Material: schedule */}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.85 }}>
                            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
                          </svg>
                          {timeStr}
                        </span>
                        <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
                      </>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {/* Material: place */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.85 }}>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      {venue}
                    </span>
                  </div>

                  {/* Genre pills — hidden until genre data is audited
                  {hasGenres && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {ev.artist_genres.slice(0, 3).map((g, gi) => (
                        <span key={gi} style={{
                          padding: '3px 10px', borderRadius: '999px',
                          fontSize: '10px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)',
                          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                          {g}
                        </span>
                      ))}
                    </div>
                  )} */}

                  {/* Meet the Artist button */}
                  {showMeetArtist && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openBioSheet(ev); }}
                      style={{
                        marginTop: '12px',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '8px 18px', borderRadius: '999px',
                        background: 'rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        color: '#FFFFFF', fontSize: '12px', fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                        letterSpacing: '0.3px',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease, transform 0.15s ease',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                    >
                      {/* Material: music_note */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                      Meet the Artist
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots — positioned over the hero */}
      {featured.length > 1 && (
        <div style={{ position: 'absolute', bottom: '10px', right: '20px', display: 'flex', gap: '5px', zIndex: 10 }}>
          {featured.map((_, i) => (
            <button key={i} onClick={() => handleDotClick(i)} style={{
              height: '7px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              width: i === active ? '18px' : '7px',
              background: i === active ? '#E8722A' : 'rgba(255,255,255,0.4)',
              transition: 'all 0.3s',
              WebkitTapHighlightColor: 'transparent',
            }} />
          ))}
        </div>
      )}

      {/* ── Bio Bottom Sheet ────────────────────────────────────────────── */}
      {bioSheet && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeBioSheet}
            style={{
              position: 'fixed', inset: 0, zIndex: 500,
              background: sheetVisible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
              backdropFilter: sheetVisible ? 'blur(3px)' : 'none',
              WebkitBackdropFilter: sheetVisible ? 'blur(3px)' : 'none',
              transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
            }}
          />
          {/* Sheet */}
          <div
            ref={sheetRef}
            style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              zIndex: 501,
              background: '#1A1A28',
              borderRadius: '20px 20px 0 0',
              maxHeight: '70vh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            }}
          >
            {/* Drag handle */}
            <div style={{
              display: 'flex', justifyContent: 'center', padding: '12px 0 4px',
              cursor: 'grab', position: 'sticky', top: 0,
              background: '#1A1A28', zIndex: 2,
              borderRadius: '20px 20px 0 0',
            }}>
              <div style={{
                width: '36px', height: '4px', borderRadius: '2px',
                background: 'rgba(255,255,255,0.2)',
              }} />
            </div>

            <div style={{ padding: '8px 24px 24px' }}>
              {/* Artist header in the sheet */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                {/* Thumbnail */}
                {(bioSheet.artist_image || bioSheet.image_url) ? (
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '14px', flexShrink: 0,
                    overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    border: '2px solid rgba(255,255,255,0.1)',
                  }}>
                    <img
                      src={bioSheet.artist_image || bioSheet.image_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '14px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #E8722A, #3AADA0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Material: music_note */}
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    color: '#FFFFFF', fontSize: '18px', fontWeight: 800, margin: '0 0 2px',
                    fontFamily: "'DM Sans', sans-serif",
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {bioSheet.name || bioSheet.artist_name || ''}
                  </h3>
                  <div style={{
                    color: 'rgba(255,255,255,0.55)', fontSize: '12px', fontWeight: 500,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {bioSheet.venue || bioSheet.venue_name || ''}
                  </div>
                </div>
              </div>

              {/* Genre tags — hidden until genre data is audited
              {bioSheet.artist_genres && bioSheet.artist_genres.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {bioSheet.artist_genres.map((g, gi) => (
                    <span key={gi} style={{
                      padding: '4px 12px', borderRadius: '999px',
                      fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      background: 'rgba(232,114,42,0.15)', color: '#E8722A',
                      border: '1px solid rgba(232,114,42,0.25)',
                    }}>
                      {g}
                    </span>
                  ))}
                </div>
              )} */}

              {/* Bio text */}
              {bioSheet.description && bioSheet.description.trim() && (
                <p style={{
                  color: 'rgba(255,255,255,0.8)', fontSize: '14px', lineHeight: 1.65,
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
                  margin: 0,
                }}>
                  {bioSheet.description.trim()}
                </p>
              )}

              {/* No bio fallback */}
              {(!bioSheet.description || !bioSheet.description.trim()) && (
                <p style={{
                  color: 'rgba(255,255,255,0.4)', fontSize: '13px', fontStyle: 'italic',
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>
                  No bio available yet for this artist.
                </p>
              )}

              {/* Close button */}
              <button
                onClick={closeBioSheet}
                style={{
                  marginTop: '24px', width: '100%',
                  padding: '12px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes shimmer { from { opacity: 0.6; } to { opacity: 1; } }`}</style>
    </div>
  );
}
