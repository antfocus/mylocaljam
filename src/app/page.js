'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, isToday, isTomorrow, isThisWeekend, isSameDay, getVenueColor, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import EventCard from '@/components/EventCard';
import CalendarView from '@/components/CalendarView';
import FilterDropdown from '@/components/FilterDropdown';
import SubmitEventModal from '@/components/SubmitEventModal';
import ReportIssueModal from '@/components/ReportIssueModal';
import Toast from '@/components/Toast';

export default function HomePage() {
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickFilter, setQuickFilter] = useState('today');
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [venueFilters, setVenueFilters] = useState([]);
  const [genreFilters, setGenreFilters] = useState([]);
  const [vibeFilters, setVibeFilters] = useState([]);
  const [calendarDate, setCalendarDate] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [reportEvent, setReportEvent] = useState(null);
  const [toast, setToast] = useState(null);

  // Fetch events from Supabase
  const fetchEvents = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, address, color)')
        .gte('event_date', today.toISOString())
        .eq('status', 'published')
        .order('event_date', { ascending: true });

      if (error) throw error;

      // Map venue data onto events for convenience
      const mapped = (data || []).map((e) => ({
        ...e,
        venue_name: e.venues?.name || e.venue_name,
        venue_address: e.venues?.address || '',
        venue_color: e.venues?.color || getVenueColor(e.venues?.name || e.venue_name),
      }));

      setEvents(mapped);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
    setLoading(false);
  }, []);

  const fetchVenues = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');
      if (error) throw error;
      setVenues(data || []);
    } catch (err) {
      console.error('Error fetching venues:', err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchVenues();
  }, [fetchEvents, fetchVenues]);

  const toggleFilter = (setList) => (item) => {
    setList((prev) => prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]);
  };

  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Quick filter
    if (view !== 'calendar') {
      if (quickFilter === 'today') filtered = filtered.filter((e) => isToday(e.event_date));
      else if (quickFilter === 'tomorrow') filtered = filtered.filter((e) => isTomorrow(e.event_date));
      else if (quickFilter === 'weekend') filtered = filtered.filter((e) => isThisWeekend(e.event_date));
    } else if (calendarDate) {
      filtered = filtered.filter((e) => isSameDay(e.event_date, calendarDate));
    }

    // Search
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((e) =>
        (e.artist_name || '').toLowerCase().includes(s) ||
        (e.venue_name || '').toLowerCase().includes(s) ||
        (e.genre || '').toLowerCase().includes(s) ||
        (e.artist_bio || '').toLowerCase().includes(s)
      );
    }

    // Filters
    if (venueFilters.length) filtered = filtered.filter((e) => venueFilters.includes(e.venue_name));
    if (genreFilters.length) filtered = filtered.filter((e) => genreFilters.includes(e.genre));
    if (vibeFilters.length) filtered = filtered.filter((e) => vibeFilters.includes(e.vibe));

    return filtered;
  }, [events, quickFilter, search, venueFilters, genreFilters, vibeFilters, view, calendarDate]);

  // Group by date
  const groupedEvents = useMemo(() => {
    const groups = {};
    filteredEvents.forEach((ev) => {
      const key = new Date(ev.event_date).toDateString();
      if (!groups[key]) groups[key] = { date: new Date(ev.event_date), events: [] };
      groups[key].events.push(ev);
    });
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [filteredEvents]);

  const getDateBadgeEl = (date) => {
    if (isToday(date)) return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-brand-accent text-white font-display uppercase tracking-wide">Today</span>;
    if (isTomorrow(date)) return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500 text-white font-display uppercase tracking-wide">Tomorrow</span>;
    if (isThisWeekend(date)) return <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-500 text-white font-display uppercase tracking-wide">This Weekend</span>;
    return null;
  };

  const venueNames = venues.map((v) => v.name);

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between py-5 border-b border-white/[0.06] mb-6 sticky top-0 z-[100]" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => {
            setQuickFilter('today');
            setView('list');
            setSearch('');
            setVenueFilters([]);
            setGenreFilters([]);
            setVibeFilters([]);
            setCalendarDate(null);
          }}
        >
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'var(--accent)', boxShadow: '0 0 20px var(--accent-glow)' }}>
            {Icons.music}
          </div>
          <div className="font-display font-extrabold text-[22px] tracking-tight">
            my<span style={{ color: 'var(--accent)' }}>Local</span>Jam
          </div>
        </div>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
          style={{ background: 'var(--accent)' }}
          onClick={() => setShowSubmit(true)}
        >
          {Icons.plus} Submit Event
        </button>
      </header>

      {/* Quick Filters */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: 'today', label: 'Today' },
          { key: 'tomorrow', label: 'Tomorrow' },
          { key: 'weekend', label: 'This Weekend' },
          { key: 'all', label: 'All Upcoming' },
        ].map((f) => (
          <button
            key={f.key}
            className={`px-5 py-2.5 rounded-full border font-display font-semibold text-sm whitespace-nowrap transition-all ${
              quickFilter === f.key && view !== 'calendar'
                ? 'text-white border-brand-accent'
                : 'text-brand-text-secondary border-white/[0.06]'
            }`}
            style={
              quickFilter === f.key && view !== 'calendar'
                ? { background: 'var(--accent)', borderColor: 'var(--accent)', boxShadow: '0 0 16px var(--accent-glow)' }
                : { background: 'var(--bg-secondary)' }
            }
            onClick={() => { setQuickFilter(f.key); setView('list'); setCalendarDate(null); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 mb-5 flex-wrap items-center max-sm:flex-col">
        <div
          className="flex-1 min-w-[200px] max-sm:w-full flex items-center gap-2 px-3.5 py-2.5 rounded-lg border transition-colors"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          {Icons.search}
          <input
            className="flex-1 bg-transparent border-none outline-none text-brand-text text-sm font-body placeholder:text-brand-text-muted"
            placeholder="Search artists, venues, genres..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="p-1 text-brand-text-muted hover:text-brand-text" onClick={() => setSearch('')}>{Icons.x}</button>
          )}
        </div>

        <FilterDropdown label="Venue" icon={Icons.map} items={venueNames} selected={venueFilters} onToggle={toggleFilter(setVenueFilters)} onClear={() => setVenueFilters([])} />
        <FilterDropdown label="Genre" icon={Icons.music} items={GENRES} selected={genreFilters} onToggle={toggleFilter(setGenreFilters)} onClear={() => setGenreFilters([])} />
        <FilterDropdown label="Vibe" icon={Icons.filter} items={VIBES} selected={vibeFilters} onToggle={toggleFilter(setVibeFilters)} onClear={() => setVibeFilters([])} />

        <div className="flex rounded-lg border overflow-hidden" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <button
            className={`px-3 py-2 flex items-center transition-all ${view === 'list' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
            style={view === 'list' ? { background: 'var(--bg-card)' } : {}}
            onClick={() => setView('list')}
            title="List view"
          >
            {Icons.list}
          </button>
          <button
            className={`px-3 py-2 flex items-center transition-all ${view === 'calendar' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
            style={view === 'calendar' ? { background: 'var(--bg-card)' } : {}}
            onClick={() => setView('calendar')}
            title="Calendar view"
          >
            {Icons.calendar}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-brand-text-muted">
          <div className="animate-pulse text-lg font-display">Loading events...</div>
        </div>
      )}

      {/* Calendar */}
      {!loading && view === 'calendar' && (
        <CalendarView events={events} selectedDate={calendarDate} onSelectDate={setCalendarDate} />
      )}

      {/* Events */}
      {!loading && filteredEvents.length === 0 && (
        <div className="text-center py-16">
          <div className="opacity-30 mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <p className="text-brand-text-muted text-[15px]">
            No events found{search ? ` matching "${search}"` : ''}.
          </p>
          <p className="text-brand-text-muted text-[13px] mt-2">
            Try a different filter or{' '}
            <span className="text-brand-accent cursor-pointer" onClick={() => setShowSubmit(true)}>submit an event</span>.
          </p>
        </div>
      )}

      {!loading && filteredEvents.length > 0 && (
        <div className="space-y-3">
          {view === 'calendar' && calendarDate ? (
            <>
              <div className="font-display font-bold text-lg pt-4 pb-2 flex items-center gap-2.5">
                {formatDate(calendarDate)} {getDateBadgeEl(calendarDate)}
              </div>
              {filteredEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} onReport={setReportEvent} />
              ))}
            </>
          ) : view === 'list' ? (
            groupedEvents.map((group) => (
              <div key={group.date.toDateString()}>
                <div className="font-display font-bold text-lg pt-4 pb-2 flex items-center gap-2.5">
                  {formatDate(group.date)} {getDateBadgeEl(group.date)}
                </div>
                <div className="space-y-3">
                  {group.events.map((ev) => (
                    <EventCard key={ev.id} event={ev} onReport={setReportEvent} />
                  ))}
                </div>
              </div>
            ))
          ) : null}
        </div>
      )}

      {/* Modals */}
      {showSubmit && (
        <SubmitEventModal
          onClose={() => setShowSubmit(false)}
          onSubmit={() => setToast('Event submitted for review!')}
        />
      )}
      {reportEvent && (
        <ReportIssueModal
          event={reportEvent}
          onClose={() => setReportEvent(null)}
          onSubmit={() => { setToast('Report submitted. Thank you!'); setReportEvent(null); }}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
