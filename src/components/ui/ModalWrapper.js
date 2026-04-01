'use client';

/**
 * ModalWrapper — Reusable modal overlay + centered card container.
 *
 * Consolidates the backdrop pattern duplicated across 7+ modal files:
 *   AuthModal, WelcomeModal, AddToJarModal, SubmitEventModal,
 *   ReportIssueModal, AdminArtistModals (×4), EventPageClient, etc.
 *
 * Handles:
 *   - Fixed fullscreen backdrop with blur + dark overlay
 *   - Click-outside-to-dismiss (calls onClose)
 *   - Escape key to dismiss
 *   - Scroll-lock on body when open
 *   - stopPropagation on the card so clicks inside don't dismiss
 *   - z-index stacking (configurable)
 *
 * Props:
 *   onClose       (func)    — Called when backdrop is clicked or Escape pressed (required)
 *   zIndex        (number)  — z-index for the overlay (default: 600)
 *   blur          (number)  — Backdrop blur in px (default: 4)
 *   overlayBg     (string)  — Overlay background color (default: 'rgba(0,0,0,0.6)')
 *   align         (string)  — 'center' | 'bottom' — vertical alignment (default: 'center')
 *   maxWidth      (string)  — Max width of the card (default: '480px')
 *   maxHeight     (string)  — Max height of the card (default: '85vh')
 *   padding       (string)  — Card padding (default: '24px')
 *   cardStyle     (object)  — Additional inline styles for the card container
 *   overlayStyle  (object)  — Additional inline styles for the overlay
 *   className     (string)  — Additional CSS class for the card
 *   children      (node)    — Modal content
 */

import { useEffect, useCallback } from 'react';

export default function ModalWrapper({
  onClose,
  zIndex = 600,
  blur = 4,
  overlayBg = 'rgba(0,0,0,0.6)',
  align = 'center',
  maxWidth = '480px',
  maxHeight = '85vh',
  padding = '24px',
  cardStyle = {},
  overlayStyle = {},
  className = '',
  children,
}) {
  // ── Escape key handler ────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Body scroll lock ──────────────────────────────────────
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  // ── Overlay styles ────────────────────────────────────────
  const overlayBaseStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex,
    background: overlayBg,
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
    display: 'flex',
    alignItems: align === 'bottom' ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: align === 'bottom' ? '0' : '24px',
    ...overlayStyle,
  };

  // ── Card styles ───────────────────────────────────────────
  const cardBaseStyle = {
    background: 'var(--bg-card, #1a1a2e)',
    borderRadius: '16px',
    padding,
    maxWidth,
    width: '90%',
    maxHeight,
    overflowY: 'auto',
    border: '1px solid var(--border, rgba(255,255,255,0.08))',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    fontFamily: "'DM Sans', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    ...cardStyle,
  };

  return (
    <div style={overlayBaseStyle} onClick={onClose}>
      <div
        style={cardBaseStyle}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
