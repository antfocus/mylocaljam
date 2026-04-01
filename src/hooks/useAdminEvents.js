'use client';

import { useState, useCallback } from 'react';

const CATEGORY_OPTIONS = [
  { key: 'Live Music', label: 'Live Music', color: '#23CE6B' },
  { key: 'Food & Drink Special', label: 'Food & Drink', color: '#F59E0B' },
  { key: 'Trivia', label: 'Trivia', color: '#8B5CF6' },
  { key: 'Sports / Watch Party', label: 'Sports', color: '#3B82F6' },
  { key: 'Other / Special Event', label: 'Other', color: '#EC4899' },
];

export default function useAdminEvents({ password, showQueueToast, setAuthenticated }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const [events, setEvents] = useState([]);
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
        setEvents(Array.isArray(data) ? data : []);
      }
      if (data.newEvents24h !== undefined) setNewEvents24h(data.newEvents24h);
    } catch (err) { console.error(err); }
  }, [password, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime, eventsRecentlyAdded]);

  const toggleFeatured = async (ev) => {
    const newVal = !ev.is_featured;
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_featured: newVal } : e));
    await fetch('/api/admin', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: ev.id, is_featured: newVal }),
    });
  };

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

  return {
    events, setEvents,
    showEventForm, setShowEventForm,
    editingEvent, setEditingEvent,
    selectedEvents, setSelectedEvents,
    bulkTimeModal, setBulkTimeModal,
    bulkTime, setBulkTime,
    bulkTimeLoading, setBulkTimeLoading,
    eventsStatusFilter, setEventsStatusFilter,
    eventsSearch, setEventsSearch,
    eventsMissingTime, setEventsMissingTime,
    eventsSortField, setEventsSortField,
    eventsSortOrder, setEventsSortOrder,
    eventsPage, setEventsPage,
    eventsTotalPages, setEventsTotalPages,
    eventsTotal, setEventsTotal,
    newEvents24h, setNewEvents24h,
    eventsRecentlyAdded, setEventsRecentlyAdded,
    fetchEvents,
    toggleFeatured,
    updateEventCategory,
    CATEGORY_OPTIONS,
  };
}
