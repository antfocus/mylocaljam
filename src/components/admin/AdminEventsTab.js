'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { formatDate, formatTime } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import Badge from '@/components/ui/Badge';
import { matchTemplate } from '@/lib/matchTemplate';

// ── Status options for the unified row dropdown ──────────────────────────
// Colors mirror the old Badge palette (published = green, draft/hidden = gray)
// so the row's visual weight doesn't jump when the status changes.
const STATUS_OPTIONS = [
  { value: 'published', label: 'Published', color: '#22c55e' },
  { value: 'draft',     label: 'Draft',     color: '#9CA3AF' },
  { value: 'hidden',    label: 'Hidden',    color: '#6B7280' },
];

// ── Searchable Template Picker ───────────────────────────────────────────
// Lightweight combobox: button trigger + absolute-positioned popover with
// a text input filter over `templateOptions`. Replaces the long native
// <select> in the "No Match" row state. No external libs.
//
// Mounting is still gated by the parent (only rendered for unlinked events
// with no matcher suggestion), so there's at most ~dozens of these active
// on screen even in the worst case.
function TemplatePicker({ templateOptions, templates, onPick, isMobile }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // Click-outside + Escape to close. Mount/unmount tied to `open` so the
  // listeners aren't live for every closed picker on the page.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    // Focus the search input on open for quick typing.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templateOptions;
    return templateOptions.filter(opt => opt.label.toLowerCase().includes(q));
  }, [query, templateOptions]);

  const handlePick = (optId) => {
    const t = (templates || []).find(x => x.id === optId);
    if (!t) return;
    setOpen(false);
    setQuery('');
    onPick(t);
  };

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-[11px] font-display font-semibold rounded-lg px-2 py-1"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontFamily: "'DM Sans', sans-serif",
          maxWidth: isMobile ? '140px' : '190px',
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {'\u2014 Link Template \u2014'}
        </span>
        <span aria-hidden="true" style={{ fontSize: '8px', opacity: 0.7 }}>▼</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: isMobile ? '200px' : '240px',
            maxWidth: '320px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '6px',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="w-full text-[11px] rounded px-2 py-1"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
              marginBottom: '4px',
            }}
          />
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                No matches
              </div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  onClick={() => handlePick(opt.id)}
                  className="w-full text-left text-[11px] rounded"
                  style={{
                    display: 'block', width: '100%',
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminEventsTab({
  events, artists, venues,
  templates = [],
  eventsSearch, setEventsSearch, eventsStatusFilter, setEventsStatusFilter,
  eventsMissingTime, setEventsMissingTime,
  eventsMissingImage, setEventsMissingImage,
  eventsSortField, setEventsSortField, eventsSortOrder, setEventsSortOrder,
  eventsPage, setEventsPage, eventsTotalPages, eventsTotal,
  newEvents24h, eventsRecentlyAdded, setEventsRecentlyAdded,
  selectedEvents, setSelectedEvents, setEvents,
  fetchEvents, deleteEvent, unpublishEvent, updateEventCategory, runAICategorize,
  setEditingEvent, setShowEventForm, setBulkTimeModal, setBulkTime,
  isMobile, showQueueToast, CATEGORY_OPTIONS,
  password,
  // Magic Wand: cross-tab handoff for "Create Template from Event"
  setActiveTab, setEditingTemplate, setTemplateForm,
  // Festival props (consolidated from sidebar)
  festivalData = [], festivalSearch = '', setFestivalSearch,
  editingFestival, setEditingFestival, fetchFestivalNames,
}) {
  const headers = { Authorization: 'Bearer ' + password };
  const [aiCategorizeLoading, setAiCategorizeLoading] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // ── Template matcher dry-run wiring ───────────────────────────────────
  // Two lookup tables, both memoised so we don't recompute per row:
  //
  //   templatesById      — O(1) resolve of `ev.template_id` → template row
  //                        (used to render the solid-green "Linked" badge
  //                         with the bound template's name).
  //   matchByEventId     — O(1) lookup of the matchmaker's suggestion for
  //                        every event currently in memory. `null` means
  //                        no match → renders the gray "No Match" text.
  //
  // Recompute keys: `events` and `templates`. Filtering/pagination creates
  // new event arrays, but the underlying objects' identities hold, so the
  // inner map work is cheap even on a 500-event page.
  const templatesById = useMemo(() => {
    const m = new Map();
    for (const t of templates || []) if (t?.id) m.set(t.id, t);
    return m;
  }, [templates]);

  const matchByEventId = useMemo(() => {
    const m = new Map();
    for (const ev of events || []) {
      // Skip events already linked — we don't need a suggestion for them.
      if (ev.template_id) continue;
      m.set(ev.id, matchTemplate(
        { title: ev.event_title || ev.artist_name, venue_id: ev.venue_id },
        templates,
      ));
    }
    return m;
  }, [events, templates]);

  // Pre-computed options for the per-row "Link Template" dropdown rendered
  // in the No-Match slot. Relies on the API's ORDER BY template_name; we
  // just project each row to {id,label} so every dropdown renders the
  // same compact array, and React reconciliation stays cheap across the
  // 1,800+ event feed.
  const templateOptions = useMemo(() => {
    return (templates || [])
      .filter(t => t?.id && t.template_name)
      .map(t => ({ id: t.id, label: t.template_name }));
  }, [templates]);

  // Confirm a suggested match → PUT /api/admin { id, template_id } + optimistic update.
  // Rolls back on failure so the UI never lies about DB state.
  const confirmTemplateMatch = async (ev, templateId, templateName) => {
    if (!ev?.id || !templateId) return;
    const prevEvents = events;
    setEvents(list => list.map(e => e.id === ev.id ? { ...e, template_id: templateId } : e));
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: ev.id, template_id: templateId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showQueueToast(`\uD83D\uDD17 Linked "${ev.event_title || ev.artist_name}" \u2192 ${templateName}`);
    } catch (err) {
      console.error('Template link failed:', err);
      setEvents(prevEvents);
      alert(`Link failed: ${err.message}`);
    }
  };

  // Unlink a template binding → PUT /api/admin { id, template_id: null }.
  // Inverse of confirmTemplateMatch; same optimistic-then-rollback contract.
  // After unlinking, the ladder drops back to raw scraper data on the next
  // render and the row's No-Match branch (TemplatePicker + Magic Wand) becomes
  // reachable again, so the admin can immediately re-link or re-template.
  const handleUnlinkTemplate = async (ev) => {
    if (!ev?.id || !ev.template_id) return;
    if (typeof window !== 'undefined' && !window.confirm('Unlink this template?')) return;
    const prevEvents = events;
    setEvents(list => list.map(e => e.id === ev.id ? { ...e, template_id: null } : e));
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: ev.id, template_id: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showQueueToast(`\uD83D\uDD17\u274C Unlinked: ${ev.event_title || ev.artist_name || ''}`);
    } catch (err) {
      console.error('Template unlink failed:', err);
      setEvents(prevEvents);
      showQueueToast(`\u26A0\uFE0F Unlink failed: ${err.message}`);
    }
  };
        // Server-side filtering handles status/date — client filters by search text + missing time
        const searchLower = eventsSearch.trim().toLowerCase();
        let filtered = events;
        if (searchLower) {
          filtered = filtered.filter(ev => {
            const artist = (ev.artist_name || '').toLowerCase();
            const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
            return artist.includes(searchLower) || venue.includes(searchLower);
          });
        }
        // Missing time filter is now server-side via ?missingTime=true

  // ── Magic Wand: Create Template from Event ────────────────────────────
  // Pre-fills the Template Editor with the event's current values and
  // switches the admin to the Templates tab. No DB writes here — the
  // admin still reviews and clicks Save in the editor panel.
  //
  // Alias source: uses `ev.event_title` as-is per design. If the event is
  // already linked, this is the clean template name and produces a
  // harmless duplicate alias; unlinked events yield the raw scraper title,
  // which is what we want so the next sync matches this template cleanly.
  // Drop candidate data that is either empty OR a verbatim echo of the event
  // title — prevents the Wand from seeding the Template Editor with a bio that
  // is really just the scraper title (which would then "poison" the admin's
  // override via the existing custom_bio-first Golden Ladder). Case-insensitive,
  // whitespace-tolerant; falls through to empty string otherwise.
  const sanitizeForTemplate = (value, rawTitle) => {
    if (!value) return '';
    const v = String(value).trim();
    if (!v) return '';
    const t = String(rawTitle || '').trim();
    if (t && v.toLowerCase() === t.toLowerCase()) return '';
    return v;
  };

  const handleCreateTemplateFromEvent = (ev) => {
    if (!ev || !setActiveTab || !setEditingTemplate || !setTemplateForm) return;
    const rawTitle = ev.event_title || ev.name || '';
    const bioSource   = ev.custom_bio        || ev.description     || ev.artist_bio || '';
    const imageSource = ev.custom_image_url  || ev.event_image_url || ev.image_url  || '';
    setTemplateForm({
      template_name: rawTitle,                                              // editable — admin can trim scraper junk
      aliases: rawTitle,                                                    // guarantees match on next sync
      category: ev.category || 'Live Music',
      venue_id: ev.venue_id || '',
      bio: sanitizeForTemplate(bioSource, rawTitle),
      genres: '',
      vibes: '',
      image_url: sanitizeForTemplate(imageSource, rawTitle),
      start_time: ev.start_time || '',
      is_human_edited: {},
    });
    setEditingTemplate({ __new: true });
    setActiveTab('templates');
  };

  return (
        <div>
          {/* View tabs + Add Event */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'past', label: 'Past' },
                { key: 'hidden', label: 'Hidden' },
                { key: 'festivals', label: 'Festivals', count: festivalData.length },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => {
                    setEventsStatusFilter(seg.key);
                    setSelectedEvents(new Set());
                    setEventsRecentlyAdded(false);
                    if (seg.key === 'festivals') {
                      if (fetchFestivalNames) fetchFestivalNames();
                    } else {
                      setEvents([]);
                      fetchEvents(1, eventsSortField, eventsSortOrder, seg.key, eventsMissingTime, false);
                    }
                  }}
                  style={{
                    padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: eventsStatusFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: eventsStatusFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                    marginBottom: '-1px',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {seg.label}
                  {seg.count > 0 && (
                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontSize: '10px' }}>
                      {seg.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {eventsStatusFilter !== 'festivals' && (
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)', fontFamily: "'DM Sans', sans-serif" }}
              onClick={() => { setEditingEvent(null); setShowEventForm(true); }}
            >
              {Icons.plus} Add Event
            </button>
            )}
          </div>

          {/* ── Festivals Sub-View ──────────────────────────────────────────── */}
          {eventsStatusFilter === 'festivals' && (() => {
            const filteredFestivals = festivalSearch?.trim()
              ? festivalData.filter(f => f.name.toLowerCase().includes(festivalSearch.toLowerCase()))
              : festivalData;
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', margin: 0 }}>
                    Festivals &amp; Event Titles ({festivalData.length})
                  </h3>
                  <input
                    placeholder="Search festivals..."
                    value={festivalSearch}
                    onChange={e => setFestivalSearch(e.target.value)}
                    style={{
                      padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif",
                      width: '220px', outline: 'none',
                    }}
                  />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', fontFamily: "'DM Sans', sans-serif" }}>
                  Festival names come from the <code style={{ background: 'var(--bg-card)', padding: '1px 4px', borderRadius: '3px' }}>event_title</code> field on events. Renaming updates all linked events. Deleting clears the event_title (events are preserved).
                </p>
                {filteredFestivals.length === 0 && (
                  <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                    {festivalSearch ? 'No matching festivals.' : 'No festivals found.'}
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredFestivals.map(f => (
                    <div key={f.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {editingFestival?.name === f.name ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                value={editingFestival.newName}
                                onChange={e => setEditingFestival(prev => ({ ...prev, newName: e.target.value }))}
                                style={{
                                  flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                                  background: 'var(--bg-secondary)', border: '1px solid var(--accent)',
                                  color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                                }}
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                              />
                              <button
                                style={{
                                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                  background: '#E8722A', color: '#1C1917', border: 'none', cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                                onClick={async () => {
                                  const newName = editingFestival.newName.trim();
                                  if (!newName || newName === f.name) { setEditingFestival(null); return; }
                                  try {
                                    const res = await fetch('/api/admin', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                      body: JSON.stringify({ bulk_rename_festival: true, old_name: f.name, new_name: newName }),
                                    });
                                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                    setEditingFestival(null);
                                    fetchFestivalNames();
                                  } catch (err) { alert(`Rename failed: ${err.message}`); }
                                }}
                              >Save</button>
                              <button
                                style={{
                                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                                onClick={() => setEditingFestival(null)}
                              >Cancel</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{f.name}</span>
                              <span style={{
                                fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                                background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                                fontFamily: "'DM Sans', sans-serif",
                              }}>
                                {f.count} event{f.count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        {editingFestival?.name !== f.name && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              style={{
                                padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                background: 'none', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                              }}
                              onClick={() => setEditingFestival({ name: f.name, newName: f.name })}
                              title="Rename this festival across all events"
                            >Rename</button>
                            <button
                              style={{
                                padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444',
                                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                              }}
                              onClick={async () => {
                                if (!window.confirm(`Remove festival name "${f.name}" from ${f.count} event(s)? The events will remain but lose their festival tag.`)) return;
                                try {
                                  const res = await fetch('/api/admin', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                    body: JSON.stringify({ bulk_clear_festival: true, festival_name: f.name }),
                                  });
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  fetchFestivalNames();
                                } catch (err) { alert(`Delete failed: ${err.message}`); }
                              }}
                              title="Remove festival name from all events (events stay)"
                            >Delete</button>
                          </div>
                        )}
                      </div>
                      {/* Linked events preview */}
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {f.events.slice(0, 5).map(ev => (
                          <span key={ev.id} style={{
                            fontSize: '11px', padding: '3px 8px', borderRadius: '999px',
                            background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            {ev.artist_name} {ev.event_date ? `· ${new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}` : ''}
                          </span>
                        ))}
                        {f.events.length > 5 && (
                          <span style={{
                            fontSize: '11px', padding: '3px 8px', borderRadius: '999px',
                            background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                            fontFamily: "'DM Sans', sans-serif",
                          }}>+{f.events.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Events List (hidden when Festivals sub-tab is active) ───── */}
          {eventsStatusFilter !== 'festivals' && (<>
          {/* Search + Sort row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', marginBottom: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Search artist or venue..."
                value={eventsSearch}
                onChange={e => { setEventsSearch(e.target.value); setSelectedEvents(new Set()); }}
                style={{
                  width: '100%', padding: '9px 14px', paddingRight: eventsSearch ? '36px' : '14px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
                }}
              />
              {eventsSearch && (
                <button
                  onClick={() => { setEventsSearch(''); setSelectedEvents(new Set()); }}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Clear search"
                >✕</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => {
                  const next = !eventsRecentlyAdded;
                  setEventsRecentlyAdded(next);
                  if (next) { setEventsMissingTime(false); setEventsMissingImage(false); }
                  setEvents([]);
                  setSelectedEvents(new Set());
                  fetchEvents(1, next ? 'created_at' : eventsSortField, next ? 'desc' : eventsSortOrder, eventsStatusFilter, false, next, false);
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: eventsRecentlyAdded ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                  color: eventsRecentlyAdded ? '#3B82F6' : 'var(--text-muted)',
                  outline: eventsRecentlyAdded ? '1.5px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
                }}
              >
                New (24h)
              </button>
              <button
                onClick={() => {
                  const next = !eventsMissingTime;
                  setEventsMissingTime(next);
                  if (next) { setEventsRecentlyAdded(false); setEventsMissingImage(false); }
                  setEvents([]);
                  setSelectedEvents(new Set());
                  fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, next, false, false);
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: eventsMissingTime ? 'rgba(234,179,8,0.15)' : 'var(--bg-card)',
                  color: eventsMissingTime ? '#EAB308' : 'var(--text-muted)',
                  outline: eventsMissingTime ? '1.5px solid rgba(234,179,8,0.4)' : '1px solid var(--border)',
                }}
              >
                Missing Time
              </button>
              <button
                onClick={() => {
                  const next = !eventsMissingImage;
                  setEventsMissingImage(next);
                  if (next) { setEventsRecentlyAdded(false); setEventsMissingTime(false); }
                  setEvents([]);
                  setSelectedEvents(new Set());
                  fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, false, false, next);
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: eventsMissingImage ? 'rgba(234,179,8,0.15)' : 'var(--bg-card)',
                  color: eventsMissingImage ? '#EAB308' : 'var(--text-muted)',
                  outline: eventsMissingImage ? '1.5px solid rgba(234,179,8,0.4)' : '1px solid var(--border)',
                }}
              >
                Missing Image
              </button>
              <button
                onClick={() => {
                  const csvRows = [
                    ['Event ID', 'Artist Name', 'Event Title', 'Venue', 'Event Date', 'Start Time', 'Genre', 'Category', 'Cover', 'Status', 'Source URL', 'Created At'].join(','),
                    ...filtered.map(ev => {
                      const d = ev.event_date ? new Date(ev.event_date) : null;
                      const dateStr = d ? d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
                      const timeStr = d ? d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
                      const esc = (s) => `"${(s || '').replace(/"/g, '""')}"`;
                      return [
                        ev.id, esc(ev.artist_name), esc(ev.event_title), esc(ev.venue_name || ev.venues?.name),
                        dateStr, timeStr, esc(ev.genre), esc(ev.category), esc(ev.cover), ev.status,
                        esc(ev.source), ev.created_at ? new Date(ev.created_at).toISOString().slice(0, 10) : '',
                      ].join(',');
                    }),
                  ].join('\n');
                  const blob = new Blob([csvRows], { type: 'text/csv' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `events-export-${new Date().toISOString().slice(0, 10)}.csv`;
                  link.click();
                }}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                  whiteSpace: 'nowrap',
                  background: 'var(--bg-card)', color: 'var(--text-muted)',
                  outline: '1px solid var(--border)',
                }}
                title="Export filtered events to CSV"
              >
                ↓ CSV
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
                {filtered.length} events
              </span>
              <select
                value={`${eventsSortField}:${eventsSortOrder}`}
                onChange={e => {
                  const [field, order] = e.target.value.split(':');
                  setEventsSortField(field);
                  setEventsSortOrder(order);
                  setEvents([]);
                  fetchEvents(1, field, order, eventsStatusFilter, eventsMissingTime);
                }}
                style={{
                  padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", outline: 'none',
                }}
              >
                <option value="event_date:asc">Event Date (soonest)</option>
                <option value="event_date:desc">Event Date (latest)</option>
                <option value="updated_at:desc">Last Updated (newest)</option>
                <option value="updated_at:asc">Last Updated (oldest)</option>
                <option value="created_at:desc">Date Added (newest)</option>
                <option value="created_at:asc">Date Added (oldest)</option>
              </select>
            </div>
          </div>

          {/* Select-All + Bulk Actions */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px',
            borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '6px',
          }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedEvents.size === filtered.length}
              onChange={e => {
                if (e.target.checked) setSelectedEvents(new Set(filtered.map(ev => ev.id)));
                else setSelectedEvents(new Set());
              }}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A' }}
            />
            {selectedEvents.size > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#E8722A', fontFamily: "'DM Sans', sans-serif" }}>
                  {selectedEvents.size} selected
                </span>
                <button
                  onClick={() => setSelectedEvents(new Set())}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                    color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >Deselect All</button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => { setBulkTime(''); setBulkTimeModal(true); }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: 'rgba(232,114,42,0.12)', color: '#E8722A',
                    border: '1px solid rgba(232,114,42,0.3)', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor" /></svg>
                  Edit Time ({selectedEvents.size})
                </button>
                {/* AI Categorize — G Spot Protocol. Server-side route gates on
                    is_category_verified + template_id before spending LLM calls. */}
                <button
                  disabled={aiCategorizeLoading || typeof runAICategorize !== 'function'}
                  onClick={async () => {
                    const ids = Array.from(selectedEvents);
                    if (ids.length === 0) return;
                    setAiCategorizeLoading(true);
                    try {
                      const summary = await runAICategorize(ids);
                      // Refresh to pick up server writes (category + source + confidence).
                      if (summary) await fetchEvents(1);
                    } finally {
                      setAiCategorizeLoading(false);
                    }
                  }}
                  title="AI Categorize — skips verified + template-linked events. Low-confidence results flag for Manual Review."
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: aiCategorizeLoading ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.12)',
                    color: '#A855F7',
                    border: '1px solid rgba(168,85,247,0.35)',
                    cursor: aiCategorizeLoading ? 'wait' : 'pointer',
                    opacity: aiCategorizeLoading ? 0.7 : 1,
                    fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>{'\uD83E\uDD16'}</span>
                  {aiCategorizeLoading ? `Classifying ${selectedEvents.size}...` : `AI Categorize (${selectedEvents.size})`}
                </button>
                {/* Bulk Delete — hard delete matching the per-row trash-can
                    button. Loops DELETE /api/admin?id=X in parallel (the
                    same endpoint the single-event button uses) so we don't
                    need a new batch route. Optimistically removes rows from
                    local state; on any failure we refetch to resync. */}
                <button
                  disabled={bulkDeleteLoading}
                  onClick={async () => {
                    const ids = Array.from(selectedEvents);
                    if (ids.length === 0) return;
                    if (!confirm(`Permanently delete ${ids.length} event${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
                    setBulkDeleteLoading(true);
                    const prev = events;
                    // Optimistic removal
                    if (typeof setEvents === 'function') {
                      const idSet = new Set(ids);
                      setEvents(list => list.filter(e => !idSet.has(e.id)));
                    }
                    setSelectedEvents(new Set());
                    try {
                      const results = await Promise.allSettled(
                        ids.map(id =>
                          fetch(`/api/admin?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers })
                            .then(r => { if (!r.ok) throw new Error('delete_failed:' + id); return r; })
                        )
                      );
                      const failed = results.filter(r => r.status === 'rejected').length;
                      if (failed > 0) {
                        // Partial failure — refetch to get the true state back
                        if (typeof showQueueToast === 'function') {
                          showQueueToast({ type: 'error', msg: `${failed} of ${ids.length} deletes failed — refreshing list` });
                        }
                        await fetchEvents(1);
                      } else if (typeof showQueueToast === 'function') {
                        showQueueToast(`Deleted ${ids.length} event${ids.length !== 1 ? 's' : ''}`);
                      }
                    } catch (err) {
                      console.error('Bulk delete failed:', err);
                      // Rollback optimistic removal
                      if (typeof setEvents === 'function') setEvents(prev);
                      if (typeof showQueueToast === 'function') {
                        showQueueToast({ type: 'error', msg: 'Bulk delete failed — no changes applied' });
                      }
                    } finally {
                      setBulkDeleteLoading(false);
                    }
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    background: bulkDeleteLoading ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)',
                    cursor: bulkDeleteLoading ? 'wait' : 'pointer',
                    opacity: bulkDeleteLoading ? 0.7 : 1,
                    fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
                  {bulkDeleteLoading ? `Deleting ${selectedEvents.size}...` : `Delete (${selectedEvents.size})`}
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                Select events for bulk actions
              </span>
            )}
          </div>

          <div className="space-y-2">
            {filtered.map((ev) => {
              const isEvSelected = selectedEvents.has(ev.id);
              const catColor = CATEGORY_OPTIONS.find(c => c.key === (ev.category || 'Live Music'))?.color || '#666';
              const statusValue = ev.status || 'draft';
              const statusColor = STATUS_OPTIONS.find(s => s.value === statusValue)?.color || '#9CA3AF';
              return (
              <div key={ev.id} className="rounded-xl border" style={{
                background: isEvSelected ? 'rgba(232,114,42,0.04)' : 'var(--bg-card)',
                borderColor: isEvSelected ? '#E8722A44' : 'var(--border)',
                padding: '12px 14px',
                display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '8px' : '0',
              }}>
                {/* Top section: checkbox + event info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '14px', flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={isEvSelected}
                    onChange={e => {
                      setSelectedEvents(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(ev.id);
                        else next.delete(ev.id);
                        return next;
                      });
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-display font-bold" style={{ fontSize: isMobile ? '15px' : '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.artist_name}</span>
                      {/* AI-set category indicator — G Spot Protocol. Shows
                          when auto-categorize wrote this row's category. If
                          the admin later flips the dropdown, the Verified
                          Flip sets category_source='manual' and this icon
                          goes away. */}
                      {ev.category_source === 'ai' && !ev.is_category_verified && (
                        <span
                          title={`Set by AI${typeof ev.category_confidence === 'number' ? ` · ${Math.round(ev.category_confidence * 100)}% confidence` : ''} — change the category dropdown to verify.`}
                          style={{ fontSize: '12px', lineHeight: 1, flexShrink: 0, cursor: 'help' }}
                        >
                          {'\uD83E\uDD16'}
                        </span>
                      )}
                      {ev.category_ai_flagged_at && !ev.is_category_verified && (
                        <span
                          title="AI flagged this event for Manual Review (confidence below 0.85). Please pick a category."
                          style={{ fontSize: '11px', lineHeight: 1, flexShrink: 0, color: '#fbbf24', cursor: 'help' }}
                        >
                          {'\u26A0\uFE0F'}
                        </span>
                      )}
                      {ev.is_category_verified && (
                        <span
                          title="Category verified by admin"
                          style={{ fontSize: '11px', lineHeight: 1, flexShrink: 0, color: '#22c55e', cursor: 'help' }}
                        >
                          {'\u2705'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-brand-text-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.venue_name || ev.venues?.name} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}
                      </span>
                      {/* Source chain-link — relocated from the right-side action
                          cluster. Sits next to the time so the "source" feels
                          tethered to the venue/time context, matching the
                          Triage UI pattern. */}
                      {ev.source && /^https?:\/\//i.test(ev.source) && (
                        <a
                          href={ev.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="ml-2"
                          title={`Source: ${(() => { try { return new URL(ev.source).hostname; } catch { return 'link'; } })()}`}
                          style={{
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                        </a>
                      )}
                    </div>
                    {/* Timestamps — hidden on mobile */}
                    {!isMobile && (
                      <div className="text-[10px] mt-0.5 flex gap-3" style={{ color: 'var(--text-muted)' }}>
                        {ev.created_at && (
                          <span>Added {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        )}
                        {ev.updated_at && ev.updated_at !== ev.created_at && (
                          <span>Updated {new Date(ev.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action bar: badges + buttons */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0,
                  ...(isMobile ? { paddingLeft: '26px' } : {}),
                }}>
                  {/* ── Suggested Template / Linked / No Match badge ──────────
                     Dry-run output of matchTemplate.js. Three render paths:
                       - ev.template_id present → solid green "Linked: <name>"
                       - match found          → orange-bordered "Suggest: <name>" (clickable → confirm)
                       - null                 → subtle gray "No Match" text        */}
                  {(() => {
                    if (ev.template_id) {
                      const linked = templatesById.get(ev.template_id);
                      const label = linked?.template_name || 'Template linked';
                      // Actionable Linked badge: same green pill, but the whole
                      // thing is a button now. Click anywhere on it → confirm →
                      // handleUnlinkTemplate. Trailing × indicates removability.
                      return (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleUnlinkTemplate(ev); }}
                          title={`Linked to template: ${label} — click to unlink`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 8px', borderRadius: '999px',
                            background: '#22c55e', color: '#052e14',
                            border: 'none', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                            maxWidth: isMobile ? '160px' : '200px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          <span aria-hidden="true">{'\uD83D\uDD17'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Linked: {label}</span>
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '14px', height: '14px', borderRadius: '999px',
                              background: 'rgba(5,46,20,0.25)',
                              marginLeft: '2px', flexShrink: 0,
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </span>
                        </button>
                      );
                    }
                    const suggestion = matchByEventId.get(ev.id);
                    if (suggestion && suggestion.template) {
                      const t = suggestion.template;
                      const matchKindLabel = suggestion.matchType.replace('_', ' ');
                      return (
                        <button
                          type="button"
                          onClick={() => confirmTemplateMatch(ev, t.id, t.template_name)}
                          title={`Confirm match: ${t.template_name} (${matchKindLabel}). Click to set template_id.`}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 8px', borderRadius: '999px',
                            background: 'rgba(232,114,42,0.08)', color: '#E8722A',
                            border: '1px solid #E8722A',
                            cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                            maxWidth: isMobile ? '150px' : '200px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          <span aria-hidden="true">{'\u2728'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Suggest: {t.template_name}</span>
                        </button>
                      );
                    }
                    // ── No Match state ────────────────────────────────────
                    // Manual Template Picker + Magic Wand, side by side.
                    // Dropdown is only rendered when the event is unlinked AND
                    // the matcher produced no suggestion — saves 1,800+ selects
                    // from existing even in memory for linked/suggested rows.
                    return (
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={(e) => e.stopPropagation()}
                        title="No matched template — pick one manually or wand a new one"
                      >
                        <TemplatePicker
                          templateOptions={templateOptions}
                          templates={templates}
                          isMobile={isMobile}
                          onPick={(t) => confirmTemplateMatch(ev, t.id, t.template_name)}
                        />
                        {/* Magic Wand — relocated here from the right-side
                            action cluster so it lives with the picker. */}
                        <button
                          type="button"
                          className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent"
                          onClick={(e) => { e.stopPropagation(); handleCreateTemplateFromEvent(ev); }}
                          title="Create template from this event"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 4V2"/>
                            <path d="M15 16v-2"/>
                            <path d="M8 9h2"/>
                            <path d="M20 9h2"/>
                            <path d="m17.8 11.8 1.2 1.2"/>
                            <path d="m17.8 6.2 1.2-1.2"/>
                            <path d="m3 21 9-9"/>
                            <path d="m12.2 6.2-1.2-1.2"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })()}
                  <select
                    value={ev.category || 'Live Music'}
                    onChange={(e) => updateEventCategory(ev, e.target.value)}
                    className="text-[11px] font-display font-semibold rounded-lg px-2 py-1"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${catColor}44`,
                      color: catColor,
                      cursor: 'pointer', flexShrink: 0, outline: 'none',
                    }}
                  >
                    {CATEGORY_OPTIONS.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  {/* Unified Status Dropdown — replaces the old
                      Published-badge + Unpublish-button (and the mirror
                      Draft/Hidden-badge + Publish-button) with a single
                      styled <select>. Styling mirrors the Category
                      dropdown above so the row feels uniform. */}
                  <select
                    value={statusValue}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      if (newStatus === statusValue) return;
                      const prev = events;
                      setEvents(p => p.map(x => x.id === ev.id ? { ...x, status: newStatus } : x));
                      try {
                        const res = await fetch('/api/admin', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                          body: JSON.stringify({ id: ev.id, status: newStatus }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const label = STATUS_OPTIONS.find(s => s.value === newStatus)?.label || newStatus;
                        showQueueToast(`\u2705 ${label}: ${ev.artist_name || ev.event_title || ''}`);
                      } catch (err) {
                        console.error('Status update failed:', err);
                        setEvents(prev);
                        alert(`Status update failed: ${err.message}`);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] font-display font-semibold rounded-lg px-2 py-1"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${statusColor}44`,
                      color: statusColor,
                      cursor: 'pointer', flexShrink: 0, outline: 'none',
                    }}
                    title="Change event status"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {/* Source chain-link was relocated to the details row
                      (next to time) — see above. */}
                  <button className="p-1.5 rounded text-brand-text-muted hover:text-brand-accent" onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}>
                    {Icons.edit}
                  </button>
                  <button className="p-1.5 rounded text-brand-text-muted hover:text-red-400" onClick={() => deleteEvent(ev.id)} title="Permanently delete">
                    {Icons.trash}
                  </button>
                </div>
              </div>
              );
            })}
            {filtered.length === 0 && <p className="text-center py-8 text-brand-text-muted">{eventsSearch ? 'No matching events.' : 'No events in this view.'}</p>}
          </div>

          {/* Load More */}
          {eventsPage < eventsTotalPages && (
            <div className="text-center mt-4">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-display font-semibold"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                onClick={() => fetchEvents(eventsPage + 1, eventsSortField, eventsSortOrder, eventsStatusFilter, eventsMissingTime)}
              >
                Load More ({events.length} of {eventsTotal})
              </button>
            </div>
          )}
          </>)}
        </div>

  );
}