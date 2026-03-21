'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
    });
  } catch { return d; }
}

function fmtTime(t) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
}

/**
 * SpotlightCarousel — Custom touch handler with translateX transforms.
 * Uses raw touchstart/touchmove/touchend with direction locking.
 * Moves track via transform: translateX() — no scroll containers.
 */
export default function SpotlightCarousel({ events = [], darkMode = true }) {
  const accent = '#E8722A';
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  const viewportRef = useRef(null);

  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentTranslate = useRef(0);
  const prevTranslate = useRef(0);
  const animFrame = useRef(null);
  const directionLocked = useRef(null);

  const getSlideWidth = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return 300;
    return vp.offsetWidth * 0.85 + 12;
  }, []);

  const snapTo = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, events.length - 1));
    const sw = getSlideWidth();
    const target = -(clamped * sw);
    currentTranslate.current = target;
    prevTranslate.current = target;
    setActive(clamped);
    if (trackRef.current) {
      trackRef.current.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
      trackRef.current.style.transform = `translateX(${target}px)`;
    }
  }, [events.length, getSlideWidth]);

  const applyTransform = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${currentTranslate.current}px)`;
    }
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onTouchStart = (e) => {
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
      if (!dragging.current && directionLocked.current !== 'x') return;
      dragging.current = false;

      const movedBy = currentTranslate.current - prevTranslate.current;
      let newIdx = active;
      if (movedBy < -50 && active < events.length - 1) newIdx = active + 1;
      else if (movedBy > 50 && active > 0) newIdx = active - 1;

      directionLocked.current = null;
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      snapTo(newIdx);
    };

    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd, { passive: true });
    vp.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
      vp.removeEventListener('touchcancel', onTouchEnd);
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [active, events.length, getSlideWidth, snapTo, applyTransform]);

  useEffect(() => {
    if (events.length) snapTo(0);
  }, [events.length, snapTo]);

  // Tap-to-advance: tap right half = next, left half = prev
  const handleTap = useCallback((e) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tapX = e.clientX || e.changedTouches?.[0]?.clientX || 0;
    const mid = rect.left + rect.width / 2;
    if (tapX > mid && active < events.length - 1) snapTo(active + 1);
    else if (tapX <= mid && active > 0) snapTo(active - 1);
  }, [active, events.length, snapTo]);

  if (!events?.length) return null;

  return (
    <div style={{ marginBottom: '8px' }}>
      {/* Label */}
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px',
          textTransform: 'uppercase', color: accent, fontFamily: "'DM Sans', sans-serif",
        }}>★ Spotlight</span>
        <div style={{ flex: 1, height: '1px', background: darkMode ? '#2A2A3A' : '#E5E7EB', opacity: 0.5 }} />
      </div>

      {/* Viewport — overflow: hidden, custom touch handlers */}
      <div
        ref={viewportRef}
        onClick={handleTap}
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
            gap: '12px',
            paddingLeft: '16px',
            paddingRight: '16px',
            willChange: 'transform',
          }}
        >
          {events.map((ev, i) => {
            const img = ev.artist_image || ev.image_url;
            return (
              <div
                key={ev.id || i}
                style={{
                  width: '85%',
                  flexShrink: 0,
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                }}
              >
                <div style={{
                  borderRadius: '16px',
                  position: 'relative',
                  height: '200px',
                  overflow: 'hidden',
                  background: img ? '#111' : `linear-gradient(135deg, ${accent}, #d35f1a)`,
                  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`,
                  boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.1)',
                  WebkitTouchCallout: 'none',
                }}>
                  {img ? (
                    <img src={img} alt="" draggable={false} loading={i < 2 ? 'eager' : 'lazy'}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        objectFit: 'cover', pointerEvents: 'none',
                        WebkitUserDrag: 'none',
                      }}
                    />
                  ) : (
                    <div style={{
                      position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: '22px', fontWeight: 900, color: 'rgba(255,255,255,0.08)',
                      fontFamily: "'DM Sans', sans-serif", letterSpacing: '2px', whiteSpace: 'nowrap',
                      pointerEvents: 'none', textTransform: 'uppercase',
                    }}>
                      myLocalJam
                    </div>
                  )}

                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: img
                      ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)'
                      : 'linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 60%)',
                  }} />

                  <div style={{
                    position: 'absolute', top: 12, left: 12, padding: '4px 10px', borderRadius: 8,
                    background: 'rgba(232,114,42,0.9)', backdropFilter: 'blur(8px)', pointerEvents: 'none',
                    fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.5px',
                    fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
                  }}>★ Spotlight</div>

                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, pointerEvents: 'none' }}>
                    <div style={{
                      fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: "'DM Sans', sans-serif",
                      textShadow: '0 1px 4px rgba(0,0,0,0.5)', lineHeight: 1.2, marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{ev.name || ev.event_title || ev.artist_name}</div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
                      fontFamily: "'DM Sans', sans-serif", textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}>
                      <span>{ev.venue || ev.venue_name}</span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span>{fmtDate(ev.date)}</span>
                      {ev.start_time && ev.start_time !== '00:00' && <>
                        <span style={{ opacity: 0.5 }}>·</span>
                        <span>{fmtTime(ev.start_time)}</span>
                      </>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      {events.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, padding: '4px 0' }}>
          {events.map((_, i) => (
            <button key={i} aria-label={`Slide ${i + 1}`} onClick={() => snapTo(i)}
              style={{
                border: 'none', background: 'none', padding: '8px 0', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <span style={{
                display: 'block',
                width: i === active ? 18 : 6, height: 6, borderRadius: 3,
                background: i === active ? accent : (darkMode ? '#3A3A50' : '#D1D5DB'),
                transition: 'width 0.2s ease, background 0.2s ease',
              }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
