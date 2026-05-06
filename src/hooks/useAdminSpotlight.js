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
  // ── Explicit-save mode (May 5, 2026, item #2 of the spotlight safety pass) ──
  // Previously: commitPins debounced a POST 300ms after every mutation, which
  // meant opening a date and accidentally bumping anything overwrote yesterday's
  // curation with no confirmation. The wholesale DELETE+INSERT shape of the
  // POST handler made this a destructive operation with no audit trail.
  //
  // Now: mutations only update local state. `pristinePins` / `pristineSources`
  // track the last server-confirmed shape (set on fetch + after a successful
  // save). The hook exposes `spotlightDirty` and `saveSpotlightChanges()`;
  // the admin UI renders an explicit Save button and a Discard button.
  const pristinePins = useRef([]);
  const pristineSources = useRef({});
  const [savingPins, setSavingPins] = useState(false);

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
  // ISO timestamp of the most recent manual pin's created_at for the
  // currently-loaded date. Used by AdminSpotlightTab to show a "Last
  // curated: <relative time>" indicator (May 5, 2026) so admins can see
  // when prior curation exists before accidentally overwriting it.
  // Null when the date has no manual pins.
  const [spotlightLastCuratedAt, setSpotlightLastCuratedAt] = useState(null);
  const [spotlightEvents, setSpotlightEvents] = useState([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [spotlightImageWarning, setSpotlightImageWarning] = useState(null);
  // Surfaces a refusal message when the ☆ star button can't stage an event
  // (Main Spotlight has empty slots, OR all 8 slots are full). Cleared after
  // a successful stage. Rendered as a banner in AdminSpotlightTab.
  const [spotlightStagingError, setSpotlightStagingError] = useState(null);
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
    let lastCurated = null;
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
        // Reduce the manual pins' pin_created_at values to the latest. Only
        // manual pins carry the field (autopilot suggestions don't have a
        // row in spotlight_events yet). Older API deploys won't return the
        // field at all — null falls through and the indicator just hides.
        const manualTimes = data
          .filter(d => d.source === 'manual' && d.pin_created_at)
          .map(d => d.pin_created_at);
        if (manualTimes.length > 0) {
          lastCurated = manualTimes.reduce((a, b) => (a > b ? a : b));
        }
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
    const cleanSources = Object.fromEntries(
      cleanPins.map(id => [id, sourceMap[id] || 'manual'])
    );
    setSpotlightSources(cleanSources);
    setSpotlightLastCuratedAt(lastCurated);
    // Seed the pristine refs so spotlightDirty is correctly false right
    // after a fresh load — a date toggle should NOT count as unsaved
    // changes. Only manual pins count toward the dirty diff (autopilot
    // suggestions in unpinned slots are not "owned" by the admin yet).
    pristinePins.current = cleanPins.filter(id => cleanSources[id] === 'manual');
    pristineSources.current = Object.fromEntries(
      Object.entries(cleanSources).filter(([, src]) => src === 'manual')
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

  // ── Stage-only commitPins (May 5, 2026 explicit-save refactor) ──────────
  // Replaces the prior 300ms-debounced auto-save. Mutations now update
  // local state ONLY — the POST happens explicitly via saveSpotlightChanges
  // when the admin clicks Save. The "promote on touch" semantics still
  // apply (any mutation flips a touched pin's source to 'manual') so the
  // visual DRAFT-vs-solid distinction matches what WILL persist on save.
  const commitPins = useCallback((nextPins) => {
    setSpotlightPins(nextPins);
    setSpotlightSources(prev => {
      const next = {};
      for (const id of nextPins) next[id] = 'manual';
      // Cheap short-circuit for reorder-only — same set of IDs, same sources.
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
  }, []);

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
   * Star-button: APPEND-TO-NEXT-OPEN-SLOT semantics (Apr 29, 2026).
   *
   * If already pinned → unpin (toggle off).
   *
   * If a new pin: appended to the end of the dense list, landing in the
   * first available slot. Fills Main (slots 0–4) before Runner-Ups (5–7),
   * because the data model is a dense array — slot index = list position.
   *
   * Refusal: if all 8 slots are full, surface a banner and return prev
   * unchanged. Admin must clear or promote a slot before staging another.
   *
   * History: Apr 28, 2026 introduced a stricter "stage-to-Runner-Ups only"
   * rule that refused when Main had any empty slot, on the theory that ☆
   * should never publish directly to Main. In practice this blocked the
   * common triage workflow ("I want to stage 8 candidates while I'm
   * browsing, I'll sort them into Main later"), so it was rolled back to
   * the simpler "fill next open slot" rule. Drag-to-slot is still the
   * deliberate way to place an event at a specific position; ☆ is the
   * fast path for "good enough — put it on the list."
   */
  const toggleSpotlightPin = useCallback((eventId) => {
    setSpotlightPins(prev => {
      // Already pinned → unpin (toggle off)
      if (prev.includes(eventId)) {
        const next = prev.filter(id => id !== eventId);
        setSpotlightStagingError(null);
        commitPins(next);
        return next;
      }

      // All 8 slots full — refuse with a banner.
      if (prev.length >= MAX_PINS) {
        setSpotlightStagingError(
          `All 8 spotlight slots are full. Clear or promote a slot before staging another.`
        );
        return prev;
      }

      // Append to the end of the dense list → first available slot.
      setSpotlightStagingError(null);
      const next = [...prev, eventId];
      commitPins(next);
      return next;
    });
  }, [commitPins]);

  // ── Save / Discard / Clear (May 5, 2026 explicit-save refactor) ─────────
  // saveSpotlight is the explicit Save button's handler. Returns
  // { success: true } on success or { success: false, error } on failure
  // so callers can render their own toast/banner.
  const saveSpotlight = async () => {
    const targetDate = spotlightDate;
    const validPins = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id));
    setSavingPins(true);
    try {
      setSpotlightPins(validPins);
      const res = await fetch('/api/spotlight', {
        method: 'POST',
        headers,
        body: JSON.stringify({ date: targetDate, event_ids: validPins }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || res.statusText };
      }
      // Promote every saved pin to 'manual' (matches what the next GET will
      // return) so DRAFT badges clear on save.
      const allManualSources = Object.fromEntries(validPins.map(id => [id, 'manual']));
      setSpotlightSources(allManualSources);
      // Update pristine refs to the just-saved state so spotlightDirty
      // flips back to false. Updated_at would be ideal here but the table
      // doesn't have one yet (item #3 of this safety pass).
      pristinePins.current = [...validPins];
      pristineSources.current = { ...allManualSources };
      // Bump the last-curated timestamp to now so the indicator reflects
      // the just-saved state without waiting for a refetch.
      setSpotlightLastCuratedAt(new Date().toISOString());
      // Deliberately do NOT call `fetchAll()` — see note above `commitPins`.
      // The candidate-event list is refreshed via `fetchSpotlightEvents`,
      // which does NOT touch the admin page's global `loading` state.
      fetchSpotlightEvents(spotlightDate);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSavingPins(false);
    }
  };

  // discardSpotlightChanges resets pins/sources back to the last
  // server-confirmed state. No network call.
  const discardSpotlightChanges = useCallback(() => {
    setSpotlightPins([...pristinePins.current]);
    setSpotlightSources({ ...pristineSources.current });
    setSpotlightStagingError(null);
  }, []);

  // ── History panel state (May 5, 2026 — item #3 of safety pass) ──────────
  // Recent saves for the currently-loaded date. Each entry has
  // { id, saved_at, previous: [{id, title}], next: [{id, title}] }.
  // Loaded on demand via fetchSpotlightHistory; used by the UI's
  // "Recent changes" panel to surface revert candidates.
  const [spotlightHistory, setSpotlightHistory] = useState([]);
  const [spotlightHistoryLoading, setSpotlightHistoryLoading] = useState(false);

  const fetchSpotlightHistory = useCallback(async (date) => {
    setSpotlightHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/admin/spotlight-history?date=${encodeURIComponent(date)}&limit=10`,
        { headers }
      );
      if (!res.ok) {
        setSpotlightHistory([]);
        return;
      }
      const data = await res.json();
      setSpotlightHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load spotlight history:', err);
      setSpotlightHistory([]);
    } finally {
      setSpotlightHistoryLoading(false);
    }
  }, [headers]);

  // revertSpotlightToHistory stages a prior pin set as the current draft.
  // Caller is the admin UI; this does NOT auto-save — the admin must click
  // Save Changes to commit the revert (which itself writes a NEW history
  // row, so reverts are themselves auditable).
  const revertSpotlightToHistory = useCallback((eventIds) => {
    if (!Array.isArray(eventIds)) return;
    setSpotlightPins(eventIds);
    setSpotlightSources(Object.fromEntries(eventIds.map(id => [id, 'manual'])));
    setSpotlightStagingError(null);
  }, []);

  const clearSpotlight = async () => {
    if (!confirm(`Clear all spotlight pins for ${spotlightDate}? The carousel will use the automatic fallback.`)) return;
    await fetch(`/api/spotlight?date=${spotlightDate}`, { method: 'DELETE', headers });
    setSpotlightPins([]);
    setSpotlightSources({});
    pristinePins.current = [];
    pristineSources.current = {};
    setSpotlightLastCuratedAt(null);
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

  // ── Dirty derivation (May 5, 2026 explicit-save refactor) ──────────────
  // Compare the live pins/sources against the last server-confirmed
  // pristine refs. Treats reorder as dirty (sort_order persists too).
  // Length mismatch → dirty. Same length, any-position mismatch → dirty.
  // Source flip on any pin → dirty.
  const arraysEqualOrdered = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const sourcesEqual = (a, b) => {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => a[k] === b[k]);
  };
  // Only manual pins count toward dirty — autopilot suggestions in
  // unpinned-by-admin slots are not "owned" yet, so navigating onto a
  // date with autopilot suggestions doesn't trigger a dirty state.
  const liveManualPins = spotlightPins.filter(id => spotlightSources[id] === 'manual');
  const liveManualSources = Object.fromEntries(
    Object.entries(spotlightSources).filter(([, src]) => src === 'manual')
  );
  const spotlightDirty =
    !arraysEqualOrdered(liveManualPins, pristinePins.current) ||
    !sourcesEqual(liveManualSources, pristineSources.current);

  return {
    spotlightDate, setSpotlightDate,
    spotlightPins, setSpotlightPins,
    // Projected Spotlight — parallel source map: { id: 'manual' | 'suggested' }
    spotlightSources,
    // ISO timestamp of the most recent manual pin's created_at for the
    // currently-loaded date. Null when no manual pins.
    spotlightLastCuratedAt,
    // Explicit-save state (May 5, 2026): spotlightDirty is true when
    // the live pin set differs from the last server-confirmed state.
    // savingPins is true while a Save POST is in flight.
    spotlightDirty,
    savingPins,
    discardSpotlightChanges,
    // History / revert (May 5, 2026 — item #3)
    spotlightHistory,
    spotlightHistoryLoading,
    fetchSpotlightHistory,
    revertSpotlightToHistory,
    spotlightEvents, setSpotlightEvents,
    spotlightLoading,
    spotlightImageWarning, setSpotlightImageWarning,
    // Refusal banner state for the ☆ star (stage-to-runner-ups semantics)
    spotlightStagingError, setSpotlightStagingError,
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
