'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * QuickActions — Horizontal toolbelt triggered by long-press on EventCard.
 *
 * Positioned ~75px ABOVE the touch point so the user's thumb never occludes it.
 * Button styles are a 1:1 copy of the inline action buttons in EventCardV2's
 * expanded section (11px / 700 / 8px 14px / 8px radius / #2A2A3A dark bg).
 *
 * Actions: Follow Artist [+], Share, Report
 * (Venue/Map intentionally excluded per spec.)
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
  const barRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [animIn, setAnimIn] = useState(false);
  const [visible, setVisible] = useState(false);

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

  // ── Position: 75px above touch, clamped to viewport ───────────────
  useEffect(() => {
    if (!open || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const pad = 12;
    const barW = rect.width || 280;
    // 75px above the finger
    let top = anchorY - 75;
    let left = anchorX - barW / 2;
    // Clamp
    if (top < pad) top = pad;
    if (left < pad) left = pad;
    if (left + barW > vw - pad) left = vw - barW - pad;
    setPos({ top, left });
  }, [open, anchorX, anchorY]);

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
    // Capture phase so we catch scroll on any ancestor
    window.addEventListener('scroll', dismiss, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', dismiss, { capture: true });
  }, [open, onClose]);

  const fire = useCallback((fn) => (e) => {
    e.stopPropagation();
    fn?.();
    onClose?.();
  }, [onClose]);

  if (typeof window === 'undefined' || !visible) return null;

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

  const disabledBtn = {
    ...btnStyle,
    opacity: 0.35,
    cursor: 'default',
  };

  const hasArtist = !!event?.artist_name;
  const followDisabled = !hasArtist || isArtistFollowed;

  return createPortal(
    <>
      {/* Backdrop — full-screen invisible tap target */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 200,
          background: animIn ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)',
          transition: 'background 0.2s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      />

      {/* Toolbelt bar */}
      <div
        ref={barRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: `${pos.top}px`,
          left: `${pos.left}px`,
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
          transform: animIn ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.95)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          fontFamily: "'DM Sans', sans-serif",
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
        <button
          onClick={fire(onShare)}
          style={btnStyle}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="currentColor" />
          </svg>
          Share
        </button>

        {/* 3. Report — flag icon */}
        <button
          onClick={fire(onFlag)}
          style={btnStyle}
        >
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
