'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getVenueColor, groupEventsByDate, formatTimeRange } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';

import SiteHeader     from '@/components/SiteHeader';
import SiteHero       from '@/components/SiteHero';
import SiteEventCard  from '@/components/SiteEventCard';
import SiteFooter     from '@/components/SiteFooter';
import AddToJarModal  from '@/components/AddToJarModal';
import Toast          from '@/components/Toast';

// ── Helpers ──────────────────────────────────────────────────────────────────
function decodeEntities(str) {
  if (!str || typeof str !== 'string') return str;
  const el = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (el) { el.innerHTML = str; return el.value; }
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeSearch(s) {
  return (s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

const DATE_FILTERS = [
  { key: 'all',      label: 'All Upcoming' },
  { key: 'today',    label: 'Today'        },
  { key: 'tomorrow', label: 'Tomorrow'     },
  { key: 'weekend',  label: 'This Weekend' },
  { key: 'month',    label: 'This Month'   },
];

const BATCH_SIZE = 20;

export default function HomePage() {
  const { dark, toggle: toggleTheme } = useTheme();

  // ── Data state ────────────────────────────────────────────────────────────
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [dateFilter, setDateFilter]     = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeVenue, setActiveVenue]   = useState('all');
  const [showSubmit, setShowSubmit]     = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const loadMoreRef = useRef(null);
  const feedRef = useRef(null);

  // ── Favorites ─────────────────────────────────────────────────────────────
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
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('mlj_favorites', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── Fetch events from Supabase ────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayLocal = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, address, color, photo_url)')
        .gte('event_date', todayLocal)
        .eq('status', 'published')
        .order('event_date', { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map(e => {
        let extractedStartTime = e.start_time || (() => {
          if (e.event_date && e.event_date.includes('T')) {
            const d = new Date(e.event_date);
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

  // ── Date boundaries ───────────────────────────────────────────────────────
  const todayStr = localDateStr(new Date());
  const tomorrowStr = localDateStr(new Date(Date.now() + 86400000));
  const fridayStr = (() => {
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
  const monthEndStr = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return localDateStr(d);
  })();

  // ── Filtered events ───────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let list = [...events];

    switch (dateFilter) {
      case 'today':    list = list.filter(e => e.date === todayStr); break;
      case 'tomorrow': list = list.filter(e => e.date === tomorrowStr); break;
      case 'weekend': {
        const weekendStart = todayStr > fridayStr ? todayStr : fridayStr;
        list = list.filter(e => e.date >= weekendStart && e.date <= sundayStr);
        break;
      }
      case 'month':    list = list.filter(e => e.date >= todayStr && e.date <= monthEndStr); break;
      default:         list = list.filter(e => e.date >= todayStr); break;
    }

    if (activeVenue !== 'all') list = list.filter(e => e.venue === activeVenue);

    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      list = list.filter(e =>
        normalizeSearch(e.name).includes(q) ||
        normalizeSearch(e.venue).includes(q) ||
        normalizeSearch(e.genre ?? '').includes(q)
      );
    }

    list.sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });

    return list;
  }, [events, dateFilter, activeVenue, searchQuery, todayStr, tomorrowStr, fridayStr, sundayStr, monthEndStr]);

  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);

  // ── Visible events (infinite scroll) ──────────────────────────────────────
  const visibleEvents = useMemo(() => filteredEvents.slice(0, visibleCount), [filteredEvents, visibleCount]);
  const visibleGrouped = useMemo(() => groupEventsByDate(visibleEvents), [visibleEvents]);
  const hasMore = visibleCount < filteredEvents.length;

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(BATCH_SIZE); }, [dateFilter, activeVenue, searchQuery]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore) {
          setVisibleCount(prev => prev + BATCH_SIZE);
        }
      },
      { rootMargin: '200px' }
    );
    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore]);

  // ── Hero events ───────────────────────────────────────────────────────────
  const heroEvents = useMemo(() => {
    const todayEvents = events.filter(e => e.date === todayStr)
      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    if (todayEvents.length > 0) return todayEvents.slice(0, 5);
    return events.filter(e => e.date > todayStr)
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        return dc !== 0 ? dc : (a.start_time ?? '').localeCompare(b.start_time ?? '');
      })
      .slice(0, 5);
  }, [events, todayStr]);

  // ── All venues ────────────────────────────────────────────────────────────
  const allVenues = useMemo(() => {
    return Array.from(new Set(events.map(e => e.venue).filter(Boolean))).sort();
  }, [events]);

  // ── Scroll to feed ────────────────────────────────────────────────────────
  const scrollToFeed = () => {
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <SiteHeader onOpenSubmit={() => setShowSubmit(true)} />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <SiteHero
        events={heroEvents}
        onExplore={scrollToFeed}
        onAddEvent={() => setShowSubmit(true)}
      />

      {/* ── Main Content ───────────────────────────────────────────── */}
      <main
        ref={feedRef}
        style={{
          flex: 1,
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '32px 24px 64px',
        }}
      >
        {/* ── Filter Controls ──────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '32px',
        }}>
          {/* Date filter pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DATE_FILTERS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setDateFilter(opt.key)}
                className={`filter-pill ${dateFilter === opt.key ? 'active' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Near Me / Venue filter */}
            <select
              value={activeVenue}
              onChange={e => setActiveVenue(e.target.value)}
              aria-label="Filter by venue"
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1.5px solid var(--border)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '200px',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <option value="all">📍 All Venues</option>
              {allVenues.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>

            {/* Event count */}
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}>
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Events Grid ──────────────────────────────────────────── */}
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '80px 0',
            gap: '16px',
          }}>
            <div className="loading-spinner" />
            <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Loading events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '80px 32px',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '56px', marginBottom: '16px' }}>🎵</span>
            <p className="font-heading" style={{ fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: '8px' }}>
              No events found
            </p>
            <p style={{ fontSize: '15px', color: 'var(--text-muted)', maxWidth: '400px' }}>
              Try a different date, venue, or search term. Or add your own event to the jar!
            </p>
            <button
              onClick={() => setShowSubmit(true)}
              className="btn-glow font-heading"
              style={{
                marginTop: '24px',
                padding: '12px 28px',
                borderRadius: '999px',
                background: 'var(--accent-teal)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
              }}
            >
              🫙 Add an Event
            </button>
          </div>
        ) : (
          <div>
            {visibleGrouped.map(group => (
              <div key={group.date} style={{ marginBottom: '32px' }}>
                {/* Date separator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                }}>
                  <span className="font-heading" style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}>
                    {group.label}
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>

                {/* Card grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: '16px',
                }}>
                  {group.events.map((event, i) => (
                    <SiteEventCard
                      key={event.id ?? `${group.date}-${i}`}
                      event={event}
                      isFavorited={favorites.has(event.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={loadMoreRef} style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '32px 0',
              }}>
                <div className="loading-spinner" />
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <SiteFooter dark={dark} onToggleTheme={toggleTheme} />

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {showSubmit && (
        <AddToJarModal
          onClose={() => setShowSubmit(false)}
          onSubmit={() => setToast('🫙 Event submitted for review! Thank you!')}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
