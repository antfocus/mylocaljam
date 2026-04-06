'use client';

import { useState, useEffect } from 'react';
// formatTimeRange no longer needed — using local fmtTime for full "7:00 PM" display
import { supabase } from '@/lib/supabase';
import { posthog } from '@/lib/posthog';

/** Format date for display — e.g. "Sunday, April 6" */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch { return ''; }
}

/** Format 24h time string to full display — e.g. "19:00" → "7:00 PM" */
function fmtTime(startStr) {
  if (!startStr) return '';
  const [h, m] = startStr.split(':').map(Number);
  if (h === 0 && m === 0) return ''; // midnight = no time
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mins = String(m).padStart(2, '0');
  return `${h12}:${mins} ${period}`;
}

export default function EventPageClient({ event }) {
  const [showSignupHint, setShowSignupHint] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // ── Check auth session once on mount ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
      setAuthReady(true);
    });
  }, []);

  // ── Guard: if event is null/undefined, show loading (never a premature 404) ──
  if (!event) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0D0D12',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #2A2A3A',
            borderTopColor: '#E8722A', borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#7878A0', fontSize: '14px' }}>Loading event...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Standalone event view — no auth redirect ──────────────────────────────
  // All users (guest & logged-in) stay on this page when visiting /event/[id].

  const eventTitle = (event.event_title || '').trim();
  const artistName = event.artist_name || '';
  const name = eventTitle || artistName;
  const venue = event.venue_name || '';
  const venueAddress = event.venue_address || '';
  const desc = event.description || '';
  // Treat "" and "None" as null so the waterfall keeps falling
  const cleanImg = (v) => (v && v !== 'None' && v !== '') ? v : null;
  // Waterfall: event-specific image → artist image → venue photo
  const imageUrl = cleanImg(event.event_image) || cleanImg(event.artist_image) || cleanImg(event.venue_photo) || null;
  const genres = event.artist_genres || [];
  const isTribute = event.is_tribute || false;
  const timeStr = fmtTime(event.start_time);
  const dateStr = fmtDate(event.event_date);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';
  const sourceLink = event.source && /^https?:\/\//i.test(event.source) ? event.source : null;
  // Google Maps link for venue
  const mapsQuery = encodeURIComponent(`${venue}${venueAddress ? ' ' + venueAddress : ' NJ'}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const handleSoftCTA = () => { if (!isLoggedIn) setShowSignupHint(true); };

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
        {/* ── 1. Title (dominant) ──────────────────────────────────────── */}
        <h1 style={{
          fontSize: '32px', fontWeight: 900, color: '#F0F0F5',
          margin: '0 0 4px', lineHeight: 1.15, letterSpacing: '-0.5px',
          textDecoration: isCanceled ? 'line-through' : 'none',
        }}>
          {name}
        </h1>
        {eventTitle && artistName && eventTitle !== artistName && (
          <p style={{
            fontSize: '17px', fontWeight: 600, color: '#A0A0B8',
            margin: '0 0 2px',
          }}>
            {artistName}
          </p>
        )}

        {/* ── 2. Venue (high-contrast, Maps link) ────────────────────── */}
        {venue && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '17px', fontWeight: 700, color: '#E8722A',
              textDecoration: 'none', margin: '0 0 16px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill="#E8722A" />
            </svg>
            {venue}
          </a>
        )}

        {/* ── 3. Date & Time (clean typography, icons) ────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          marginBottom: '8px', flexWrap: 'wrap',
        }}>
          {dateStr && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '18px', fontWeight: 600, color: '#F0F0F5',
            }}>
              {/* Calendar icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" fill="#7878A0" />
              </svg>
              {dateStr}
            </span>
          )}
          {timeStr && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '18px', fontWeight: 600, color: '#CCCCDD',
            }}>
              {/* Clock icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="#7878A0" />
              </svg>
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

        {/* ── 4. Spacer before hero image ─────────────────────────────── */}
        <div style={{ height: '24px' }} />

        {/* ── Hero image ──────────────────────────────────────────────── */}
        {imageUrl && (
          <div style={{
            borderRadius: '14px', overflow: 'hidden',
            marginBottom: '24px', aspectRatio: '16 / 9',
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
              onClick={handleSoftCTA}
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
              onClick={handleSoftCTA}
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

        {/* Soft inline signup hint (replaces blocking modal) */}
        {showSignupHint && (
          <div style={{
            padding: '16px', borderRadius: '12px',
            background: '#1E1E2C', border: '1px solid #2A2A3A',
            marginBottom: '20px',
          }}>
            <p style={{
              fontSize: '14px', fontWeight: 700, color: '#F0F0F5',
              margin: '0 0 4px',
            }}>
              Create a free account to save shows and follow artists.
            </p>
            <p style={{
              fontSize: '12px', color: '#7878A0', margin: '0 0 12px',
            }}>
              It takes 10 seconds with Google — no spam, ever.
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <a
                href="/?signup=true"
                style={{
                  padding: '10px 24px', borderRadius: '999px',
                  background: '#E8722A', color: '#1C1917',
                  textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                }}
              >
                Sign Up Free
              </a>
              <button
                onClick={() => setShowSignupHint(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#7878A0', fontSize: '12px', fontWeight: 500,
                  textDecoration: 'underline', textUnderlineOffset: '3px',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Sticky upsell banner (bottom) — hidden until auth resolves, hidden if logged in ── */}
      {authReady && !isLoggedIn && (
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
      )}
    </div>
  );
}
