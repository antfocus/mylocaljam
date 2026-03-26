'use client';

import { useState, useEffect, useCallback } from 'react';

const DARK = {
  bg:       '#0D0D12',
  surface:  '#1A1A24',
  border:   '#2A2A3A',
  text:     '#F0F0F5',
  textMuted:'#7878A0',
  accent:   '#E8722A',
};
const LIGHT = {
  bg:       '#F7F5F2',
  surface:  '#FFFFFF',
  border:   '#E5E7EB',
  text:     '#1F2937',
  textMuted:'#6B7280',
  accent:   '#E8722A',
};

/**
 * WelcomeModal — Soft welcome gate for first-time visitors.
 *
 * Props:
 *  - darkMode: boolean
 *  - onSignIn: () => void  — opens the Auth Modal
 *  - onDismiss: () => void — closes this modal and marks as seen
 */
export default function WelcomeModal({ darkMode = true, onSignIn, onDismiss }) {
  const t = darkMode ? DARK : LIGHT;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const handleSignIn = useCallback(() => {
    setVisible(false);
    setTimeout(onSignIn, 300);
  }, [onSignIn]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Modal card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: visible
          ? 'translate(-50%, -50%) scale(1)'
          : 'translate(-50%, -50%) scale(0.95)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease',
        width: 'calc(100% - 48px)', maxWidth: '380px',
        background: t.surface,
        borderRadius: '20px',
        zIndex: 9999,
        overflow: 'hidden',
        boxShadow: darkMode
          ? '0 24px 80px rgba(0,0,0,0.6)'
          : '0 24px 80px rgba(0,0,0,0.15)',
      }}>
        {/* Gradient accent bar */}
        <div style={{
          height: '4px',
          background: 'linear-gradient(90deg, #E8722A, #3AADA0)',
        }} />

        <div style={{ padding: '32px 28px 28px', textAlign: 'center' }}>
          {/* Icon */}
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '16px' }}>🎸</span>

          {/* Heading */}
          <h2 style={{
            fontSize: '22px', fontWeight: 800, color: t.text, margin: '0 0 8px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Don't miss out.
          </h2>

          {/* Subtext */}
          <p style={{
            fontSize: '14px', color: t.textMuted, lineHeight: 1.6,
            margin: '0 0 28px', fontFamily: "'DM Sans', sans-serif",
          }}>
            Create a free account to follow your favorite local bands, save events, and get weekend lineup alerts.
          </p>

          {/* Primary CTA */}
          <button
            onClick={handleSignIn}
            style={{
              display: 'block', width: '100%', padding: '14px',
              borderRadius: '12px', border: 'none',
              background: t.accent, color: '#1C1917',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: '10px',
            }}
          >
            Sign In / Create Account
          </button>

          {/* Secondary CTA */}
          <button
            onClick={handleDismiss}
            style={{
              display: 'block', width: '100%', padding: '14px',
              borderRadius: '12px',
              border: `1px solid ${t.border}`,
              background: 'transparent', color: t.textMuted,
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: '16px',
            }}
          >
            Browse as Guest
          </button>

          {/* Disclaimer */}
          <p style={{
            fontSize: '11px', color: t.textMuted, lineHeight: 1.5,
            margin: 0, fontFamily: "'DM Sans', sans-serif",
            opacity: 0.7,
          }}>
            Guest saves are tied to this browser and will not sync across devices.
          </p>
        </div>
      </div>
    </>
  );
}
