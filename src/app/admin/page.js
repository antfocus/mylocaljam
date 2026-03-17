'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';

// ── Title Case formatter (respects common lowercase words) ───────────────────
const TITLE_CASE_MINOR = new Set(['a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','by','of','up','as','is']);
function toTitleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      // Always capitalize first/last word, otherwise skip minor words
      if (i === 0 || !TITLE_CASE_MINOR.has(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

// ── Venue list for queue editor dropdown ─────────────────────────────────────
const QUEUE_VENUE_OPTIONS = [
  'The Stone Pony', 'House of Independents', 'The Wonder Bar',
  'The Saint', 'Asbury Lanes', 'Danny Clinch Transparent Gallery',
  'Bar Anticipation', 'The Headliner', 'Donovan\'s Reef',
  'Langosta Lounge', 'Johnny Mac\'s', 'The Osprey',
];

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistsSearch, setArtistsSearch] = useState('');
  const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistForm, setArtistForm] = useState({ bio: '', genres: '', vibes: '', image_url: '', instagram_url: '' });
  const [artistActionLoading, setArtistActionLoading] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [artistToast, setArtistToast] = useState(null);
  const editPanelRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingArtist]);
  const [loading, setLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventsStatusFilter, setEventsStatusFilter] = useState('all');
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsSortField, setEventsSortField] = useState('updated_at');
  const [eventsSortOrder, setEventsSortOrder] = useState('desc');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [spotlightDate, setSpotlightDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [spotlightPins, setSpotlightPins] = useState([]);
  const [spotlightEvents, setSpotlightEvents] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);

  // ── Queue state (inlined from Approval Queue page) ─────────────────────────
  const [queue, setQueue] = useState([]);
  const [queueSelectedIdx, setQueueSelectedIdx] = useState(0);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [queueForm, setQueueForm] = useState({
    artist_name: '', venue_name: '', event_date: '', event_time: '',
    genre: '', vibe: '', cover: '', ticket_link: '',
  });
  const [queueDuplicates, setQueueDuplicates] = useState([]);
  const [queueDupLoading, setQueueDupLoading] = useState(false);
  const [queueLightboxUrl, setQueueLightboxUrl] = useState(null);
  const [queueToast, setQueueToast] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const fetchEvents = useCallback(async (page = 1, sort = eventsSortField, order = eventsSortOrder) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '100', sort, order });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) { setAuthenticated(false); alert('Invalid password'); return; }
      const data = await res.json();
      if (data.events) {
        setEvents(prev => page === 1 ? data.events : [...prev, ...data.events]);
        setEventsPage(data.pagination.page);
        setEventsTotalPages(data.pagination.totalPages);
        setEventsTotal(data.pagination.total);
      } else {
        // Fallback for old API shape
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error(err); }
  }, [password, eventsSortField, eventsSortOrder]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [, subRes, repRes] = await Promise.all([
        fetchEvents(1),
        fetch('/api/submissions', { headers: { Authorization: `Bearer ${password}` } }),
        fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } }),
      ]);

      setSubmissions(await subRes.json());
      setReports(await repRes.json());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [password, fetchEvents]);

  const fetchArtists = useCallback(async (search = '', needsInfo = false) => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (needsInfo) params.set('needsInfo', 'true');
      const res = await fetch(`/api/admin/artists?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setArtists(await res.json());
    } catch (err) { console.error('Failed to fetch artists:', err); }
  }, [password]);

  const fetchSpotlightEvents = useCallback(async (date) => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '200', sort: 'event_date', order: 'asc' });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) return;
      const data = await res.json();
      const all = data.events || (Array.isArray(data) ? data : []);
      setSpotlightEvents(all.filter(ev => (ev.event_date || '').slice(0, 10) === date && ev.status === 'published'));
    } catch (err) {
      console.error('Failed to load spotlight events:', err);
    }
  }, [password]);

  const fetchSpotlight = useCallback(async (date) => {
    setSpotlightLoading(true);
    try {
      const res = await fetch(`/api/spotlight?date=${date}`);
      const data = await res.json();
      setSpotlightPins(Array.isArray(data) ? data.map(d => d.event_id) : []);
    } catch (err) {
      console.error('Failed to load spotlight:', err);
      setSpotlightPins([]);
    }
    await fetchSpotlightEvents(date);
    setSpotlightLoading(false);
  }, [fetchSpotlightEvents]);

  const saveSpotlight = async () => {
    // 1. Save to spotlight_events table
    await fetch('/api/spotlight', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: spotlightDate, event_ids: spotlightPins }),
    });

    // 2. Persist spotlight_order on each pinned event
    for (let i = 0; i < spotlightPins.length; i++) {
      await fetch('/api/admin', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: spotlightPins[i], spotlight_order: i, is_featured: true }),
      });
    }

    // 3. Clear spotlight_order on events that were un-pinned today
    const todayEvents = spotlightEvents;
    for (const ev of todayEvents) {
      if (!spotlightPins.includes(ev.id) && ev.spotlight_order != null) {
        await fetch('/api/admin', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ id: ev.id, spotlight_order: null }),
        });
      }
    }

    alert(`Spotlight saved for ${spotlightDate} (${spotlightPins.length} event${spotlightPins.length !== 1 ? 's' : ''})`);
    fetchAll();
    fetchSpotlightEvents(spotlightDate);
  };

  const clearSpotlight = async () => {
    if (!confirm(`Clear all spotlight pins for ${spotlightDate}? The carousel will use the automatic fallback.`)) return;
    await fetch(`/api/spotlight?date=${spotlightDate}`, { method: 'DELETE', headers });
    setSpotlightPins([]);
  };

  const toggleSpotlightPin = (eventId) => {
    setSpotlightPins(prev => {
      if (prev.includes(eventId)) return prev.filter(id => id !== eventId);
      if (prev.length >= 5) { alert('Maximum 5 spotlight events per day'); return prev; }
      return [...prev, eventId];
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthenticated(true);
    fetchAll();
    fetchQueue();
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

  const toggleFeatured = async (ev) => {
    const newVal = !ev.is_featured;
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_featured: newVal } : e));
    await fetch('/api/admin', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: ev.id, is_featured: newVal }),
    });
  };

  // ── Queue functions ─────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/queue', { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) return;
      const data = await res.json();
      setQueue(data);
      if (data.length > 0) {
        setQueueSelectedIdx(0);
        populateQueueForm(data[0]);
      }
    } catch (err) { console.error(err); }
  }, [password]);

  const populateQueueForm = (sub) => {
    setQueueForm({
      artist_name: sub.artist_name || '',
      venue_name: sub.venue_name || '',
      event_date: sub.event_date ? sub.event_date.substring(0, 10) : '',
      event_time: sub.event_date && sub.event_date.length > 10 ? sub.event_date.substring(11, 16) : '',
      genre: sub.genre || '',
      vibe: sub.vibe || '',
      cover: sub.cover || '',
      ticket_link: sub.ticket_link || '',
    });
    setQueueDuplicates([]);
  };

  const selectQueueItem = (idx) => {
    setQueueSelectedIdx(idx);
    if (queue[idx]) populateQueueForm(queue[idx]);
  };

  const showQueueToast = (msg) => { setQueueToast(msg); setTimeout(() => setQueueToast(null), 3000); };

  const advanceQueue = () => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== queueSelectedIdx);
      const newIdx = Math.min(queueSelectedIdx, next.length - 1);
      if (next.length > 0 && next[newIdx]) {
        setQueueSelectedIdx(newIdx);
        populateQueueForm(next[newIdx]);
      } else {
        setQueueSelectedIdx(0);
        setQueueForm({ artist_name: '', venue_name: '', event_date: '', event_time: '', genre: '', vibe: '', cover: '', ticket_link: '' });
      }
      return next;
    });
  };

  const handleQueueApprove = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    if (!queueForm.artist_name || !queueForm.venue_name || !queueForm.event_date) {
      alert('Please fill in Artist, Venue, and Date before approving.');
      return;
    }
    setQueueActionLoading(true);
    try {
      // Title Case sanitization
      const sanitized = {
        ...queueForm,
        artist_name: toTitleCase(queueForm.artist_name),
        venue_name: toTitleCase(queueForm.venue_name),
      };
      const eventDate = sanitized.event_time
        ? new Date(`${sanitized.event_date}T${sanitized.event_time}`).toISOString()
        : sanitized.event_date;
      await fetch('/api/admin/queue', {
        method: 'POST', headers,
        body: JSON.stringify({ submission_id: sub.id, event_data: { ...sanitized, event_date: eventDate } }),
      });
      showQueueToast(`✅ Approved: ${sanitized.artist_name}`);
      advanceQueue();
      fetchAll();
    } catch { alert('Approve failed'); }
    setQueueActionLoading(false);
  };


  const handleQueueReject = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'reject' }),
      });
      showQueueToast('❌ Rejected');
      advanceQueue();
    } catch { alert('Reject failed'); }
    setQueueActionLoading(false);
  };

  const handleQueueBlock = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    if (!confirm('Block this submitter? They won\'t be able to submit again.')) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'block' }),
      });
      showQueueToast('🚫 Submitter blocked');
      advanceQueue();
    } catch { alert('Block failed'); }
    setQueueActionLoading(false);
  };

  const handleQueueArchive = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'archive' }),
      });
      showQueueToast('📦 Saved to Vault');
      advanceQueue();
    } catch { alert('Archive failed'); }
    setQueueActionLoading(false);
  };

  // ── Unpublish (kill switch) — sets status to 'archived' ───────────────────
  const unpublishEvent = async (ev) => {
    const prev = events;
    setEvents(p => p.map(e => e.id === ev.id ? { ...e, status: 'archived', is_featured: false } : e));
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: ev.id, status: 'archived', is_featured: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showQueueToast(`📴 Unpublished: ${ev.artist_name}`);
    } catch (err) {
      console.error('Unpublish failed:', err);
      setEvents(prev); // revert optimistic update
      alert(`Unpublish failed: ${err.message}`);
    }
  };

  const updateQueueForm = (k, v) => setQueueForm(f => ({ ...f, [k]: v }));
  const queueSelected = queue[queueSelectedIdx] || null;

  // Queue duplicate check
  const checkQueueDuplicates = useCallback(async () => {
    if (!queueForm.venue_name || !queueForm.event_date) { setQueueDuplicates([]); return; }
    setQueueDupLoading(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-check?venue=${encodeURIComponent(queueForm.venue_name)}&date=${queueForm.event_date}`,
        { headers: { Authorization: `Bearer ${password}` } }
      );
      const data = await res.json();
      setQueueDuplicates(data.duplicates || []);
    } catch { setQueueDuplicates([]); }
    setQueueDupLoading(false);
  }, [queueForm.venue_name, queueForm.event_date, password]);

  useEffect(() => {
    if (authenticated && queueForm.venue_name && queueForm.event_date) {
      const t = setTimeout(checkQueueDuplicates, 500);
      return () => clearTimeout(t);
    }
  }, [queueForm.venue_name, queueForm.event_date, authenticated, checkQueueDuplicates]);

  // ── Queue style tokens ─────────────────────────────────────────────────────
  const qSurface = '#1A1A24';
  const qSurfaceAlt = '#22222E';
  const qBorder = '#2A2A3A';
  const qText = '#F0F0F5';
  const qTextMuted = '#7878A0';
  const qAccent = '#E8722A';
  const qGreen = '#23CE6B';
  const qRed = '#EF4444';

  const qInputStyle = {
    width: '100%', padding: '10px 12px', background: qSurfaceAlt,
    border: `1px solid ${qBorder}`, borderRadius: '8px', color: qText,
    fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
    colorScheme: 'dark',
  };

  const qLabelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 700, color: qTextMuted,
    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px',
    fontFamily: "'DM Sans', sans-serif",
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
          { key: 'events', label: 'History', count: eventsTotal || events.length },
          { key: 'artists', label: 'Artists', count: artists.length },
          { key: 'spotlight', label: 'Spotlight', count: spotlightPins.length },
          { key: 'submissions', label: 'Submissions', count: queue.length },
          { key: 'reports', label: 'Reports', count: reports.filter((r) => r.status === 'pending').length },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 py-2.5 rounded-lg font-display font-semibold text-sm transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-brand-text-muted'
            }`}
            style={activeTab === tab.key ? { background: 'var(--bg-card)' } : {}}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'spotlight') fetchSpotlight(spotlightDate); if (tab.key === 'submissions') fetchQueue(); if (tab.key === 'artists') fetchArtists(); }}
          >
            {tab.label} {tab.count > 0 && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: tab.key !== 'events' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab.key !== 'events' ? 'white' : 'var(--text-secondary)' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading...</div>}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (() => {
        const searchLower = eventsSearch.trim().toLowerCase();
        const filtered = events.filter(ev => {
          if (eventsStatusFilter !== 'all' && ev.status !== eventsStatusFilter) return false;
          if (searchLower) {
            const artist = (ev.artist_name || '').toLowerCase();
            const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
            if (!artist.includes(searchLower) && !venue.includes(searchLower)) return false;
          }
          return true;
        });
        return (
        <div>
          {/* Controls row: search, filter, add */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search artist or venue..."
              value={eventsSearch}
              onChange={e => setEventsSearch(e.target.value)}
              style={{
                flex: '1 1 200px', padding: '9px 14px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
              }}
            />
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'published', label: 'Published' },
                { key: 'archived', label: 'Archived' },
              ].map(seg => (
                <button
                  key={seg.key}
                  className="px-3 py-2 text-xs font-semibold font-display"
                  style={{
                    background: eventsStatusFilter === seg.key ? 'var(--accent)' : 'var(--bg-card)',
                    color: eventsStatusFilter === seg.key ? 'white' : 'var(--text-secondary)',
                    border: 'none', cursor: 'pointer',
                  }}
                  onClick={() => setEventsStatusFilter(seg.key)}
                >
                  {seg.label}
                </button>
              ))}
            </div>
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
              onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
            >
              {Icons.plus} Add Event
            </button>
          </div>

          {/* Sort + count row */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-display" style={{ color: 'var(--text-muted)' }}>
              Showing {filtered.length} of {eventsTotal || events.length} events
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs font-display font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  background: eventsSortField === 'updated_at' ? 'var(--accent)' : 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: eventsSortField === 'updated_at' ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const newOrder = eventsSortField === 'updated_at' ? (eventsSortOrder === 'desc' ? 'asc' : 'desc') : 'desc';
                  setEventsSortField('updated_at');
                  setEventsSortOrder(newOrder);
                  setEvents([]);
                  fetchEvents(1, 'updated_at', newOrder);
                }}
              >
                Last Updated {eventsSortField === 'updated_at' ? (eventsSortOrder === 'desc' ? '↓' : '↑') : ''}
              </button>
              <button
                className="text-xs font-display font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  background: eventsSortField === 'created_at' ? 'var(--accent)' : 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: eventsSortField === 'created_at' ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const newOrder = eventsSortField === 'created_at' ? (eventsSortOrder === 'desc' ? 'asc' : 'desc') : 'desc';
                  setEventsSortField('created_at');
                  setEventsSortOrder(newOrder);
                  setEvents([]);
                  fetchEvents(1, 'created_at', newOrder);
                }}
              >
                Date Added {eventsSortField === 'created_at' ? (eventsSortOrder === 'desc' ? '↓' : '↑') : ''}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((ev) => (
              <div key={ev.id} className="flex items-center gap-4 p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm">{ev.artist_name}</div>
                  <div className="text-xs text-brand-text-secondary">
                    {ev.venue_name || ev.venues?.name} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}
                  </div>
                  <div className="text-[10px] mt-0.5 flex gap-3" style={{ color: 'var(--text-muted)' }}>
                    {ev.created_at && (
                      <span>Added {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                    {ev.updated_at && ev.updated_at !== ev.created_at && (
                      <span>Updated {new Date(ev.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
                <button
                  className="p-1.5 rounded transition-colors"
                  title={ev.is_featured ? 'Remove from Featured' : 'Feature in Spotlight'}
                  onClick={() => toggleFeatured(ev)}
                  style={{ color: ev.is_featured ? '#F59E0B' : 'var(--text-muted)', fontSize: '18px' }}
                >
                  {ev.is_featured ? '★' : '☆'}
                </button>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.status === 'published' ? 'bg-green-500/15 text-green-400' : ev.status === 'archived' ? 'bg-gray-500/15 text-gray-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                  {ev.status}
                </span>
                {ev.status === 'published' ? (
                  <button
                    className="px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ border: '1px solid #F59E0B33', color: '#F59E0B', background: '#F59E0B11' }}
                    onClick={() => unpublishEvent(ev)}
                    title="Pull from live feed"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    className="px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ border: '1px solid #23CE6B33', color: '#23CE6B', background: '#23CE6B11' }}
                    onClick={async () => {
                      const prev = events;
                      setEvents(p => p.map(e => e.id === ev.id ? { ...e, status: 'published' } : e));
                      try {
                        const res = await fetch('/api/admin', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                          body: JSON.stringify({ id: ev.id, status: 'published' }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        showQueueToast(`✅ Republished: ${ev.artist_name}`);
                      } catch (err) {
                        console.error('Republish failed:', err);
                        setEvents(prev);
                        alert(`Republish failed: ${err.message}`);
                      }
                    }}
                    title="Republish to live feed"
                  >
                    Republish
                  </button>
                )}
                <button className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent" onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                  {Icons.edit}
                </button>
                <button className="p-1.5 rounded text-brand-text-muted hover:text-red-400" onClick={() => deleteEvent(ev.id)} title="Permanently delete">
                  {Icons.trash}
                </button>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center py-8 text-brand-text-muted">{eventsSearch || eventsStatusFilter !== 'all' ? 'No matching events.' : 'No events yet. Add your first one!'}</p>}
          </div>

          {/* Load More */}
          {eventsPage < eventsTotalPages && (
            <div className="text-center mt-4">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-display font-semibold"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => fetchEvents(eventsPage + 1)}
              >
                Load More ({events.length} of {eventsTotal})
              </button>
            </div>
          )}
        </div>
        );
      })()}

      {/* Artists Audit Dashboard */}
      {activeTab === 'artists' && !loading && (
        <div>
          {/* Toolbar: Search + Needs Info toggle + count */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Search artists..."
              value={artistsSearch}
              onChange={e => { setArtistsSearch(e.target.value); fetchArtists(e.target.value, artistsNeedsInfo); }}
              style={{
                flex: '1 1 200px', padding: '9px 14px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
              }}
            />
            {/* Export CSV */}
            <button
              onClick={() => {
                const header = ['Artist Name','Has Bio','Has Image','Has Genres','Has Socials','Database ID'];
                const rows = artists.map(a => [
                  `"${(a.name || '').replace(/"/g, '""')}"`,
                  a.bio ? 'TRUE' : 'FALSE',
                  a.image_url ? 'TRUE' : 'FALSE',
                  (a.genres && a.genres.length > 0) ? 'TRUE' : 'FALSE',
                  a.instagram_url ? 'TRUE' : 'FALSE',
                  a.id,
                ]);
                const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `artist-audit${artistsNeedsInfo ? '-needs-info' : ''}-${new Date().toISOString().slice(0,10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', transition: 'all 0.15s ease',
              }}
            >
              ↓ Export CSV
            </button>
            {/* Needs Info toggle */}
            <button
              onClick={() => {
                const next = !artistsNeedsInfo;
                setArtistsNeedsInfo(next);
                fetchArtists(artistsSearch, next);
              }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                background: artistsNeedsInfo ? '#E8722A' : 'var(--bg-elevated)',
                color: artistsNeedsInfo ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {artistsNeedsInfo ? '✓ Needs Info Only' : 'Needs Info Only'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
              {artists.length} artist{artists.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Edit panel (slides open when editing) */}
          {/* Toast notification */}
          {artistToast && (
            <div style={{
              position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
              padding: '12px 20px', borderRadius: '10px',
              background: artistToast.type === 'error' ? '#ef4444' : '#22c55e',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              animation: 'fadeIn 0.2s ease',
            }}>
              {artistToast.message}
            </div>
          )}

          {editingArtist && (
            <div ref={editPanelRef} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
              borderRadius: '12px', padding: '20px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
                  Editing: {editingArtist.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    disabled={aiLoading}
                    onClick={async () => {
                      setAiLoading(true);
                      setArtistToast(null);
                      try {
                        const res = await fetch('/api/admin/artists/ai-lookup', {
                          method: 'POST',
                          headers,
                          body: JSON.stringify({ artistName: editingArtist.name }),
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || `API error ${res.status}`);
                        }
                        const ai = await res.json();
                        setArtistForm(prev => ({
                          ...prev,
                          bio: ai.bio || prev.bio,
                          genres: ai.genres?.length ? ai.genres.join(', ') : prev.genres,
                          vibes: ai.vibes?.length ? ai.vibes.join(', ') : prev.vibes,
                          instagram_url: ai.instagram_url || prev.instagram_url,
                        }));
                        setArtistToast({ type: 'success', message: 'AI fields populated — review & save!' });
                        setTimeout(() => setArtistToast(null), 4000);
                      } catch (err) {
                        console.error('AI auto-fill error:', err);
                        setArtistToast({ type: 'error', message: 'Could not auto-fill. Manual entry required.' });
                        setTimeout(() => setArtistToast(null), 5000);
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                      background: aiLoading ? 'rgba(232,114,42,0.15)' : 'linear-gradient(135deg, #E8722A, #d35f1a)',
                      color: aiLoading ? 'var(--text-muted)' : '#fff',
                      border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {aiLoading ? '⏳ Searching...' : '✨ Auto-Fill with AI'}
                  </button>
                  <button
                    onClick={() => setEditingArtist(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
                  >✕</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Bio</label>
                  <textarea
                    value={artistForm.bio}
                    onChange={e => setArtistForm(p => ({ ...p, bio: e.target.value }))}
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif",
                      resize: 'vertical', outline: 'none',
                    }}
                  />
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px', marginTop: '12px' }}>Vibes (comma-separated)</label>
                  <input
                    type="text"
                    value={artistForm.vibes}
                    onChange={e => setArtistForm(p => ({ ...p, vibes: e.target.value }))}
                    placeholder="High-Energy, Party, Acoustic"
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Genres (comma-separated)</label>
                  <input
                    type="text"
                    value={artistForm.genres}
                    onChange={e => setArtistForm(p => ({ ...p, genres: e.target.value }))}
                    placeholder="Rock, Blues, Indie"
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                  />
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px', marginTop: '12px' }}>Image URL</label>
                  <input
                    type="text"
                    value={artistForm.image_url}
                    onChange={e => setArtistForm(p => ({ ...p, image_url: e.target.value }))}
                    placeholder="https://..."
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                  />
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px', marginTop: '12px' }}>Instagram URL</label>
                  <input
                    type="text"
                    value={artistForm.instagram_url}
                    onChange={e => setArtistForm(p => ({ ...p, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/..."
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: '8px',
                      color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditingArtist(null)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  onClick={async () => {
                    const genres = artistForm.genres
                      ? artistForm.genres.split(',').map(g => g.trim()).filter(Boolean)
                      : null;
                    const vibes = artistForm.vibes
                      ? artistForm.vibes.split(',').map(v => v.trim()).filter(Boolean)
                      : null;
                    await fetch('/api/admin/artists', {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({
                        id: editingArtist.id,
                        bio: artistForm.bio || null,
                        genres: genres && genres.length > 0 ? genres : null,
                        vibes: vibes && vibes.length > 0 ? vibes : null,
                        image_url: artistForm.image_url || null,
                        instagram_url: artistForm.instagram_url || null,
                      }),
                    });
                    setEditingArtist(null);
                    fetchArtists(artistsSearch, artistsNeedsInfo);
                  }}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: '#E8722A', color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >Save Changes</button>
              </div>
            </div>
          )}

          {/* Artist list */}
          {artists.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>🎸</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
                {artistsNeedsInfo ? 'All artists have complete profiles!' : 'No artists yet'}
              </p>
              <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
                {artistsNeedsInfo
                  ? 'Turn off the filter to see all artists.'
                  : 'Run the SQL migration to create the artists table, then artists will appear here.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {artists.map(artist => {
                const hasBio = !!artist.bio;
                const hasImg = !!artist.image_url;
                const hasGenre = artist.genres && artist.genres.length > 0;
                const hasSocial = !!artist.instagram_url;
                const isEditing = editingArtist?.id === artist.id;

                const HealthBadge = ({ label, active }) => (
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
                    fontSize: '12px', fontWeight: 600, letterSpacing: '0.3px',
                    fontFamily: "'DM Sans', sans-serif",
                    background: active ? 'rgba(58, 173, 160, 0.2)' : 'rgba(255,255,255,0.06)',
                    color: active ? '#3AADA0' : 'var(--text-muted)',
                    opacity: active ? 1 : 0.5,
                  }}>{label}</span>
                );

                return (
                  <div
                    key={artist.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '14px 16px', borderRadius: '12px',
                      background: isEditing ? 'rgba(232,114,42,0.06)' : 'var(--bg-card)',
                      border: `1px solid ${isEditing ? '#E8722A' : 'var(--border)'}`,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                      background: artist.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', fontSize: '18px',
                    }}>
                      {artist.image_url
                        ? <img src={artist.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : '🎤'
                      }
                    </div>

                    {/* Name + health badges */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                          {artist.name}
                        </span>
                        {artist.is_claimed && (
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
                            fontSize: '10px', fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                          }}>Claimed</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <HealthBadge label="Bio" active={hasBio} />
                        <HealthBadge label="Img" active={hasImg} />
                        <HealthBadge label="Genre" active={hasGenre} />
                        <HealthBadge label="Social" active={hasSocial} />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      {/* Edit */}
                      <button
                        title="Edit artist"
                        onClick={() => {
                          setEditingArtist(artist);
                          setArtistForm({
                            bio: artist.bio || '',
                            genres: artist.genres ? (Array.isArray(artist.genres) ? artist.genres.join(', ') : artist.genres) : '',
                            vibes: artist.vibes ? (Array.isArray(artist.vibes) ? artist.vibes.join(', ') : artist.vibes) : '',
                            image_url: artist.image_url || '',
                            instagram_url: artist.instagram_url || '',
                          });
                        }}
                        style={{
                          padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                          border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                      >✎</button>

                      {/* Convert to Special */}
                      <button
                        title="Convert to Drink/Food Special"
                        disabled={artistActionLoading === artist.id}
                        onClick={async () => {
                          if (!confirm(`Convert "${artist.name}" to a Drink/Food Special?\n\nThis will:\n• Delete this artist from the directory\n• Re-categorize linked events as "Drink/Food Special"`)) return;
                          setArtistActionLoading(artist.id);
                          try {
                            await fetch(`/api/admin/artists?id=${artist.id}&action=convert-to-special`, { method: 'DELETE', headers });
                            fetchArtists(artistsSearch, artistsNeedsInfo);
                          } catch (err) { console.error(err); }
                          setArtistActionLoading(null);
                        }}
                        style={{
                          padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                          background: 'rgba(234, 179, 8, 0.1)', color: '#EAB308',
                          border: '1px solid rgba(234, 179, 8, 0.25)', cursor: 'pointer',
                          opacity: artistActionLoading === artist.id ? 0.5 : 1,
                        }}
                      >🍺</button>

                      {/* Delete */}
                      <button
                        title="Delete artist"
                        disabled={artistActionLoading === artist.id}
                        onClick={async () => {
                          if (!confirm(`Permanently delete "${artist.name}" from the artist directory?`)) return;
                          setArtistActionLoading(artist.id);
                          try {
                            await fetch(`/api/admin/artists?id=${artist.id}`, { method: 'DELETE', headers });
                            fetchArtists(artistsSearch, artistsNeedsInfo);
                            if (editingArtist?.id === artist.id) setEditingArtist(null);
                          } catch (err) { console.error(err); }
                          setArtistActionLoading(null);
                        }}
                        style={{
                          padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                          background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444',
                          border: '1px solid rgba(239, 68, 68, 0.25)', cursor: 'pointer',
                          opacity: artistActionLoading === artist.id ? 0.5 : 1,
                        }}
                      >🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Spotlight Tab */}
      {activeTab === 'spotlight' && !loading && (
        <div>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Tonight&apos;s Spotlight</h2>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  onClick={clearSpotlight}
                >
                  Clear Pins
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                  onClick={saveSpotlight}
                >
                  Save Spotlight
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="font-display font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>Date:</label>
              <input
                type="date"
                value={spotlightDate}
                onChange={(e) => { const d = e.target.value; setSpotlightDate(d); fetchSpotlight(d); }}
                style={{
                  padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {spotlightPins.length === 0 ? 'No pins — using auto fallback' : `${spotlightPins.length}/5 pinned`}
              </span>
            </div>
          </div>

          {/* Pinned events (reorderable list) */}
          {spotlightPins.length > 0 && (
            <div className="mb-6">
              <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pinned Order (drag to reorder)
              </h3>
              <div className="space-y-2">
                {spotlightPins.map((eventId, i) => {
                  const ev = spotlightEvents.find(e => e.id === eventId);
                  return (
                    <div key={eventId} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: '#E8722A44' }}>
                      <span className="text-xs font-bold" style={{ color: '#E8722A', minWidth: '20px' }}>#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-sm">{ev?.artist_name || 'Unknown'}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {ev?.venue_name || ev?.venues?.name || ''} · {ev ? formatTime(ev.event_date) : ''}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {i > 0 && (
                          <button className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-card)' }}
                            onClick={() => setSpotlightPins(prev => { const n = [...prev]; [n[i-1], n[i]] = [n[i], n[i-1]]; return n; })}>
                            ↑
                          </button>
                        )}
                        {i < spotlightPins.length - 1 && (
                          <button className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-card)' }}
                            onClick={() => setSpotlightPins(prev => { const n = [...prev]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n; })}>
                            ↓
                          </button>
                        )}
                      </div>
                      <button
                        className="p-1.5 rounded text-red-400 hover:text-red-300"
                        onClick={() => toggleSpotlightPin(eventId)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All events for the selected date — click to pin/unpin */}
          <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Events on {spotlightDate} — click to pin
          </h3>
          <div className="space-y-2">
            {spotlightEvents
              .map(ev => {
                const isPinned = spotlightPins.includes(ev.id);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all"
                    style={{
                      background: isPinned ? 'rgba(232,114,42,0.08)' : 'var(--bg-card)',
                      borderColor: isPinned ? '#E8722A' : 'var(--border)',
                    }}
                    onClick={() => toggleSpotlightPin(ev.id)}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold"
                      style={{
                        background: isPinned ? '#E8722A' : 'var(--bg-elevated)',
                        color: isPinned ? '#111' : 'var(--text-muted)',
                      }}>
                      {isPinned ? '★' : '☆'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm">{ev.artist_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {ev.venue_name || ev.venues?.name} · {formatTime(ev.event_date)}
                      </div>
                    </div>
                    {isPinned && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8722A22', color: '#E8722A' }}>
                        Pinned #{spotlightPins.indexOf(ev.id) + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            {spotlightEvents.length === 0 && (
              <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No published events on this date.</p>
            )}
          </div>
        </div>
      )}

      {/* Submissions Tab — 3-Column Queue UI */}
      {activeTab === 'submissions' && !loading && (
        <div>
          {queue.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
              <span style={{ fontSize: '48px' }}>🫙</span>
              <p className="font-display font-bold text-lg">Queue is empty</p>
              <p className="text-sm" style={{ color: qTextMuted }}>All submissions have been reviewed.</p>
              <button onClick={fetchQueue} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${qBorder}`, background: qSurface, color: qText }}>
                ↻ Refresh
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${qBorder}`, height: 'calc(100vh - 220px)' }}>
              {/* ── Left: Queue Sidebar ─────────────────────────────────────── */}
              <div style={{ width: '240px', minWidth: '240px', borderRight: `1px solid ${qBorder}`, overflowY: 'auto', background: qSurface }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${qBorder}`, fontSize: '11px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Pending ({queue.length})
                </div>
                {queue.map((sub, i) => (
                  <div
                    key={sub.id}
                    onClick={() => selectQueueItem(i)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      borderBottom: `1px solid ${qBorder}`,
                      background: i === queueSelectedIdx ? qSurfaceAlt : 'transparent',
                      borderLeft: i === queueSelectedIdx ? `3px solid ${qAccent}` : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700, color: qText, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.artist_name || (sub.image_url ? '📷 Flyer Upload' : 'Unknown')}
                    </div>
                    <div style={{ fontSize: '11px', color: qTextMuted }}>
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

              {/* ── Middle: Source Panel ────────────────────────────────────── */}
              <div style={{ flex: '1 1 40%', minWidth: '280px', borderRight: `1px solid ${qBorder}`, overflowY: 'auto', padding: '24px' }}>
                {queueSelected ? (
                  <>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                      Source Material
                    </h2>
                    {queueSelected.image_url ? (
                      <div style={{ marginBottom: '20px' }}>
                        <img
                          src={queueSelected.image_url}
                          alt="Submitted flyer"
                          onClick={() => setQueueLightboxUrl(queueSelected.image_url)}
                          style={{
                            width: '100%', maxHeight: '500px', objectFit: 'contain',
                            borderRadius: '12px', border: `1px solid ${qBorder}`,
                            cursor: 'zoom-in', background: '#000',
                          }}
                        />
                        <p style={{ fontSize: '11px', color: qTextMuted, marginTop: '6px', textAlign: 'center' }}>
                          Click to zoom
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        padding: '40px', borderRadius: '12px', border: `1px dashed ${qBorder}`,
                        textAlign: 'center', color: qTextMuted, marginBottom: '20px',
                      }}>
                        No flyer uploaded — manual entry submission
                      </div>
                    )}
                    <div style={{ background: qSurfaceAlt, borderRadius: '10px', padding: '16px', border: `1px solid ${qBorder}` }}>
                      <h3 style={{ fontSize: '12px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', marginBottom: '12px' }}>
                        Submission Details
                      </h3>
                      {[
                        ['Artist', queueSelected.artist_name || '—'],
                        ['Venue', queueSelected.venue_name || '—'],
                        ['Date', queueSelected.event_date ? queueSelected.event_date.substring(0, 10) : '—'],
                        ['Submitter', queueSelected.submitter_email || 'Anonymous'],
                        ['Submitted', queueSelected.created_at ? new Date(queueSelected.created_at).toLocaleString() : '—'],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${qBorder}` }}>
                          <span style={{ fontSize: '12px', color: qTextMuted }}>{label}</span>
                          <span style={{ fontSize: '12px', color: qText, fontWeight: 600 }}>{value}</span>
                        </div>
                      ))}
                      {queueSelected.notes && (
                        <div style={{ marginTop: '10px' }}>
                          <span style={{ fontSize: '12px', color: qTextMuted }}>Notes:</span>
                          <p style={{ fontSize: '13px', color: qText, marginTop: '4px', lineHeight: 1.5 }}>{queueSelected.notes}</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: qTextMuted }}>
                    Select a submission from the queue
                  </div>
                )}
              </div>

              {/* ── Right: Editor Panel ─────────────────────────────────────── */}
              <div style={{ flex: '1 1 40%', minWidth: '300px', overflowY: 'auto', padding: '24px' }}>
                {queueSelected ? (
                  <>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                      Event Editor
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={qLabelStyle}>Artist / Band Name *</label>
                        <input style={qInputStyle} value={queueForm.artist_name} onChange={e => updateQueueForm('artist_name', e.target.value)} placeholder="e.g. The Gaslight Anthem" />
                      </div>
                      <div>
                        <label style={qLabelStyle}>Venue *</label>
                        <input list="queue-venue-options" style={qInputStyle} value={queueForm.venue_name} onChange={e => updateQueueForm('venue_name', e.target.value)} placeholder="Start typing..." />
                        <datalist id="queue-venue-options">
                          {QUEUE_VENUE_OPTIONS.map(v => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Date *</label>
                          <input type="date" style={qInputStyle} value={queueForm.event_date} onChange={e => updateQueueForm('event_date', e.target.value)} />
                        </div>
                        <div>
                          <label style={qLabelStyle}>Time</label>
                          <input type="time" style={qInputStyle} value={queueForm.event_time} onChange={e => updateQueueForm('event_time', e.target.value)} />
                        </div>
                      </div>
                      {queueDuplicates.length > 0 && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#EAB30815', border: '1px solid #EAB30844' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#FBBF24', marginBottom: '4px' }}>
                            ⚠️ Possible Duplicate{queueDuplicates.length > 1 ? 's' : ''}
                          </div>
                          {queueDuplicates.map(d => (
                            <div key={d.id} style={{ fontSize: '12px', color: qTextMuted }}>
                              {d.artist_name} at {d.venue_name} ({d.event_date?.substring(0, 10)})
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Genre</label>
                          <select style={{ ...qInputStyle, cursor: 'pointer' }} value={queueForm.genre} onChange={e => updateQueueForm('genre', e.target.value)}>
                            <option value="">Select...</option>
                            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={qLabelStyle}>Vibe</label>
                          <select style={{ ...qInputStyle, cursor: 'pointer' }} value={queueForm.vibe} onChange={e => updateQueueForm('vibe', e.target.value)}>
                            <option value="">Select...</option>
                            {VIBES.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Cover / Price</label>
                          <input style={qInputStyle} value={queueForm.cover} onChange={e => updateQueueForm('cover', e.target.value)} placeholder="Free, $10, etc." />
                        </div>
                        <div>
                          <label style={qLabelStyle}>Ticket Link</label>
                          <input style={qInputStyle} value={queueForm.ticket_link} onChange={e => updateQueueForm('ticket_link', e.target.value)} placeholder="https://..." />
                        </div>
                      </div>
                    </div>

                    {/* ── Action buttons ──────────────────────────────────────── */}
                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={handleQueueApprove}
                          disabled={queueActionLoading}
                          style={{
                            flex: 2, padding: '14px', borderRadius: '10px', border: 'none',
                            background: queueActionLoading ? qTextMuted : qGreen, color: '#000',
                            fontWeight: 700, fontSize: '15px', cursor: queueActionLoading ? 'default' : 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {queueActionLoading ? 'Processing...' : '✓ Approve & Publish'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={handleQueueReject}
                          disabled={queueActionLoading}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            border: `1px solid ${qBorder}`, background: 'transparent',
                            color: qText, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ✕ Reject
                        </button>
                        <button
                          onClick={handleQueueArchive}
                          disabled={queueActionLoading}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            border: `1px solid ${qBorder}`, background: 'transparent',
                            color: qTextMuted, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          📦 Save to Vault
                        </button>
                        <button
                          onClick={handleQueueBlock}
                          disabled={queueActionLoading}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            border: `1px solid ${qRed}33`, background: `${qRed}11`,
                            color: qRed, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          🚫 Block
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: qTextMuted, textAlign: 'center', marginTop: '16px' }}>
                      Review the source material on the left, edit fields as needed, then approve or reject.
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: qTextMuted }}>
                    No submissions to review
                  </div>
                )}
              </div>
            </div>
          )}
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

      {/* Queue Image Lightbox */}
      {queueLightboxUrl && (
        <div
          onClick={() => setQueueLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)', cursor: 'zoom-out',
          }}
        >
          <img
            src={queueLightboxUrl}
            alt="Flyer zoomed"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </div>
      )}

      {/* Admin Toast — top-center, enlarged */}
      {queueToast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          padding: '16px 32px', borderRadius: '14px',
          background: '#1A1A24', border: '1px solid #3A3A4A',
          color: '#F0F0F5', fontWeight: 700, fontSize: '16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 500,
          fontFamily: "'DM Sans', sans-serif",
          animation: 'slideDown 0.25s ease-out',
        }}>
          {queueToast}
        </div>
      )}
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
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
    is_spotlight: event?.is_spotlight || false,
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.recurring} onChange={(e) => update('recurring', e.target.checked)} />
              <label className="text-sm text-brand-text-secondary">Recurring event</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_spotlight} onChange={(e) => update('is_spotlight', e.target.checked)} />
              <label className="text-sm" style={{ color: '#E8722A', fontWeight: 600 }}>★ Spotlight Carousel</label>
            </div>
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
