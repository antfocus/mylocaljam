'use client';

import { formatTime, formatDate, getVenueColor } from '@/lib/utils';
import { Icons } from './Icons';

export default function EventCard({ event, onReport, showDate }) {
  const venueColor = event.venue_color || getVenueColor(event.venue_name || event.venues?.name);
  const venueName = event.venue_name || event.venues?.name || 'TBA';
  const time = new Date(event.event_date);

  const timeStr = formatTime(time);
  const timeParts = timeStr.split(' ');

  return (
    <div
      className="group relative flex gap-4 p-4 sm:p-5 rounded-xl border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 cursor-pointer hover:-translate-y-[1px]"
      style={{
        background: 'var(--bg-card)',
        boxShadow: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-card-hover)';
        e.currentTarget.style.boxShadow = 'var(--shadow)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-card)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Venue color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: venueColor }}
      />

      {/* Time */}
      <div className="flex flex-col items-center justify-center min-w-[60px] sm:flex-col max-sm:flex-row max-sm:gap-1.5 max-sm:justify-start">
        <div className="font-display font-bold text-base text-brand-text">{timeParts[0]}</div>
        <div className="text-[11px] text-brand-text-muted font-medium uppercase">{timeParts[1]}</div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-[17px] text-brand-text mb-1 flex items-center gap-2">
          {event.artist_name}
          {event.recurring && (
            <span className="text-brand-accent-2" title="Recurring event">{Icons.repeat}</span>
          )}
        </div>
        {event.artist_bio && (
          <div className="text-[13px] text-brand-text-secondary mb-2 leading-relaxed">{event.artist_bio}</div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <span
            className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border font-medium"
            style={{ color: venueColor, borderColor: venueColor, opacity: 0.8 }}
          >
            {Icons.map} {venueName}
          </span>
          {event.vibe && (
            <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {event.vibe}
            </span>
          )}
          {event.genre && (
            <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {event.genre}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
              event.cover === 'Free'
                ? 'bg-green-500/15 text-green-400'
                : ''
            }`}
            style={event.cover !== 'Free' ? { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' } : {}}
          >
            {Icons.ticket} {event.cover || 'TBA'}
          </span>
          {showDate && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {Icons.calendar} {formatDate(event.event_date)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end justify-between flex-shrink-0 max-sm:flex-row max-sm:items-center">
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-brand-text-muted hover:text-brand-accent"
          title="Report an issue"
          onClick={(e) => { e.stopPropagation(); onReport?.(event); }}
        >
          {Icons.flag}
        </button>
        {event.verified_at && (
          <span className="text-[10px] text-brand-text-muted">
            Verified {new Date(event.verified_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
