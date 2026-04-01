'use client';

import { useState } from 'react';
import { formatTimeRange } from '@/lib/utils';
import { posthog } from '@/lib/posthog';
import ModalWrapper from '@/components/ui/ModalWrapper';

/** Format date for display */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch { return ''; }
}

export default function EventPageClient({ event }) {
  const [showAuth, setShowAuth] = useState(false);

  // ── Standalone event view — no auth redirect ──────────────────────────────
  // All users (guest & logged-in) stay on this page when visiting /event/[id].

  const eventTitle = (event.event_title || '').trim();
  const artistName = event.artist_name || '';
  const name = eventTitle || artistName;
  const venue = event.venue_name || '';
  const desc = event.description || '';
  // Waterfall: event-specific image → artist image → venue photo
  const imageUrl = event.event_image || event.artist_image || event.venue_photo || null;
  const genres = event.artist_genres || [];
  const isTribute = event.is_tribute || false;
  const timeStr = formatTimeRange(event.start_time);
  const dateStr = fmtDate(event.event_date);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';
  const sourceLink = event.source && /^https?:\/\//i.test(event.source) ? event.source : null;

  const handleAuthAction = () => setShowAuth(true);

  return (
    <div style={{
      minHeight: '100vh', background: '#0D0D12',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#1E1E2C', borderBottom: '1px solid #2A2A3A',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>
            <span style={{ color: '#FFFFFF' }}>my</span>
            <span style={{ color: '#E8722A' }}>Local</span>
            <span style={{ color: '#3AADA0' }}>Jam</span>
          </span>
        </a>
        <a href="/" style={{
          padding: '8px 20px', borderRadius: '999px', background: '#E8722A',
          color: '#1C1917', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
        }}>
          Browse Events
        </a>
      </header>

      {/* Event content */}
      <main style={{
        flex: 1, width: '100%', maxWidth: '560px',
        margin: '0 auto', padding: '20px 16px 120px',
      }}>
        {/* Date & time banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          marginBottom: '16px', flexWrap: 'wrap',
        }}>
          {dateStr && (
            <span style={{
              fontSize: '13px', fontWeight: 600, color: '#E8722A',
              background: 'rgba(232,114,42,0.1)', padding: '5px 12px',
              borderRadius: '999px',
            }}>
              {dateStr}
            </span>
          )}
          {timeStr && timeStr !== '—' && (
            <span style={{
              fontSize: '13px', fontWeight: 600, color: '#AAAACC',
              background: '#1E1E2C', padding: '5px 12px',
              borderRadius: '999px', border: '1px solid #2A2A3A',
            }}>
              {timeStr}
            </span>
          )}
          {isCanceled && (
            <span style={{
              fontSize: '12px', fontWeight: 900, color: '#FFFFFF',
              background: '#DC2626', padding: '4px 12px',
              borderRadius: '999px', letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              Canceled
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '28px', fontWeight: 800, color: '#F0F0F5',
          margin: '0 0 6px', lineHeight: 1.2, letterSpacing: '-0.3px',
          textDecoration: isCanceled ? 'line-through' : 'none',
        }}>
          {name}
        </h1>
        {eventTitle && artistName && eventTitle !== artistName && (
          <p style={{
            fontSize: '16px', fontWeight: 500, color: '#A0A0B8',
            margin: '0 0 6px',
          }}>
            {artistName}
          </p>
        )}

        {/* Venue */}
        {venue && (
          <p style={{
            fontSize: '16px', fontWeight: 500, color: '#4DB8B2',
            margin: '0 0 20px',
          }}>
            {venue}
          </p>
        )}

        {/* Hero image */}
        {imageUrl && (
          <div style={{
            borderRadius: '12px', overflow: 'hidden',
            marginBottom: '20px', aspectRatio: '16 / 9',
            position: 'relative',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {isCanceled && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
              }}>
                <span style={{
                  background: '#DC2626', color: '#FFFFFF',
                  fontSize: '18px', fontWeight: 900, letterSpacing: '2px',
                  padding: '10px 24px', borderRadius: '8px', textTransform: 'uppercase',
                }}>
                  CANCELED
                </span>
              </div>
            )}
          </div>
        )}

        {/* Cover charge */}
        {event.cover != null && event.cover !== 'TBA' && !isCanceled && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: '#2A2A3A', color: '#CCCCDD',
            fontSize: '12px', fontWeight: 700,
            padding: '5px 12px', borderRadius: '999px',
            marginBottom: '16px',
          }}>
            {event.cover === '0' || event.cover === 'Free' ? '🎵 Free Admission' : `💵 ${event.cover.startsWith('$') ? '' : '$'}${event.cover} Cover`}
          </div>
        )}

        {/* Description */}
        {desc && (
          <p style={{
            fontSize: '14px', color: '#AAAACC', lineHeight: 1.6,
            margin: '0 0 20px',
          }}>
            {desc}
          </p>
        )}

        {/* Genre tags */}
        {(genres.length > 0 || isTribute) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
            {isTribute && (
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '4px 10px',
                borderRadius: '999px', background: '#2A1A2A', color: '#F0ABFC',
              }}>
                🎭 Tribute
              </span>
            )}
            {genres.map(g => (
              <span key={g} style={{
                fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                borderRadius: '999px', background: '#1E1E2E', color: '#9898B8',
              }}>
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!isCanceled && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button
              onClick={handleAuthAction}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 700,
                padding: '10px 20px', borderRadius: '999px',
                border: 'none', cursor: 'pointer',
                background: '#3A3A4A', color: '#F0F0F5',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Save Show
            </button>

            <button
              onClick={handleAuthAction}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 700,
                padding: '10px 20px', borderRadius: '999px',
                border: 'none', cursor: 'pointer',
                background: '#3A3A4A', color: '#F0F0F5',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Follow Artist
            </button>

            {sourceLink && (
              <a
                href={sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  posthog.capture?.('venue_link_clicked', {
                    venue_name: venue,
                    artist_name: artistName,
                    event_id: event.id || '',
                    source_url: sourceLink,
                  });
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 700,
                  padding: '10px 16px', borderRadius: '8px',
                  background: '#2A2A3A', color: '#AAAACC',
                  textDecoration: 'none', border: 'none',
                }}
              >
                🌐 Venue
              </a>
            )}
          </div>
        )}
      </main>

      {/* ── Sticky upsell banner (bottom) ──────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'linear-gradient(180deg, transparent 0%, #0D0D12 20%)',
        padding: '32px 16px 24px',
      }}>
        <div style={{
          maxWidth: '560px', margin: '0 auto',
          background: '#1E1E2C', borderRadius: '16px',
          border: '1px solid #2A2A3A',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '14px', fontWeight: 700, color: '#F0F0F5',
              margin: '0 0 2px',
            }}>
              Never miss a local jam.
            </p>
            <p style={{
              fontSize: '12px', color: '#7878A0', margin: 0,
            }}>
              Sign up to track bands and save shows.
            </p>
          </div>
          <a
            href="/?signup=true"
            style={{
              padding: '10px 20px', borderRadius: '999px',
              background: '#E8722A', color: '#1C1917',
              textDecoration: 'none', fontWeight: 700, fontSize: '13px',
              whiteSpace: 'nowrap', flexShrink: 0,
              boxShadow: '0 2px 12px rgba(232,114,42,0.3)',
            }}
          >
            Create Free Account
          </a>
        </div>
      </div>

      {/* ── Auth modal overlay ─────────────────────────────────────────────── */}
      {showAuth && (
        <ModalWrapper
          onClose={() => setShowAuth(false)}
          zIndex={200}
          blur={0}
          maxWidth="400px"
          padding="32px 24px"
          cardStyle={{
            background: '#1E1E2C',
            border: '1px solid #2A2A3A',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
          }}
        >
            <span style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }}>🎵</span>
            <h2 style={{
              fontSize: '20px', fontWeight: 800, color: '#F0F0F5',
              margin: '0 0 8px',
            }}>
              Join MyLocalJam
            </h2>
            <p style={{
              fontSize: '14px', color: '#7878A0', margin: '0 0 24px', lineHeight: 1.5,
            }}>
              Create a free account to save shows, follow artists, and get notified about new events.
            </p>
            <a
              href="/?signup=true"
              style={{
                display: 'inline-block',
                padding: '13px 40px', borderRadius: '999px',
                background: '#E8722A', color: '#1C1917',
                textDecoration: 'none', fontWeight: 700, fontSize: '15px',
                boxShadow: '0 2px 12px rgba(232,114,42,0.3)',
              }}
            >
              Sign Up Free
            </a>
            <p style={{ fontSize: '13px', color: '#7878A0', margin: '16px 0 0' }}>
              Already have an account?{' '}
              <a href="/?login=true" style={{ color: '#E8722A', textDecoration: 'none', fontWeight: 600 }}>
                Sign In
              </a>
            </p>
        </ModalWrapper>
      )}
    </div>
  );
}
