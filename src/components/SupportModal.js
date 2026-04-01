'use client';

import { useState, useRef, useCallback } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

const DARK = {
  bg:       '#0D0D12',
  surface:  '#1A1A24',
  border:   '#2A2A3A',
  text:     '#F0F0F5',
  textMuted:'#7878A0',
  textSubtle:'#4A4A6A',
  accent:   '#E8722A',
  inputBg:  '#22222E',
};
const LIGHT = {
  bg:       '#F7F5F2',
  surface:  '#FFFFFF',
  border:   '#E5E7EB',
  text:     '#1F2937',
  textMuted:'#6B7280',
  textSubtle:'#9CA3AF',
  accent:   '#E8722A',
  inputBg:  '#F3F4F6',
};

const EMOJI_RATINGS = [
  { emoji: '\u{1F620}', label: 'Awful',   value: 1 },
  { emoji: '\u{1F641}', label: 'Meh',     value: 2 },
  { emoji: '\u{1F610}', label: 'OK',      value: 3 },
  { emoji: '\u{1F60A}', label: 'Good',    value: 4 },
  { emoji: '\u{1F929}', label: 'Love it', value: 5 },
];

const CATEGORIES = [
  { key: 'account',   label: 'Account Issue' },
  { key: 'event',     label: 'Event / Listing' },
  { key: 'bug',       label: 'Bug Report' },
  { key: 'feature',   label: 'Feature Idea' },
  { key: 'general',   label: 'General' },
];

export default function SupportModal({ onClose, darkMode = true, userEmail = null }) {
  const t = darkMode ? DARK : LIGHT;
  const submittedRef = useRef(false);

  const [rating, setRating] = useState(null);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClose = useCallback(() => {
    setRating(null);
    setCategory('general');
    setMessage('');
    setSubmitting(false);
    setSuccess(false);
    submittedRef.current = false;
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (submitting || submittedRef.current) return;
    if (!rating && !message.trim()) {
      alert('Please give a rating or describe your issue.');
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          category,
          message: message.trim() || null,
          email: userEmail,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSuccess(true);
      setTimeout(handleClose, 2000);
    } catch {
      alert('Could not send your message. Please try again.');
      submittedRef.current = false;
    }
    setSubmitting(false);
  };

  const scrollFieldIntoView = (e) => {
    setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  };

  return (
    <ModalWrapper
      onClose={handleClose}
      zIndex={200}
      overlayBg="rgba(0,0,0,0.65)"
      maxWidth="420px"
      cardStyle={{
        background: t.surface,
        borderRadius: '20px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: 0,
        margin: '0 16px',
        border: 'none',
        }}
      >
        {/* Success State */}
        {success ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ display: 'inline-block' }}>
                <circle cx="12" cy="12" r="10" fill={t.accent} opacity="0.15" />
                <path d="M9 12l2 2 4-4" stroke={t.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ fontSize: '18px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
              Message Sent!
            </p>
            <p style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif", marginTop: '8px' }}>
              Thanks for helping us improve myLocalJam.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{
                  fontSize: '18px', fontWeight: 800, color: t.text,
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>
                  Help &amp; Feedback
                </h2>
                <p style={{
                  fontSize: '13px', color: t.textMuted,
                  fontFamily: "'DM Sans', sans-serif", margin: '4px 0 0',
                }}>
                  Report an issue or tell us what you think
                </p>
              </div>
              <button onClick={handleClose} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.textMuted, fontSize: '28px', lineHeight: 1,
                padding: '8px', minWidth: '44px', minHeight: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                &times;
              </button>
            </div>

            <div style={{ padding: '20px 24px 24px' }}>
              {/* Section 1: Emoji Rating */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 700,
                  color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: '10px',
                }}>
                  How&apos;s the vibe?
                </label>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                  {EMOJI_RATINGS.map(r => {
                    const active = rating === r.value;
                    return (
                      <button
                        key={r.value}
                        onClick={() => setRating(active ? null : r.value)}
                        style={{
                          flex: 1,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          padding: '10px 4px', borderRadius: '12px',
                          border: active ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
                          background: active
                            ? (darkMode ? 'rgba(232,114,42,0.12)' : 'rgba(232,114,42,0.06)')
                            : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '24px', filter: active ? 'none' : 'grayscale(0.4)', transition: 'filter 0.15s' }}>
                          {r.emoji}
                        </span>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, color: active ? t.accent : t.textSubtle,
                          fontFamily: "'DM Sans', sans-serif",
                        }}>
                          {r.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Unified Category Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 700,
                  color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: '8px',
                }}>
                  What&apos;s this about?
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {CATEGORIES.map(cat => {
                    const active = category === cat.key;
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setCategory(cat.key)}
                        style={{
                          padding: '8px 14px', borderRadius: '10px',
                          fontSize: '13px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif",
                          cursor: 'pointer',
                          border: active ? `1.5px solid ${t.accent}` : `1px solid ${t.border}`,
                          background: active
                            ? (darkMode ? 'rgba(232,114,42,0.12)' : 'rgba(232,114,42,0.06)')
                            : 'transparent',
                          color: active ? t.accent : t.textMuted,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Message Text Area */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 700,
                  color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: '6px',
                }}>
                  Tell us more <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onFocus={scrollFieldIntoView}
                  placeholder="Describe what happened or what's on your mind..."
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: t.inputBg,
                    border: `1px solid ${t.border}`,
                    borderRadius: '10px',
                    color: t.text,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '15px',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: '80px',
                    boxSizing: 'border-box',
                    colorScheme: darkMode ? 'dark' : 'light',
                  }}
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                  background: submitting ? t.textMuted : t.accent,
                  color: '#1C1917', fontWeight: 700, fontSize: '15px',
                  cursor: submitting ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: submitting ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {submitting ? 'Sending...' : 'Send Message'}
              </button>

              {/* Email note */}
              <p style={{
                fontSize: '11px', color: t.textSubtle,
                fontFamily: "'DM Sans', sans-serif",
                textAlign: 'center', marginTop: '12px', marginBottom: 0,
              }}>
                {userEmail
                  ? `We'll reply to ${userEmail}`
                  : 'Sign in to get a personal reply'}
              </p>
            </div>
          </>
        )}
    </ModalWrapper>
  );
}
