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
  const [bioExpanded, setBioExpanded] = useState(false);
  const [flagSheet, setFlagSheet] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagOtherOpen, setFlagOtherOpen] = useState(false);
  const [flagOtherText, setFlagOtherText] = useState('');

  if (!event) return null;

  const name       = event.name        || event.event_title || event.artist_name || '';
  const venue      = event.venue       || event.venue_name  || '';
  const desc       = event.description || event.artist_bio  || '';
  const imageUrl   = event.artist_image || event.image_url || event.venue_photo || null;
  const genres     = event.artist_genres || [];
  const isTribute  = event.is_tribute || false;
  const rawSource  = event.source       || null;
  const sourceLink = rawSource && /^https?:\/\//i.test(rawSource) ? rawSource : null;
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
      // Also increment the flag counter on the event
      await fetch('/api/flag-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, flag_type: flagType }),
      });
      // Create a report row so it appears in the admin User Flags queue
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, issue_type: flagType, description: null }),
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
      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Compact row */}
        <div
          onClick={() => { setExpanded(e => { if (e) setBioExpanded(false); return !e; }); }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px 11px 0', cursor: 'pointer' }}
        >
          {/* Colored time block — ticket stub with perforation */}
          <div style={{
            background: isCanceled ? '#DC2626' : config.bg,
            color: isCanceled ? '#FFFFFF' : '#1C1917',
            fontWeight: 900,
            width: '48px', height: '48px',
            borderRadius: '12px 0 0 12px', flexShrink: 0,
            borderRight: '2px dashed rgba(255,255,255,0.4)',
            display: 'flex',
            flexDirection: (timeStr && timeStr.includes(':')) ? 'column' : 'row',
            alignItems: 'center', justifyContent: 'center',
            gap: (timeStr && timeStr.includes(':')) ? '1px' : '0px',
            fontFamily: "'Arial Black', 'Anton', 'Archivo Black', sans-serif",
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.5px',
          }}>
            {isCanceled ? <span style={{ fontSize: '18px', lineHeight: 1 }}>✕</span> : (() => {
              const raw = timeStr || '—';
              if (raw === '—') return <span style={{ fontSize: '18px', lineHeight: 1 }}>—</span>;
              if (!raw.includes(':')) return <span style={{ fontSize: '18px', lineHeight: 1 }}>{raw}</span>;
              const period = raw.toLowerCase().includes('a') ? 'AM' : 'PM';
              const nums = raw.replace(/[apAP][mM]?$/, '');
              return (<>
                <span style={{ fontSize: '15px', lineHeight: 1 }}>{nums}</span>
                <span style={{ fontSize: '9px', lineHeight: 1, letterSpacing: '0.5px', opacity: 0.85 }}>{period}</span>
              </>);
            })()}
          </div>

          {/* Event name + venue stacked */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{
              fontSize: '17px', fontWeight: 600, color: textPrimary,
              textDecoration: isCanceled ? 'line-through' : 'none',
              ...(expanded
                ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal' }
                : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              ),
            }}>
              {name}
            </span>
            {venue && (
              <span style={{
                fontSize: '13px', fontWeight: 500, color: darkMode ? '#A0A0B8' : '#9CA3AF',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {venue}
              </span>
            )}
          </div>

          {/* Save button — hero CTA: orange ⊕ → filled orange circle with black check */}
          <button
            onClick={e => {
              e.stopPropagation();
              // Haptic feedback on mobile
              try { navigator?.vibrate?.(10); } catch {}
              onToggleFavorite?.(event.id);
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              flexShrink: 0,
              transition: 'transform 0.15s ease',
              transform: isFavorited ? 'scale(1.15)' : 'scale(1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isFavorited ? (
              /* Material Icon: check_circle — filled orange circle with black checkmark */
              <span className="material-icons" style={{ fontSize: '26px', color: '#E8722A' }}>check_circle</span>
            ) : (
              /* Material Icon: add_circle_outline — brand orange */
              <span className="material-icons" style={{ fontSize: '26px', color: '#E8722A' }}>add_circle_outline</span>
            )}
          </button>

          {/* Share button — ghost secondary: muted slate, hover brightens */}
          <button
            className="share-btn"
            onClick={e => {
              e.stopPropagation();
              const shareText = `${name} at ${venue}`;
              const shareUrl = event.ticket_url || event.source || window.location.href;
              if (navigator.share) {
                navigator.share({ title: shareText, url: shareUrl }).catch(() => {});
              } else {
                navigator.clipboard?.writeText(`${shareText} — ${shareUrl}`);
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: darkMode ? '#5A5A7A' : '#94A3B8',
              transition: 'color 0.2s ease',
            }}
          >
            {/* Material: ios_share */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="currentColor" />
            </svg>
          </button>
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

            {/* Bio / Description — 3-line clamp with Read More */}
            {desc && (
              <div style={{ margin: '6px 0 8px' }}>
                <p style={{
                  fontSize: '13px', color: textDesc, lineHeight: 1.5, margin: 0,
                  ...(bioExpanded ? {} : {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }),
                }}>
                  {desc}
                </p>
                {desc.length > 120 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setBioExpanded(prev => !prev); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0',
                      fontSize: '12px', fontWeight: 600, color: '#E8722A',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {bioExpanded ? 'Show Less' : 'Read More'}
                  </button>
                )}
              </div>
            )}

            {/* Genre chips + Tribute badge */}
            {(genres.length > 0 || isTribute) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', margin: '4px 0 6px' }}>
                {isTribute && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    fontSize: '10px', fontWeight: 700, padding: '3px 8px',
                    borderRadius: '999px', background: darkMode ? '#2A1A2A' : '#FDF2F8',
                    color: darkMode ? '#F0ABFC' : '#A21CAF',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    🎭 Tribute
                  </span>
                )}
                {genres.map(g => (
                  <span key={g} style={{
                    fontSize: '10px', fontWeight: 600, padding: '3px 8px',
                    borderRadius: '999px',
                    background: darkMode ? '#1E1E2E' : '#F3F4F6',
                    color: darkMode ? '#9898B8' : '#6B7280',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Action row — single flex line: Follow | Venue | Tickets | Flag */}
            {!isCanceled && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* 1. Follow Artist (far left, primary action) — Spotify paradigm */}
                {onFollowArtist && name && (
                  <button
                    onClick={e => { e.stopPropagation(); onFollowArtist(name); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 700,
                      padding: '7px 14px', borderRadius: '999px', cursor: 'pointer',
                      border: isArtistFollowed ? '1.5px solid #E8722A' : `1.5px solid ${darkMode ? '#5A5A7A' : '#9CA3AF'}`,
                      background: isArtistFollowed ? (darkMode ? 'rgba(232,114,42,0.12)' : 'rgba(232,114,42,0.08)') : 'transparent',
                      color: isArtistFollowed ? '#E8722A' : (darkMode ? '#C0C0D0' : '#6B7280'),
                      transition: 'all 0.2s ease',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {isArtistFollowed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#E8722A" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" />
                      </svg>
                    )}
                    {isArtistFollowed ? 'Following' : 'Follow Artist'}
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

                {/* 3. Flag icon (far right, muted, larger touch target) */}
                <button
                  className="flag-btn"
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

              {/* Other / Incorrect Info */}
              <button
                onClick={() => setFlagOtherOpen(prev => !prev)}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '12px',
                  border: `1px solid ${darkMode ? '#1A2A2A' : '#E0F2FE'}`,
                  background: darkMode ? '#101A1E' : '#F0F9FF',
                  color: darkMode ? '#7DD3FC' : '#0369A1',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'transform 0.1s',
                }}
              >
                <span style={{ fontSize: '20px' }}>💬</span>
                Other / Incorrect Info
              </button>

              {/* Expandable text area for Other reports */}
              {flagOtherOpen && (
                <div style={{
                  padding: '12px', borderRadius: '12px',
                  background: darkMode ? '#14141E' : '#F9FAFB',
                  border: `1px solid ${sheetBorder}`,
                }}>
                  <textarea
                    value={flagOtherText}
                    onChange={e => { if (e.target.value.length <= 200) setFlagOtherText(e.target.value); }}
                    placeholder="What's wrong? (e.g. wrong time, wrong band name, venue changed...)"
                    maxLength={200}
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: '8px',
                      background: darkMode ? '#1A1A24' : '#FFFFFF',
                      border: `1px solid ${sheetBorder}`,
                      color: textPrimary, fontSize: '13px',
                      fontFamily: "'DM Sans', sans-serif",
                      outline: 'none', resize: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                      {flagOtherText.length}/200
                    </span>
                    <button
                      disabled={flagSubmitting || !flagOtherText.trim()}
                      onClick={async () => {
                        setFlagSubmitting(true);
                        try {
                          await fetch('/api/reports', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              event_id: event.id,
                              issue_type: 'other',
                              description: flagOtherText.trim(),
                            }),
                          });
                          onFlag?.('Report submitted — thanks for the heads up!');
                        } catch {
                          onFlag?.('Something went wrong. Please try again.');
                        }
                        setFlagSubmitting(false);
                        setFlagSheet(false);
                        setFlagOtherOpen(false);
                        setFlagOtherText('');
                      }}
                      style={{
                        padding: '8px 18px', borderRadius: '8px',
                        background: flagOtherText.trim() ? '#E8722A' : (darkMode ? '#2A2A3A' : '#D1D5DB'),
                        color: flagOtherText.trim() ? '#fff' : textMuted,
                        fontSize: '13px', fontWeight: 700, border: 'none',
                        cursor: flagOtherText.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Submit Report
                    </button>
                  </div>
                </div>
              )}

              {/* Close button */}
              <button
                onClick={() => { setFlagSheet(false); setFlagOtherOpen(false); setFlagOtherText(''); }}
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

      {/* Slide-up animation + share hover (pointer devices only) */}
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (hover: hover) {
          .share-btn:hover {
            color: ${darkMode ? '#F0F0F5' : '#1F2937'} !important;
          }
          .flag-btn:hover {
            color: #E8722A !important;
          }
        }
      `}</style>
    </div>
  );
}
