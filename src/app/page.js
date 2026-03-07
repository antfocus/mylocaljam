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

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('home'); // 'home' | 'saved' | 'map' | 'profile'
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

      // Schedule or cancel notification reminder
      if (adding) {
        const event = events.find(e => e.id === id);
        if (event && notifEnabled) {
          scheduleReminder(event);
        }
      } else {
        cancelReminder(id);
      }

      return next;
    });
  }, [events]);

  // ── Fetch from Supabase (unchanged logic) ──────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      // Use local date string (YYYY-MM-DD) to avoid UTC offset cutting off today's events
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

      // Normalize fields so new components work alongside old ones
      const mapped = (data || []).map(e => {
        // Extract time from event_date datetime if start_time is missing
        // e.g. "2026-03-07T21:00:00" → "21:00"
        const extractedStartTime = e.start_time || (() => {
          if (e.event_date && e.event_date.includes('T')) {
            // Parse as Date and use LOCAL time getters to avoid UTC offset
            const d = new Date(e.event_date);
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
          }
          return null;
        })();

        return {
          ...e,
          // New unified field names (used by EventCardV2, HeroSection)
          name:       e.artist_name  || e.name  || '',
          venue:      e.venues?.name || e.venue_name || e.venue || '',
          date: (() => {
            const raw = e.event_date || '';
            if (!raw) return '';
            // Timestamp (has T): parse and use local date getters to avoid UTC shift
            if (raw.includes('T')) {
              const d = new Date(raw);
              const p = n => String(n).padStart(2, '0');
              return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
            }
            // Plain date string (YYYY-MM-DD): safe to use directly
            return raw.substring(0, 10);
          })(),
          start_time: extractedStartTime,
          description: e.artist_bio || e.description || '',
          // Keep originals too
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

  // Re-schedule any pending reminders on app load
  useEffect(() => { rehydrateReminders(); }, []);

  // Reset date filter when switching tabs
  useEffect(() => { setDateKey('all'); }, [activeTab]);

  // ── Date boundaries (local time, not UTC) ───────────────────────────────────
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const todayStr    = localDateStr(new Date());
  const tomorrowStr = localDateStr(new Date(new Date().setDate(new Date().getDate() + 1)));
  const fridayStr   = (() => {
    const d = new Date(); const day = d.getDay();
    // If today is Fri/Sat/Sun, use this weekend's Friday; otherwise next Friday
    if (day === 5) return localDateStr(d);                              // Today is Friday
    if (day === 6) { d.setDate(d.getDate() - 1); return localDateStr(d); } // Today is Saturday
    if (day === 0) { d.setDate(d.getDate() - 2); return localDateStr(d); } // Today is Sunday
    d.setDate(d.getDate() + (5 - day)); return localDateStr(d);         // Next Friday
  })();
  const sundayStr = (() => {
    const d = new Date(fridayStr + 'T00:00:00'); d.setDate(d.getDate() + 2);
    return localDateStr(d);
  })();

  // ── Filtered events ─────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let list = [...events];

    switch (dateKey) {
      case 'today':   list = list.filter(e => e.date === todayStr); break;
      case 'tomorrow':list = list.filter(e => e.date === tomorrowStr); break;
      case 'weekend': list = list.filter(e => e.date >= fridayStr && e.date <= sundayStr); break;
      default: break;
    }

    if (activeVenue !== 'all') list = list.filter(e => e.venue === activeVenue);

    if (activeCategory !== 'All') {
      list = list.filter(e => {
        const g = (e.genre ?? e.vibe ?? '').toLowerCase();
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

  // ── Grouped events — always group by date so separators always show ─────────
  const groupedEvents = useMemo(() =>
    groupEventsByDate(filteredEvents),
    [filteredEvents]
  );

  // ── Hero events: today first, fall back to next upcoming ────────────────────
  const heroEvents = useMemo(() => {
    const todayEvents = events
      .filter(e => e.date === todayStr)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    if (todayEvents.length > 0) return todayEvents;
    // No events today — show next upcoming events instead
    return events
      .filter(e => e.date > todayStr)
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
      })
      .slice(0, 6);
  }, [events, todayStr]);

  const heroIsToday = heroEvents.length > 0 && heroEvents[0]?.date === todayStr;

  // ── Venue list for bottom sheet ─────────────────────────────────────────────
  const allVenues = useMemo(() => {
    const set = new Set(events.map(e => e.venue).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  // Normalize strings for fuzzy matching: lowercase, & ↔ and, strip punctuation
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

  return (
    <>
      <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: '#F7F5F2', maxWidth: '480px', margin: '0 auto' }}>

        {/* ── Top Nav ────────────────────────────────────────────────────── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Image src="/myLocaljam_Logo_v4.png" alt="myLocalJam" width={40} height={40} style={{ objectFit: 'contain' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1 }}>
                <span style={{ color: '#2D2D2D' }}>mylocal</span>
                <span style={{ color: '#E8722A' }}>jam</span>
              </div>
              <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: '#6B7280', lineHeight: 1, whiteSpace: 'nowrap' }}>
                Local Music&nbsp;·&nbsp;Food&nbsp;·&nbsp;Experiences&nbsp;·&nbsp;Community
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowSubmit(true)}
              style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: '#E8722A', color: 'white', fontSize: '20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              +
            </button>
          </div>
        </header>

        {/* ── Hero (home tab only) ──────────────────────────────────────── */}
        {activeTab === 'home' && (
          <HeroSection events={heroEvents} isToday={heroIsToday} />
        )}

        {/* ── Search bar (home tab only) ────────────────────────────────── */}
        {activeTab === 'home' && <div style={{ padding: '10px 16px 6px', background: 'white' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#F3F4F6', borderRadius: '12px', padding: '8px 14px',
          }}>
            <span style={{ fontSize: '14px', color: '#9CA3AF' }}>🔍</span>
            <input
              type="text" placeholder="Search artists, venues, events..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '14px', color: '#1F2937' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '16px' }}>✕</button>
            )}
          </div>
        </div>}

        {/* ── Category pills (home tab only) ────────────────────────────── */}
        {activeTab === 'home' && <div style={{ display: 'flex', gap: '6px', padding: '8px 16px 10px', overflowX: 'auto', background: 'white', borderBottom: '1px solid #F3F4F6', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
              padding: '5px 14px', borderRadius: '999px', border: '1.5px solid', cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px',
              background: activeCategory === cat.key ? '#E8722A' : 'white',
              color: activeCategory === cat.key ? 'white' : '#6B7280',
              borderColor: activeCategory === cat.key ? '#E8722A' : '#E5E7EB',
            }}>
              {cat.emoji && <span>{cat.emoji}</span>}
              {cat.label}
            </button>
          ))}
        </div>}

        {/* ── Section header: date dropdown + venue filter (home tab only) ── */}
        {activeTab === 'home' &&
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px' }}>

          {/* Date dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setDateDropOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '17px', fontWeight: 800, color: '#2D2D2D',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              {activeDateLabel} <span style={{ fontSize: '11px', color: '#9CA3AF' }}>▼</span>
            </button>

            {dateDropOpen && (
              <>
                <div onClick={() => setDateDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: 'white', borderRadius: '12px', zIndex: 200,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: '160px',
                }}>
                  {DATE_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => { setDateKey(opt.key); setDateDropOpen(false); }} style={{
                      display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                      border: 'none', cursor: 'pointer', fontSize: '14px',
                      fontWeight: dateKey === opt.key ? 700 : 500,
                      background: dateKey === opt.key ? 'rgba(232,114,42,0.07)' : 'white',
                      color: dateKey === opt.key ? '#E8722A' : '#2D2D2D',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Event count + venue filter + map */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            </span>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setVenueSheetOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                border: '1.5px solid', cursor: 'pointer',
                background: activeVenueLabel ? '#E8722A' : 'white',
                color: activeVenueLabel ? '#FFFFFF' : '#4B5563',
                borderColor: activeVenueLabel ? '#E8722A' : '#E5E7EB',
              }}>
                📍 {activeVenueLabel ?? 'Venue'} ▾
              </button>

              {venueSheetOpen && (
                <>
                  <div onClick={() => { setVenueSheetOpen(false); setVenueSearch(''); }} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                    background: 'white', borderRadius: '12px', zIndex: 200,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    width: '220px', maxHeight: '280px',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    {/* Search */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #F3F4F6' }}>
                      <input
                        type="text" placeholder="Search venues…"
                        value={venueSearch} onChange={e => setVenueSearch(e.target.value)} autoFocus
                        style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#F9FAFB' }}
                      />
                    </div>
                    {/* Venue list */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      <button onClick={() => { setActiveVenue('all'); setVenueSheetOpen(false); setVenueSearch(''); }} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                        background: activeVenue === 'all' ? 'rgba(232,114,42,0.07)' : 'white',
                        borderBottom: '1px solid #F3F4F6',
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: activeVenue === 'all' ? 700 : 500, color: activeVenue === 'all' ? '#E8722A' : '#2D2D2D' }}>All Venues</span>
                        {activeVenue === 'all' && <span style={{ color: '#E8722A', fontSize: '12px' }}>✓</span>}
                      </button>
                      {filteredVenues.map(venue => (
                        <button key={venue} onClick={() => { setActiveVenue(venue); setVenueSheetOpen(false); setVenueSearch(''); }} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                          background: activeVenue === venue ? 'rgba(232,114,42,0.07)' : 'white',
                          borderBottom: '1px solid #F3F4F6',
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: activeVenue === venue ? 700 : 500, color: activeVenue === venue ? '#E8722A' : '#2D2D2D' }}>{venue}</span>
                          {activeVenue === venue && <span style={{ color: '#E8722A', fontSize: '12px' }}>✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>}

        {/* ── Map view ─────────────────────────────────────────────────── */}
        {activeTab === 'map' && (
          <MapView events={filteredEvents} onClose={() => setActiveTab('home')} />
        )}

        {/* ── Saved view ───────────────────────────────────────────────── */}
        {activeTab === 'saved' && (
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
            {/* Search bar for Saved tab */}
            <div style={{ padding: '10px 16px 6px', background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', borderRadius: '12px', padding: '8px 14px' }}>
                <span style={{ fontSize: '14px', color: '#9CA3AF' }}>🔍</span>
                <input
                  type="text" placeholder="Search saved events..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '14px', color: '#1F2937' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '16px' }}>✕</button>
                )}
              </div>
            </div>
            {/* Date filter pills for Saved tab */}
            <div style={{ display: 'flex', gap: '6px', padding: '8px 16px 10px', overflowX: 'auto', background: 'white', borderBottom: '1px solid #F3F4F6', scrollbarWidth: 'none' }}>
              {DATE_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setDateKey(opt.key)} style={{
                  padding: '5px 14px', borderRadius: '999px', border: '1.5px solid', cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: '12px', fontWeight: 700,
                  background: dateKey === opt.key ? '#E8722A' : 'white',
                  color: dateKey === opt.key ? 'white' : '#6B7280',
                  borderColor: dateKey === opt.key ? '#E8722A' : '#E5E7EB',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
            {(() => {
              let savedEvents = events.filter(e => favorites.has(e.id));

              // Apply text search
              if (searchQuery.trim()) {
                const q = normalizeVenue(searchQuery);
                savedEvents = savedEvents.filter(e =>
                  normalizeVenue(e.name).includes(q) ||
                  normalizeVenue(e.venue).includes(q) ||
                  normalizeVenue(e.genre ?? '').includes(q)
                );
              }

              // Apply date filter
              switch (dateKey) {
                case 'today':   savedEvents = savedEvents.filter(e => e.date === todayStr); break;
                case 'tomorrow':savedEvents = savedEvents.filter(e => e.date === tomorrowStr); break;
                case 'weekend': savedEvents = savedEvents.filter(e => e.date >= fridayStr && e.date <= sundayStr); break;
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
                    <p style={{ fontWeight: 700, fontSize: '16px', color: '#2D2D2D', marginBottom: '4px' }}>
                      {!hasAnySaved ? 'No saved events yet' : searchQuery ? 'No results found' : `No saved events for ${DATE_OPTIONS.find(o => o.key === dateKey)?.label ?? 'this period'}`}
                    </p>
                    <p style={{ fontSize: '14px', color: '#6B7280' }}>
                      {!hasAnySaved ? 'Tap the ♡ on any event to save it here' : searchQuery ? 'Try a different search term' : 'Try a different date filter'}
                    </p>
                  </div>
                );
              }
              const savedGroups = groupEventsByDate(savedEvents);
              return (
                <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', padding: '14px 0 2px' }}>
                    {savedEvents.length} saved event{savedEvents.length !== 1 ? 's' : ''}
                  </p>
                  {savedGroups.map(group => (
                    <div key={group.date}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#9CA3AF' }}>
                          {group.label}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {group.events.map((event, i) => (
                          <EventCardV2 key={event.id ?? i} event={event} onReport={setReportEvent} isFavorited={true} onToggleFavorite={toggleFavorite} />
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
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
            <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #E8722A, #3AADA0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                👤
              </div>
              <p style={{ fontWeight: 800, fontSize: '18px', color: '#2D2D2D', marginTop: '8px' }}>Your Profile</p>
              <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Sign in to save events across devices</p>
              <button style={{ marginTop: '12px', padding: '10px 32px', borderRadius: '999px', border: 'none', background: '#E8722A', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
            <div style={{ margin: '0 16px', borderRadius: '12px', background: 'white', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
              {[
                { icon: '🔔', label: 'Notifications', toggle: true },
                { icon: '🎵', label: 'Hero Category Preference', soon: true },
                { icon: '📍', label: 'Default Location', soon: true },
                { icon: '🎟', label: 'Submit an Event', action: () => setShowSubmit(true) },
              ].map((item, i, arr) => (
                <button key={item.label} onClick={item.toggle ? toggleNotifications : (item.action ?? null)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '14px 16px', border: 'none', cursor: 'pointer',
                  background: 'white', borderBottom: i < arr.length - 1 ? '1px solid #F3F4F6' : 'none',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#1F2937', fontWeight: 500 }}>
                    <span>{item.icon}</span>{item.label}
                  </span>
                  {item.soon
                    ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: '999px' }}>SOON</span>
                    : item.toggle
                    ? <div style={{
                        width: '44px', height: '24px', borderRadius: '999px', position: 'relative',
                        background: notifEnabled ? '#E8722A' : '#D1D5DB',
                        transition: 'background 0.2s', flexShrink: 0,
                      }}>
                        <div style={{
                          position: 'absolute', top: '3px',
                          left: notifEnabled ? '23px' : '3px',
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: 'white', transition: 'left 0.2s',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                    : <span style={{ color: '#D1D5DB', fontSize: '12px' }}>›</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Event list ────────────────────────────────────────────────── */}
        {activeTab === 'home' && <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF', fontSize: '15px' }}>
              Loading events…
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
              <span style={{ fontSize: '48px', marginBottom: '12px' }}>🎵</span>
              <p style={{ fontWeight: 700, fontSize: '16px', color: '#2D2D2D', marginBottom: '4px' }}>No events found</p>
              <p style={{ fontSize: '14px', color: '#6B7280' }}>Try a different date, category, or venue</p>
            </div>
          ) : (
            /* Always grouped by date so separators always show */
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {groupedEvents.map(group => (
                <div key={group.date}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0 6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#9CA3AF' }}>
                      {group.label}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: '#E5E7EB' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.events.map((event, i) => (
                      <EventCardV2 key={event.id ?? `${group.date}-${i}`} event={event} onReport={setReportEvent} isFavorited={favorites.has(event.id)} onToggleFavorite={toggleFavorite} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>


      {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: 'white', borderTop: '1px solid #F3F4F6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}>
        {[
          { key: 'home',    icon: '🏠', label: 'Home'    },
          { key: 'saved',   icon: '♥',  label: 'Saved'   },
          { key: 'map',     icon: '🗺️', label: 'Map'     },
          { key: 'profile', icon: '👤', label: 'Profile' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
            color: activeTab === tab.key ? '#E8722A' : '#9CA3AF',
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
