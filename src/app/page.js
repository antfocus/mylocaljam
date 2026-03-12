'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getVenueColor, groupEventsByDate } from '@/lib/utils';
import { requestNotificationPermission, scheduleReminder, cancelReminder, rehydrateReminders, notificationsGranted } from '@/lib/notifications';

import HeroSection       from '@/components/HeroSection';
import EventCardV2       from '@/components/EventCardV2';
import MapView           from '@/components/MapView';
import SubmitEventModal  from '@/components/SubmitEventModal';
import ReportIssueModal  from '@/components/ReportIssueModal';
import Toast             from '@/components/Toast';
import FilterBar         from '@/components/FilterBar';

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
  }, [events, dateKey, activeVenues, searchQuery, todayStr, tomorrowStr, fridayStr, sundayStr]);

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

  const hasActiveFilters = dateKey !== 'all' || activeVenues.length > 0 || milesRadius !== null;
  const clearAllFilters = useCallback(() => {
    setDateKey('all');
    setActiveVenues([]);
    setMilesRadius(null);
  }, []);

  // ── Shared styles ────────────────────────────────────────────────────────────
  const dateSeparatorStyle = {
    fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '1px', color: t.textMuted,
  };

  return (
    <>
      <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: t.bg, maxWidth: '480px', margin: '0 auto' }}>

        {/* ── Top Nav ────────────────────────────────────────────────────── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: darkMode ? '#1E1E2C' : '#FFFFFF',
          borderBottom: `1px solid ${t.border}`,
          boxShadow: darkMode ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.08)',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: '10px',
          position: 'sticky', top: 0,
          minHeight: '60px',
        }}>
          {/* Logo — left */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Image
              src="/myLocaljam_Logo_v7_transparent_031126.png"
              alt="myLocalJam"
              width={160}
              height={52}
              priority
              style={{
                objectFit: 'contain', display: 'block',
                filter: darkMode
                  ? 'drop-shadow(0 1px 4px rgba(255,255,255,0.25))'
                  : 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
              }}
            />
          </div>

          {/* Search bar — center */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '6px',
            background: darkMode ? '#14141E' : '#F3F4F6',
            border: `1px solid ${darkMode ? '#2A2A3A' : '#E5E7EB'}`,
            borderRadius: '20px', padding: '6px 12px',
          }}>
            <span style={{ fontSize: '12px', color: t.textMuted, flexShrink: 0 }}>🔍</span>
            <input
              type="text"
              placeholder="Search artists, venues, events..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: t.text, minWidth: 0 }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: '14px', flexShrink: 0, padding: 0 }}>✕</button>
            )}
          </div>

          {/* Add to the Jar button */}
          <button
            onClick={() => setShowSubmit(true)}
            title="Add to the Jar"
            style={{
              width: '34px', height: '34px', borderRadius: '50%', border: `2px solid ${t.accent}`,
              background: t.accent,
              cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', fontWeight: 700, color: 'white', lineHeight: 1,
            }}>
            +
          </button>
        </header>

        {/* ── Hero (home tab only) ──────────────────────────────────────── */}
        {activeTab === 'home' && (
          <HeroSection events={heroEvents} isToday={heroIsToday} />
        )}


        {/* ── Filter bar (home tab only) ─────────────────────────────── */}
        {activeTab === 'home' && (
          <div style={{ padding: '10px 12px 0' }}>
            <FilterBar
              dateKey={dateKey}
              setDateKey={setDateKey}
              activeVenues={activeVenues}
              setActiveVenues={setActiveVenues}
              venues={venueListWithCounts}
              milesRadius={milesRadius}
              setMilesRadius={setMilesRadius}
              eventCount={filteredEvents.length}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearAllFilters}
              darkMode={darkMode}
            />
          </div>
        )}


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
