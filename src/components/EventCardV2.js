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

export default function EventCardV2({ event, onReport, isFavorited = false, onToggleFavorite, darkMode = true }) {
  const [expanded, setExpanded] = useState(false);

  if (!event) return null;

  const name     = event.name        || event.artist_name || '';
  const venue    = event.venue       || event.venue_name  || '';
  const desc     = event.description || event.artist_bio  || '';
  const category = event.genre       || event.vibe        || 'Live Music';
  const config   = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const timeStr  = formatTimeRange(event.start_time, event.end_time);

  // Theme colors
  const cardBg      = darkMode ? '#1A1A24' : '#FFFFFF';
  const borderColor = darkMode ? '#2A2A3A' : '#F3F4F6';
  const textPrimary = darkMode ? '#F0F0F5' : '#1F2937';
  const textMuted   = darkMode ? '#7878A0' : '#6B7280';
  const textDesc    = darkMode ? '#AAAACC' : '#4B5563';
  const heartOff    = darkMode ? '#4A4A6A' : '#D1D5DB';
  const chevronCol  = darkMode ? '#5A5A7A' : '#9CA3AF';
  const expandedBg  = darkMode ? '#14141E' : '#F9FAFB';

  return (
    <div style={{
      background: cardBg,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)',
      display: 'flex',
      border: `1px solid ${borderColor}`,
    }}>
      {/* Left accent bar */}
      <div style={{ width: '4px', flexShrink: 0, background: config.color }} />

      {/* Card body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Compact row */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px', cursor: 'pointer' }}
        >
          {/* Colored time badge */}
          <div style={{
            background: config.bg,
            color: 'white',
            fontSize: '11px', fontWeight: 800,
            padding: '3px 7px', borderRadius: '6px',
            flexShrink: 0, minWidth: '40px', textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {timeStr || '—'}
          </div>

          {/* Category emoji */}
          <span style={{ fontSize: '13px', flexShrink: 0 }}>{config.emoji}</span>

          {/* Event name */}
          <span style={{
            fontSize: '13px', fontWeight: 700, color: textPrimary,
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>

          {/* Venue name */}
          {venue && (
            <span style={{
              fontSize: '12px', color: textMuted, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '90px', flexShrink: 0,
            }}>
              {venue}
            </span>
          )}

          {/* Save heart */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite?.(event.id); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
              fontSize: '16px', color: isFavorited ? '#E8722A' : heartOff, flexShrink: 0,
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

        {/* Expanded detail panel */}
        {expanded && (
          <div style={{ padding: '0 12px 12px 12px', borderTop: `1px solid ${borderColor}`, background: expandedBg }}>
            <p style={{ fontSize: '14px', fontWeight: 800, color: textPrimary, margin: '8px 0 4px', lineHeight: 1.3 }}>
              {name}
            </p>
            <p style={{ fontSize: '13px', color: textMuted, fontWeight: 500, margin: '0 0 6px' }}>
              📍 {venue}
            </p>

            {desc && (
              <p style={{ fontSize: '13px', color: textDesc, lineHeight: 1.5, marginBottom: '8px' }}>
                {desc}
              </p>
            )}

            {event.cover_charge != null && (
              <p style={{ fontSize: '12px', color: textMuted, marginBottom: '8px' }}>
                🎟 {event.cover_charge === 0 ? 'Free admission' : `$${event.cover_charge} cover`}
              </p>
            )}

            {onReport && (
              <button
                onClick={e => { e.stopPropagation(); onReport(event); }}
                style={{ fontSize: '11px', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', color: darkMode ? '#4A4A6A' : '#D1D5DB', marginTop: '4px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#E8722A'}
                onMouseLeave={e => e.currentTarget.style.color = darkMode ? '#4A4A6A' : '#D1D5DB'}
              >
                ⚑ Report an issue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
