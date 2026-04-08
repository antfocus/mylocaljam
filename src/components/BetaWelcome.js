'use client';

import { useState, useEffect } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

/**
 * BetaWelcome — Mobile-first welcome overlay with versioned persistence.
 *
 * VERSION 2 (2026-04-08):
 *   - Bumped key to `hasSeenWelcome_v2` so existing users see the new copy.
 *   - Centered header, larger typography, energetic badge.
 *   - Color Boost emoji wrappers retained from v1.
 *   - localStorage persistence survives logout/login.
 *   - Only dismissed via "Let's Jam" — backdrop/Escape do nothing.
 *   - z-index 9999.
 */

const WELCOME_KEY = 'hasSeenWelcome_v2';

const FEATURES = [
  { emoji: '\uD83D\uDD0D', label: 'Discover', desc: 'Find live music, trivia, and specials happening around you.', tint: 'rgba(232, 114, 42, 0.15)' },
  { emoji: '\u2795',        label: 'Follow',   desc: 'Save your favorite venues and artists to get reminders and notifications of new gigs.', tint: 'rgba(58, 173, 160, 0.15)' },
  { emoji: '\uD83D\uDCE4',  label: 'Share',    desc: 'Easily send event details to friends to coordinate your night out.', tint: 'rgba(96, 165, 250, 0.15)' },
  { emoji: '\uD83D\uDCA1',  label: 'Ideas',    desc: 'Head to Help & Feedback section in your Profile.', tint: 'rgba(250, 204, 21, 0.15)' },
];

export default function BetaWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_KEY) !== 'true') {
        setShow(true);
      }
    } catch {
      setShow(true);
    }
  }, []);

  function handleDismiss() {
    setShow(false);
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch {}
  }

  if (!show) return null;

  const surface   = '#1A1A24';
  const border    = '#2A2A3A';
  const text      = '#F0F0F5';
  const muted     = '#9898B8';
  const featureBg = '#22222E';
  const accent    = '#E8722A';
  const teal      = '#3AADA0';

  return (
    <ModalWrapper
      onClose={() => {}}
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
        padding: '28px 24px 24px',
        overflowY: 'auto',
        maxHeight: 'calc(90vh - 4px)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Header — centered branded wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: "'Outfit', sans-serif",
            lineHeight: 1.2,
          }}>
            <span style={{ color: text }}>my</span>
            <span style={{ color: accent }}>local</span>
            <span style={{ color: teal }}>jam</span>
          </h2>
          <p style={{
            margin: '6px 0 0',
            fontSize: '15px',
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            color: muted,
            lineHeight: 1.4,
          }}>
            Your local scene, all in one spot.
          </p>
        </div>

        {/* Beta badge — centered, energetic */}
        <div style={{ textAlign: 'center', marginTop: '14px', marginBottom: '18px' }}>
          <span style={{
            display: 'inline-block',
            padding: '5px 16px',
            borderRadius: '100px',
            background: 'rgba(232, 114, 42, 0.2)',
            color: accent,
            fontSize: '12px',
            fontWeight: 800,
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '1.2px',
            border: '1px solid rgba(232, 114, 42, 0.4)',
          }}>
            OFFICIALLY IN BETA!
          </span>
        </div>

        {/* Intro */}
        <p style={{
          margin: '0 0 14px',
          fontSize: '15px',
          fontFamily: "'DM Sans', sans-serif",
          color: text,
          lineHeight: 1.7,
        }}>
          I appreciate you being an early user and for continuing to support the local scene.
        </p>

        {/* The Story */}
        <p style={{
          margin: '0 0 14px',
          fontSize: '15px',
          fontFamily: "'DM Sans', sans-serif",
          color: text,
          lineHeight: 1.7,
        }}>
          I wanted to find out what was going on without having to shuffle around a bunch of different sites. I built mylocaljam to put everything in one place, letting you spend less time searching for it and more time being there!
        </p>

        {/* Territory */}
        <p style={{
          margin: '0 0 20px',
          fontSize: '14px',
          fontFamily: "'DM Sans', sans-serif",
          color: muted,
          lineHeight: 1.7,
        }}>
          Right now, I am focused on the Jersey Shore, specifically serving Monmouth and Ocean County. As we find our rhythm and grow, I{'\u2019'}ll be expanding into new territories.
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
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: tint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '17px',
                lineHeight: 1,
              }}>
                {emoji}
              </div>
              <div style={{ lineHeight: 1.55, flex: 1, minWidth: 0, paddingTop: '2px' }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  color: text,
                }}>{label}: </span>
                <span style={{
                  fontSize: '14px',
                  fontFamily: "'DM Sans', sans-serif",
                  color: muted,
                }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sign-off — centered */}
        <p style={{
          margin: '0 0 20px',
          fontSize: '15px',
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          color: teal,
          textAlign: 'center',
        }}>
          See you out there!
        </p>

        {/* CTA Button — only way to dismiss */}
        <button
          onClick={handleDismiss}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            background: accent,
            color: '#1C1917',
            fontSize: '16px',
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
