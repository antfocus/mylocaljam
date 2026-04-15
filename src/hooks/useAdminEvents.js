'use client';

import { useState, useCallback } from 'react';

/**
 * Merge two event arrays into a single array with no duplicate `id` values,
 * preserving the ORDER of the incoming array (fresh server data wins). If
 * the same id appears in both, the incoming row replaces the stale one so
 * server-side edits (category changes, triage flips, etc.) stay visible.
 *
 * This is the client-side twin of the admin GET's row-multiplication guard.
 * Together they guarantee: 1 DB row = 1 array slot, no matter how many times
 * fetchEvents races, re-mounts, or double-pages.
 */
function mergeEventsById(existing, incoming) {
  const byId = new Map();
  // Seed with existing rows so prior pages survive an append…
  for (const ev of existing) {
    if (ev?.id) byId.set(ev.id, ev);
  }
  // …then let the incoming page overwrite on id collision (freshness wins).
  for (const ev of incoming) {
    if (ev?.id) byId.set(ev.id, ev);
  }
  // Return in insertion order: existing rows first (for pagination append),
  // then any genuinely new incoming rows. For page === 1 callers pass [] as
  // `existing`, so this collapses to "incoming, deduped by id."
  return Array.from(byId.values());
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

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
        // ── Strict idempotency guarantee ──────────────────────────────────
        // page === 1: replace with a deduped snapshot (guards double-mount /
        //             StrictMode / quick filter toggles firing two fetches).
        // page >  1: merge by id (guards the "same page fetched twice"
        //             race where React re-runs an effect before the first
        //             response lands and both pages append the same rows).
        // Result: the list NEVER contains two rows with the same id, so
        // React's reconciliation key warning can't fire and the "4 Skinny
        // Amigos" ghost cannot reappear from client-side state drift.
        setEvents(prev =>
          page === 1
            ? dedupeById(data.events)
            : mergeEventsById(prev, data.events)
        );
        setEventsPage(data.pagination.page);
        setEventsTotalPages(data.pagination.totalPages);
        setEventsTotal(data.pagination.total);
      } else {
        setEvents(dedupeById(Array.isArray(data) ? data : []));
      }
      if (data.newEvents24h !== undefined) setNewEvents24h(data.newEvents24h);
    } catch (err) { console.error(err); }
  }, [password, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime, eventsRecentlyAdded]);

  // NOTE: `toggleFeatured` retired Phase 5 — Spotlight curation now lives
  // exclusively in the `spotlight_events` table (see AdminSpotlightTab /
  // useAdminSpotlight). The event-row "feature" toggle was dead code as of
  // Phase 1 (no UI caller) and is removed here along with its is_featured
  // writer.

  const updateEventCategory = async (ev, newCategory) => {
    const prev = events;
    // G Spot §Verified Flip — a manual dropdown change locks the row from
    // future AI rewrites. `is_category_verified=true` is the sacrosanct flag
    // that auto-categorize checks as its first safety gate.
    setEvents(p => p.map(e => e.id === ev.id ? {
      ...e,
      category: newCategory,
      triage_status: 'reviewed',
      is_category_verified: true,
      category_source: 'manual',
      category_ai_flagged_at: null,
    } : e));
    try {
      const body = {
        id: ev.id,
        category: newCategory,
        triage_status: 'reviewed',
        is_category_verified: true,
        category_source: 'manual',
        category_ai_flagged_at: null,
      };
      if (newCategory !== 'Live Music') {
        body.artist_bio = null;
        body.artist_id = null;
      }
      const res = await fetch('/api/admin', { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showQueueToast(`Re-categorized → ${newCategory} · Verified \u2705`);
    } catch (err) {
      console.error('Category update failed:', err);
      setEvents(prev);
    }
  };

  /**
   * Run the G Spot AI categorization over the currently-selected events.
   * The server-side route handles safety gates (verified + template skips)
   * and confidence gating. Optimistic UI just shows a toast — results
   * trigger a fetchEvents() to pick up the writes.
   */
  const runAICategorize = async (eventIds) => {
    if (!Array.isArray(eventIds) || eventIds.length === 0) return null;
    try {
      const res = await fetch('/api/admin/auto-categorize', {
        method: 'POST',
        headers,
        body: JSON.stringify({ eventIds }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const summary = await res.json();
      const parts = [];
      if (summary.updated) parts.push(summary.updated + ' updated');
      if (summary.flagged) parts.push(summary.flagged + ' flagged');
      if (summary.skipped_verified) parts.push(summary.skipped_verified + ' verified-skip');
      if (summary.skipped_template) parts.push(summary.skipped_template + ' template-skip');
      if (summary.failed) parts.push(summary.failed + ' failed');
      showQueueToast('\uD83E\uDD16 AI Categorize: ' + (parts.join(' · ') || 'no-op'));
      return summary;
    } catch (err) {
      console.error('AI categorize failed:', err);
      showQueueToast({ type: 'error', msg: 'AI categorize failed: ' + err.message });
      return null;
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
    updateEventCategory,
    runAICategorize,
    CATEGORY_OPTIONS,
  };
}
