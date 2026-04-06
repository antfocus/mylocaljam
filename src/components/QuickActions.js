'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * QuickActions — Horizontal toolbelt anchored to the card's top-center.
 *
 * Positioning:
 *   - Receives `cardRect` ({ top, left, width, height }) from EventCardV2.
 *   - `left` = rect.left + rect.width/2  →  `transform: translateX(-50%)` centers it.
 *   - `top`  = rect.top − 12px           →  `transform: translateY(-100%)` sits above.
 *   - Flip:  if rect.top < 80 (card near screen top), menu appears INSIDE the card
 *            at rect.top + 8px with `translateY(0)`.
 *
 * Button styles: 1:1 copy of EventCardV2 expanded-section buttons.
 * Dismissal: backdrop tap, scroll, or Escape.
 */
export default function QuickActions({
  open,
  onClose,
  cardRect,
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

  // ── Scroll dismisses ─────────────────────────────────────────────
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

  if (typeof window === 'undefined' || !visible || !cardRect) return null;

  // ── Card-anchored position ────────────────────────────────────────
  const GAP = 12;       // px above the card
  const FLIP_MIN = 80;  // if card top is within 80px of screen top, flip inside
  const PAD = 8;        // viewport edge padding
  const vw = window.innerWidth;

  const flipped = cardRect.top < FLIP_MIN;
  const cssTop = flipped
    ? cardRect.top + GAP                // inside the card, near top
    : cardRect.top - GAP;              // above the card
  let cssLeft = cardRect.left + cardRect.width / 2;

  // Horizontal clamp (~280px bar; half ≈ 140)
  const halfBar = 140;
  if (cssLeft < PAD + halfBar) cssLeft = PAD + halfBar;
  if (cssLeft > vw - PAD - halfBar) cssLeft = vw - PAD - halfBar;

  const baseTransform = flipped
    ? 'translate(-50%, 0%)'
    : 'translate(-50%, -100%)';

  const animTransform = animIn
    ? baseTransform
    : flipped
      ? 'translate(-50%, 0%) scale(0.95)'
      : 'translate(-50%, -100%) scale(0.95)';

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
      {/* Backdrop — light scrim for focus without blackout */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 200,
          background: animIn ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0)',
          backdropFilter: animIn ? 'blur(1px)' : 'none',
          WebkitBackdropFilter: animIn ? 'blur(1px)' : 'none',
          transition: 'background 0.2s ease, backdrop-filter 0.2s ease',
          WebkitTapHighlightColor: 'transparent',
          border: 'none', outline: 'none',
        }}
      />

      {/* Toolbelt bar — anchored to card top-center */}
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
          transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
