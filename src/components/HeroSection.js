'use client';

/**
 * HeroSection.js — Spotlight hybrid-overlay hero with auto-rotate.
 *
 * 16/10 full-bleed artist photo, bottom-heavy scrim, corner "SPOTLIGHT"
 * sticker, Outfit 900 artist name, DM Serif Display italic event title,
 * IBM Plex Mono meta line ("FRI · 7:00 PM · VENUE" — day-of-week in orange).
 * "Meet Artist" text link on the right opens the ArtistSpotlight bio modal.
 *
 * Auto-rotates every 5s and loops circularly — swiping past either end wraps
 * to the other (no cloned slides; the wrap transition is an instant cut so the
 * track doesn't fast-scroll across every slide in between).
 * Pauses on touch/mouse interaction, resumes 2s after release.
 * Uses custom touch handlers with translateX (proven on iOS Safari).
 */

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

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

// "2026-04-24" → "FRI" (Eastern TZ, 3-letter uppercase).
// Uses noon-local so DST transitions can't flip the weekday off-by-one.
function formatDayOfWeek(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', timeZone: 'America/New_York',
    }).toUpperCase();
  } catch { return ''; }
}

const HeroSection = forwardRef(function HeroSection({ events = [], spotlightEvents = [], isToday = true, onArtistTap, onSlideChange }, ref) {
  const hasSpotlight = spotlightEvents.length > 0;
  const featured = hasSpotlight
    ? spotlightEvents.slice(0, 8)
    : (events.length > 0 ? events.slice(0, 5) : [SKELETON]);

  const canSwipe = featured.length > 1;

  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const trackRef = useRef(null);
  const viewportRef = useRef(null);

  // Bio sheet state removed — now handled by ArtistSpotlight at root level

  // Touch state refs
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentTranslate = useRef(0);
  const prevTranslate = useRef(0);
  const animFrame = useRef(null);
  const directionLocked = useRef(null);
  const didSwipe = useRef(false); // Prevents click-to-open-bio after a swipe gesture

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
    const n = featured.length;
    if (n === 0) return;
    // Wrap-around: accept any integer (incl. negative), fold into [0, n-1].
    const wrapped = ((idx % n) + n) % n;
    const prev = activeRef.current;
    // When wrapping between the first and last slide the translateX delta spans the
    // entire track — animating that produces a jarring fast-scroll through every slide.
    // Cut instantly instead (circular-tape splice). Only a concern for n > 2; with just
    // two slides the "wrap" is only one slide width of travel and animates fine.
    const isWrap = n > 2 && (
      (prev === n - 1 && wrapped === 0) ||
      (prev === 0 && wrapped === n - 1)
    );
    const useSmooth = isWrap ? false : smooth;
    const sw = getSlideWidth();
    const target = -(wrapped * sw);
    currentTranslate.current = target;
    prevTranslate.current = target;
    setActive(wrapped);
    activeRef.current = wrapped;
    if (trackRef.current) {
      trackRef.current.style.transition = useSmooth
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

  // ── Auto-rotate ───────────────────────────────────────────────────────────────────────────────────────
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

  // ── Touch swipe handlers ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !canSwipe) return;

    const onTouchStart = (e) => {
      pauseAutoRotate();
      didSwipe.current = false;
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
        didSwipe.current = true;
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
      // No boundary guards — snapTo wraps via modulo, so a swipe past either end cycles.
      if (movedBy < -50) newIdx = activeRef.current + 1;
      else if (movedBy > 50) newIdx = activeRef.current - 1;

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

  // ── Expose goToSlide + auto-rotate controls to parent via imperative handle ──
  // pauseAutoRotate / resumeAutoRotate let the ArtistSpotlight modal freeze the
  // carousel while it's open. resumeAutoRotate = startAutoRotate, which is
  // idempotent (clears any existing timer) and bails early if canSwipe is false,
  // so calling it at mount or while only one slide exists is safe.
  useImperativeHandle(ref, () => ({
    goToSlide: (i) => handleDotClick(i),
    pauseAutoRotate,
    resumeAutoRotate: startAutoRotate,
  }), [handleDotClick, pauseAutoRotate, startAutoRotate]);

  // ── Notify parent of slide changes ──
  useEffect(() => {
    if (onSlideChange) onSlideChange(active, featured.length);
  }, [active, featured.length, onSlideChange]);

  // ── Bio Bottom Sheet — MOVED to ArtistSpotlight component (root level) ──

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
            // Skeleton loading state — match 16/10 aspect so HeroPiston doesn't jump on hydration.
            if (ev === SKELETON) {
              return (
                <div key="skeleton" style={{
                  width: '100%', flexShrink: 0, position: 'relative',
                  aspectRatio: '16 / 10',
                  overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1A1A24, #2A2A3A)', animation: 'shimmer 1.5s ease-in-out infinite alternate' }} />
                  <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, zIndex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ width: '60%', height: '28px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ width: '40%', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                </div>
              );
            }

            // ── Data mapping ─────────────────────────────────────────────
            // Artist name is the primary display line; fall back to event_title/name if we
            // don't have an artist linked. Event title only shown as the italic subtitle when
            // it's a distinct value (skip if it duplicates the artist name).
            const artistName = ev.artist_name || ev.event_title || ev.name || '';
            const rawTitle = ev.event_title && ev.event_title.trim();
            const eventTitle = (rawTitle && rawTitle !== ev.artist_name) ? rawTitle : '';

            const venue = ev.venue || ev.venue_name || '';
            const timeStr = formatTimeFull(ev.start_time);
            const dayStr = formatDayOfWeek(ev.date);
            const realImage = ev.event_image || ev.artist_image || ev.image_url || ev.venues?.photo_url || null;
            const brandedGradient = BRANDED_GRADIENTS[i % BRANDED_GRADIENTS.length];
            const hasBio = !!(ev.description && ev.description.trim());
            const showMeetArtist = hasBio;

            // Meta row assembly — filter empty segments so separators don't dangle.
            const metaSegments = [
              dayStr && <span key="d" style={{ fontWeight: 500 }}>{dayStr}</span>,
              timeStr && <span key="t" style={{ color: '#FFFFFF', fontWeight: 600 }}>{timeStr}</span>,
              venue && <span key="v" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue}</span>,
            ].filter(Boolean);

            return (
              <div
                key={ev.id || i}
                onClick={() => { if (showMeetArtist && !didSwipe.current && onArtistTap) onArtistTap(ev); }}
                style={{
                  width: '100%',
                  flexShrink: 0,
                  position: 'relative',
                  aspectRatio: '16 / 10',
                  overflow: 'hidden',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  cursor: showMeetArtist ? 'pointer' : 'default',
                }}
              >
                {/* Full-bleed background — real image or branded gradient fallback */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  ...(realImage
                    // CSS url() values must be quoted when the URL can contain
                    // characters that break tokenization — most notably the
                    // unescaped parentheses common in scraped CDN paths
                    // (e.g. ".../foo (2) copy.jpg"). Without quotes, browsers
                    // silently drop the whole background-image property and
                    // the card renders with no photo. JSON.stringify wraps
                    // in double quotes and escapes any internal quotes.
                    ? { backgroundImage: `url(${JSON.stringify(realImage)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
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

                {/* Bottom-heavy scrim — per hybrid overlay spec */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'linear-gradient(180deg, rgba(19,19,28,0.15) 0%, rgba(19,19,28,0) 35%, rgba(19,19,28,0.55) 60%, rgba(19,19,28,0.92) 100%)',
                }} />

                {/* Radial orange glow, lower-left — brand accent */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'radial-gradient(ellipse at 15% 100%, rgba(232,114,42,0.22) 0%, transparent 55%)',
                }} />

                {/* Corner sticker — orange, tilted, with pulsing dark dot */}
                <div style={{
                  position: 'absolute', top: 14, right: 14, zIndex: 3,
                  background: '#E8722A', color: '#13131C',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.18em',
                  padding: '6px 10px', borderRadius: 3,
                  transform: 'rotate(4deg)',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#13131C',
                    marginRight: 6,
                    verticalAlign: '1px',
                    animation: 'spotlightPulse 2s ease-in-out infinite',
                  }} />
                  Spotlight
                </div>

                {/* Body — anchored bottom, per .ov-body spec */}
                <div style={{
                  position: 'absolute', left: 18, right: 18, bottom: 14, zIndex: 2,
                }}>
                  {/* Artist name — Outfit 900, uppercase, tight */}
                  <h2 style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 900,
                    fontSize: 32,
                    letterSpacing: '-0.03em',
                    color: '#FFFFFF',
                    textTransform: 'uppercase',
                    lineHeight: 0.95,
                    margin: 0,
                    // Clamp long names to 2 lines so the meta row never gets pushed off
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textShadow: '0 2px 12px rgba(0,0,0,0.5)',
                    wordBreak: 'break-word',
                  }}>
                    {artistName}
                  </h2>

                  {/* Event title — DM Serif Display italic with orange Outfit quote marks */}
                  {eventTitle && (
                    <p style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontStyle: 'italic',
                      fontWeight: 400,
                      fontSize: 19,
                      color: '#E8E8F0',
                      margin: '6px 0 0',
                      letterSpacing: '-0.005em',
                      lineHeight: 1.2,
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                    }}>
                      <span style={{
                        color: '#E8722A', fontStyle: 'normal',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 700, fontSize: 17,
                        verticalAlign: '1px',
                      }}>&ldquo;</span>
                      {eventTitle}
                      <span style={{
                        color: '#E8722A', fontStyle: 'normal',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: 700, fontSize: 17,
                        verticalAlign: '1px',
                      }}>&rdquo;</span>
                    </p>
                  )}

                  {/* Meta row — IBM Plex Mono caps, day-of-week in orange, with right-aligned Meet Artist link */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    marginTop: 10,
                  }}>
                    <div style={{
                      flex: 1, minWidth: 0,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11, fontWeight: 500,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: '#D8D8E8',
                      lineHeight: 1.2,
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    }}>
                      {metaSegments.map((seg, idx) => (
                        <span key={`seg-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                          {idx > 0 && <span style={{ color: '#6B6B85', margin: '0 6px' }}>·</span>}
                          {seg}
                        </span>
                      ))}
                    </div>

                    {showMeetArtist && (
                      <span
                        aria-hidden="true"
                        style={{
                          flexShrink: 0,
                          color: 'rgba(255,255,255,0.55)',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontWeight: 500,
                          fontSize: 11,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                        }}
                      >
                        Meet Artist →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pager dots removed per Spotlight redesign spec — swipe-discoverable. */}
      </div>

      {/* ── Bio Bottom Sheet — MOVED to ArtistSpotlight (root level in page.js) ── */}

      <style>{`
        @keyframes shimmer { from { opacity: 0.6; } to { opacity: 1; } }
        @keyframes spotlightPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>
    </div>
  );
});

HeroSection.displayName = 'HeroSection';
export default HeroSection;
