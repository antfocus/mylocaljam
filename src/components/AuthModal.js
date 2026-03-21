'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const DARK = {
  bg:       '#0D0D12',
  surface:  '#1A1A24',
  border:   '#2A2A3A',
  text:     '#F0F0F5',
  textMuted:'#7878A0',
  accent:   '#E8722A',
  inputBg:  '#22222E',
};
const LIGHT = {
  bg:       '#F7F5F2',
  surface:  '#FFFFFF',
  border:   '#E5E7EB',
  text:     '#1F2937',
  textMuted:'#6B7280',
  accent:   '#E8722A',
  inputBg:  '#F3F4F6',
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

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
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

  // ── Google sign-in via Identity Services + signInWithIdToken ──────────────
  // Renders the official Google Sign-In button which handles its own popup.
  // This works reliably on mobile — no One Tap or prompt() needed.
  const googleBtnRef = useCallback((node) => {
    if (!node) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const renderBtn = () => {
      if (!window.google?.accounts?.id) return false;

      // Set up global callback for the credential response
      window.__handleGoogleCredential = async (response) => {
        try {
          const { data, error: idTokenError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
          });
          if (idTokenError) throw idTokenError;
          // Success — onAuthStateChange in page.js will close the modal
        } catch (err) {
          setError(err.message || 'Google sign-in failed. Please try again.');
        }
      };

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: window.__handleGoogleCredential,
        ux_mode: 'popup',
      });

      window.google.accounts.id.renderButton(node, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: node.offsetWidth || 380,
      });
      return true;
    };

    // Script may already be loaded
    if (renderBtn()) return;

    // Poll until the script loads
    const check = setInterval(() => {
      if (renderBtn()) clearInterval(check);
    }, 200);

    // Clean up after 10s max
    setTimeout(() => clearInterval(check), 10000);
  }, []);

  // ── Apple OAuth — still uses redirect flow (no equivalent client-side SDK) ─
  const handleAppleOAuth = async () => {
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  // ── Magic link handler ─────────────────────────────────────────────────────
  const handleMagicLink = async (e) => {
    e.preventDefault();
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
    } catch (err) {
      setError(err.message || 'Could not send login link. Please try again.');
    } finally {
      setSending(false);
    }
  };

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
    transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
    transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
    width: '100%', maxWidth: '480px',
    maxHeight: '85vh', overflowY: 'auto',
    background: t.surface,
    borderRadius: '20px 20px 0 0',
    zIndex: 10000,
    paddingBottom: 'env(safe-area-inset-bottom, 20px)',
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
                  background: t.accent, color: 'white', fontWeight: 700, fontSize: '15px',
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Main auth view ─────────────────────────────────────────────────────────
  return (
    <>
      <div style={backdropStyle} onClick={handleClose} />
      <div style={sheetStyle}>
        <div style={{ padding: '24px' }}>
          {/* Drag handle */}
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.border, margin: '0 auto 20px' }} />

          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '20px', color: t.textMuted, padding: '4px',
            }}
          >
            ✕
          </button>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h2 style={{
              fontSize: '22px', fontWeight: 800, color: t.text, margin: '0 0 6px',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {headerText}
            </h2>
            <p style={{ fontSize: '14px', color: t.textMuted, margin: 0, lineHeight: 1.5 }}>
              {subtitleText}
            </p>
          </div>

          {/* OAuth buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {/* Google Sign-In — rendered by Google Identity Services SDK */}
            <div
              ref={googleBtnRef}
              style={{
                width: '100%',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            />
            <button
              onClick={handleAppleOAuth}
              style={oauthBtnStyle(darkMode ? '#FFFFFF' : '#000000', darkMode ? '#000000' : '#FFFFFF')}
            >
              <svg width="16" height="18" viewBox="0 0 16 20" fill={darkMode ? '#000' : '#fff'} xmlns="http://www.w3.org/2000/svg">
                <path d="M13.545 10.239c-.022-2.233 1.823-3.305 1.905-3.356-.037-.054-1.495-2.171-3.822-2.171-1.627 0-2.91.973-3.694.973-.804 0-2.005-.948-3.316-.923C2.757 4.789.935 5.887.935 8.574c0 2.842 2.04 7.294 3.682 7.294.966-.024 1.826-.693 2.614-.693.773 0 1.566.693 2.646.67 1.078-.024 1.95-.979 2.89-2.927.568-1.105.798-2.168.817-2.222-.018-.008-2.054-.816-2.039-3.457z"/>
                <path d="M11.152 3.294c.686-.857 1.154-2.025 1.025-3.211-.99.043-2.217.695-2.926 1.529-.633.74-1.198 1.948-1.05 3.09 1.112.087 2.254-.568 2.951-1.408z"/>
              </svg>
              Continue with Apple
            </button>
          </div>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px',
          }}>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
            <span style={{ fontSize: '12px', color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              or
            </span>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
          </div>

          {/* Magic Link */}
          <form onSubmit={handleMagicLink}>
            <label style={{
              display: 'block', fontSize: '13px', fontWeight: 600, color: t.textMuted,
              marginBottom: '6px', fontFamily: "'DM Sans', sans-serif",
            }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={sending || !email.trim()}
              style={{
                display: 'block', width: '100%', marginTop: '12px',
                padding: '14px', borderRadius: '12px', border: 'none',
                background: t.accent, color: 'white',
                fontSize: '15px', fontWeight: 700, cursor: sending ? 'wait' : 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                opacity: (!email.trim() || sending) ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {sending ? 'Sending...' : 'Send Login Link'}
            </button>
          </form>

          {/* Error message */}
          {error && (
            <p style={{
              marginTop: '12px', fontSize: '13px', color: '#EF4444',
              textAlign: 'center', lineHeight: 1.4,
            }}>
              {error}
            </p>
          )}

          {/* Fine print */}
          <p style={{
            marginTop: '20px', fontSize: '11px', color: t.textMuted,
            textAlign: 'center', lineHeight: 1.5, paddingBottom: '8px',
          }}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </>
  );
}
