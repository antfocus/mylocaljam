'use client';

import { useState } from 'react';
import { formatTimeRange } from '@/lib/utils';
import Badge from '@/components/ui/Badge';

// ── Brand palette ───────────────────────────────────────────────────────────
const BRAND_ORANGE = '#E8722A';
const MONO = "'Courier New', Courier, 'Lucida Console', monospace";

// Muted structural borders — paper-edge feel
const PERF_DARK  = 'rgba(255,255,255,0.12)';
const PERF_LIGHT = 'rgba(0,0,0,0.10)';

export default function SavedGigCard({
  event,
  isFavorited = false,
  onToggleFavorite,
  darkMode = true,
  onFollowArtist,
  isArtistFollowed,
  onFlag,
}) {
  const [expanded, setExpanded] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [flagSheet, setFlagSheet] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagOtherOpen, setFlagOtherOpen] = useState(false);
  const [flagOtherText, setFlagOtherText] = useState('');

  if (!event) return null;

  const eventTitle = (event.event_title || '').trim();
  const artistName = event.name || event.artist_name || '';
  const name       = eventTitle || artistName;
  const venue      = event.venue       || event.venue_name  || '';
  const desc       = event.description || event.artist_bio  || '';
  // Waterfall: event-specific image → artist image → venue photo
  const imageUrl   = event.event_image || event.artist_image || event.venue_photo || null;
  const genres     = event.artist_genres || [];
  const isTribute  = event.is_tribute || false;
  const rawSource  = event.source       || null;
  const sourceLink = rawSource && /^https?:\/\//i.test(rawSource) ? rawSource : null;
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';

  const timeStr = formatTimeRange(event.start_time, event.end_time);

  // Parse date for left stub
  const rawDate = event.date || event.event_date || '';
  let dateMonth = '', dateDay = '', dateDow = '';
  if (rawDate) {
    try {
      const d = new Date(rawDate.substring(0, 10) + 'T12:00:00');
      dateMonth = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      dateDay   = String(d.getDate());
      dateDow   = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    } catch { /* fall through */ }
  }
  // Full h:mm AM/PM for vertical stub (looks like a barcode when rotated)
  let stubTime = '';
  if (event.start_time) {
    const [h, m] = event.start_time.split(':').map(Number);
    if (!(h === 0 && m === 0)) {
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 || 12;
      stubTime = `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }
  }

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const paperBg     = darkMode ? '#1C1C28' : '#F8F9FA';
  const borderClr   = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const perfClr     = darkMode ? PERF_DARK : PERF_LIGHT;
  const textPrimary = darkMode ? '#F0F0F5' : '#1A1A2E';
  const textMuted   = darkMode ? '#8A8AA8' : '#6B7280';
  const labelOrange = BRAND_ORANGE;
  const expandedBg  = darkMode ? '#16161F' : '#F5F3EF';
  const removeClr   = darkMode ? '#6A6A8A' : '#9CA3AF';
  const shareClr    = darkMode ? '#6A6A8A' : '#9CA3AF';
  const sheetBg     = darkMode ? '#1C1C28' : '#FFFFFF';
  const sheetBorder = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const stubBg      = darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';

  // ── Remove with confirmation ──────────────────────────────────────────────
  const handleRemove = (e) => {
    e.stopPropagation();
    const confirmed = window.confirm('Remove this event from your saved list?');
    if (confirmed) {
      onToggleFavorite?.(event.id);
    }
  };

  const handleFlag = async (flagType) => {
    setFlagSubmitting(true);
    try {
      await fetch('/api/flag-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, flag_type: flagType }),
      });
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, issue_type: flagType, description: null }),
      });
      onFlag?.('Flag submitted — thanks for the heads up!');
    } catch {
      onFlag?.('Something went wrong. Please try again.');
    }
    setFlagSubmitting(false);
    setFlagSheet(false);
  };

  return (
    <div style={{
      background: paperBg,
      borderRadius: '6px',
      overflow: 'hidden',
      border: `1px solid ${borderClr}`,
      borderTop: `8px solid ${BRAND_ORANGE}`,
      boxShadow: darkMode
        ? '0 2px 12px rgba(0,0,0,0.35)'
        : '0 2px 8px rgba(0,0,0,0.06)',
      opacity: isCanceled ? 0.6 : 1,
    }}>
      {/* ── Main 3-column ticket row ──────────────────────────────────────── */}
      <div
        onClick={() => setExpanded(e => { if (e) setBioExpanded(false); return !e; })}
        style={{ display: 'flex', cursor: 'pointer', minHeight: '76px' }}
      >
        {/* LEFT STUB — Date & Time side-by-side */}
        <div style={{
          width: '88px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          borderRight: `2px dashed ${perfClr}`,
          background: stubBg,
          borderRadius: '6px 0 0 6px',
          overflow: 'hidden',
        }}>
          {/* Column A — Date stack */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 2px',
            gap: '1px',
          }}>
            {dateDow && (
              <span style={{
                fontFamily: MONO, fontSize: '9px', fontWeight: 800,
                color: labelOrange, letterSpacing: '1.5px', lineHeight: 1,
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
              }}>
                {dateDow}
              </span>
            )}
            {dateMonth && (
              <span style={{
                fontFamily: MONO, fontSize: '11px', fontWeight: 900,
                color: textPrimary, letterSpacing: '1px', lineHeight: 1.2,
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
              }}>
                {dateMonth}
              </span>
            )}
            {dateDay && (
              <span style={{
                fontFamily: MONO, fontSize: '24px', fontWeight: 900,
                color: textPrimary, lineHeight: 1,
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
              }}>
                {dateDay}
              </span>
            )}
            {isCanceled && (
              <span style={{
                fontFamily: MONO, fontSize: '8px', fontWeight: 900,
                color: '#DC2626', letterSpacing: '1px', marginTop: '2px',
              }}>
                CANCLD
              </span>
            )}
          </div>

          {/* Column B — Vertical time */}
          {stubTime && (
            <div style={{
              width: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderLeft: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
            }}>
              <span style={{
                fontFamily: MONO,
                fontSize: '13px',
                fontWeight: 900,
                color: labelOrange,
                letterSpacing: '1px',
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                whiteSpace: 'nowrap',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
              }}>
                {stubTime}
              </span>
            </div>
          )}
        </div>

        {/* MIDDLE BODY — Artist & Venue */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '10px 12px', gap: '3px',
        }}>
          {/* ARTIST label */}
          <span style={{
            fontFamily: MONO, fontSize: '9px', fontWeight: 700,
            color: labelOrange, letterSpacing: '1.5px',
            textTransform: 'uppercase', lineHeight: 1,
          }}>
            {eventTitle ? 'EVENT' : 'ARTIST'}
          </span>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '16px', fontWeight: 700, color: textPrimary,
            lineHeight: 1.2,
            textDecoration: isCanceled ? 'line-through' : 'none',
            ...(expanded
              ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal' }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            ),
          }}>
            {name}
          </span>
          {eventTitle && artistName && eventTitle !== artistName && (
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12px', fontWeight: 500, color: textMuted,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}>
              {artistName}
            </span>
          )}

          {/* VENUE label + name */}
          {venue && (
            <>
              <span style={{
                fontFamily: MONO, fontSize: '9px', fontWeight: 700,
                color: labelOrange, letterSpacing: '1.5px',
                textTransform: 'uppercase', lineHeight: 1, marginTop: '2px',
              }}>
                VENUE
              </span>
              <span style={{
                fontFamily: MONO, fontSize: '12px', fontWeight: 600,
                color: textMuted, textTransform: 'uppercase',
                letterSpacing: '0.5px', lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {venue}
              </span>
            </>
          )}
        </div>

        {/* RIGHT STUB — Actions */}
        <div style={{
          width: '52px', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '8px 4px',
          borderLeft: `2px dashed ${perfClr}`,
          gap: '10px',
        }}>
          {/* Remove button — muted X with confirmation */}
          <button
            onClick={handleRemove}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            title="Remove from saved"
          >
            {/* Material: remove_circle_outline */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill={removeClr} />
            </svg>
          </button>

          {/* Share */}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const shareText = `${name} at ${venue}`;
              const shareUrl = event.id
                ? `https://mylocaljam.com/event/${event.id}`
                : (event.ticket_link || event.source || window.location.href);
              const copyFallback = async () => {
                try {
                  await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
                } catch {}
              };
              if (navigator.share) {
                try {
                  await navigator.share({ title: shareText, text: shareText, url: shareUrl });
                } catch (err) {
                  if (err.name !== 'AbortError') await copyFallback();
                }
              } else {
                await copyFallback();
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Share"
          >
            {/* Material: ios_share */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill={shareClr} />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ─────────────────────────────────────────── */}
      <div style={{
        maxHeight: expanded ? '600px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 0.25s ease-out',
      }}>
        <div style={{
          padding: '0 14px 14px 14px',
          borderTop: expanded ? `1px dashed ${perfClr}` : '1px solid transparent',
          background: expandedBg,
        }}>
          {/* Hero image */}
          {imageUrl && (
            <div style={{
              margin: '10px 0 8px', borderRadius: '4px', overflow: 'hidden',
              position: 'relative', aspectRatio: '16 / 9',
              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
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
              {isCanceled && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.6)',
                }}>
                  <span style={{
                    fontFamily: MONO,
                    background: '#DC2626', color: '#FFFFFF',
                    fontSize: '14px', fontWeight: 900, letterSpacing: '3px',
                    padding: '6px 18px', borderRadius: '2px',
                    textTransform: 'uppercase',
                  }}>
                    CANCELED
                  </span>
                </div>
              )}
            </div>
          )}

          {/* CANCELED badge (no image) */}
          {isCanceled && !imageUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
              <Badge label="CANCELED" size="md" bg="#DC2626" color="#FFFFFF"
                style={{ fontFamily: MONO, fontWeight: 900, letterSpacing: '2px', padding: '5px 14px', borderRadius: '2px', fontSize: '12px' }} />
            </div>
          )}

          {/* Cover Charge */}
          {event.cover != null && event.cover !== 'TBA' && !isCanceled && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontFamily: MONO, fontSize: '10px', fontWeight: 700,
              color: labelOrange, letterSpacing: '1px',
              textTransform: 'uppercase', padding: '4px 0', margin: '6px 0 4px',
            }}>
              {event.cover === '0' || event.cover?.toLowerCase() === 'free' ? 'FREE ADMISSION' : `${event.cover?.startsWith?.('$') ? '' : '$'}${event.cover} COVER`}
            </div>
          )}

          {/* Bio / Description */}
          {desc && (
            <div style={{ margin: '6px 0 8px' }}>
              <p style={{
                fontSize: '12px', color: textMuted, lineHeight: 1.5, margin: 0,
                fontFamily: "'DM Sans', sans-serif",
                ...(bioExpanded ? {} : {
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }),
              }}>
                {desc}
              </p>
              {desc.length > 120 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBioExpanded(prev => !prev); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0',
                    fontSize: '11px', fontWeight: 700, color: BRAND_ORANGE,
                    fontFamily: MONO, letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}
                >
                  {bioExpanded ? '[ SHOW LESS ]' : '[ READ MORE ]'}
                </button>
              )}
            </div>
          )}

          {/* Genre chips + Tribute badge */}
          {(genres.length > 0 || isTribute) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', margin: '4px 0 6px' }}>
              {isTribute && (
                <Badge label="TRIBUTE" size="xs" color={BRAND_ORANGE}
                  bg={darkMode ? 'rgba(232,114,42,0.08)' : 'rgba(232,114,42,0.06)'}
                  style={{
                    fontFamily: MONO, fontSize: '9px', fontWeight: 700, letterSpacing: '1px',
                    borderRadius: '2px', padding: '3px 8px',
                    border: `1px solid ${darkMode ? 'rgba(232,114,42,0.3)' : 'rgba(232,114,42,0.25)'}`,
                  }} />
              )}
              {genres.map(g => (
                <Badge key={g} label={g} size="xs" color={textMuted}
                  bg={darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}
                  style={{
                    fontFamily: MONO, fontSize: '9px', fontWeight: 600, letterSpacing: '0.5px',
                    borderRadius: '2px', padding: '3px 8px',
                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  }} />
              ))}
            </div>
          )}

          {/* Action row */}
          {!isCanceled && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Follow Artist */}
              {onFollowArtist && name && (
                <button
                  onClick={e => { e.stopPropagation(); onFollowArtist(name); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    fontFamily: MONO, fontSize: '10px', fontWeight: 700,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    padding: '7px 14px', borderRadius: '3px', cursor: 'pointer',
                    border: isArtistFollowed
                      ? `1.5px solid ${BRAND_ORANGE}`
                      : `1.5px solid ${darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                    background: isArtistFollowed
                      ? (darkMode ? 'rgba(232,114,42,0.12)' : 'rgba(232,114,42,0.08)')
                      : 'transparent',
                    color: isArtistFollowed ? BRAND_ORANGE : (darkMode ? '#C0C0D0' : '#6B7280'),
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isArtistFollowed ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill={BRAND_ORANGE} />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" />
                    </svg>
                  )}
                  {isArtistFollowed ? 'FOLLOWING' : 'FOLLOW'}
                </button>
              )}

              {/* Venue Website */}
              {sourceLink && (
                <a
                  href={sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    fontFamily: MONO, fontSize: '10px', fontWeight: 700,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    padding: '7px 14px', borderRadius: '3px',
                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                    background: 'transparent',
                    color: textMuted, textDecoration: 'none', cursor: 'pointer',
                  }}
                >
                  VENUE SITE
                </a>
              )}

              {/* Flag */}
              <button
                onClick={e => { e.stopPropagation(); setFlagSheet(true); }}
                style={{
                  marginLeft: 'auto', marginRight: '2px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: MONO, fontSize: '18px', padding: '4px 6px',
                  color: removeClr, transition: 'color 0.15s',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = BRAND_ORANGE; }}
                onMouseLeave={e => { e.currentTarget.style.color = removeClr; }}
                title="Report an issue"
              >
                &#9873;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Flag bottom-sheet modal ───────────────────────────────────────── */}
      {flagSheet && (
        <div
          onClick={e => { e.stopPropagation(); setFlagSheet(false); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 250, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '500px',
              background: sheetBg,
              borderRadius: '6px 6px 0 0',
              border: `1px solid ${sheetBorder}`,
              borderBottom: 'none',
              padding: '20px 16px 28px',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
              animation: 'slideUp 0.25s ease-out',
            }}
          >
            <div style={{
              width: '40px', height: '4px', borderRadius: '2px',
              background: darkMode ? 'rgba(255,255,255,0.15)' : '#D1D5DB',
              margin: '0 auto 16px',
            }} />
            <h3 style={{
              fontFamily: MONO, fontSize: '13px', fontWeight: 900,
              color: textPrimary, textAlign: 'center', marginBottom: '4px',
              letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              REPORT AN ISSUE
            </h3>
            <p style={{
              fontFamily: MONO, fontSize: '10px', color: textMuted,
              textAlign: 'center', marginBottom: '16px',
              letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              YOUR REPORT HELPS KEEP INFO ACCURATE
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => handleFlag('cancel')}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '4px',
                  border: `1px solid ${darkMode ? '#5A2020' : '#FEE2E2'}`,
                  background: darkMode ? '#2A1018' : '#FEF2F2',
                  color: darkMode ? '#FCA5A5' : '#DC2626',
                  fontFamily: MONO, fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase',
                }}
              >
                BAND CANCELED
              </button>
              <button
                onClick={() => handleFlag('cover')}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '4px',
                  border: `1px solid ${darkMode ? '#3A2A1A' : '#FEF3C7'}`,
                  background: darkMode ? '#2A1A10' : '#FFFBEB',
                  color: darkMode ? '#FCD34D' : '#B45309',
                  fontFamily: MONO, fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase',
                }}
              >
                COVER CHARGE ADDED
              </button>
              <button
                onClick={() => setFlagOtherOpen(prev => !prev)}
                disabled={flagSubmitting}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '14px 16px', borderRadius: '4px',
                  border: `1px solid ${darkMode ? '#1A2A2A' : '#E0F2FE'}`,
                  background: darkMode ? '#101A1E' : '#F0F9FF',
                  color: darkMode ? '#7DD3FC' : '#0369A1',
                  fontFamily: MONO, fontSize: '12px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase',
                }}
              >
                OTHER / INCORRECT INFO
              </button>
              {flagOtherOpen && (
                <div style={{
                  padding: '12px', borderRadius: '4px',
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
                      width: '100%', padding: '10px 12px', borderRadius: '4px',
                      background: darkMode ? '#1C1C28' : '#FFFFFF',
                      border: `1px solid ${sheetBorder}`,
                      color: textPrimary, fontSize: '12px',
                      fontFamily: MONO, outline: 'none', resize: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '10px', color: textMuted, fontFamily: MONO }}>
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
                        padding: '8px 16px', borderRadius: '4px',
                        background: flagOtherText.trim() ? BRAND_ORANGE : (darkMode ? '#2A2A3A' : '#D1D5DB'),
                        color: flagOtherText.trim() ? '#1C1917' : textMuted,
                        fontSize: '11px', fontWeight: 700, border: 'none',
                        cursor: flagOtherText.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: MONO, letterSpacing: '0.5px', textTransform: 'uppercase',
                      }}
                    >
                      SUBMIT REPORT
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => { setFlagSheet(false); setFlagOtherOpen(false); setFlagOtherText(''); }}
                style={{
                  width: '100%', padding: '12px', borderRadius: '4px',
                  border: `1px solid ${sheetBorder}`,
                  background: 'transparent', color: textMuted,
                  fontFamily: MONO, fontSize: '11px', fontWeight: 600,
                  cursor: 'pointer', letterSpacing: '1px', textTransform: 'uppercase',
                  marginTop: '4px',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
