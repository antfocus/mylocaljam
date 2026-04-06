'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * QuickActions — Horizontal toolbelt triggered by long-press on EventCard.
 *
 * Positioning strategy (no ref measurement, no useEffect race):
 *   - `left` is set to anchorX,  `transform: translateX(-50%)` centers it.
 *   - `top`  is set to anchorY − 75px with `transform: translateY(-100%)`
 *     so the entire bar sits ABOVE the finger.
 *   - If anchorY − 75 < 100 (too close to top), flip BELOW the finger (+75px)
 *     and use `translateY(0)` instead.
 *   - A horizontal clamp keeps the bar within 12px of each viewport edge.
 *
 * Button styles are a 1:1 copy of EventCardV2's expanded-section buttons
 * (11px / 700 / 8px 14px / 8px radius / #2A2A3A dark bg).
 *
 * Actions: Follow Artist [+], Share, Report.
 * (Venue/Map intentionally excluded.)
 *
 * Dismissal: backdrop tap, scroll, or Escape key.
 */
export default function QuickActions({
  open,
  onClose,
  anchorX = 0,
  anchorY = 0,
  darkMode = true,
  event,
  onFollowArtist,
  isArtistFollowed = false,
  onShare,
  onFlag,
}) {
  const [visible, setVisible] = useState(false);
  const [animIn, setAnimIn] = useState(false);

  // ── Two-phase mount/animate ───────────────────────────────────────
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)));
    } else {
      setAnimIn(false);
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Escape to dismiss ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // ── Scroll on the main list dismisses the toolbelt ────────────────
  useEffect(() => {
    if (!open) return;
    const dismiss = () => onClose?.();
    window.addEventListener('scroll', dismiss, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', dismiss, { capture: true });
  }, [open, onClose]);

  const fire = useCallback((fn) => (e) => {
    e.stopPropagation();
    fn?.();
    onClose?.();
  }, [onClose]);

  if (typeof window === 'undefined' || !visible) return null;

  // ── Position: pure prop math, no ref needed ───────────────────────
  const GAP = 75;       // pixels between finger and bar edge
  const FLIP_MIN = 100; // if touch is within 100px of screen top, flip below
  const PAD = 12;       // viewport edge padding
  const vw = window.innerWidth;

  const flipped = anchorY - GAP < FLIP_MIN;
  // top: place the CSS anchor point at finger ± gap
  const cssTop = flipped ? anchorY + GAP : anchorY - GAP;
  // left: place at finger X, transform will center it
  let cssLeft = anchorX;
  // Rough clamp so the bar doesn't overflow horizontally.
  // The bar is ~280px wide; half is ~140.  Clamp the center point.
  const halfBar = 140;
  if (cssLeft < PAD + halfBar) cssLeft = PAD + halfBar;
  if (cssLeft > vw - PAD - halfBar) cssLeft = vw - PAD - halfBar;

  // transform: centerX; above-finger (or below if flipped)
  const baseTransform = flipped
    ? 'translate(-50%, 0%)'       // bar hangs below the anchor point
    : 'translate(-50%, -100%)';   // bar sits above the anchor point

  const animTransform = animIn
    ? baseTransform
    : flipped
      ? 'translate(-50%, 10px)'
      : 'translate(-50%, calc(-100% + 10px))';

  // ── 1:1 button style from EventCardV2 expanded section ────────────
  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '11px', fontWeight: 700,
    padding: '8px 14px', borderRadius: '8px',
    background: darkMode ? '#2A2A3A' : '#E5E7EB',
    color: darkMode ? '#AAAACC' : '#4B5563',
    border: 'none', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
    WebkitTapHighlightColor: 'transparent',
  };

  const disabledBtn = { ...btnStyle, opacity: 0.35, cursor: 'default' };

  const hasArtist = !!event?.artist_name;
  const followDisabled = !hasArtist || isArtistFollowed;

  return createPortal(
    <>
      {/* Backdrop — subtle dark scrim, no borders/highlights */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 200,
          background: animIn ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0)',
          transition: 'background 0.2s ease',
          WebkitTapHighlightColor: 'transparent',
          border: 'none', outline: 'none',
        }}
      />

      {/* Toolbelt bar — positioned via props, centered via transform */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: `${cssTop}px`,
          left: `${cssLeft}px`,
          zIndex: 201,
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 10px',
          background: darkMode ? '#111119' : '#F3F4F6',
          borderRadius: '12px',
          border: `1px solid ${darkMode ? '#2A2A3A' : '#D1D5DB'}`,
          boxShadow: darkMode
            ? '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
            : '0 4px 20px rgba(0,0,0,0.12)',
          opacity: animIn ? 1 : 0,
          transform: animTransform,
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          fontFamily: "'DM Sans', sans-serif",
          pointerEvents: animIn ? 'auto' : 'none',
        }}
      >
        {/* 1. Follow Artist — [+] icon */}
        <button
          onClick={followDisabled ? undefined : fire(() => {
            if (event?.artist_name) {
              try { navigator?.vibrate?.(10); } catch {}
              onFollowArtist?.();
            }
          })}
          disabled={followDisabled}
          style={followDisabled ? disabledBtn : btnStyle}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {isArtistFollowed ? 'Following' : 'Follow'}
        </button>

        {/* 2. Share — same icon as card */}
        <button onClick={fire(onShare)} style={btnStyle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="currentColor" />
          </svg>
          Share
        </button>

        {/* 3. Report — flag icon */}
        <button onClick={fire(onFlag)} style={btnStyle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          Report
        </button>
      </div>
    </>,
    document.body
  );
}
