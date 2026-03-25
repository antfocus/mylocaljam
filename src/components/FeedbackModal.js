'use client';

import { useState, useRef, useCallback } from 'react';

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

export default function FeedbackModal({ onClose, darkMode = true, userEmail = null }) {
  const t = darkMode ? DARK : LIGHT;
  const submittedRef = useRef(false);

  const [rating, setRating] = useState(null);
  const [feedbackType, setFeedbackType] = useState('general'); // 'general' | 'bug' | 'feature'
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClose = useCallback(() => {
    setRating(null);
    setFeedbackType('general');
    setMessage('');
    setSubmitting(false);
    setSuccess(false);
    submittedRef.current = false;
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (submitting || submittedRef.current) return;
    if (!rating && !message.trim()) {
      alert('Please give a rating or write some feedback.');
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          type: feedbackType,
          message: message.trim() || null,
          email: userEmail,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSuccess(true);
      setTimeout(handleClose, 1800);
    } catch (err) {
      alert('Could not submit feedback. Please try again.');
      submittedRef.current = false;
    }
    setSubmitting(false);
  };

  // Scroll input into view on iOS
  const scrollFieldIntoView = (e) => {
    setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '420px',
          margin: '0 16px',
          background: t.surface,
          borderRadius: '20px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Success State */}
        {success ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#10024;</div>
            <p style={{ fontSize: '18px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
              Thanks for the feedback!
            </p>
            <p style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif", marginTop: '8px' }}>
              Your input helps us make myLocalJam better.
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
                  Help us tune the app
                </h2>
                <p style={{
                  fontSize: '13px', color: t.textMuted,
                  fontFamily: "'DM Sans', sans-serif", margin: '4px 0 0',
                }}>
                  Quick feedback to make your experience better
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
              {/* Emoji Rating Scale */}
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

              {/* Bug / Feature Toggle */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block', fontSize: '12px', fontWeight: 700,
                  color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: '8px',
                }}>
                  What kind of feedback?
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { key: 'general', label: 'General' },
                    { key: 'bug', label: 'Bug Report' },
                    { key: 'feature', label: 'Feature Idea' },
                  ].map(opt => {
                    const active = feedbackType === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setFeedbackType(opt.key)}
                        style={{
                          flex: 1,
                          padding: '10px 8px', borderRadius: '10px',
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
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Text Area */}
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
                  placeholder={
                    feedbackType === 'bug'
                      ? "What happened? What did you expect?"
                      : feedbackType === 'feature'
                      ? "What would make the app better for you?"
                      : "Anything on your mind..."
                  }
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
                  color: 'white', fontWeight: 700, fontSize: '15px',
                  cursor: submitting ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: submitting ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {submitting ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
