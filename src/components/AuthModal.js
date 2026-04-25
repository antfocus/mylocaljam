'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const DARK = {
  bg:        '#0D0D12',
  surface:   '#13131C',
  border:    'rgba(255,255,255,0.08)',
  borderHi:  'rgba(255,255,255,0.14)',
  text:      '#F0F0F5',
  textMuted: '#9090A8',
  accent:    '#E8722A',
  inputBg:   'rgba(255,255,255,0.04)',
};
const LIGHT = {
  bg:        '#F7F5F2',
  surface:   '#FFFFFF',
  border:    'rgba(0,0,0,0.08)',
  borderHi:  'rgba(0,0,0,0.14)',
  text:      '#1A1A24',
  textMuted: '#6B7280',
  accent:    '#E8722A',
  inputBg:   'rgba(0,0,0,0.03)',
};

/**
 * AuthModal — bottom-sheet with deferred onboarding
 *
 * Props:
 *  - darkMode: boolean
 *  - onClose: () => void
 *  - trigger: string | null — what action triggered the modal
 *      'save'    → user tapped heart
 *      'submit'  → user tapped "Add to the Jar"
 *      'profile' → user tapped Sign In on Profile tab
 *      null      → generic sign in
 */
export default function AuthModal({ darkMode = true, onClose, trigger = null }) {
  const t = darkMode ? DARK : LIGHT;

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  // Resend cooldown for magic link — prevents users from spamming the endpoint
  // but gives them an out if the email never arrives (spam filter, bounce, etc.)
  const [resendIn, setResendIn] = useState(0); // seconds until resend allowed
  const [resentNotice, setResentNotice] = useState(false);
  // Keyboard offset — on iOS, tapping the email input slides up the virtual
  // keyboard, which shrinks the visualViewport below the layout viewport. The
  // bottom-sheet is `position: fixed; bottom: 0` relative to the layout viewport,
  // so without this it gets hidden behind the keyboard. We listen for the
  // visualViewport resize event and transform the sheet up by the keyboard height.
  const [kbOffset, setKbOffset] = useState(0);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Track virtual keyboard height via visualViewport API (iOS 13+, Android).
  // Falls back gracefully on older browsers where the API doesn't exist.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height);
      setKbOffset(offset);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Dynamic header based on trigger
  const headerText = (() => {
    switch (trigger) {
      case 'save':    return 'Sign in to save events';
      case 'submit':  return 'Sign in to submit';
      case 'profile': return 'Welcome to myLocalJam';
      default:        return 'Sign in to continue';
    }
  })();

  const subtitleText = (() => {
    switch (trigger) {
      case 'save':    return 'Keep track of your favorite shows across all your devices.';
      case 'submit':  return 'Create an account to submit events to the community.';
      case 'profile': return 'Save events, follow artists, and never miss a show.';
      default:        return 'Save events, follow artists, and never miss a show.';
    }
  })();

  // ── OAuth handler ──────────────────────────────────────────────────────────
  const handleOAuth = async (provider) => {
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) throw oauthError;
      // Browser will redirect — no need to close
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  // ── Magic link handler ─────────────────────────────────────────────────────
  const sendMagicLink = useCallback(async () => {
    if (!email.trim()) return;
    setError(null);
    setSending(true);
    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (magicError) throw magicError;
      setSent(true);
      setResendIn(30); // cooldown before we allow resending
    } catch (err) {
      setError(err.message || 'Could not send login link. Please try again.');
    } finally {
      setSending(false);
    }
  }, [email]);

  const handleMagicLink = (e) => {
    e.preventDefault();
    sendMagicLink();
  };

  const handleResend = useCallback(async () => {
    await sendMagicLink();
    setResentNotice(true);
    setTimeout(() => setResentNotice(false), 3000);
  }, [sendMagicLink]);

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.3s ease',
  };

  const sheetStyle = {
    position: 'fixed', bottom: 0, left: '50%',
    // When the iOS keyboard is open, lift the sheet by its height so the email
    // input isn't hidden. Otherwise animate in from below as usual.
    transform: visible
      ? `translate(-50%, -${kbOffset}px)`
      : 'translate(-50%, 100%)',
    transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
    width: '100%', maxWidth: '480px',
    // Shrink the sheet when keyboard is open so it still fits in the visible
    // area above the keyboard (leave ~24px breathing room).
    maxHeight: kbOffset ? `calc(100vh - ${kbOffset}px - 24px)` : '85vh',
    overflowY: 'auto',
    background: t.surface,
    borderRadius: '20px 20px 0 0',
    zIndex: 10000,
    paddingBottom: kbOffset ? 0 : 'env(safe-area-inset-bottom, 20px)',
  };

  const oauthBtnStyle = (bg, color) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
    width: '100%', padding: '14px', borderRadius: '12px',
    border: `1px solid ${t.border}`, background: bg, color,
    fontSize: '15px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'opacity 0.15s',
  });

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: '12px',
    border: `1px solid ${t.border}`, background: t.inputBg,
    color: t.text, fontSize: '16px', // 16px prevents iOS zoom
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  };

  // ── Sent confirmation view ─────────────────────────────────────────────────
  if (sent) {
    return (
      <>
        <div style={backdropStyle} onClick={handleClose} />
        <div style={sheetStyle}>
          <div style={{ padding: '24px' }}>
            {/* Drag handle */}
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.border, margin: '0 auto 20px' }} />

            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>✉️</span>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: t.text, margin: '0 0 8px', fontFamily: "'DM Sans', sans-serif" }}>
                Check your email
              </h2>
              <p style={{ fontSize: '14px', color: t.textMuted, lineHeight: 1.6, margin: '0 0 24px' }}>
                We sent a login link to <strong style={{ color: t.text }}>{email}</strong>. Click the link to sign in.
              </p>
              <button
                onClick={handleClose}
                style={{
                  padding: '12px 36px', borderRadius: '999px', border: 'none',
                  background: t.accent, color: '#1C1917', fontWeight: 700, fontSize: '15px',
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Got it
              </button>
              {/* Resend — spam filter / bounce safety net. Countdown prevents abuse. */}
              <div style={{ marginTop: '20px', fontSize: '12px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                {resentNotice ? (
                  <span style={{ color: t.accent, fontWeight: 600 }}>Link resent.</span>
                ) : resendIn > 0 ? (
                  <span>Didn&apos;t get it? You can resend in {resendIn}s.</span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={sending}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: t.accent, fontSize: '12px', fontWeight: 600,
                      cursor: sending ? 'wait' : 'pointer',
                      textDecoration: 'underline', textUnderlineOffset: '3px',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {sending ? 'Resending…' : "Didn't get it? Resend"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // The title is universal — "Welcome to myLocalJam" — and lets the subtitle
  // carry the trigger-specific context. The brand wordmark rendered inline
  // in the title eats the role the standalone top-of-modal wordmark used to
  // play, so it's removed below to avoid showing the brand twice.
  const Wordmark = ({ size = 'inherit', accent }) => (
    <span style={{ fontStyle: 'normal', whiteSpace: 'nowrap', fontSize: size }}>
      <span style={{ color: t.text, fontWeight: 400 }}>my</span>
      <span style={{ color: t.text }}>Local</span>
      <span style={{ color: accent, fontStyle: 'italic' }}>Jam</span>
    </span>
  );

  // ── Main auth view ─────────────────────────────────────────────────────────
  return (
    <>
      <div style={backdropStyle} onClick={handleClose} />
      <div style={sheetStyle}>
        <div style={{ padding: '24px 24px 20px' }}>
          {/* Drag handle — single dismiss affordance. Tap-outside on the
              backdrop also closes; X removed because it competed with the
              handle for the same job. */}
          <div style={{
            width: '40px', height: '4px', borderRadius: '999px',
            background: t.border, margin: '0 auto 24px',
          }} />

          {/* Header — "Welcome to myLocalJam" with the brand wordmark rendered
              inline (myLocal + italic orange Jam) so it carries the brand
              presence without needing a separate wordmark above the title.
              Subtitle handles the trigger-specific context. */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h2 style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '26px', fontWeight: 800, color: t.text,
              margin: '0 0 8px',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
            }}>
              Welcome to <Wordmark accent={t.accent} />
            </h2>
            <p style={{
              fontSize: '14px', color: t.textMuted,
              margin: 0, lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {subtitleText}
            </p>
          </div>

          {/* Google — visual primary. White-bg pill stands out hardest on the
              dark surface; this is the path most users take, so it should
              read first. */}
          <button
            onClick={() => handleOAuth('google')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              width: '100%', padding: '15px', borderRadius: '12px',
              border: 'none', background: '#FFFFFF', color: '#1F2937',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: darkMode
                ? '0 2px 12px rgba(0,0,0,0.4)'
                : '0 1px 3px rgba(0,0,0,0.08)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.99)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider — short "OR", not "OR USE EMAIL" (the email field beneath
              makes that obvious). Hairline rules + tiny mono caps. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', margin: '20px 0',
          }}>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
            <span style={{
              fontSize: '11px', color: t.textMuted, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.15em',
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              or
            </span>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
          </div>

          {/* Magic Link — secondary path. No "Email address" label (placeholder
              does the job); orange button sits inside the same visual cluster
              as the input so the two read as one unit. Smaller padding and
              font than Google so it visually steps down. */}
          <form onSubmit={handleMagicLink}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={(e) => {
                e.target.style.borderColor = t.accent;
                e.target.style.boxShadow = `0 0 0 3px ${t.accent}33`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = t.border;
                e.target.style.boxShadow = 'none';
              }}
              placeholder="name@example.com"
              autoComplete="email"
              autoCapitalize="none"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '12px',
                border: `1px solid ${t.border}`, background: t.inputBg,
                color: t.text, fontSize: '16px', // 16px prevents iOS zoom
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            />
            <button
              type="submit"
              disabled={sending || !email.trim()}
              style={{
                display: 'block', width: '100%', marginTop: '10px',
                padding: '13px', borderRadius: '12px', border: 'none',
                background: t.accent, color: '#FFFFFF',
                fontSize: '14px', fontWeight: 700,
                cursor: sending ? 'wait' : 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                opacity: (!email.trim() || sending) ? 0.45 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {sending ? 'Sending…' : 'Send magic link'}
            </button>
          </form>

          {/* Error message */}
          {error && (
            <p style={{
              marginTop: '12px', fontSize: '13px', color: '#EF4444',
              textAlign: 'center', lineHeight: 1.4,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {error}
            </p>
          )}

          {/* Footer — Not now + legal collapsed into one tertiary cluster.
              Both are small/muted; Not now is a tap target with an underline
              affordance so it's clearly clickable, while the legal copy is
              static text below. */}
          <div style={{
            marginTop: '22px', textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <button
              onClick={handleClose}
              style={{
                background: 'none', border: 'none', padding: '6px 12px',
                color: t.textMuted, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: '3px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Not now
            </button>
            <p style={{
              marginTop: '10px', marginBottom: 0,
              fontSize: '11px', color: t.textMuted,
              lineHeight: 1.5,
            }}>
              By continuing, you agree to our{' '}
              <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}>Terms</a>
              {' '}and{' '}
              <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}>Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
