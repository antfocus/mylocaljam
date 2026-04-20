'use client';

import { useState, useCallback, useRef } from 'react';

const MAX_PINS = 8; // 5 main spotlight + 3 runner-ups

// NOTE: intentionally does NOT depend on the parent's `fetchAll`. Calling
// `fetchAll()` after an auto-save causes the admin page's global `loading`
// flag to flip, which unmounts the entire spotlight tab and produces a
// ~1s "black screen blink" after every drop. After a pin mutation we do
// NOT need to refetch global admin state — the pin list is already correct
// locally (optimistic update), and the candidate event list is unaffected.
// The public hero is invalidated server-side via `revalidatePath` in the
// /api/spotlight POST handler, so visitors see the change without us
// refetching anything client-side.
export default function useAdminSpotlight({ password }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };
  // Ref-based debounce for auto-save — cleared on every new pin mutation
  // so rapid reorders collapse into a single POST.
  const autoSaveTimer = useRef(null);
  const autoSaveRollback = useRef(null);
  // Parallel rollback for the sources map — restored alongside the pin
  // list if the auto-save POST fails, so a failed save can't leave us
  // with a pins/sources mismatch (e.g. a DRAFT card showing solid).
  const autoSaveSourcesRollback = useRef(null);

  const [spotlightDate, setSpotlightDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [spotlightPins, setSpotlightPins] = useState([]);
  // ── Projected Spotlight — source tracking ───────────────────────────────
  // Map of { [event_id]: 'manual' | 'suggested' } that shadows `spotlightPins`.
  // Populated from the /api/spotlight GET response. Any mutation through
  // `commitPins` flips every current pin to 'manual' (auto-promote on touch),
  // because every save persists to the `spotlight_events` table — which has
  // no concept of a "draft" row, so after the POST they are all manual by
  // definition. The admin UI uses this to render dashed DRAFT cards for
  // suggested autopilot picks vs solid cards for manual pins.
  const [spotlightSources, setSpotlightSources] = useState({});
  const [spotlightEvents, setSpotlightEvents] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [spotlightImageWarning, setSpotlightImageWarning] = useState(null);
  const [spotlightSearch, setSpotlightSearch] = useState('');
  // Magic Wand — bulk AI enrichment for the currently-selected date.
  // `enriching` drives the button spinner; `lastEnrichResult` is the
  // server's response object (totals + errors) for the toast banner.
  const [enriching, setEnriching] = useState(false);
  const [lastEnrichResult, setLastEnrichResult] = useState(null);

  // Single-Event Magic Wand — per-card quick-action state.
  //
  //   • `enrichingEventIds` — a Set of event ids with an in-flight
  //     single-event POST. Rendered in the UI as a spinner overlaid on
  //     the ✨ button for that specific card so the operator knows which
  //     row is currently being processed. Set-valued (not a boolean)
  //     because multiple cards can be enriched in parallel — each click
  //     is independent.
  //
  //   • `singleEnrichErrors` — a plain object ({ [eventId]: 'msg' })
  //     that surfaces the most recent failure for a given card. Auto-
  //     cleared after 6s via setTimeout so a long-past error doesn't
  //     linger indefinitely, and cleared immediately when the user
  //     re-clicks ✨ on that card. Not a Map because we want cheap
  //     object-spread updates in React state without referencing a
  //     hoisted helper.
  const [enrichingEventIds, setEnrichingEventIds] = useState(() => new Set());
  const [singleEnrichErrors, setSingleEnrichErrors] = useState({});

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
    let sourceMap = {};
    try {
      const res = await fetch(`/api/spotlight?date=${date}&all_pins=true`, { signal: controller.signal });
      const data = await res.json();
      if (Array.isArray(data)) {
        pinIds = data.map(d => d.event_id);
        // Build the parallel source map so the UI can paint DRAFT cards for
        // autopilot picks without re-fetching. The API defaults to 'manual'
        // when absent (older deploys) — safe fallback keeps the old UX.
        sourceMap = Object.fromEntries(
          data.map(d => [d.event_id, d.source || 'manual'])
        );
      }
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
    // Project only the sources that survived the validEventIds filter so
    // `spotlightSources` never carries a ghost key for an event that isn't
    // actually tonight's.
    setSpotlightSources(
      Object.fromEntries(cleanPins.map(id => [id, sourceMap[id] || 'manual']))
    );

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
    // Stash the sources rollback at the same gate so both refs move in
    // lockstep — without this, a rolled-back pin list could pair with a
    // post-promotion sources map and show solid cards for events that
    // were actually still drafts.
    setSpotlightSources(prev => {
      if (!autoSaveSourcesRollback.current) autoSaveSourcesRollback.current = prev;
      return prev;
    });

    // ── Promote-on-touch ─────────────────────────────────────────────────
    // Any mutation — drag, reorder, remove, star — means the admin has
    // taken ownership of the slate. We flip every pin in the new list to
    // 'manual' so the DRAFT visuals disappear immediately (optimistic).
    // This matches reality: the impending POST persists all IDs into
    // `spotlight_events`, which the GET will then return as 'manual' on
    // the next fetch anyway. Doing it optimistically here avoids a round-
    // trip blink where the card re-paints from dashed → solid after save.
    setSpotlightSources(prev => {
      const next = {};
      for (const id of nextPins) next[id] = 'manual';
      // If the pin set didn't actually change identity-wise we can keep
      // the previous object reference — cheap short-circuit for the
      // common "reorder only" path where the set of IDs is identical.
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every(k => next[k] === prev[k])
      ) {
        return prev;
      }
      return next;
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
        // Success — clear rollback.
        //
        // IMPORTANT: we deliberately do NOT call the parent's `fetchAll()`
        // here. Doing so flipped the admin page's global `loading` flag,
        // which unmounted the spotlight tab (it's gated behind
        // `activeTab === 'spotlight' && !loading` in admin/page.js) and
        // produced a ~1s black-screen blink after every drop. The public
        // hero gets invalidated server-side via `revalidatePath` in the
        // POST handler, and our local state is already correct, so there's
        // nothing to refetch client-side.
        autoSaveRollback.current = null;
        autoSaveSourcesRollback.current = null;
      } catch (err) {
        console.error('Auto-save failed, rolling back:', err);
        // Restore the last server-confirmed pin state AND the matching
        // source map so the DRAFT badges reappear on the pins that had
        // them before the user's failed attempt.
        if (autoSaveRollback.current) {
          setSpotlightPins(autoSaveRollback.current);
        }
        if (autoSaveSourcesRollback.current) {
          setSpotlightSources(autoSaveSourcesRollback.current);
        }
        autoSaveRollback.current = null;
        autoSaveSourcesRollback.current = null;
      }
    }, 300);
  }, [spotlightDate, headers]);

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
   * Star-button: if unpinned → insert in chronological order by start_time.
   * If already pinned → unpin. After inserting, the full pin list is re-sorted
   * chronologically so the Spotlight lineup always reads earliest → latest.
   */
  const toggleSpotlightPin = useCallback((eventId) => {
    setSpotlightPins(prev => {
      if (prev.includes(eventId)) {
        const next = prev.filter(id => id !== eventId);
        commitPins(next);
        return next;
      }
      // Build a lookup of event start times for chronological sorting
      const evMap = {};
      for (const e of spotlightEvents) evMap[e.id] = e;
      const getTime = (id) => {
        const ev = evMap[id];
        if (!ev) return '99:99';
        // Prefer template start_time → event start_time
        const t = ev.event_templates?.start_time || ev.start_time || ev.event_time || '99:99';
        return t === '00:00' || t === '00:00:00' ? '99:99' : t; // midnight = unresolved, sort last
      };
      // Add the new event and sort the full list chronologically
      const merged = [...prev, eventId];
      merged.sort((a, b) => getTime(a).localeCompare(getTime(b)));
      const next = merged.slice(0, MAX_PINS);
      commitPins(next);
      return next;
    });
  }, [commitPins, spotlightEvents]);

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
    // Manual save explicitly commits the current slate → every pin is
    // manual from here on. Mirror the promote-on-touch logic from
    // `commitPins` so the DRAFT badges don't linger after Save.
    setSpotlightSources(Object.fromEntries(validPins.map(id => [id, 'manual'])));
    autoSaveRollback.current = null;
    autoSaveSourcesRollback.current = null;
    // Deliberately do NOT call `fetchAll()` — see note above `commitPins`.
    // The candidate-event list is refreshed via `fetchSpotlightEvents`,
    // which does NOT touch the admin page's global `loading` state.
    fetchSpotlightEvents(spotlightDate);
  };

  const clearSpotlight = async () => {
    if (!confirm(`Clear all spotlight pins for ${spotlightDate}? The carousel will use the automatic fallback.`)) return;
    clearTimeout(autoSaveTimer.current);
    await fetch(`/api/spotlight?date=${spotlightDate}`, { method: 'DELETE', headers });
    setSpotlightPins([]);
    setSpotlightSources({});
    autoSaveRollback.current = null;
    autoSaveSourcesRollback.current = null;
  };

  // ── Magic Wand — bulk AI enrichment for the current spotlightDate ────
  // POSTs to /api/admin/enrich-date which walks every published event on
  // the target date, filters to those missing bio/image (and not locked),
  // runs the enrichArtist waterfall (MusicBrainz → Discogs → Last.fm →
  // Perplexity AI fallback), writes bio/image back to the events table,
  // and flips `events.is_human_edited = true` so the next scraper cron
  // can't re-clobber. After the call, refreshes the candidate-event list
  // so the admin immediately sees the filled traffic-light dots.
  const enrichCurrentDate = useCallback(async () => {
    if (enriching) return;
    setEnriching(true);
    setLastEnrichResult(null);
    try {
      const res = await fetch('/api/admin/enrich-date', {
        method: 'POST',
        headers,
        body: JSON.stringify({ date: spotlightDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        setLastEnrichResult({ ok: false, error: msg });
        console.error('Magic Wand enrichment failed:', msg);
        return;
      }
      setLastEnrichResult({ ok: true, ...data });
      // Refresh the candidate list so newly-filled bios/images light up
      // the green dots immediately. Does NOT touch the admin page's
      // global `loading` flag — safe from the black-screen-blink issue.
      fetchSpotlightEvents(spotlightDate);
    } catch (err) {
      console.error('Magic Wand enrichment error:', err);
      setLastEnrichResult({ ok: false, error: err?.message || 'Network error' });
    } finally {
      setEnriching(false);
    }
  }, [enriching, spotlightDate, headers, fetchSpotlightEvents]);

  // ── Single-Event Magic Wand (✨ button on an individual card) ─────────
  // POSTs to /api/admin/enrich-date with `{ eventId }` instead of `{ date }`.
  // The backend takes the single-event branch, skipping the day-bounds
  // fetch and processing ONLY that row, while honoring the same Smart Fill
  // rules (blank-only writes, never touch event_title/event_date, respect
  // the Classification Fork via aiLookupArtist) as the bulk path.
  //
  // Why we don't reuse enrichCurrentDate: the bulk flow shows the banner
  // and sets lastEnrichResult, which is the right UX for a multi-event run.
  // A single-card click should be quiet — a spinner on that one button,
  // a silent refresh on success, a localized error tooltip on failure.
  // Touching the shared banner state from here would stomp on the banner
  // that's still showing the last bulk run's results.
  const enrichSingleEvent = useCallback(async (eventId) => {
    if (!eventId) return;

    // Functional update + early-return flag so we never double-fire when
    // the same button is clicked twice rapidly. Reading state directly
    // would be a stale-closure footgun; the updater's `prev` argument is
    // guaranteed fresh.
    let alreadyPending = false;
    setEnrichingEventIds(prev => {
      if (prev.has(eventId)) {
        alreadyPending = true;
        return prev;
      }
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
    if (alreadyPending) return;

    // Clear any previous error on this specific card — clicking ✨ again
    // is an intentional retry; the old error shouldn't persist past it.
    setSingleEnrichErrors(prev => {
      if (!(eventId in prev)) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });

    const popFromPending = () => {
      setEnrichingEventIds(prev => {
        if (!prev.has(eventId)) return prev;
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    };

    const recordError = (msg) => {
      setSingleEnrichErrors(prev => ({ ...prev, [eventId]: msg }));
      // Auto-fade the error after 6s so stale failures don't clutter the
      // UI. If the user re-clicks before then, the clear at the top of
      // the next call wipes it anyway.
      setTimeout(() => {
        setSingleEnrichErrors(prev => {
          if (prev[eventId] !== msg) return prev;
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
      }, 6000);
    };

    try {
      const res = await fetch('/api/admin/enrich-date', {
        method: 'POST',
        headers,
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const msg = data?.error || `HTTP ${res.status}`;
        console.error('Single-event Magic Wand failed:', msg);
        recordError(msg);
        return;
      }

      // Success — set a single-event-specific banner payload so the UI
      // can render an unambiguous message:
      //   • eventsUpdated > 0  → "Updated 1 event"
      //   • eventsUpdated = 0  → "No data found to update"
      // We reuse the same `lastEnrichResult` state the bulk flow uses
      // (the banner component already knows how to render it), but tag
      // it with `mode: 'single'` so the renderer can pick the short
      // single-event message instead of the full bulk stats line.
      setLastEnrichResult({
        ok: true,
        mode: 'single',
        eventId,
        ...data,
      });

      // Refresh the candidate event list so the traffic-light dot / bio /
      // image flips immediately without the admin having to click the
      // date picker or the bulk Auto-Fill button again. fetchSpotlightEvents
      // doesn't touch the admin page's global `loading` flag (see the
      // commitPins note at the top of this file), so no black-screen blink.
      //
      // We call this even on eventsUpdated === 0 so the UI re-syncs with
      // whatever the DB currently holds — defense-in-depth against an
      // out-of-band write by another admin tab between the click and the
      // refresh. Cheap (~1 round-trip, single-day filter) so the extra
      // call on a no-op is worth the invariant.
      await fetchSpotlightEvents(spotlightDate);
    } catch (err) {
      console.error('Single-event Magic Wand error:', err);
      recordError(err?.message || 'Network error');
    } finally {
      popFromPending();
    }
  }, [headers, fetchSpotlightEvents, spotlightDate]);

  return {
    spotlightDate, setSpotlightDate,
    spotlightPins, setSpotlightPins,
    // Projected Spotlight — parallel source map: { id: 'manual' | 'suggested' }
    spotlightSources,
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
    // Magic Wand
    enrichCurrentDate,
    enriching,
    lastEnrichResult,
    // Single-Event Magic Wand — per-card quick action
    enrichSingleEvent,
    enrichingEventIds,
    singleEnrichErrors,
  };
}
