'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeRange } from '@/lib/utils';
import { posthog } from '@/lib/posthog';
import Badge from '@/components/ui/Badge';
import QuickActions from '@/components/QuickActions';

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

const ARTIST_SUBTITLE_CATEGORIES = ['Live Music', 'Comedy'];

function EventCardV2({ event, isFavorited = false, onToggleFavorite, darkMode = true, onFollowArtist, isArtistFollowed, onFlag, autoExpand = false }) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [flagSheet, setFlagSheet] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagOtherOpen, setFlagOtherOpen] = useState(false);
  const [flagOtherText, setFlagOtherText] = useState('');
  const [showFollowPopover, setShowFollowPopover] = useState(false);
  const [popoverFading, setPopoverFading] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });
  const bookmarkRef = useRef(null);
  const descRef = useRef(null);
  const [isTextTruncated, setIsTextTruncated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [cardRect, setCardRect] = useState(null);
  const cardRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const pointerStart = useRef({ x: 0, y: 0 });

  useEffect(() => { setMounted(true); }, []);

  // Position popover using fixed coordinates from bookmark button
  useEffect(() => {
    if (showFollowPopover && bookmarkRef.current) {
      const rect = bookmarkRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showFollowPopover]);

  // Auto-dismiss popover after 5 seconds
  useEffect(() => {
    if (!showFollowPopover) return;
    const timer = setTimeout(() => {
      setPopoverFading(true);
      setTimeout(() => { setShowFollowPopover(false); setPopoverFading(false); }, 300);
    }, 8000);
    return () => clearTimeout(timer);
  }, [showFollowPopover]);

  const dismissPopover = useCallback(() => {
    setPopoverFading(true);
    setTimeout(() => { setShowFollowPopover(false); setPopoverFading(false); }, 300);
  }, []);

  const handlePopoverFollow = useCallback(() => {
    if (!event?.artist_name) return;
    try { navigator?.vibrate?.(10); } catch {}
    onFollowArtist?.(event.artist_name);
    dismissPopover();
  }, [event?.artist_name, onFollowArtist, dismissPopover]);

  // description is pre-resolved via Hierarchy of Truth in page.js
  const desc = event?.description || '';

  // Check if description text is actually truncated
  useEffect(() => {
    if (descRef.current && !bioExpanded) {
      setIsTextTruncated(descRef.current.scrollHeight > descRef.current.clientHeight);
    }
  }, [expanded, bioExpanded, desc]);

  if (!event) return null;

  const eventTitle = (event.event_title || '').trim();
  const artistName = event.name || event.artist_name || '';
  const name       = eventTitle || artistName;
  const venue      = event.venue       || event.venue_name  || '';
  // Treat "" and "None" as null so the waterfall keeps falling
  const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;
  // Waterfall: event-specific image → artist image → venue photo
  const imageUrl   = cleanImg(event.event_image) || cleanImg(event.artist_image) || cleanImg(event.venue_photo) || null;
  const genres     = event.artist_genres || [];
  const isTribute  = event.is_tribute || false;
  const rawSource  = event.source       || null;
  const sourceLink = rawSource && /^https?:\/\//i.test(rawSource) ? rawSource : null;
  // Smart waterfall: merged arrays (artist-enriched) → legacy event columns → fallback
  const category   = event.artist_vibes?.[0] || event.artist_genres?.[0] || event.genre || event.vibe || 'Live Music';
  const config     = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const timeStr    = formatTimeRange(event.start_time);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';
  // Hide the artist subtitle when it would just echo the event title.
  // Case-insensitive + trimmed so "Jane Doe" / "jane doe " collapses cleanly.
  const _titleKey  = eventTitle.trim().toLowerCase();
  const _artistKey = (artistName || '').trim().toLowerCase();
  const showArtistSubtitle = ARTIST_SUBTITLE_CATEGORIES.includes(event.category)
    && eventTitle
    && artistName
    && _titleKey !== _artistKey;

  // Theme colors — all dynamic based on darkMode
  const cardBg      = darkMode ? '#1A1A24' : '#FFFFFF';
  const borderColor = darkMode ? '#2A2A3A' : '#F3F4F6';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#7878A0' : '#6B7280';
  const venueColor  = darkMode ? '#4DB8B2' : '#2A8F8A';
  const textDesc    = darkMode ? '#AAAACC' : '#4B5563';
  const heartOff    = darkMode ? '#6A5A7A' : '#9B8A8E';
  const expandedBg  = darkMode ? '#14141E' : '#F9FAFB';
  const flagIconCol = darkMode ? '#6A6A8A' : '#9CA3AF';
  const flagIconHov = '#E8722A';
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
    <div ref={cardRef} id={event?.id ? `event-${event.id}` : undefined} style={{
      background: cardBg,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: shortcutOpen
        ? (darkMode ? '0 2px 16px rgba(232,114,42,0.25)' : '0 2px 12px rgba(232,114,42,0.2)')
        : (darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)'),
      display: 'flex',
      border: shortcutOpen ? '1px solid #E8722A' : `1px solid ${borderColor}`,
      opacity: isCanceled ? 0.6 : 1,
      transform: shortcutOpen ? 'scale(0.98)' : 'scale(1)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      /* Silence native long-press: text selection, iOS callout, tap highlight */
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Compact row — long-press opens shortcut menu, tap toggles expand */}
        <div
          onClick={() => {
            // If long-press just fired, swallow the click
            if (longPressFired.current) { longPressFired.current = false; return; }
            setExpanded(e => { if (e) setBioExpanded(false); return !e; });
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onPointerDown={(e) => {
            setPressed(true);
            longPressFired.current = false;
            pointerStart.current = { x: e.clientX, y: e.clientY };
            longPressTimer.current = setTimeout(() => {
              longPressFired.current = true;
              setPressed(false);
              try { navigator?.vibrate?.(20); } catch {}
              // Capture the card's bounding rect for anchoring the toolbelt
              if (cardRef.current) {
                const r = cardRef.current.getBoundingClientRect();
                setCardRect({ top: r.top, left: r.left, width: r.width, height: r.height });
              }
              setShortcutOpen(true);
            }, 500);
          }}
          onPointerMove={(e) => {
            // Cancel long-press if finger moves > 10px (scrolling)
            if (longPressTimer.current) {
              const dx = e.clientX - pointerStart.current.x;
              const dy = e.clientY - pointerStart.current.y;
              if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
              }
            }
          }}
          onPointerUp={() => {
            setPressed(false);
            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
          }}
          onPointerLeave={() => {
            setPressed(false);
            if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px 11px 0', cursor: 'pointer',
            background: pressed ? (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent',
            transition: 'background 0.15s ease',
          }}
        >
          {/* Colored time block — ticket stub with perforation */}
          <div style={{
            background: isCanceled ? '#DC2626' : config.bg,
            color: isCanceled ? '#FFFFFF' : '#1C1917',
            fontWeight: 700,
            width: '50px', minHeight: '48px',
            borderRadius: '12px 0 0 12px', flexShrink: 0,
            borderRight: '2px dashed rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '4px 0',
            fontFamily: "'DM Sans', sans-serif",
            boxSizing: 'border-box',
          }}>
            {isCanceled ? <span style={{ fontSize: '20px', lineHeight: 1 }}>✕</span> : (() => {
              const raw = timeStr || '—';
              if (raw === '—') return <span style={{ fontSize: '20px', lineHeight: 1, fontWeight: 700 }}>—</span>;
              // Extract period (a/p) → AM/PM
              const periodMatch = raw.match(/([apAP][mM]?)$/);
              const period = periodMatch ? (periodMatch[1].toLowerCase().startsWith('a') ? 'AM' : 'PM') : '';
              const nums = raw.replace(/[apAP][mM]?$/, '');
              // Smart format: strip :00 for top-of-hour, keep minutes otherwise
              const smartTime = nums.replace(/:00$/, '');
              return (
                <>
                  <span style={{ fontSize: smartTime.length > 4 ? '14px' : smartTime.length > 2 ? '18px' : '22px', lineHeight: 1, fontWeight: 900 }}>{smartTime}</span>
                  {period && <span style={{ fontSize: '9px', lineHeight: 1, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginTop: '2px', opacity: 0.75 }}>{period}</span>}
                </>
              );
            })()}
          </div>

          {/* Event name + venue stacked */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{
              fontSize: '17px', fontWeight: 600, color: textPrimary,
              textDecoration: isCanceled ? 'line-through' : 'none',
              ...(expanded
                ? { whiteSpace: 'normal', overflow: 'visible' }
                : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal' }
              ),
            }}>
              {name}
            </span>
            {showArtistSubtitle && (
              <span style={{
                fontSize: '13px', fontWeight: 500, color: darkMode ? '#C0C0D0' : '#6B7280',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {artistName}
              </span>
            )}
            {venue && (
              <span style={{
                fontSize: '13px', fontWeight: 500, color: darkMode ? '#A0A0B8' : '#6B7280',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {venue}
              </span>
            )}
          </div>

          {/* Ticket stub save button */}
          <div ref={bookmarkRef} style={{ flexShrink: 0 }}>
            <button
              className="save-btn"
              onClick={e => {
                e.stopPropagation();
                try { navigator?.vibrate?.(10); } catch {}
                const wasSaved = isFavorited;
                onToggleFavorite?.(event.id);
                // Show follow popover when saving (not unsaving)
                if (!wasSaved && event?.artist_name) {
                  setShowFollowPopover(true);
                  setPopoverFading(false);
                }
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '44px', height: '44px',
                padding: 0,
                transition: 'transform 0.2s ease',
              }}
            >
              <svg
                className={isFavorited ? 'save-pop' : ''}
                width="26" height="26" viewBox="0 0 24 24"
                style={{ transition: 'all 0.2s ease' }}
              >
                {isFavorited ? (
                  /* Filled ticket stub — tilted, solid orange, white perforation */
                  <g transform="rotate(-18 12 12)">
                    <path
                      d="M3.5 7 L20.5 7 A1.5 1.5 0 0 1 22 8.5 L22 10 A2 2 0 0 0 22 14 L22 15.5 A1.5 1.5 0 0 1 20.5 17 L3.5 17 A1.5 1.5 0 0 1 2 15.5 L2 14 A2 2 0 0 0 2 10 L2 8.5 A1.5 1.5 0 0 1 3.5 7 Z"
                      fill="#E8722A"
                    />
                    <line
                      x1="8" y1="8.5" x2="8" y2="15.5"
                      stroke="rgba(255,255,255,0.85)" strokeWidth="1.25"
                      strokeLinecap="round" strokeDasharray="1.25 1.25"
                    />
                  </g>
                ) : (
                  /* Outlined ticket stub — ghost, tilted, inward end-notches, dashed perforation */
                  <g transform="rotate(-18 12 12)"
                     fill="none"
                     stroke={darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'}
                     strokeWidth="1.75"
                     strokeLinecap="round"
                     strokeLinejoin="round">
                    <path d="M3.5 7 L20.5 7 A1.5 1.5 0 0 1 22 8.5 L22 10 A2 2 0 0 0 22 14 L22 15.5 A1.5 1.5 0 0 1 20.5 17 L3.5 17 A1.5 1.5 0 0 1 2 15.5 L2 14 A2 2 0 0 0 2 10 L2 8.5 A1.5 1.5 0 0 1 3.5 7 Z"/>
                    <line x1="8" y1="8.5" x2="8" y2="15.5" strokeDasharray="1.25 1.25"/>
                  </g>
                )}
              </svg>
            </button>

          </div>
        </div>

        {/* Expanded detail panel — always rendered, animated via max-height */}
        <div style={{
          maxHeight: expanded ? '1200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease-out',
        }}>
          <div onClick={() => { if (desc) setBioExpanded(prev => !prev); }} style={{ padding: '0 12px 12px 12px', borderTop: expanded ? `1px solid ${borderColor}` : '1px solid transparent', background: expandedBg, cursor: desc ? 'pointer' : 'default' }}>

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
                    objectFit: 'cover', objectPosition: 'center 15%',
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
              <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
                <Badge label="CANCELED" size="md" bg="#DC2626" color="#FFFFFF"
                  style={{ fontWeight: 900, letterSpacing: '1.5px', padding: '6px 16px', borderRadius: '8px', fontSize: '13px' }} />
              </div>
            )}

            {/* Cover Charge pill — hidden until feature is set up */}

            {/* Bio / Description — 3-line clamp with Read More */}
            {desc && (
              <div style={{ margin: '6px 0 8px' }}>
                <p ref={descRef} style={{
                  fontSize: '15px', color: textDesc, lineHeight: 1.65, margin: 0,
                  ...(bioExpanded ? {} : {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }),
                }}>
                  {desc}
                </p>
                {(isTextTruncated || bioExpanded) && (
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

            {/* Genre chips + Tribute badge — temporarily hidden pending backend data cleanup */}
            {/* {(genres.length > 0 || isTribute) && (
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
            )} */}

            {/* Action row — single flex line: [Follow | Venue | Share] ... [Edit icon] */}
            {!isCanceled && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                {/* Primary group — left-aligned pill buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* 1. Follow Artist */}
                  {onFollowArtist && name && (
                    <button
                      onClick={e => { e.stopPropagation(); onFollowArtist(name); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        fontSize: '11px', fontWeight: 700,
                        padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
                        border: 'none',
                        background: isArtistFollowed
                          ? (darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.1)')
                          : (darkMode ? '#3A3A4A' : '#374151'),
                        color: isArtistFollowed ? '#E8722A' : (darkMode ? '#F0F0F5' : '#FFFFFF'),
                        transition: 'all 0.2s ease',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {isArtistFollowed ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#E8722A" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M12 5v14M5 12h14" />
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
                      onClick={e => {
                        e.stopPropagation();
                        posthog.capture?.('venue_link_clicked', {
                          venue_name: venue,
                          artist_name: artistName,
                          event_id: event.id || '',
                          source_url: sourceLink,
                        });
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        fontSize: '11px', fontWeight: 700,
                        padding: '8px 14px', borderRadius: '8px',
                        background: darkMode ? '#2A2A3A' : '#E5E7EB',
                        color: darkMode ? '#AAAACC' : '#4B5563',
                        textDecoration: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      🌐 Venue
                    </a>
                  )}

                  {/* 3. Share button */}
                  <button
                    className="share-btn-detail"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const shareText = `${name} at ${venue}`;
                      const shareUrl = event.id
                        ? `https://mylocaljam.com/event/${event.id}`
                        : (event.ticket_link || event.source || window.location.href);
                      const copyFallback = async () => {
                        try {
                          await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
                          onFlag?.('Link copied to clipboard!');
                        } catch {
                          onFlag?.('Could not copy link — try again');
                        }
                      };
                      if (navigator.share) {
                        try {
                          await navigator.share({ title: shareText, text: shareText, url: shareUrl });
                        } catch (err) {
                          // User cancelled share sheet — not an error; only fallback on real failures
                          if (err.name !== 'AbortError') await copyFallback();
                        }
                      } else {
                        await copyFallback();
                      }
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      fontSize: '11px', fontWeight: 700,
                      padding: '8px 14px', borderRadius: '8px',
                      background: darkMode ? '#2A2A3A' : '#E5E7EB',
                      color: darkMode ? '#AAAACC' : '#4B5563',
                      border: 'none', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill="currentColor" />
                    </svg>
                    Share
                  </button>
                </div>

                {/* Secondary action — outlined icon, pushed right */}
                <button
                  className="flag-btn"
                  onClick={e => { e.stopPropagation(); setFlagSheet(true); }}
                  title="Report / Suggest Edit"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '32px', height: '32px', borderRadius: '999px',
                    background: 'none', cursor: 'pointer',
                    border: `1.5px solid ${darkMode ? '#3A3A4A' : '#D1D5DB'}`,
                    color: darkMode ? '#7878A0' : '#9CA3AF',
                    transition: 'border-color 0.15s, color 0.15s',
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15V4h16v11H4z" style={{ display: 'none' }} />
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Long-press horizontal toolbelt — anchored to card top-center */}
      {mounted && (
        <QuickActions
          open={shortcutOpen}
          onClose={() => setShortcutOpen(false)}
          cardRect={cardRect}
          darkMode={darkMode}
          event={event}
          onFollowArtist={() => {
            if (event?.artist_name) {
              try { navigator?.vibrate?.(10); } catch {}
              onFollowArtist?.(event.artist_name);
            }
          }}
          isArtistFollowed={isArtistFollowed}
          onShare={async () => {
            const shareText = `${name} at ${venue}`;
            const shareUrl = event.id
              ? `https://mylocaljam.com/event/${event.id}`
              : (event.ticket_link || event.source || window.location.href);
            const copyFallback = async () => {
              try {
                await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
                onFlag?.('Link copied to clipboard!');
              } catch {
                onFlag?.('Could not copy link — try again');
              }
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
          onFlag={() => setFlagSheet(true)}
        />
      )}

      {/* Flag report modal — portaled to body to escape overflow:hidden clipping */}
      {flagSheet && mounted && createPortal(
        <div
          onClick={e => { e.stopPropagation(); setFlagSheet(false); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 150,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'calc(100% - 32px)', maxWidth: '400px',
              background: sheetBg,
              borderRadius: '20px',
              border: `1px solid ${sheetBorder}`,
              padding: '20px 16px 24px',
              boxShadow: darkMode
                ? '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
                : '0 12px 40px rgba(0,0,0,0.2)',
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

              {/* Other */}
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
                Other
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
                      boxSizing: 'border-box',
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
                        color: flagOtherText.trim() ? '#1C1917' : textMuted,
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
        </div>,
        document.body
      )}

      {/* Follow popover — portaled to body to escape overflow:hidden */}
      {showFollowPopover && mounted && createPortal(
        <>
          {/* Invisible backdrop to dismiss on click-away */}
          <div onClick={dismissPopover} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
          <div
            className={popoverFading ? 'popover-fade-out' : 'popover-fade-in'}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: `${popoverPos.top}px`, right: `${popoverPos.right}px`, zIndex: 1000,
              background: darkMode ? '#252535' : '#FFFFFF',
              border: `1px solid ${darkMode ? '#3A3A4A' : '#E5E7EB'}`,
              borderRadius: '14px',
              padding: '14px 16px',
              boxShadow: darkMode ? '0 12px 32px rgba(0,0,0,0.6)' : '0 6px 24px rgba(0,0,0,0.15)',
              width: '260px',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {/* Arrow */}
            <div style={{
              position: 'absolute', top: '-6px', right: '18px',
              width: '12px', height: '12px',
              background: darkMode ? '#252535' : '#FFFFFF',
              border: `1px solid ${darkMode ? '#3A3A4A' : '#E5E7EB'}`,
              borderRight: 'none', borderBottom: 'none',
              transform: 'rotate(45deg)',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: darkMode ? '#E0E0F0' : '#1F2937', lineHeight: 1.35 }}>
                Event Saved!{!isArtistFollowed && (
                  <span style={{ fontWeight: 600, color: darkMode ? '#B0B0C8' : '#6B7280' }}>
                    {' '}Want alerts for future shows?
                  </span>
                )}
              </p>
              <button
                onClick={dismissPopover}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: '1px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#7878A0' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {!isArtistFollowed && onFollowArtist && (
              <button
                onClick={handlePopoverFollow}
                style={{
                  marginTop: '12px', width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px',
                  padding: '10px 14px', borderRadius: '10px', border: 'none',
                  background: '#E8722A', color: '#1C1917',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'opacity 0.15s',
                  textAlign: 'left',
                  overflow: 'hidden',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C1917" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(event?.artist_name || '').length > 18 ? 'Follow Artist' : `Follow ${event?.artist_name || ''}`}
                </span>
              </button>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Animations + hover states */}
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes savePop {
          0% { transform: scale(1); }
          40% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes popoverIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .save-pop {
          animation: savePop 0.3s ease-out;
        }
        .popover-fade-in {
          animation: popoverIn 0.2s ease-out forwards;
        }
        .popover-fade-out {
          opacity: 0;
          transform: translateY(-4px) scale(0.95);
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        @media (hover: hover) {
          .save-btn:hover svg path {
            fill: #E8722A !important;
          }
          .share-btn-detail:hover {
            opacity: 0.75;
          }
          .flag-btn:hover {
            color: #E8722A !important;
            border-color: #E8722A !important;
          }
        }
      `}</style>
    </div>
  );
}

export default memo(EventCardV2);
