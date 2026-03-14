'use client';

import { useState } from 'react';
import { formatTimeRange } from '@/lib/utils';

const CATEGORY_CONFIG = {
  'Live Music':      { color: '#E8722A', bg: '#E8722A', emoji: '🎵' },
  'Music':           { color: '#E8722A', bg: '#E8722A', emoji: '🎵' },
  'Happy Hour':      { color: '#3AADA0', bg: '#3AADA0', emoji: '🍹' },
  'Happy Hours':     { color: '#3AADA0', bg: '#3AADA0', emoji: '🍹' },
  'Daily Special':   { color: '#F59E0B', bg: '#F59E0B', emoji: '⭐' },
  'Daily Specials':  { color: '#F59E0B', bg: '#F59E0B', emoji: '⭐' },
  'Community':       { color: '#8B5CF6', bg: '#8B5CF6', emoji: '🤝' },
  'Community Event': { color: '#8B5CF6', bg: '#8B5CF6', emoji: '🤝' },
};

const DEFAULT_CONFIG = { color: '#E8722A', bg: '#E8722A', emoji: '🎵' };

export default function EventCardV2({ event, isFavorited = false, onToggleFavorite, darkMode = true, onFollowArtist, isArtistFollowed, onFlag }) {
  const [expanded, setExpanded] = useState(false);
  const [flagSheet, setFlagSheet] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  if (!event) return null;

  const name       = event.name        || event.artist_name || '';
  const venue      = event.venue       || event.venue_name  || '';
  const desc       = event.description || event.artist_bio  || '';
  const imageUrl   = event.image_url   || event.venue_photo || null;
  const rawTicket  = event.ticket_link || null;
  const sourceLink = event.source      || null;
  // Only show Tickets if it's a real external ticketing link (e.g. Ticketmaster),
  // not a venue-URL fallback. Compare hostnames — if same domain, it's not a real ticket link.
  const ticketLink = (() => {
    if (!rawTicket) return null;
    if (!sourceLink) return rawTicket; // no source to compare, show it
    try {
      const ticketHost = new URL(rawTicket).hostname.replace(/^www\./, '');
      const sourceHost = new URL(sourceLink).hostname.replace(/^www\./, '');
      return ticketHost === sourceHost ? null : rawTicket;
    } catch {
      return rawTicket; // malformed URL, show it anyway
    }
  })();
  const category   = event.genre       || event.vibe        || 'Live Music';
  const config     = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const timeStr    = formatTimeRange(event.start_time, event.end_time);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';

  // Theme colors — all dynamic based on darkMode
  const cardBg      = darkMode ? '#1A1A24' : '#FFFFFF';
  const borderColor = darkMode ? '#2A2A3A' : '#F3F4F6';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#7878A0' : '#6B7280';
  const venueColor  = darkMode ? '#4DB8B2' : '#2A8F8A';
  const textDesc    = darkMode ? '#AAAACC' : '#4B5563';
  const heartOff    = darkMode ? '#6A5A7A' : '#9B8A8E';
  const chevronCol  = darkMode ? '#5A5A7A' : '#9CA3AF';
  const expandedBg  = darkMode ? '#14141E' : '#F9FAFB';
  const flagIconCol = darkMode ? '#6A6A8A' : '#9CA3AF';
  const flagIconHov = '#E8722A';
  const coverPillBg = darkMode ? '#2A2A3A' : '#E5E7EB';
  const coverPillTx = darkMode ? '#CCCCDD' : '#4B5563';
  const sheetBg     = darkMode ? '#1A1A24' : '#FFFFFF';
  const sheetBorder = darkMode ? '#2A2A3A' : '#E5E7EB';
  const overlayBg   = 'rgba(0,0,0,0.5)';

  const handleFlag = async (flagType) => {
    setFlagSubmitting(true);
    try {
      await fetch('/api/flag-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, flag_type: flagType }),
      });
      onFlag?.(`Flag submitted — thanks for the heads up!`);
    } catch {
      onFlag?.('Something went wrong. Please try again.');
    }
    setFlagSubmitting(false);
    setFlagSheet(false);
  };

  return (
    <div style={{
      background: cardBg,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)',
      display: 'flex',
      border: `1px solid ${borderColor}`,
      opacity: isCanceled ? 0.6 : 1,
    }}>
      {/* Left accent bar */}
      <div style={{ width: '4px', flexShrink: 0, background: isCanceled ? '#DC2626' : config.color }} />

      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Compact row */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px', cursor: 'pointer' }}
        >
          {/* Colored time badge */}
          <div style={{
            background: isCanceled ? '#DC2626' : config.bg,
            color: isCanceled ? '#FFFFFF' : '#111111',
            fontSize: '14px', fontWeight: 700,
            padding: '5px 0', borderRadius: '6px',
            width: '62px', flexShrink: 0, textAlign: 'center',
            lineHeight: 1.3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isCanceled ? '✕' : (timeStr || '—')}
          </div>

          {/* Category emoji */}
          <span style={{ fontSize: '13px', flexShrink: 0 }}>{config.emoji}</span>

          {/* Event name + venue stacked */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{
              fontSize: '15px', fontWeight: 600, color: textPrimary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: isCanceled ? 'line-through' : 'none',
            }}>
              {name}
            </span>
            {venue && (
              <span style={{
                fontSize: '13px', fontWeight: 600, color: venueColor,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {venue}
              </span>
            )}
          </div>

          {/* Save heart */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite?.(event.id); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
              fontSize: '18px', color: isFavorited ? '#E8722A' : heartOff, flexShrink: 0,
              transition: 'transform 0.15s, color 0.15s',
              transform: isFavorited ? 'scale(1.2)' : 'scale(1)',
            }}
          >{isFavorited ? '♥' : '♡'}</button>

          {/* Chevron */}
          <span style={{
            fontSize: '9px', color: chevronCol, flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>▼</span>
        </div>

        {/* Expanded detail panel — always rendered, animated via max-height */}
        <div style={{
          maxHeight: expanded ? '600px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease-out',
        }}>
          <div style={{ padding: '0 12px 12px 12px', borderTop: expanded ? `1px solid ${borderColor}` : '1px solid transparent', background: expandedBg }}>

            {/* Hero image — 16:9 aspect ratio, no clipping */}
            {imageUrl && (
              <div style={{
                margin: '10px 0 8px', borderRadius: '8px', overflow: 'hidden',
                position: 'relative',
                aspectRatio: '16 / 9',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={expanded ? imageUrl : undefined}
                  alt={name}
                  loading="lazy"
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center center',
                    display: 'block',
                  }}
                  onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
                />

                {/* CANCELED overlay on image */}
                {isCanceled && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.6)',
                  }}>
                    <span style={{
                      background: '#DC2626', color: '#FFFFFF',
                      fontSize: '16px', fontWeight: 900, letterSpacing: '2px',
                      padding: '8px 20px', borderRadius: '8px',
                      textTransform: 'uppercase',
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      CANCELED
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* CANCELED badge (shown even without image) */}
            {isCanceled && !imageUrl && (
              <div style={{
                display: 'flex', justifyContent: 'center', margin: '10px 0 8px',
              }}>
                <span style={{
                  background: '#DC2626', color: '#FFFFFF',
                  fontSize: '13px', fontWeight: 900, letterSpacing: '1.5px',
                  padding: '6px 16px', borderRadius: '8px',
                  textTransform: 'uppercase',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  CANCELED
                </span>
              </div>
            )}

            {/* Cover Charge pill */}
            {event.cover_charge != null && !isCanceled && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: coverPillBg, color: coverPillTx,
                fontSize: '11px', fontWeight: 700,
                padding: '4px 10px', borderRadius: '999px',
                margin: '6px 0 4px',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {event.cover_charge === 0 ? '🎵 Free Admission' : `💵 $${event.cover_charge} Cover`}
              </div>
            )}

            {/* Description */}
            {desc && (
              <p style={{ fontSize: '13px', color: textDesc, lineHeight: 1.5, margin: '6px 0 8px' }}>
                {desc}
              </p>
            )}

            {/* Action row — single flex line: Follow | Venue | Tickets | Flag */}
            {!isCanceled && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* 1. Follow Artist (far left, primary action) */}
                {onFollowArtist && name && (
                  <button
                    onClick={e => { e.stopPropagation(); onFollowArtist(name); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '11px', fontWeight: 700,
                      padding: '7px 14px', borderRadius: '999px', cursor: 'pointer',
                      border: isArtistFollowed ? 'none' : '1.5px solid #E8722A',
                      background: isArtistFollowed ? (darkMode ? '#1E3A1E' : '#DCFCE7') : 'transparent',
                      color: isArtistFollowed ? (darkMode ? '#8DD888' : '#16A34A') : '#E8722A',
                      transition: 'all 0.2s ease',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {isArtistFollowed ? '✓ Following' : '+ Follow Artist'}
                  </button>
                )}

                {/* 2. Venue Website */}
                {sourceLink && (
                  <a
                    href={sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 700,
                      padding: '7px 14px', borderRadius: '8px',
                      background: darkMode ? '#2A2A3A' : '#E5E7EB',
                      color: darkMode ? '#AAAACC' : '#4B5563',
                      textDecoration: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    🌐 Venue Website
                  </a>
                )}

                {/* 3. Get Tickets — ONLY if ticket_link exists in DB, styled same as Venue Website */}
                {ticketLink && (
                  <a
                    href={ticketLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 700,
                      padding: '7px 14px', borderRadius: '8px',
                      background: darkMode ? '#2A2A3A' : '#E5E7EB',
                      color: darkMode ? '#AAAACC' : '#4B5563',
                      textDecoration: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    🎟 Tickets
                  </a>
                )}

                {/* 4. Flag icon (near right, muted, larger touch target) */}
                <button
                  onClick={e => { e.stopPropagation(); setFlagSheet(true); }}
                  style={{
                    marginLeft: 'auto',
                    marginRight: '2px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '24px', padding: '4px 6px',
                    color: '#A0A0A0',
                    transition: 'color 0.15s',
                    display: 'flex', alignItems: 'center', flexShrink: 0,
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#E8722A'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#A0A0A0'; }}
                  title="Report an issue"
                >
                  ⚑
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flag bottom-sheet modal */}
      {flagSheet && (
        <div
          onClick={e => { e.stopPropagation(); setFlagSheet(false); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 250, background: overlayBg,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '500px',
              background: sheetBg,
              borderRadius: '16px 16px 0 0',
              border: `1px solid ${sheetBorder}`,
              borderBottom: 'none',
              padding: '20px 16px 28px',
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

            <h3 style={{
              fontSize: '16px', fontWeight: 800, color: textPrimary,
              textAlign: 'center', marginBottom: '4px',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              What&apos;s up with this event?
            </h3>
            <p style={{
              fontSize: '12px', color: textMuted, textAlign: 'center', marginBottom: '16px',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Your report helps us keep info accurate.
            </p>

            {/* Flag options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => handleFlag('cancel')}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: `1px solid ${darkMode ? '#3A2020' : '#FEE2E2'}`,
                  background: darkMode ? '#1E1018' : '#FEF2F2',
                  color: darkMode ? '#FCA5A5' : '#DC2626',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'transform 0.1s',
                }}
              >
                <span style={{ fontSize: '20px' }}>🛑</span>
                Band Canceled
              </button>

              <button
                onClick={() => handleFlag('cover')}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: `1px solid ${darkMode ? '#2A2A1A' : '#FEF3C7'}`,
                  background: darkMode ? '#1E1A10' : '#FFFBEB',
                  color: darkMode ? '#FCD34D' : '#B45309',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'transform 0.1s',
                }}
              >
                <span style={{ fontSize: '20px' }}>💵</span>
                Cover Charge Added
              </button>

              {/* Close button */}
              <button
                onClick={() => setFlagSheet(false)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '12px',
                  border: `1px solid ${sheetBorder}`,
                  background: 'transparent',
                  color: textMuted,
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  marginTop: '4px',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
