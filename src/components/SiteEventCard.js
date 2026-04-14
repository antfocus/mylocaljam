'use client';

import { useState } from 'react';
import { formatTimeRange } from '@/lib/utils';

const CATEGORY_CONFIG = {
  'Live Music':      { color: '#FF6B35', emoji: '🎵' },
  'Music':           { color: '#FF6B35', emoji: '🎵' },
  'Happy Hour':      { color: '#2DD4BF', emoji: '🍹' },
  'Happy Hours':     { color: '#2DD4BF', emoji: '🍹' },
  'Daily Special':   { color: '#F59E0B', emoji: '⭐' },
  'Daily Specials':  { color: '#F59E0B', emoji: '⭐' },
  'Community':       { color: '#A855F7', emoji: '🤝' },
  'Community Event': { color: '#A855F7', emoji: '🤝' },
  'Jazz':            { color: '#F59E0B', emoji: '🎷' },
  'Rock':            { color: '#EF4444', emoji: '🎸' },
  'Folk':            { color: '#10B981', emoji: '🪕' },
  'Country':         { color: '#D97706', emoji: '🤠' },
  'DJ':              { color: '#8B5CF6', emoji: '🎧' },
};
const DEFAULT_CONFIG = { color: '#FF6B35', emoji: '🎵' };

const ARTIST_SUBTITLE_CATEGORIES = ['Live Music', 'Comedy'];

export default function SiteEventCard({ event, isFavorited = false, onToggleFavorite }) {
  const [hovered, setHovered] = useState(false);

  if (!event) return null;

  const eventTitle = (event.event_title || '').trim();
  const artistName = event.name || event.artist_name || '';
  const name       = eventTitle || artistName;
  const venue      = event.venue || event.venue_name || '';
  const desc       = event.description || event.artist_bio || '';
  const category   = event.genre || event.vibe || 'Live Music';
  const config     = CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
  const timeStr    = formatTimeRange(event.start_time, event.end_time);
  const ticketLink = event.ticket_link || null;
  const sourceLink = event.source || null;
  const isFree     = event.cover === '0' || event.cover === 0 || (event.cover && String(event.cover).toLowerCase() === 'free');
  const showArtistSubtitle = ARTIST_SUBTITLE_CATEGORIES.includes(event.category) && eventTitle && artistName && eventTitle !== artistName;

  // Build tags
  const tags = [];
  tags.push({ label: `${config.emoji} ${category}`, className: 'tag-genre' });
  if (isFree) tags.push({ label: 'FREE ENTRY', className: 'tag-free' });
  if (event.age_limit === '21+' || event.is_21_plus) tags.push({ label: '21+', className: 'tag-21' });

  return (
    <div
      className="event-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${config.color}, transparent)` }} />

      {/* Card body */}
      <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

        {/* Left: Time + Venue */}
        <div style={{ flexShrink: 0, minWidth: '120px', maxWidth: '180px' }}>
          {timeStr && (
            <p className="font-heading" style={{
              fontSize: '18px',
              fontWeight: 800,
              color: config.color,
              lineHeight: 1.2,
              marginBottom: '4px',
            }}>
              {timeStr}
            </p>
          )}
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            📍 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue}</span>
          </p>
        </div>

        {/* Center: Event info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="font-heading" style={{
            fontSize: '19px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: showArtistSubtitle ? '2px' : '6px',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {name}
          </h3>
          {showArtistSubtitle && (
            <p style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '6px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {artistName}
            </p>
          )}

          {desc && (
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              marginBottom: '8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {desc}
            </p>
          )}

          {/* Tags */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {tags.map((tag, i) => (
              <span key={i} className={`tag-badge ${tag.className}`}>
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(event.id); }}
            aria-label={isFavorited ? 'Remove from saved' : 'Save event'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '22px',
              color: isFavorited ? '#FF6B35' : 'var(--text-muted)',
              transition: 'transform 0.15s, color 0.15s',
              transform: isFavorited ? 'scale(1.15)' : 'scale(1)',
              padding: '4px',
            }}
          >
            {isFavorited ? '♥' : '♡'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (navigator.share) {
                navigator.share({ title: name, text: `${name} at ${venue}`, url: window.location.href });
              }
            }}
            aria-label="Share event"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'var(--text-muted)',
              padding: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.target.style.color = 'var(--accent-teal)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
          >
            ↗
          </button>
        </div>
      </div>

      {/* Quick action links (visible on hover on desktop) */}
      {(ticketLink || sourceLink) && (
        <div style={{
          padding: '0 20px 12px',
          display: 'flex',
          gap: '8px',
          opacity: hovered ? 1 : 0.6,
          transition: 'opacity 0.2s',
        }}>
          {ticketLink && (
            <a
              href={ticketLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '12px', fontWeight: 800,
                padding: '6px 14px', borderRadius: '8px',
                background: 'var(--accent-orange)',
                color: '#1A1A24',
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              🎟 Tickets
            </a>
          )}
          {sourceLink && (
            <a
              href={sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '12px', fontWeight: 700,
                padding: '6px 14px', borderRadius: '8px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                border: '1px solid var(--border)',
                transition: 'opacity 0.2s',
              }}
            >
              🔗 Venue
            </a>
          )}
        </div>
      )}
    </div>
  );
}
