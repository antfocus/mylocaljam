'use client';

import { useState, useEffect, useCallback } from 'react';
import { GENRES, VIBES } from '@/lib/utils';

// ── Venue list for dropdown ──────────────────────────────────────────────────
const VENUE_OPTIONS = [
  'The Stone Pony', 'House of Independents', 'The Wonder Bar',
  'The Saint', 'Asbury Lanes', 'Danny Clinch Transparent Gallery',
  'Bar Anticipation', 'The Headliner', 'Donovan\'s Reef',
  'Langosta Lounge', 'Johnny Mac\'s', 'The Osprey',
];

export default function AdminQueuePage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  // ── Queue state ─────────────────────────────────────────────────────────────
  const [queue, setQueue] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Editor form ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    artist_name: '', venue_name: '', event_date: '', event_time: '',
    genre: '', vibe: '', cover: '', ticket_link: '',
  });

  // ── Duplicate check ─────────────────────────────────────────────────────────
  const [duplicates, setDuplicates] = useState([]);
  const [dupLoading, setDupLoading] = useState(false);

  // ── Image lightbox ──────────────────────────────────────────────────────────
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  // ── Fetch queue ─────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/queue', { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) { setAuthenticated(false); return; }
      const data = await res.json();
      setQueue(data);
      if (data.length > 0) {
        setSelectedIdx(0);
        populateForm(data[0]);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [password]);

  // ── Populate editor from submission ─────────────────────────────────────────
  const populateForm = (sub) => {
    setForm({
      artist_name: sub.artist_name || '',
      venue_name: sub.venue_name || '',
      event_date: sub.event_date ? sub.event_date.substring(0, 10) : '',
      event_time: sub.event_date && sub.event_date.length > 10 ? sub.event_date.substring(11, 16) : '',
      genre: sub.genre || '',
      vibe: sub.vibe || '',
      cover: sub.cover || '',
      ticket_link: sub.ticket_link || '',
    });
    setDuplicates([]);
  };

  // ── Select a queue item ─────────────────────────────────────────────────────
  const selectItem = (idx) => {
    setSelectedIdx(idx);
    if (queue[idx]) populateForm(queue[idx]);
  };

  // ── Duplicate check ─────────────────────────────────────────────────────────
  const checkDuplicates = useCallback(async () => {
    if (!form.venue_name || !form.event_date) { setDuplicates([]); return; }
    setDupLoading(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-check?venue=${encodeURIComponent(form.venue_name)}&date=${form.event_date}`,
        { headers: { Authorization: `Bearer ${password}` } }
      );
      const data = await res.json();
      setDuplicates(data.duplicates || []);
    } catch { setDuplicates([]); }
    setDupLoading(false);
  }, [form.venue_name, form.event_date, password]);

  useEffect(() => {
    if (authenticated && form.venue_name && form.event_date) {
      const t = setTimeout(checkDuplicates, 500);
      return () => clearTimeout(t);
    }
  }, [form.venue_name, form.event_date, authenticated, checkDuplicates]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleApprove = async () => {
    const sub = queue[selectedIdx];
    if (!sub) return;
    if (!form.artist_name || !form.venue_name || !form.event_date) {
      alert('Please fill in Artist, Venue, and Date before approving.');
      return;
    }
    setActionLoading(true);
    try {
      const eventDate = form.event_time
        ? new Date(`${form.event_date}T${form.event_time}`).toISOString()
        : form.event_date;

      await fetch('/api/admin/queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submission_id: sub.id,
          event_data: { ...form, event_date: eventDate },
        }),
      });
      showToast(`✅ Approved: ${form.artist_name}`);
      advanceQueue();
    } catch (err) { alert('Approve failed'); }
    setActionLoading(false);
  };

  // NOTE: `handleApproveAndFeature` retired Phase 5 — Spotlight curation
  // lives exclusively in the `spotlight_events` table (see Admin →
  // Spotlight tab). The one-shot "approve + feature" flow wrote
  // `is_featured=true` into a column that no longer drives the hero
  // carousel, so the button was a no-op in practice. Curators now pin
  // approved events from the Spotlight tab's date-scoped picker.

  const handleReject = async () => {
    const sub = queue[selectedIdx];
    if (!sub) return;
    setActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'reject' }),
      });
      showToast('❌ Rejected');
      advanceQueue();
    } catch (err) { alert('Reject failed'); }
    setActionLoading(false);
  };

  const handleBlock = async () => {
    const sub = queue[selectedIdx];
    if (!sub) return;
    if (!confirm('Block this submitter? They won\'t be able to submit again.')) return;
    setActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'block' }),
      });
      showToast('🚫 Submitter blocked');
      advanceQueue();
    } catch (err) { alert('Block failed'); }
    setActionLoading(false);
  };

  // ── Auto-advance ────────────────────────────────────────────────────────────
  const advanceQueue = () => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== selectedIdx);
      const newIdx = Math.min(selectedIdx, next.length - 1);
      if (next.length > 0 && next[newIdx]) {
        setSelectedIdx(newIdx);
        populateForm(next[newIdx]);
      } else {
        setSelectedIdx(0);
        setForm({ artist_name: '', venue_name: '', event_date: '', event_time: '', genre: '', vibe: '', cover: '', ticket_link: '' });
      }
      return next;
    });
  };

  // ── Login ───────────────────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    setAuthenticated(true);
    fetchQueue();
  };

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selected = queue[selectedIdx] || null;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const bg = '#0D0D12';
  const surface = '#1A1A24';
  const surfaceAlt = '#22222E';
  const border = '#2A2A3A';
  const text = '#F0F0F5';
  const textMuted = '#7878A0';
  const accent = '#E8722A';
  const green = '#23CE6B';
  const red = '#EF4444';

  const inputStyle = {
    width: '100%', padding: '10px 12px', background: surfaceAlt,
    border: `1px solid ${border}`, borderRadius: '8px', color: text,
    fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
    colorScheme: 'dark',
  };

  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 700, color: textMuted,
    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px',
    fontFamily: "'DM Sans', sans-serif",
  };

  // ── Login screen ────────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '380px', padding: '32px', borderRadius: '16px', background: surface, border: `1px solid ${border}` }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: text, fontFamily: "'DM Sans', sans-serif", marginBottom: '4px' }}>
            Approval Queue
          </h1>
          <p style={{ fontSize: '13px', color: textMuted, marginBottom: '24px', fontFamily: "'DM Sans', sans-serif" }}>
            Review community submissions before they go live.
          </p>
          <label style={labelStyle}>Admin Password</label>
          <input
            type="password"
            style={inputStyle}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
          />
          <button type="submit" style={{
            width: '100%', marginTop: '16px', padding: '12px', borderRadius: '10px',
            border: 'none', background: accent, color: '#1C1917', fontWeight: 700,
            fontSize: '15px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>
            Login
          </button>
        </form>
      </div>
    );
  }

  // ── Empty queue ─────────────────────────────────────────────────────────────
  if (!loading && queue.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: bg, gap: '16px' }}>
        <span style={{ fontSize: '48px' }}>🫙</span>
        <p style={{ fontSize: '18px', fontWeight: 700, color: text, fontFamily: "'DM Sans', sans-serif" }}>Queue is empty</p>
        <p style={{ fontSize: '14px', color: textMuted, fontFamily: "'DM Sans', sans-serif" }}>All submissions have been reviewed.</p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button onClick={fetchQueue} style={{ padding: '10px 24px', borderRadius: '10px', border: `1px solid ${border}`, background: surface, color: text, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '14px' }}>
            ↻ Refresh
          </button>
          <a href="/admin" style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: accent, color: '#1C1917', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: '14px', textDecoration: 'none' }}>
            Back to Admin
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: `1px solid ${border}`, background: surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/admin" style={{ color: textMuted, textDecoration: 'none', fontSize: '14px' }}>← Admin</a>
          <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
            Approval Queue
            <span style={{
              marginLeft: '10px', fontSize: '13px', fontWeight: 600,
              padding: '2px 10px', borderRadius: '20px',
              background: `${accent}22`, color: accent,
            }}>
              {queue.length} pending
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchQueue} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            ↻ Refresh
          </button>
          <a href="/" style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${border}`, background: 'transparent', color: textMuted, cursor: 'pointer', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
            View Site
          </a>
        </div>
      </header>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: textMuted }}>
          Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', height: 'calc(100vh - 57px)' }}>
          {/* ── Left: Queue Sidebar ──────────────────────────────────────── */}
          <div style={{
            width: '260px', minWidth: '260px', borderRight: `1px solid ${border}`,
            overflowY: 'auto', background: surface,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, fontSize: '11px', fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Submissions ({queue.length})
            </div>
            {queue.map((sub, i) => (
              <div
                key={sub.id}
                onClick={() => selectItem(i)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: `1px solid ${border}`,
                  background: i === selectedIdx ? surfaceAlt : 'transparent',
                  borderLeft: i === selectedIdx ? `3px solid ${accent}` : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sub.artist_name || (sub.image_url ? '📷 Flyer Upload' : 'Unknown')}
                </div>
                <div style={{ fontSize: '11px', color: textMuted }}>
                  {sub.venue_name || 'No venue'} · {sub.event_date ? sub.event_date.substring(0, 10) : 'No date'}
                </div>
                <div style={{
                  display: 'inline-block', marginTop: '4px',
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                  background: sub.image_url ? '#3B82F622' : '#EAB30822',
                  color: sub.image_url ? '#60A5FA' : '#FBBF24',
                }}>
                  {sub.image_url ? '📷 Flyer' : '✏️ Manual'}
                </div>
              </div>
            ))}
          </div>

          {/* ── Middle: Source Panel ─────────────────────────────────────── */}
          <div style={{
            flex: '1 1 40%', minWidth: '300px', borderRight: `1px solid ${border}`,
            overflowY: 'auto', padding: '24px',
          }}>
            {selected ? (
              <>
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                  Source Material
                </h2>

                {/* Flyer image */}
                {selected.image_url ? (
                  <div style={{ marginBottom: '20px' }}>
                    <img
                      src={selected.image_url}
                      alt="Submitted flyer"
                      onClick={() => setLightboxUrl(selected.image_url)}
                      style={{
                        width: '100%', maxHeight: '500px', objectFit: 'contain',
                        borderRadius: '12px', border: `1px solid ${border}`,
                        cursor: 'zoom-in', background: '#000',
                      }}
                    />
                    <p style={{ fontSize: '11px', color: textMuted, marginTop: '6px', textAlign: 'center' }}>
                      Click to zoom · Right-click to open in new tab
                    </p>
                  </div>
                ) : (
                  <div style={{
                    padding: '40px', borderRadius: '12px', border: `1px dashed ${border}`,
                    textAlign: 'center', color: textMuted, marginBottom: '20px',
                  }}>
                    No flyer uploaded — manual entry submission
                  </div>
                )}

                {/* Submission metadata */}
                <div style={{ background: surfaceAlt, borderRadius: '10px', padding: '16px', border: `1px solid ${border}` }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 700, color: textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>
                    Submission Details
                  </h3>
                  {[
                    ['Status', selected.status],
                    ['Artist', selected.artist_name || '—'],
                    ['Venue', selected.venue_name || '—'],
                    ['Date', selected.event_date ? selected.event_date.substring(0, 10) : '—'],
                    ['Submitter', selected.submitter_email || 'Anonymous'],
                    ['Submitted', selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${border}` }}>
                      <span style={{ fontSize: '12px', color: textMuted }}>{label}</span>
                      <span style={{ fontSize: '12px', color: text, fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                  {selected.notes && (
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '12px', color: textMuted }}>Notes:</span>
                      <p style={{ fontSize: '13px', color: text, marginTop: '4px', lineHeight: 1.5 }}>{selected.notes}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: textMuted }}>
                Select a submission from the queue
              </div>
            )}
          </div>

          {/* ── Right: Editor Panel ──────────────────────────────────────── */}
          <div style={{ flex: '1 1 40%', minWidth: '320px', overflowY: 'auto', padding: '24px' }}>
            {selected ? (
              <>
                <h2 style={{ fontSize: '14px', fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                  Event Editor
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Artist / Band Name *</label>
                    <input style={inputStyle} value={form.artist_name} onChange={e => update('artist_name', e.target.value)} placeholder="e.g. The Gaslight Anthem" />
                  </div>

                  <div>
                    <label style={labelStyle}>Venue *</label>
                    <input
                      list="venue-options"
                      style={inputStyle}
                      value={form.venue_name}
                      onChange={e => update('venue_name', e.target.value)}
                      placeholder="Start typing..."
                    />
                    <datalist id="venue-options">
                      {VENUE_OPTIONS.map(v => <option key={v} value={v} />)}
                    </datalist>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Date *</label>
                      <input type="date" style={inputStyle} value={form.event_date} onChange={e => update('event_date', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Time</label>
                      <input type="time" style={inputStyle} value={form.event_time} onChange={e => update('event_time', e.target.value)} />
                    </div>
                  </div>

                  {/* Duplicate warning */}
                  {duplicates.length > 0 && (
                    <div style={{
                      padding: '10px 14px', borderRadius: '8px',
                      background: '#EAB30815', border: '1px solid #EAB30844',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#FBBF24', marginBottom: '4px' }}>
                        ⚠️ Possible Duplicate{duplicates.length > 1 ? 's' : ''}
                      </div>
                      {duplicates.map(d => (
                        <div key={d.id} style={{ fontSize: '12px', color: textMuted }}>
                          {d.artist_name} at {d.venue_name} ({d.event_date?.substring(0, 10)})
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Genre</label>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.genre} onChange={e => update('genre', e.target.value)}>
                        <option value="">Select...</option>
                        {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Vibe</label>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.vibe} onChange={e => update('vibe', e.target.value)}>
                        <option value="">Select...</option>
                        {VIBES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Cover / Price</label>
                      <input style={inputStyle} value={form.cover} onChange={e => update('cover', e.target.value)} placeholder="Free, $10, etc." />
                    </div>
                    <div>
                      <label style={labelStyle}>Ticket Link</label>
                      <input style={inputStyle} value={form.ticket_link} onChange={e => update('ticket_link', e.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                </div>

                {/* ── Action buttons ───────────────────────────────────────── */}
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      style={{
                        flex: 1, padding: '14px', borderRadius: '10px', border: 'none',
                        background: actionLoading ? textMuted : green, color: '#000',
                        fontWeight: 700, fontSize: '15px', cursor: actionLoading ? 'default' : 'pointer',
                      }}
                    >
                      {actionLoading ? 'Processing...' : '✓ Approve & Publish'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleReject}
                      disabled={actionLoading}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '10px',
                        border: `1px solid ${border}`, background: 'transparent',
                        color: text, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                      }}
                    >
                      ✕ Reject
                    </button>
                    <button
                      onClick={handleBlock}
                      disabled={actionLoading}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '10px',
                        border: `1px solid ${red}33`, background: `${red}11`,
                        color: red, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                      }}
                    >
                      🚫 Block Submitter
                    </button>
                  </div>
                </div>

                {/* Keyboard shortcut hint */}
                <p style={{ fontSize: '11px', color: textMuted, textAlign: 'center', marginTop: '16px' }}>
                  Tip: Review the source material on the left, edit fields as needed, then approve or reject.
                </p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: textMuted }}>
                No submissions to review
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Image lightbox ─────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Flyer zoomed"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '8px' }}
          />
          <a
            href={lightboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              padding: '8px 16px', borderRadius: '8px',
              background: accent, color: '#1C1917', fontWeight: 600,
              fontSize: '13px', textDecoration: 'none',
            }}
          >
            Open in New Tab ↗
          </a>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: '12px',
          background: surface, border: `1px solid ${border}`,
          color: text, fontWeight: 600, fontSize: '14px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 400,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
