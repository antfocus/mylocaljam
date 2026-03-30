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

export default function EventCardV2({ event, isFavorited = false, onToggleFavorite, darkMode = true, onFollowArtist, isArtistFollowed, onFlag, autoExpand = false }) {
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

  const handleFlagSubmit = async (reason, otherText) => {
    setFlagSubmitting(true);
    const finalReason = reason === 'Other' ? otherText : reason;
    await onFlag(event.id, finalReason);
    setFlagSheet(false);
    setFlagOtherOpen(false);
    setFlagOtherText('');
    setFlagSubmitting(false);
  };

  const handleFollowClick = (e) => {
    e.preventDefault();
    if (isArtistFollowed) return;
    onFollowArtist?.(event.artist_id);
    setShowFollowPopover(true);
    setPopoverFading(false);
    setTimeout(() => {
      setPopoverFading(true);
      setTimeout(() => setShowFollowPopover(false), 300);
    }, 1500);
  };

  const renderVenueSection = () => {
    if (!event.venue_name) return null;

    return (
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5">📍</span>
        <div className="flex-1 min-w-0">
          {event.city && (
            <div className={`text-sm font-semibold mb-0.5 ${
              darkMode
                ? 'text-white'
                : 'text-gray-700'
            }`}>
              {event.city}
            </div>
          )}
          <div className={`text-xs ${
            darkMode
              ? 'text-gray-400'
              : 'text-gray-600'
          } break-words`}>
            {event.venue_name}
          </div>
        </div>
      </div>
    );
  };

  const renderEventTime = () => {
    if (!event.start_time) return null;

    const timeStr = formatTimeRange(event.start_time, event.end_time);
    const isRegularTime = event.start_time && event.end_time ? true : false;

    return (
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🕐</span>
        <div className={`text-sm ${
          darkMode
            ? 'text-gray-300'
            : 'text-gray-600'
        }`}>
          {isRegularTime && <div>{timeStr}</div>}
          {event.note && (
            <div className={`text-xs italic ${
              darkMode
                ? 'text-gray-500'
                : 'text-gray-500'
            }`}>
              {event.note}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderArtistSection = () => {
    if (!event.artist_id) return null;

    return (
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-400 mb-1">ARTIST</div>
            <div className={`text-sm font-semibold break-words ${
              darkMode
                ? 'text-white'
                : 'text-gray-900'
            }`}>
              {event.artist_name || 'Unknown Artist'}
            </div>
            {event.artist_bio && (
              <>
                <div
                  ref={descRef}
                  className={`mt-2 text-xs line-clamp-3 break-words ${
                    darkMode
                      ? 'text-gray-400'
                      : 'text-gray-600'
                  } ${
                    bioExpanded ? 'line-clamp-none' : 'line-clamp-3'
                  }`}
                >
                  {event.artist_bio}
                </div>
                {isTextTruncated && (
                  <button
                    onClick={() => setBioExpanded(!bioExpanded)}
                    className="text-xs text-blue-500 hover:text-blue-400 mt-1"
                  >
                    {bioExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
            )}
          </div>
          {event.artist_id && (
            <button
              onClick={handleFollowClick}
              disabled={isArtistFollowed}
              ref={bookmarkRef}
              className={`flex-shrink-0 mt-1 px-2 py-1 rounded text-xs font-semibold transition-all ${
                isArtistFollowed
                  ? darkMode
                    ? 'bg-gray-700 text-gray-400 cursor-default'
                    : 'bg-gray-200 text-gray-500 cursor-default'
                  : darkMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isArtistFollowed ? '✓ Followed' : 'Follow'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCategories = () => {
    if (!event.categories || event.categories.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-3 pb-3 border-b border-gray-700">
        {event.categories.map((cat, idx) => {
          const config = CATEGORY_CONFIG[cat] || DEFAULT_CONFIG;
          return (
            <span
              key={idx}
              className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
              style={{ backgroundColor: config.color }}
            >
              {config.emoji} {cat}
            </span>
          );
        })}
      </div>
    );
  };

  const renderDescription = () => {
    if (!event.description) return null;

    return (
      <div className={`mt-3 text-sm break-words ${
        darkMode
          ? 'text-gray-300'
          : 'text-gray-700'
      } ${
        expanded ? '' : 'line-clamp-2'
      }`}>
        {event.description}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-blue-500 hover:text-blue-400 text-xs ml-1"
          >
            Show more
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-blue-500 hover:text-blue-400 text-xs ml-1"
          >
            Show less
          </button>
        )}
      </div>
    );
  };

  const isFlagged = event.flagged === true;

  return (
    <div
      className={`relative w-full rounded-lg border transition-all p-4 ${
        darkMode
          ? `border-gray-700 ${
              isFlagged
                ? 'bg-red-950 bg-opacity-20'
                : 'bg-gray-900 bg-opacity-50 hover:bg-opacity-75'
            }`
          : `border-gray-300 ${
              isFlagged
                ? 'bg-red-100'
                : 'bg-white'
            }`
      }`}
    >
      {/* Header with bookmark and flag buttons */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {event.categories && event.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {event.categories.slice(0, 3).map((cat, idx) => {
                const config = CATEGORY_CONFIG[cat] || DEFAULT_CONFIG;
                return (
                  <span
                    key={idx}
                    className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold text-white"
                    style={{ backgroundColor: config.color }}
                  >
                    {config.emoji}
                  </span>
                );
              })}
            </div>
          )}
          <h3 className={`text-base font-bold mb-2 break-words ${
            darkMode
              ? 'text-white'
              : 'text-gray-900'
          }`}>
            {event.title || 'Untitled Event'}
          </h3>
          {renderEventTime()}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            onClick={() => onToggleFavorite?.(event.id)}
            className={`p-2 rounded transition-all ${
              isFavorited
                ? 'text-red-500'
                : darkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-700'
            }`}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorited ? '❤️' : '🤍'}
          </button>
          <button
            onClick={() => setFlagSheet(true)}
            className={`p-2 rounded transition-all ${
              isFlagged
                ? 'text-red-500'
                : darkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-700'
            }`}
            title="Flag this event"
          >
            🚩
          </button>
        </div>
      </div>

      {/* Venue Section */}
      {renderVenueSection()}

      {/* Categories */}
      {renderCategories()}

      {/* Description */}
      {renderDescription()}

      {/* Artist Section */}
      {renderArtistSection()}

      {/* Flag Sheet Modal */}
      {mounted && flagSheet && createPortal(
        <div className={`fixed inset-0 z-50 flex items-end ${
          darkMode
            ? 'bg-black bg-opacity-50'
            : 'bg-black bg-opacity-30'
        }`}
          onClick={() => !flagSubmitting && setFlagSheet(false)}
        >
          <div
            className={`w-full rounded-t-lg p-4 ${
              darkMode
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-3">Report this event</h3>
            <div className="space-y-2">
              {[
                { label: 'Duplicate', value: 'Duplicate' },
                { label: 'Expired/Closed', value: 'Expired' },
                { label: 'Inappropriate content', value: 'Inappropriate' },
                { label: 'Spam', value: 'Spam' },
                { label: 'Other', value: 'Other' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === 'Other') {
                      setFlagOtherOpen(!flagOtherOpen);
                    } else {
                      handleFlagSubmit(option.value, '');
                    }
                  }}
                  disabled={flagSubmitting}
                  className={`w-full text-left p-3 rounded border transition-all ${
                    darkMode
                      ? 'border-gray-700 hover:bg-gray-700 disabled:opacity-50'
                      : 'border-gray-300 hover:bg-gray-100 disabled:opacity-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {flagOtherOpen && (
              <div className="mt-3">
                <textarea
                  value={flagOtherText}
                  onChange={(e) => setFlagOtherText(e.target.value)}
                  placeholder="Please describe the issue..."
                  disabled={flagSubmitting}
                  className={`w-full p-2 rounded border text-sm ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } disabled:opacity-50`}
                  rows="3"
                />
                <button
                  onClick={() => handleFlagSubmit('Other', flagOtherText)}
                  disabled={!flagOtherText.trim() || flagSubmitting}
                  className={`w-full mt-2 p-2 rounded font-semibold text-white transition-all disabled:opacity-50 ${
                    flagOtherText.trim() && !flagSubmitting
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-600'
                  }`}
                >
                  {flagSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setFlagSheet(false);
                setFlagOtherOpen(false);
                setFlagOtherText('');
              }}
              disabled={flagSubmitting}
              className={`w-full mt-3 p-2 rounded font-semibold transition-all disabled:opacity-50 ${
                darkMode
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
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
          }}
          className={`rounded-lg shadow-lg p-3 text-sm font-semibold whitespace-nowrap pointer-events-none transition-all duration-300 ${
            darkMode
              ? 'bg-gray-800 text-green-400'
              : 'bg-gray-100 text-green-600'
          } ${
            popoverFading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          Following {event.artist_name}!
        </div>,
        document.body
      )}

      <style jsx>{`
        div[class*="line-clamp-none"] {
          -webkit-line-clamp: unset;
          display: block;
        }

        button:disabled {
          cursor: not-allowed;
        }

        @media (prefers-color-scheme: light) {
          .dark\:text-white {
            color: #E5E7EB !important;
          }

          .dark\:text-gray-300 {
            color: #D1D5DB !important;
          }

          .dark\:text-gray-400 {
            color: #9CA3AF !important;
          }

          .dark\:text-gray-600 {
            color: #4B5563 !important;
          }

          .dark\:bg-gray-900 {
            background-color: #F3F4F6 !important;
          }

          .dark\:border-gray-700 {
            border-color: #D1D5DB !important;
          }
        }

        @media (prefers-color-scheme: dark) {
          button:hover:not(:disabled) {
            opacity: 0.9;
          }
          button:active:not(:disabled) {
            transform: scale(0.98);
          }
        }
      `}</style>
    </div>
  );
}