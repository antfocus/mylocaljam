'use client';

/**
 * HeroSection.js — "Today's Spotlight" swipeable hero with auto-rotate.
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
  const activeRef = useRef(0); // Mirror of active for use in non-React callbacks
  const trackRef = useRef(null);
  const viewportRef = useRef(null);

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
      // PAUSE auto-rotate immediately
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
        // Resume auto-rotate since user is scrolling vertically
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
        // RESUME auto-rotate after non-swipe interaction
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

      // RESUME auto-rotate after 2s delay
      scheduleResume();
    };

    // Mouse handlers for desktop
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

  // Pause auto-rotate when dot is tapped, resume after delay
  const handleDotClick = useCallback((i) => {
    pauseAutoRotate();
    snapTo(i);
    scheduleResume();
  }, [pauseAutoRotate, snapTo, scheduleResume]);

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
                  padding: '12px 20px 24px', minHeight: '150px',
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
                  padding: '12px 20px 24px',
                  minHeight: '150px',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                {/* Background — real image or branded gradient fallback */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  ...(realImage
                    ? { backgroundImage: `url(${realImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: brandedGradient }
                  ),
                }} />
                {/* Branded watermark when using gradient fallback */}
                {!realImage && (
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)',
                    fontSize: '28px', fontWeight: 900, color: 'rgba(255,255,255,0.06)',
                    fontFamily: "'DM Sans', sans-serif", letterSpacing: '2px', whiteSpace: 'nowrap',
                    pointerEvents: 'none', textTransform: 'uppercase',
                  }}>
                    myLocalJam
                  </div>
                )}

                {/* Dark gradient overlay */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.80) 100%)',
                }} />

                {/* Subtle warm glow */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: `
                    radial-gradient(circle at 10% 80%, rgba(232,114,42,0.12) 0%, transparent 45%),
                    radial-gradient(circle at 90% 20%, rgba(58,173,160,0.08) 0%, transparent 40%)`,
                }} />

                {/* Spotlight badge */}
                <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{
                    background: '#5E2A84', color: '#FFFFFF', fontSize: '13px', fontWeight: 900,
                    textTransform: 'uppercase', letterSpacing: '1.5px', padding: '6px 14px 6px 10px', borderRadius: '999px',
                    display: 'inline-flex', alignItems: 'center', gap: '5px', lineHeight: 1,
                    fontFamily: "'Arial Black', 'Anton', 'Archivo Black', sans-serif",
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
                    </svg>
                    {isToday ? "Today's Spotlight" : 'Coming Up'}
                  </span>
                </div>

                {/* Event info */}
                <div style={{ position: 'relative', zIndex: 10 }}>
                  <h2 style={{
                    color: 'white', fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 900, lineHeight: 1.2,
                    margin: '0 0 6px 0',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}>
                    {name}
                  </h2>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'nowrap',
                    color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: 500,
                    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}>
                    {timeStr && (
                      <>
                        <span>🕒 {timeStr}</span>
                        <span style={{ margin: '0 8px', opacity: 0.5 }}>•</span>
                      </>
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📍 {venue}
                    </span>
                  </div>
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
      <style>{`@keyframes shimmer { from { opacity: 0.6; } to { opacity: 1; } }`}</style>
    </div>
  );
}
