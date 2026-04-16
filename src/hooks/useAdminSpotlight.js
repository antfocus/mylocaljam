'use client';

import { useState, useCallback, useRef } from 'react';

const MAX_PINS = 5;

export default function useAdminSpotlight({ password, fetchAll }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };
  // Ref-based debounce for auto-save — cleared on every new pin mutation
  // so rapid reorders collapse into a single POST.
  const autoSaveTimer = useRef(null);
  const autoSaveRollback = useRef(null);

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

  // ── Auto-save (300ms debounce, fire-and-forget with rollback) ────────────
  // Every pin mutation calls `commitPins(newPins)` which optimistically sets
  // state, stashes a rollback snapshot, and debounces a single POST. Rapid
  // reorders (drag → drag → drag) collapse into one network call.
  const commitPins = useCallback((nextPins) => {
    setSpotlightPins(prev => {
      // Stash rollback only on the FIRST mutation within the debounce window
      // so we revert to the last server-confirmed state, not an intermediate.
      if (!autoSaveRollback.current) autoSaveRollback.current = prev;
      return nextPins;
    });

    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const targetDate = spotlightDate;
      try {
        const res = await fetch('/api/spotlight', {
          method: 'POST',
          headers,
          body: JSON.stringify({ date: targetDate, event_ids: nextPins }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Success — clear rollback, background-refresh the live feed.
        autoSaveRollback.current = null;
        fetchAll();
      } catch (err) {
        console.error('Auto-save failed, rolling back:', err);
        // Restore the last server-confirmed pin state.
        if (autoSaveRollback.current) {
          setSpotlightPins(autoSaveRollback.current);
        }
        autoSaveRollback.current = null;
      }
    }, 300);
  }, [spotlightDate, headers, fetchAll]);

  // ── Pin mutation helpers (all route through commitPins) ─────────────────

  /**
   * Insert-at-rank: place eventId at `index`, shifting everything below
   * down by one. If the list is already full, Rank #5 slides out.
   * Used by both DnD "list → slot" and the ★ star-button.
   */
  const insertPin = useCallback((eventId, index = 0) => {
    setSpotlightPins(prev => {
      // Already pinned? → treat as a reorder instead.
      if (prev.includes(eventId)) {
        const without = prev.filter(id => id !== eventId);
        const clamped = Math.min(index, without.length);
        const next = [...without.slice(0, clamped), eventId, ...without.slice(clamped)];
        commitPins(next.slice(0, MAX_PINS));
        return next.slice(0, MAX_PINS);
      }
      const clamped = Math.min(index, prev.length);
      const next = [...prev.slice(0, clamped), eventId, ...prev.slice(clamped)];
      // Slide-out: trim to 5 — whatever was at the end gets bumped.
      const trimmed = next.slice(0, MAX_PINS);
      commitPins(trimmed);
      return trimmed;
    });
  }, [commitPins]);

  /**
   * Reorder within the pinned list: move `eventId` from its current
   * position to `toIndex`. No events are added or removed.
   */
  const reorderPins = useCallback((fromIndex, toIndex) => {
    setSpotlightPins(prev => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commitPins(next);
      return next;
    });
  }, [commitPins]);

  /**
   * Remove a single pin (drag-out or ✕ button). Does NOT add anyone in
   * its place — the list shrinks to < 5 and the empty slot shows up.
   */
  const removePin = useCallback((eventId) => {
    setSpotlightPins(prev => {
      const next = prev.filter(id => id !== eventId);
      commitPins(next);
      return next;
    });
  }, [commitPins]);

  /**
   * Star-button: if unpinned → insert at #1 (push-off). If pinned → unpin.
   */
  const toggleSpotlightPin = useCallback((eventId) => {
    setSpotlightPins(prev => {
      if (prev.includes(eventId)) {
        const next = prev.filter(id => id !== eventId);
        commitPins(next);
        return next;
      }
      // Insert at rank #1 (index 0) with slide-out.
      const next = [eventId, ...prev].slice(0, MAX_PINS);
      commitPins(next);
      return next;
    });
  }, [commitPins]);

  // ── Legacy save / clear (still wired for header buttons) ────────────────
  const saveSpotlight = async () => {
    clearTimeout(autoSaveTimer.current);
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
    autoSaveRollback.current = null;
    fetchAll();
    fetchSpotlightEvents(spotlightDate);
  };

  const clearSpotlight = async () => {
    if (!confirm(`Clear all spotlight pins for ${spotlightDate}? The carousel will use the automatic fallback.`)) return;
    clearTimeout(autoSaveTimer.current);
    await fetch(`/api/spotlight?date=${spotlightDate}`, { method: 'DELETE', headers });
    setSpotlightPins([]);
    autoSaveRollback.current = null;
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
    // DnD pin operations
    insertPin,
    reorderPins,
    removePin,
    MAX_PINS,
  };
}
