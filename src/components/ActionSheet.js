'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * ActionSheet — Bottom-anchored action sheet triggered by long-press on EventCard.
 *
 * Slides up from the bottom of the viewport with a backdrop overlay.
 * Sits above the fixed bottom navigation (z-index: 200 vs nav's 100).
 * Uses CSS transform transitions — no framer-motion dependency.
 *
 * Actions:
 *   1. Follow Artist  (bell)
 *   2. Share          (share)
 *   3. Directions     (map pin)
 *   4. Report         (flag)
 */
export default function ActionSheet({
  open,
  onClose,
  darkMode = true,
  event,
  onFollowArtist,
  isArtistFollowed = false,
  onShare,
  onLocation,
  onFlag,
}) {
  // Two-phase render: `visible` controls mount, `animateIn` drives the CSS transition
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // Next frame: trigger slide-up
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
      // Wait for exit transition before unmounting
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleAction = useCallback((fn) => {
    return (e) => {
      e.stopPropagation();
      fn?.();
    };
  }, []);

  if (typeof window === 'undefined' || !visible) return null;

  const bg = darkMode ? '#1A1A24' : '#FFFFFF';
  const border = darkMode ? '#2A2A3A' : '#E5E7EB';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted = darkMode ? '#7878A0' : '#6B7280';
  const accent = '#E8722A';
  const handleBar = darkMode ? '#3A3A4A' : '#D1D5DB';

  const hasLocation = event?.venue_address || (event?.venue_lat && event?.venue_lng);
  const hasArtist = !!event?.artist_name;
  const eventName = (event?.event_title || event?.name || event?.artist_name || '').trim();
  const venueName = (event?.venue || event?.venue_name || '').trim();

  const actions = [
    {
      key: 'follow',
      label: isArtistFollowed ? 'Following' : (hasArtist ? 'Follow Artist' : 'No Artist'),
      sublabel: hasArtist ? event.artist_name : null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      iconBg: 'rgba(232,114,42,0.12)',
      iconColor: accent,
      disabled: !hasArtist || isArtistFollowed,
      action: () => { onFollowArtist?.(); onClose?.(); },
    },
    {
      key: 'share',
      label: 'Share Event',
      sublabel: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      ),
      iconBg: darkMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
      iconColor: '#3B82F6',
      disabled: false,
      action: () => { onShare?.(); onClose?.(); },
    },
    {
      key: 'location',
      label: 'Get Directions',
      sublabel: venueName || null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      iconBg: darkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)',
      iconColor: '#10B981',
      disabled: !hasLocation,
      action: () => { onLocation?.(); onClose?.(); },
    },
    {
      key: 'flag',
      label: 'Report Issue',
      sublabel: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      ),
      iconBg: darkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
      iconColor: '#EF4444',
      disabled: false,
      action: () => { onFlag?.(); onClose?.(); },
    },
  ];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,0.5)',
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.25s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      />
      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 201,
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
        }}
      >
        <div style={{
          width: '100%', maxWidth: '500px',
          margin: '0 auto',
          background: bg,
          borderRadius: '20px 20px 0 0',
          borderTop: `1px solid ${border}`,
          borderLeft: `1px solid ${border}`,
          borderRight: `1px solid ${border}`,
          boxShadow: '0 -12px 48px rgba(0,0,0,0.35)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {/* Drag handle */}
          <div style={{
            display: 'flex', justifyContent: 'center',
            padding: '10px 0 6px',
          }}>
            <div style={{
              width: '36px', height: '4px', borderRadius: '2px',
              background: handleBar,
            }} />
          </div>

          {/* Event context header */}
          <div style={{
            padding: '4px 20px 14px',
            borderBottom: `1px solid ${border}`,
          }}>
            <p style={{
              margin: 0, fontSize: '15px', fontWeight: 700,
              color: textPrimary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {eventName}
            </p>
            {venueName && (
              <p style={{
                margin: '2px 0 0', fontSize: '13px', fontWeight: 500,
                color: textMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {venueName}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ padding: '8px 12px 4px' }}>
            {actions.map((act) => (
              <button
                key={act.key}
                onClick={handleAction(act.disabled ? null : act.action)}
                disabled={act.disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  width: '100%', padding: '14px 12px',
                  background: 'transparent',
                  border: 'none', borderRadius: '12px',
                  cursor: act.disabled ? 'default' : 'pointer',
                  color: act.disabled ? textMuted : textPrimary,
                  opacity: act.disabled ? 0.4 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'background 0.12s',
                  textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onPointerDown={(e) => {
                  if (!act.disabled) e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                }}
                onPointerUp={(e) => { e.currentTarget.style.background = 'transparent'; }}
                onPointerLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Icon circle */}
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: act.disabled ? (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)') : act.iconBg,
                  color: act.disabled ? textMuted : act.iconColor,
                  flexShrink: 0,
                }}>
                  {act.icon}
                </span>
                {/* Label + sublabel */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: '15px', fontWeight: 600,
                    lineHeight: 1.3,
                  }}>
                    {act.label}
                  </span>
                  {act.sublabel && (
                    <span style={{
                      display: 'block', fontSize: '12px', fontWeight: 500,
                      color: textMuted, marginTop: '1px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {act.sublabel}
                    </span>
                  )}
                </div>
                {/* Chevron */}
                {!act.disabled && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Cancel button */}
          <div style={{ padding: '4px 12px 0' }}>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                border: `1px solid ${border}`,
                background: 'transparent',
                color: textMuted,
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
