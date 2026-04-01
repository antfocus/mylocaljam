'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import EventFormModal from '@/components/EventFormModal';
import AdminDashboardTab from '@/components/admin/AdminDashboardTab';
import AdminTriageTab from '@/components/admin/AdminTriageTab';
import AdminEventsTab from '@/components/admin/AdminEventsTab';
import AdminArtistsTab from '@/components/admin/AdminArtistsTab';
import AdminSpotlightTab from '@/components/admin/AdminSpotlightTab';
import AdminVenuesTab from '@/components/admin/AdminVenuesTab';
import AdminFestivalsTab from '@/components/admin/AdminFestivalsTab';
import AdminSubmissionsTab from '@/components/admin/AdminSubmissionsTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminArtistModals from '@/components/admin/AdminArtistModals';
import AdminLoginScreen from '@/components/admin/AdminLoginScreen';
import ModalWrapper from '@/components/ui/ModalWrapper';
import useAdminQueue from '@/hooks/useAdminQueue';
import useAdminTriage from '@/hooks/useAdminTriage';
import useAdminArtists from '@/hooks/useAdminArtists';

const TITLE_CASE_MINOR = new Set(['a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','by','of','up','as','is']);
function toTitleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0 || !TITLE_CASE_MINOR.has(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [returnToTab, setReturnToTab] = useState(null); // remembers which tab to return to after artist edit
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashDateRange, setDashDateRange] = useState('7d'); // 'today' | '7d' | '30d' | 'all'
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsEnv, setAnalyticsEnv] = useState('production'); // 'production' | 'dev'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileQueueDetail, setMobileQueueDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Session persistence: restore auth from sessionStorage on mount ──
  const sessionRestored = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('mlj_admin_pw');
      if (saved) {
        setPassword(saved);
        setAuthenticated(true);
        sessionRestored.current = true;
      }
    } catch { /* SSR or sessionStorage blocked */ }
  }, []);

  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [bulkTimeModal, setBulkTimeModal] = useState(false);
  const [bulkTime, setBulkTime] = useState('');
  const [bulkTimeLoading, setBulkTimeLoading] = useState(false);
  const [eventsStatusFilter, setEventsStatusFilter] = useState('upcoming');
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsMissingTime, setEventsMissingTime] = useState(false);
  const [eventsSortField, setEventsSortField] = useState('event_date');
  const [eventsSortOrder, setEventsSortOrder] = useState('asc');
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [newEvents24h, setNewEvents24h] = useState(0);
  const [eventsRecentlyAdded, setEventsRecentlyAdded] = useState(false);
  const [spotlightDate, setSpotlightDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [spotlightPins, setSpotlightPins] = useState([]);
  const [spotlightEvents, setSpotlightEvents] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [spotlightImageWarning, setSpotlightImageWarning] = useState(null); // event object needing image
  const [spotlightSearch, setSpotlightSearch] = useState('');

  const [queueToast, setQueueToast] = useState(null);
  const [flagsViewFilter, setFlagsViewFilter] = useState('pending');
  const [scraperHealth, setScraperHealth] = useState([]);
  const [venuesFilter, setVenuesFilter] = useState('all'); // 'all' | 'fail' | 'warning' | 'success'
  const [forceSyncing, setForceSyncing] = useState(null); // scraper_key currently syncing

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const toastTimerRef = useRef(null);
  const showQueueToast = (msgOrObj, undoFn = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const toast = typeof msgOrObj === 'string' ? { msg: msgOrObj, undoFn } : { ...msgOrObj, undoFn };
    setQueueToast(toast);
    const duration = toast.type === 'error' ? 8000 : toast.type === 'success' ? 4000 : (undoFn ? 5000 : 3000);
    toastTimerRef.current = setTimeout(() => { setQueueToast(null); toastTimerRef.current = null; }, duration);
  };

  const fetchEvents = useCallback(async (page = 1, sort = eventsSortField, order = eventsSortOrder, status = eventsStatusFilter, missingTime = eventsMissingTime, recentlyAdded = eventsRecentlyAdded) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '100', sort, order });
      if (status) params.set('status', status);
      if (missingTime) params.set('missingTime', 'true');
      if (recentlyAdded) params.set('recentlyAdded', 'true');
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) { setAuthenticated(false); try { sessionStorage.removeItem('mlj_admin_pw'); } catch {} alert('Invalid password'); return; }
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
      if (data.newEvents24h !== undefined) setNewEvents24h(data.newEvents24h);
    } catch (err) { console.error(err); }
  }, [password, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime, eventsRecentlyAdded]);

  const fetchAnalytics = useCallback(async (range, env) => {
    setAnalyticsLoading(true);
    try {
      const r = range || dashDateRange;
      const e = env || analyticsEnv;
      const res = await fetch(`/api/admin/analytics?password=${encodeURIComponent(password)}&range=${r}&env=${e}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [password, dashDateRange, analyticsEnv]);

  const fetchScraperHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/scraper-health', { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setScraperHealth(await res.json());
    } catch (err) { console.error('Failed to fetch scraper health:', err); }
  }, [password]);

  const handleForceSync = useCallback(async (scraperKey) => {
    if (forceSyncing) return;
    setForceSyncing(scraperKey);
    try {
      const res = await fetch('/api/admin/force-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ scraper_key: scraperKey }),
      });
      const data = await res.json();
      if (data.ok) {
        setQueueToast(`${scraperKey}: synced ${data.eventsScraped} events in ${data.duration}`);
        fetchScraperHealth();
      } else {
        setQueueToast(`${scraperKey} sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setQueueToast(`Force sync error: ${err.message}`);
    } finally {
      setForceSyncing(null);
    }
  }, [password, forceSyncing, fetchScraperHealth]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setReports(await res.json());
    } catch (err) { console.error('Failed to fetch reports:', err); }
  }, [password]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [, subRes, repRes] = await Promise.all([
        fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter),
        fetch('/api/submissions', { headers: { Authorization: `Bearer ${password}` } }),
        fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } }),
      ]);

      // Guard against 401/error responses — only set state if we got valid arrays
      if (subRes.ok) {
        const subData = await subRes.json();
        if (Array.isArray(subData)) setSubmissions(subData);
      }
      if (repRes.ok) {
        const repData = await repRes.json();
        if (Array.isArray(repData)) setReports(repData);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [password, fetchEvents, eventsSortField, eventsSortOrder, eventsStatusFilter]);

  const q = useAdminQueue({ password, venues, setVenues, fetchAll, supabase, toTitleCase, showQueueToast, authenticated });
  const tr = useAdminTriage({ password, showQueueToast });
  const ar = useAdminArtists({ password });

  const fetchSpotlightEvents = useCallback(async (date) => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '500', sort: 'event_date', order: 'asc', status: 'upcoming' });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) return [];
      const data = await res.json();
      const all = data.events || (Array.isArray(data) ? data : []);
      // Compare dates in Eastern timezone to handle UTC midnight crossover
      const filtered = all.filter(ev => {
        if (ev.status !== 'published') return false;
        try {
          const evDateET = new Date(ev.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          return evDateET === date;
        } catch {
          return (ev.event_date || '').slice(0, 10) === date;
        }
      });
      setSpotlightEvents(filtered);
      return filtered;
    } catch (err) {
      console.error('Failed to load spotlight events:', err);
      return [];
    }
  }, [password]);

  const fetchSpotlight = useCallback(async (date) => {
    setSpotlightLoading(true);
    let pinIds = [];
    try {
      const res = await fetch(`/api/spotlight?date=${date}`);
      const data = await res.json();
      pinIds = Array.isArray(data) ? data.map(d => d.event_id) : [];
    } catch (err) {
      console.error('Failed to load spotlight:', err);
    }
    // Load events FIRST, then filter pins to only valid event IDs
    const todayEvents = await fetchSpotlightEvents(date);
    const validEventIds = new Set(todayEvents.map(e => e.id));
    const cleanPins = pinIds.filter(id => validEventIds.has(id));
    setSpotlightPins(cleanPins);
    setSpotlightLoading(false);
  }, [fetchSpotlightEvents]);

  const saveSpotlight = async () => {
    // Clean stale pins before saving — only include IDs that exist in today's events
    const validPins = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id));
    setSpotlightPins(validPins);

    // 1. Save to spotlight_events table
    await fetch('/api/spotlight', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: spotlightDate, event_ids: validPins }),
    });

    // 2. Persist spotlight_order on each pinned event
    for (let i = 0; i < validPins.length; i++) {
      await fetch('/api/admin', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: validPins[i], spotlight_order: i, is_featured: true }),
      });
    }

    // 3. Clear spotlight_order on events that were un-pinned today
    const todayEvents = spotlightEvents;
    for (const ev of todayEvents) {
      if (!validPins.includes(ev.id) && ev.spotlight_order != null) {
        await fetch('/api/admin', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ id: ev.id, spotlight_order: null, is_featured: false }),
        });
      }
    }

    alert(`Spotlight saved for ${spotlightDate} (${validPins.length} event${validPins.length !== 1 ? 's' : ''})`);
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
      // Clean out stale IDs that no longer exist in today's events
      const clean = prev.filter(id => id === eventId || spotlightEvents.some(e => e.id === id));
      if (clean.includes(eventId)) return clean.filter(id => id !== eventId);
      if (clean.length >= 5) { alert('Maximum 5 spotlight events per day'); return clean; }
      return [...clean, eventId];
    });
  };

  // ── Auto-fetch when session is restored from sessionStorage ──
  useEffect(() => {
    if (authenticated && sessionRestored.current) {
      sessionRestored.current = false; // only fire once
      fetchAll();
      q.fetchQueue();
      tr.fetchTriage();
      ar.fetchArtists();
      fetchScraperHealth();
      fetchVenues();
      fetchFestivalNames();
    }
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e) => {
    e.preventDefault();
    // Validate password with a lightweight API call before setting authenticated
    try {
      const testRes = await fetch('/api/admin?page=1&limit=1', {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (testRes.status === 401) {
        alert('Invalid password');
        return;
      }
      if (!testRes.ok) {
        alert(`Login failed (HTTP ${testRes.status})`);
        return;
      }
    } catch (err) {
      alert(`Login failed: ${err.message}`);
      return;
    }
    setAuthenticated(true);
    try { sessionStorage.setItem('mlj_admin_pw', password); } catch { /* blocked */ }
    fetchAll();
    q.fetchQueue();
    tr.fetchTriage();
    ar.fetchArtists();
    fetchScraperHealth();
    fetchAnalytics(); // PostHog analytics for dashboard
    fetchVenues(); // populate venue datalist for queue triage
    fetchFestivalNames(); // populate festival name autocomplete
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

  // ── Category update (error correction in History tab) ─────────────────────
  const CATEGORY_OPTIONS = [
    { key: 'Live Music', label: 'Live Music', color: '#23CE6B' },
    { key: 'Food & Drink Special', label: 'Food & Drink', color: '#F59E0B' },
    { key: 'Trivia', label: 'Trivia', color: '#8B5CF6' },
    { key: 'Sports / Watch Party', label: 'Sports', color: '#3B82F6' },
    { key: 'Other / Special Event', label: 'Other', color: '#EC4899' },
  ];

  const updateEventCategory = async (ev, newCategory) => {
    const prev = events;
    setEvents(p => p.map(e => e.id === ev.id ? { ...e, category: newCategory, triage_status: 'reviewed' } : e));
    try {
      const body = { id: ev.id, category: newCategory, triage_status: 'reviewed' };
      if (newCategory !== 'Live Music') {
        body.artist_bio = null;
        body.artist_id = null;
      }
      const res = await fetch('/api/admin', { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showQueueToast(`Re-categorized → ${newCategory}`);
    } catch (err) {
      console.error('Category update failed:', err);
      setEvents(prev);
    }
  };

  // ── Venue loader (populates datalist for queue triage) ──────────────────────
  const fetchVenues = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name')
        .order('name');
      if (!error && data) setVenues(data);
    } catch (err) { console.error('Failed to load venues:', err); }
  }, []);

  // ── Festival name autocomplete (distinct event_titles from events) ──────────
  const [festivalNames, setFestivalNames] = useState([]);
  const [festivalData, setFestivalData] = useState([]); // { name, count, events[] }
  const [festivalSearch, setFestivalSearch] = useState('');
  const [editingFestival, setEditingFestival] = useState(null); // { name, newName }
  const fetchFestivalNames = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, event_title, artist_name, event_date, venue_name')
        .not('event_title', 'is', null)
        .not('event_title', 'eq', '')
        .order('event_title')
        .limit(1000);
      if (!error && data) {
        const unique = [...new Set(data.map(e => e.event_title).filter(Boolean))].sort();
        setFestivalNames(unique);
        // Group by festival name with counts
        const grouped = {};
        for (const e of data) {
          const key = e.event_title;
          if (!grouped[key]) grouped[key] = { name: key, count: 0, events: [] };
          grouped[key].count++;
          grouped[key].events.push(e);
        }
        setFestivalData(Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) { console.error('Failed to load festival names:', err); }
  }, []);

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


  if (!authenticated) {
    return <AdminLoginScreen password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} handleLogin={handleLogin} />;
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12" style={{ background: 'var(--bg-primary)', minHeight: '100vh', padding: isMobile ? '0 12px' : '0 16px' }}>
      {/* Header */}
      <header className="flex items-center justify-between py-5 border-b border-white/[0.06] mb-6" style={{ paddingTop: isMobile ? '12px' : '20px', paddingBottom: isMobile ? '12px' : '20px' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'var(--accent)', width: isMobile ? '32px' : '40px', height: isMobile ? '32px' : '40px' }}>
            {Icons.settings}
          </div>
          <div className="font-display font-extrabold" style={{ fontSize: isMobile ? '16px' : '20px' }}>
            my<span style={{ color: 'var(--accent)' }}>Local</span>Jam {!isMobile && '— Admin'}
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center gap-3">
            <a href="/" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {Icons.eye} View Site
            </a>
            <button onClick={fetchAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              ↻ Refresh
            </button>
          </div>
        )}
      </header>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="admin-tabs flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {[
          { key: 'dashboard', label: 'Dashboard', count: 0 },
          { key: 'triage', label: 'Triage', count: tr.triageEvents.length },
          { key: 'events', label: 'Event Feed', count: eventsTotal || events.length },
          { key: 'artists', label: 'Artists', count: ar.artists.length },
          { key: 'spotlight', label: 'Spotlight', count: spotlightPins.length },
          { key: 'venues', label: 'Venues', count: scraperHealth.filter(s => s.status === 'fail').length },
          { key: 'festivals', label: 'Festivals', count: festivalData.length },
          { key: 'submissions', label: 'Submissions', count: q.queue.length },
          { key: 'reports', label: 'User Flags', count: reports.filter((r) => r.status === 'pending').length },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`py-2.5 rounded-lg font-display font-semibold text-sm transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-brand-text-muted'
            }`}
            style={{
              whiteSpace: 'nowrap', flexShrink: 0, padding: '10px 14px',
              ...(activeTab === tab.key
                ? { background: 'var(--bg-card)', borderBottom: '2px solid #E8722A', color: '#FFFFFF' }
                : { opacity: 0.6 }),
            }}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'dashboard') { fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (ar.artists.length === 0) ar.fetchArtists(); fetchReports(); fetchScraperHealth(); } if (tab.key === 'events') fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (tab.key === 'triage') tr.fetchTriage(); if (tab.key === 'spotlight') { setSpotlightSearch(''); fetchSpotlight(spotlightDate); if (ar.artists.length === 0) ar.fetchArtists(); } if (tab.key === 'submissions') { setMobileQueueDetail(false); q.fetchQueue(); } if (tab.key === 'artists') ar.fetchArtists(ar.artistsSearch, ar.artistsNeedsInfo); if (tab.key === 'venues') fetchScraperHealth(); if (tab.key === 'reports') { setFlagsViewFilter('pending'); fetchReports(); } if (tab.key === 'festivals') fetchFestivalNames(); }}
          >
            {tab.label} {tab.count > 0 && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: tab.key !== 'events' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab.key !== 'events' ? '#1C1917' : 'var(--text-secondary)' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Scrollbar-hide for mobile tabs */}
      <style>{`.admin-tabs::-webkit-scrollbar { display: none; }`}</style>

      {loading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading...</div>}

      {/* ── Dashboard Tab — Platform Analytics ───────────────────────────── */}
      {activeTab === 'dashboard' && !loading && (
        <AdminDashboardTab
          events={events} artists={ar.artists} reports={reports} venues={venues}
          scraperHealth={scraperHealth}
          eventsTotal={eventsTotal} newEvents24h={newEvents24h}
          dashDateRange={dashDateRange} setDashDateRange={setDashDateRange}
          analyticsData={analyticsData} analyticsLoading={analyticsLoading}
          analyticsEnv={analyticsEnv} setAnalyticsEnv={setAnalyticsEnv}
          fetchAnalytics={fetchAnalytics} fetchEvents={fetchEvents}
          fetchArtists={ar.fetchArtists} fetchScraperHealth={fetchScraperHealth}
          fetchReports={fetchReports}
          eventsSortField={eventsSortField} eventsSortOrder={eventsSortOrder}
          eventsStatusFilter={eventsStatusFilter} setEventsStatusFilter={setEventsStatusFilter} setActiveTab={setActiveTab}
          setVenuesFilter={setVenuesFilter} setEventsRecentlyAdded={setEventsRecentlyAdded}
          setEvents={setEvents} setFlagsViewFilter={setFlagsViewFilter}
          setEventsMissingTime={setEventsMissingTime} setArtistMissingFilters={ar.setArtistMissingFilters}
        />
      )}

      {/* ── Triage Tab ── */}
      {activeTab === 'triage' && (
        <AdminTriageTab
          events={events} venues={venues}
          triageEvents={tr.triageEvents} triageLoading={tr.triageLoading}
          triageActionId={tr.triageActionId}
          triageCategorize={tr.triageCategorize} triageDelete={tr.triageDelete}
          fetchTriage={tr.fetchTriage}
          setEditingEvent={setEditingEvent} setShowEventForm={setShowEventForm}
        />
      )}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (
        <AdminEventsTab
          events={events} artists={ar.artists} venues={venues} password={password}
          isMobile={isMobile}
          eventsSearch={eventsSearch} setEventsSearch={setEventsSearch}
          eventsStatusFilter={eventsStatusFilter} setEventsStatusFilter={setEventsStatusFilter}
          eventsMissingTime={eventsMissingTime} setEventsMissingTime={setEventsMissingTime}
          eventsSortField={eventsSortField} setEventsSortField={setEventsSortField}
          eventsSortOrder={eventsSortOrder} setEventsSortOrder={setEventsSortOrder}
          eventsPage={eventsPage} setEventsPage={setEventsPage}
          eventsTotalPages={eventsTotalPages} eventsTotal={eventsTotal}
          newEvents24h={newEvents24h} eventsRecentlyAdded={eventsRecentlyAdded}
          setEventsRecentlyAdded={setEventsRecentlyAdded}
          selectedEvents={selectedEvents} setSelectedEvents={setSelectedEvents}
          setEvents={setEvents}
          fetchEvents={fetchEvents} deleteEvent={deleteEvent}
          toggleFeatured={toggleFeatured} unpublishEvent={unpublishEvent}
          updateEventCategory={updateEventCategory}
          CATEGORY_OPTIONS={CATEGORY_OPTIONS}
          setEditingEvent={setEditingEvent} setShowEventForm={setShowEventForm}
          setBulkTimeModal={setBulkTimeModal} setBulkTime={setBulkTime}
          showQueueToast={showQueueToast}
        />
      )}

      {/* Artists Tab */}
      {activeTab === 'artists' && !loading && (
        <AdminArtistsTab
          artists={ar.artists} events={events} venues={venues} password={password} isMobile={isMobile}
          artistsSearch={ar.artistsSearch} setArtistsSearch={ar.setArtistsSearch}
          artistsNeedsInfo={ar.artistsNeedsInfo} setArtistsNeedsInfo={ar.setArtistsNeedsInfo}
          artistMissingFilters={ar.artistMissingFilters} setArtistMissingFilters={ar.setArtistMissingFilters}
          artistsSortBy={ar.artistsSortBy} setArtistsSortBy={ar.setArtistsSortBy}
          artistSourceFilter={ar.artistSourceFilter} setArtistSourceFilter={ar.setArtistSourceFilter}
          artistSubTab={ar.artistSubTab} setArtistSubTab={ar.setArtistSubTab}
          directorySort={ar.directorySort} setDirectorySort={ar.setDirectorySort}
          editingArtist={ar.editingArtist} setEditingArtist={ar.setEditingArtist}
          artistForm={ar.artistForm} setArtistForm={ar.setArtistForm}
          artistActionLoading={ar.artistActionLoading} setArtistActionLoading={ar.setArtistActionLoading}
          aiLoading={ar.aiLoading} setAiLoading={ar.setAiLoading}
          artistToast={ar.artistToast} setArtistToast={ar.setArtistToast}
          artistEvents={ar.artistEvents} setArtistEvents={ar.setArtistEvents}
          duplicateNameWarning={ar.duplicateNameWarning} setDuplicateNameWarning={ar.setDuplicateNameWarning}
          regeneratingField={ar.regeneratingField} setRegeneratingField={ar.setRegeneratingField}
          imageCandidates={ar.imageCandidates} setImageCandidates={ar.setImageCandidates}
          imageCarouselIdx={ar.imageCarouselIdx} setImageCarouselIdx={ar.setImageCarouselIdx}
          editPanelRef={ar.editPanelRef}
          selectedArtists={ar.selectedArtists} setSelectedArtists={ar.setSelectedArtists}
          bulkEnrichProgress={ar.bulkEnrichProgress}
          deleteConfirm={ar.deleteConfirm} setDeleteConfirm={ar.setDeleteConfirm}
          enrichConfirm={ar.enrichConfirm} setEnrichConfirm={ar.setEnrichConfirm}
          bulkDeleteConfirm={ar.bulkDeleteConfirm} setBulkDeleteConfirm={ar.setBulkDeleteConfirm}
          mergeConfirm={ar.mergeConfirm} setMergeConfirm={ar.setMergeConfirm}
          mergeMasterId={ar.mergeMasterId} setMergeMasterId={ar.setMergeMasterId}
          fetchArtists={ar.fetchArtists} runBulkEnrich={ar.runBulkEnrich}
          regenerateField={ar.regenerateField} showQueueToast={showQueueToast}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab} returnToTab={returnToTab}
          GENRES={GENRES} VIBES={VIBES}
        />
      )}

      {/* Spotlight Tab */}
      {activeTab === 'spotlight' && !loading && (
        <AdminSpotlightTab
          artists={ar.artists} events={events}
          spotlightDate={spotlightDate} setSpotlightDate={setSpotlightDate}
          spotlightPins={spotlightPins} setSpotlightPins={setSpotlightPins}
          spotlightEvents={spotlightEvents} spotlightLoading={spotlightLoading}
          spotlightSearch={spotlightSearch} setSpotlightSearch={setSpotlightSearch}
          setSpotlightImageWarning={setSpotlightImageWarning}
          fetchSpotlight={fetchSpotlight} fetchSpotlightEvents={fetchSpotlightEvents}
          saveSpotlight={saveSpotlight} clearSpotlight={clearSpotlight}
          toggleSpotlightPin={toggleSpotlightPin}
        />
      )}

      {/* Venues Tab */}
      {activeTab === 'venues' && !loading && (
        <AdminVenuesTab
          events={events} venues={venues}
          scraperHealth={scraperHealth} venuesFilter={venuesFilter}
          setVenuesFilter={setVenuesFilter}
          forceSyncing={forceSyncing} handleForceSync={handleForceSync}
        />
      )}

      {/* Festivals Tab */}
      {activeTab === 'festivals' && !loading && (
        <AdminFestivalsTab
          events={events} submissions={submissions} password={password}
          festivalData={festivalData} festivalSearch={festivalSearch}
          setFestivalSearch={setFestivalSearch}
          editingFestival={editingFestival} setEditingFestival={setEditingFestival}
          fetchFestivalNames={fetchFestivalNames}
        />
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && !loading && (
        <AdminSubmissionsTab
          artists={ar.artists} venues={venues} queue={q.queue}
          submissions={submissions} reports={reports}
          queueSelectedIdx={q.queueSelectedIdx} queueActionLoading={q.queueActionLoading}
          queueForm={q.queueForm} queueDuplicates={q.queueDuplicates} queueDupLoading={q.queueDupLoading}
          adminFlyerUploading={q.adminFlyerUploading}
          adminFlyerDragOver={q.adminFlyerDragOver} setAdminFlyerDragOver={q.setAdminFlyerDragOver}
          newVenueOpen={q.newVenueOpen} setNewVenueOpen={q.setNewVenueOpen}
          newVenueName={q.newVenueName} setNewVenueName={q.setNewVenueName}
          newVenueAddress={q.newVenueAddress} setNewVenueAddress={q.setNewVenueAddress}
          newVenueLoading={q.newVenueLoading}
          isMobile={isMobile} mobileQueueDetail={mobileQueueDetail} setMobileQueueDetail={setMobileQueueDetail}
          qSurface={q.qSurface} qSurfaceAlt={q.qSurfaceAlt} qBorder={q.qBorder}
          qText={q.qText} qTextMuted={q.qTextMuted} qAccent={q.qAccent}
          fetchQueue={q.fetchQueue} handleAdminFlyerUpload={q.handleAdminFlyerUpload}
          selectQueueItem={q.selectQueueItem} updateQueueForm={q.updateQueueForm}
          handleQueueApprove={q.handleQueueApprove} handleQueueReject={q.handleQueueReject}
          handleQueueArchive={q.handleQueueArchive}
          handleCreateVenue={q.handleCreateVenue} resolveVenueId={q.resolveVenueId}
          applyBatchToFlyer={q.applyBatchToFlyer}
          setQueueLightboxUrl={q.setQueueLightboxUrl}
          adminFlyerRef={q.adminFlyerRef}
          queueSelected={q.queueSelected}
          festivalNames={festivalNames}
          batchApplyPrompt={q.batchApplyPrompt} setBatchApplyPrompt={q.setBatchApplyPrompt}
          qLabelStyle={q.qLabelStyle} qInputStyle={q.qInputStyle}
          qGreen={q.qGreen} qRed={q.qRed}
        />
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && !loading && (
        <AdminReportsTab
          reports={reports} setReports={setReports} events={events}
          artists={ar.artists} venues={venues} password={password}
          flagsViewFilter={flagsViewFilter} setFlagsViewFilter={setFlagsViewFilter}
          setEditingEvent={setEditingEvent} setShowEventForm={setShowEventForm}
          setEditingArtist={ar.setEditingArtist} setArtistForm={ar.setArtistForm}
          setArtistsSearch={ar.setArtistsSearch} setArtistSubTab={ar.setArtistSubTab}
          setImageCandidates={ar.setImageCandidates} setImageCarouselIdx={ar.setImageCarouselIdx}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab}
          fetchArtists={ar.fetchArtists} showQueueToast={showQueueToast}
        />
      )}

      {/* Spotlight Missing Image Warning Modal */}
      {spotlightImageWarning && (
        <ModalWrapper onClose={() => setSpotlightImageWarning(null)} maxWidth="420px">
          <>
            <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
              Missing Artist Image
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{spotlightImageWarning.artist_name}</strong> is missing a profile image. Spotlight features require an image to render correctly on mobile.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={async () => {
                  const ev = spotlightImageWarning;
                  setSpotlightImageWarning(null);

                  // Ensure artists are loaded (they may not be if user went straight to Spotlight)
                  let pool = ar.artists;
                  if (!pool || pool.length === 0) {
                    try {
                      const res = await fetch(`/api/admin/artists?limit=2000`, { headers: { Authorization: `Bearer ${password}` } });
                      if (res.ok) {
                        const data = await res.json();
                        pool = Array.isArray(data) ? data : (data.artists || []);
                        ar.setArtists(pool);
                      }
                    } catch { /* fall through to search fallback */ }
                  }

                  // Find the linked artist by ID first, then name
                  const linkedArtist = ev.artist_id
                    ? pool.find(a => a.id === ev.artist_id)
                    : pool.find(a => a.name?.toLowerCase() === ev.artist_name?.toLowerCase());

                  // Remember where we came from, then route to Artists → Triage sub-tab
                  setReturnToTab('spotlight');
                  setActiveTab('artists');
                  ar.setArtistSubTab('triage');

                  if (linkedArtist) {
                    ar.setEditingArtist(linkedArtist);
                    ar.setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                    ar.setImageCarouselIdx(0);
                    ar.setArtistForm({
                      name: linkedArtist.name || '',
                      bio: linkedArtist.bio || '',
                      genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                      vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                      image_url: linkedArtist.image_url || '',
                    });
                  } else {
                    ar.setArtistsSearch(ev.artist_name || '');
                    ar.fetchArtists(ev.artist_name || '', false);
                  }
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(232,114,42,0.12)', color: '#E8722A',
                  border: '1px solid rgba(232,114,42,0.3)', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Edit Artist Profile
              </button>
              <button
                onClick={() => {
                  toggleSpotlightPin(spotlightImageWarning.id);
                  setSpotlightImageWarning(null);
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                  border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Spotlight with Default Graphic
              </button>
              <button
                onClick={() => setSpotlightImageWarning(null)}
                style={{
                  padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        </ModalWrapper>
      )}

      {/* Bulk Edit Time Modal */}
      {bulkTimeModal && (
        <ModalWrapper onClose={() => { if (!bulkTimeLoading) setBulkTimeModal(false); }} maxWidth="360px">
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Set Time for {selectedEvents.size} Event{selectedEvents.size !== 1 ? 's' : ''}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              This will update the start time on all selected events.
            </p>
            <input
              type="time"
              value={bulkTime}
              onChange={e => setBulkTime(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif", outline: 'none', marginBottom: '16px',
              }}
            />
            {bulkTimeLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#E8722A', fontWeight: 600 }}>
                Updating...
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setBulkTimeModal(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  disabled={!bulkTime}
                  onClick={async () => {
                    if (!bulkTime) return;
                    setBulkTimeLoading(true);
                    try {
                      const ids = [...selectedEvents];
                      for (const id of ids) {
                        // Get existing event to preserve its date
                        const ev = events.find(e => e.id === id);
                        if (!ev) continue;
                        const existingDate = ev.event_date ? new Date(ev.event_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
                        const newDateTime = new Date(`${existingDate}T${bulkTime}:00`).toISOString();
                        await fetch('/api/admin', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                          body: JSON.stringify({ id, event_date: newDateTime, is_time_tbd: false }),
                        });
                      }
                      setBulkTimeModal(false);
                      setSelectedEvents(new Set());
                      fetchEvents(1, eventsSortField, eventsSortOrder);
                      showQueueToast(`Updated time to ${bulkTime} on ${ids.length} event(s)`);
                    } catch (err) {
                      console.error('Bulk time update error:', err);
                      showQueueToast('Bulk time update failed');
                    }
                    setBulkTimeLoading(false);
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: bulkTime ? '#E8722A' : 'rgba(232,114,42,0.2)',
                    color: bulkTime ? '#1C1917' : '#666',
                    border: 'none', cursor: bulkTime ? 'pointer' : 'not-allowed',
                  }}
                >Save Time</button>
              </div>
            )}
          </>
        </ModalWrapper>
      )}

      {/* Event Form Modal */}
      {showEventForm && (
        <EventFormModal
          event={editingEvent}
          artists={ar.artists}
          venues={venues}
          onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
          onSave={saveEvent}
          adminPassword={password}
        />
      )}

      {/* Queue Image Lightbox */}
      {q.queueLightboxUrl && (
        <ModalWrapper
          onClose={() => q.setQueueLightboxUrl(null)}
          zIndex={300}
          blur={0}
          overlayBg="rgba(0,0,0,0.9)"
          overlayStyle={{ cursor: 'zoom-out' }}
          cardStyle={{
            background: 'none', border: 'none', boxShadow: 'none',
            padding: 0, maxWidth: '95vw', maxHeight: '95vh', width: 'auto',
            borderRadius: 0, overflow: 'visible',
          }}
        >
          <img
            src={q.queueLightboxUrl}
            alt="Flyer zoomed"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </ModalWrapper>
      )}

      {/* Sticky Bulk Action Bar + Artist Modals */}
      <AdminArtistModals
        activeTab={activeTab}
        artists={ar.artists} password={password}
        selectedArtists={ar.selectedArtists} setSelectedArtists={ar.setSelectedArtists}
        bulkEnrichProgress={ar.bulkEnrichProgress} setBulkEnrichProgress={ar.setBulkEnrichProgress}
        enrichConfirm={ar.enrichConfirm} setEnrichConfirm={ar.setEnrichConfirm}
        bulkDeleteConfirm={ar.bulkDeleteConfirm} setBulkDeleteConfirm={ar.setBulkDeleteConfirm}
        bulkDeleteLoading={ar.bulkDeleteLoading} setBulkDeleteLoading={ar.setBulkDeleteLoading}
        mergeConfirm={ar.mergeConfirm} setMergeConfirm={ar.setMergeConfirm}
        mergeMasterId={ar.mergeMasterId} setMergeMasterId={ar.setMergeMasterId}
        mergeLoading={ar.mergeLoading} setMergeLoading={ar.setMergeLoading}
        deleteConfirm={ar.deleteConfirm} setDeleteConfirm={ar.setDeleteConfirm}
        runBulkEnrich={ar.runBulkEnrich} fetchArtists={ar.fetchArtists}
        showQueueToast={showQueueToast}
      />

      {/* Admin Toast — top-center, enlarged */}
      {queueToast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          padding: '14px 24px', borderRadius: '14px',
          background: queueToast?.type === 'error' ? '#3A1A1A' : queueToast?.type === 'success' ? '#0D2818' : '#1A1A24',
          border: queueToast?.type === 'error' ? '1px solid #ef4444' : queueToast?.type === 'success' ? '1px solid #23CE6B' : '1px solid #3A3A4A',
          color: queueToast?.type === 'error' ? '#fca5a5' : queueToast?.type === 'success' ? '#86efac' : '#F0F0F5',
          fontWeight: 700, fontSize: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 500,
          fontFamily: "'DM Sans', sans-serif",
          animation: 'slideDown 0.25s ease-out',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>{typeof queueToast === 'string' ? queueToast : (queueToast.msg || queueToast.message || 'Something went wrong')}</span>
          {queueToast?.undoFn && (
            <button
              onClick={() => { queueToast.undoFn(); setQueueToast(null); }}
              style={{
                background: 'none', border: '1px solid #E8722A', borderRadius: '6px',
                color: '#E8722A', fontWeight: 700, fontSize: '12px',
                padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
