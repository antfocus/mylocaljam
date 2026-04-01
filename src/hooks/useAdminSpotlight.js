'use client';

import { useState, useCallback } from 'react';

export default function useAdminSpotlight({ password, fetchAll }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const [spotlightDate, setSpotlightDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [spotlightPins, setSpotlightPins] = useState([]);
  const [spotlightEvents, setSpotlightEvents] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [spotlightImageWarning, setSpotlightImageWarning] = useState(null);
  const [spotlightSearch, setSpotlightSearch] = useState('');

  const fetchSpotlightEvents = useCallback(async (date) => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '500', sort: 'event_date', order: 'asc', status: 'upcoming' });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) return [];
      const data = await res.json();
      const all = data.events || (Array.isArray(data) ? data : []);
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
    const todayEvents = await fetchSpotlightEvents(date);
    const validEventIds = new Set(todayEvents.map(e => e.id));
    const cleanPins = pinIds.filter(id => validEventIds.has(id));
    setSpotlightPins(cleanPins);
    setSpotlightLoading(false);
  }, [fetchSpotlightEvents]);

  const saveSpotlight = async () => {
    const validPins = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id));
    setSpotlightPins(validPins);

    await fetch('/api/spotlight', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: spotlightDate, event_ids: validPins }),
    });

    for (let i = 0; i < validPins.length; i++) {
      await fetch('/api/admin', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: validPins[i], spotlight_order: i, is_featured: true }),
      });
    }

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
      const clean = prev.filter(id => id === eventId || spotlightEvents.some(e => e.id === id));
      if (clean.includes(eventId)) return clean.filter(id => id !== eventId);
      if (clean.length >= 5) { alert('Maximum 5 spotlight events per day'); return clean; }
      return [...clean, eventId];
    });
  };

  return {
    spotlightDate, setSpotlightDate,
    spotlightPins, setSpotlightPins,
    spotlightEvents, setSpotlightEvents,
    spotlightLoading,
    spotlightImageWarning, setSpotlightImageWarning,
    spotlightSearch, setSpotlightSearch,
    fetchSpotlightEvents,
    fetchSpotlight,
    saveSpotlight,
    clearSpotlight,
    toggleSpotlightPin,
  };
}
