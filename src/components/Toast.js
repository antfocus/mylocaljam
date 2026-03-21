'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icons } from './Icons';

/**
 * Toast component
 *
 * Variants:
 *  - 'success'  → large green bar with party emoji (4s)
 *  - 'upsell'   → dark bar with message + follow CTA button (4s, transitions to "Following!" on action)
 *  - default    → small dark pill with accent border (3s)
 *
 * Design rules:
 *  - Orange buttons always use bold BLACK text (#1C1917) for contrast/accessibility
 *  - Mobile: bottom offset clears the bottom nav bar (~80px)
 *  - Desktop: max-width 480px, centered
 */
export default function Toast({ message, variant, onDismiss, onAction, actionLabel = 'Sign in' }) {
  const [confirmed, setConfirmed] = useState(false);
  const duration = variant === 'upsell' ? 4000 : variant === 'success' ? 4000 : 3000;

  useEffect(() => {
    if (confirmed) {
      const timer = setTimeout(onDismiss, 1500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration, confirmed]);

  useEffect(() => { setConfirmed(false); }, [message]);

  const handleAction = useCallback((e) => {
    e.stopPropagation();
    // Haptic on follow tap
    try { navigator?.vibrate?.(10); } catch {}
    onAction?.();
    setConfirmed(true);
  }, [onAction]);

  if (!message) return null;

  // Shared positioning: clears bottom nav on mobile, centered + capped width on desktop
  const toastPosition = {
    position: 'fixed',
    bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)',
    maxWidth: '440px',
    zIndex: 300,
    animation: 'slideUp 0.3s ease',
  };

  // Large green success toast
  if (variant === 'success') {
    return (
      <div style={{
        ...toastPosition,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '10px', padding: '18px 24px', borderRadius: '16px',
        background: '#16A34A',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
      }}>
        <span style={{ fontSize: '22px' }}>🎉</span>
        <span style={{
          color: 'white', fontSize: '16px', fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {message}
        </span>
      </div>
    );
  }

  // Upsell toast — dark bar with follow CTA
  if (variant === 'upsell') {
    if (confirmed) {
      return (
        <div style={{
          ...toastPosition,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', padding: '14px 20px', borderRadius: '14px',
          background: '#292524',
          border: '1px solid #E8722A',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#E8722A" />
            <path d="M10 15l-3.5-3.5 1.41-1.41L10 12.17l5.59-5.59L17 8l-7 7z" fill="#1C1917" />
          </svg>
          <span style={{
            color: '#E8722A', fontSize: '15px', fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Following!
          </span>
        </div>
      );
    }

    return (
      <div style={{
        ...toastPosition,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '10px', padding: '14px 16px', borderRadius: '14px',
        background: '#292524',
        border: '1px solid #44403C',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }}>
        <span style={{
          color: '#FAFAF9', fontSize: '14px', fontWeight: 500,
          fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
          flex: 1, minWidth: 0,
        }}>
          {message}
        </span>
        {onAction && (
          <button
            onClick={handleAction}
            style={{
              background: '#E8722A',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: '8px 14px',
              color: '#1C1917',
              fontSize: '13px',
              fontWeight: 800,
              fontFamily: "'DM Sans', sans-serif",
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    );
  }

  // Default small toast
  return (
    <div style={{
      ...toastPosition,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '10px', padding: '12px 20px', borderRadius: '12px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--accent)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      fontSize: '14px', fontWeight: 500,
    }}>
      <span style={{ color: 'var(--accent)' }}>{Icons.check}</span>
      {message}
    </div>
  );
}
