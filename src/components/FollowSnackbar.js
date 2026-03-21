'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * FollowSnackbar — Sticky Action Snackbar for follow upsell
 *
 * Slides up from the bottom (above the nav bar) after a save.
 * - No artist → auto-dismiss after 3s: "Event saved to My Jam"
 * - Has artist → sticky until user taps Follow or dismisses
 *
 * Uses Google Material Icons font (loaded in layout.js).
 */
export default function FollowSnackbar({
  visible,
  artistName,
  onFollowArtist,
  onDismiss,
}) {
  const [followState, setFollowState] = useState('idle'); // 'idle' | 'following'
  const [leaving, setLeaving] = useState(false);

  const hasArtist = artistName && artistName.trim().length > 0;

  // Auto-dismiss after 3s when there's no artist
  useEffect(() => {
    if (!visible) return;
    if (hasArtist) return;

    const timer = setTimeout(() => {
      fadeOut();
    }, 3000);
    return () => clearTimeout(timer);
  }, [visible, hasArtist]);

  // Reset follow state when snackbar becomes visible
  useEffect(() => {
    if (visible) {
      setFollowState('idle');
      setLeaving(false);
    }
  }, [visible]);

  const fadeOut = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      onDismiss?.();
    }, 300);
  }, [onDismiss]);

  const handleFollow = useCallback(() => {
    try { navigator?.vibrate?.(10); } catch {}
    setFollowState('following');
    onFollowArtist?.();
    // Show "Following!" briefly, then fade
    setTimeout(() => {
      fadeOut();
    }, 1200);
  }, [onFollowArtist, fadeOut]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        width: '94%',
        maxWidth: '480px',
        animation: leaving ? 'snackFadeOut 0.3s ease-out forwards' : 'snackSlideUp 0.25s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#2A2520',
          borderRadius: '14px',
          padding: hasArtist ? '10px 10px 10px 14px' : '12px 14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Left side — check icon + text */}
        <span
          className="material-icons"
          style={{
            fontSize: '22px',
            color: '#E8722A',
            flexShrink: 0,
          }}
        >
          check_circle
        </span>
        <span
          style={{
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {hasArtist ? 'Event saved' : 'Event saved to My Jam'}
        </span>

        {/* Right side — Follow button (only if artist exists) */}
        {hasArtist && (
          <button
            onClick={(e) => { e.stopPropagation(); handleFollow(); }}
            disabled={followState === 'following'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: followState === 'following' ? '#4E342E' : '#3E2723',
              border: '1px solid #5D4037',
              borderRadius: '10px',
              padding: '8px 14px',
              cursor: followState === 'following' ? 'default' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s, transform 0.1s',
            }}
          >
            <span
              className="material-icons"
              style={{
                fontSize: '18px',
                color: '#FFFFFF',
              }}
            >
              {followState === 'following' ? 'check' : 'music_note'}
            </span>
            <span
              style={{
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {followState === 'following'
                ? 'Following!'
                : `Follow ${artistName.length > 16 ? artistName.slice(0, 16) + '…' : artistName}`}
            </span>
          </button>
        )}

        {/* Dismiss X (only for sticky/artist snackbar) */}
        {hasArtist && followState === 'idle' && (
          <button
            onClick={(e) => { e.stopPropagation(); fadeOut(); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="material-icons"
              style={{
                fontSize: '20px',
                color: '#7878A0',
              }}
            >
              close
            </span>
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes snackSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes snackFadeOut {
          from { opacity: 1; transform: translateX(-50%) translateY(0); }
          to   { opacity: 0; transform: translateX(-50%) translateY(20px); }
        }
      `}</style>
    </div>
  );
}
