'use client';

import { useState } from 'react';
import { GENRES, VIBES } from '@/lib/utils';
import { Icons } from './Icons';

const VENUE_OPTIONS = [
  'The Stone Pony',
  'House of Independents',
  'The Wonder Bar',
  'The Saint',
  'Asbury Lanes',
  'Danny Clinch Transparent Gallery',
];

export default function SubmitEventModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    artist_name: '',
    venue_name: '',
    event_date: '',
    event_time: '',
    genre: '',
    vibe: '',
    cover: '',
    artist_bio: '',
    notes: '',
    submitter_email: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.artist_name || !form.venue_name || !form.event_date || !form.event_time) {
      alert('Please fill in the required fields (Artist, Venue, Date, Time).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onSubmit?.();
        onClose();
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (err) {
      alert('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className="w-full max-w-[540px] max-h-[85vh] overflow-y-auto rounded-2xl border"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display font-bold text-lg">Submit an Event</h2>
          <button className="p-1 rounded-md text-brand-text-muted hover:text-brand-text transition-colors" onClick={onClose}>{Icons.x}</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist / Band Name *</label>
            <input style={inputStyle} placeholder="e.g. The Gaslight Anthem" value={form.artist_name} onChange={(e) => update('artist_name', e.target.value)} />
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Venue *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.venue_name} onChange={(e) => update('venue_name', e.target.value)}>
              <option value="">Select a venue...</option>
              {VENUE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              <option value="other">Other (specify in notes)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Date *</label>
              <input type="date" style={inputStyle} value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Time *</label>
              <input type="time" style={inputStyle} value={form.event_time} onChange={(e) => update('event_time', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Genre</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.genre} onChange={(e) => update('genre', e.target.value)}>
                <option value="">Select genre...</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Vibe</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.vibe} onChange={(e) => update('vibe', e.target.value)}>
                <option value="">Select vibe...</option>
                {VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Cover Charge</label>
            <input style={inputStyle} placeholder="e.g. Free, $10, $15" value={form.cover} onChange={(e) => update('cover', e.target.value)} />
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist Bio (optional)</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} placeholder="Tell us a bit about this artist..." value={form.artist_bio} onChange={(e) => update('artist_bio', e.target.value)} />
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Your Email (optional, for follow-up)</label>
            <input type="email" style={inputStyle} placeholder="you@email.com" value={form.submitter_email} onChange={(e) => update('submitter_email', e.target.value)} />
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Additional Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="Any other details (other venue name, ticket link, etc.)" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>

          <button
            className="w-full py-3 rounded-xl font-display font-semibold text-[15px] text-white transition-colors"
            style={{ background: submitting ? '#999' : 'var(--accent)' }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Event'}
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            Submissions are reviewed before going live. Thank you for helping the community!
          </p>
        </div>
      </div>
    </div>
  );
}
