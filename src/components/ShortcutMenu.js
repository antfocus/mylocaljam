'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

/**
 * ShortcutMenu — Native-style long-press radial shortcut overlay.
 *
 * Appears as a floating pill anchored near the press point with 4 quick actions:
 *   1. Follow Artist  (bell icon)
 *   2. Share          (share icon)
 *   3. Location       (pin icon — opens Google Maps)
 *   4. Flag           (flag icon — opens flag sheet)
 *
 * Props:
 *   open            (bool)   — Controls visibility
 *   onClose         (func)   — Called when overlay backdrop is tapped
 *   anchorY         (number) — clientY of the long-press origin
 *   anchorX         (number) — clientX of the long-press origin
 *   darkMode        (bool)   — Theme toggle
 *   event           (object) — The event data for action context
 *   onFollowArtist  (func)   — Follow callback
 *   isArtistFollowed (bool)  — Whether user already follows this artist
 *   onShare         (func)   — Share callback
 *   onLocation      (func)   — Location callback
 *   onFlag          (func)   — Flag callback
 */
export default function ShortcutMenu({
  open,
  onClose,
  anchorY = 0,
  anchorX = 0,
  darkMode = true,
  event,
  onFollowArtist,
  isArtistFollowed = false,
  onShare,
  onLocation,
  onFlag,
}) {
  const menuRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Compute position — keep menu within viewport
  const menuWidth = 220;
  const menuHeight = 240;
  const padding = 12;
  const computePosition = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    let top = anchorY - menuHeight / 2;
    let left = anchorX - menuWidth / 2;
    // Clamp to viewport
    if (top < padding) top = padding;
    if (top + menuHeight > vh - padding) top = vh - menuHeight - padding;
    if (left < padding) left = padding;
    if (left + menuWidth > vw - padding) left = vw - menuWidth - padding;
    return { top, left };
  };

  const bg = darkMode ? '#1E1E2E' : '#FFFFFF';
  const border = darkMode ? '#2E2E42' : '#E5E7EB';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted = darkMode ? '#7878A0' : '#6B7280';
  const hoverBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const accent = '#E8722A';

  const hasLocation = event?.venue_address || (event?.venue_lat && event?.venue_lng);
  const hasArtist = !!event?.artist_name;

  const actions = [
    {
      key: 'follow',
      label: isArtistFollowed ? 'Following' : (hasArtist ? 'Follow Artist' : 'No Artist'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      disabled: !hasArtist || isArtistFollowed,
      action: () => { onFollowArtist?.(); onClose?.(); },
    },
    {
      key: 'share',
      label: 'Share',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      ),
      disabled: false,
      action: () => { onShare?.(); onClose?.(); },
    },
    {
      key: 'location',
      label: 'Directions',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      disabled: !hasLocation,
      action: () => { onLocation?.(); onClose?.(); },
    },
    {
      key: 'flag',
      label: 'Report',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      ),
      disabled: false,
      action: () => { onFlag?.(); onClose?.(); },
    },
  ];

  if (typeof window === 'undefined') return null;

  const pos = computePosition();

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="shortcut-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 900,
              background: 'rgba(0,0,0,0.35)',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
          {/* Menu */}
          <motion.div
            ref={menuRef}
            key="shortcut-menu"
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400, duration: 0.25 }}
            style={{
              position: 'fixed',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              zIndex: 901,
              width: `${menuWidth}px`,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: '16px',
              padding: '8px 0',
              boxShadow: darkMode
                ? '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
                : '0 8px 32px rgba(0,0,0,0.15)',
              fontFamily: "'DM Sans', sans-serif",
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '6px 16px 10px',
              borderBottom: `1px solid ${border}`,
              marginBottom: '4px',
            }}>
              <p style={{
                margin: 0, fontSize: '11px', fontWeight: 700,
                color: textMuted, textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Quick Actions
              </p>
            </div>

            {/* Action rows */}
            {actions.map((act, i) => (
              <motion.button
                key={act.key}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                onClick={(e) => { e.stopPropagation(); if (!act.disabled) act.action(); }}
                disabled={act.disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  width: '100%', padding: '12px 16px',
                  background: 'transparent',
                  border: 'none', cursor: act.disabled ? 'default' : 'pointer',
                  color: act.disabled ? textMuted : textPrimary,
                  opacity: act.disabled ? 0.4 : 1,
                  fontSize: '14px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'background 0.1s',
                  textAlign: 'left',
                }}
                onPointerEnter={(e) => {
                  if (!act.disabled) e.currentTarget.style.background = hoverBg;
                }}
                onPointerLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: act.disabled
                    ? (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
                    : (act.key === 'follow' ? 'rgba(232,114,42,0.12)' : darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                  color: act.disabled ? textMuted : (act.key === 'follow' ? accent : textPrimary),
                  flexShrink: 0,
                }}>
                  {act.icon}
                </span>
                {act.label}
              </motion.button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
