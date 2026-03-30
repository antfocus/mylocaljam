'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatTimeRange } from '@/lib/utils';
import { posthog } from '@/lib/posthog';

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

interface EventCardV2Props {
  event: any;
  isFavorited?: boolean;
  onToggleFavorite?: (eventId: string) => void;
  darkMode?: boolean;
  onFollowArtist?: (artistId: string) => void;
  isArtistFollowed?: boolean;
  onFlag?: (eventId: string, reason: string) => void;
  autoExpand?: boolean;
}

export default function EventCardV2({
  event,
  isFavorited = false,
  onToggleFavorite,
  darkMode = true,
  onFollowArtist,
  isArtistFollowed = false,
  onFlag,
  autoExpand = false,
}: EventCardV2Props) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [flagSheet, setFlagSheet] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagOtherOpen, setFlagOtherOpen] = useState(false);
  const [flagOtherText, setFlagOtherText] = useState('');
  const [showFollowPopover, setShowFollowPopover] = useState(false);
  const [popoverFading, setPopoverFading] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });
  const bookmarkRef = useRef<HTMLButtonElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const [isTextTruncated, setIsTextTruncated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !bookmarkRef.current) return;

    const rect = bookmarkRef.current.getBoundingClientRect();
    const top = rect.bottom + 8;
    const right = window.innerWidth - rect.right;

    setPopoverPos({ top, right });
  }, [mounted, showFollowPopover]);

  useEffect(() => {
    if (!descRef.current) return;
    const isTruncated = descRef.current.scrollHeight > descRef.current.clientHeight;
    setIsTextTruncated(isTruncated);
  }, [event?.description]);

  // Default fallback
  const name = event.title || event.name || 'Untitled Event';
  const venue = event.venue || event.venue_name || '';
  const imageUrl = event.event_image || event.artist_image || event.venue_photo || null;
  const artistName = event.artist_name || '';
  const defaultBg = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';

  // Color system
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

  const handleFlagSubmit = async (reason: string, otherText?: string) => {
    setFlagSubmitting(true);
    const finalReason = reason === 'Other' ? (otherText || '') : reason;
    await onFlag?.(event.id, finalReason);
    setFlagSheet(false);
    setFlagOtherOpen(false);
    setFlagOtherText('');
    setFlagSubmitting(false);
  };

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isArtistFollowed) return;
    onFollowArtist?.(event.artist_id);
    setShowFollowPopover(true);
    setPopoverFading(false);
    setTimeout(() => {
      setPopoverFading(true);
      setTimeout(() => setShowFollowPopover(false), 300);
    }, 1500);
  };

  // For the "more options" menu button
  const handleMoreClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={`card-container ${
        darkMode ? 'dark-mode-card' : 'light-mode-card'
      }`}
      style={{
        position: 'relative',
        background: darkMode ? '#1A1A24' : '#FFFFFF',
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Cover Image */}
      {imageUrl && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '160px',
            background: defaultBg,
            backgroundImage: `url("${imageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 100%)',
          }} />
        </div>
      )}

      {/* Card Content */}
      <div style={{ padding: '16px' }}>
        {/* Header: Event Title + Artists */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '8px',
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: 700,
              color: textPrimary,
              margin: 0,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: expanded ? 'unset' : 3,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {name}
            </h3>
            <div style={{
              display: 'flex',
              gap: '8px',
              flexShrink: 0,
              alignItems: 'center',
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.(event.id);
                }}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                  transition: 'transform 0.2s',
                }}
              >
                {isFavorited ? '❤️' : '🤍'}
              </button>
            </div>
          </div>

          {/* Artist and Venue */}
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '6px' }}>
            {artistName || venue ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                {artistName && (
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
            ) : null}
          </div>
        </div>

        {/* Time + Icon Grid */}
        {event.start_time && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            fontSize: '13px',
            color: textMuted,
          }}>
            <span>🕐</span>
            <div style={{ flex: 1 }}>
              {formatTimeRange(event.start_time, event.end_time)}
              {event.note && (
                <div style={{
                  fontSize: '11px',
                  fontStyle: 'italic',
                  color: darkMode ? '#5A5A70' : '#999',
                  marginTop: '2px',
                }}>
                  {event.note}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '12px',
            fontSize: '12px',
            color: textDesc,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical' as const,
            display: expanded ? 'block' : '-webkit-box',
          }}>
            <span>{event.description}</span>
          </div>
        )}

        {/* Categories */}
        {event.categories && event.categories.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: '12px',
          }}>
            {event.categories.map((cat: string) => {
              const cfg = CATEGORY_CONFIG[cat as keyof typeof CATEGORY_CONFIG] || DEFAULT_CONFIG;
              return (
                <span
                  key={cat}
                  style={{
                    background: cfg.bg,
                    color: '#FFF',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {cfg.emoji} {cat}
                </span>
              );
            })}
          </div>
        )}

        {/* Footer: Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          paddingTop: '12px',
          borderTop: `1px solid ${borderColor}`,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 600,
              background: darkMode ? '#3A3A4A' : '#E5E7EB',
              color: darkMode ? '#FFF' : '#1F2937',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFlagSheet(!flagSheet);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 600,
              background: darkMode ? '#3A3A4A' : '#E5E7EB',
              color: darkMode ? '#FFF' : '#1F2937',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            🚩 Flag
          </button>
        </div>
      </div>

      {/* Flag Sheet Modal */}
      {mounted && flagSheet && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 50,
          }}
          onClick={() => !flagSubmitting && setFlagSheet(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '500px',
              margin: '0 auto',
              background: darkMode ? '#1A1A24' : '#FFFFFF',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              padding: '20px',
              boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '18px',
              fontWeight: 700,
              marginBottom: '16px',
              color: textPrimary,
            }}>
              Report this event
            </h3>

            {[
              { label: 'Duplicate', value: 'Duplicate' },
              { label: 'Expired/Closed', value: 'Expired' },
              { label: 'Inappropriate content', value: 'Inappropriate' },
              { label: 'Spam', value: 'Spam' },
              { label: 'Wrong information', value: 'WrongInfo' },
              { label: 'Other', value: 'Other' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (opt.value === 'Other') {
                    setFlagOtherOpen(!flagOtherOpen);
                  } else {
                    handleFlagSubmit(opt.value);
                  }
                }}
                disabled={flagSubmitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  marginBottom: '8px',
                  textAlign: 'left',
                  fontSize: '14px',
                  background: darkMode ? '#2A2A3A' : '#F3F4F6',
                  color: textPrimary,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '8px',
                  cursor: flagSubmitting ? 'not-allowed' : 'pointer',
                  opacity: flagSubmitting ? 0.5 : 1,
                  transition: 'background 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}

            {flagOtherOpen && (
              <>
                <textarea
                  value={flagOtherText}
                  onChange={(e) => setFlagOtherText(e.target.value)}
                  placeholder="Please describe the issue..."
                  disabled={flagSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    background: darkMode ? '#2A2A3A' : '#F9FAFB',
                    color: textPrimary,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '8px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: '80px',
                    opacity: flagSubmitting ? 0.5 : 1,
                    cursor: flagSubmitting ? 'not-allowed' : 'text',
                  }}
                />
                <button
                  onClick={() => handleFlagSubmit('Other', flagOtherText)}
                  disabled={!flagOtherText.trim() || flagSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: flagOtherText.trim() && !flagSubmitting ? '#E8722A' : '#999',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: flagOtherText.trim() && !flagSubmitting ? 'pointer' : 'not-allowed',
                    opacity: flagSubmitting ? 0.5 : 1,
                    transition: 'background 0.2s',
                  }}
                >
                  {flagSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </>
            )}

            <button
              onClick={() => {
                setFlagSheet(false);
                setFlagOtherOpen(false);
                setFlagOtherText('');
              }}
              disabled={flagSubmitting}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                background: darkMode ? '#2A2A3A' : '#E5E7EB',
                color: darkMode ? '#FFF' : '#1F2937',
                border: 'none',
                borderRadius: '8px',
                cursor: flagSubmitting ? 'not-allowed' : 'pointer',
                opacity: flagSubmitting ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Follow Popover */}
      {mounted && showFollowPopover && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${popoverPos.top}px`,
            right: `${popoverPos.right}px`,
            zIndex: 40,
            background: darkMode ? '#2A2A3A' : '#F3F4F6',
            color: darkMode ? '#4DB8B2' : '#059669',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            transition: 'opacity 0.3s',
            opacity: popoverFading ? 0 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          Following {artistName}!
        </div>,
        document.body
      )}

      <style jsx>{`
        .card-container {
          user-select: none;
        }
        .card-container:hover {
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
}