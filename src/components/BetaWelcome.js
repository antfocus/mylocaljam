'use client';

import { useState, useEffect } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

const SESSION_KEY = 'hasSeenWelcomeNote';

/**
 * BetaWelcome — Full-screen glassmorphism welcome overlay for the beta launch.
 *
 * HARD STOP SAFETY GATE:
 *   Only renders when NEXT_PUBLIC_APP_ENV === 'staging'.
 *   Returns null in production — completely invisible.
 *
 * LOGIC (session-based):
 *   Uses sessionStorage (not localStorage). Appears once per browser session.
 *   Closing the tab or logging out resets it so it appears on next visit.
 *   Clicking "Let's Jam" hides it for the remainder of that session.
 *
 * UI:
 *   Matches the existing Help & Feedback modal — dark rounded container,
 *   DM Sans / Outfit fonts, Material Design inline SVG icons (no emojis).
 *   Uses ModalWrapper for backdrop-blur, scroll-lock, escape-to-dismiss.
 */

// ── Inline SVG Icons (exact copies from the codebase) ──────────────────────

function SearchIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={color} />
    </svg>
  );
}

function FollowIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" fill="none" />
      <line x1="12" y1="8" x2="12" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShareIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" fill={color} />
    </svg>
  );
}

function FeedbackIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" fill={color} />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BetaWelcome() {
  const [show, setShow] = useState(false);

  // HARD STOP: staging-only gate
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging';

  useEffect(() => {
    if (!isStaging) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) !== 'true') {
        setShow(true);
      }
    } catch {
      // Private browsing or storage blocked — show once, won't persist
      setShow(true);
    }
  }, [isStaging]);

  function handleDismiss() {
    setShow(false);
    try { sessionStorage.setItem(SESSION_KEY, 'true'); } catch {}
  }

  // Safety gate: invisible in production
  if (!isStaging || !show) return null;

  // ── Theme tokens (dark-only, matches Help & Feedback / SupportModal) ──
  const surface   = '#1A1A24';
  const border    = '#2A2A3A';
  const text      = '#F0F0F5';
  const muted     = '#7878A0';
  const featureBg = '#22222E';
  const accent    = '#E8722A';
  const teal      = '#3AADA0';
  const iconColor = '#9898B8';

  const features = [
    { Icon: SearchIcon,   label: 'Discover', desc: 'Find live music, trivia, and specials happening near you.' },
    { Icon: FollowIcon,   label: 'Follow',   desc: 'Save favorite venues and artists for gig reminders and notifications.' },
    { Icon: ShareIcon,    label: 'Share',    desc: 'Easily send event details to friends to coordinate your night out.' },
    { Icon: FeedbackIcon, label: 'Feedback', desc: "I\u2019m still learning! If you see a missing venue or have an idea, head to the Help & Feedback section under your Profile tab and let me know." },
  ];

  return (
    <ModalWrapper
      onClose={handleDismiss}
      zIndex={700}
      blur={12}
      overlayBg="rgba(0,0,0,0.55)"
      maxWidth="420px"
      maxHeight="90vh"
      padding="0"
      cardStyle={{
        background: surface,
        borderRadius: '20px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        border: `1px solid ${border}`,
        width: '92%',
      }}
    >
      {/* ── Accent gradient bar ── */}
      <div style={{
        height: '4px',
        background: `linear-gradient(90deg, ${accent}, ${teal})`,
        flexShrink: 0,
      }} />

      {/* ── Scrollable content ── */}
      <div style={{
        padding: '24px 22px 20px',
        overflowY: 'auto',
        maxHeight: 'calc(90vh - 4px)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Title */}
        <h2 style={{
          margin: '0 0 4px',
          fontSize: '22px',
          fontWeight: 800,
          fontFamily: "'Outfit', sans-serif",
          lineHeight: 1.3,
        }}>
          <span style={{ color: text }}>my</span>
          <span style={{ color: accent }}>Local</span>
          <span style={{ color: teal }}>Jam</span>
        </h2>
        <p style={{
          margin: '0 0 18px',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          color: muted,
        }}>
          Your local scene, all in one spot.
        </p>

        {/* Beta badge */}
        <div style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: '100px',
          background: 'rgba(232, 114, 42, 0.15)',
          color: accent,
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.5px',
          marginBottom: '16px',
        }}>
          OFFICIALLY IN BETA
        </div>

        {/* Intro */}
        <p style={{
          margin: '0 0 14px',
          fontSize: '14px',
          fontFamily: "'DM Sans', sans-serif",
          color: text,
          lineHeight: 1.6,
        }}>
          Thanks for being an early user and for supporting the local scene.
        </p>

        {/* The Story */}
        <p style={{
          margin: '0 0 14px',
          fontSize: '13px',
          fontFamily: "'DM Sans', sans-serif",
          color: muted,
          lineHeight: 1.65,
        }}>
          <strong style={{ color: text, fontWeight: 700 }}>The Story:</strong>{' '}
          I was frustrated with how hard it was to keep track of everything going on around town, so I decided to do something about it. I built mylocaljam to bring the whole scene into one place, letting you spend less time searching and more time out on the town.
        </p>

        {/* The Territory */}
        <p style={{
          margin: '0 0 20px',
          fontSize: '13px',
          fontFamily: "'DM Sans', sans-serif",
          color: muted,
          lineHeight: 1.65,
        }}>
          <strong style={{ color: text, fontWeight: 700 }}>The Territory:</strong>{' '}
          {"Right now, I am focused on the Jersey Shore, specifically serving Monmouth and Ocean County. As we find our rhythm and grow, I\u2019ll be expanding into new territories."}
        </p>

        {/* Quick Features — with real SVG icons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '20px',
        }}>
          {features.map(({ Icon, label, desc }) => (
            <div key={label} style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              padding: '10px 12px',
              borderRadius: '10px',
              background: featureBg,
            }}>
              <div style={{ marginTop: '1px' }}>
                <Icon color={iconColor} />
              </div>
              <div style={{ lineHeight: 1.5 }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  color: text,
                }}>{label}: </span>
                <span style={{
                  fontSize: '13px',
                  fontFamily: "'DM Sans', sans-serif",
                  color: muted,
                }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sign-off */}
        <p style={{
          margin: '0 0 20px',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          color: teal,
        }}>
          See you out there!
        </p>

        {/* CTA Button */}
        <button
          onClick={handleDismiss}
          style={{
            display: 'block',
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: accent,
            color: '#1C1917',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: 'pointer',
            letterSpacing: '0.3px',
          }}
        >
          {"Let\u2019s Jam"}
        </button>
      </div>
    </ModalWrapper>
  );
}
