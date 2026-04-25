'use client';

/**
 * DuplicateEventModal — admin tool to clone one event row into N additional
 * dates, optionally linking source + new rows under one event_series row.
 *
 * Shows a read-only preview of the source event at top, then a dynamic
 * list of date+time inputs (add/remove freely). Time defaults are pulled
 * from the source event's own start time so the typical case ("same show,
 * different night") is one click + a date.
 *
 * If the source already has a series_id, the series UI is hidden — new
 * events automatically inherit the existing series. If not, a checkbox
 * lets the admin link them as a brand-new series with an editable name.
 */

import { useState, useMemo } from 'react';

function easternHHMM(iso) {
  if (!iso) return '19:00';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '19:00';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hh = parts.find(p => p.type === 'hour')?.value || '00';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    return `${hh === '24' ? '00' : hh}:${mm}`;
  } catch { return '19:00'; }
}

function easternDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  } catch { return ''; }
}

function formatPretty(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch { return ''; }
}

export default function DuplicateEventModal({
  event,
  onClose,
  onSuccess,
  password,
  showQueueToast,
}) {
  const sourceTime = useMemo(() => easternHHMM(event?.event_date), [event?.event_date]);
  const sourceDate = useMemo(() => easternDate(event?.event_date), [event?.event_date]);

  const [rows, setRows] = useState([{ key: 1, date: '', time: sourceTime }]);
  const [linkSeries, setLinkSeries] = useState(!event?.series_id);
  const [seriesName, setSeriesName] = useState(event?.artist_name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!event) return null;

  const alreadyInSeries = !!event.series_id;
  const validRows = rows.filter(r => r.date && r.time);

  const addRow = () => setRows(prev => [...prev, { key: Date.now() + Math.random(), date: '', time: sourceTime }]);
  const removeRow = (key) => setRows(prev => prev.length > 1 ? prev.filter(r => r.key !== key) : prev);
  const updateRow = (key, field, value) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));

  const handleSubmit = async () => {
    setError(null);
    if (validRows.length === 0) {
      setError('Add at least one date.');
      return;
    }
    if (validRows.some(r => r.date === sourceDate)) {
      setError(`One of the dates matches the source event's date (${sourceDate}). Pick different dates.`);
      return;
    }

    setSubmitting(true);
    try {
      // Build ISO timestamps from local date+time. The browser interprets
      // the inputs in the admin's local timezone (Eastern), and toISOString
      // converts to UTC for the DB.
      const performances = validRows.map(r => {
        const [y, mo, d] = r.date.split('-').map(Number);
        const [h, mi] = r.time.split(':').map(Number);
        return { event_date: new Date(y, mo - 1, d, h, mi).toISOString() };
      });

      const body = {
        source_event_id: event.id,
        performances,
      };
      if (linkSeries && !alreadyInSeries) {
        body.series = { create: true, name: seriesName.trim() || event.artist_name || 'Untitled Series' };
      }

      const res = await fetch('/api/admin/events/duplicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      const n = result.new_events?.length || 0;
      const seriesNote = result.series_created ? ' · linked as series' : '';
      showQueueToast?.(`\u2705 Created ${n} performance${n === 1 ? '' : 's'}${seriesNote}`);
      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="w-full max-h-[90vh] overflow-y-auto rounded-2xl border"
        style={{
          maxWidth: '560px',
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Duplicate to additional dates
          </h2>
          <button
            onClick={() => { if (!submitting) onClose(); }}
            aria-label="Close"
            disabled={submitting}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '20px', padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Source event preview */}
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{
            fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--text-muted)', marginBottom: '4px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Source event
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', fontFamily: "'DM Sans', sans-serif" }}>
            {event.artist_name || event.event_title || 'Untitled'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: "'DM Sans', sans-serif" }}>
            {event.venue_name || event.venues?.name || 'No venue'} · {formatPretty(event.event_date)}
          </div>
          {alreadyInSeries && (
            <div style={{
              marginTop: '8px', fontSize: '12px', display: 'inline-block',
              padding: '3px 10px', borderRadius: '999px',
              background: 'rgba(59,130,246,0.12)', color: '#60A5FA',
              border: '1px solid rgba(59,130,246,0.25)',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Already part of a series — new dates will join it
            </div>
          )}
        </div>

        {/* Performance dates */}
        <div className="px-6 py-5">
          <div style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            New performances
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map((r, idx) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  value={r.date}
                  onChange={e => updateRow(r.key, 'date', e.target.value)}
                  disabled={submitting}
                  style={{
                    flex: 2, padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text)', fontSize: '14px',
                    fontFamily: "'DM Sans', sans-serif", colorScheme: 'dark',
                  }}
                />
                <input
                  type="time"
                  value={r.time}
                  onChange={e => updateRow(r.key, 'time', e.target.value)}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                    color: 'var(--text)', fontSize: '14px',
                    fontFamily: "'DM Sans', sans-serif", colorScheme: 'dark',
                  }}
                />
                <button
                  onClick={() => removeRow(r.key)}
                  disabled={submitting || rows.length === 1}
                  aria-label="Remove date"
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    background: 'none', border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    cursor: rows.length === 1 ? 'not-allowed' : 'pointer',
                    opacity: rows.length === 1 ? 0.4 : 1,
                    fontSize: '16px', lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addRow}
            disabled={submitting}
            style={{
              marginTop: '10px', padding: '8px 14px', borderRadius: '8px',
              background: 'transparent', border: '1px dashed var(--border)',
              color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            + Add another date
          </button>

          {/* Series toggle (hidden if source is already in a series) */}
          {!alreadyInSeries && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: 'var(--text)', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                <input
                  type="checkbox"
                  checked={linkSeries}
                  onChange={e => setLinkSeries(e.target.checked)}
                  disabled={submitting}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>Link these as a series</span>
              </label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '26px', fontFamily: "'DM Sans', sans-serif" }}>
                Groups all performances (source + new) under one parent so the feed and admin can show them as a single show with multiple dates.
              </div>
              {linkSeries && (
                <div style={{ marginTop: '10px', marginLeft: '26px' }}>
                  <input
                    type="text"
                    value={seriesName}
                    onChange={e => setSeriesName(e.target.value)}
                    placeholder="Series name (e.g. Green Day's American Idiot)"
                    disabled={submitting}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px',
                      border: '1px solid var(--border)', background: 'var(--bg-primary)',
                      color: 'var(--text)', fontSize: '14px',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '14px', padding: '10px 12px',
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: '8px',
              fontSize: '13px', color: '#FCA5A5',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.15)' }}
        >
          <button
            onClick={() => { if (!submitting) onClose(); }}
            disabled={submitting}
            style={{
              padding: '9px 16px', borderRadius: '8px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600,
              cursor: submitting ? 'wait' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || validRows.length === 0}
            style={{
              padding: '9px 18px', borderRadius: '8px',
              background: '#E8722A', border: 'none',
              color: '#1C1917', fontSize: '14px', fontWeight: 700,
              cursor: (submitting || validRows.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (submitting || validRows.length === 0) ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {submitting
              ? 'Creating…'
              : `Create ${validRows.length || ''} performance${validRows.length === 1 ? '' : 's'}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
