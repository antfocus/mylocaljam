'use client';

/**
 * HeroSection.js — compact featured event banner
 * Cycles through upcoming events with spotlight effect.
 * Supports both artist_name/venue_name/event_date and name/venue/date fields.
 */

import { useState, useEffect } from 'react';
import { formatTimeRange } from '@/lib/utils';

const FALLBACK = { name: 'Live Music Tonight', venue: 'Asbury Park', start_time: null, end_time: null, genre: 'Music' };

function genreEmoji(g) {
  const l = (g ?? '').toLowerCase();
  if (l.includes('jazz'))    return '🎷';
  if (l.includes('country')) return '🤠';
  if (l.includes('rock'))    return '🎸';
  if (l.includes('folk'))    return '🪕';
  if (l.includes('dj'))      return '🎧';
  return '🎵';
}

export default function HeroSection({ events = [], isToday = true }) {
  const [index, setIndex] = useState(0);

  const featured = events.length > 0 ? events.slice(0, 3) : [FALLBACK];
  const current  = featured[Math.min(index, featured.length - 1)];

  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => setIndex(i => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length]);


  const name    = current.name    || current.artist_name || '';
  const venue   = current.venue   || current.venue_name  || '';
  const timeStr = formatTimeRange(current.start_time, current.end_time);

  return (
    <div style={{
      position: 'relative', flexShrink: 0, overflow: 'hidden',
      background: 'linear-gradient(180deg, #0A0A10 0%, #1A1208 60%, #0D0D0D 100%)',
      display: 'flex', flexDirection: 'column', padding: '8px 14px 12px', gap: '2px',
    }}>
      {/* Spotlight beam — cone from top-center */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '90px solid transparent',
        borderRight: '90px solid transparent',
        borderTop: '120px solid rgba(255,210,100,0.10)',
        filter: 'blur(18px)',
        pointerEvents: 'none',
      }} />

      {/* Spotlight floor glow */}
      <div style={{
        position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)',
        width: '180px', height: '40px',
        background: 'radial-gradient(ellipse, rgba(255,200,80,0.32) 0%, rgba(232,114,42,0.12) 40%, transparent 75%)',
        filter: 'blur(12px)',
        pointerEvents: 'none',
      }} />

      {/* Ambient side glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(circle at 10% 80%, rgba(232,114,42,0.18) 0%, transparent 45%),
          radial-gradient(circle at 90% 20%, rgba(58,173,160,0.12) 0%, transparent 40%)`,
      }} />

      {/* Top row: badge + category dropdown */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ background: '#E8722A', color: 'white', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', padding: '3px 10px', borderRadius: '999px' }}>
          🔥 {isToday ? 'Featured Tonight' : 'Coming Up'}
        </span>

      </div>

      {/* Event info */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* Time + event name on same line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', overflow: 'hidden' }}>
          {timeStr && (
            <span style={{
              fontSize: '13px', fontWeight: 800, flexShrink: 0,
              color: '#E8722A',
              background: 'rgba(232,114,42,0.15)',
              border: '1px solid rgba(232,114,42,0.4)',
              padding: '2px 9px', borderRadius: '6px',
              letterSpacing: '0.5px',
            }}>
              {timeStr}
            </span>
          )}
          <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 900, lineHeight: 1.2, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontWeight: 500 }}>
            <span style={{ color: '#F4896B' }}>📍</span> {venue}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
          <span style={{
            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px',
            padding: '2px 8px', borderRadius: '999px',
            background: 'rgba(58,173,160,0.2)', color: '#3AADA0', border: '1px solid rgba(58,173,160,0.4)',
          }}>
            {genreEmoji(current.genre)} {current.genre || 'Live Music'}
          </span>
        </div>
      </div>

      {/* Carousel dots */}
      {featured.length > 1 && (
        <div style={{ position: 'absolute', bottom: '6px', right: '14px', display: 'flex', gap: '4px', zIndex: 10 }}>
          {featured.map((_, i) => (
            <button key={i} onClick={() => setIndex(i)} style={{
              height: '6px', borderRadius: '3px', border: 'none', cursor: 'pointer',
              width: i === index ? '16px' : '6px',
              background: i === index ? '#E8722A' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
