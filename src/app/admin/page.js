'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashDateRange, setDashDateRange] = useState('7d'); // 'today' | '7d' | '30d' | 'all'
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
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistsSearch, setArtistsSearch] = useState('');
  const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
  const [artistMissingFilters, setArtistMissingFilters] = useState({ bio: false, image_url: false, genres: false, vibes: false });
  const [artistsSortBy, setArtistsSortBy] = useState('name'); // 'name' | 'next_event'
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistForm, setArtistForm] = useState({ name: '', bio: '', genres: '', vibes: '', image_url: '', instagram_url: '' });
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
  const [regeneratingField, setRegeneratingField] = useState(null); // 'bio' | 'image_url' | 'genres' | null
  const [imageCandidates, setImageCandidates] = useState([]); // top 5 image URLs from Serper
  const [imageCarouselIdx, setImageCarouselIdx] = useState(0);
  const editPanelRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingArtist]);
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
    genre: '', vibe: '', cover: '', ticket_link: '',
  });
  const [queueDuplicates, setQueueDuplicates] = useState([]);
  const [queueDupLoading, setQueueDupLoading] = useState(false);
  const [queueLightboxUrl, setQueueLightboxUrl] = useState(null);
  const [queueToast, setQueueToast] = useState(null);
  const [flagsViewFilter, setFlagsViewFilter] = useState('pending'); // 'pending' | 'archived'
  const [scraperHealth, setScraperHealth] = useState([]);
  const [venuesFilter, setVenuesFilter] = useState('all'); // 'all' | 'fail' | 'warning' | 'success'
  const [forceSyncing, setForceSyncing] = useState(null); // scraper_key currently syncing

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const fetchEvents = useCallback(async (page = 1, sort = eventsSortField, order = eventsSortOrder, status = eventsStatusFilter, missingTime = eventsMissingTime) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '100', sort, order });
      if (status) params.set('status', status);
      if (missingTime) params.set('missingTime', 'true');
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
  }, [password, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime]);

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

      setSubmissions(await subRes.json());
      setReports(await repRes.json());
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
        // Respect the source hierarchy: skip human-edited fields
        const locks = artist.is_human_edited || {};

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

        if (ai.bio && !artist.bio && !locks.bio) { update.bio = ai.bio; newStatus.bio = 'pending'; }
        if (ai.genres?.length && (!artist.genres || artist.genres.length === 0) && !locks.genres) { update.genres = ai.genres; newStatus.genres = 'pending'; }
        if (ai.vibes?.length && (!artist.vibes || artist.vibes.length === 0) && !locks.vibes) { update.vibes = ai.vibes; newStatus.vibes = 'pending'; }
        if (ai.image_url && !artist.image_url && !locks.image_url) { update.image_url = ai.image_url; newStatus.image_url = 'pending'; }
        if (ai.instagram_url && !artist.instagram_url) update.instagram_url = ai.instagram_url;
        if (ai.is_tribute !== undefined && !artist.is_tribute) update.is_tribute = ai.is_tribute;

        // Only save if there's something to update
        if (Object.keys(update).length > 1) {
          update.field_status = newStatus;
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

  const handleLogin = (e) => {
    e.preventDefault();
    setAuthenticated(true);
    fetchAll();
    fetchQueue();
    fetchTriage();
    fetchArtists(); // needed for Dashboard data health metrics
    fetchScraperHealth(); // needed for Dashboard + Venues tab
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

  const toastTimerRef = useRef(null);
  const showQueueToast = (msg, undoFn = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setQueueToast({ msg, undoFn });
    toastTimerRef.current = setTimeout(() => { setQueueToast(null); toastTimerRef.current = null; }, undoFn ? 5000 : 3000);
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
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'dashboard') { fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (artists.length === 0) fetchArtists(); fetchReports(); fetchScraperHealth(); } if (tab.key === 'events') fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter); if (tab.key === 'triage') fetchTriage(); if (tab.key === 'spotlight') { setSpotlightSearch(''); fetchSpotlight(spotlightDate); if (artists.length === 0) fetchArtists(); } if (tab.key === 'submissions') { setMobileQueueDetail(false); fetchQueue(); } if (tab.key === 'artists') fetchArtists(artistsSearch, artistsNeedsInfo); if (tab.key === 'venues') fetchScraperHealth(); if (tab.key === 'reports') { setFlagsViewFilter('pending'); fetchReports(); } }}
          >
            {tab.label} {tab.count > 0 && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: tab.key !== 'events' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab.key !== 'events' ? 'white' : 'var(--text-secondary)' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Scrollbar-hide for mobile tabs */}
      <style>{`.admin-tabs::-webkit-scrollbar { display: none; }`}</style>

      {loading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading...</div>}

      {/* ── Dashboard Tab — Platform Analytics ───────────────────────────── */}
      {activeTab === 'dashboard' && !loading && (() => {
        // Compute Data Health metrics from existing state
        const eventsWithoutImage = events.filter(e => !e.image_url && !e.artists?.image_url).length;
        const eventsMissingTimeCount = events.filter(e => {
          if (!e.event_date) return true;
          const time = e.event_date.split('T')[1] || '';
          return time.startsWith('00:00') || time.startsWith('04:00') || time.startsWith('05:00');
        }).length;
        const artistsWithoutBio = artists.filter(a => !a.bio).length;
        const pendingFlags = reports.filter(r => r.status === 'pending').length;
        const totalEvents = eventsTotal || events.length;
        const totalArtists = artists.length;

        const dateLabels = { today: 'Today', '7d': 'Last 7 Days', '30d': 'This Month', all: 'All Time' };

        const MetricCard = ({ label, value, sub, color, onClick }) => (
          <div
            onClick={onClick}
            style={{
              padding: '20px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '4px',
              cursor: onClick ? 'pointer' : 'default',
              transition: 'border-color 0.15s',
              ...(onClick ? { ':hover': { borderColor: '#E8722A' } } : {}),
            }}
            onMouseEnter={onClick ? (e) => { e.currentTarget.style.borderColor = '#E8722A'; } : undefined}
            onMouseLeave={onClick ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; } : undefined}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
              {label}
            </span>
            <span style={{ fontSize: '28px', fontWeight: 800, color: color || 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.1 }}>
              {value}
            </span>
            {sub && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</span>}
          </div>
        );

        const SectionHeader = ({ title }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', marginTop: '24px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
              {title}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
        );

        return (
        <div>
          {/* Header + Date Filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>Dashboard</h2>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'today', label: 'Today' },
                { key: '7d', label: '7 Days' },
                { key: '30d', label: 'Month' },
                { key: 'all', label: 'All Time' },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setDashDateRange(seg.key)}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: dashDateRange === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: dashDateRange === seg.key ? '2px solid #E8722A' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fan Engagement */}
          <SectionHeader title="Fan Engagement" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard label="Total Unique Visitors" value="—" sub={`${dateLabels[dashDateRange]} · Connect analytics to enable`} />
            <MetricCard label="Mobile Web" value="—" sub="Awaiting analytics integration" />
            <MetricCard label="Desktop Web" value="—" sub="Awaiting analytics integration" />
          </div>

          {/* Venue Value */}
          <SectionHeader title="Venue Value (Outbound)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard label="Venue Link Clicks" value="—" sub={`${dateLabels[dashDateRange]} · Connect click tracking to enable`} />
            <MetricCard label="Top Venue" value="—" sub="Awaiting click tracking" />
          </div>

          {/* Data Health */}
          <SectionHeader title="Data Health" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard
              label="Total Events"
              value={totalEvents.toLocaleString()}
              sub="Published upcoming"
              color="#22c55e"
            />
            <MetricCard
              label="Total Artists"
              value={totalArtists.toLocaleString()}
              sub="In database"
              color="#22c55e"
            />
            <MetricCard
              label="Events Missing Images"
              value={eventsWithoutImage}
              sub={eventsWithoutImage === 0 ? 'All clear' : 'Click to view →'}
              color={eventsWithoutImage > 0 ? '#EAB308' : '#22c55e'}
              onClick={eventsWithoutImage > 0 ? () => {
                setActiveTab('artists');
                setArtistMissingFilters({ bio: false, image_url: true, genres: false, vibes: false });
                fetchArtists('', false);
              } : undefined}
            />
            <MetricCard
              label="Artists Missing Bios"
              value={artistsWithoutBio}
              sub={artistsWithoutBio === 0 ? 'All clear' : 'Click to view →'}
              color={artistsWithoutBio > 0 ? '#EAB308' : '#22c55e'}
              onClick={artistsWithoutBio > 0 ? () => {
                setActiveTab('artists');
                setArtistMissingFilters({ bio: true, image_url: false, genres: false, vibes: false });
                fetchArtists('', false);
              } : undefined}
            />
            <MetricCard
              label="Pending User Flags"
              value={pendingFlags}
              sub={pendingFlags === 0 ? 'Inbox zero' : 'Click to view →'}
              color={pendingFlags > 0 ? '#ef4444' : '#22c55e'}
              onClick={pendingFlags > 0 ? () => {
                setActiveTab('reports');
                setFlagsViewFilter('pending');
                fetchReports();
              } : undefined}
            />
            <MetricCard
              label="Failing Scrapers"
              value={scraperHealth.filter(s => s.status === 'fail').length}
              sub={scraperHealth.filter(s => s.status === 'fail').length === 0 ? 'All scrapers healthy' : 'Click to view →'}
              color={scraperHealth.filter(s => s.status === 'fail').length > 0 ? '#ef4444' : '#22c55e'}
              onClick={scraperHealth.filter(s => s.status === 'fail').length > 0 ? () => {
                setActiveTab('venues');
                setVenuesFilter('fail');
                fetchScraperHealth();
              } : undefined}
            />
            <MetricCard
              label="Successful Syncs"
              value={scraperHealth.filter(s => s.status === 'success' && s.last_sync && (Date.now() - new Date(s.last_sync).getTime()) < 24 * 60 * 60 * 1000).length}
              sub={`of ${scraperHealth.length} total scrapers`}
              color="#22c55e"
              onClick={() => {
                setActiveTab('venues');
                setVenuesFilter('success');
                fetchScraperHealth();
              }}
            />
            <MetricCard
              label="Events Missing Times"
              value={eventsMissingTimeCount}
              sub={eventsMissingTimeCount === 0 ? 'All events have times' : 'Click to view →'}
              color={eventsMissingTimeCount > 0 ? '#EAB308' : '#22c55e'}
              onClick={eventsMissingTimeCount > 0 ? () => {
                setActiveTab('events');
                setEventsMissingTime(true);
                setEvents([]);
                fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, true);
              } : undefined}
            />
          </div>
        </div>
        );
      })()}

      {/* ── Triage Tab — Inbox for unreviewed scraped events ──────────────── */}
      {activeTab === 'triage' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)', margin: 0 }}>Event Triage</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                Categorize scraped events before they hit the live feed. {triageEvents.length} pending.
              </p>
            </div>
            <button
              onClick={fetchTriage}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              ↻ Refresh
            </button>
          </div>

          {triageLoading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading triage events...</div>}

          {!triageLoading && triageEvents.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
              <div className="font-display font-bold text-lg">Inbox Zero</div>
              <p className="text-sm mt-1">All scraped events have been reviewed. Nice work!</p>
            </div>
          )}

          {!triageLoading && triageEvents.length > 0 && (
            <div className="space-y-2">
              {triageEvents.map(ev => {
                const isActioning = triageActionId === ev.id;
                return (
                  <div
                    key={ev.id}
                    className="rounded-xl border"
                    style={{
                      background: 'var(--bg-card)', borderColor: 'var(--border)',
                      opacity: isActioning ? 0.5 : 1, transition: 'opacity 0.2s',
                      padding: '12px 14px',
                    }}
                  >
                    {/* Row 1: Event info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-display font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {ev.artist_name || '(No artist name)'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span>{ev.venue_name || ev.venues?.name || '—'} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}</span>
                          {ev.source && /^https?:\/\//i.test(ev.source) && (
                            <a
                              href={ev.source}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] font-medium"
                              style={{ color: '#E8722A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" fill="currentColor" /></svg>
                              {(() => { try { return new URL(ev.source).hostname.replace('www.', ''); } catch { return 'source'; } })()}
                            </a>
                          )}
                        </div>
                        {ev.artist_bio && (
                          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)', maxHeight: '36px', overflow: 'hidden' }}>
                            {ev.artist_bio.substring(0, 120)}{ev.artist_bio.length > 120 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Category pills + Trash */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { key: 'Live Music', label: 'Live Music', color: '#23CE6B', bg: '#23CE6B18' },
                        { key: 'Food & Drink Special', label: 'Food & Drink', color: '#F59E0B', bg: '#F59E0B18' },
                        { key: 'Trivia', label: 'Trivia', color: '#8B5CF6', bg: '#8B5CF618' },
                        { key: 'Sports / Watch Party', label: 'Sports', color: '#3B82F6', bg: '#3B82F618' },
                        { key: 'Other / Special Event', label: 'Other', color: '#EC4899', bg: '#EC489918' },
                      ].map(cat => (
                        <button
                          key={cat.key}
                          disabled={isActioning}
                          onClick={() => triageCategorize(ev, cat.key)}
                          className="text-xs font-display font-semibold px-3 py-1.5 rounded-lg"
                          style={{
                            border: `1px solid ${cat.color}33`,
                            color: cat.color,
                            background: cat.bg,
                            cursor: isActioning ? 'wait' : 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Edit button */}
                      <button
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}
                        title="Edit event details"
                      >
                        {Icons.edit}
                      </button>

                      {/* Trash icon */}
                      <button
                        disabled={isActioning}
                        onClick={() => triageDelete(ev)}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: isActioning ? 'wait' : 'pointer' }}
                        title="Delete — junk event"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (() => {
        // Server-side filtering handles status/date — client filters by search text + missing time
        const searchLower = eventsSearch.trim().toLowerCase();
        let filtered = events;
        if (searchLower) {
          filtered = filtered.filter(ev => {
            const artist = (ev.artist_name || '').toLowerCase();
            const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
            return artist.includes(searchLower) || venue.includes(searchLower);
          });
        }
        // Missing time filter is now server-side via ?missingTime=true
        return (
        <div>
          {/* View tabs + Add Event */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'past', label: 'Past' },
                { key: 'hidden', label: 'Hidden' },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => { setEventsStatusFilter(seg.key); setSelectedEvents(new Set()); setEvents([]); fetchEvents(1, eventsSortField, eventsSortOrder, seg.key, eventsMissingTime); }}
                  style={{
                    padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: eventsStatusFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: eventsStatusFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                    marginBottom: '-1px',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)', fontFamily: "'DM Sans', sans-serif" }}
              onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
            >
              {Icons.plus} Add Event
            </button>
          </div>

          {/* Search + Sort row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', marginBottom: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search artist or venue..."
                value={eventsSearch}
                onChange={e => { setEventsSearch(e.target.value); setSelectedEvents(new Set()); }}
                style={{
                  width: '100%', padding: '9px 14px', paddingRight: eventsSearch ? '36px' : '14px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
                }}
              />
              {eventsSearch && (
                <button
                  onClick={() => { setEventsSearch(''); setSelectedEvents(new Set()); }}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Clear search"
                >✕</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  const next = !eventsMissingTime;
                  setEventsMissingTime(next);
                  setEvents([]);
                  setSelectedEvents(new Set());
                  fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, next);
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: eventsMissingTime ? 'rgba(234,179,8,0.15)' : 'var(--bg-card)',
                  color: eventsMissingTime ? '#EAB308' : 'var(--text-muted)',
                  outline: eventsMissingTime ? '1.5px solid rgba(234,179,8,0.4)' : '1px solid var(--border)',
                }}
              >
                Missing Time
              </button>
              <button
                onClick={() => {
                  const csvRows = [
                    ['Event ID', 'Artist Name', 'Event Title', 'Venue', 'Event Date', 'Start Time', 'Genre', 'Category', 'Cover', 'Status', 'Source URL', 'Created At'].join(','),
                    ...filtered.map(ev => {
                      const d = ev.event_date ? new Date(ev.event_date) : null;
                      const dateStr = d ? d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
                      const timeStr = d ? d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
                      const esc = (s) => `"${(s || '').replace(/"/g, '""')}"`;
                      return [
                        ev.id, esc(ev.artist_name), esc(ev.event_title), esc(ev.venue_name || ev.venues?.name),
                        dateStr, timeStr, esc(ev.genre), esc(ev.category), esc(ev.cover), ev.status,
                        esc(ev.source), ev.created_at ? new Date(ev.created_at).toISOString().slice(0, 10) : '',
                      ].join(',');
                    }),
                  ].join('\n');
                  const blob = new Blob([csvRows], { type: 'text/csv' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `events-export-${new Date().toISOString().slice(0, 10)}.csv`;
                  link.click();
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: 'var(--bg-card)', color: 'var(--text-muted)',
                  outline: '1px solid var(--border)',
                }}
                title="Export filtered events to CSV"
              >
                ↓ CSV
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
                {filtered.length} events
              </span>
              <select
                value={`${eventsSortField}:${eventsSortOrder}`}
                onChange={e => {
                  const [field, order] = e.target.value.split(':');
                  setEventsSortField(field);
                  setEventsSortOrder(order);
                  setEvents([]);
                  fetchEvents(1, field, order, eventsStatusFilter, eventsMissingTime);
                }}
                style={{
                  padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", outline: 'none',
                }}
              >
                <option value="event_date:asc">Event Date (soonest)</option>
                <option value="event_date:desc">Event Date (latest)</option>
                <option value="updated_at:desc">Last Updated (newest)</option>
                <option value="updated_at:asc">Last Updated (oldest)</option>
                <option value="created_at:desc">Date Added (newest)</option>
                <option value="created_at:asc">Date Added (oldest)</option>
              </select>
            </div>
          </div>

          {/* Select-All + Bulk Actions */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px',
            borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '6px',
          }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedEvents.size === filtered.length}
              onChange={e => {
                if (e.target.checked) setSelectedEvents(new Set(filtered.map(ev => ev.id)));
                else setSelectedEvents(new Set());
              }}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A' }}
            />
            {selectedEvents.size > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#E8722A', fontFamily: "'DM Sans', sans-serif" }}>
                  {selectedEvents.size} selected
                </span>
                <button
                  onClick={() => setSelectedEvents(new Set())}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                    color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >Deselect All</button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => { setBulkTime(''); setBulkTimeModal(true); }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: 'rgba(232,114,42,0.12)', color: '#E8722A',
                    border: '1px solid rgba(232,114,42,0.3)', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor" /></svg>
                  Edit Time ({selectedEvents.size})
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                Select events for bulk actions
              </span>
            )}
          </div>

          <div className="space-y-2">
            {filtered.map((ev) => {
              const isEvSelected = selectedEvents.has(ev.id);
              const catColor = CATEGORY_OPTIONS.find(c => c.key === (ev.category || 'Live Music'))?.color || '#666';
              return (
              <div key={ev.id} className="rounded-xl border" style={{
                background: isEvSelected ? 'rgba(232,114,42,0.04)' : 'var(--bg-card)',
                borderColor: isEvSelected ? '#E8722A44' : 'var(--border)',
                padding: '12px 14px',
                display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '8px' : '0',
              }}>
                {/* Top section: checkbox + event info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '14px', flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={isEvSelected}
                    onChange={e => {
                      setSelectedEvents(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(ev.id);
                        else next.delete(ev.id);
                        return next;
                      });
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-display font-bold" style={{ fontSize: isMobile ? '15px' : '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.artist_name}
                    </div>
                    <div className="text-xs text-brand-text-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.venue_name || ev.venues?.name} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}
                      </span>
                      {isMobile && ev.source && /^https?:\/\//i.test(ev.source) && (
                        <a href={ev.source} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)', flexShrink: 0, textDecoration: 'none', display: 'inline-flex' }} title="Open source"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
                      )}
                    </div>
                    {/* Timestamps — hidden on mobile */}
                    {!isMobile && (
                      <div className="text-[10px] mt-0.5 flex gap-3" style={{ color: 'var(--text-muted)' }}>
                        {ev.created_at && (
                          <span>Added {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        )}
                        {ev.updated_at && ev.updated_at !== ev.created_at && (
                          <span>Updated {new Date(ev.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action bar: badges + buttons */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0,
                  ...(isMobile ? { paddingLeft: '26px' } : {}),
                }}>
                  <select
                    value={ev.category || 'Live Music'}
                    onChange={(e) => updateEventCategory(ev, e.target.value)}
                    className="text-[11px] font-display font-semibold rounded-lg px-2 py-1"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${catColor}44`,
                      color: catColor,
                      cursor: 'pointer', flexShrink: 0, outline: 'none',
                    }}
                  >
                    {CATEGORY_OPTIONS.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
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
                  {!isMobile && ev.source && /^https?:\/\//i.test(ev.source) && (
                    <a
                      href={ev.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent"
                      title={`Source: ${(() => { try { return new URL(ev.source).hostname; } catch { return 'link'; } })()}`}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  )}
                  <button className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent" onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                    {Icons.edit}
                  </button>
                  <button className="p-1.5 rounded text-brand-text-muted hover:text-red-400" onClick={() => deleteEvent(ev.id)} title="Permanently delete">
                    {Icons.trash}
                  </button>
                </div>
              </div>
              );
            })}
            {filtered.length === 0 && <p className="text-center py-8 text-brand-text-muted">{eventsSearch ? 'No matching events.' : 'No events in this view.'}</p>}
          </div>

          {/* Load More */}
          {eventsPage < eventsTotalPages && (
            <div className="text-center mt-4">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-display font-semibold"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => fetchEvents(eventsPage + 1, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime)}
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
          {/* Toolbar row 1: Search + count */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: '1 1 200px', maxWidth: '400px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search artists..."
                value={artistsSearch}
                onChange={e => { setArtistsSearch(e.target.value); fetchArtists(e.target.value, artistsNeedsInfo); }}
                style={{
                  width: '100%', padding: '9px 32px 9px 14px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
                }}
              />
              {artistsSearch && (
                <button
                  onClick={() => { setArtistsSearch(''); fetchArtists('', artistsNeedsInfo); }}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
                </button>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
              {artists.length} artist{artists.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Toolbar row 2: Granular missing-data filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", marginRight: '4px' }}>Filter Missing:</span>
            {[
              { key: 'bio', label: 'Bio' },
              { key: 'image_url', label: 'Image' },
              { key: 'genres', label: 'Genre' },
              { key: 'vibes', label: 'Vibe' },
            ].map(f => {
              const active = artistMissingFilters[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => setArtistMissingFilters(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    border: active ? '1px solid #ef4444' : '1px solid var(--border)',
                    background: active ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
                    color: active ? '#ef4444' : 'var(--text-secondary)',
                  }}
                >
                  {active ? '✓ ' : ''}{f.label}
                </button>
              );
            })}
          </div>

          {/* Toolbar row 2: CSV export */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                const anyFilter = Object.values(artistMissingFilters).some(Boolean);
                const exportList = anyFilter ? artists.filter(a => {
                  if (artistMissingFilters.bio && !a.bio) return true;
                  if (artistMissingFilters.image_url && !a.image_url) return true;
                  if (artistMissingFilters.genres && (!a.genres || a.genres.length === 0)) return true;
                  if (artistMissingFilters.vibes && (!a.vibes || a.vibes.length === 0)) return true;
                  return false;
                }) : artists;
                const header = ['Artist Name','Bio Status','Image Status','Genre Status','Vibe Status','Database ID'];
                const rows = exportList.map(a => {
                  const fs = a.field_status || {};
                  return [
                    `"${(a.name || '').replace(/"/g, '""')}"`,
                    a.bio ? (fs.bio || 'live') : 'missing',
                    a.image_url ? (fs.image_url || 'live') : 'missing',
                    (a.genres?.length > 0) ? (fs.genres || 'live') : 'missing',
                    (a.vibes?.length > 0) ? (fs.vibes || 'live') : 'missing',
                    a.id,
                  ];
                });
                const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a'); link.href = url;
                link.download = `artist-audit-${new Date().toISOString().slice(0,10)}.csv`;
                link.click(); URL.revokeObjectURL(url);
              }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              ↓ CSV
            </button>
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
                          image_url: ai.image_url || prev.image_url,
                          instagram_url: ai.instagram_url || prev.instagram_url,
                        }));
                        // Load image carousel with candidates
                        if (ai.image_candidates?.length > 0) {
                          setImageCandidates(ai.image_candidates);
                          setImageCarouselIdx(0);
                        }
                        const imgNote = ai.image_source === 'placeholder' ? ' (placeholder images)' : ` (${ai.image_candidates?.length || 0} images found)`;
                        setArtistToast({ type: 'success', message: `AI fields populated${imgNote} — review & save!` });
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
              {(() => {
                const labelStyle = { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'DM Sans', sans-serif" };
                const inputStyle = {
                  width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                };
                const RegenBtn = ({ field }) => (
                  <button
                    title={`Regenerate ${field} with AI`}
                    disabled={regeneratingField !== null}
                    onClick={() => regenerateField(field)}
                    style={{
                      background: 'none', border: 'none', cursor: regeneratingField ? 'wait' : 'pointer',
                      color: regeneratingField === field ? '#E8722A' : 'var(--text-muted)',
                      fontSize: '12px', padding: '0 2px', display: 'inline-flex', alignItems: 'center',
                      animation: regeneratingField === field ? 'spin 1s linear infinite' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor" /></svg>
                  </button>
                );
                return (<>
              {/* Artist Name — full width above the 2-col grid */}
              <div style={{ marginBottom: '12px' }}>
                <span style={labelStyle}>Artist Name</span>
                <input
                  type="text"
                  value={artistForm.name}
                  onChange={e => setArtistForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Clean display name"
                  style={{ ...inputStyle, marginTop: '4px', fontWeight: 700, fontSize: '15px' }}
                />
                {artistForm.name && editingArtist && artistForm.name !== editingArtist.name && (
                  <div style={{ fontSize: '10px', color: '#E8722A', marginTop: '3px', fontFamily: "'DM Sans', sans-serif" }}>
                    Renaming from &ldquo;{editingArtist.name}&rdquo; — old name will be saved as an alias
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <span style={labelStyle}>Bio</span>
                    <RegenBtn field="bio" />
                  </div>
                  <textarea
                    value={artistForm.bio}
                    onChange={e => setArtistForm(p => ({ ...p, bio: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', marginTop: '12px' }}>
                    <span style={labelStyle}>Vibes</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {VIBES.map(v => {
                      const selected = artistForm.vibes.split(',').map(s => s.trim()).filter(Boolean).includes(v);
                      return (
                        <button key={v} type="button" onClick={() => {
                          const current = artistForm.vibes.split(',').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(x => x !== v) : [...current, v];
                          setArtistForm(p => ({ ...p, vibes: next.join(', ') }));
                        }} style={{
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                          background: selected ? 'rgba(232,114,42,0.15)' : 'var(--bg-card)',
                          color: selected ? '#E8722A' : 'var(--text-muted)',
                          outline: selected ? '1.5px solid #E8722A' : '1px solid var(--border)',
                          transition: 'all 0.12s ease',
                        }}>{v}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <span style={labelStyle}>Genres</span>
                    <RegenBtn field="genres" />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {GENRES.map(g => {
                      const selected = artistForm.genres.split(',').map(s => s.trim()).filter(Boolean).includes(g);
                      return (
                        <button key={g} type="button" onClick={() => {
                          const current = artistForm.genres.split(',').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(x => x !== g) : [...current, g];
                          setArtistForm(p => ({ ...p, genres: next.join(', ') }));
                        }} style={{
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                          background: selected ? 'rgba(232,114,42,0.15)' : 'var(--bg-card)',
                          color: selected ? '#E8722A' : 'var(--text-muted)',
                          outline: selected ? '1.5px solid #E8722A' : '1px solid var(--border)',
                          transition: 'all 0.12s ease',
                        }}>{g}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', marginTop: '12px' }}>
                    <span style={labelStyle}>Image URL</span>
                    <RegenBtn field="image_url" />
                    {imageCandidates.length > 1 && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        {imageCarouselIdx + 1}/{imageCandidates.length}
                      </span>
                    )}
                  </div>
                  {/* Image URL input with carousel arrows */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {imageCandidates.length > 1 && (
                      <button
                        onClick={() => {
                          const prev = (imageCarouselIdx - 1 + imageCandidates.length) % imageCandidates.length;
                          setImageCarouselIdx(prev);
                          setArtistForm(p => ({ ...p, image_url: imageCandidates[prev] }));
                        }}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        title="Previous image"
                      >&lt;</button>
                    )}
                    <input
                      type="text"
                      value={artistForm.image_url}
                      onChange={e => setArtistForm(p => ({ ...p, image_url: e.target.value }))}
                      placeholder="https://..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {imageCandidates.length > 1 && (
                      <button
                        onClick={() => {
                          const next = (imageCarouselIdx + 1) % imageCandidates.length;
                          setImageCarouselIdx(next);
                          setArtistForm(p => ({ ...p, image_url: imageCandidates[next] }));
                        }}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        title="Next image"
                      >&gt;</button>
                    )}
                  </div>
                  {/* Live Mobile Preview with overlay carousel arrows */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                        Mobile Preview
                      </span>
                      {imageCandidates.length > 1 && (
                        <span style={{ fontSize: '10px', color: '#E8722A', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                          {imageCarouselIdx + 1} of {imageCandidates.length}
                        </span>
                      )}
                      {imageCandidates.length <= 1 && !regeneratingField && (
                        <button
                          onClick={() => regenerateField('image_url')}
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                            color: '#E8722A', fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Search for images
                        </button>
                      )}
                    </div>
                    <div style={{
                      position: 'relative', width: '100%', maxWidth: '180px',
                      aspectRatio: '1 / 1', borderRadius: '12px',
                      overflow: 'hidden', background: '#1A1A24',
                      border: '1px solid var(--border)',
                    }}>
                      {artistForm.image_url ? (
                        <img
                          src={artistForm.image_url}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.src = ''; e.target.alt = 'Failed to load'; }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '24px' }}>🎤</div>
                      )}
                      {/* Overlay carousel arrows */}
                      {imageCandidates.length > 1 && (<>
                        <button
                          onClick={() => {
                            const prev = (imageCarouselIdx - 1 + imageCandidates.length) % imageCandidates.length;
                            setImageCarouselIdx(prev);
                            setArtistForm(p => ({ ...p, image_url: imageCandidates[prev] }));
                          }}
                          style={{
                            position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)',
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                            color: '#fff', fontSize: '14px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >&lt;</button>
                        <button
                          onClick={() => {
                            const next = (imageCarouselIdx + 1) % imageCandidates.length;
                            setImageCarouselIdx(next);
                            setArtistForm(p => ({ ...p, image_url: imageCandidates[next] }));
                          }}
                          style={{
                            position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                            color: '#fff', fontSize: '14px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >&gt;</button>
                      </>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', marginTop: '12px' }}>
                    <span style={labelStyle}>Instagram URL</span>
                  </div>
                  <input
                    type="text"
                    value={artistForm.instagram_url}
                    onChange={e => setArtistForm(p => ({ ...p, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/..."
                    style={inputStyle}
                  />
                </div>
              </div>
                </>);
              })()}
              {/* Associated Events — read-only context for investigation */}
              {artistEvents.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" }}>
                    Associated Events ({artistEvents.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                    {artistEvents.map(ev => (
                      <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.venue_name || ev.venues?.name || '—'}</span>
                        <span>·</span>
                        <span>{formatDate(ev.event_date)}</span>
                        {ev.source && /^https?:\/\//i.test(ev.source) && (
                          <a href={ev.source} target="_blank" rel="noopener noreferrer" style={{ color: '#E8722A', fontSize: '10px', textDecoration: 'none' }}>
                            {(() => { try { return new URL(ev.source).hostname.replace('www.', ''); } catch { return 'source'; } })()}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditingArtist(null)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >Cancel</button>
                {(() => {
                  // Shared save logic
                  const doSave = async (approve) => {
                    const genres = artistForm.genres
                      ? artistForm.genres.split(',').map(g => g.trim()).filter(Boolean)
                      : null;
                    const vibes = artistForm.vibes
                      ? artistForm.vibes.split(',').map(v => v.trim()).filter(Boolean)
                      : null;
                    const prevLocks = editingArtist.is_human_edited || {};
                    const prevFS = editingArtist.field_status || {};
                    const newLocks = { ...prevLocks };
                    const newFS = { ...prevFS };
                    // Lock & set status for edited fields
                    if (artistForm.bio) {
                      if (approve || artistForm.bio !== (editingArtist.bio || '')) newLocks.bio = true;
                      newFS.bio = 'live';
                    }
                    if (artistForm.image_url) {
                      if (approve || artistForm.image_url !== (editingArtist.image_url || '')) newLocks.image_url = true;
                      newFS.image_url = 'live';
                    }
                    if (artistForm.genres) {
                      if (approve || artistForm.genres !== (Array.isArray(editingArtist.genres) ? editingArtist.genres.join(', ') : (editingArtist.genres || ''))) newLocks.genres = true;
                      newFS.genres = 'live';
                    }
                    if (artistForm.vibes) {
                      if (approve || artistForm.vibes !== (Array.isArray(editingArtist.vibes) ? editingArtist.vibes.join(', ') : (editingArtist.vibes || ''))) newLocks.vibes = true;
                      newFS.vibes = 'live';
                    }
                    const payload = {
                        id: editingArtist.id,
                        bio: artistForm.bio || null,
                        genres: genres && genres.length > 0 ? genres : null,
                        vibes: vibes && vibes.length > 0 ? vibes : null,
                        image_url: artistForm.image_url || null,
                        instagram_url: artistForm.instagram_url || null,
                        is_human_edited: newLocks,
                        field_status: newFS,
                    };
                    // If name was changed, include it + flag the old name for alias tracking
                    const nameChanged = artistForm.name && artistForm.name.trim() !== editingArtist.name;
                    if (nameChanged) {
                      payload.name = artistForm.name.trim();
                      payload.old_name = editingArtist.name; // triggers alias creation on backend
                    }
                    await fetch('/api/admin/artists', {
                      method: 'PUT', headers,
                      body: JSON.stringify(payload),
                    });
                    setEditingArtist(null);
                    fetchArtists(artistsSearch, artistsNeedsInfo);
                    setArtistToast({ type: 'success', message: nameChanged ? `Renamed & saved — "${editingArtist.name}" saved as alias` : (approve ? 'Approved & published — all fields locked' : 'Saved — edited fields locked') });
                    setTimeout(() => setArtistToast(null), 3000);
                  };
                  return (<>
                    <button onClick={() => doSave(false)} style={{
                      padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                      background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                    }}>Save Draft</button>
                    <button onClick={() => doSave(true)} style={{
                      padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                      background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                    }}>Approve &amp; Publish</button>
                  </>);
                })()}
              </div>
            </div>
          )}

          {/* Artist list */}
          {(() => {
            const anyFilterActive = Object.values(artistMissingFilters).some(Boolean);
            let displayArtists = anyFilterActive ? artists.filter(a => {
              if (artistMissingFilters.bio && !a.bio) return true;
              if (artistMissingFilters.image_url && !a.image_url) return true;
              if (artistMissingFilters.genres && (!a.genres || a.genres.length === 0)) return true;
              if (artistMissingFilters.vibes && (!a.vibes || a.vibes.length === 0)) return true;
              return false;
            }) : [...artists];

            // Sort by next event: artists with upcoming gigs first (ascending by date), nulls to bottom
            if (artistsSortBy === 'next_event') {
              displayArtists.sort((a, b) => {
                const aDate = a.next_event_date;
                const bDate = b.next_event_date;
                if (!aDate && !bDate) return 0;
                if (!aDate) return 1;  // no gigs → bottom
                if (!bDate) return -1;
                return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
              });
            }
            return displayArtists.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>🎸</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
                {anyFilterActive ? 'No artists match these filters' : 'No artists yet'}
              </p>
              <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
                {anyFilterActive
                  ? 'Clear the filter chips above to see all artists.'
                  : 'Run the SQL migration to create the artists table, then artists will appear here.'}
              </p>
            </div>
          ) : (<>
            {/* Select All header — sticky */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 16px',
              borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '4px',
              position: 'sticky', top: 0, zIndex: 10,
            }}>
              <input
                type="checkbox"
                checked={displayArtists.length > 0 && selectedArtists.size === displayArtists.length}
                onChange={e => {
                  if (e.target.checked) setSelectedArtists(new Set(displayArtists.map(a => a.id)));
                  else setSelectedArtists(new Set());
                }}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A' }}
              />
              <span
                onClick={() => setArtistsSortBy(prev => prev === 'name' ? 'next_event' : 'name')}
                style={{ flex: 1, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: artistsSortBy === 'name' ? '#E8722A' : 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', userSelect: 'none' }}
              >
                Artist {artistsSortBy === 'name' ? '▼' : ''}
              </span>
              {!isMobile && <span
                onClick={() => setArtistsSortBy(prev => prev === 'next_event' ? 'name' : 'next_event')}
                style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: artistsSortBy === 'next_event' ? '#E8722A' : 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '100px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
              >
                Next Event {artistsSortBy === 'next_event' ? '▲' : ''}
              </span>}
              {!isMobile && <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", minWidth: '220px', textAlign: 'center' }}>
                Status
              </span>}
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '120px', textAlign: 'right' }}>
                Actions
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {displayArtists.map(artist => {
                const hasBio = !!artist.bio;
                const hasImg = !!artist.image_url;
                const hasGenre = artist.genres && artist.genres.length > 0;
                const hasVibe = artist.vibes && artist.vibes.length > 0;
                const isEditing = editingArtist?.id === artist.id;
                const isSelected = selectedArtists.has(artist.id);
                const locks = artist.is_human_edited || {};
                const fs = artist.field_status || {};

                // Traffic light: Red (missing), Yellow (AI pending), Green (approved/live)
                const TrafficDot = ({ field, hasData, label }) => {
                  const status = hasData ? (fs[field] || 'live') : null;
                  const locked = locks[field];
                  const colors = {
                    live:    { bg: 'rgba(34,197,94,0.12)', color: '#22c55e' },
                    pending: { bg: 'rgba(234,179,8,0.12)', color: '#EAB308' },
                    null:    { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
                  };
                  const c = colors[status] || colors.null;
                  return (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      padding: '2px 8px', borderRadius: '9999px',
                      fontSize: '10px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                      background: c.bg, color: c.color,
                    }}>
                      {locked && <span style={{ fontSize: '7px' }}>🔒</span>}
                      {label}
                    </span>
                  );
                };

                return (
                  <div
                    key={artist.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '10px 16px', borderRadius: '10px',
                      background: isSelected ? 'rgba(232,114,42,0.06)' : (isEditing ? 'rgba(232,114,42,0.04)' : 'var(--bg-card)'),
                      border: `1px solid ${isEditing ? '#E8722A' : (isSelected ? '#E8722A44' : 'var(--border)')}`,
                      transition: 'all 0.1s ease',
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => {
                        setSelectedArtists(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(artist.id);
                          else next.delete(artist.id);
                          return next;
                        });
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A', flexShrink: 0 }}
                    />

                    {/* Avatar */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                      background: artist.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', fontSize: '16px',
                    }}>
                      {artist.image_url
                        ? <img src={artist.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : '🎤'
                      }
                    </div>

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {artist.name}
                      </span>
                    </div>

                    {/* Next Event date — hidden on mobile */}
                    {!isMobile && <div style={{ width: '100px', textAlign: 'center', flexShrink: 0 }}>
                      {artist.next_event_date ? (
                        <span style={{
                          fontSize: '11px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                          color: 'var(--text-muted)',
                        }}>
                          {new Date(artist.next_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5, fontFamily: "'DM Sans', sans-serif" }}>—</span>
                      )}
                    </div>}

                    {/* Traffic light status pills — hidden on mobile */}
                    {!isMobile && <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap', minWidth: '220px', justifyContent: 'center', flexShrink: 0 }}>
                      <TrafficDot field="bio" hasData={hasBio} label="Bio" />
                      <TrafficDot field="image_url" hasData={hasImg} label="Img" />
                      <TrafficDot field="genres" hasData={hasGenre} label="Genre" />
                      <TrafficDot field="vibes" hasData={hasVibe} label="Vibe" />
                    </div>}

                    {/* Action buttons — wand + pencil + trash */}
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0, width: isMobile ? 'auto' : '120px', justifyContent: 'flex-end' }}>
                      {/* AI Enrich (magic wand) — single-artist shortcut */}
                      <button
                        title="Run AI Enrichment on this artist"
                        onClick={() => setEnrichConfirm([artist])}
                        className="p-1.5 rounded"
                        style={{ color: '#E8722A', cursor: 'pointer', background: 'none', border: 'none' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.71 11.04a.996.996 0 000-1.41l-2.34-2.34zM5.71 21.29L2.71 18.29l1.41-1.41 3 3-1.41 1.41z" fill="currentColor" /></svg>
                      </button>
                      {/* Edit (pencil) */}
                      <button
                        title="Edit artist"
                        onClick={async () => {
                          setEditingArtist(artist);
                          setImageCandidates(artist.image_url ? [artist.image_url] : []);
                          setImageCarouselIdx(0);
                          setArtistForm({
                            name: artist.name || '',
                            bio: artist.bio || '',
                            genres: artist.genres ? (Array.isArray(artist.genres) ? artist.genres.join(', ') : artist.genres) : '',
                            vibes: artist.vibes ? (Array.isArray(artist.vibes) ? artist.vibes.join(', ') : artist.vibes) : '',
                            image_url: artist.image_url || '',
                            instagram_url: artist.instagram_url || '',
                          });
                          // Fetch associated events for context
                          try {
                            const params = new URLSearchParams({ page: '1', limit: '20', sort: 'event_date', order: 'asc' });
                            const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
                            if (res.ok) {
                              const data = await res.json();
                              const all = data.events || [];
                              setArtistEvents(all.filter(e =>
                                e.artist_id === artist.id ||
                                (e.artist_name && e.artist_name.toLowerCase() === artist.name.toLowerCase())
                              ));
                            }
                          } catch { setArtistEvents([]); }
                        }}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.001 1.001 0 000-1.42l-2.34-2.34a1.001 1.001 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="currentColor" /></svg>
                      </button>

                      {/* Delete (trash) — triggers smart confirmation modal */}
                      <button
                        title="Delete artist"
                        disabled={artistActionLoading === artist.id}
                        onClick={async () => {
                          // Fetch event count before showing modal
                          try {
                            const res = await fetch(`/api/admin/artists?id=${artist.id}&action=count-events`, { method: 'DELETE', headers });
                            const data = await res.json();
                            setDeleteConfirm({ artist, eventCount: data.upcoming_event_count || 0 });
                          } catch {
                            setDeleteConfirm({ artist, eventCount: 0 });
                          }
                        }}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', opacity: artistActionLoading === artist.id ? 0.5 : 1 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>);
          })()}
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
                {(() => { const validCount = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).length; return validCount === 0 ? 'No pins — using auto fallback' : `${validCount}/5 pinned`; })()}
              </span>
            </div>
          </div>

          {/* Pinned events (reorderable list) — filter out stale/deleted pins */}
          {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).length > 0 && (
            <div className="mb-6">
              <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pinned Order (drag to reorder)
              </h3>
              <div className="space-y-2">
                {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).map((eventId, i) => {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Events on {spotlightDate}
            </h3>
            <div style={{ flex: '1 1 200px', maxWidth: '360px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search artist or venue..."
                value={spotlightSearch}
                onChange={e => setSpotlightSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 14px', paddingRight: spotlightSearch ? '32px' : '14px',
                  background: 'var(--bg-elevated)', border: '1.5px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '13px', outline: 'none',
                }}
              />
              {spotlightSearch && (
                <button
                  onClick={() => setSpotlightSearch('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1,
                  }}
                >✕</button>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
              {spotlightEvents.length} events
            </span>
          </div>
          <div className="space-y-2">
            {spotlightEvents
              .filter(ev => {
                if (!spotlightSearch.trim()) return true;
                const q = spotlightSearch.trim().toLowerCase();
                const artist = (ev.artist_name || '').toLowerCase();
                const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
                return artist.includes(q) || venue.includes(q);
              })
              .map(ev => {
                const isPinned = spotlightPins.includes(ev.id);
                // Check for image: event-level, joined artist from API, or artists state array
                const hasImage = !!(ev.image_url || ev.artists?.image_url);
                const linkedArtist = ev.artist_id
                  ? artists.find(a => a.id === ev.artist_id)
                  : artists.find(a => a.name?.toLowerCase() === (ev.artist_name || '').toLowerCase());
                const artistHasImage = !!(linkedArtist?.image_url);
                const effectiveHasImage = hasImage || artistHasImage;
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all"
                    style={{
                      background: isPinned ? 'rgba(232,114,42,0.08)' : 'var(--bg-card)',
                      borderColor: isPinned ? '#E8722A' : 'var(--border)',
                    }}
                    onClick={() => {
                      // If unpinning, always allow
                      if (isPinned) { toggleSpotlightPin(ev.id); return; }
                      // If missing image, show warning modal
                      if (!effectiveHasImage) { setSpotlightImageWarning(ev); return; }
                      toggleSpotlightPin(ev.id);
                    }}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold"
                      style={{
                        background: isPinned ? '#E8722A' : 'var(--bg-elevated)',
                        color: isPinned ? '#111' : 'var(--text-muted)',
                      }}>
                      {isPinned ? '★' : '☆'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {ev.artist_name}
                        {!effectiveHasImage && (
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
                            background: 'rgba(234,179,8,0.12)', color: '#EAB308', border: '1px solid rgba(234,179,8,0.25)',
                            fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                          }}>
                            ⚠️ No Image
                          </span>
                        )}
                      </div>
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

      {/* Venues Tab — Scraper Health Directory */}
      {activeTab === 'venues' && !loading && (() => {
        // Platform colors for read-only badges (auto-populated from VENUE_REGISTRY in sync route)
        const PLATFORM_COLORS = {
          'WordPress': '#21759B', 'WordPress AJAX': '#21759B', 'Squarespace': '#1A1A1A',
          'Wix': '#0C6EFC', 'BentoBox/Wix': '#0C6EFC', 'Google Calendar': '#4285F4',
          'Eventbrite API': '#F05537', 'Ticketmaster API': '#026CDF', 'GraphQL': '#E535AB',
          'HTML Scrape': '#E8722A', 'RestaurantPassion': '#8B5CF6', 'Image Poster': '#D97706', 'Custom': '#6B7280', 'Unknown': '#6B7280',
        };

        // Filter by status OR platform
        let filtered = scraperHealth;
        if (venuesFilter !== 'all') {
          if (['fail', 'warning', 'success'].includes(venuesFilter)) {
            filtered = filtered.filter(s => s.status === venuesFilter);
          } else {
            // Platform filter
            filtered = filtered.filter(s => (s.platform || 'Unknown') === venuesFilter);
          }
        }
        const failCount = scraperHealth.filter(s => s.status === 'fail').length;
        const warnCount = scraperHealth.filter(s => s.status === 'warning').length;
        const okCount = scraperHealth.filter(s => s.status === 'success').length;

        // Unique platforms for filter
        const platforms = [...new Set(scraperHealth.map(s => s.platform || 'Unknown'))].sort();

        return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
              Venue Scrapers <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>({scraperHealth.length})</span>
            </h2>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'all', label: `All` },
                { key: 'fail', label: `Failed (${failCount})` },
                { key: 'warning', label: `Warn (${warnCount})` },
                { key: 'success', label: `OK (${okCount})` },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setVenuesFilter(seg.key)}
                  style={{
                    padding: '6px 10px', fontSize: '11px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: venuesFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: venuesFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platform filter chips */}
          {platforms.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {platforms.map(p => (
                <button
                  key={p}
                  onClick={() => setVenuesFilter(venuesFilter === p ? 'all' : p)}
                  style={{
                    padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                    background: venuesFilter === p ? (PLATFORM_COLORS[p] || '#6B7280') : 'var(--bg-elevated)',
                    color: venuesFilter === p ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {p} ({scraperHealth.filter(s => (s.platform || 'Unknown') === p).length})
                </button>
              ))}
            </div>
          )}

          {scraperHealth.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                No scraper health data yet. Run a sync to populate.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(s => {
                const statusStyle = {
                  success: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'OK' },
                  fail: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'FAIL' },
                  warning: { bg: 'rgba(234,179,8,0.12)', color: '#EAB308', label: 'WARN' },
                }[s.status] || { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: '?' };
                const platColor = PLATFORM_COLORS[s.platform] || '#6B7280';

                return (
                  <div key={s.scraper_key} style={{
                    padding: '12px 16px', borderRadius: '10px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    {/* Status badge */}
                    <span style={{
                      fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px',
                      background: statusStyle.bg, color: statusStyle.color,
                      fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.5px',
                      minWidth: '44px', textAlign: 'center',
                    }}>
                      {statusStyle.label}
                    </span>

                    {/* Venue info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {s.venue_name}
                        </span>
                        {s.website_url && (
                          <a href={s.website_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {s.last_sync && (
                          <span>Synced {new Date(s.last_sync).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                        <span>·</span>
                        <span>{s.events_found} events</span>
                      </div>
                      {s.error_message && (
                        <div style={{
                          fontSize: '11px', color: '#ef4444', fontFamily: "'DM Sans', monospace",
                          marginTop: '4px', padding: '4px 8px', borderRadius: '4px',
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                          wordBreak: 'break-word',
                        }}>
                          {s.error_message}
                        </div>
                      )}
                    </div>

                    {/* Platform badge — editable dropdown */}
                    {/* Platform badge — read-only, auto-populated from sync */}
                    <span style={{
                      padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                      background: platColor + '18', color: platColor,
                      border: `1px solid ${platColor}33`,
                      fontFamily: "'DM Sans', sans-serif",
                      flexShrink: 0, cursor: 'default', userSelect: 'none',
                    }}>
                      {s.platform || 'Unknown'}
                    </span>
                    <button
                      onClick={() => handleForceSync(s.scraper_key)}
                      disabled={!!forceSyncing}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                        background: forceSyncing === s.scraper_key ? '#E8722A' : 'rgba(232, 114, 42, 0.12)',
                        color: forceSyncing === s.scraper_key ? '#FFFFFF' : '#E8722A',
                        border: '1px solid rgba(232, 114, 42, 0.3)',
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: forceSyncing ? 'not-allowed' : 'pointer',
                        flexShrink: 0, opacity: forceSyncing && forceSyncing !== s.scraper_key ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {forceSyncing === s.scraper_key ? '⟳ Syncing…' : '⟳ Sync'}
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center py-8 text-brand-text-muted">No venues match this filter.</p>
              )}
            </div>
          )}
        </div>
        );
      })()}

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
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: isMobile ? '0' : '16px', overflow: 'hidden', border: isMobile ? 'none' : `1px solid ${qBorder}`, height: isMobile ? 'auto' : 'calc(100vh - 220px)' }}>
              {/* ── Left: Queue Sidebar — on mobile, only show when detail is closed ── */}
              {(!isMobile || !mobileQueueDetail) && (
              <div style={{ width: isMobile ? '100%' : '240px', minWidth: isMobile ? 'auto' : '240px', borderRight: isMobile ? 'none' : `1px solid ${qBorder}`, overflowY: 'auto', background: isMobile ? 'transparent' : qSurface }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${qBorder}`, fontSize: '11px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Pending ({queue.length})
                </div>
                {queue.map((sub, i) => (
                  <div
                    key={sub.id}
                    onClick={() => { selectQueueItem(i); if (isMobile) setMobileQueueDetail(true); }}
                    style={{
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: `1px solid ${qBorder}`,
                      background: i === queueSelectedIdx ? qSurfaceAlt : 'transparent',
                      borderLeft: i === queueSelectedIdx ? `3px solid ${qAccent}` : '3px solid transparent',
                      borderRadius: isMobile ? '10px' : '0',
                      marginBottom: isMobile ? '4px' : '0',
                      border: isMobile ? `1px solid ${qBorder}` : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: qText, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.artist_name || (sub.image_url ? '📷 Flyer Upload' : 'Unknown')}
                    </div>
                    <div style={{ fontSize: '12px', color: qTextMuted }}>
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
              )}

              {/* ── Middle + Right: Source & Editor — on mobile, only show when detail is open ── */}
              {(!isMobile || mobileQueueDetail) && (<>
              {/* Mobile back button */}
              {isMobile && (
                <button
                  onClick={() => setMobileQueueDetail(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 14px', marginBottom: '12px',
                    background: 'none', border: `1px solid ${qBorder}`, borderRadius: '10px',
                    color: '#E8722A', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  ← Back to Submissions
                </button>
              )}
              {/* ── Middle: Source Panel ────────────────────────────────────── */}
              <div style={{ flex: '1 1 40%', minWidth: isMobile ? 'auto' : '280px', borderRight: isMobile ? 'none' : `1px solid ${qBorder}`, overflowY: 'auto', padding: isMobile ? '12px 0' : '24px' }}>
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
                            border: `1px solid ${qRed}33`, background: `${qRed}11`,
                            color: qRed, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ✕ Reject &amp; Delete
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
                          📝 Save as Draft
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
              </>)}
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && !loading && (() => {
        const filteredFlags = reports.filter(r =>
          flagsViewFilter === 'pending' ? r.status === 'pending' : r.status !== 'pending'
        );
        return (
        <div>
          {/* Header + view filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>User Flags</h2>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'pending', label: 'Pending' },
                { key: 'archived', label: 'Archived' },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setFlagsViewFilter(seg.key)}
                  style={{
                    padding: '6px 14px', fontSize: '13px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: flagsViewFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: flagsViewFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredFlags.map((rep) => {
              const flagColors = {
                cancel: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#ef4444', label: 'Band Canceled' },
                cover: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', color: '#EAB308', label: 'Cover Added' },
                other: { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', color: '#60A5FA', label: 'Other' },
              };
              const statusColors = {
                fixed: { bg: '#22c55e', color: '#fff', label: 'FIXED' },
                rejected: { bg: '#6B7280', color: '#fff', label: 'REJECTED' },
                reviewed: { bg: '#60A5FA', color: '#fff', label: 'REVIEWED' },
              };
              const fc = flagColors[rep.issue_type] || flagColors.other;
              const sc = statusColors[rep.status];
              const ghostBtn = {
                padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                background: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              };
              return (
                <div key={rep.id} style={{
                  padding: '14px 16px', borderRadius: '12px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: '0',
                }}>
                  {/* Card body */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {rep.events?.artist_name || 'Unknown Event'}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                        background: fc.bg, color: fc.color, border: `1px solid ${fc.border}`,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {fc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif", marginBottom: '2px' }}>
                      {rep.events?.venue_name || '—'} · {rep.events?.event_date ? formatDate(rep.events.event_date) : '—'}
                    </div>
                    {rep.description && (
                      <div style={{
                        fontSize: '13px', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif",
                        marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        lineHeight: 1.5,
                      }}>
                        &ldquo;{rep.description}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Card footer — timestamp left, actions right */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                      Reported {rep.created_at ? new Date(rep.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                      {rep.resolved_at && ` · Resolved ${new Date(rep.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Edit Event — ghost button */}
                      {rep.event_id && (
                        <button
                          onClick={() => {
                            const ev = events.find(e => e.id === rep.event_id);
                            if (ev) { setEditingEvent(ev); setShowEventForm(true); }
                            else { setActiveTab('events'); setEventsSearch(rep.events?.artist_name || ''); }
                          }}
                          style={{ ...ghostBtn, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          Edit Event
                        </button>
                      )}
                      {/* Edit Artist — ghost button */}
                      <button
                        onClick={() => {
                          const artistName = rep.events?.artist_name || '';
                          const linkedArtist = artists.find(a => a.name?.toLowerCase() === artistName.toLowerCase());
                          if (linkedArtist) {
                            setActiveTab('artists');
                            setEditingArtist(linkedArtist);
                            setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                            setImageCarouselIdx(0);
                            setArtistForm({
                              name: linkedArtist.name || '',
                              bio: linkedArtist.bio || '',
                              genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                              vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                              image_url: linkedArtist.image_url || '',
                              instagram_url: linkedArtist.instagram_url || '',
                            });
                          } else {
                            setActiveTab('artists');
                            setArtistsSearch(artistName);
                            fetchArtists(artistName, false);
                          }
                        }}
                        style={{ ...ghostBtn, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      >
                        Edit Artist
                      </button>
                      {/* Resolve — primary action or archived badge */}
                      {rep.status === 'pending' ? (
                        <select
                          value=""
                          onChange={async (e) => {
                            const newStatus = e.target.value;
                            if (!newStatus) return;
                            try {
                              await fetch('/api/reports', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                body: JSON.stringify({ id: rep.id, status: newStatus }),
                              });
                              const idx = reports.findIndex(r => r.id === rep.id);
                              if (idx !== -1) {
                                const updated = [...reports];
                                updated[idx] = { ...updated[idx], status: newStatus, resolved_at: new Date().toISOString() };
                                setReports(updated);
                              }
                              showQueueToast(`Flag resolved as "${newStatus}"`);
                            } catch (err) { console.error('Resolve error:', err); }
                          }}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            background: '#E8722A', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", outline: 'none',
                          }}
                        >
                          <option value="">Resolve ▾</option>
                          <option value="fixed">Fixed</option>
                          <option value="rejected">Rejected</option>
                          <option value="reviewed">Reviewed</option>
                        </select>
                      ) : sc && (
                        <span style={{
                          fontSize: '11px', fontWeight: 800, padding: '6px 16px', borderRadius: '8px',
                          background: sc.bg, color: sc.color,
                          fontFamily: "'DM Sans', sans-serif",
                          letterSpacing: '0.8px', textTransform: 'uppercase',
                          cursor: 'default', userSelect: 'none',
                        }}>
                          {sc.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredFlags.length === 0 && (
              <p className="text-center py-8 text-brand-text-muted">
                {flagsViewFilter === 'pending' ? 'No pending flags.' : 'No archived flags yet.'}
              </p>
            )}
          </div>
        </div>
        );
      })()}

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
                onClick={() => {
                  const ev = spotlightImageWarning;
                  setSpotlightImageWarning(null);
                  // Find the linked artist and open edit modal
                  const linkedArtist = ev.artist_id ? artists.find(a => a.id === ev.artist_id) : artists.find(a => a.name?.toLowerCase() === ev.artist_name?.toLowerCase());
                  if (linkedArtist) {
                    setActiveTab('artists');
                    setEditingArtist(linkedArtist);
                    setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                    setImageCarouselIdx(0);
                    setArtistForm({
                      name: linkedArtist.name || '',
                      bio: linkedArtist.bio || '',
                      genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                      vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                      image_url: linkedArtist.image_url || '',
                      instagram_url: linkedArtist.instagram_url || '',
                    });
                  } else {
                    setActiveTab('artists');
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
                          body: JSON.stringify({ id, event_date: newDateTime }),
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
                    color: bulkTime ? '#fff' : '#666',
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

      {/* Sticky Bulk Action Bar — floats at bottom when artists are selected */}
      {activeTab === 'artists' && (selectedArtists.size > 0 || bulkEnrichProgress) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 400,
          background: '#1A1A24', borderTop: '1px solid #2A2A3A',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8722A' }}>
            {selectedArtists.size} selected
          </span>
          <button
            onClick={() => setSelectedArtists(new Set())}
            style={{
              background: 'none', border: '1px solid #3A3A4A', borderRadius: '6px',
              color: '#9898B8', fontSize: '11px', fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Deselect All
          </button>
          <div style={{ flex: 1 }} />
          {bulkEnrichProgress ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
              <span style={{ fontSize: '12px', color: '#C0C0D0', whiteSpace: 'nowrap' }}>
                Enriching {bulkEnrichProgress.done}/{bulkEnrichProgress.total}...
              </span>
              <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#2A2A3A', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round((bulkEnrichProgress.done / bulkEnrichProgress.total) * 100)}%`,
                  height: '100%', background: '#E8722A', borderRadius: '3px', transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ) : (<>
            <button
              onClick={() => {
                const toEnrich = artists.filter(a => selectedArtists.has(a.id));
                setEnrichConfirm(toEnrich);
              }}
              style={{
                padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #E8722A, #d35f1a)', color: '#fff',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.71 11.04a.996.996 0 000-1.41l-2.34-2.34z" fill="currentColor" /></svg>
              AI Enrich ({selectedArtists.size})
            </button>
            <button
              onClick={async () => {
                // Fetch event counts for all selected artists in parallel
                const selected = artists.filter(a => selectedArtists.has(a.id));
                let totalEvents = 0;
                const perArtistCounts = {};
                try {
                  const counts = await Promise.all(
                    selected.map(a =>
                      fetch(`/api/admin/artists?id=${a.id}&action=count-events`, { method: 'DELETE', headers })
                        .then(r => r.json())
                        .then(d => {
                          const c = d.upcoming_event_count || 0;
                          perArtistCounts[a.id] = c;
                          return c;
                        })
                        .catch(() => { perArtistCounts[a.id] = 0; return 0; })
                    )
                  );
                  totalEvents = counts.reduce((sum, c) => sum + c, 0);
                } catch { /* fallback to 0 */ }
                setBulkDeleteConfirm({ artists: selected, totalEvents, perArtistCounts });
              }}
              style={{
                padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
              Delete ({selectedArtists.size})
            </button>
            {selectedArtists.size >= 2 && (
              <button
                onClick={() => {
                  const selected = artists.filter(a => selectedArtists.has(a.id));
                  setMergeMasterId(selected[0]?.id || null);
                  setMergeConfirm(selected);
                }}
                style={{
                  padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(96,165,250,0.12)', color: '#60A5FA',
                  border: '1px solid rgba(96,165,250,0.3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 20.41L18.41 19 15 15.59 13.59 17 17 20.41zM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8z" fill="currentColor" /></svg>
                Merge ({selectedArtists.size})
              </button>
            )}
          </>)}
        </div>
      )}

      {/* AI Enrichment Confirmation Modal */}
      {enrichConfirm && (
        <div
          onClick={() => setEnrichConfirm(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif", maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Run AI Enrichment on {enrichConfirm.length} artist{enrichConfirm.length !== 1 ? 's' : ''}?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              This will fetch missing images, bios, genres, and vibes using AI. Human-edited fields are protected and won&apos;t be overwritten.
            </p>

            {/* Artist name list */}
            <div style={{
              maxHeight: '200px', overflowY: 'auto', marginBottom: '16px',
              padding: '8px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {enrichConfirm.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '4px 0', fontSize: '12px', color: 'var(--text-primary)',
                }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                    background: a.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontSize: '10px',
                  }}>
                    {a.image_url
                      ? <img src={a.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : '🎤'
                    }
                  </div>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  {/* Show what's missing */}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {[
                      !a.bio && 'bio',
                      !a.image_url && 'img',
                      (!a.genres || a.genres.length === 0) && 'genre',
                      (!a.vibes || a.vibes.length === 0) && 'vibe',
                    ].filter(Boolean).join(', ') || 'complete'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEnrichConfirm(null)}
                style={{
                  padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const list = [...enrichConfirm];
                  setSelectedArtists(new Set(list.map(a => a.id)));
                  setEnrichConfirm(null);
                  runBulkEnrich(list);
                }}
                style={{
                  padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #E8722A, #d35f1a)', color: '#fff',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5z" fill="currentColor" /></svg>
                Confirm &amp; Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div
          onClick={() => { if (!bulkDeleteLoading) setBulkDeleteConfirm(null); }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif", maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Delete {bulkDeleteConfirm.artists.length} selected artist{bulkDeleteConfirm.artists.length !== 1 ? 's' : ''}?
            </h3>
            {bulkDeleteConfirm.totalEvents > 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                <strong style={{ color: '#E8722A' }}>{bulkDeleteConfirm.totalEvents}</strong> upcoming event{bulkDeleteConfirm.totalEvents !== 1 ? 's' : ''} are linked to these artists.
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                No upcoming events are linked to these artists.
              </p>
            )}

            {/* Granular artist list with per-artist event counts */}
            <div style={{
              maxHeight: '200px', overflowY: 'auto', marginBottom: '16px',
              padding: '8px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {bulkDeleteConfirm.artists.map(a => {
                const evCount = bulkDeleteConfirm.perArtistCounts?.[a.id] || 0;
                return (
                  <div key={a.id} style={{ padding: '4px 0', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{a.name}</span>
                    {evCount > 0 && (
                      <span style={{ fontSize: '11px', color: '#E8722A', fontWeight: 700, marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        {evCount} upcoming event{evCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {bulkDeleteLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#E8722A', fontWeight: 600 }}>
                Deleting...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Option A: Delete & Hide Events (always shown) */}
                <button
                  onClick={async () => {
                    const { artists: toDelete, totalEvents } = bulkDeleteConfirm;
                    setBulkDeleteLoading(true);
                    try {
                      for (const a of toDelete) {
                        await fetch(`/api/admin/artists?id=${a.id}&action=hide-events`, { method: 'DELETE', headers });
                      }
                      setBulkDeleteConfirm(null);
                      setSelectedArtists(new Set());
                      fetchArtists(artistsSearch, artistsNeedsInfo);
                      if (editingArtist && toDelete.some(a => a.id === editingArtist.id)) setEditingArtist(null);
                      showQueueToast(`Deleted ${toDelete.length} artists — ${totalEvents} event(s) hidden`);
                    } catch (err) { console.error(err); }
                    setBulkDeleteLoading(false);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>Delete Artists{bulkDeleteConfirm.totalEvents > 0 ? ' & Hide Events' : ''}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                    {bulkDeleteConfirm.totalEvents > 0
                      ? 'Removes profiles and archives linked events from the live app'
                      : 'Permanently removes these artist profiles'}
                  </div>
                </button>

                {/* Option B: Delete & Keep Events — only if events exist */}
                {bulkDeleteConfirm.totalEvents > 0 && (
                  <button
                    onClick={async () => {
                      const { artists: toDelete, totalEvents } = bulkDeleteConfirm;
                      setBulkDeleteLoading(true);
                      try {
                        for (const a of toDelete) {
                          await fetch(`/api/admin/artists?id=${a.id}&action=unlink-events`, { method: 'DELETE', headers });
                        }
                        setBulkDeleteConfirm(null);
                        setSelectedArtists(new Set());
                        fetchArtists(artistsSearch, artistsNeedsInfo);
                        if (editingArtist && toDelete.some(a => a.id === editingArtist.id)) setEditingArtist(null);
                        showQueueToast(`Deleted ${toDelete.length} artists — ${totalEvents} event(s) kept as "Other"`);
                      } catch (err) { console.error(err); }
                      setBulkDeleteLoading(false);
                    }}
                    style={{
                      padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                      background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                      border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div>Delete Artists, Keep Events</div>
                    <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                      Removes profiles but keeps events live as &ldquo;Other / Special Event&rdquo;
                    </div>
                  </button>
                )}

                <button
                  onClick={() => setBulkDeleteConfirm(null)}
                  style={{
                    padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Merge Duplicates Modal */}
      {mergeConfirm && (
        <div
          onClick={() => { if (!mergeLoading) { setMergeConfirm(null); setMergeMasterId(null); } }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '480px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif", maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Which profile is the correct Master Profile?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              All events from the other {mergeConfirm.length - 1} profile{mergeConfirm.length - 1 !== 1 ? 's' : ''} will be transferred to the master. Duplicate profiles will then be deleted.
            </p>

            {/* Artist radio list */}
            <div style={{
              maxHeight: '240px', overflowY: 'auto', marginBottom: '16px',
              padding: '4px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {mergeConfirm.map(a => (
                <label
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                    borderRadius: '8px', cursor: 'pointer',
                    background: mergeMasterId === a.id ? 'rgba(96,165,250,0.1)' : 'transparent',
                    border: mergeMasterId === a.id ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="merge-master"
                    checked={mergeMasterId === a.id}
                    onChange={() => setMergeMasterId(a.id)}
                    style={{ accentColor: '#60A5FA', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  {a.image_url ? (
                    <img src={a.image_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#2A2A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#6B6B8A' }}>
                      ?
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {a.bio && <span style={{ color: '#22c55e' }}>Bio</span>}
                      {a.image_url && <span style={{ color: '#22c55e' }}>Img</span>}
                      {a.genres?.length > 0 && <span style={{ color: '#22c55e' }}>Genre</span>}
                      {a.vibes?.length > 0 && <span style={{ color: '#22c55e' }}>Vibe</span>}
                      {!a.bio && !a.image_url && (!a.genres || a.genres.length === 0) && <span style={{ color: '#6B6B8A' }}>No data</span>}
                    </div>
                  </div>
                  {mergeMasterId === a.id && (
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Master</span>
                  )}
                </label>
              ))}
            </div>

            {mergeLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#60A5FA', fontWeight: 600 }}>
                Merging profiles...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  disabled={!mergeMasterId}
                  onClick={async () => {
                    if (!mergeMasterId) return;
                    const duplicateIds = mergeConfirm.filter(a => a.id !== mergeMasterId).map(a => a.id);
                    setMergeLoading(true);
                    try {
                      const res = await fetch('/api/admin/artists/merge', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ masterId: mergeMasterId, duplicateIds }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setMergeConfirm(null);
                        setMergeMasterId(null);
                        setSelectedArtists(new Set());
                        fetchArtists(artistsSearch, artistsNeedsInfo);
                        if (editingArtist && duplicateIds.includes(editingArtist.id)) setEditingArtist(null);
                        showQueueToast(`Merged ${duplicateIds.length + 1} profiles into "${data.master}" — ${data.eventsTransferred} event(s) transferred`);
                      } else {
                        showQueueToast(`Merge failed: ${data.error || 'Unknown error'}`);
                      }
                    } catch (err) {
                      console.error('Merge error:', err);
                      showQueueToast('Merge failed — see console');
                    }
                    setMergeLoading(false);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: mergeMasterId ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.05)',
                    color: mergeMasterId ? '#60A5FA' : '#4A4A6A',
                    border: `1px solid ${mergeMasterId ? 'rgba(96,165,250,0.3)' : 'rgba(96,165,250,0.1)'}`,
                    cursor: mergeMasterId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Confirm Merge
                </button>
                <button
                  onClick={() => { setMergeConfirm(null); setMergeMasterId(null); }}
                  style={{
                    padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '440px', width: '90%',
              border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Delete &ldquo;{deleteConfirm.artist.name}&rdquo;?
            </h3>
            {deleteConfirm.eventCount > 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                This artist has <strong style={{ color: '#E8722A' }}>{deleteConfirm.eventCount}</strong> upcoming event{deleteConfirm.eventCount !== 1 ? 's' : ''}. Choose how to handle them:
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
                No upcoming events linked to this artist.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Option A: Delete & Hide Events */}
              <button
                onClick={async () => {
                  const { artist, eventCount } = deleteConfirm;
                  setDeleteConfirm(null);
                  setArtistActionLoading(artist.id);
                  try {
                    await fetch(`/api/admin/artists?id=${artist.id}&action=hide-events`, { method: 'DELETE', headers });
                    fetchArtists(artistsSearch, artistsNeedsInfo);
                    if (editingArtist?.id === artist.id) setEditingArtist(null);
                    showQueueToast(`Deleted "${artist.name}" — ${eventCount} event(s) hidden`);
                  } catch (err) { console.error(err); }
                  setArtistActionLoading(null);
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>Delete Artist &amp; Hide Events</div>
                <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                  Removes the profile and archives linked events from the live app
                </div>
              </button>

              {/* Option B: Delete Artist, Keep Events (Unlink) */}
              {deleteConfirm.eventCount > 0 && (
                <button
                  onClick={async () => {
                    const { artist, eventCount } = deleteConfirm;
                    setDeleteConfirm(null);
                    setArtistActionLoading(artist.id);
                    try {
                      await fetch(`/api/admin/artists?id=${artist.id}&action=unlink-events`, { method: 'DELETE', headers });
                      fetchArtists(artistsSearch, artistsNeedsInfo);
                      if (editingArtist?.id === artist.id) setEditingArtist(null);
                      showQueueToast(`Deleted "${artist.name}" — ${eventCount} event(s) kept as "Other"`);
                    } catch (err) { console.error(err); }
                    setArtistActionLoading(null);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                    border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>Delete Artist, Keep Events</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                    Removes the fake profile but keeps events live as &ldquo;Other / Special Event&rdquo;
                  </div>
                </button>
              )}

              {/* Cancel */}
              <button
                onClick={() => setDeleteConfirm(null)}
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

      {/* Admin Toast — top-center, enlarged */}
      {queueToast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          padding: '14px 24px', borderRadius: '14px',
          background: '#1A1A24', border: '1px solid #3A3A4A',
          color: '#F0F0F5', fontWeight: 700, fontSize: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 500,
          fontFamily: "'DM Sans', sans-serif",
          animation: 'slideDown 0.25s ease-out',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>{typeof queueToast === 'string' ? queueToast : queueToast.msg}</span>
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

function EventFormModal({ event, artists = [], onClose, onSave }) {
  const [form, setForm] = useState({
    event_title: event?.event_title || '',
    artist_name: event?.artist_name || '',
    artist_bio: event?.artist_bio || '',
    venue_name: event?.venue_name || event?.venues?.name || '',
    event_date: event?.event_date ? new Date(event.event_date).toISOString().slice(0, 10) : '',
    event_time: event?.event_date ? new Date(event.event_date).toTimeString().slice(0, 5) : '',
    genre: event?.genre || '',
    vibe: event?.vibe || '',
    cover: event?.cover || '',
    ticket_link: event?.ticket_link || '',
    status: event?.status || 'published',
    source: event?.source || 'Admin',
  });

  // Look up linked artist for genre/vibe inheritance
  const linkedArtist = event?.artist_id
    ? artists.find(a => a.id === event.artist_id)
    : artists.find(a => a.name?.toLowerCase() === form.artist_name?.toLowerCase());
  const inheritedGenres = linkedArtist?.genres || [];
  const inheritedVibes = linkedArtist?.vibes || [];

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
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Event Title</label>
            <input style={inputStyle} placeholder="e.g. Annual Mushfest (optional — overrides artist name as headline)" value={form.event_title} onChange={(e) => update('event_title', e.target.value)} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>If set, this shows as the primary headline. Leave blank to use the artist name.</p>
          </div>
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist / Band Name *</label>
            <input style={inputStyle} placeholder="Links this event to the artist profile" value={form.artist_name} onChange={(e) => update('artist_name', e.target.value)} />
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
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Genre Override</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.genre} onChange={(e) => update('genre', e.target.value)}>
                <option value="">{inheritedGenres.length > 0 ? `Inheriting: ${inheritedGenres.join(', ')}` : 'Select...'}</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Vibe Override</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.vibe} onChange={(e) => update('vibe', e.target.value)}>
                <option value="">{inheritedVibes.length > 0 ? `Inheriting: ${inheritedVibes.join(', ')}` : 'Select...'}</option>
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
