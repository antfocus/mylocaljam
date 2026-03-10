'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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

const CATEGORIES = [
  { key: 'All',           label: 'All',           emoji: '' },
  { key: 'Music',         label: 'Music',         emoji: '🎵' },
  { key: 'Happy Hours',   label: 'Happy Hours',   emoji: '🍹' },
  { key: 'Daily Specials',label: 'Daily Specials',emoji: '⭐' },
  { key: 'Community',     label: 'Community',     emoji: '🤝' },
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
  const [dateKey,        setDateKey]        = useState('all');
  const [dateDropOpen,   setDateDropOpen]   = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [activeVenue,    setActiveVenue]    = useState('all');
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  const [venueSearch,    setVenueSearch]    = useState('');
  const [showSubmit,     setShowSubmit]     = useState(false);
  const [reportEvent,    setReportEvent]    = useState(null);

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

      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, address, color)')
        .gte('event_date', todayLocal)
        .eq('status', 'published')
        .order('event_date', { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map(e => {
        const extractedStartTime = e.start_time || (() => {
          if (e.event_date && e.event_date.includes('T')) {
            const d = new Date(e.event_date);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
          }
          return null;
        })();

        return {
          ...e,
          name:       e.artist_name  || e.name  || '',
          venue:      e.venues?.name || e.venue_name || e.venue || '',
          date: (() => {
            const raw = e.event_date || '';
            if (!raw) return '';
            if (raw.includes('T')) {
              const d = new Date(raw);
              const p = n => String(n).padStart(2, '0');
              return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
            }
            return raw.substring(0, 10);
          })(),
          start_time:    extractedStartTime,
          description:   e.artist_bio || e.description || '',
          venue_name:    e.venues?.name    || e.venue_name    || '',
          venue_address: e.venues?.address || '',
          venue_color:   e.venues?.color   || getVenueColor(e.venues?.name || e.venue_name),
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

    if (activeVenue !== 'all') list = list.filter(e => e.venue === activeVenue);

    if (activeCategory !== 'All') {
      list = list.filter(e => {
        const g = ((e.genre ?? e.vibe) ?? '').toLowerCase();
        if (activeCategory === 'Music') {
          return !g.includes('happy') && !g.includes('special') && !g.includes('communit');
        }
        return g.includes(activeCategory.toLowerCase().replace(/s$/, ''));
      });
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
  }, [events, dateKey, activeVenue, activeCategory, searchQuery, todayStr, tomorrowStr, fridayStr, sundayStr]);

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

  const allVenues = useMemo(() => {
    const set = new Set(events.map(e => e.venue).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  function normalizeVenue(s) {
    return (s ?? '').toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const filteredVenues = useMemo(() => {
    const q = normalizeVenue(venueSearch);
    if (!q) return allVenues;
    return allVenues.filter(v => normalizeVenue(v).includes(q));
  }, [allVenues, venueSearch]);

  const activeDateLabel  = DATE_OPTIONS.find(o => o.key === dateKey)?.label ?? 'All Upcoming';
  const activeVenueLabel = activeVenue === 'all' ? null : activeVenue;

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
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {/* Logo */}
          <div style={{ flexShrink: 0 }}>
            <Image
              src="/myLocaljam_Logo.png"
              alt="myLocalJam"
              width={52}
              height={52}
              style={{ objectFit: 'contain', display: 'block' }}
            />
          </div>

          {/* Search bar — center, flex fills remaining space */}
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

          {/* Profile avatar */}
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              width: '34px', height: '34px', borderRadius: '50%', border: `2px solid ${darkMode ? '#3A3A50' : '#E5E7EB'}`,
              background: 'linear-gradient(135deg, #E8722A, #3AADA0)',
              cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}>
            👤
          </button>
        </header>

        {/* ── Hero (home tab only) ──────────────────────────────────────── */}
        {activeTab === 'home' && (
          <HeroSection events={heroEvents} isToday={heroIsToday} />
        )}


        {/* ── Category pills (home tab only) ────────────────────────────── */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', gap: '6px', padding: '8px 16px 10px', overflowX: 'auto', background: t.surface, borderBottom: `1px solid ${t.border}`, scrollbarWidth: 'none' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
                padding: '5px 14px', borderRadius: '999px', border: `1.5px solid`, cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px',
                background: activeCategory === cat.key ? t.accent : t.pillBg,
                color: activeCategory === cat.key ? 'white' : t.textMuted,
                borderColor: activeCategory === cat.key ? t.accent : t.pillBorder,
              }}>
                {cat.emoji && <span>{cat.emoji}</span>}
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Section header: date dropdown + venue filter (home tab only) ── */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px', background: t.bg }}>

            {/* Date dropdown */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setDateDropOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '17px', fontWeight: 800, color: t.text,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}>
                {activeDateLabel} <span style={{ fontSize: '11px', color: t.textMuted }}>▼</span>
              </button>

              {dateDropOpen && (
                <>
                  <div onClick={() => setDateDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                    background: t.dropdownBg, borderRadius: '12px', zIndex: 200,
                    boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)',
                    border: `1px solid ${t.border}`,
                    overflow: 'hidden', minWidth: '160px',
                  }}>
                    {DATE_OPTIONS.map(opt => (
                      <button key={opt.key} onClick={() => { setDateKey(opt.key); setDateDropOpen(false); }} style={{
                        display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                        border: 'none', cursor: 'pointer', fontSize: '14px',
                        fontWeight: dateKey === opt.key ? 700 : 500,
                        background: dateKey === opt.key ? (darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.07)') : t.dropdownBg,
                        color: dateKey === opt.key ? t.accent : t.text,
                      }}>{opt.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Event count + map + venue filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: t.textMuted }}>
                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
              </span>

              {/* Map button */}
              <button onClick={() => setActiveTab('map')} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                border: `1.5px solid ${t.pillBorder}`, cursor: 'pointer',
                background: t.pillBg, color: t.textMuted,
              }}>
                🗺️ Map
              </button>

              <div style={{ position: 'relative' }}>
                <button onClick={() => setVenueSheetOpen(o => !o)} style={{
                  display: 'flex', alignItems: 'center', gap: '3px',
                  fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                  border: `1.5px solid`, cursor: 'pointer',
                  background: activeVenueLabel ? t.accent : t.pillBg,
                  color: activeVenueLabel ? '#FFFFFF' : t.textMuted,
                  borderColor: activeVenueLabel ? t.accent : t.pillBorder,
                }}>
                  📍 {activeVenueLabel ?? 'Venue'} ▾
                </button>

                {venueSheetOpen && (
                  <>
                    <div onClick={() => { setVenueSheetOpen(false); setVenueSearch(''); }} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                      background: t.dropdownBg, borderRadius: '12px', zIndex: 200,
                      boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)',
                      border: `1px solid ${t.border}`,
                      width: '220px', maxHeight: '280px',
                      display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${t.border}` }}>
                        <input
                          type="text" placeholder="Search venues…"
                          value={venueSearch} onChange={e => setVenueSearch(e.target.value)} autoFocus
                          style={{ width: '100%', padding: '6px 10px', border: `1.5px solid ${t.border}`, borderRadius: '8px', fontSize: '13px', outline: 'none', background: t.inputBg, color: t.text }}
                        />
                      </div>
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        <button onClick={() => { setActiveVenue('all'); setVenueSheetOpen(false); setVenueSearch(''); }} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                          background: activeVenue === 'all' ? (darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.07)') : t.dropdownBg,
                          borderBottom: `1px solid ${t.border}`,
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: activeVenue === 'all' ? 700 : 500, color: activeVenue === 'all' ? t.accent : t.text }}>All Venues</span>
                          {activeVenue === 'all' && <span style={{ color: t.accent, fontSize: '12px' }}>✓</span>}
                        </button>
                        {filteredVenues.map(venue => (
                          <button key={venue} onClick={() => { setActiveVenue(venue); setVenueSheetOpen(false); setVenueSearch(''); }} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                            background: activeVenue === venue ? (darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.07)') : t.dropdownBg,
                            borderBottom: `1px solid ${t.border}`,
                          }}>
                            <span style={{ fontSize: '13px', fontWeight: activeVenue === venue ? 700 : 500, color: activeVenue === venue ? t.accent : t.text }}>{venue}</span>
                            {activeVenue === venue && <span style={{ color: t.accent, fontSize: '12px' }}>✓</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Map view ─────────────────────────────────────────────────── */}
        {activeTab === 'map' && (
          <MapView events={filteredEvents} onClose={() => setActiveTab('home')} />
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
                { icon: darkMode ? '☀️' : '🌙', label: darkMode ? 'Light Mode' : 'Dark Mode', toggle: 'theme'  },
                { icon: '🎵', label: 'Hero Category Preference',  soon: true       },
                { icon: '📍', label: 'Default Location',          soon: true       },
                { icon: '🎟', label: 'Submit an Event',           action: () => setShowSubmit(true) },
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
                    ? <div style={{ width: '44px', height: '24px', borderRadius: '999px', position: 'relative', background: darkMode ? t.accentAlt : t.textSubtle, transition: 'background 0.2s', flexShrink: 0 }}>
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
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
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
            <span style={{ fontSize: tab.key === 'saved' ? '18px' : '20px', lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: activeTab === tab.key ? 700 : 500 }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSubmit && (
        <SubmitEventModal onClose={() => setShowSubmit(false)} onSubmit={() => setToast('Event submitted for review!')} />
      )}
      {reportEvent && (
        <ReportIssueModal event={reportEvent} onClose={() => setReportEvent(null)} onSubmit={() => { setToast('Report submitted. Thank you!'); setReportEvent(null); }} />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
