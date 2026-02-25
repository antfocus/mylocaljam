'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/utils';
import { Icons } from './Icons';

export default function ReportIssueModal({ event, onClose, onSubmit }) {
  const [issue, setIssue] = useState('');
  const [type, setType] = useState('inaccurate');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!issue.trim()) {
      alert('Please describe the issue.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          issue_type: type,
          description: issue,
        }),
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
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display font-bold text-lg">Report an Issue</h2>
          <button className="p-1 rounded-md text-brand-text-muted hover:text-brand-text transition-colors" onClick={onClose}>{Icons.x}</button>
        </div>

        <div className="p-6 space-y-4">
          {event && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--bg-card)' }}>
              <strong>{event.artist_name}</strong> at {event.venue_name || event.venues?.name} — {formatDate(event.event_date)}
            </div>
          )}

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Issue Type</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="inaccurate">Information is inaccurate</option>
              <option value="cancelled">Event was cancelled</option>
              <option value="time_changed">Time/date changed</option>
              <option value="duplicate">Duplicate event</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Details *</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '100px' }} placeholder="What's wrong? What's the correct info?" value={issue} onChange={(e) => setIssue(e.target.value)} />
          </div>

          <button
            className="w-full py-3 rounded-xl font-display font-semibold text-[15px] text-white transition-colors"
            style={{ background: submitting ? '#999' : 'var(--accent)' }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
