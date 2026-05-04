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
    // Use the canonical joined artist name when available — that's the
    // value that resolves to a real artists row. The raw artist_name field
    // can be a billing or template alias that wouldn't match anything.
    const followName = event?.artists?.name || event?.artist_name;
    if (!event?.artist_id || !followName) return;
    try { navigator?.vibrate?.(10); } catch {}
    onFollowArtist?.(followName);
    dismissPopover();
  }, [event?.artist_id, event?.artists?.name, event?.artist_name, onFollowArtist, dismissPopover]);

  // description is pre-resolved via Hierarchy of Truth in page.js
  const desc = event?.description || '';

  // Short-bio threshold — bios under this length skip the line-clamp +
  // Read More entirely so cards with concise blurbs render cleanly with
  // no truncation chrome. New AI bios target ≤200 chars; the 300-char
  // frontend threshold gives a 100-char buffer so even responses that
  // run slightly over the prompt target render fully without forcing the
  // user into a Read More tap to see the rest. Legacy long bios (>300)
  // continue to clamp + show Read More. Tuning value lives here so a
  // designer can dial it up/down without touching prompt logic.
  const SHORT_BIO_LIMIT = 300;
  const isShortBio = desc.length > 0 && desc.length <= SHORT_BIO_LIMIT;

  // Three-state card click cycle. Tapping anywhere on the card advances:
  //   closed                → open with bio collapsed
  //   open + bio collapsed  → bio expanded   (only if there's a long bio)
  //   open + bio expanded   → closed
  //   open + short bio      → closed         (no Read More step to walk)
  // Action-row buttons stopPropagation so they bypass this cycle. The
  // Read More / Show Less button has its own handler that participates
  // in the same cycle but skips the "advance to bio expanded" step from
  // the closed state (it's only reachable when the card is already open).
  const handleCardClick = () => {
    // Long-press just fired — swallow the click that follows pointerup.
    if (longPressFired.current) { longPressFired.current = false; return; }
    const hasLongBio = desc.length > 0 && !isShortBio;
    if (!expanded) {
      setExpanded(true);
      setBioExpanded(false);
      return;
    }
    if (!bioExpanded && hasLongBio) {
      setBioExpanded(true);
      return;
    }
    setExpanded(false);
    setBioExpanded(false);
  };

  // Check if description text is actually truncated. Short bios skip this
  // entirely (they fit in any number of lines, so the measurement is noise).
  useEffect(() => {
    if (isShortBio) {
      if (isTextTruncated) setIsTextTruncated(false);
      return;
    }
    if (descRef.current && !bioExpanded) {
      setIsTextTruncated(descRef.current.scrollHeight > descRef.current.clientHeight);
    }
  }, [expanded, bioExpanded, desc, isShortBio, isTextTruncated]);

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
  // Venue link: prefer the venue's official website (venues.website) over the
  // event's scraper origin (event.source). Stone Pony and Wonder Bar events
  // come in via the Ticketmaster scraper, so source = ticketmaster URL — but
  // the 🌐 Venue button should land users on the venue's own calendar page.
  // Falls back to sourceLink for venues without a website populated.
  const rawVenueSite = event.venue_website || event.venues?.website || null;
  const venueSite    = rawVenueSite && /^https?:\/\//i.test(rawVenueSite) ? rawVenueSite : null;
  const venueLink    = venueSite || sourceLink;
  // Smart waterfall: merged arrays (artist-enriched) → legacy event columns → fallback
  const category   = event.artist_vibes?.[0] || event.artist_genres?.[0] || event.genre || event.vibe || 'Live Music';
  const config     = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const timeStr    = formatTimeRange(event.start_time);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';
  // Hide the artist subtitle when it would just echo the event title.
  // Case-insensitive + trimmed so "Jane Doe" / "jane doe " collapses cleanly.
  const _titleKey  = eventTitle.trim().toLowerCase();
  const _artistKey = (artistName || '').trim().toLowerCase();
  // Hide artist subtitle on template-linked events. The "subtitle" would just
  // be the scraper alias (e.g. "Grateful Mondays with Kevin Hill - Secret
  // Sound Check") which the template was designed to clean up. Showing it
  // alongside the cleaned title defeats the point of templating.
  const showArtistSubtitle = ARTIST_SUBTITLE_CATEGORIES.includes(event.category)
    && eventTitle
    && artistName
    && _titleKey !== _artistKey
    && !event.template_id;

  // Follow Artist gate: only show when there's a real linked artist row.
  // Without artist_id, "Follow" would try to follow a template name or
  // scraper alias, which doesn't resolve to any artists row → click does
  // nothing. Hide the button entirely in that case.
  const canonicalArtistName = event.artists?.name || event.artist_name || '';
  // hasFollowableArtist gates the Follow Artist pill. An artist is only
  // followable if there's a real link AND the linked artist row is a
  // genuine performer — not an event row (kind='event') or a billing
  // row (kind='billing'). Event-kind rows exist for venue parties /
  // brunches / trivia nights that got mistakenly shaped as artist rows
  // by the scraper; they should render with Save Event, not Follow
  // Artist. The kind check looks at the joined artist row when present;
  // events without a joined artist row fall through (no kind to check
  // → assume followable, the artist_id guard already handled it).
  //
  // Also exclude template-linked events: an event with a template_id set is
  // a recurring branded event ("Snow Crabs! (All You Can Eat)", "Family
  // Funday Monday", "Trivia NIGHT" etc.). There's no single performer to
  // follow — the template IS the entity. This is a safety net for the
  // common case where the linked artist row is mis-classified as 'musician'
  // (because the scraper auto-created it before anyone flipped its kind to
  // 'event'). Without this gate, those rows render with a misleading
  // FOLLOW ARTIST pill that does nothing useful when tapped.
  const linkedArtistKind = event.artists?.kind;
  const hasFollowableArtist = !!(
    event.artist_id
    && canonicalArtistName
    && linkedArtistKind !== 'event'
    && linkedArtistKind !== 'billing'
    && !event.template_id
  );

  // Theme colors — all dynamic based on darkMode
  const cardBg      = darkMode ? '#1A1A24' : '#FFFFFF';
  // Card border — bumped from #F3F4F6 (lighter than the page bg, so the
  // edge actually disappeared into the canvas) to #E5E5E5 / neutral-200
  // so cards have a visible hairline against the gray page bg. Dark
  // mode kept at #2A2A3A — already creates clear separation against
  // the near-black page bg.
  const borderColor = darkMode ? '#2A2A3A' : '#E5E5E5';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#7878A0' : '#6B7280';
  const venueColor  = darkMode ? '#4DB8B2' : '#2A8F8A';
  const textDesc    = darkMode ? '#AAAACC' : '#4B5563';
  const heartOff    = darkMode ? '#6A5A7A' : '#9B8A8E';
  // Expanded section bg matches the card bg so the top header and the
  // bottom content read as one unified surface rather than two glued
  // halves. Previously sat at #F9FAFB / #14141E (one shade off cardBg)
  // for visual hierarchy, but with the canvas-vs-card pattern shipped
  // the outer border + page bg already do that work — the inner color
  // shift just made cards look split.
  const expandedBg  = cardBg;
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
      // 16px (rounded-2xl) — softer corners that match modern feed-card
      // conventions and pair with the bumped page bg + visible border to
      // give each card a discrete shape against the canvas.
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: shortcutOpen
        ? (darkMode ? '0 2px 16px rgba(232,114,42,0.25)' : '0 2px 12px rgba(232,114,42,0.2)')
        : (darkMode ? '0 1px 3px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.04)'),
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

        {/* Compact row — long-press opens shortcut menu, tap walks the
            three-state cycle (closed → open → bio expanded → closed). See
            handleCardClick above for the full state machine. */}
        <div
          onClick={handleCardClick}
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
            // Bumped vertical padding 12→14 and inter-column gap 12→14 to give
            // the larger artist text room to breathe without crowding the
            // time column or save button.
            display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 14px 14px 14px', cursor: 'pointer',
            background: pressed ? (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(232,114,42,0.06)') : 'transparent',
            transition: 'background 0.15s ease',
          }}
        >
          {/* Editorial time column — "6:00" in brand orange + "PM" stacked below,
              with a dashed orange perforation line on the right edge that gives the
              row its ticket-stub silhouette without a filled background block.
              Time is always shown in uniform H:MM format (never bare "6") so rows
              align rhythmically. */}
          <div style={{
            flex: '0 0 56px',
            alignSelf: 'stretch',
            paddingRight: 10,
            borderRight: `2px dashed ${isCanceled
              ? 'rgba(220,38,38,0.45)'
              : (darkMode ? 'rgba(232,114,42,0.4)' : 'rgba(201,87,23,0.45)')}`,
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            textAlign: 'left',
          }}>
            {isCanceled ? (
              <span style={{ fontSize: '20px', fontWeight: 500, color: '#DC2626', lineHeight: 1 }}>✕</span>
            ) : (() => {
              const raw = timeStr || '—';
              if (raw === '—') return <span style={{ fontSize: '16px', fontWeight: 500, color: textMuted, lineHeight: 1 }}>—</span>;
              const periodMatch = raw.match(/([apAP][mM]?)$/);
              const period = periodMatch ? (periodMatch[1].toLowerCase().startsWith('a') ? 'AM' : 'PM') : '';
              const nums = raw.replace(/[apAP][mM]?$/, '').trim();
              // Normalize to H:MM uniformly — "6" → "6:00", "6:30" stays. Keeps rows
              // visually rhythmic across events.
              const timeDisplay = nums.includes(':') ? nums : `${nums}:00`;
              return (
                <>
                  <span style={{
                    fontSize: timeDisplay.length > 4 ? '15px' : '17px',
                    fontWeight: 500,
                    color: darkMode ? '#E8722A' : '#C95717',
                    lineHeight: 1,
                  }}>{timeDisplay}</span>
                  {period && (
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: textMuted, letterSpacing: '0.14em',
                      marginTop: 4, textTransform: 'uppercase',
                    }}>{period}</span>
                  )}
                </>
              );
            })()}
          </div>

          {/* Event name + venue stacked.
              Sizes bumped per readability feedback — at arms-length phone
              reading the previous 15/13 felt too small. New: artist 17,
              venue 14, subtitle 13. Inter-row gap 3→4 so the larger lines
              don't kiss. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2,
              color: textPrimary,
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
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px', fontWeight: 500,
                color: darkMode ? '#C0C0D0' : '#6B7280',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {artistName}
              </span>
            )}
            {venue && (
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px', fontWeight: 400,
                color: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.58)',
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
          <div onClick={handleCardClick} style={{
            padding: '0 12px 12px 12px',
            background: expandedBg,
            // Very subtle hairline between header and bottom content. Much
            // lighter than the outer card border (~30-40% as visible) so it
            // reads as a structural hint rather than dividing the card into
            // two pieces. Only renders when expanded; collapsed cards stay
            // seamless. transparent stand-in keeps the height consistent
            // either way (no jump on toggle).
            borderTop: expanded
              ? `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'}`
              : '1px solid transparent',
            cursor: desc ? 'pointer' : 'default',
          }}>

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
                    // Top-aligned — keep faces / subject in frame instead of
                    // cropping them out. Was 'center 15%' (slightly biased
                    // toward top); switched to 'center top' for full
                    // consistency across Spotlight + cards + artist screens.
                    objectFit: 'cover', objectPosition: 'center top',
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

            {/* Bio / Description — short bios (≤300 chars) render inline with
                no truncation chrome; long bios get the 3-line clamp + Read
                More toggle. Threshold sits 100 chars above the AI prompt
                target (200) so the vast majority of LLM responses render
                fully without forcing a Read More tap. Type sized at 18px /
                1.55 — a readability bump above standard body text without
                tipping into hero territory; the dedicated spotlight pop-up
                (ArtistSpotlight.js) goes further at 20px for that surface's
                committed-reader context. */}
            {desc && (
              <div style={{ margin: '6px 0 8px' }}>
                <p ref={descRef} style={{
                  fontSize: '18px', color: textDesc, lineHeight: 1.55, margin: 0,
                  ...(isShortBio || bioExpanded ? {} : {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }),
                }}>
                  {desc}
                </p>
                {!isShortBio && (isTextTruncated || bioExpanded) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setBioExpanded(prev => !prev); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0 0',
                      fontSize: '13px', fontWeight: 600, color: '#E8722A',
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

            {/* Action row — Rebalanced layout (Apr 30, 2026 v3).
                Single flex line: [Identity pill] [flex spacer] [icon] [icon] [icon]
                Design intent:
                  • LEFT: identity pill — exactly one of three states:
                      - Follow      (solid orange, jet-black text)  — artist not followed
                      - Following   (outlined orange pill)           — artist followed
                      - Event       (outlined orange pill, calendar) — no followable artist
                    All three pills share the same shape/size so the row's
                    composition is identical across artist and event-only cards.
                    The Event variant is non-interactive (a label, not a CTA);
                    Follow / Following toggle the user's follow state.
                  • RIGHT: a tight cluster of three 18px icon-only utilities
                    (Venue map pin, Share, Report flag) with gap 14px. Equal
                    visual weight — they form a balanced trio, no orphan flag.
                  • A flex spacer in the middle pushes the cluster to the
                    right edge, so the row reads as left-vs-right balance:
                    one bold pill on the left, one quiet utility cluster on
                    the right.
                Each icon button gets title + aria-label since the text
                labels are gone. */}
            {!isCanceled && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {/* 1a. Follow / Following — interactive toggle, only when
                    there's a real canonical artist linked. Solid orange when
                    not followed (jet-black text/icon for WCAG AA contrast),
                    soft orange-tinted outlined pill when followed. */}
                {onFollowArtist && hasFollowableArtist && (
                  <button
                    onClick={e => { e.stopPropagation(); onFollowArtist(canonicalArtistName); }}
                    style={{
                      // Pure ghost — zero chrome at any state. The icon plus
                      // verb carries the affordance; cursor pointer confirms
                      // on hover. No bg, no border, no underline. Aggressive
                      // reset (appearance none, all box-modeling props zeroed)
                      // because Chrome/Safari user-agent button styles
                      // otherwise leak through as a faint pill outline.
                      // Typography is "label" pattern (small uppercase tracked
                      // 700-weight) so the pill reads as a UI element / status
                      // indicator rather than another sentence in the bio
                      // column. Same treatment in both states so the symmetry
                      // holds; recede happens via color only.
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: 0, margin: 0,
                      background: 'transparent',
                      border: 0,
                      outline: 0,
                      boxShadow: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer',
                      color: isArtistFollowed
                        ? (darkMode ? '#A3A3A3' : '#737373')
                        : (darkMode ? '#F5F5F5' : '#171717'),
                      transition: 'color 0.2s ease',
                      fontFamily: "'DM Sans', sans-serif",
                      flexShrink: 0,
                    }}
                  >
                    {isArtistFollowed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                    {isArtistFollowed ? 'Following Artist' : 'Follow Artist'}
                  </button>
                )}

                {/* 1b. Event badge — non-interactive label that takes the
                    Follow pill's slot when there's no canonical artist to
                    follow (template-only events, fake-artist rows demoted
                    to kind='event', etc.). Same outlined-orange shape as
                    Following so the row composition is identical to artist
                    cards; the only differences are the calendar icon and
                    cursor: default. Renders as a <span> rather than <button>
                    to make the non-interactive intent unambiguous to assistive
                    tech. */}
                {(!onFollowArtist || !hasFollowableArtist) && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      try { navigator?.vibrate?.(10); } catch {}
                      const wasSaved = isFavorited;
                      onToggleFavorite?.(event.id);
                      // Mirror the ticket stub's follow-popover trigger
                      // when transitioning into saved state.
                      if (!wasSaved && event?.artist_name) {
                        setShowFollowPopover(true);
                        setPopoverFading(false);
                      }
                    }}
                    aria-pressed={isFavorited}
                    aria-label={isFavorited ? 'Following this event' : 'Follow this event'}
                    style={{
                      // Same pure ghost treatment as Follow Artist plus the
                      // small-uppercase-tracked label typography so both
                      // pills read as UI indicators rather than sentences
                      // in the bio column. Verb-unified labels (Follow
                      // Event / Following Event) keep artist and event
                      // cards mentally aligned.
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: 0, margin: 0,
                      background: 'transparent',
                      border: 0,
                      outline: 0,
                      boxShadow: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer',
                      color: isFavorited
                        ? (darkMode ? '#A3A3A3' : '#737373')
                        : (darkMode ? '#F5F5F5' : '#171717'),
                      transition: 'color 0.2s ease',
                      fontFamily: "'DM Sans', sans-serif",
                      flexShrink: 0,
                    }}
                  >
                    {isFavorited ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                    {isFavorited ? 'Following Event' : 'Follow Event'}
                  </button>
                )}

                {/* Flex spacer pushes the icon cluster to the right edge. */}
                <span style={{ flex: 1 }} />

                {/* Right-aligned icon cluster — Venue, Share, Report.
                    All three icons are 18px with 8px hit-area padding and
                    14px gap between them, so they read as a single balanced
                    utility group. No text labels; title + aria-label carry
                    the meaning. Same color as the card body text in both
                    modes so the cluster sits as a quiet counterweight to
                    the loud orange identity pill on the left. */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                  {/* Tickets indicator — sits IMMEDIATELY left of the
                      Venue map pin, inside the right-aligned utility
                      cluster. Informational only (no click target). The
                      Venue button to its right is the action: tap that
                      to land on the venue's site (which for ticketed
                      venues IS the ticket purchase flow — Ticketmaster,
                      Live Nation, Dice, etc.). Renders when the event
                      has a cover string OR a ticket_link OR the linked
                      venue is flagged is_ticketed_venue=true. Cover
                      string ($25, Free w/RSVP) wins; otherwise generic
                      "TICKETS" caps. Hidden when none of those signals
                      are present (the 95% free-event default). */}
                  {(() => {
                    const coverLabel  = (event.cover || '').trim();
                    const showTickets = !!(coverLabel || event.ticket_link || event.is_ticketed_venue);
                    if (!showTickets) return null;
                    const ticketText = coverLabel || 'Tickets';
                    return (
                      <span
                        title={ticketText.startsWith('$')
                          ? `Tickets: ${ticketText}`
                          : 'This event is ticketed — tap the venue icon to buy'}
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                          fontSize: '11px', fontWeight: 700,
                          color: darkMode ? '#E8722A' : '#C95717',
                          letterSpacing: '0.05em',
                          textTransform: ticketText.startsWith('$') ? 'none' : 'uppercase',
                          flexShrink: 0,
                          // Visual gap matches the rest of the utility
                          // cluster (gap: 14px on the parent), so the
                          // text reads as a labeled badge for the
                          // venue icon to its right rather than a
                          // floating fragment.
                        }}
                      >
                        {ticketText}
                      </span>
                    );
                  })()}

                  {/* 2. Venue link — opens venue site or scraper source. */}
                  {venueLink && (
                    <a
                      href={venueLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Visit ${venue}`}
                      aria-label={`Visit ${venue}`}
                      onClick={e => {
                        e.stopPropagation();
                        posthog.capture?.('venue_link_clicked', {
                          venue_name: venue,
                          artist_name: artistName,
                          event_id: event.id || '',
                          source_url: venueLink,
                          link_type: venueSite ? 'official' : 'scraper_source',
                        });
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px',
                        background: 'transparent',
                        color: darkMode ? '#F0F0F5' : '#1F2937',
                        textDecoration: 'none', border: 'none', cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </a>
                  )}

                  {/* 3. Share — native share sheet on supported browsers;
                      clipboard fallback on desktop. AbortError is NOT an
                      error (user cancelled the system share dialog). */}
                  <button
                    className="share-btn-detail"
                    title="Share event"
                    aria-label="Share event"
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
                          if (err.name !== 'AbortError') await copyFallback();
                        }
                      } else {
                        await copyFallback();
                      }
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '8px',
                      background: 'transparent',
                      color: darkMode ? '#F0F0F5' : '#1F2937',
                      border: 'none', cursor: 'pointer',
                      transition: 'opacity 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <path d="M16 6l-4-4-4 4" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </button>

                  {/* 4. Report flag — opens the flag/suggest-edit sheet.
                      Lucide wavy banner so it reads as a flag (the old
                      corner-notch path was unrecognizable at small sizes).
                      Same color as Venue/Share — they're peers in the
                      utility cluster, no longer an orphan at the far edge. */}
                  <button
                    className="flag-btn"
                    onClick={e => { e.stopPropagation(); setFlagSheet(true); }}
                    title="Report / Suggest edit"
                    aria-label="Report or suggest edit"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '8px',
                      background: 'transparent',
                      border: 'none', cursor: 'pointer',
                      color: darkMode ? '#F0F0F5' : '#1F2937',
                      transition: 'color 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                  </button>
                </div>
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
            // Prefer the canonical joined artist name over the scraper's
            // artist_name string so we follow the right row when the event
            // text is a billing or template alias.
            if (hasFollowableArtist) {
              try { navigator?.vibrate?.(10); } catch {}
              onFollowArtist?.(canonicalArtistName);
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

      {/* Save confirmation — centered modal-card (Apr 29, 2026 redesign).
          Old anchored popover competed with the save icon for space and
          forced the orange Follow button to dominate the screen. New design
          centers on the viewport with a dim backdrop, leads with a green
          check + "Event saved" headline so the success state is read first,
          and demotes Follow to a secondary outline pill. The previous
          popoverPos calculation is no longer used (popover is centered)
          but kept in scope so we don't have to refactor the open/close
          flow — it's harmless dead state. */}
      {showFollowPopover && mounted && createPortal(
        <>
          {/* Dim backdrop — click anywhere outside the card to dismiss. */}
          <div onClick={dismissPopover} style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          }} />

          {/* Centered confirmation card */}
          <div
            className={popoverFading ? 'save-confirm-fade-out' : 'save-confirm-fade-in'}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="Event saved"
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              zIndex: 1000,
              background: darkMode ? '#252535' : '#FFFFFF',
              border: `1px solid ${darkMode ? '#3A3A4A' : '#E5E7EB'}`,
              borderRadius: '20px',
              padding: '28px 24px 24px',
              boxShadow: darkMode
                ? '0 24px 60px rgba(0,0,0,0.7)'
                : '0 18px 48px rgba(0,0,0,0.18)',
              width: 'min(360px, 90vw)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {/* Dismiss X — top right of the card. Bigger hit target than
                the old 16px X so users with thumbs can tap it confidently. */}
            <button
              onClick={dismissPopover}
              aria-label="Dismiss"
              style={{
                position: 'absolute', top: 10, right: 10,
                width: 32, height: 32, padding: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke={darkMode ? '#8888A8' : '#9CA3AF'} strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Success indicator — soft-green circle + check. Reads first.
                Green choice is the standard success-state semantic; the
                check icon reinforces "done" without needing a label. */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: darkMode ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                   stroke="#22c55e" strokeWidth="3"
                   strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            {/* Headline */}
            <p style={{
              margin: '0 0 6px',
              fontSize: 20, fontWeight: 800,
              color: darkMode ? '#F0F0F5' : '#1F2937',
              textAlign: 'center', lineHeight: 1.2,
            }}>
              Event saved
            </p>

            {/* Event context — title + venue. Sized close to the headline so
                it's actually readable on mobile (was 14px, bumped to 16px on
                feedback that the line was too small). The strong title still
                outweighs the muted "at <venue>" segment so the hierarchy
                "headline → title → venue" is preserved. */}
            <p style={{
              margin: 0,
              fontSize: 16, fontWeight: 500,
              color: darkMode ? '#A8A8C0' : '#6B7280',
              textAlign: 'center', lineHeight: 1.45,
            }}>
              <span style={{ color: darkMode ? '#D8D8E8' : '#374151', fontWeight: 600 }}>
                {name}
              </span>
              {venue ? <> at {venue}</> : null}
            </p>

            {/* Follow upsell — only when artist is followable + not already
                followed. Visually demoted from the old full-width orange
                button: a divider sets it apart, the prompt is a one-liner,
                and the CTA is an outline pill that's clearly orange-themed
                but doesn't fight the headline for attention. */}
            {!isArtistFollowed && onFollowArtist && hasFollowableArtist && (
              <>
                <div style={{
                  height: 1,
                  background: darkMode ? '#3A3A4A' : '#E5E7EB',
                  margin: '20px -24px 16px',
                }} />
                <p style={{
                  margin: '0 0 14px',
                  fontSize: 15, fontWeight: 500,
                  color: darkMode ? '#9090B0' : '#6B7280',
                  textAlign: 'center', lineHeight: 1.4,
                }}>
                  Want updates when{' '}
                  <strong style={{ color: darkMode ? '#D0D0E0' : '#374151' }}>
                    {canonicalArtistName}
                  </strong>
                  {' '}plays again?
                </p>
                {/* Follow CTA — outline pill in brand orange so it reads as
                    "this is the orange call-to-action" without a saturated
                    fill, but the LABEL itself is jet black. Orange-on-orange
                    text fails contrast (~3:1) and was hard to read against
                    the 8% orange wash; black hits ~14:1 and is comfortable. */}
                <button
                  onClick={handlePopoverFollow}
                  className="follow-pill-btn"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6,
                    padding: '10px 20px',
                    margin: '0 auto',
                    borderRadius: '999px',
                    border: '1.5px solid #E8722A',
                    background: 'rgba(232,114,42,0.08)',
                    color: '#000000',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'background 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke="#000000" strokeWidth="2.5"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Follow {canonicalArtistName.length > 18 ? 'Artist' : canonicalArtistName}
                </button>
              </>
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
        /* Save-confirmation centered card (Apr 29 redesign).
           Compounds with translate(-50%,-50%) which is set inline so the
           card stays centered regardless of viewport size. */
        @keyframes saveConfirmIn {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .save-confirm-fade-in {
          animation: saveConfirmIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .save-confirm-fade-out {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.92);
          transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .follow-pill-btn:hover {
          background: rgba(232, 114, 42, 0.16) !important;
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
