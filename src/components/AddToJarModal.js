'use client';

import { useState } from 'react';
import ModalWrapper from '@/components/ui/ModalWrapper';

const TAG_OPTIONS = ['LIVE MUSIC', 'FREE', '21+', 'ALL AGES', 'OUTDOOR', 'HAPPY HOUR', 'DJ', 'OPEN MIC'];

export default function AddToJarModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    venue_name: '',
    date: '',
    time: '',
    artists: '',
    description: '',
    website: '',
    tags: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const toggleTag = (tag) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  };

  const handleSubmit = async () => {
    if (!form.venue_name || !form.date || !form.artists) {
      alert('Please fill in venue, date, and artists/bands.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_name: form.artists,
          venue_name: form.venue_name,
          event_date: form.date,
          event_time: form.time,
          artist_bio: form.description,
          notes: `Website: ${form.website}\nTags: ${form.tags.join(', ')}`,
        }),
      });
      if (res.ok) {
        onSubmit?.();
        onClose();
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-elevated)',
    border: '1.5px solid var(--border)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <ModalWrapper
      onClose={onClose}
      zIndex={2000}
      blur={8}
      maxWidth="540px"
      maxHeight="85vh"
      padding="0"
      cardStyle={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
      }}
    >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h2 className="font-heading" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              🫙 Add to the Jar
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Share a local event with the community
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              fontSize: '16px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >
            ✕
          </button>
        </div>

        {/* Form body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Venue Name */}
          <div>
            <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Venue Name *
            </label>
            <input
              style={inputStyle}
              placeholder="e.g. The Stone Pony"
              value={form.venue_name}
              onChange={e => update('venue_name', e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Date & Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Date *
              </label>
              <input
                type="date"
                style={inputStyle}
                value={form.date}
                onChange={e => update('date', e.target.value)}
                onClick={e => { try { e.target.showPicker(); } catch {} }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent-teal)'; try { e.target.showPicker(); } catch {} }}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Time
              </label>
              <input
                type="time"
                style={inputStyle}
                value={form.time}
                onChange={e => update('time', e.target.value)}
                onFocus={e => e.target.style.borderColor = 'var(--accent-teal)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          {/* Artists/Bands */}
          <div>
            <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Artists / Bands *
            </label>
            <input
              style={inputStyle}
              placeholder="e.g. The Gaslight Anthem, Bruce & The Band"
              value={form.artists}
              onChange={e => update('artists', e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Description
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
              placeholder="Tell us about this event..."
              value={form.description}
              onChange={e => update('description', e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Website/Link */}
          <div>
            <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Website / Link
            </label>
            <input
              type="url"
              style={inputStyle}
              placeholder="https://..."
              value={form.website}
              onChange={e => update('website', e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent-teal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="font-heading" style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Tags
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {TAG_OPTIONS.map(tag => {
                const active = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: active ? 'none' : '1.5px solid var(--border)',
                      background: active ? 'var(--accent-teal)' : 'var(--bg-elevated)',
                      color: active ? 'white' : 'var(--text-muted)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-glow font-heading"
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: submitting ? 'var(--text-muted)' : 'var(--accent-teal)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              marginTop: '8px',
            }}
          >
            {submitting ? 'Submitting...' : '🫙 Add to the Jar'}
          </button>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Submissions are reviewed before going live. Thank you for helping the community!
          </p>
        </div>
    </ModalWrapper>
  );
}
