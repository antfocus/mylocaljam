'use client';

import { useState, useCallback, useRef } from 'react';

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

  // ── Race-condition guards ──────────────────────────────────────────────────
  // `activeFetchRef` holds the latest date the user asked for. Any in-flight
  // fetch whose date no longer matches drops its response on the floor.
  // `abortRef` cancels the prior AbortController when a new fetch starts.
  const activeFetchRef = useRef(null);
  const abortRef = useRef(null);

  const fetchSpotlightEvents = useCallback(async (date, { signal } = {}) => {
    try {
      // Server-side single-day Eastern filter — ~30× smaller payload than
      // fetching 500 upcoming events and filtering client-side.
      const params = new URLSearchParams({
        page: '1',
        limit: '200',
        sort: 'event_date',
        order: 'asc',
        status: 'upcoming',
        date,
      });
      const res = await fetch(`/api/admin?${params}`, {
        headers: { Authorization: `Bearer ${password}` },
        signal,
      });
      if (!res.ok) return [];
      const data = await res.json();
      const all = data.events || (Array.isArray(data) ? data : []);
      // Defensive: the server already date-filtered, but we also require
      // status=published in case the endpoint's `upcoming` semantics drift.
      const filtered = all.filter(ev => ev.status === 'published');
      // Only commit if this is still the active date (stale-response guard).
      if (activeFetchRef.current === date) {
        setSpotlightEvents(filtered);
      }
      return filtered;
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load spotlight events:', err);
      }
      return [];
    }
  }, [password]);

  const fetchSpotlight = useCallback(async (date) => {
    // Kill any in-flight fetch for a different date.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    const controller = new AbortController();
    abortRef.current = controller;
    activeFetchRef.current = date;

    setSpotlightLoading(true);
    let pinIds = [];
    try {
      const res = await fetch(`/api/spotlight?date=${date}`, { signal: controller.signal });
      const data = await res.json();
      pinIds = Array.isArray(data) ? data.map(d => d.event_id) : [];
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load spotlight:', err);
      }
      // If aborted mid-fetch, another fetch is already taking over.
      if (err?.name === 'AbortError') return;
    }

    const todayEvents = await fetchSpotlightEvents(date, { signal: controller.signal });

    // Stale-response guard — user may have flipped the date picker while we
    // were awaiting. Only the winner writes state.
    if (activeFetchRef.current !== date) return;

    const validEventIds = new Set(todayEvents.map(e => e.id));
    const cleanPins = pinIds.filter(id => validEventIds.has(id));
    setSpotlightPins(cleanPins);

    // ── Stale-pin cleanup (audit H1, hardened post-9:51 PM incident) ─────
    // Only persist pin-list changes when we can be sure the removed pins
    // are genuinely orphaned (event deleted, wrong date, etc.) — NOT when
    // they simply fell off the admin events list because their start_time
    // passed and the `/api/admin?status=upcoming` time cutoff hid them.
    //
    // Rule: NEVER auto-delete pins whose spotlight_date is TODAY or later.
    // The admin explicitly chose these events; they stay until midnight or
    // until the admin unpins them manually from the Spotlight tab.
    //
    // For PAST dates we still clean up orphans — those are safe because
    // the events list for a past day is immutable (no time cutoff drift).
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const isTodayOrFuture = date >= todayStr;

    if (!isTodayOrFuture && cleanPins.length !== pinIds.length) {
      try {
        await fetch('/api/spotlight', {
          method: 'POST',
          headers,
          body: JSON.stringify({ date, event_ids: cleanPins }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to persist stale-pin cleanup:', err);
        }
      }
    }

    if (activeFetchRef.current === date) {
      setSpotlightLoading(false);
    }
  }, [fetchSpotlightEvents, headers]);

  const saveSpotlight = async () => {
    // Capture the target date at click time — if the user changes the picker
    // mid-save, we still commit pins to the correct date.
    const targetDate = spotlightDate;
    const validPins = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id));
    setSpotlightPins(validPins);

    const res = await fetch('/api/spotlight', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date: targetDate, event_ids: validPins }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed to save Spotlight: ${err.error || res.statusText}`);
      return;
    }

    alert(`Spotlight saved for ${targetDate} (${validPins.length} event${validPins.length !== 1 ? 's' : ''})`);
    fetchAll();
    // Refresh against whatever date is currently selected (may have changed).
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
