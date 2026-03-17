'use client';

import { useEffect } from 'react';
import { Icons } from './Icons';

/**
 * Toast component
 *
 * Variants:
 *  - 'success'  → large green bar with party emoji (4s)
 *  - 'upsell'   → amber/warm bar with action link (5s)
 *  - default    → small dark pill with accent border (3s)
 *
 * Props:
 *  - message: string (required)
 *  - variant: 'success' | 'upsell' | null
 *  - onDismiss: () => void
 *  - onAction: () => void — callback when action link is tapped (upsell variant)
 *  - actionLabel: string — text for the tappable link (default: 'Sign in')
 */
export default function Toast({ message, variant, onDismiss, onAction, actionLabel = 'Sign in' }) {
  const duration = variant === 'upsell' ? 3000 : variant === 'success' ? 4000 : 3000;

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  if (!message) return null;

  // Large green success toast
  if (variant === 'success') {
    return (
      <div
        style={{
          position: 'fixed', bottom: '24px', left: '16px', right: '16px',
          zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '10px', padding: '18px 24px', borderRadius: '16px',
          background: '#16A34A',
          boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          animation: 'slideUp 0.3s ease',
        }}
      >
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

  // Upsell toast — warm amber with tappable action
  if (variant === 'upsell') {
    return (
      <div
        style={{
          position: 'fixed', bottom: '24px', left: '16px', right: '16px',
          zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', padding: '14px 20px', borderRadius: '14px',
          background: '#292524',
          border: '1px solid #44403C',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.3s ease',
          flexWrap: 'wrap',
        }}
      >
        <span style={{
          color: '#FAFAF9', fontSize: '14px', fontWeight: 500,
          fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
        }}>
          {message}
        </span>
        {onAction && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(); onDismiss(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
              color: '#E8722A', fontSize: '14px', fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              textDecoration: 'underline', textUnderlineOffset: '2px',
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
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-medium"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--accent)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      <span style={{ color: 'var(--accent)' }}>{Icons.check}</span>
      {message}
    </div>
  );
}
