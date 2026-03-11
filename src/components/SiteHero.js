'use client';

import { useState, useEffect } from 'react';
import { formatTimeRange } from '@/lib/utils';

export default function SiteHero({ events = [], onExplore, onAddEvent }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const featured = events.slice(0, 5);

  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => setCurrentSlide(i => (i + 1) % featured.length), 4000);
    return () => clearInterval(t);
  }, [featured.length]);

  return (
    <section
      className="hero-bg"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '500px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '80px 24px 60px',
        background: 'linear-gradient(160deg, var(--bg-primary) 0%, #0F1B2D 25%, #1A0F2E 50%, #2D1810 75%, var(--bg-primary) 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Animated waveform overlay */}
      <div className="waveform-overlay" />

      {/* Ambient glow orbs */}
      <div style={{
        position: 'absolute', top: '10%', left: '10%',
        width: '300px', height: '300px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45, 212, 191, 0.08) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '15%',
        width: '250px', height: '250px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255, 107, 53, 0.08) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', right: '30%',
        width: '200px', height: '200px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.06) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      {/* Main heading */}
      <h1
        className="font-heading gradient-text"
        style={{
          fontSize: 'clamp(40px, 7vw, 80px)',
          fontWeight: 900,
          lineHeight: 1.1,
          marginBottom: '16px',
          position: 'relative',
          zIndex: 2,
          maxWidth: '800px',
        }}
      >
        Discover Your Local Jam
      </h1>

      {/* Subheading */}
      <p
        style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          color: 'var(--text-secondary)',
          maxWidth: '600px',
          lineHeight: 1.6,
          marginBottom: '32px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        Find nearby gigs, artists, venues, and community events — right in your backyard.
      </p>

      {/* CTA buttons */}
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 2,
        marginBottom: '48px',
      }}>
        <button
          onClick={onExplore}
          className="btn-glow font-heading"
          style={{
            padding: '14px 32px',
            borderRadius: '999px',
            background: 'var(--accent-teal)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 700,
          }}
        >
          Explore Upcoming Events
        </button>
        <button
          onClick={onAddEvent}
          className="font-heading"
          style={{
            padding: '14px 32px',
            borderRadius: '999px',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1.5px solid var(--border-hover)',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.target.style.borderColor = 'var(--accent-orange)'; e.target.style.color = 'var(--accent-orange)'; }}
          onMouseLeave={e => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.color = 'var(--text-primary)'; }}
        >
          Add Your Event
        </button>
      </div>

      {/* Featured events mini-carousel */}
      {featured.length > 0 && (
        <div style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          maxWidth: '900px',
        }}>
          <p className="font-accent" style={{
            fontSize: '18px',
            color: 'var(--accent-orange)',
            marginBottom: '4px',
          }}>
            🔥 {events[0]?.date === new Date().toISOString().split('T')[0] ? 'Featured Tonight' : 'Coming Up'}
          </p>

          {/* Carousel cards */}
          <div style={{
            display: 'flex',
            gap: '16px',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            padding: '4px 0 12px',
            width: '100%',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}>
            {featured.map((event, i) => {
              const name = event.name || event.artist_name || '';
              const venue = event.venue || event.venue_name || '';
              const timeStr = formatTimeRange(event.start_time, event.end_time);
              return (
                <div
                  key={event.id || i}
                  style={{
                    flex: '0 0 auto',
                    scrollSnapAlign: 'start',
                    width: 'clamp(220px, 30vw, 280px)',
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(10px)',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {timeStr && (
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '6px',
                        background: 'rgba(255, 107, 53, 0.15)',
                        color: 'var(--accent-orange)',
                        border: '1px solid rgba(255, 107, 53, 0.3)',
                      }}>
                        {timeStr}
                      </span>
                    )}
                    <span className="tag-badge tag-live" style={{ fontSize: '10px', padding: '2px 6px' }}>LIVE</span>
                  </div>
                  <p className="font-heading" style={{
                    fontSize: '15px', fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: '4px',
                  }}>
                    {name}
                  </p>
                  <p style={{
                    fontSize: '13px', color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    📍 {venue}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Carousel dots */}
          {featured.length > 1 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {featured.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  aria-label={`Go to event ${i + 1}`}
                  style={{
                    width: currentSlide === i ? '20px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    background: currentSlide === i ? 'var(--accent-orange)' : 'var(--text-muted)',
                    opacity: currentSlide === i ? 1 : 0.4,
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
