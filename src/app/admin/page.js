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
  const [artists, setArtists] = useState([]);
  const [artistsSearch, setArtistsSearch] = useState('');
  const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
  const [artistMissingFilters, setArtistMissingFilters] = useState({ bio: false, image_url: false, genres: false, vibes: false });
  const [artistsSortBy, setArtistsSortBy] = useState('name'); // 'name' | 'next_event' | 'date_added'
  const [artistSourceFilter, setArtistSourceFilter] = useState('all'); // 'all' | 'lastfm' | 'scraper' | 'ai_generated' | 'manual' | 'unknown'
  const [artistSubTab, setArtistSubTab] = useState('directory'); // 'directory' | 'triage'
  const [directorySort, setDirectorySort] = useState({ col: 'date_added', dir: 'desc' }); // col: 'name' | 'next_event' | 'date_added'
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistForm, setArtistForm] = useState({ name: '', bio: '', genres: '', vibes: '', image_url: '' });
  const [artistActionLoading, setArtistActionLoading] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [artistToast, setArtistToast] = useState(null);
  const [selectedArtists, setSelectedArtists] = useState(new Set());
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState(null); // { done, total } or null
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { artist, eventCount } or null
  const [artistEvents, setArtistEvents] = useState([]); // associated events for edit modal
  const [enrichConfirm, setEnrichConfirm] = useState(null); // array of artist objects to enrich, or null
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null); // { artists: [...], totalEvents: N, perArtistCounts: { id: count } } or null
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(null); // array of artist objects, or null
  const [mergeMasterId, setMergeMasterId] = useState(null); // selected master artist id
  const [mergeLoading, setMergeLoading] = useState(false);
  const [duplicateNameWarning, setDuplicateNameWarning] = useState(null); // existing artist name that conflicts
  const dupCheckTimer = useRef(null);

  // Proactive duplicate name check — debounced 500ms on artist name input
  useEffect(() => {
    if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current);
    setDuplicateNameWarning(null);

    if (!editingArtist || !artistForm.name) return;
    const trimmed = artistForm.name.trim();
    // Don't warn if name hasn't changed
    if (trimmed === editingArtist.name) return;
    if (trimmed.length < 2) return;

    dupCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/artists?search=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${password}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          const exact = data.find(a => a.name.toLowerCase() === trimmed.toLowerCase() && a.id !== editingArtist.id);
          if (exact) {
            setDuplicateNameWarning(exact.name);
          }
        }
      } catch { /* ignore check failures */ }
    }, 500);

    return () => { if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current); };
  }, [artistForm.name, editingArtist, password]);

  const [regeneratingField, setRegeneratingField] = useState(null); // 'bio' | 'image_url' | 'genres' | null
  const [imageCandidates, setImageCandidates] = useState([]); // top 5 image URLs from Serper
  const [imageCarouselIdx, setImageCarouselIdx] = useState(0);
  const editPanelRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingArtist]);

  // Keep editingArtist lock state in sync with the artists array (source of truth from DB)
  // This fires whenever fetchArtists() completes, master toggle changes, or pill toggles fire
  useEffect(() => {
    if (!editingArtist) return;
    const fresh = artists.find(a => a.id === editingArtist.id);
    if (!fresh) return;
    // Sync lock-related fields from the freshly-fetched artist data
    const freshLocks = fresh.is_human_edited || {};
    const currentLocks = editingArtist.is_human_edited || {};
    const freshIsLocked = !!fresh.is_locked;
    const currentIsLocked = !!editingArtist.is_locked;
    if (JSON.stringify(freshLocks) !== JSON.stringify(currentLocks) || freshIsLocked !== currentIsLocked) {
      setEditingArtist(prev => prev ? ({ ...prev, is_human_edited: freshLocks, is_locked: fresh.is_locked }) : prev);
    }
  }, [artists]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Triage state ───────────────────────────────────────────────────────────
  const [triageEvents, setTriageEvents] = useState([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageActionId, setTriageActionId] = useState(null); // event id being categorized

  // ── Queue state (inlined from Approval Queue page) ─────────────────────────
  const [queue, setQueue] = useState([]);
  const [queueSelectedIdx, setQueueSelectedIdx] = useState(0);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [queueForm, setQueueForm] = useState({
    artist_name: '', venue_name: '', event_date: '', event_time: '',
    genre: '', vibe: '', cover: '', ticket_link: '', event_name: '',
    category: '', confidence_score: 0,
  });
  const [queueDuplicates, setQueueDuplicates] = useState([]);
  const [queueDupLoading, setQueueDupLoading] = useState(false);
  const [queueLightboxUrl, setQueueLightboxUrl] = useState(null);
  const [queueToast, setQueueToast] = useState(null);
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [newVenueLoading, setNewVenueLoading] = useState(false);
  const [adminFlyerUploading, setAdminFlyerUploading] = useState(false);
  const [adminFlyerDragOver, setAdminFlyerDragOver] = useState(false);
  const adminFlyerRef = useRef(null);
  const [flagsViewFilter, setFlagsViewFilter] = useState('pending'); // 'pending' | 'archived'
  const [scraperHealth, setScraperHealth] = useState([]);
  const [venuesFilter, setVenuesFilter] = useState('all'); // 'all' | 'fail' | 'warning' | 'success'
  const [forceSyncing, setForceSyncing] = useState(null); // scraper_key currently syncing

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

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

  const fetchArtists = useCallback(async (search = '', needsInfo = false) => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (needsInfo) params.set('needsInfo', 'true');
      const res = await fetch(`/api/admin/artists?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) {
        const data = await res.json();
        setArtists(data);
        setSelectedArtists(new Set()); // clear selection on refresh
      }
    } catch (err) { console.error('Failed to fetch artists:', err); }
  }, [password]);

  const runBulkEnrich = async (overrideList) => {
    const toEnrich = overrideList || artists.filter(a => selectedArtists.has(a.id));
    if (toEnrich.length === 0) return;
    setBulkEnrichProgress({ done: 0, total: toEnrich.length });
    let done = 0;

    for (const artist of toEnrich) {
      try {
        // Skip master-locked artists entirely — their data is protected
        if (artist.is_locked) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }

        // Call AI lookup
        const res = await fetch('/api/admin/artists/ai-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ artistName: artist.name }),
        });
        if (!res.ok) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }
        const ai = await res.json();

        // Build update payload — only fill empty/unlocked fields
        const update = { id: artist.id };
        const prevStatus = artist.field_status || {};
        const newStatus = { ...prevStatus };

        if (ai.bio && !artist.bio) { update.bio = ai.bio; newStatus.bio = 'pending'; }
        if (ai.genres?.length && (!artist.genres || artist.genres.length === 0)) { update.genres = ai.genres; newStatus.genres = 'pending'; }
        if (ai.vibes?.length && (!artist.vibes || artist.vibes.length === 0)) { update.vibes = ai.vibes; newStatus.vibes = 'pending'; }
        if (ai.image_url && !artist.image_url) { update.image_url = ai.image_url; newStatus.image_url = 'pending'; }
        if (ai.is_tribute !== undefined && !artist.is_tribute) update.is_tribute = ai.is_tribute;

        // Only save if there's something to update
        if (Object.keys(update).length > 1) {
          update.field_status = newStatus;
          update.metadata_source = 'ai_generated';
          await fetch('/api/admin/artists', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
            body: JSON.stringify(update),
          });
        }
      } catch (err) {
        console.error(`Enrichment failed for ${artist.name}:`, err);
      }
      done++;
      setBulkEnrichProgress({ done, total: toEnrich.length });
      // Small delay to avoid hammering API
      await new Promise(r => setTimeout(r, 300));
    }

    setBulkEnrichProgress(null);
    setSelectedArtists(new Set());
    fetchArtists(artistsSearch, artistsNeedsInfo);
    setArtistToast({ type: 'success', message: `AI enrichment complete: ${done} artists processed` });
    setTimeout(() => setArtistToast(null), 4000);
  };

  // ── Single-field Regenerate — force a fresh AI call for one field ──────────
  const regenerateField = async (field) => {
    if (!editingArtist) return;
    setRegeneratingField(field);
    setArtistToast(null);
    try {
      const res = await fetch('/api/admin/artists/ai-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ artistName: editingArtist.name }),
      });
      if (!res.ok) throw new Error('AI lookup failed');
      const ai = await res.json();

      // Only update the specific field requested
      if (field === 'bio' && ai.bio) {
        setArtistForm(p => ({ ...p, bio: ai.bio }));
        setArtistToast({ type: 'success', message: 'Bio regenerated — review & save' });
      } else if (field === 'image_url' && ai.image_candidates?.length > 0) {
        setImageCandidates(ai.image_candidates);
        setImageCarouselIdx(0);
        setArtistForm(p => ({ ...p, image_url: ai.image_candidates[0] }));
        const note = ai.image_source === 'placeholder' ? ' (placeholders)' : ` (${ai.image_candidates.length} options)`;
        setArtistToast({ type: 'success', message: `Images refreshed${note} — use arrows to browse` });
      } else if (field === 'genres' && ai.genres?.length) {
        setArtistForm(p => ({ ...p, genres: ai.genres.join(', ') }));
        // Also update vibes if available
        if (ai.vibes?.length) setArtistForm(p => ({ ...p, vibes: ai.vibes.join(', ') }));
        setArtistToast({ type: 'success', message: 'Genres & vibes regenerated — review & save' });
      } else {
        setArtistToast({ type: 'error', message: `AI couldn't generate a new ${field}` });
      }
      setTimeout(() => setArtistToast(null), 4000);
    } catch (err) {
      console.error('Regenerate error:', err);
      setArtistToast({ type: 'error', message: 'Regeneration failed' });
      setTimeout(() => setArtistToast(null), 4000);
    }
    setRegeneratingField(null);
  };

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

  // ── Triage functions ─────────────────────────────────────────────────────────
  const fetchTriage = useCallback(async () => {
    setTriageLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '200', sort: 'event_date', order: 'asc', triage: 'pending' });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) return;
      const data = await res.json();
      setTriageEvents(data.events || (Array.isArray(data) ? data : []));
    } catch (err) { console.error('Triage fetch error:', err); }
    setTriageLoading(false);
  }, [password]);

  const triageCategorize = async (ev, category) => {
    // Immediately remove from triage list (instant feedback)
    setTriageEvents(prev => prev.filter(e => e.id !== ev.id));

    try {
      const body = { id: ev.id, category, triage_status: 'reviewed' };
      if (category !== 'Live Music') {
        body.artist_bio = null;
        body.artist_id = null;
      }
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to categorize');

      // Show toast with Undo button
      showQueueToast(`✅ → ${category}`, () => {
        // Undo: revert to pending, put back in triage
        fetch('/api/admin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ id: ev.id, category: null, triage_status: 'pending' }),
        });
        setTriageEvents(prev => [ev, ...prev]);
      });
    } catch (err) {
      console.error('Triage categorize error:', err);
      // Put it back on failure
      setTriageEvents(prev => [ev, ...prev]);
      showQueueToast('Failed to categorize');
    }
  };

  const triageDelete = async (ev) => {
    // Instant remove
    setTriageEvents(prev => prev.filter(e => e.id !== ev.id));
    try {
      await fetch(`/api/admin?id=${ev.id}`, { method: 'DELETE', headers });
      showQueueToast(`🗑 Deleted: ${ev.artist_name || 'Event'}`);
    } catch (err) {
      console.error('Triage delete error:', err);
      setTriageEvents(prev => [ev, ...prev]);
      showQueueToast('Delete failed');
    }
  };

  // ── Auto-fetch when session is restored from sessionStorage ──
  useEffect(() => {
    if (authenticated && sessionRestored.current) {
      sessionRestored.current = false; // only fire once
      fetchAll();
      fetchQueue();
      fetchTriage();
      fetchArtists();
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
    fetchQueue();
    fetchTriage();
    fetchArtists(); // needed for Dashboard data health metrics
    fetchScraperHealth(); // needed for Dashboard + Venues tab
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

  // ── Queue Memory state ────────────────────────────────────────────────────
  const [batchApplyPrompt, setBatchApplyPrompt] = useState(null); // { field, value, count, flyerUrl }

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

  // ── Admin Flyer Upload → Gemini OCR → Draft Submissions ──────────────────
  const handleAdminFlyerUpload = async (file) => {
    if (!file || adminFlyerUploading) return;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) { showQueueToast({ type: 'error', msg: '❌ Invalid file type — use JPG, PNG, WebP, or GIF' }); return; }
    if (file.size > 15 * 1024 * 1024) { showQueueToast({ type: 'error', msg: '❌ File too large (max 15 MB)' }); return; }

    setAdminFlyerUploading(true);
    try {
      // 1. Upload to Supabase storage
      const ext = file.name.split('.').pop().toLowerCase();
      const fileName = `admin-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('posters').upload(fileName, file, { contentType: file.type });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      const { data: urlData } = supabase.storage.from('posters').getPublicUrl(fileName);

      // 2. Send to Gemini OCR pipeline
      const res = await fetch('/api/admin/ocr-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ image_url: urlData.publicUrl }),
      });

      // Handle non-JSON responses (e.g. Vercel 504 timeout, 413 payload too large)
      let result;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): ${res.statusText || 'No response body'}`);
      }
      if (!res.ok) throw new Error(result.error || `OCR failed (${res.status})`);

      if (result.drafts_created === 0) {
        showQueueToast({ type: 'error', msg: '⚠️ AI could not extract any events from this flyer — try a clearer image' });
      } else {
        showQueueToast({ type: 'success', msg: `✅ AI extracted ${result.drafts_created} event${result.drafts_created > 1 ? 's' : ''} — added to queue` });
      }
      fetchQueue(); // Refresh the queue
    } catch (err) {
      console.error('[flyer-upload] Error:', err);
      // Classify the error for a helpful message
      const msg = err.message || 'Unknown error';
      if (msg.includes('413') || msg.includes('payload') || msg.includes('too large')) {
        showQueueToast({ type: 'error', msg: '❌ Upload failed: Image file too large for server' });
      } else if (msg.includes('504') || msg.includes('timeout') || msg.includes('Timeout')) {
        showQueueToast({ type: 'error', msg: '❌ Upload failed: AI processing timed out — try a simpler flyer' });
      } else if (msg.includes('Storage upload')) {
        showQueueToast({ type: 'error', msg: `❌ Upload failed: Could not save image — ${msg}` });
      } else {
        showQueueToast({ type: 'error', msg: `❌ Upload failed: ${msg}` });
      }
    }
    setAdminFlyerUploading(false);
    setAdminFlyerDragOver(false);
  };

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
      event_name: sub.event_name || '',
      category: sub.category || '',
      confidence_score: sub.confidence_score || 0,
    });
    setQueueDuplicates([]);
  };

  const selectQueueItem = (idx) => {
    setQueueSelectedIdx(idx);
    if (queue[idx]) populateQueueForm(queue[idx]);
    // Reset all validation states when switching submissions
    setQueueDuplicates([]);
    setNewVenueOpen(false);
    setNewVenueName('');
    setNewVenueAddress('');
  };

  const toastTimerRef = useRef(null);
  const showQueueToast = (msgOrObj, undoFn = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    // Accept either a plain string or an object { type: 'error', msg: '...' }
    const toast = typeof msgOrObj === 'string' ? { msg: msgOrObj, undoFn } : { ...msgOrObj, undoFn };
    setQueueToast(toast);
    const duration = toast.type === 'error' ? 8000 : toast.type === 'success' ? 4000 : (undoFn ? 5000 : 3000);
    toastTimerRef.current = setTimeout(() => { setQueueToast(null); toastTimerRef.current = null; }, duration);
  };

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

  // Quick-create a new venue from the queue triage card (via admin API to bypass RLS)
  const handleCreateVenue = async () => {
    if (!newVenueName.trim()) return;
    setNewVenueLoading(true);
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({
          name: newVenueName.trim(),
          address: newVenueAddress.trim() || null,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 = venue already exists — auto-select the existing one instead of erroring
        if (res.status === 409 && result.venue) {
          // Make sure it's in our local venues list
          setVenues(prev => {
            const exists = prev.some(v => v.id === result.venue.id);
            return exists ? prev : [...prev, result.venue].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          });
          updateQueueForm('venue_name', result.venue.name);
          setNewVenueOpen(false);
          setNewVenueName('');
          setNewVenueAddress('');
          showQueueToast(`✅ Venue "${result.venue.name}" already exists — auto-selected`);
          setNewVenueLoading(false);
          return;
        }
        throw new Error(result.error || `Error ${res.status}`);
      }
      const created = result;
      // Add to venues state so it's immediately selectable
      setVenues(prev => [...prev, created].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      // Auto-fill the queue form with the new venue name
      updateQueueForm('venue_name', created.name);
      setNewVenueOpen(false);
      setNewVenueName('');
      setNewVenueAddress('');
      showQueueToast(`✅ Venue "${created.name}" created`);
    } catch (err) {
      showQueueToast({ type: 'error', msg: `⛔ Failed to create venue: ${err.message}` });
    }
    setNewVenueLoading(false);
  };

  // Resolve venue_name text to a venue_id by matching against known venues
  const resolveVenueId = (venueName) => {
    if (!venueName || !venues || venues.length === 0) return null;
    const normalized = venueName.trim().toLowerCase();
    const match = venues.find(v => v.name && v.name.trim().toLowerCase() === normalized);
    return match ? match.id : null;
  };

  const handleQueueApprove = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    if (!queueForm.artist_name || !queueForm.venue_name || !queueForm.event_date) {
      alert('Please fill in Artist, Venue, and Date before approving.');
      return;
    }

    // Venue ID guard — require a registered venue match before publishing
    const venueId = resolveVenueId(queueForm.venue_name);
    if (!venueId) {
      showQueueToast({ type: 'error', msg: `⛔ "${queueForm.venue_name}" is not a registered venue. Please select one from the dropdown before publishing.` });
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
      let eventDate = sanitized.event_date;
      if (sanitized.event_time) {
        const probe = new Date(`${sanitized.event_date}T12:00:00`);
        const etOff = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
        eventDate = new Date(`${sanitized.event_date}T${sanitized.event_time}:00${etOff}`).toISOString();
      }
      const res = await fetch('/api/admin/queue', {
        method: 'POST', headers,
        body: JSON.stringify({ submission_id: sub.id, event_data: { ...sanitized, event_date: eventDate, venue_id: venueId } }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        const errMsg = result.error || `Server error ${res.status}`;
        showQueueToast({ type: 'error', msg: `⛔ Publish failed: ${errMsg}` });
        setQueueActionLoading(false);
        return; // DO NOT advance queue on failure
      }
      const confidence = queueForm.confidence_score || 0;
      const triageNote = confidence >= 90 ? ' → auto-routed (skipped triage)' : '';
      showQueueToast({ type: 'success', msg: `✅ ${sanitized.artist_name} published!${triageNote}` });
      advanceQueue();
      fetchAll();
    } catch (err) {
      showQueueToast({ type: 'error', msg: `⛔ Publish failed: ${err.message || 'Network error'}` });
    }
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
      showQueueToast('📝 Saved as Draft');
      advanceQueue();
    } catch { alert('Save failed'); }
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

  const updateQueueForm = (k, v) => {
    setQueueForm(f => ({ ...f, [k]: v }));

    // Queue Memory: when event_name or venue_name changes, check for batch siblings
    if ((k === 'event_name' || k === 'venue_name') && v && queue.length > 1) {
      const currentSub = queue[queueSelectedIdx];
      if (currentSub?.image_url) {
        const siblings = queue.filter((s, i) =>
          i !== queueSelectedIdx && s.image_url === currentSub.image_url
        );
        if (siblings.length > 0) {
          setBatchApplyPrompt({ field: k, value: v, count: siblings.length, flyerUrl: currentSub.image_url });
        }
      }
    }
  };

  // Batch apply a field value to all queue items from the same flyer
  const applyBatchToFlyer = async () => {
    if (!batchApplyPrompt) return;
    const { field, value, flyerUrl } = batchApplyPrompt;
    const supabaseAdmin = supabase; // client-side supabase

    // Update all pending submissions with the same image_url
    const siblingIds = queue
      .filter(s => s.image_url === flyerUrl)
      .map(s => s.id);

    if (siblingIds.length > 0) {
      try {
        const res = await fetch('/api/admin/queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ submission_ids: siblingIds, updates: { [field]: value } }),
        });
        if (res.ok) {
          // Update local queue state
          setQueue(prev => prev.map(s =>
            siblingIds.includes(s.id) ? { ...s, [field]: value } : s
          ));
          showQueueToast(`✅ Applied "${value}" to ${siblingIds.length} submissions from this flyer`);
        }
      } catch (err) {
        showQueueToast({ type: 'error', msg: `⛔ Batch update failed: ${err.message}` });
      }
    }
    setBatchApplyPrompt(null);
  };

  const queueSelected = queue[queueSelectedIdx] || null;

  // Queue duplicate check — filters out the current artist to avoid false positives
  // (e.g. festival posters where 30 acts share the same venue+date)
  const checkQueueDuplicates = useCallback(async () => {
    if (!queueForm.venue_name || !queueForm.event_date) { setQueueDuplicates([]); return; }
    setQueueDupLoading(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-check?venue=${encodeURIComponent(queueForm.venue_name)}&date=${queueForm.event_date}`,
        { headers: { Authorization: `Bearer ${password}` } }
      );
      const data = await res.json();
      // Filter out matches for the SAME artist — those aren't duplicates, they're siblings
      const currentArtist = (queueForm.artist_name || '').trim().toLowerCase();
      const filtered = (data.duplicates || []).filter(d =>
        (d.artist_name || '').trim().toLowerCase() !== currentArtist
      );
      setQueueDuplicates(filtered);
    } catch { setQueueDuplicates([]); }
    setQueueDupLoading(false);
  }, [queueForm.venue_name, queueForm.event_date, queueForm.artist_name, password]);

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
          {/* Hidden username for browser autofill */}
          <input type="text" name="username" autoComplete="username" defaultValue="admin" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" />
          <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              style={{ ...inputStyle, paddingRight: '42px' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => !prev)}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              }}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          <button type="submit" className="w-full mt-4 py-3 rounded-xl font-display font-semibold text-white" style={{ background: 'var(--accent)' }}>
            Login
          </button>
        </form>
      </div>
    );
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
          { key: 'triage', label: 'Triage', count: triageEvents.length },
          { key: 'events', label: 'Event Feed', count: eventsTotal || events.length },
          { key: 'artists', label: 'Artists', count: artists.length },
          { key: 'spotlight', label: 'Spotlight', count: spotlightPins.length },
          { key: 'venues', label: 'Venues', count: scraperHealth.filter(s => s.status === 'fail').length },
          { key: 'festivals', label: 'Festivals', count: festivalData.length },
          { key: 'submissions', label: 'Submissions', count: queue.length },
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
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'dashboard') { fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (artists.length === 0) fetchArtists(); fetchReports(); fetchScraperHealth(); } if (tab.key === 'events') fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (tab.key === 'triage') fetchTriage(); if (tab.key === 'spotlight') { setSpotlightSearch(''); fetchSpotlight(spotlightDate); if (artists.length === 0) fetchArtists(); } if (tab.key === 'submissions') { setMobileQueueDetail(false); fetchQueue(); } if (tab.key === 'artists') fetchArtists(artistsSearch, artistsNeedsInfo); if (tab.key === 'venues') fetchScraperHealth(); if (tab.key === 'reports') { setFlagsViewFilter('pending'); fetchReports(); } if (tab.key === 'festivals') fetchFestivalNames(); }}
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
          events={events} artists={artists} reports={reports} venues={venues}
          scraperHealth={scraperHealth}
          eventsTotal={eventsTotal} newEvents24h={newEvents24h}
          dashDateRange={dashDateRange} setDashDateRange={setDashDateRange}
          analyticsData={analyticsData} analyticsLoading={analyticsLoading}
          analyticsEnv={analyticsEnv} setAnalyticsEnv={setAnalyticsEnv}
          fetchAnalytics={fetchAnalytics} fetchEvents={fetchEvents}
          fetchArtists={fetchArtists} fetchScraperHealth={fetchScraperHealth}
          fetchReports={fetchReports}
          eventsSortField={eventsSortField} eventsSortOrder={eventsSortOrder}
          eventsStatusFilter={eventsStatusFilter} setEventsStatusFilter={setEventsStatusFilter} setActiveTab={setActiveTab}
          setVenuesFilter={setVenuesFilter} setEventsRecentlyAdded={setEventsRecentlyAdded}
          setEvents={setEvents} setFlagsViewFilter={setFlagsViewFilter}
          setEventsMissingTime={setEventsMissingTime} setArtistMissingFilters={setArtistMissingFilters}
        />
      )}

      {/* ── Triage Tab ── */}
      {activeTab === 'triage' && (
        <AdminTriageTab
          events={events} venues={venues}
          triageEvents={triageEvents} triageLoading={triageLoading}
          triageActionId={triageActionId}
          triageCategorize={triageCategorize} triageDelete={triageDelete}
          fetchTriage={fetchTriage}
          setEditingEvent={setEditingEvent} setShowEventForm={setShowEventForm}
        />
      )}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (
        <AdminEventsTab
          events={events} artists={artists} venues={venues} password={password}
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
          artists={artists} events={events} venues={venues} password={password} isMobile={isMobile}
          artistsSearch={artistsSearch} setArtistsSearch={setArtistsSearch}
          artistsNeedsInfo={artistsNeedsInfo} setArtistsNeedsInfo={setArtistsNeedsInfo}
          artistMissingFilters={artistMissingFilters} setArtistMissingFilters={setArtistMissingFilters}
          artistsSortBy={artistsSortBy} setArtistsSortBy={setArtistsSortBy}
          artistSourceFilter={artistSourceFilter} setArtistSourceFilter={setArtistSourceFilter}
          artistSubTab={artistSubTab} setArtistSubTab={setArtistSubTab}
          directorySort={directorySort} setDirectorySort={setDirectorySort}
          editingArtist={editingArtist} setEditingArtist={setEditingArtist}
          artistForm={artistForm} setArtistForm={setArtistForm}
          artistActionLoading={artistActionLoading} setArtistActionLoading={setArtistActionLoading}
          aiLoading={aiLoading} setAiLoading={setAiLoading}
          artistToast={artistToast} setArtistToast={setArtistToast}
          artistEvents={artistEvents} setArtistEvents={setArtistEvents}
          duplicateNameWarning={duplicateNameWarning} setDuplicateNameWarning={setDuplicateNameWarning}
          regeneratingField={regeneratingField} setRegeneratingField={setRegeneratingField}
          imageCandidates={imageCandidates} setImageCandidates={setImageCandidates}
          imageCarouselIdx={imageCarouselIdx} setImageCarouselIdx={setImageCarouselIdx}
          editPanelRef={editPanelRef}
          selectedArtists={selectedArtists} setSelectedArtists={setSelectedArtists}
          bulkEnrichProgress={bulkEnrichProgress}
          deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
          enrichConfirm={enrichConfirm} setEnrichConfirm={setEnrichConfirm}
          bulkDeleteConfirm={bulkDeleteConfirm} setBulkDeleteConfirm={setBulkDeleteConfirm}
          mergeConfirm={mergeConfirm} setMergeConfirm={setMergeConfirm}
          mergeMasterId={mergeMasterId} setMergeMasterId={setMergeMasterId}
          fetchArtists={fetchArtists} runBulkEnrich={runBulkEnrich}
          regenerateField={regenerateField} showQueueToast={showQueueToast}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab} returnToTab={returnToTab}
          GENRES={GENRES} VIBES={VIBES}
        />
      )}

      {/* Spotlight Tab */}
      {activeTab === 'spotlight' && !loading && (
        <AdminSpotlightTab
          artists={artists} events={events}
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
          artists={artists} venues={venues} queue={queue}
          submissions={submissions} reports={reports}
          queueSelectedIdx={queueSelectedIdx} queueActionLoading={queueActionLoading}
          queueForm={queueForm} queueDuplicates={queueDuplicates} queueDupLoading={queueDupLoading}
          adminFlyerUploading={adminFlyerUploading}
          adminFlyerDragOver={adminFlyerDragOver} setAdminFlyerDragOver={setAdminFlyerDragOver}
          newVenueOpen={newVenueOpen} setNewVenueOpen={setNewVenueOpen}
          newVenueName={newVenueName} setNewVenueName={setNewVenueName}
          newVenueAddress={newVenueAddress} setNewVenueAddress={setNewVenueAddress}
          newVenueLoading={newVenueLoading}
          isMobile={isMobile} mobileQueueDetail={mobileQueueDetail} setMobileQueueDetail={setMobileQueueDetail}
          qSurface={qSurface} qSurfaceAlt={qSurfaceAlt} qBorder={qBorder}
          qText={qText} qTextMuted={qTextMuted} qAccent={qAccent}
          fetchQueue={fetchQueue} handleAdminFlyerUpload={handleAdminFlyerUpload}
          selectQueueItem={selectQueueItem} updateQueueForm={updateQueueForm}
          handleQueueApprove={handleQueueApprove} handleQueueReject={handleQueueReject}
          handleQueueArchive={handleQueueArchive}
          handleCreateVenue={handleCreateVenue} resolveVenueId={resolveVenueId}
          applyBatchToFlyer={applyBatchToFlyer}
          setQueueLightboxUrl={setQueueLightboxUrl}
          adminFlyerRef={adminFlyerRef}
          queueSelected={queueSelected}
          festivalNames={festivalNames}
          batchApplyPrompt={batchApplyPrompt} setBatchApplyPrompt={setBatchApplyPrompt}
          qLabelStyle={qLabelStyle} qInputStyle={qInputStyle}
          qGreen={qGreen} qRed={qRed}
        />
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && !loading && (
        <AdminReportsTab
          reports={reports} setReports={setReports} events={events}
          artists={artists} venues={venues} password={password}
          flagsViewFilter={flagsViewFilter} setFlagsViewFilter={setFlagsViewFilter}
          setEditingEvent={setEditingEvent} setShowEventForm={setShowEventForm}
          setEditingArtist={setEditingArtist} setArtistForm={setArtistForm}
          setArtistsSearch={setArtistsSearch} setArtistSubTab={setArtistSubTab}
          setImageCandidates={setImageCandidates} setImageCarouselIdx={setImageCarouselIdx}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab}
          fetchArtists={fetchArtists} showQueueToast={showQueueToast}
        />
      )}

      {/* Spotlight Missing Image Warning Modal */}
      {spotlightImageWarning && (
        <div
          onClick={() => setSpotlightImageWarning(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
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
                  let pool = artists;
                  if (!pool || pool.length === 0) {
                    try {
                      const res = await fetch(`/api/admin/artists?limit=2000`, { headers: { Authorization: `Bearer ${password}` } });
                      if (res.ok) {
                        const data = await res.json();
                        pool = Array.isArray(data) ? data : (data.artists || []);
                        setArtists(pool);
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
                  setArtistSubTab('triage');

                  if (linkedArtist) {
                    setEditingArtist(linkedArtist);
                    setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                    setImageCarouselIdx(0);
                    setArtistForm({
                      name: linkedArtist.name || '',
                      bio: linkedArtist.bio || '',
                      genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                      vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                      image_url: linkedArtist.image_url || '',
                    });
                  } else {
                    // Fallback: search by name so the user can find and edit
                    setArtistsSearch(ev.artist_name || '');
                    fetchArtists(ev.artist_name || '', false);
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
          </div>
        </div>
      )}

      {/* Bulk Edit Time Modal */}
      {bulkTimeModal && (
        <div
          onClick={() => { if (!bulkTimeLoading) setBulkTimeModal(false); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '360px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
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
          </div>
        </div>
      )}

      {/* Event Form Modal */}
      {showEventForm && (
        <EventFormModal
          event={editingEvent}
          artists={artists}
          venues={venues}
          onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
          onSave={saveEvent}
          adminPassword={password}
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

      {/* Sticky Bulk Action Bar + Artist Modals */}
      <AdminArtistModals
        activeTab={activeTab}
        artists={artists} password={password}
        selectedArtists={selectedArtists} setSelectedArtists={setSelectedArtists}
        bulkEnrichProgress={bulkEnrichProgress} setBulkEnrichProgress={setBulkEnrichProgress}
        enrichConfirm={enrichConfirm} setEnrichConfirm={setEnrichConfirm}
        bulkDeleteConfirm={bulkDeleteConfirm} setBulkDeleteConfirm={setBulkDeleteConfirm}
        bulkDeleteLoading={bulkDeleteLoading} setBulkDeleteLoading={setBulkDeleteLoading}
        mergeConfirm={mergeConfirm} setMergeConfirm={setMergeConfirm}
        mergeMasterId={mergeMasterId} setMergeMasterId={setMergeMasterId}
        mergeLoading={mergeLoading} setMergeLoading={setMergeLoading}
        deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
        runBulkEnrich={runBulkEnrich} fetchArtists={fetchArtists}
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
