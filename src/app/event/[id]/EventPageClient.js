'use client';

/**
 * EventPageClient — public event detail page (the landing page for shared
 * iMessage / Twitter / Slack links to /event/[id]).
 *
 * Layout (Option C v4 from the design pass):
 *   - Editorial header: date stub on the left + title block on the right,
 *     vertically centered against the stub.
 *   - Full-width poster image (no aspect crop — was previously stuffed into
 *     a 16:9 box with objectFit:cover, which clipped portrait flyers).
 *   - Description.
 *   - Three action buttons: Save Show (ticket-stub icon), Follow Artist
 *     (person+plus), Venue (map pin → opens Google Maps).
 *
 * Theme: theme-aware via useTheme. Falls back to the user's Auto/Light/Dark
 * preference like the rest of the app.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { posthog } from '@/lib/posthog';
import useTheme from '@/hooks/useTheme';
import { Icons } from '@/components/Icons';

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

/**
 * Break event_date into the three lines the date stub renders:
 *   { day: 'SAT', date: '25', month: 'APR' }
 * Eastern TZ + noon-local so DST flips can't push the weekday off-by-one.
 */
function parseDateBlock(eventDate) {
  if (!eventDate) return { day: '', date: '', month: '' };
  try {
    const raw = typeof eventDate === 'string' && eventDate.includes('T')
      ? eventDate
      : `${eventDate}T12:00:00`;
    const d = new Date(raw);
    return {
      day:   d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).toUpperCase(),
      date:  d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/New_York' }),
      month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' }).toUpperCase(),
    };
  } catch {
    return { day: '', date: '', month: '' };
  }
}

export default function EventPageClient({ event }) {
  const { darkMode } = useTheme();
  const [showSignupHint, setShowSignupHint] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // Sticky upsell banner — guest users see it on first visit, but tapping
  // the X hides it for the rest of the session and across future event-page
  // visits on this device. Keeps the prompt available without pestering
  // anyone who's already declined.
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
      setAuthReady(true);
    });
    try {
      if (localStorage.getItem('mlj_event_banner_dismissed') === 'true') {
        setBannerDismissed(true);
      }
    } catch { /* private mode / blocked storage — banner shows by default */ }
  }, []);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try { localStorage.setItem('mlj_event_banner_dismissed', 'true'); } catch {}
  };

  // Theme tokens — single source of truth for every color used below. The
  // layout doesn't change between modes; only these values do.
  const t = darkMode ? {
    bg:           '#0D0D12',
    headerBg:     '#1E1E2C',
    surface:      '#181826',
    border:       '#2A2A3A',
    borderSubtle: '#1F1F2E',
    text:         '#FFFFFF',
    textMuted:    '#B8B8C8',
    textDim:      '#7878A0',
    accent:       '#E8722A',
    dateBlockBg:  'rgba(232,114,42,0.04)',
    perforation:  '#2A2A3A',
    iconStroke:   '#B8B8C8',
    bannerBg:     '#1E1E2C',
  } : {
    bg:           '#FAFAF7',
    headerBg:     '#FFFFFF',
    surface:      '#FFFFFF',
    border:       '#E0DDD8',
    borderSubtle: '#ECE9E2',
    text:         '#1A1A24',
    textMuted:    '#6B7280',
    textDim:      '#7878A0',
    accent:       '#E8722A',
    dateBlockBg:  'rgba(232,114,42,0.06)',
    perforation:  '#D1CFC8',
    iconStroke:   '#6B7280',
    bannerBg:     '#FFFFFF',
  };

  // ── Loading skeleton — preserved from before ──────────────────────────────
  if (!event) {
    return (
      <div style={{
        minHeight: '100vh', background: t.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: `3px solid ${t.border}`,
            borderTopColor: t.accent, borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: t.textDim, fontSize: '14px' }}>Loading event...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const eventTitle = (event.event_title || '').trim();
  const artistName = event.artist_name || '';
  const name       = eventTitle || artistName;
  const venue      = event.venue_name || '';
  const venueAddress = event.venue_address || '';
  const desc       = event.description || '';
  const cleanImg   = (v) => (v && v !== 'None' && v !== '') ? v : null;
  const imageUrl   = cleanImg(event.event_image) || cleanImg(event.artist_image) || cleanImg(event.venue_photo) || null;
  const genres     = event.artist_genres || [];
  const isTribute  = event.is_tribute || false;
  const timeStr    = fmtTime(event.start_time);
  const dateBlock  = parseDateBlock(event.event_date);
  const isCanceled = event.status === 'cancelled' || event.status === 'canceled';
  const sourceLink = event.source && /^https?:\/\//i.test(event.source) ? event.source : null;
  const mapsQuery  = encodeURIComponent(`${venue}${venueAddress ? ' ' + venueAddress : ' NJ'}`);
  const mapsUrl    = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const handleSoftCTA = () => { if (!isLoggedIn) setShowSignupHint(true); };

  // ── Action button — shared style so the three reads as a row ──────────────
  const actionBtnStyle = {
    flex: 1, minWidth: 0,
    padding: '12px 8px',
    background: t.surface,
    border: `1px solid ${t.border}`,
    borderRadius: '12px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    color: t.text,
    textDecoration: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh', background: t.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      color: t.text,
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: t.headerBg,
        borderBottom: `1px solid ${t.border}`,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', fontWeight: 700, letterSpacing: '-0.025em' }}>
            <span style={{ color: t.text, fontWeight: 400 }}>my</span>
            <span style={{ color: t.text }}>Local</span>
            <span style={{ color: t.accent, fontStyle: 'italic' }}>Jam</span>
          </span>
        </a>
        <a href="/" style={{
          padding: '8px 16px', borderRadius: '999px', background: t.accent,
          color: '#FFFFFF', textDecoration: 'none', fontWeight: 500, fontSize: '13px',
        }}>
          Browse Events
        </a>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, width: '100%', maxWidth: '560px',
        margin: '0 auto', padding: '24px 20px 120px',
      }}>
        {/* ── Title block: editorial header ────────────────────────────────
              Title in big Outfit black-uppercase, venue immediately below as
              an orange Maps link, then a mono-caps date/time strip with the
              day-of-week accented in brand orange.  Three layers, top-down,
              no date stub competing for the title's vertical real estate. */}
        <section style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(28px, 7vw, 44px)',
            fontWeight: 800,
            color: t.text,
            lineHeight: 0.98,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            margin: 0,
            textDecoration: isCanceled ? 'line-through' : 'none',
            wordBreak: 'break-word',
          }}>
            {name}
          </h1>

          {/* Artist name — only when it's distinct from the displayed title
              (e.g. an event_title like "Comedy Night" and the artist is the
              actual headliner). Subtle, mono caps. */}
          {eventTitle && artistName && eventTitle !== artistName && (
            <p style={{
              fontSize: '12px', fontWeight: 600, color: t.textDim,
              margin: '8px 0 0',
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {artistName}
            </p>
          )}

          {/* Venue — orange pin link to Google Maps. Outfit weight 600 so it
              feels like part of the headline group, not metadata. */}
          {venue && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '17px', fontWeight: 600,
                color: t.accent, textDecoration: 'none',
                margin: '12px 0 0',
                lineHeight: 1.2,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.25"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venue}
            </a>
          )}

          {/* Date + time strip — IBM Plex Mono caps, day-of-week in orange,
              dot separators between fields. Reads like a magazine dateline. */}
          {(dateBlock.day || timeStr) && (
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap',
              gap: '8px',
              margin: '14px 0 0',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {dateBlock.day && (
                <span style={{ color: t.accent, fontWeight: 700 }}>
                  {dateBlock.day}
                </span>
              )}
              {dateBlock.day && (dateBlock.month || dateBlock.date) && (
                <span style={{ color: t.textDim }}>·</span>
              )}
              {(dateBlock.month || dateBlock.date) && (
                <span style={{ color: t.text }}>
                  {dateBlock.month}{dateBlock.month && dateBlock.date ? ' ' : ''}{dateBlock.date}
                </span>
              )}
              {timeStr && (dateBlock.day || dateBlock.month) && (
                <span style={{ color: t.textDim }}>·</span>
              )}
              {timeStr && (
                <span style={{ color: t.text }}>
                  {timeStr}
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── Full poster — no aspect crop. Image renders at its natural
              ratio so portrait flyers + landscape photos both display in
              full. The previous 16:9 box with objectFit:cover was clipping
              all portrait posters. */}
        {imageUrl && (
          <div style={{
            borderRadius: '8px', overflow: 'hidden',
            marginBottom: '20px', position: 'relative',
            background: t.surface,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            {isCanceled && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
              }}>
                <span style={{
                  background: '#DC2626', color: '#FFFFFF',
                  fontSize: '18px', fontWeight: 800, letterSpacing: '0.1em',
                  padding: '10px 24px', borderRadius: '8px', textTransform: 'uppercase',
                }}>
                  Canceled
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Cover charge / tribute / genres — supplementary metadata ───── */}
        {(event.cover != null && event.cover !== 'TBA' && !isCanceled) || isTribute || genres.length > 0 ? (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px',
            marginBottom: '16px',
          }}>
            {event.cover != null && event.cover !== 'TBA' && !isCanceled && (
              <span style={{
                fontSize: '11px', fontWeight: 700,
                padding: '4px 10px', borderRadius: '999px',
                background: t.surface, color: t.textMuted,
                border: `1px solid ${t.border}`,
              }}>
                {event.cover === '0' || event.cover === 'Free'
                  ? 'Free admission'
                  : `${event.cover.toString().startsWith('$') ? '' : '$'}${event.cover} cover`}
              </span>
            )}
            {isTribute && (
              <span style={{
                fontSize: '11px', fontWeight: 700,
                padding: '4px 10px', borderRadius: '999px',
                background: 'rgba(232,114,42,0.12)', color: t.accent,
                border: `1px solid rgba(232,114,42,0.3)`,
              }}>
                Tribute
              </span>
            )}
            {genres.map(g => (
              <span key={g} style={{
                fontSize: '11px', fontWeight: 600,
                padding: '4px 10px', borderRadius: '999px',
                background: t.surface, color: t.textMuted,
                border: `1px solid ${t.border}`,
              }}>
                {g}
              </span>
            ))}
          </div>
        ) : null}

        {/* ── Description ───────────────────────────────────────────────── */}
        {desc && (
          <p style={{
            fontSize: '14px', color: t.textMuted, lineHeight: 1.6,
            margin: '0 0 22px',
          }}>
            {desc}
          </p>
        )}

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div style={{ height: '1px', background: t.border, margin: '0 0 16px' }} />

        {/* ── Action buttons: Save Show / Follow Artist / Venue ─────────── */}
        {!isCanceled && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Save Show — ticket-stub icon, neutral stroke (matches the
                other two so the row reads as a balanced action set). */}
            <button onClick={handleSoftCTA} style={actionBtnStyle}>
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={t.iconStroke} strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <g transform="rotate(-18 12 12)">
                  <path d="M3.5 7 L20.5 7 A1.5 1.5 0 0 1 22 8.5 L22 10 A2 2 0 0 0 22 14 L22 15.5 A1.5 1.5 0 0 1 20.5 17 L3.5 17 A1.5 1.5 0 0 1 2 15.5 L2 14 A2 2 0 0 0 2 10 L2 8.5 A1.5 1.5 0 0 1 3.5 7 Z" />
                  <line x1="8" y1="8.5" x2="8" y2="15.5" strokeDasharray="1.25 1.25" />
                </g>
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Save Show</span>
            </button>

            {/* Follow Artist — person + plus, inline SVG (no equivalent icon
                in Icons.js, and not worth adding for a single use). */}
            <button onClick={handleSoftCTA} style={actionBtnStyle}>
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={t.iconStroke} strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
                <line x1="20" y1="9" x2="20" y2="15" />
                <line x1="17" y1="12" x2="23" y2="12" />
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Follow Artist</span>
            </button>

            {/* Venue — opens Google Maps for the venue. Uses the existing
                `map` icon from Icons.js (location-pin shape). */}
            {venue && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  posthog.capture?.('venue_link_clicked', {
                    venue_name: venue,
                    artist_name: artistName,
                    event_id: event.id || '',
                    source_url: sourceLink || mapsUrl,
                  });
                }}
                style={actionBtnStyle}
              >
                <svg
                  width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={t.iconStroke} strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>Venue</span>
              </a>
            )}
          </div>
        )}

        {/* ── Soft signup hint — appears under the actions when a guest
              taps Save Show or Follow Artist. */}
        {showSignupHint && (
          <div style={{
            marginTop: '16px',
            padding: '16px', borderRadius: '12px',
            background: t.surface, border: `1px solid ${t.border}`,
          }}>
            <p style={{
              fontSize: '14px', fontWeight: 700, color: t.text,
              margin: '0 0 4px',
            }}>
              Create a free account to save shows and follow artists.
            </p>
            <p style={{
              fontSize: '12px', color: t.textDim, margin: '0 0 12px',
            }}>
              It takes 10 seconds with Google — no spam, ever.
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <a
                href="/?signup=true"
                style={{
                  padding: '10px 24px', borderRadius: '999px',
                  background: t.accent, color: '#FFFFFF',
                  textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                }}
              >
                Sign up free
              </a>
              <button
                onClick={() => setShowSignupHint(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.textDim, fontSize: '12px', fontWeight: 500,
                  textDecoration: 'underline', textUnderlineOffset: '3px',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Sticky upsell banner — for non-logged-in users. Hidden until
            auth state resolves so we don't flicker, and hidden permanently
            (per device, via localStorage) once a user dismisses it. The X
            is the bypass we want: keeps the prompt available without making
            it block the page experience for someone who just wants to read
            the event. */}
      {authReady && !isLoggedIn && !bannerDismissed && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: `linear-gradient(180deg, transparent 0%, ${t.bg} 20%)`,
          padding: '32px 16px 24px',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'relative',
            maxWidth: '560px', margin: '0 auto',
            background: t.bannerBg, borderRadius: '16px',
            border: `1px solid ${t.border}`,
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '16px',
            boxShadow: darkMode
              ? '0 -8px 32px rgba(0,0,0,0.6)'
              : '0 -8px 32px rgba(0,0,0,0.08)',
            pointerEvents: 'auto',
          }}>
            {/* Dismiss X — top-right of the banner. Sized + positioned so
                it's visibly tappable (28×28 hit target) without competing
                with the CTA. */}
            <button
              onClick={dismissBanner}
              aria-label="Dismiss"
              style={{
                position: 'absolute',
                top: '6px', right: '6px',
                width: '28px', height: '28px',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: t.textDim,
                borderRadius: '50%',
                padding: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '20px' }}>
              <p style={{
                fontSize: '14px', fontWeight: 700, color: t.text,
                margin: '0 0 2px',
              }}>
                Never miss a local jam.
              </p>
              <p style={{
                fontSize: '12px', color: t.textDim, margin: 0,
              }}>
                Sign up to track bands and save shows.
              </p>
            </div>
            <a
              href="/?signup=true"
              style={{
                padding: '10px 20px', borderRadius: '999px',
                background: t.accent, color: '#FFFFFF',
                textDecoration: 'none', fontWeight: 700, fontSize: '13px',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Create free account
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
