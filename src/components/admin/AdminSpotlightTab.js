'use client';

import { useState, useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import { applyWaterfall, getSpotlightReadiness, isMidnight, normalizeName } from '@/lib/waterfall';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Design tokens ────────────────────────────────────────────────────────────
const TRAFFIC_COLORS = {
  green:  { dot: '#22C55E', ring: 'rgba(34,197,94,0.45)',  bg: 'rgba(34,197,94,0.08)' },
  yellow: { dot: '#EAB308', ring: 'rgba(234,179,8,0.45)',  bg: 'rgba(234,179,8,0.08)' },
  red:    { dot: '#EF4444', ring: 'rgba(239,68,68,0.55)',  bg: 'rgba(239,68,68,0.08)' },
};

const SLOT_W = 160;
const SLOT_H = 100;

// ══════════════════════════════════════════════════════════════════════════════
// AdminSpotlightTab — drag-and-drop curation UI
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminSpotlightTab({
  artists, events, templates = [],
  spotlightDate, setSpotlightDate,
  spotlightPins, setSpotlightPins,
  spotlightEvents, spotlightLoading,
  spotlightSearch, setSpotlightSearch,
  setSpotlightImageWarning,
  fetchSpotlight, fetchSpotlightEvents,
  saveSpotlight, clearSpotlight, toggleSpotlightPin,
  insertPin, reorderPins, removePin, MAX_PINS = 5,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [activeId, setActiveId] = useState(null);    // currently dragged item

  // ── Sensors ──────────────────────────────────────────────────────────────
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor   = useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } });
  const sensors       = useSensors(pointerSensor, touchSensor);

  // ── Resolve helper ───────────────────────────────────────────────────────
  const resolve = (ev) => {
    if (!ev) return { state: 'red', resolved: {}, reasons: ['Missing event'], templateMissing: false, artistNotLinked: true };
    const joinedTpl = ev.event_templates || null;
    const lookedUpTpl = ev.template_id ? templates.find(t => t.id === ev.template_id) : null;
    const templateMissing = !!ev.template_id && !joinedTpl && !lookedUpTpl;
    const nameKey = normalizeName(ev.artist_name);
    const linkedArtist = ev.artists || (
      ev.artist_id
        ? artists.find(a => a.id === ev.artist_id)
        : (nameKey ? artists.find(a => normalizeName(a.name) === nameKey) : null)
    );
    const artistNotLinked = !ev.artist_id;
    const readiness = getSpotlightReadiness(ev, { template: joinedTpl || lookedUpTpl, artist: linkedArtist });
    return { ...readiness, templateMissing, artistNotLinked, linkedArtist, template: joinedTpl || lookedUpTpl || null };
  };

  // ── Build an event lookup + pinned slot data ─────────────────────────────
  const evById = useMemo(() => {
    const m = {};
    for (const e of spotlightEvents) m[e.id] = e;
    return m;
  }, [spotlightEvents]);

  // Padded to MAX_PINS — null entries render as empty slots.
  const slotIds = useMemo(() => {
    const s = spotlightPins.map(id => `slot::${id}`);
    while (s.length < MAX_PINS) s.push(`empty::${s.length}`);
    return s;
  }, [spotlightPins, MAX_PINS]);

  // ── Candidate list (un-pinned events) ────────────────────────────────────
  const candidates = useMemo(() => {
    const pinSet = new Set(spotlightPins);
    return spotlightEvents
      .filter(ev => {
        if (pinSet.has(ev.id)) return false;
        if (!spotlightSearch.trim()) return true;
        const q = spotlightSearch.trim().toLowerCase();
        const artist = (ev.artist_name || '').toLowerCase();
        const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
        return artist.includes(q) || venue.includes(q);
      });
  }, [spotlightEvents, spotlightPins, spotlightSearch]);

  // ── Is the strip full? (drives the #5 "warning" border) ─────────────────
  const stripFull = spotlightPins.length >= MAX_PINS;
  // True when dragging an unpinned card toward the full strip.
  const isDraggingFromList = activeId && !spotlightPins.includes(activeId);

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!active) return;

    const draggedId = active.id;
    const isPinned = spotlightPins.includes(draggedId);
    const overSlotIndex = over?.id ? parseSlotIndex(over.id, spotlightPins) : null;

    // ── Case 1: dropped outside any slot → unpin if pinned
    if (overSlotIndex === null) {
      if (isPinned) removePin(draggedId);
      return;
    }

    // ── Case 2: internal reorder (already pinned, dropped on a slot)
    if (isPinned) {
      const fromIndex = spotlightPins.indexOf(draggedId);
      if (fromIndex !== overSlotIndex) reorderPins(fromIndex, overSlotIndex);
      return;
    }

    // ── Case 3: new pin from list → slot (push-off if full)
    insertPin(draggedId, overSlotIndex);
  };

  const handleDragCancel = () => setActiveId(null);

  // Derive the active event for the drag overlay
  const activeEvent = activeId ? evById[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">Tonight's Spotlight</h2>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                onClick={clearSpotlight}
              >
                Clear Pins
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="font-display font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>Date:</label>
            <input
              type="date"
              value={spotlightDate}
              onChange={(e) => { const d = e.target.value; setSpotlightDate(d); fetchSpotlight(d); }}
              style={{
                padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {spotlightPins.length === 0 ? 'No pins — using auto fallback' : `${spotlightPins.length}/${MAX_PINS} pinned · auto-saved`}
            </span>
            {/* Traffic-light legend */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.green.dot, marginRight: 4 }} />Ready</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.yellow.dot, marginRight: 4 }} />Missing image/bio</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.red.dot, marginRight: 4 }} />Broken time</span>
            </div>
          </div>
        </div>

        {/* ── Slot strip (horizontal, 5 fixed slots) ─────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Spotlight Slots
          </h3>
          <SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>
            <div style={{
              display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
              WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin',
            }}>
              {slotIds.map((slotId, i) => {
                const eventId = slotId.startsWith('slot::') ? slotId.replace('slot::', '') : null;
                const ev = eventId ? evById[eventId] : null;
                const isLast = i === MAX_PINS - 1;
                const showWarning = isLast && stripFull && isDraggingFromList;
                return (
                  <SpotlightSlot
                    key={slotId}
                    id={slotId}
                    index={i}
                    event={ev}
                    resolve={resolve}
                    showWarning={showWarning}
                    onRemove={eventId ? () => removePin(eventId) : null}
                  />
                );
              })}
            </div>
          </SortableContext>
        </div>

        {/* ── Search bar ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Events on {spotlightDate}
          </h3>
          <div style={{ flex: '1 1 200px', maxWidth: '360px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search artist or venue..."
              value={spotlightSearch}
              onChange={e => setSpotlightSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 14px', paddingRight: spotlightSearch ? '32px' : '14px',
                background: 'var(--bg-elevated)', border: '1.5px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '13px', outline: 'none',
              }}
            />
            {spotlightSearch && (
              <button onClick={() => setSpotlightSearch('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {candidates.length} events
          </span>
        </div>

        {spotlightLoading && (
          <p className="text-center py-6" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        )}

        {/* ── Candidate list (draggable cards) ────────────────────────── */}
        <div className="space-y-2">
          {candidates.map(ev => {
            const isExpanded = expandedId === ev.id;
            const r = resolve(ev);
            const color = TRAFFIC_COLORS[r.state];
            const w = r.resolved;
            const timeLabel = w.start_time
              ? (isMidnight(w.start_time) && !w.is_human_edited ? '12:00 AM (unresolved)' : w.start_time)
              : '— missing —';

            return (
              <DraggableEventCard
                key={ev.id}
                id={ev.id}
                ev={ev}
                resolve={resolve}
                isExpanded={isExpanded}
                onToggleExpand={() => setExpandedId(isExpanded ? null : ev.id)}
                onPin={() => toggleSpotlightPin(ev.id)}
                color={color}
                timeLabel={timeLabel}
                w={w}
                r={r}
              />
            );
          })}
          {spotlightEvents.length === 0 && !spotlightLoading && (
            <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No published events on this date.</p>
          )}
        </div>
      </div>

      {/* ── Drag overlay (portal-rendered ghost) ────────────────────── */}
      <DragOverlay dropAnimation={null}>
        {activeEvent ? (
          <div style={{
            padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)',
            border: '2px solid #E8722A', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            opacity: 0.9, maxWidth: 260, fontFamily: "'DM Sans', sans-serif",
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeEvent.artist_name || 'Unknown'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {activeEvent.venue_name || activeEvent.venues?.name || ''}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SpotlightSlot — a single droppable/sortable slot in the horizontal strip
// ══════════════════════════════════════════════════════════════════════════════
function SpotlightSlot({ id, index, event, resolve, showWarning, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    minWidth: SLOT_W,
    width: SLOT_W,
    height: SLOT_H,
    borderRadius: 12,
    border: showWarning
      ? '2px dashed #EF4444'
      : (event ? '2px solid #E8722A66' : '2px dashed var(--border)'),
    background: showWarning
      ? 'rgba(239,68,68,0.06)'
      : (isOver ? 'rgba(232,114,42,0.12)' : (event ? 'var(--bg-elevated)' : 'var(--bg-card)')),
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px 10px',
    cursor: event ? 'grab' : 'default',
    flexShrink: 0,
    overflow: 'hidden',
    transition: 'border-color 0.2s, background 0.2s',
  };

  if (!event) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--border)', lineHeight: 1 }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {showWarning ? 'Will be bumped' : 'Empty'}
        </span>
      </div>
    );
  }

  const r = resolve(event);
  const color = TRAFFIC_COLORS[r.state];
  const w = r.resolved;
  const thumb = w.event_image;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* Rank badge */}
      <span style={{
        position: 'absolute', top: 4, left: 6, fontSize: 10, fontWeight: 800, color: '#E8722A',
        background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '1px 4px', lineHeight: 1.2,
      }}>
        #{index + 1}
      </span>
      {/* Traffic dot */}
      <span style={{
        position: 'absolute', top: 6, right: 6,
        width: 8, height: 8, borderRadius: '50%', background: color.dot,
      }} />
      {/* Thumbnail */}
      {thumb ? (
        <img
          src={thumb} alt="" loading="lazy"
          style={{ width: '100%', height: '50%', objectFit: 'cover', borderRadius: 6, marginBottom: 4 }}
        />
      ) : (
        <div style={{
          width: '100%', height: '50%', borderRadius: 6, marginBottom: 4,
          background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: 'var(--text-muted)',
        }}>
          No image
        </div>
      )}
      {/* Name */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', width: '100%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {event.artist_name || 'Unknown'}
      </div>
      {/* Remove button */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 2, right: 4, background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '2px 4px',
            lineHeight: 1,
          }}
          title="Unpin"
        >
          ✕
        </button>
      )}
      {/* Warning overlay */}
      {showWarning && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#EF4444', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 6px' }}>
            Will be bumped
          </span>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DraggableEventCard — a card in the candidate list that can be dragged to a slot
// ══════════════════════════════════════════════════════════════════════════════
function DraggableEventCard({ id, ev, resolve, isExpanded, onToggleExpand, onPin, color, timeLabel, w, r }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
    // This item lives outside the SortableContext — we only need it to be
    // a drag source, not a drop target. @dnd-kit still handles it via the
    // DndContext's collision detection.
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    transition: 'opacity 0.15s',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="rounded-xl border transition-all"
        style={{
          background: isExpanded ? color.bg : 'var(--bg-card)',
          borderColor: color.ring,
          borderLeft: `3px solid ${color.dot}`,
        }}
      >
        {/* Clickable row */}
        <div
          className="flex items-center gap-4 p-4"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            if (e.target.closest('[data-stop]')) return;
            onToggleExpand();
          }}
        >
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            data-stop
            style={{
              cursor: 'grab', color: 'var(--text-muted)', fontSize: 14,
              touchAction: 'none', lineHeight: 1, padding: '4px 2px',
            }}
            title="Drag to a spotlight slot"
          >
            ⠿
          </span>

          {/* Pin/unpin star */}
          <button
            data-stop
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border-0"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            title="Pin to Spotlight #1"
          >
            ☆
          </button>

          {/* Traffic-light dot */}
          <span
            title={r.reasons.length ? r.reasons.join(' · ') : 'Ready to feature'}
            style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color.dot, flexShrink: 0 }}
          />

          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {ev.artist_name}
              {r.templateMissing && <span style={chipStyle('#F97316')}>Template Missing</span>}
              {r.artistNotLinked && (
                <span style={chipStyle('#F97316')} title="No artist_id — waterfall can't pull Artist Profile's image or bio until linked.">
                  Artist not linked
                </span>
              )}
              {r.state === 'red' && <span style={chipStyle('#EF4444')}>{w.start_time ? 'Stuck at 12:00 AM' : 'No start time'}</span>}
              {r.state === 'yellow' && !w.event_image && <span style={chipStyle('#EAB308')}>Warning: No Image</span>}
              {r.state === 'yellow' && w.event_image && !w.description && <span style={chipStyle('#EAB308')}>Warning: No Bio</span>}
              {w.is_human_edited && <span style={chipStyle('#60A5FA')}>Human-locked</span>}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {ev.venue_name || ev.venues?.name} · {formatTime(ev.event_date)}
            </div>
          </div>

          <span style={{ color: 'var(--text-muted)', fontSize: '12px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
            ▸
          </span>
        </div>

        {/* Accordion preview */}
        {isExpanded && (
          <div style={{
            padding: '0 16px 16px 16px',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'minmax(140px, 180px) 1fr',
            gap: '16px',
            alignItems: 'start',
          }}>
            <div style={{
              aspectRatio: '4 / 3', borderRadius: '10px', overflow: 'hidden',
              background: 'var(--bg-elevated)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center',
              padding: '8px', marginTop: '16px',
            }}>
              {w.event_image ? (
                <img src={w.event_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              ) : (
                <span>No image across the full waterfall</span>
              )}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', marginTop: '16px' }}>
              <PreviewRow label="Category" value={w.category || '— Other —'} source={sourceLabel(ev, r.template, 'category')} />
              <PreviewRow label="Start time" value={timeLabel} source={sourceLabel(ev, r.template, 'start_time')} />
              <PreviewRow label="Title" value={w.title || '—'} source={sourceLabel(ev, r.template, 'title')} />
              <PreviewRow label="Bio" value={w.description ? truncate(w.description, 180) : '—'} source={sourceLabel(ev, r.template, 'bio')} multiline />
              {r.template && (
                <PreviewRow label="Template" value={r.template.template_name || '(unnamed)'} source="event.template_id" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a slot droppable ID into a numeric index in the pin array.
 * IDs are `slot::uuid` (filled) or `empty::N` (empty). Returns the
 * index in the strip (0–4), or null if the ID doesn't belong to the strip.
 */
function parseSlotIndex(overId, pins) {
  if (typeof overId !== 'string') return null;
  if (overId.startsWith('slot::')) {
    const eventId = overId.replace('slot::', '');
    const idx = pins.indexOf(eventId);
    return idx >= 0 ? idx : null;
  }
  if (overId.startsWith('empty::')) {
    const n = parseInt(overId.replace('empty::', ''), 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

function chipStyle(color) {
  return {
    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
    background: hexWithAlpha(color, 0.12), color,
    border: `1px solid ${hexWithAlpha(color, 0.25)}`,
    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  };
}

function hexWithAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function sourceLabel(event, template, field) {
  const e = event || {};
  const t = template || null;
  const has = (v) => v !== null && v !== undefined && v !== '' && v !== 'None';
  switch (field) {
    case 'category':
      if (e.is_human_edited && has(e.category)) return 'event (human-locked)';
      if (has(t?.category)) return 'template';
      if (has(e.category)) return 'event';
      return 'fallback';
    case 'start_time': {
      const eventMidnight = isMidnight(e.start_time);
      const shouldClobber = !e.is_human_edited && !!e.template_id && eventMidnight;
      if (e.is_human_edited && has(e.start_time)) return 'event (human-locked)';
      if (shouldClobber && has(t?.start_time)) return 'template (midnight exception)';
      if (has(t?.start_time)) return 'template';
      if (has(e.start_time)) return 'event';
      return 'missing';
    }
    case 'title':
      if (has(e.custom_title)) return 'custom override';
      if (e.is_human_edited && has(e.event_title)) return 'event (human-locked)';
      if (has(t?.template_name)) return 'template';
      if (has(e.event_title)) return 'event';
      return 'fallback';
    case 'bio':
      if (has(e.custom_bio)) return 'custom override';
      if (e.is_human_edited && has(e.artist_bio)) return 'event (human-locked)';
      if (has(t?.bio)) return 'template';
      if (has(e.artist_bio)) return 'event';
      if (has(e.artists?.bio)) return 'artist';
      return 'missing';
    default:
      return '';
  }
}

function PreviewRow({ label, value, source, multiline }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: '8px',
      padding: '4px 0', borderBottom: '1px dashed var(--border)',
      alignItems: multiline ? 'start' : 'center',
    }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{
        color: 'var(--text-primary)',
        whiteSpace: multiline ? 'normal' : 'nowrap',
        overflow: multiline ? 'visible' : 'hidden',
        textOverflow: multiline ? 'clip' : 'ellipsis',
        fontFamily: multiline ? "'DM Sans', sans-serif" : 'inherit',
        lineHeight: multiline ? 1.4 : 'inherit',
      }}>{value}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontStyle: 'italic' }}>{source}</span>
    </div>
  );
}
