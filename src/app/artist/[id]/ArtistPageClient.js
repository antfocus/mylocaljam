'use client';

import { useState, useEffect } from 'react';
import { formatTimeRange } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

/** Format date for display */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch { return ''; }
}

/** Extract start time from ISO date string */
function extractTime(dateStr) {
  if (!dateStr || !dateStr.includes('T')) return null;
  try {
    const d = new Date(dateStr);
    const parts = d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: false,
      timeZone: 'America/New_York',
    }).split(':');
    const h = String(parseInt(parts[0])).padStart(2, '0');
    const m = parts[1];
    const t = `${h}:${m}`;
    return t === '00:00' ? null : t;
  } catch { return null; }
}

export default function ArtistPageClient({ artist, upcomingEvents = [] }) {
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

  // ── Guard: if artist is null/undefined, show loading spinner ──────────────
  if (!artist) {
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
          <p style={{ color: '#7878A0', fontSize: '14px' }}>Loading artist...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const name = artist.name || '';
  const bio = artist.bio || '';
  const imageUrl = artist.image_url || null;
  const genres = artist.genres || [];
  const vibes = artist.vibes || [];
  const isTribute = artist.is_tribute || false;

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

      {/* Artist content */}
      <main style={{
        flex: 1, width: '100%', maxWidth: '560px',
        margin: '0 auto', padding: '20px 16px 120px',
      }}>
        {/* Hero image */}
        {imageUrl && (
          <div style={{
            borderRadius: '12px', overflow: 'hidden',
            marginBottom: '20px', aspectRatio: '1 / 1',
            maxWidth: '280px',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* Name */}
        <h1 style={{
          fontSize: '28px', fontWeight: 800, color: '#F0F0F5',
          margin: '0 0 6px', lineHeight: 1.2, letterSpacing: '-0.3px',
        }}>
          {name}
        </h1>

        {/* Tribute badge */}
        {isTribute && (
          <span style={{
            display: 'inline-block', fontSize: '11px', fontWeight: 700,
            padding: '4px 10px', borderRadius: '999px',
            background: '#2A1A2A', color: '#F0ABFC',
            marginBottom: '12px',
          }}>
            🎭 Tribute / Cover Band
          </span>
        )}

        {/* Genre + Vibe tags */}
        {(genres.length > 0 || vibes.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px', marginTop: '8px' }}>
            {genres.map(g => (
              <span key={g} style={{
                fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                borderRadius: '999px', background: '#1E1E2E', color: '#E8722A',
                border: '1px solid rgba(232,114,42,0.2)',
              }}>
                {g}
              </span>
            ))}
            {vibes.map(v => (
              <span key={v} style={{
                fontSize: '11px', fontWeight: 600, padding: '4px 10px',
                borderRadius: '999px', background: '#1E1E2E', color: '#3AADA0',
                border: '1px solid rgba(58,173,160,0.2)',
              }}>
                {v}
              </span>
            ))}
          </div>
        )}

        {/* Bio */}
        {bio && (
          <p style={{
            fontSize: '14px', color: '#AAAACC', lineHeight: 1.6,
            margin: '0 0 24px',
          }}>
            {bio}
          </p>
        )}

        {/* Follow button */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => { if (!isLoggedIn) setShowSignupHint(true); }}
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
            Follow {name}
          </button>
        </div>

        {/* Soft inline signup hint */}
        {showSignupHint && (
          <div style={{
            padding: '16px', borderRadius: '12px',
            background: '#1E1E2C', border: '1px solid #2A2A3A',
            marginBottom: '24px',
          }}>
            <p style={{
              fontSize: '14px', fontWeight: 700, color: '#F0F0F5',
              margin: '0 0 4px',
            }}>
              Create a free account to follow {name}.
            </p>
            <p style={{
              fontSize: '12px', color: '#7878A0', margin: '0 0 12px',
            }}>
              Get notified when new shows are announced — no spam, ever.
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

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <div>
            <h2 style={{
              fontSize: '18px', fontWeight: 800, color: '#F0F0F5',
              margin: '0 0 16px', letterSpacing: '-0.2px',
            }}>
              Upcoming Shows
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcomingEvents.map(ev => {
                const title = ev.event_title || ev.artist_name || name;
                const time = extractTime(ev.event_date);
                const timeStr = formatTimeRange(time);
                const dateStr = fmtDate(ev.event_date);
                return (
                  <a
                    key={ev.id}
                    href={`/event/${ev.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '12px',
                      background: '#1E1E2C', border: '1px solid #2A2A3A',
                      textDecoration: 'none', transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Thumbnail */}
                    {(ev.event_image || imageUrl) && (
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '8px',
                        overflow: 'hidden', flexShrink: 0,
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ev.event_image || imageUrl}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px', fontWeight: 700, color: '#F0F0F5',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {title}
                      </div>
                      <div style={{
                        fontSize: '12px', color: '#7878A0', marginTop: '2px',
                      }}>
                        {ev.venue_name}{dateStr ? ` · ${dateStr}` : ''}{timeStr && timeStr !== '—' ? ` · ${timeStr}` : ''}
                      </div>
                    </div>
                    {/* Chevron */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A4A6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* No upcoming events */}
        {upcomingEvents.length === 0 && (
          <div style={{
            padding: '24px', borderRadius: '12px',
            background: '#1E1E2C', border: '1px solid #2A2A3A',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '14px', color: '#7878A0', margin: 0 }}>
              No upcoming shows scheduled yet. Follow {name} to get notified when new dates are added.
            </p>
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
