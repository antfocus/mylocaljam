'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, subRes, repRes] = await Promise.all([
        fetch('/api/admin', { headers: { Authorization: `Bearer ${password}` } }),
        fetch('/api/submissions', { headers: { Authorization: `Bearer ${password}` } }),
        fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } }),
      ]);

      if (evRes.status === 401) {
        setAuthenticated(false);
        alert('Invalid password');
        return;
      }

      setEvents(await evRes.json());
      setSubmissions(await subRes.json());
      setReports(await repRes.json());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [password]);

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthenticated(true);
    fetchAll();
  };

  const deleteEvent = async (id) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    await fetch(`/api/admin?id=${id}`, { method: 'DELETE', headers });
    fetchAll();
  };

  const saveEvent = async (formData) => {
    const method = editingEvent ? 'PUT' : 'POST';
    const body = editingEvent ? { ...formData, id: editingEvent.id } : formData;

    await fetch('/api/admin', {
      method,
      headers,
      body: JSON.stringify(body),
    });

    setShowEventForm(false);
    setEditingEvent(null);
    fetchAll();
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

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <form onSubmit={handleLogin} className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'var(--accent)' }}>
              {Icons.settings}
            </div>
            <div className="font-display font-extrabold text-xl">Admin Panel</div>
          </div>
          <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Password</label>
          <input
            type="password"
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
          />
          <button type="submit" className="w-full mt-4 py-3 rounded-xl font-display font-semibold text-white" style={{ background: 'var(--accent)' }}>
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-24" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Header */}
      <header className="flex items-center justify-between py-5 border-b border-white/[0.06] mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'var(--accent)' }}>
            {Icons.settings}
          </div>
          <div className="font-display font-extrabold text-xl">
            my<span style={{ color: 'var(--accent)' }}>Local</span>Jam — Admin
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {Icons.eye} View Site
          </a>
          <button onClick={fetchAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
        {[
          { key: 'events', label: 'Events', count: events.length },
          { key: 'submissions', label: 'Submissions', count: submissions.filter((s) => s.status === 'pending').length },
          { key: 'reports', label: 'Reports', count: reports.filter((r) => r.status === 'pending').length },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 py-2.5 rounded-lg font-display font-semibold text-sm transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-brand-text-muted'
            }`}
            style={activeTab === tab.key ? { background: 'var(--bg-card)' } : {}}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} {tab.count > 0 && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: tab.key !== 'events' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab.key !== 'events' ? 'white' : 'var(--text-secondary)' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading...</div>}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-display font-bold text-lg">All Events</h2>
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
              onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
            >
              {Icons.plus} Add Event
            </button>
          </div>

          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-4 p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm">{ev.artist_name}</div>
                  <div className="text-xs text-brand-text-secondary">
                    {ev.venue_name || ev.venues?.name} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.status === 'published' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                  {ev.status}
                </span>
                <button className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent" onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                  {Icons.edit}
                </button>
                <button className="p-1.5 rounded text-brand-text-muted hover:text-red-400" onClick={() => deleteEvent(ev.id)}>
                  {Icons.trash}
                </button>
              </div>
            ))}
            {events.length === 0 && <p className="text-center py-8 text-brand-text-muted">No events yet. Add your first one!</p>}
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && !loading && (
        <div className="space-y-2">
          <h2 className="font-display font-bold text-lg mb-4">Community Submissions</h2>
          {submissions.map((sub) => (
            <div key={sub.id} className="p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-display font-bold text-sm">{sub.artist_name}</div>
                  <div className="text-xs text-brand-text-secondary">
                    {sub.venue_name} · {sub.event_date ? formatDate(sub.event_date) : 'No date'} · {sub.genre} · {sub.vibe}
                  </div>
                  {sub.artist_bio && <div className="text-xs text-brand-text-muted mt-1">{sub.artist_bio}</div>}
                  {sub.notes && <div className="text-xs text-brand-text-muted mt-1">Notes: {sub.notes}</div>}
                  {sub.submitter_email && <div className="text-xs text-brand-text-muted mt-1">From: {sub.submitter_email}</div>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sub.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' : sub.status === 'approved' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {sub.status}
                </span>
              </div>
              {sub.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: '#23CE6B' }}
                    onClick={async () => {
                      // Approve: create event from submission
                      await fetch('/api/admin', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                          artist_name: sub.artist_name,
                          venue_name: sub.venue_name,
                          event_date: sub.event_date,
                          genre: sub.genre,
                          vibe: sub.vibe,
                          cover: sub.cover,
                          artist_bio: sub.artist_bio,
                          source: 'Community Submitted',
                          status: 'published',
                        }),
                      });
                      fetchAll();
                    }}
                  >
                    ✓ Approve & Publish
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    onClick={() => { /* Mark as rejected */ }}
                  >
                    ✕ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {submissions.length === 0 && <p className="text-center py-8 text-brand-text-muted">No submissions yet.</p>}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && !loading && (
        <div className="space-y-2">
          <h2 className="font-display font-bold text-lg mb-4">Issue Reports</h2>
          {reports.map((rep) => (
            <div key={rep.id} className="p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display font-bold text-sm">{rep.events?.artist_name || 'Unknown Event'}</div>
                  <div className="text-xs text-brand-text-secondary capitalize">{rep.issue_type?.replace('_', ' ')}</div>
                  <div className="text-xs text-brand-text-muted mt-1">{rep.description}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rep.status === 'pending' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>
                  {rep.status}
                </span>
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-center py-8 text-brand-text-muted">No reports yet.</p>}
        </div>
      )}

      {/* Event Form Modal */}
      {showEventForm && (
        <EventFormModal
          event={editingEvent}
          onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
          onSave={saveEvent}
        />
      )}
    </div>
  );
}

function EventFormModal({ event, onClose, onSave }) {
  const [form, setForm] = useState({
    artist_name: event?.artist_name || '',
    artist_bio: event?.artist_bio || '',
    venue_name: event?.venue_name || event?.venues?.name || '',
    event_date: event?.event_date ? new Date(event.event_date).toISOString().slice(0, 10) : '',
    event_time: event?.event_date ? new Date(event.event_date).toTimeString().slice(0, 5) : '',
    genre: event?.genre || '',
    vibe: event?.vibe || '',
    cover: event?.cover || '',
    ticket_link: event?.ticket_link || '',
    recurring: event?.recurring || false,
    status: event?.status || 'published',
    source: event?.source || 'Admin',
  });

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.artist_name || !form.venue_name || !form.event_date || !form.event_time) {
      alert('Please fill in Artist, Venue, Date, and Time.');
      return;
    }
    const eventDate = new Date(`${form.event_date}T${form.event_time}`).toISOString();
    onSave({ ...form, event_date: eventDate });
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

  const VENUE_OPTIONS = [
    'The Stone Pony', 'House of Independents', 'The Wonder Bar',
    'The Saint', 'Asbury Lanes', 'Danny Clinch Transparent Gallery',
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-[540px] max-h-[85vh] overflow-y-auto rounded-2xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display font-bold text-lg">{event ? 'Edit Event' : 'Add Event'}</h2>
          <button className="p-1 rounded-md text-brand-text-muted hover:text-brand-text" onClick={onClose}>{Icons.x}</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist / Band Name *</label>
            <input style={inputStyle} value={form.artist_name} onChange={(e) => update('artist_name', e.target.value)} />
          </div>
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist Bio</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.artist_bio} onChange={(e) => update('artist_bio', e.target.value)} />
          </div>
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Venue *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.venue_name} onChange={(e) => update('venue_name', e.target.value)}>
              <option value="">Select venue...</option>
              {VENUE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Date *</label>
              <input type="date" style={inputStyle} value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Time *</label>
              <input type="time" style={inputStyle} value={form.event_time} onChange={(e) => update('event_time', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Genre</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.genre} onChange={(e) => update('genre', e.target.value)}>
                <option value="">Select...</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Vibe</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.vibe} onChange={(e) => update('vibe', e.target.value)}>
                <option value="">Select...</option>
                {VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Cover Charge</label>
              <input style={inputStyle} placeholder="Free, $10, etc." value={form.cover} onChange={(e) => update('cover', e.target.value)} />
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Status</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Ticket Link</label>
            <input style={inputStyle} placeholder="https://..." value={form.ticket_link} onChange={(e) => update('ticket_link', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.recurring} onChange={(e) => update('recurring', e.target.checked)} />
            <label className="text-sm text-brand-text-secondary">Recurring event</label>
          </div>
          <button
            className="w-full py-3 rounded-xl font-display font-semibold text-[15px] text-white"
            style={{ background: 'var(--accent)' }}
            onClick={handleSave}
          >
            {event ? 'Update Event' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
