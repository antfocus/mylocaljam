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

// v3: bumped so returning users see the refreshed welcome (new logo, shorter
// copy, Spotlight feature). If beta is winding down and you don't want existing
// users to see the modal again, revert this to 'hasSeenWelcome_v2'.
const WELCOME_KEY = 'hasSeenWelcome_v3';

// ── Text hierarchy tokens ──
const WHITE = '#FFFFFF';   // labels, headings, feature names
const GREY  = '#D1D5DB';   // body text, descriptions

const FEATURES = [
  { emoji: '\u26A1',        label: 'Spotlight', desc: "Tonight's featured show, curated daily — don't miss it.", tint: 'rgba(232, 114, 42, 0.2)' },
  { emoji: '\uD83D\uDD0D', label: 'Discover',  desc: 'Find live music, trivia, and specials happening around you.', tint: 'rgba(255, 165, 0, 0.15)' },
  { emoji: null, svg: true, label: 'Follow',    desc: 'Save your favorite venues and artists to get reminders and notifications of new gigs.', tint: 'rgba(232, 114, 42, 0.15)' },
  { emoji: '\uD83D\uDCF2', label: 'Share',     desc: 'Easily send event details to friends to coordinate your night out.', tint: 'rgba(30, 144, 255, 0.15)' },
  { emoji: '\uD83D\uDCA1', label: 'Ideas',     desc: 'Head to the Help & Feedback section in your Profile.', tint: 'rgba(255, 215, 0, 0.15)' },
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
  const font      = "'DM Sans', sans-serif";

  return (
    <ModalWrapper
      onClose={() => {}}
      zIndex={9999}
      blur={12}
      overlayBg="rgba(0,0,0,0.55)"
      maxWidth="420px"
      // dvh (dynamic viewport height) reflects the currently visible viewport.
      // Plain `vh` on iOS Safari resolves against the *largest* viewport (URL
      // bar hidden), so 90vh was taller than the visible area when the URL bar
      // is up, hiding the "Let's Jam" CTA behind the Safari chrome. dvh shrinks
      // when the URL bar appears, keeping the modal fully on-screen.
      maxHeight="90dvh"
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
      {/* ── Accent stripe — solid brand orange (was orange→teal gradient, teal retired) ── */}
      <div style={{
        height: '4px',
        background: accent,
        flexShrink: 0,
      }} />

      {/* ── Scrollable content + sticky button wrapper ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        // Match the outer ModalWrapper's dvh — see explanation on the
        // maxHeight prop above. Subtracting 4px for the accent stripe.
        maxHeight: 'calc(90dvh - 4px)',
      }}>
      {/* ── Scrollable content ── */}
      <div style={{
        padding: '28px 24px 0',
        overflowY: 'auto',
        flex: 1,
        minHeight: 0,
        WebkitOverflowScrolling: 'touch',
      }}>

        {/* ── Header — logo (smaller, supporting) + tagline (hero) ── */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          {/* Logo — matches the site header wordmark: Outfit 900, white "myLocal"
              + Outfit italic orange "Jam". No more teal. Kept smaller so the
              tagline below can earn the focus position. */}
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '22px',
            fontWeight: 900,
            letterSpacing: '-0.035em',
            lineHeight: 1,
          }}>
            <span style={{ color: WHITE }}>myLocal</span>
            <span style={{ fontStyle: 'italic', color: accent }}>Jam</span>
          </div>
          {/* Tagline — hero of the modal. Bigger, white, tight line-height. */}
          <p style={{
            margin: '14px 0 0',
            fontSize: '22px',
            fontWeight: 600,
            fontFamily: font,
            color: WHITE,
            lineHeight: 1.25,
          }}>
            Your local music source,<br />all in one spot.
          </p>
        </div>

        {/* ── Beta badge — centered. Solid orange bg + white text so it
              actually pops on the dark surface (was tinted-orange-on-orange
              which read as low contrast). */}
        <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '22px' }}>
          <span style={{
            display: 'inline-block',
            padding: '7px 18px',
            borderRadius: '100px',
            background: accent,
            color: WHITE,
            fontSize: '14px',
            fontWeight: 900,
            fontFamily: font,
            letterSpacing: '1px',
          }}>
            OFFICIALLY IN BETA!
          </span>
        </div>

        {/* ── Intro — shortened to one line, no "My Story" paragraph ── */}
        <p style={{
          margin: '0 0 22px',
          fontSize: '16px',
          fontFamily: font,
          color: GREY,
          lineHeight: 1.55,
        }}>
          Thanks for being an early user and supporting the local music scene.
        </p>

        {/* ── Territory header — kept the headline but dropped the explanation.
            "Currently serving Monmouth and Ocean Counties..." was removed
            per Apr 25 redesign for vertical-space reasons; "Territory:
            Jersey Shore" stays as a one-line scope statement. */}
        <p style={{
          margin: '0 0 22px',
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: font,
          color: WHITE,
          lineHeight: 1.4,
        }}>
          Territory: Jersey Shore
        </p>

        {/* ── Quick Features header ── */}
        <h3 style={{
          margin: '0 0 12px',
          fontSize: '16px',
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
          {FEATURES.map(({ emoji, svg, label, desc, tint }) => (
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
                {svg ? (
                  /* Follow → ticket-stub icon (matches the Save Show icon
                      used elsewhere — the universal "saved show" affordance). */
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke={WHITE} strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round">
                    <g transform="rotate(-18 12 12)">
                      <path d="M3.5 7 L20.5 7 A1.5 1.5 0 0 1 22 8.5 L22 10 A2 2 0 0 0 22 14 L22 15.5 A1.5 1.5 0 0 1 20.5 17 L3.5 17 A1.5 1.5 0 0 1 2 15.5 L2 14 A2 2 0 0 0 2 10 L2 8.5 A1.5 1.5 0 0 1 3.5 7 Z" />
                      <line x1="8" y1="8.5" x2="8" y2="15.5" strokeDasharray="1.25 1.25" />
                    </g>
                  </svg>
                ) : (
                  <span>{emoji}</span>
                )}
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
                  fontSize: '16px',
                  fontWeight: 700,
                  fontFamily: font,
                  color: WHITE,
                  lineHeight: 1.3,
                }}>
                  {label}
                </span>
                <span style={{
                  fontSize: '14px',
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
          margin: '0 0 22px',
          fontSize: '17px',
          fontWeight: 700,
          fontFamily: font,
          color: WHITE,
          textAlign: 'center',
        }}>
          See you out there!
        </p>

      </div>

      {/* ── CTA Button — sticky at bottom, always visible.
            White text on orange (was dark text — hard to read). */}
      <div style={{
        padding: '12px 24px 24px',
        flexShrink: 0,
        background: surface,
      }}>
        <button
          onClick={handleDismiss}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            background: accent,
            color: WHITE,
            fontSize: '17px',
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
      </div>
    </ModalWrapper>
  );
}
