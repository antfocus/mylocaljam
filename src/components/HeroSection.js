'use client';

/**
 * HeroSection.js — "Tonight's Spotlight" featured event carousel
 * Displays manually pinned events (via admin) or auto-populated fallback.
 * Background image with dark overlay for clean text readability.
 */

import { useState, useEffect } from 'react';

const FALLBACK = { name: 'Live Music Tonight', venue: 'Asbury Park', start_time: null, end_time: null, genre: 'Music' };

/* Generic venue/music placeholder images */
const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1501386761578-0a55d938946b?w=800&q=80',
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&q=80',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
];

function formatTimeFull(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  if (h === 0 && m === 0) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  const mins = m ? `:${String(m).padStart(2, '0')}` : ':00';
  return `${h12}${mins} ${period}`;
}

export default function HeroSection({ events = [], isToday = true }) {
  const [index, setIndex] = useState(0);

  const featured = events.length > 0 ? events.slice(0, 5) : [FALLBACK];
  const current  = featured[Math.min(index, featured.length - 1)];

  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => setIndex(i => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length]);

  const name    = current.name    || current.artist_name || '';
  const venue   = current.venue   || current.venue_name  || '';
  const timeStr = formatTimeFull(current.start_time);
  const bgImage = current.image_url || current.venues?.photo_url || PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length];

  return (
    <div style={{
      position: 'relative', flexShrink: 0, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      padding: '12px 20px 24px',
      width: '100%', maxWidth: '100%', boxSizing: 'border-box',
      minHeight: '150px',
    }}>
      {/* Background image */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        transition: 'opacity 0.5s',
      }} />

      {/* Dark gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.80) 100%)',
      }} />

      {/* Subtle warm glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(circle at 10% 80%, rgba(232,114,42,0.12) 0%, transparent 45%),
          radial-gradient(circle at 90% 20%, rgba(58,173,160,0.08) 0%, transparent 40%)`,
      }} />

      {/* Top row: spotlight badge — Billboard-style deep purple pill */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{
          background: '#5E2A84', color: '#FFFFFF', fontSize: '13px', fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: '1.5px', padding: '6px 14px 6px 10px', borderRadius: '999px',
          display: 'inline-flex', alignItems: 'center', gap: '5px', lineHeight: 1,
          fontFamily: "'Arial Black', 'Anton', 'Archivo Black', sans-serif",
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z" />
          </svg>
          {isToday ? "Tonight's Spotlight" : 'Coming Up'}
        </span>
      </div>

      {/* Event info */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* Artist name — 2-line clamp with ellipsis */}
        <h2 style={{
          color: 'white', fontSize: `clamp(18px, 5vw, 22px)`, fontWeight: 900, lineHeight: 1.2,
          margin: '0 0 6px 0',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', textOverflow: 'ellipsis',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          {name}
        </h2>

        {/* Time + Venue on one clean line */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'nowrap',
          color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: 500,
          textShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}>
          {timeStr && (
            <>
              <span>🕒 {timeStr}</span>
              <span style={{ margin: '0 8px', opacity: 0.5 }}>•</span>
            </>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📍 {venue}
          </span>
        </div>
      </div>

      {/* Carousel dots */}
      {featured.length > 1 && (
        <div style={{ position: 'absolute', bottom: '10px', right: '20px', display: 'flex', gap: '5px', zIndex: 10 }}>
          {featured.map((_, i) => (
            <button key={i} onClick={() => setIndex(i)} style={{
              height: '7px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              width: i === index ? '18px' : '7px',
              background: i === index ? '#E8722A' : 'rgba(255,255,255,0.4)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
