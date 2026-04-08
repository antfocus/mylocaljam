'use client';

import { useState, useEffect } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

/**
 * BetaWelcome — Condensed mobile-first welcome overlay with versioned persistence.
 *
 * VERSIONED PERSISTENCE (2026-04-08):
 *   - Uses localStorage with a versioned key: `hasSeenWelcome_v1`.
 *   - Bump the version number to re-show after major updates.
 *   - Survives logout/login cycles (localStorage, not sessionStorage).
 *   - Only dismissed via the "Let's Jam" button — backdrop click and
 *     Escape key do NOT close it (pass no-op to ModalWrapper).
 *
 * UI:
 *   - Condensed copy, vibrant emoji icon wrappers with tinted backgrounds.
 *   - Dark theme, DM Sans / Outfit fonts, brand orange CTA.
 *   - z-index 9999 (above all app layers).
 */

const WELCOME_KEY = 'hasSeenWelcome_v1';

// ── Feature list with emoji color mapping ──
const FEATURES = [
  { emoji: '\uD83D\uDD0D', label: 'Discover', desc: 'Find live music, trivia, and specials happening near you.', tint: 'rgba(232, 114, 42, 0.15)' },         // orange
  { emoji: '\u2795',       label: 'Follow',   desc: 'Save favorite venues and artists for gig reminders.', tint: 'rgba(58, 173, 160, 0.15)' },                  // green/teal
  { emoji: '\uD83D\uDCE4', label: 'Share',    desc: 'Easily coordinate your night with friends.', tint: 'rgba(96, 165, 250, 0.15)' },                           // blue
  { emoji: '\uD83D\uDCAC', label: 'Feedback', desc: 'Under the Help & Feedback section in your profile.', tint: 'rgba(250, 204, 21, 0.15)' },                   // gold
];

export default function BetaWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_KEY) !== 'true') {
        setShow(true);
      }
    } catch {
      // Storage blocked — show once, won't persist
      setShow(true);
    }
  }, []);

  function handleDismiss() {
    setShow(false);
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch {}
  }

  if (!show) return null;

  // ── Theme tokens ──
  const surface   = '#1A1A24';
  const border    = '#2A2A3A';
  const text      = '#F0F0F5';
  const muted     = '#7878A0';
  const featureBg = '#22222E';
  const accent    = '#E8722A';
  const teal      = '#3AADA0';

  return (
    <ModalWrapper
      onClose={() => {}} /* No-op: backdrop click and Escape do NOT dismiss */
      zIndex={9999}
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
        {/* Header: branded wordmark + tagline */}
        <h2 style={{
          margin: '0 0 4px',
          fontSize: '22px',
          fontWeight: 800,
          fontFamily: "'Outfit', sans-serif",
          lineHeight: 1.3,
        }}>
          <span style={{ color: text }}>my</span>
          <span style={{ color: accent }}>local</span>
          <span style={{ color: teal }}>jam</span>
          <span style={{ color: muted, fontWeight: 400, fontSize: '14px' }}>
            {': '}
          </span>
          <span style={{ color: text, fontWeight: 400, fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}>
            Your local scene, all in one spot.
          </span>
        </h2>

        {/* Beta badge */}
        <div style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: '100px',
          background: 'rgba(232, 114, 42, 0.15)',
          color: accent,
          fontSize: '11px',
          fontWeight: 800,
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '1px',
          marginTop: '12px',
          marginBottom: '16px',
          border: '1px solid rgba(232, 114, 42, 0.3)',
        }}>
          OFFICIALLY IN BETA
        </div>

        {/* Body — personal story */}
        <p style={{
          margin: '0 0 12px',
          fontSize: '13.5px',
          fontFamily: "'DM Sans', sans-serif",
          color: text,
          lineHeight: 1.65,
        }}>
          Thank you for being an early supporter. I built this platform because I was frustrated with having to search multiple sites just to find out what was going on. I wanted to bring the entire scene together in one spot, so you never have to miss out on what{'\u2019'}s happening locally.
        </p>

        {/* Territory */}
        <p style={{
          margin: '0 0 18px',
          fontSize: '13px',
          fontFamily: "'DM Sans', sans-serif",
          color: muted,
          lineHeight: 1.65,
        }}>
          Right now, I am focused on the Jersey Shore{'\u2014'}specifically serving Monmouth and Ocean County. As we find our rhythm and grow, I{'\u2019'}ll be expanding!
        </p>

        {/* ── Color Boost Feature List ── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '20px',
        }}>
          {FEATURES.map(({ emoji, label, desc, tint }) => (
            <div key={label} style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              padding: '10px 12px',
              borderRadius: '10px',
              background: featureBg,
            }}>
              {/* Emoji icon wrapper — tinted background matching emoji vibe */}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: tint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '16px',
                lineHeight: 1,
              }}>
                {emoji}
              </div>
              <div style={{ lineHeight: 1.5, flex: 1, minWidth: 0 }}>
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

        {/* CTA Button — only way to dismiss */}
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
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Let{'\u2019'}s Jam
        </button>
      </div>
    </ModalWrapper>
  );
}
