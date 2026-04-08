'use client';

/**
 * ArtistSpotlight.js — Full-screen overlay bio drawer for a featured artist.
 *
 * DETACHED FROM HEROSECTION (2026-04-08):
 *   - Renders at root level of page.js as a sibling, NOT inside HeroPiston.
 *   - position: fixed, inset: 0, z-index: 9000 — above everything except BetaWelcome.
 *   - Click-anywhere backdrop dismissal.
 *   - Swipe-to-dismiss on the sheet (drag down > 80px).
 *   - overflow-y: auto for long bios.
 *   - Does NOT affect HeroPiston scroll calculations at all.
 *
 * LIGHT-FIRST THEME (2026-04-08):
 *   - Accepts darkMode prop to match app theme toggle.
 *   - Light: frosted-glass backdrop, white card, charcoal text.
 *   - Dark: classic dark tint backdrop, dark card, white text.
 *   - Orange branding accents preserved in both modes.
 *
 * Props:
 *   event    — The event object to display (or null to hide).
 *   onClose  — Callback to clear the event and close the overlay.
 *   darkMode — Boolean, defaults to false (light mode first).
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export default function ArtistSpotlight({ event, onClose, darkMode = false }) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetRef = useRef(null);
  const sheetDragY = useRef(0);
  const sheetStartY = useRef(0);
  const sheetDragging = useRef(false);

  // ── Theme tokens ──
  const t = darkMode ? {
    backdrop:      'rgba(0, 0, 0, 0.55)',
    backdropBlur:  'blur(6px)',
    sheetBg:       '#1A1A28',
    handleBg:      'rgba(255, 255, 255, 0.2)',
    shadow:        '0 -8px 40px rgba(0, 0, 0, 0.5)',
    thumbBorder:   '2px solid rgba(255, 255, 255, 0.1)',
    thumbShadow:   '0 4px 16px rgba(0, 0, 0, 0.4)',
    titleColor:    '#FFFFFF',
    venueColor:    'rgba(255, 255, 255, 0.55)',
    bioColor:      'rgba(255, 255, 255, 0.85)',
    emptyColor:    'rgba(255, 255, 255, 0.4)',
  } : {
    backdrop:      'rgba(255, 255, 255, 0.4)',
    backdropBlur:  'blur(8px)',
    sheetBg:       '#FFFFFF',
    handleBg:      'rgba(0, 0, 0, 0.12)',
    shadow:        '0 -8px 40px rgba(0, 0, 0, 0.12), 0 -2px 12px rgba(0, 0, 0, 0.06)',
    thumbBorder:   '2px solid rgba(0, 0, 0, 0.06)',
    thumbShadow:   '0 4px 16px rgba(0, 0, 0, 0.1)',
    titleColor:    '#111827',
    venueColor:    '#6B7280',
    bioColor:      '#374151',
    emptyColor:    '#9CA3AF',
  };

  // ── Animate in when event changes ──
  useEffect(() => {
    if (event) {
      requestAnimationFrame(() => setSheetVisible(true));
    } else {
      setSheetVisible(false);
    }
  }, [event]);

  // ── Close handler: animate out, then notify parent ──
  const handleClose = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 300);
  }, [onClose]);

  // ── Swipe-to-dismiss ──
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !event) return;

    const onStart = (e) => {
      sheetDragging.current = true;
      sheetStartY.current = e.touches[0].clientY;
      sheetDragY.current = 0;
      el.style.transition = 'none';
    };

    const onMove = (e) => {
      if (!sheetDragging.current) return;
      const dy = e.touches[0].clientY - sheetStartY.current;
      if (dy > 0) {
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
        handleClose();
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
  }, [event, handleClose]);

  // ── Don't render anything if no event ──
  if (!event) return null;

  return (
    <>
      {/* Backdrop — frosted glass (light) or dark tint (dark) */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: sheetVisible ? t.backdrop : 'rgba(0,0,0,0)',
          backdropFilter: sheetVisible ? t.backdropBlur : 'none',
          WebkitBackdropFilter: sheetVisible ? t.backdropBlur : 'none',
          transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
        }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 9001,
          background: t.sheetBg,
          borderRadius: '20px 20px 0 0',
          maxHeight: '70vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: t.shadow,
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        {/* Drag handle */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '12px 0 4px',
          cursor: 'grab', position: 'sticky', top: 0,
          background: t.sheetBg, zIndex: 2,
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{
            width: '36px', height: '4px', borderRadius: '2px',
            background: t.handleBg,
          }} />
        </div>

        <div style={{ padding: '8px 24px 24px' }}>
          {/* Artist header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
            {/* Thumbnail */}
            {(event.artist_image || event.image_url) ? (
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px', flexShrink: 0,
                overflow: 'hidden',
                boxShadow: t.thumbShadow,
                border: t.thumbBorder,
              }}>
                <img
                  src={event.artist_image || event.image_url}
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{
                color: t.titleColor, fontSize: '18px', fontWeight: 800, margin: '0 0 2px',
                fontFamily: "'DM Sans', sans-serif",
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {event.event_title || event.name || event.artist_name || ''}
              </h3>
              <div style={{
                color: t.venueColor, fontSize: '12px', fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {event.venue || event.venue_name || ''}
              </div>
            </div>
          </div>

          {/* Bio text */}
          {event.description && event.description.trim() && (
            <p style={{
              color: t.bioColor, fontSize: '16px', lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
              margin: 0,
            }}>
              {event.description.trim()}
            </p>
          )}

          {/* No bio fallback */}
          {(!event.description || !event.description.trim()) && (
            <p style={{
              color: t.emptyColor, fontSize: '13px', fontStyle: 'italic',
              fontFamily: "'DM Sans', sans-serif", margin: 0,
            }}>
              No bio available yet for this artist.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
