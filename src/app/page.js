'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getVenueColor, groupEventsByDate } from '@/lib/utils';
import { requestNotificationPermission, scheduleReminder, cancelReminder, rehydrateReminders, notificationsGranted } from '@/lib/notifications';

import HeroSection       from '@/components/HeroSection';
import EventCardV2       from '@/components/EventCardV2';
import MapView           from '@/components/MapView';
import SubmitEventModal  from '@/components/SubmitEventModal';
import ReportIssueModal  from '@/components/ReportIssueModal';
import Toast             from '@/components/Toast';
// FilterBar removed — filters now live in the omnibar panel

// ── Helpers ──────────────────────────────────────────────────────────────────
// Clean HTML entities that may have leaked through scrapers (e.g. &amp; → &)
function decodeEntities(str) {
  if (!str || typeof str !== 'string') return str;
  const el = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (el) { el.innerHTML = str; return el.value; }
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

// ── Theme ────────────────────────────────────────────────────────────────────
const DARK = {
  bg:           '#0D0D12',
  surface:      '#1A1A24',
  surfaceAlt:   '#22222E',
  border:       '#2A2A3A',
  borderLight:  '#22222E',
  text:         '#F0F0F5',
  textMuted:    '#7878A0',
  textSubtle:   '#4A4A6A',
  accent:       '#E8722A',
  accentAlt:    '#3AADA0',
  navBg:        '#12121A',
  inputBg:      '#22222E',
  pillBg:       '#1A1A24',
  pillBorder:   '#3A3A50',
  dropdownBg:   '#1E1E2E',
  shimmer:      '#22222E',
};

const LIGHT = {
  bg:           '#F7F5F2',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F9FAFB',
  border:       '#E5E7EB',
  borderLight:  '#F3F4F6',
  text:         '#1F2937',
  textMuted:    '#6B7280',
  textSubtle:   '#9CA3AF',
  accent:       '#E8722A',
  accentAlt:    '#3AADA0',
  navBg:        '#FFFFFF',
  inputBg:      '#F3F4F6',
  pillBg:       '#FFFFFF',
  pillBorder:   '#E5E7EB',
  dropdownBg:   '#FFFFFF',
  shimmer:      '#F3F4F6',
};

// ── Date filter options ───────────────────────────────────────────────────────
const DATE_OPTIONS = [
  { key: 'all',      label: 'All Upcoming' },
  { key: 'today',    label: 'Today'        },
  { key: 'tomorrow', label: 'Tomorrow'     },
  { key: 'weekend',  label: 'This Weekend' },
];


export default function HomePage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);

  // ── Theme ────────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('mlj_dark_mode');
    return stored === null ? true : stored === 'true'; // dark by default
  });

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('mlj_dark_mode', String(next));
      return next;
    });
  }, []);

  const t = darkMode ? DARK : LIGHT;

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('home');
  const [mapOpen,        setMapOpen]        = useState(false);
  const [dateKey,        setDateKey]        = useState('all');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [activeVenues,   setActiveVenues]   = useState([]);    // multi-select venue filter
  const [milesRadius,    setMilesRadius]    = useState(null);  // null = any distance
  const [showSubmit,     setShowSubmit]     = useState(false);
  const [reportEvent,    setReportEvent]    = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activeFilterCard, setActiveFilterCard] = useState(null); // 'distance' | 'when' | 'artist' | 'venue'
  const [venueSearch, setVenueSearch] = useState('');
  const [locationOrigin, setLocationOrigin] = useState('');       // zip or city text
  const [locationLabel, setLocationLabel] = useState('Current Location');  // display label
  const [locationCoords, setLocationCoords] = useState(null);     // { lat, lng } from geolocation or geocode
  const [geolocating, setGeolocating] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');            // artist filter text

  // ── Geolocation: auto-detect user's location on mount ─────────────────────
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setGeolocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          // Reverse geocode to get town name
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=10`)
            .then(r => r.json())
            .then(data => {
              const town = data.address?.town || data.address?.city || data.address?.village || data.address?.hamlet || 'Current Location';
              setLocationLabel(town);
              setGeolocating(false);
            })
            .catch(() => { setLocationLabel('Current Location'); setGeolocating(false); });
        },
        () => {
          // Permission denied or error — stay at default
          setLocationLabel('Current Location');
          setGeolocating(false);
        },
        { timeout: 8000, maximumAge: 300000 }
      );
    }
  }, []);

  // Geocode a zip/city string to coordinates
  const geocodeLocation = useCallback(async (query) => {
    if (!query.trim()) {
      // Reset to device location
      setLocationLabel('Current Location');
      setLocationOrigin('');
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setLocationCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {}
        );
      }
      return;
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', NJ')}&format=json&limit=1`);
      const results = await res.json();
      if (results.length > 0) {
        setLocationCoords({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
        const name = results[0].display_name.split(',')[0];
        setLocationLabel(name);
      }
    } catch {}
  }, []);

  // ── Bottom nav hide-on-scroll ───────────────────────────────────────────────
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const threshold = 10; // minimum scroll delta to trigger
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY - lastScrollY.current > threshold) {
        // Scrolling down → hide
        setNavHidden(true);
      } else if (lastScrollY.current - currentY > threshold) {
        // Scrolling up → show
        setNavHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Notifications preference ─────────────────────────────────────────────────
  const [notifEnabled, setNotifEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('mlj_notif_enabled') === 'true';
  });

  const toggleNotifications = useCallback(async () => {
    if (!notifEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        localStorage.setItem('mlj_notif_enabled', 'true');
        setNotifEnabled(true);
        setToast('🔔 Notifications on — you\'ll be reminded 1 hour before saved events.');
      } else {
        setToast('Notifications blocked. Please enable them in your browser settings.');
      }
    } else {
      localStorage.setItem('mlj_notif_enabled', 'false');
      setNotifEnabled(false);
      setToast('🔕 Notifications turned off.');
    }
  }, [notifEnabled]);

  // ── Favorites (persisted to localStorage) ───────────────────────────────────
  const [favorites, setFavorites] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('mlj_favorites');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  const toggleFavorite = useCallback((id) => {
    if (!id) return;
    setFavorites(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) { next.add(id); } else { next.delete(id); }
      try { localStorage.setItem('mlj_favorites', JSON.stringify([...next])); } catch {}
      if (adding) {
        const event = events.find(e => e.id === id);
        if (event && notifEnabled) scheduleReminder(event);
      } else {
        cancelReminder(id);
      }
      return next;
    });
  }, [events]);

  // ── Fetch from Supabase ──────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayLocal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

      // Supabase PostgREST caps at 1000 rows per request — paginate to get all
      let allData = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from('events')
          .select('*, venues(name, address, color, photo_url)')
          .gte('event_date', todayLocal)
          .eq('status', 'published')
          .order('event_date', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(page || []);
        if (!page || page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      const data = allData;

      const mapped = (data || []).map(e => {
        let extractedStartTime = e.start_time || (() => {
          if (e.event_date && e.event_date.includes('T')) {
            const d = new Date(e.event_date);
            // Use Eastern time, not UTC, so times display correctly
            const parts = d.toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: false,
              timeZone: 'America/New_York',
            }).split(':');
            const h = String(parseInt(parts[0])).padStart(2, '0');
            const m = parts[1];
            return `${h}:${m}`;
          }
          return null;
        })();

        // If time is midnight (00:00), try to extract from the event title
        // e.g. "Every Tuesday 8pm - Close" → "20:00"
        if (extractedStartTime === '00:00' || extractedStartTime === '24:00') {
          const title = e.artist_name || e.name || '';
          const tm = title.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (tm) {
            let hr = parseInt(tm[1]);
            const mn = tm[2] ? parseInt(tm[2]) : 0;
            const per = tm[3].toLowerCase();
            if (per === 'pm' && hr !== 12) hr += 12;
            if (per === 'am' && hr === 12) hr = 0;
            extractedStartTime = `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;
          }
        }

        return {
          ...e,
          name:       decodeEntities(e.artist_name  || e.name  || ''),
          venue:      e.venues?.name || e.venue_name || e.venue || '',
          date: (() => {
            const raw = e.event_date || '';
            if (!raw) return '';
            if (raw.includes('T')) {
              // Use Eastern time so dates don't shift when UTC crosses midnight
              const d = new Date(raw);
              return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            }
            return raw.substring(0, 10);
          })(),
          start_time:    extractedStartTime,
          description:   e.artist_bio || e.description || '',
          venue_name:    e.venues?.name    || e.venue_name    || '',
          venue_address: e.venues?.address || '',
          venue_color:   e.venues?.color   || getVenueColor(e.venues?.name || e.venue_name),
          venue_photo:   e.venues?.photo_url || null,
        };
      });

      setEvents(mapped);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { rehydrateReminders(); }, []);
  useEffect(() => { setDateKey('all'); }, [activeTab]);

  // ── Date boundaries (local time) ─────────────────────────────────────────────
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const todayStr    = localDateStr(new Date());
  const tomorrowStr = localDateStr(new Date(new Date().setDate(new Date().getDate() + 1)));
  const fridayStr   = (() => {
    const d = new Date(); const day = d.getDay();
    if (day === 5) return localDateStr(d);
    if (day === 6) { d.setDate(d.getDate() - 1); return localDateStr(d); }
    if (day === 0) { d.setDate(d.getDate() - 2); return localDateStr(d); }
    d.setDate(d.getDate() + (5 - day)); return localDateStr(d);
  })();
  const sundayStr = (() => {
    const d = new Date(fridayStr + 'T00:00:00'); d.setDate(d.getDate() + 2);
    return localDateStr(d);
  })();

  // ── Filtered events ──────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let list = [...events];

    switch (dateKey) {
      case 'today':   list = list.filter(e => e.date === todayStr); break;
      case 'tomorrow':list = list.filter(e => e.date === tomorrowStr); break;
      case 'weekend': {
        const weekendStart = todayStr > fridayStr ? todayStr : fridayStr;
        list = list.filter(e => e.date >= weekendStart && e.date <= sundayStr);
        break;
      }
      default:
        list = list.filter(e => e.date >= todayStr);
        break;
    }

    if (activeVenues.length > 0) list = list.filter(e => activeVenues.includes(e.venue));

    // Artist filter
    if (artistSearch.trim()) {
      const aq = normalizeVenue(artistSearch);
      list = list.filter(e => normalizeVenue(e.name).includes(aq));
    }

    if (searchQuery.trim()) {
      const q = normalizeVenue(searchQuery);
      list = list.filter(e =>
        normalizeVenue(e.name).includes(q) ||
        normalizeVenue(e.venue).includes(q) ||
        normalizeVenue(e.genre ?? '').includes(q)
      );
    }

    list.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });

    return list;
  }, [events, dateKey, activeVenues, artistSearch, searchQuery, todayStr, tomorrowStr, fridayStr, sundayStr]);

  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  const heroEvents = useMemo(() => {
    const todayEvents = events
      .filter(e => e.date === todayStr)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    if (todayEvents.length > 0) return todayEvents;
    return events
      .filter(e => e.date > todayStr)
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
      })
      .slice(0, 6);
  }, [events, todayStr]);

  const heroIsToday = heroEvents.length > 0 && heroEvents[0]?.date === todayStr;

  // Venue list with event counts (for FilterBar)
  const venueListWithCounts = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (e.venue) map[e.venue] = (map[e.venue] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  function normalizeVenue(s) {
    return (s ?? '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const hasActiveFilters = dateKey !== 'all' || activeVenues.length > 0 || milesRadius !== null || artistSearch.trim() !== '';
  const activeFilterCount = [dateKey !== 'all', activeVenues.length > 0, milesRadius !== null, artistSearch.trim() !== ''].filter(Boolean).length;
  const clearAllFilters = useCallback(() => {
    setDateKey('all');
    setActiveVenues([]);
    setMilesRadius(null);
    setArtistSearch('');
    setFiltersExpanded(false);
    setActiveFilterCard(null);
  }, []);

  // Filter panel labels
  const whenLabel = DATE_OPTIONS.find(o => o.key === dateKey)?.label || 'All Upcoming';
  const venueLabel = activeVenues.length === 0 ? 'Any Venue' : activeVenues.length === 1 ? activeVenues[0] : `${activeVenues.length} venues`;
  const distanceLabel = milesRadius === null ? 'Any distance' : `${milesRadius} mi`;
  const artistLabel = artistSearch.trim() ? artistSearch.trim() : 'Any Artist';
  const locationDisplayLabel = geolocating ? 'Locating...' : locationLabel;

  // Filtered venues for search inside panel
  const filteredPanelVenues = useMemo(() => {
    if (!venueSearch.trim()) return venueListWithCounts;
    const q = venueSearch.toLowerCase();
    return venueListWithCounts.filter(v => v.name.toLowerCase().includes(q));
  }, [venueListWithCounts, venueSearch]);

  // ── Shared styles ────────────────────────────────────────────────────────────
  const dateSeparatorStyle = {
    fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '1px', color: t.textMuted,
  };

  return (
    <>
      <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: t.bg, maxWidth: '480px', margin: '0 auto', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>

        {/* ── Top Nav ────────────────────────────────────────────────────── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: darkMode ? '#1E1E2C' : '#FFFFFF',
          borderBottom: `1px solid ${t.border}`,
          boxShadow: darkMode ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.08)',
          padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px 16px',
          display: 'flex', alignItems: 'center', gap: '10px',
          minHeight: '60px',
          width: '100%', maxWidth: '100%', boxSizing: 'border-box',
        }}>
          {/* Logo — left */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: darkMode ? '#FFFFFF' : '#1F2937' }}>my</span>
              <span style={{ color: '#E8722A' }}>Local</span>
              <span style={{ color: '#3AADA0' }}>Jam</span>
            </span>
          </div>

          {/* Spacer */}
          <div style={{ width: '6px', flexShrink: 0 }} />

          {/* Omnibar pill — Glow & Badge */}
          <button onClick={() => setFiltersExpanded(e => !e)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
            padding: '7px 10px',
            background: darkMode ? '#14141E' : '#F3F4F6',
            border: `1px solid ${
              filtersExpanded ? t.accentAlt
              : hasActiveFilters ? t.accentAlt
              : (darkMode ? '#2A2A3A' : '#E5E7EB')
            }`,
            borderRadius: '20px', cursor: 'pointer', position: 'relative',
            boxShadow: filtersExpanded
              ? `0 0 0 1px ${t.accentAlt}40, 0 0 8px ${t.accentAlt}25`
              : hasActiveFilters
                ? `0 0 6px ${t.accentAlt}30, 0 0 12px ${t.accentAlt}15`
                : 'none',
            transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            {/* Search icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={hasActiveFilters ? t.accentAlt : t.textMuted} />
            </svg>
            <span style={{
              fontSize: '12px', fontWeight: 500,
              color: filtersExpanded ? t.accentAlt : t.textMuted,
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
              transition: 'color 0.2s ease',
            }}>
              Search / Filters
            </span>
            {/* Active filter pills inline */}
            {hasActiveFilters && !filtersExpanded && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <span style={{ color: t.textMuted, fontSize: '8px', opacity: 0.5, flexShrink: 0 }}>|</span>
                {dateKey !== 'all' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: t.accentAlt, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill={t.accentAlt} /></svg>
                    {{ today: 'Today', tomorrow: 'Tmrw', weekend: 'Wknd' }[dateKey] || dateKey}
                  </span>
                )}
                {milesRadius !== null && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: t.accentAlt, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={t.accentAlt} /></svg>
                    {milesRadius}mi
                  </span>
                )}
                {artistSearch.trim() && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: t.accentAlt, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill={t.accentAlt} /></svg>
                    {artistSearch.trim()}
                  </span>
                )}
                {activeVenues.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 600, color: t.accentAlt, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill={t.accentAlt} /></svg>
                    {activeVenues.length}
                  </span>
                )}
              </div>
            )}
            {(!hasActiveFilters || filtersExpanded) && <div style={{ flex: 1 }} />}
            {/* Right: close, badge, or tune icon */}
            {filtersExpanded ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.accentAlt} />
              </svg>
            ) : hasActiveFilters ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                fontSize: '9px', fontWeight: 700, color: darkMode ? '#1E1E2A' : '#FFFFFF',
                background: t.accentAlt, borderRadius: '8px',
                padding: '1px 5px', flexShrink: 0, lineHeight: '14px',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={darkMode ? '#1E1E2A' : '#FFFFFF'} /></svg>
                {activeFilterCount}
              </span>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={t.textMuted} />
              </svg>
            )}
          </button>

          {/* Add to the Jar FAB */}
          <button
            onClick={() => setShowSubmit(true)}
            title="Add to the Jar"
            style={{
              width: '30px', height: '30px', borderRadius: '50%', border: 'none',
              background: t.accent,
              cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="white" /></svg>
          </button>
        </header>

        {/* ── Filter Panel (expands from header) ─────────────────────── */}
        <div style={{
          maxHeight: filtersExpanded ? '500px' : '0px',
          opacity: filtersExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: filtersExpanded
            ? 'max-height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease'
            : 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
          background: darkMode ? '#1A1A28' : '#F2F0ED',
          borderBottom: filtersExpanded ? `1px solid ${t.border}` : 'none',
          position: 'relative', zIndex: 99,
        }}>
          {activeTab === 'home' && (
            <div style={{ padding: '6px 12px 8px' }}>
              <div style={{
                borderRadius: '12px', overflow: 'hidden',
                boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)',
                background: darkMode ? '#20202E' : '#F5F3F0',
              }}>
                {/* Search input */}
                <div style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                  borderRadius: '12px 12px 0 0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={t.textMuted} /></svg>
                    <input
                      type="text"
                      placeholder="Search artists, venues, events..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        flex: 1, border: 'none', background: 'none', outline: 'none',
                        fontSize: '12px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                      }}
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.textMuted} /></svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* 1. DISTANCE / LOCATION card (broadest) */}
                <div style={{
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'distance' ? null : 'distance')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={t.accentAlt} /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: t.accentAlt, lineHeight: 1, marginBottom: '2px' }}>Distance / Location</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>
                        {milesRadius !== null ? `Within ${milesRadius} miles` : 'Any distance'}
                      </div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'distance' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={t.accentAlt} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'distance' && (
                    <div style={{ padding: '0 12px 6px' }}>
                      {/* Location input */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 8px', borderRadius: '8px', marginBottom: '4px',
                        border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`,
                        background: t.inputBg,
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" fill={t.accentAlt} /></svg>
                        <input
                          type="text"
                          placeholder={locationDisplayLabel}
                          value={locationOrigin}
                          onChange={e => setLocationOrigin(e.target.value)}
                          onBlur={e => { if (e.target.value.trim()) geocodeLocation(e.target.value.trim()); }}
                          onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { geocodeLocation(e.target.value.trim()); e.target.blur(); } }}
                          style={{
                            flex: 1, border: 'none', background: 'none', outline: 'none',
                            fontSize: '11px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                          }}
                        />
                        {locationOrigin && (
                          <button onClick={() => { setLocationOrigin(''); geocodeLocation(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.textMuted} /></svg>
                          </button>
                        )}
                      </div>
                      {/* Slider with bookend labels */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '8px', fontWeight: 600, color: t.textSubtle, minWidth: '20px', textAlign: 'left', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>5 mi</span>
                        <input type="range" min="0" max="50" value={milesRadius ?? 0}
                          onChange={e => { const v = parseInt(e.target.value); setMilesRadius(v === 0 ? null : v < 5 ? 5 : v); }}
                          style={{
                            flex: 1, height: '4px', appearance: 'none', WebkitAppearance: 'none',
                            background: `linear-gradient(to right, ${t.accentAlt} ${((milesRadius ?? 0) / 50) * 100}%, ${darkMode ? '#2A2A3A' : '#DDD'} 0%)`,
                            borderRadius: '2px', outline: 'none', cursor: 'pointer', accentColor: t.accentAlt,
                          }}
                        />
                        <span style={{ fontSize: '8px', fontWeight: 600, color: t.textSubtle, minWidth: '24px', textAlign: 'right', fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>50 mi</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. WHEN card */}
                <div style={{
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'when' ? null : 'when')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill={t.accent} /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: t.accent, lineHeight: 1, marginBottom: '2px' }}>When</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{whenLabel}</div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'when' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={t.accent} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'when' && (
                    <div style={{ padding: '0 12px 8px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {DATE_OPTIONS.map(opt => (
                          <button key={opt.key} onClick={() => { setDateKey(opt.key); setActiveFilterCard(null); }} style={{
                            padding: '5px 10px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                            background: dateKey === opt.key ? t.accent : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                            color: dateKey === opt.key ? '#fff' : t.text,
                            fontSize: '10px', fontWeight: dateKey === opt.key ? 700 : 500,
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. ARTIST card */}
                <div style={{
                  borderBottom: `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}`,
                  background: darkMode ? '#262636' : '#FFFFFF',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'artist' ? null : 'artist')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill={t.accent} /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: t.accent, lineHeight: 1, marginBottom: '2px' }}>Artist</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{artistLabel}</div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'artist' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke={t.accent} strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'artist' && (
                    <div style={{ padding: '0 12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 8px', borderRadius: '8px',
                          border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`,
                          background: t.inputBg,
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={t.textMuted} /></svg>
                          <input
                            type="text"
                            placeholder="Type an artist or band name..."
                            value={artistSearch}
                            onChange={e => setArtistSearch(e.target.value)}
                            autoFocus
                            style={{
                              flex: 1, border: 'none', background: 'none', outline: 'none',
                              fontSize: '11px', color: t.text, fontFamily: "'DM Sans', sans-serif",
                            }}
                          />
                          {artistSearch && (
                            <button onClick={() => setArtistSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                              <svg width="10" height="10" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.textMuted} /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {artistSearch.trim() && (
                        <div style={{ fontSize: '9px', color: t.textMuted, marginTop: '4px', fontStyle: 'italic' }}>
                          Showing events matching &ldquo;{artistSearch.trim()}&rdquo;
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. VENUE card (most specific) */}
                <div style={{
                  background: darkMode ? '#262636' : '#FFFFFF',
                }}>
                  <button onClick={() => setActiveFilterCard(activeFilterCard === 'venue' ? null : 'venue')} style={{
                    display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
                    background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill="#a78bfa" /></svg>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#a78bfa', lineHeight: 1, marginBottom: '2px' }}>Venue</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{venueLabel}</div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: activeFilterCard === 'venue' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}><path d="M2 3.5L5 6.5L8 3.5" stroke="#a78bfa" strokeWidth="1.5" fill="none" /></svg>
                  </button>
                  {activeFilterCard === 'venue' && (
                    <div style={{ padding: '0 12px 8px' }}>
                      <input type="text" placeholder="Search venues..." value={venueSearch} onChange={e => setVenueSearch(e.target.value)} autoFocus
                        style={{
                          width: '100%', padding: '5px 8px', borderRadius: '6px',
                          border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`, background: t.inputBg,
                          color: t.text, fontSize: '11px', outline: 'none', marginBottom: '4px',
                          fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {activeVenues.length > 0 && (
                          <button onClick={() => setActiveVenues([])} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', marginBottom: '2px',
                            fontSize: '10px', color: '#a78bfa', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                          }}>
                            <svg width="8" height="8" viewBox="0 0 24 24" style={{ verticalAlign: 'middle', marginRight: '2px' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="#a78bfa" /></svg>
                            Clear
                          </button>
                        )}
                        {filteredPanelVenues.map(v => {
                          const checked = activeVenues.includes(v.name);
                          return (
                            <button key={v.name} onClick={() => setActiveVenues(prev => checked ? prev.filter(n => n !== v.name) : [...prev, v.name])} style={{
                              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                              padding: '5px 4px', background: checked ? 'rgba(167,139,250,0.08)' : 'transparent',
                              border: 'none', cursor: 'pointer', borderRadius: '4px',
                              fontFamily: "'DM Sans', sans-serif",
                            }}>
                              <div style={{
                                width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                                border: checked ? 'none' : '1.5px solid #4A4A6A',
                                background: checked ? '#a78bfa' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {checked && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: checked ? 600 : 400, color: checked ? '#a78bfa' : t.text, flex: 1, textAlign: 'left' }}>{v.name}</span>
                              <span style={{ fontSize: '9px', color: t.textMuted }}>{v.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: darkMode ? '#262636' : '#FFFFFF',
                  borderTop: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
                  borderRadius: '0 0 12px 12px',
                }}>
                  <button onClick={clearAllFilters} style={{
                    background: 'transparent',
                    border: `1px solid ${t.accentAlt}`,
                    borderRadius: '8px',
                    padding: '7px 16px',
                    cursor: 'pointer',
                    fontSize: '11px', fontWeight: 700, color: t.accentAlt,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Clear all
                  </button>
                  <button onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
                    padding: '7px 18px', borderRadius: '8px', border: 'none',
                    background: t.accent, color: 'white', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Show {filteredEvents.length} events
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scrim overlay when filter panel is open */}
        {filtersExpanded && (
          <div onClick={() => { setFiltersExpanded(false); setActiveFilterCard(null); }} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 98,
            background: 'rgba(0,0,0,0.3)',
          }} />
        )}

        {/* ── Hero (home tab only) ──────────────────────────────────────── */}
        {activeTab === 'home' && (
          <HeroSection events={heroEvents} isToday={heroIsToday} />
        )}


        {/* FilterBar removed — filters now live in the omnibar panel */}


        {/* ── Saved view ───────────────────────────────────────────────── */}
        {activeTab === 'saved' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            <div style={{ display: 'flex', gap: '6px', padding: '8px 16px 10px', overflowX: 'auto', background: t.surface, borderBottom: `1px solid ${t.border}`, scrollbarWidth: 'none' }}>
              {DATE_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setDateKey(opt.key)} style={{
                  padding: '5px 14px', borderRadius: '999px', border: `1.5px solid`, cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: '12px', fontWeight: 700,
                  background: dateKey === opt.key ? t.accent : t.pillBg,
                  color: dateKey === opt.key ? 'white' : t.textMuted,
                  borderColor: dateKey === opt.key ? t.accent : t.pillBorder,
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {(() => {
              let savedEvents = events.filter(e => favorites.has(e.id));

              if (searchQuery.trim()) {
                const q = normalizeVenue(searchQuery);
                savedEvents = savedEvents.filter(e =>
                  normalizeVenue(e.name).includes(q) ||
                  normalizeVenue(e.venue).includes(q) ||
                  normalizeVenue(e.genre ?? '').includes(q)
                );
              }

              switch (dateKey) {
                case 'today':   savedEvents = savedEvents.filter(e => e.date === todayStr); break;
                case 'tomorrow':savedEvents = savedEvents.filter(e => e.date === tomorrowStr); break;
                case 'weekend': {
                  const weekendStart = todayStr > fridayStr ? todayStr : fridayStr;
                  savedEvents = savedEvents.filter(e => e.date >= weekendStart && e.date <= sundayStr);
                  break;
                }
                default: break;
              }

              savedEvents = savedEvents.sort((a, b) => {
                const dc = a.date.localeCompare(b.date);
                return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
              });

              if (savedEvents.length === 0) {
                const hasAnySaved = events.some(e => favorites.has(e.id));
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
                    <span style={{ fontSize: '48px', marginBottom: '12px' }}>♡</span>
                    <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '4px' }}>
                      {!hasAnySaved ? 'No saved events yet' : searchQuery ? 'No results found' : `No saved events for ${DATE_OPTIONS.find(o => o.key === dateKey)?.label ?? 'this period'}`}
                    </p>
                    <p style={{ fontSize: '14px', color: t.textMuted }}>
                      {!hasAnySaved ? 'Tap the ♡ on any event to save it here' : searchQuery ? 'Try a different search term' : 'Try a different date filter'}
                    </p>
                  </div>
                );
              }
              const savedGroups = groupEventsByDate(savedEvents);
              return (
                <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '1px', padding: '14px 0 2px' }}>
                    {savedEvents.length} saved event{savedEvents.length !== 1 ? 's' : ''}
                  </p>
                  {savedGroups.map(group => (
                    <div key={group.date}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 6px' }}>
                        <span style={dateSeparatorStyle}>{group.label}</span>
                        <div style={{ flex: 1, height: '1px', background: t.border }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {group.events.map((event, i) => (
                          <EventCardV2 key={event.id ?? i} event={event} onReport={setReportEvent} isFavorited={true} onToggleFavorite={toggleFavorite} darkMode={darkMode} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Profile view ─────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #E8722A, #3AADA0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                👤
              </div>
              <p style={{ fontWeight: 800, fontSize: '18px', color: t.text, marginTop: '8px' }}>Your Profile</p>
              <p style={{ fontSize: '13px', color: t.textMuted }}>Sign in to save events across devices</p>
              <button style={{ marginTop: '12px', padding: '10px 32px', borderRadius: '999px', border: 'none', background: t.accent, color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
            <div style={{ margin: '0 16px', borderRadius: '12px', background: t.surface, overflow: 'hidden', boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.4)' : '0 1px 6px rgba(0,0,0,0.07)', border: `1px solid ${t.border}` }}>
              {[
                { icon: '🔔', label: 'Notifications',             toggle: 'notif'  },
                { icon: '🌙', label: 'Dark Mode', toggle: 'theme'  },
                { icon: '📍', label: 'Default Location',          soon: true       },
                { icon: '🎟', label: 'Add to the Jar',             action: () => setShowSubmit(true) },
              ].map((item, i, arr) => (
                <button
                  key={item.label}
                  onClick={
                    item.toggle === 'notif' ? toggleNotifications
                    : item.toggle === 'theme' ? toggleDarkMode
                    : (item.action ?? null)
                  }
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '14px 16px', border: 'none', cursor: item.soon ? 'default' : 'pointer',
                    background: t.surface, borderBottom: i < arr.length - 1 ? `1px solid ${t.borderLight}` : 'none',
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: t.text, fontWeight: 500 }}>
                    <span>{item.icon}</span>{item.label}
                  </span>
                  {item.soon
                    ? <span style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, background: t.inputBg, padding: '2px 8px', borderRadius: '999px' }}>SOON</span>
                    : item.toggle === 'notif'
                    ? <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: notifEnabled ? t.accent : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '3px', left: notifEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                      </div>
                    : item.toggle === 'theme'
                    ? <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: darkMode ? t.accent : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '3px', left: darkMode ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                      </div>
                    : <span style={{ color: t.textMuted, fontSize: '12px' }}>›</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Event list (home tab) ─────────────────────────────────────── */}
        {activeTab === 'home' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px', background: t.bg }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: t.textMuted, fontSize: '15px' }}>
                Loading events…
              </div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
                <span style={{ fontSize: '48px', marginBottom: '12px' }}>🎵</span>
                <p style={{ fontWeight: 700, fontSize: '16px', color: t.text, marginBottom: '4px' }}>No events found</p>
                <p style={{ fontSize: '14px', color: t.textMuted }}>Try a different date, category, or venue</p>
              </div>
            ) : (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {groupedEvents.map(group => (
                  <div key={group.date}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0 6px' }}>
                      <span style={dateSeparatorStyle}>{group.label}</span>
                      <div style={{ flex: 1, height: '1px', background: t.border }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {group.events.map((event, i) => (
                        <EventCardV2
                          key={event.id ?? `${group.date}-${i}`}
                          event={event}
                          onReport={setReportEvent}
                          isFavorited={favorites.has(event.id)}
                          onToggleFavorite={toggleFavorite}
                          darkMode={darkMode}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: navHidden ? 'translate(-50%, 100%)' : 'translateX(-50%)',
        transition: 'transform 0.3s ease',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: t.navBg, borderTop: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
        boxShadow: darkMode ? '0 -2px 20px rgba(0,0,0,0.5)' : '0 -2px 12px rgba(0,0,0,0.06)',
      }}>
        {[
          { key: 'home',    icon: '🏠', label: 'Home'    },
          { key: 'saved',   icon: '♥',  label: 'Saved'   },
          { key: 'profile', icon: '👤', label: 'Profile' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
            color: activeTab === tab.key ? t.accent : t.textMuted,
            transition: 'color 0.15s',
          }}>
            <span style={{ fontSize: tab.key === 'saved' ? '22px' : '20px', lineHeight: 1, textShadow: tab.key === 'saved' ? '0 0 6px rgba(232,114,42,0.3)' : 'none' }}>{tab.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: activeTab === tab.key ? 700 : 500 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Map modal ───────────────────────────────────────────────────── */}
      {mapOpen && (
        <MapView events={filteredEvents} onClose={() => setMapOpen(false)} darkMode={darkMode} />
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSubmit && (
        <SubmitEventModal onClose={() => setShowSubmit(false)} onSubmit={() => setToast('Added to the Jar! We\'ll review it shortly.')} />
      )}
      {reportEvent && (
        <ReportIssueModal event={reportEvent} onClose={() => setReportEvent(null)} onSubmit={() => { setToast('Report submitted. Thank you!'); setReportEvent(null); }} />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
