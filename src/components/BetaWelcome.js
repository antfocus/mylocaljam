'use client';

import { useState, useEffect } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

/**
 * BetaWelcome — Mobile-first welcome overlay with versioned persistence.
 *
 * VERSION 2 — FINAL COPY (2026-04-08):
 *   - Strict text hierarchy: pure white (#FFFFFF) for all labels/headings,
 *     light grey (#D1D5DB) for all body/description text.
 *   - Stacked feature layout: [Icon] → [Column: White title, Grey desc].
 *   - Centered header, badge, and sign-off.
 *   - localStorage key: hasSeenWelcome_v2.
 *   - Only dismissed via "Let's Jam" — backdrop/Escape do nothing.
 *   - z-index 9999.
 */

const WELCOME_KEY = 'hasSeenWelcome_v2';

// ── Text hierarchy tokens ──
const WHITE = '#FFFFFF';   // labels, headings, feature names
const GREY  = '#D1D5DB';   // body text, descriptions

const FEATURES = [
  { emoji: '\uD83D\uDD0D', label: 'Discover', desc: 'Find live music, trivia, and specials happening around you.', tint: 'rgba(255, 165, 0, 0.15)' },
  { emoji: '\u2795',        label: 'Follow',   desc: 'Save your favorite venues and artists to get reminders and notifications of new gigs.', tint: 'rgba(50, 205, 50, 0.15)' },
  { emoji: '\uD83D\uDCE4',  label: 'Share',    desc: 'Easily send event details to friends to coordinate your night out.', tint: 'rgba(30, 144, 255, 0.15)' },
  { emoji: '\uD83D\uDCA1',  label: 'Ideas',    desc: 'Head to Help & Feedback section in your Profile.', tint: 'rgba(255, 215, 0, 0.15)' },
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
  const featureBg = '#22222E';
  const accent    = '#E8722A';
  const teal      = '#3AADA0';
  const font      = "'DM Sans', sans-serif";

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

        {/* ── Header — centered wordmark + tagline ── */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: "'Outfit', sans-serif",
            lineHeight: 1.2,
          }}>
            <span style={{ color: WHITE }}>my</span>
            <span style={{ color: accent }}>local</span>
            <span style={{ color: teal }}>jam</span>
          </h2>
          <p style={{
            margin: '6px 0 0',
            fontSize: '15px',
            fontWeight: 500,
            fontFamily: font,
            color: GREY,
            lineHeight: 1.4,
          }}>
            Your local scene, all in one spot.
          </p>
        </div>

        {/* ── Beta badge — centered ── */}
        <div style={{ textAlign: 'center', marginTop: '14px', marginBottom: '20px' }}>
          <span style={{
            display: 'inline-block',
            padding: '5px 16px',
            borderRadius: '100px',
            background: 'rgba(232, 114, 42, 0.2)',
            color: accent,
            fontSize: '12px',
            fontWeight: 800,
            fontFamily: font,
            letterSpacing: '1.2px',
            border: '1px solid rgba(232, 114, 42, 0.4)',
          }}>
            OFFICIALLY IN BETA!
          </span>
        </div>

        {/* ── Intro ── */}
        <p style={{
          margin: '0 0 16px',
          fontSize: '15px',
          fontFamily: font,
          color: GREY,
          lineHeight: 1.7,
        }}>
          I appreciate you being an early user and for continuing to support the local scene.
        </p>

        {/* ── The Story ── */}
        <p style={{
          margin: '0 0 16px',
          fontSize: '15px',
          fontFamily: font,
          color: GREY,
          lineHeight: 1.7,
        }}>
          <strong style={{ color: WHITE, fontWeight: 700 }}>The Story:</strong>{' '}
          I wanted to find out what was going on without having to shuffle around a bunch of different sites. I built mylocaljam to put everything in one place, letting you spend less time searching for it and more time being there!
        </p>

        {/* ── Territory ── */}
        <p style={{
          margin: '0 0 22px',
          fontSize: '15px',
          fontFamily: font,
          color: GREY,
          lineHeight: 1.7,
        }}>
          <strong style={{ color: WHITE, fontWeight: 700 }}>Territory:</strong>{' '}
          Right now, I am focused on the Jersey Shore, specifically serving Monmouth and Ocean County. As we find our rhythm and grow, I{'\u2019'}ll be expanding into new territories.
        </p>

        {/* ── Quick Features header ── */}
        <h3 style={{
          margin: '0 0 10px',
          fontSize: '15px',
          fontWeight: 700,
          fontFamily: font,
          color: WHITE,
        }}>
          Quick Features:
        </h3>

        {/* ── Color Boost Feature List — Stacked Layout ── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '22px',
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
              {/* Emoji icon wrapper — tinted background */}
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
              {/* Stacked text: title on row 1, description on row 2 */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                flex: 1,
                minWidth: 0,
                paddingTop: '1px',
              }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  fontFamily: font,
                  color: WHITE,
                  lineHeight: 1.3,
                }}>
                  {label}
                </span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 400,
                  fontFamily: font,
                  color: GREY,
                  lineHeight: 1.5,
                }}>
                  {desc}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Sign-off — centered, white ── */}
        <p style={{
          margin: '0 0 20px',
          fontSize: '15px',
          fontWeight: 700,
          fontFamily: font,
          color: WHITE,
          textAlign: 'center',
        }}>
          See you out there!
        </p>

        {/* ── CTA Button — only way to dismiss ── */}
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
            fontFamily: font,
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
