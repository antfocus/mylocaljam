'use client';

/**
 * HeroSection.js — compact featured event banner
 * Defaults to Music. User can tap a dropdown to switch category.
 * Supports both artist_name/venue_name/event_date and name/venue/date fields.
 */

import { useState, useEffect } from 'react';
import { formatTimeRange } from '@/lib/utils';

const CATEGORY_OPTIONS = [
  { key: 'Music',          label: 'Music',          emoji: '🎵' },
  { key: 'Happy Hours',    label: 'Happy Hours',     emoji: '🍹' },
  { key: 'Daily Specials', label: 'Daily Specials',  emoji: '⭐' },
  { key: 'Community',      label: 'Community',       emoji: '🤝' },
];

const FALLBACK = { name: 'Live Music Tonight', venue: 'Asbury Park', start_time: null, end_time: null, genre: 'Music' };

function genreEmoji(g) {
  const l = (g ?? '').toLowerCase();
  if (l.includes('jazz'))    return '🎷';
  if (l.includes('country')) return '🤠';
  if (l.includes('rock'))    return '🎸';
  if (l.includes('folk'))    return '🪕';
  if (l.includes('dj'))      return '🎧';
  if (l.includes('happy'))   return '🍹';
  if (l.includes('special')) return '⭐';
  if (l.includes('communit'))return '🤝';
  return '🎵';
}

export default function HeroSection({ events = [], defaultCategory = 'Music', isToday = true }) {
  const [heroCategory, setHeroCategory] = useState(defaultCategory);
  const [index,        setIndex]        = useState(0);
  const categoryEvents = events.filter(e => {
    const g = ((e.genre ?? e.vibe) ?? '').toLowerCase();
    if (heroCategory === 'Music') {
      // Music = anything that isn't explicitly a happy hour, special, or community event
      return !g.includes('happy') && !g.includes('special') && !g.includes('communit');
    }
    const search = heroCategory.toLowerCase().replace(/s$/, '');
    return g.includes(search);
  });

  // If still empty, just show the first upcoming event
  const heroPool = categoryEvents.length > 0 ? categoryEvents : events;

  const featured = heroPool.length > 0 ? heroPool.slice(0, 3) : [FALLBACK];
  const current  = featured[Math.min(index, featured.length - 1)];
  useEffect(() => { setIndex(0); }, [heroCategory]);

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
      background: 'linear-gradient(160deg, #2D2D2D 0%, #3D2010 55%, #1A1A1A 100%)',
      display: 'flex', flexDirection: 'column', padding: '10px 14px 12px', gap: '4px',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(circle at 20% 70%, rgba(232,114,42,0.38) 0%, transparent 52%),
          radial-gradient(circle at 82% 18%, rgba(58,173,160,0.22) 0%, transparent 42%)`,
      }} />

      {/* Top row: badge + category dropdown */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ background: '#E8722A', color: 'white', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', padding: '3px 10px', borderRadius: '999px' }}>
          🔥 {isToday ? 'Featured Tonight' : 'Coming Up'}
        </span>

      </div>

      {/* Event info */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* Time + event name on same line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', overflow: 'hidden' }}>
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
        <div style={{ position: 'absolute', bottom: '10px', right: '14px', display: 'flex', gap: '4px', zIndex: 10 }}>
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
