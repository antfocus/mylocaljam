'use client';

import { useCallback } from 'react';

/**
 * Follow Action Bottom Sheet
 *
 * Triggered when user taps the ⊕ icon on an event card.
 * Presents a menu of follow/save actions:
 *   1. Follow Artist (if artist available)
 *   2. Follow Venue
 *   3. Follow Both (❤️ icon)
 *   4. Save Event Only (muted text link)
 *   5. Cancel (text link)
 *
 * Design rules:
 *  - Tonal burnt-orange buttons with bold WHITE text
 *  - "Save Event Only" as muted gray text link (not a button)
 *  - Cancel as text link
 *  - Same bottom-sheet pattern as the flag sheet (overlay + slide-up)
 */
export default function FollowActionSheet({
  darkMode = true,
  eventName,
  artistName,
  venueName,
  isArtistFollowed,
  isVenueFollowed,
  onFollowArtist,
  onFollowVenue,
  onFollowBoth,
  onSaveOnly,
  onClose,
}) {
  // Theme tokens
  const sheetBg     = darkMode ? '#1A1A24' : '#FFFFFF';
  const sheetBorder = darkMode ? '#2A2A3A' : '#E5E7EB';
  const overlayBg   = 'rgba(0,0,0,0.5)';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#7878A0' : '#6B7280';

  // Burnt-orange tonal button style
  const tonalBg     = darkMode ? '#3E2723' : '#4E342E';
  const tonalBorder = darkMode ? '#5D4037' : '#6D4C41';

  const handleAction = useCallback((action) => {
    // Haptic on selection
    try { navigator?.vibrate?.(10); } catch {}
    action?.();
  }, []);

  const hasArtist = artistName && artistName.trim().length > 0;
  const hasVenue  = venueName && venueName.trim().length > 0;

  // If artist is already followed, don't show "Follow Artist" as primary
  const showFollowArtist = hasArtist && !isArtistFollowed;
  const showFollowVenue  = hasVenue && !isVenueFollowed;
  const showFollowBoth   = showFollowArtist && showFollowVenue;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 250, background: overlayBg,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '500px',
          background: sheetBg,
          borderRadius: '16px 16px 0 0',
          border: `1px solid ${sheetBorder}`,
          borderBottom: 'none',
          padding: '20px 16px calc(28px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: '40px', height: '4px', borderRadius: '2px',
          background: darkMode ? '#3A3A4A' : '#D1D5DB',
          margin: '0 auto 16px',
        }} />

        {/* Title */}
        <h3 style={{
          fontSize: '16px', fontWeight: 800, color: textPrimary,
          textAlign: 'center', marginBottom: '4px',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Save &amp; Follow
        </h3>
        <p style={{
          fontSize: '12px', color: textMuted, textAlign: 'center', marginBottom: '16px',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {eventName ? `${eventName}` : 'Get notified about future shows'}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Follow Artist */}
          {showFollowArtist && (
            <button
              onClick={() => handleAction(onFollowArtist)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '14px 16px', borderRadius: '12px',
                border: `1px solid ${tonalBorder}`,
                background: tonalBg,
                color: '#FFFFFF',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'transform 0.1s',
              }}
            >
              {/* Music note icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="#FFFFFF" />
              </svg>
              Follow {artistName}
            </button>
          )}

          {/* Follow Venue */}
          {showFollowVenue && (
            <button
              onClick={() => handleAction(onFollowVenue)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '14px 16px', borderRadius: '12px',
                border: `1px solid ${tonalBorder}`,
                background: tonalBg,
                color: '#FFFFFF',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'transform 0.1s',
              }}
            >
              {/* Location pin icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#FFFFFF" />
              </svg>
              Follow {venueName}
            </button>
          )}

          {/* Follow Both */}
          {showFollowBoth && (
            <button
              onClick={() => handleAction(onFollowBoth)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                width: '100%', padding: '14px 16px', borderRadius: '12px',
                border: '1px solid #E8722A',
                background: '#E8722A',
                color: '#1C1917',
                fontSize: '14px', fontWeight: 800, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'transform 0.1s',
              }}
            >
              {/* Heart icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#1C1917" />
              </svg>
              Follow Both
            </button>
          )}

          {/* Save Event Only — muted text link style */}
          <button
            onClick={() => handleAction(onSaveOnly)}
            style={{
              width: '100%', padding: '12px', borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              color: textMuted,
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              marginTop: showFollowArtist || showFollowVenue ? '0px' : '0px',
            }}
          >
            Save Event Only
          </button>

          {/* Cancel */}
          <button
            onClick={() => onClose?.()}
            style={{
              width: '100%', padding: '10px', borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              color: darkMode ? '#5A5A7A' : '#9CA3AF',
              fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Slide-up animation */}
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
