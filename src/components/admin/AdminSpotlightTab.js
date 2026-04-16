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
  rectIntersection,
  pointerWithin,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Design tokens ────────────────────────────────────────────────────────────
const TRAFFIC_COLORS = {
  green:  { dot: '#22C55E', ring: 'rgba(34,197,94,0.45)',  bg: 'rgba(34,197,94,0.08)' },
  yellow: { dot: '#EAB308', ring: 'rgba(234,179,8,0.45)',  bg: 'rgba(234,179,8,0.08)' },
  red:    { dot: '#EF4444', ring: 'rgba(239,68,68,0.55)',  bg: 'rgba(239,68,68,0.08)' },
};

// Slot dimensions removed — vertical full-width cards now.

// ══════════════════════════════════════════════════════════════════════════════
// AdminSpotlightTab — drag-and-drop curation UI
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminSpotlightTab({
  artists, events, templates = [],
  spotlightDate, setSpotlightDate,
  spotlightPins, setSpotlightPins,
  // Projected Spotlight — map of { [event_id]: 'manual' | 'suggested' }.
  // When absent (older callers), every pin falls back to 'manual' so the
  // UI renders identically to pre-Projected behavior.
  spotlightSources = {},
  spotlightEvents, spotlightLoading,
  spotlightSearch, setSpotlightSearch,
  setSpotlightImageWarning,
  fetchSpotlight, fetchSpotlightEvents,
  saveSpotlight, clearSpotlight, toggleSpotlightPin,
  insertPin, reorderPins, removePin, MAX_PINS = 5,
  // Magic Wand — bulk AI enrichment (POST /api/admin/enrich-date).
  // When the user clicks ✨ Auto-Fill, every event on spotlightDate that
  // is missing bio/image AND isn't admin-locked runs through the full
  // MusicBrainz → Discogs → Last.fm → Perplexity waterfall, and the
  // resulting fields are written back AND locked.
  enrichCurrentDate,
  enriching = false,
  lastEnrichResult = null,
}) {
  const [expandedId, setExpandedId] = useState(null);
  // Slots default to COLLAPSED. Users click to expand a slot; multiple may
  // be open at once so side-by-side comparison doesn't require a toggle war.
  const [expandedSlots, setExpandedSlots] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);    // currently dragged item

  const toggleSlotExpanded = (eventId) => {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

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

  // Padded to MAX_PINS — filled slots use the RAW event UUID as the
  // sortable ID (no `slot::` prefix). This is critical: it means
  // `active.id` from @dnd-kit is always an event UUID whether the drag
  // originated in the candidate list or in a pinned slot, so the
  // `spotlightPins.includes(active.id)` check in handleDragEnd behaves
  // consistently for both cases. Empty slots keep their `empty::N`
  // placeholder so we can still address them as drop targets.
  const slotIds = useMemo(() => {
    const s = [...spotlightPins];
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

  // Any suggested (autopilot) pins in the current strip? Drives a one-line
  // explainer banner so the admin understands why some slots look DRAFT-y.
  const hasSuggestedPins = useMemo(
    () => spotlightPins.some(id => spotlightSources[id] === 'suggested'),
    [spotlightPins, spotlightSources]
  );

  // Count of events on the current date that are candidates for the Magic
  // Wand — Smart Fill edition. Mirrors the server-side filter in
  // /api/admin/enrich-date (see that route's Step 2 loop) so the badge
  // matches what the POST will actually process.
  //
  // Two rules that have to stay in lockstep with the backend:
  //
  //   1. NO lock-skip. Rows carrying a stale `is_human_edited=true` or
  //      `is_locked=true` with blank bio/image are "Rescue" candidates
  //      — the 7:12 PM Ghost (2026-04-14) falsely locked ~5 rows on
  //      2026-04-21 with empty columns; Smart Fill's whole point is to
  //      refill the blanks without clobbering locked NON-blank fields.
  //      Skipping locked rows here is what caused the badge to show 6
  //      instead of the correct 11 after yesterday's backend update.
  //
  //   2. Real image columns only. `ev.event_image` is a VIRTUAL field
  //      added by applyWaterfall() in src/lib/waterfall.js — it is NOT
  //      hydrated on rows fetched from /api/admin. The real columns on
  //      `events` are `custom_image_url`, `event_image_url`, and legacy
  //      `image_url`; plus the joined `artists.image_url` for bio/image
  //      that's already filled one table over. Reading the phantom
  //      column always returns undefined, which made every row look
  //      image-less and was a second cause of the old count drift.
  //
  // Any cosmetic drift still can't cause wrong writes — the server owns
  // the authoritative filter — but "button says 6, server processes 11"
  // is exactly the kind of trust-corroding mismatch that sends an admin
  // into the DB to hand-fix things. Keep these two rules in sync with
  // enrich-date/route.js step 2 whenever either side changes.
  //
  // `rescueCount` is the locked-blank subset of `missingMetadataCount`
  // — same semantics as the server's `lockedBlankFilled` return field.
  // Exposed as a derived value so the banner/tooltip can split "N fresh
  // + M rescue" for the operator without recomputing the loop.
  const { missingMetadataCount, rescueCount } = useMemo(() => {
    let total = 0;
    let rescue = 0;
    for (const ev of spotlightEvents) {
      const hasImage = !!(
        ev.custom_image_url ||
        ev.event_image_url ||
        ev.image_url ||
        ev.artists?.image_url
      );
      const hasBio = !!(ev.artist_bio || ev.artists?.bio);
      if (hasImage && hasBio) continue;
      total++;
      if (ev.is_human_edited === true || ev.is_locked === true) rescue++;
    }
    return { missingMetadataCount: total, rescueCount: rescue };
  }, [spotlightEvents]);

  // ── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!active) return;

    const draggedId = active.id;
    const isPinned = spotlightPins.includes(draggedId);
    const overSlotIndex = resolveSlotIndex(over?.id, spotlightPins);

    // ── Self-drop guard (drag slot #3 and drop on itself → no-op)
    if (over && active.id === over.id) return;

    // ── Case 1: dropped outside any slot
    //   • If dragged a pinned slot → unpin it (drag-out gesture)
    //   • If dragged a candidate   → cancel (no pin added)
    if (overSlotIndex === null) {
      if (isPinned) removePin(draggedId);
      return;
    }

    // ── Case 2: internal reorder (already pinned, dropped on a slot)
    if (isPinned) {
      const fromIndex = spotlightPins.indexOf(draggedId);
      // Clamp target index to the current pin count for reorders so a
      // drop on an `empty::N` slot past the end lands at the end.
      const toIndex = Math.min(overSlotIndex, spotlightPins.length - 1);
      if (fromIndex !== toIndex && fromIndex !== -1) reorderPins(fromIndex, toIndex);
      return;
    }

    // ── Case 3: new pin from list → slot (push-off if full)
    insertPin(draggedId, overSlotIndex);
  };

  const handleDragCancel = () => setActiveId(null);

  // Derive the active event for the drag overlay
  const activeEvent = activeId ? evById[activeId] : null;

  // ── Collision detection ──────────────────────────────────────────────────
  // `closestCenter` measures centers, which made Slot #1 hard to hit from
  // external drags whose DragOverlay rect sits below the pointer. Prefer
  // `pointerWithin` (uses the pointer coords directly — the whole slot row
  // is a valid drop target once the pointer enters it), falling back to
  // `rectIntersection` so grazing drags still register.
  const collisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return rectIntersection(args);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
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
              {/* Magic Wand — bulk AI enrichment for every event on the
                  currently-selected date that's missing bio/image AND
                  isn't admin-locked. Disabled when nothing needs filling,
                  or while a run is in flight. Badge shows the live
                  candidate count so the admin knows how much work the
                  click will do before committing. */}
              <button
                className="px-3 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: missingMetadataCount > 0 && !enriching
                    ? 'linear-gradient(135deg, #8B5CF6 0%, #E8722A 100%)'
                    : 'var(--bg-elevated)',
                  color: missingMetadataCount > 0 && !enriching ? '#FFF' : 'var(--text-muted)',
                  opacity: missingMetadataCount === 0 && !enriching ? 0.5 : 1,
                  cursor: missingMetadataCount === 0 || enriching ? 'not-allowed' : 'pointer',
                  border: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onClick={() => {
                  if (missingMetadataCount === 0 || enriching) return;
                  if (enrichCurrentDate) enrichCurrentDate();
                }}
                disabled={missingMetadataCount === 0 || enriching}
                title={
                  missingMetadataCount === 0
                    ? 'Every event on this date already has bio + image'
                    : `Run AI enrichment on ${missingMetadataCount} event${missingMetadataCount === 1 ? '' : 's'} missing metadata`
                }
              >
                {enriching ? (
                  <>
                    <span style={{
                      display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#FFF',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    Enriching…
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    Auto-Fill
                    {missingMetadataCount > 0 && (
                      <span
                        style={{
                          fontSize: 10, fontWeight: 800,
                          background: 'rgba(255,255,255,0.25)',
                          borderRadius: 999, padding: '1px 6px',
                        }}
                        title={
                          rescueCount > 0
                            ? `${missingMetadataCount - rescueCount} fresh + ${rescueCount} rescue = ${missingMetadataCount} to fill`
                            : `${missingMetadataCount} to fill`
                        }
                      >{missingMetadataCount}</span>
                    )}
                  </>
                )}
              </button>
              <button
                className="px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                onClick={clearSpotlight}
              >
                Clear Pins
              </button>
            </div>
          </div>

          {/* Magic Wand result banner — persists until the next run. */}
          {lastEnrichResult && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: lastEnrichResult.ok
                ? 'rgba(34,197,94,0.08)'
                : 'rgba(239,68,68,0.08)',
              border: lastEnrichResult.ok
                ? '1px solid rgba(34,197,94,0.25)'
                : '1px solid rgba(239,68,68,0.35)',
              color: lastEnrichResult.ok ? '#22C55E' : '#EF4444',
              fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {lastEnrichResult.ok ? (
                <>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <span style={{ fontWeight: 600 }}>
                    Enriched {lastEnrichResult.eventsUpdated || 0} of {lastEnrichResult.candidates || 0} events
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    · {lastEnrichResult.artistsEnriched || 0} artists · {lastEnrichResult.duration || ''}
                    {lastEnrichResult.lockedBlankFilled
                      ? ` · ${lastEnrichResult.lockedBlankFilled} locked (blank-filled)`
                      : (lastEnrichResult.lockedSkipped
                          ? ` · ${lastEnrichResult.lockedSkipped} locked (skipped)`
                          : '')}
                  </span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: 11 }}>
                    Filled fields are now locked from the scraper.
                  </span>
                </>
              ) : (
                <>
                  <span>⚠</span>
                  <span style={{ fontWeight: 600 }}>Auto-Fill failed:</span>
                  <span>{lastEnrichResult.error || 'Unknown error'}</span>
                </>
              )}
            </div>
          )}
          {/* Spinner keyframes — inlined so we don't depend on the page's CSS. */}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
              {spotlightPins.length === 0
                ? 'No pins — using auto fallback'
                : (() => {
                    const manualCount = spotlightPins.filter(id => spotlightSources[id] !== 'suggested').length;
                    const draftCount = spotlightPins.length - manualCount;
                    if (draftCount === 0) return `${spotlightPins.length}/${MAX_PINS} pinned · auto-saved`;
                    if (manualCount === 0) return `${draftCount}/${MAX_PINS} draft (Smart Curator)`;
                    return `${manualCount} pinned · ${draftCount} draft`;
                  })()}
            </span>
            {/* Traffic-light legend */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.green.dot, marginRight: 4 }} />Ready</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.yellow.dot, marginRight: 4 }} />Missing image/bio</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.red.dot, marginRight: 4 }} />Broken time</span>
            </div>
          </div>
        </div>

        {/* ── Slot strip (vertical, 5 full-width cards) ────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Spotlight Slots
            </h3>
            {hasSuggestedPins && (
              <span style={{
                fontSize: 11, color: '#60A5FA', fontWeight: 600,
                background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.25)',
                borderRadius: 6, padding: '3px 8px',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Draft — auto-selected by the Smart Curator. Edit any slot to commit.
              </span>
            )}
          </div>
          <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {slotIds.map((slotId, i) => {
                // slotId is either a raw event UUID (filled slot) or
                // `empty::N` (empty placeholder). The `startsWith('empty::')`
                // check is the canonical discriminator now.
                const eventId = slotId.startsWith('empty::') ? null : slotId;
                const ev = eventId ? evById[eventId] : null;
                const isLast = i === MAX_PINS - 1;
                const showWarning = isLast && stripFull && isDraggingFromList;
                // Suggested = autopilot pick (not yet committed to
                // spotlight_events). The slot renders DRAFT chrome until
                // the admin touches it — any mutation auto-promotes.
                const isSuggested = !!eventId && spotlightSources[eventId] === 'suggested';
                return (
                  <SpotlightSlot
                    key={slotId}
                    id={slotId}
                    index={i}
                    event={ev}
                    resolve={resolve}
                    showWarning={showWarning}
                    onRemove={eventId ? () => removePin(eventId) : null}
                    artists={artists}
                    templates={templates}
                    isExpanded={!!eventId && expandedSlots.has(eventId)}
                    onToggleExpand={eventId ? () => toggleSlotExpanded(eventId) : null}
                    isSuggested={isSuggested}
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
            padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)',
            border: '2px solid #E8722A', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            opacity: 0.92, maxWidth: 360, fontFamily: "'DM Sans', sans-serif",
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeEvent.artist_name || 'Unknown'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {activeEvent.venue_name || activeEvent.venues?.name || ''}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SpotlightSlot — vertical accordion card (collapsed by default)
// Collapsed bar: rank · artist · venue · dot · expand arrow
// Expanded body: image left, full metadata (including untruncated bio) right
// ══════════════════════════════════════════════════════════════════════════════
function SpotlightSlot({
  id, index, event, resolve, showWarning, onRemove,
  artists, templates, isExpanded, onToggleExpand,
  // Projected Spotlight — when true, the slot was filled by the autopilot
  // (Tiers 1–3 of the Quality-First Waterfall) and hasn't been committed
  // to the spotlight_events table yet. Renders dashed blue-gray chrome
  // and a DRAFT badge so the admin can tell at a glance which slots are
  // suggestions vs hard pins.
  isSuggested = false,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({ id });
  // Border precedence (highest priority wins):
  //   1. Bump warning (red dashed) — #5 about to be pushed off
  //   2. Filled + suggested (Muted Solid: standard dark border + faint blue tint)
  //   3. Filled + manual (solid orange) — committed admin pin
  //   4. Empty placeholder (gray dashed)
  //
  // Muted Solid design (2026-04-16): suggested slots previously rendered a
  // 2px dashed blue border, which made 5 stacked drafts feel noisy and
  // sketch-y. We now match the standard unpinned/row border (var(--border),
  // solid) and rely on a very faint blue background tint + the DRAFT pill +
  // the muted-blue rank number to signal "autopilot pick". The goal is for
  // the stack to read as calm and professional, not provisional.
  const fillBorder = event
    ? (isSuggested ? '2px solid var(--border)' : '2px solid #E8722A66')
    : '2px dashed var(--border)';
  const fillBackground = event
    ? (isSuggested ? 'rgba(59,130,246,0.06)' : 'var(--bg-elevated)')
    : 'var(--bg-card)';
  const baseStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderRadius: 12,
    border: showWarning
      ? '2px dashed #EF4444'
      : fillBorder,
    background: showWarning
      ? 'rgba(239,68,68,0.06)'
      : (isOver ? 'rgba(232,114,42,0.12)' : fillBackground),
    position: 'relative',
    overflow: 'hidden',
  };

  // ── Empty slot placeholder ────────────────────────────────────────────
  // Drop target ONLY — no listeners/attributes spread. The user can drop an
  // event here, but can't pick up an empty placeholder and drag it around.
  if (!event) {
    return (
      <div ref={setNodeRef} style={{
        ...baseStyle,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '14px 16px', gap: 8,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--border)', lineHeight: 1 }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {showWarning ? 'Will be bumped' : 'Empty slot — drag an event here'}
        </span>
      </div>
    );
  }

  // ── Filled slot — accordion ───────────────────────────────────────────
  const r = resolve(event);
  const color = TRAFFIC_COLORS[r.state];
  const w = r.resolved;
  const timeLabel = w.start_time
    ? (isMidnight(w.start_time) && !w.is_human_edited ? '12:00 AM (unresolved)' : w.start_time)
    : '— missing —';
  const venueName = event.venue_name || event.venues?.name || '';

  return (
    <div ref={setNodeRef} style={baseStyle}>
      {/* Collapsed bar — always rendered; click toggles expand */}
      <div
        onClick={(e) => {
          if (e.target.closest('[data-stop]')) return;
          if (onToggleExpand) onToggleExpand();
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer',
        }}
      >
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          data-stop
          style={{
            cursor: 'grab', color: 'var(--text-muted)', fontSize: 16,
            touchAction: 'none', lineHeight: 1, padding: '2px 4px', flexShrink: 0,
          }}
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Rank badge — orange for manual pins, muted blue for suggestions
            so the visual weight matches the border treatment above. */}
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: isSuggested ? '#60A5FA' : '#E8722A',
          flexShrink: 0,
          background: isSuggested ? 'rgba(96,165,250,0.12)' : 'rgba(232,114,42,0.12)',
          borderRadius: 6, padding: '2px 8px',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          #{index + 1}
        </span>

        {/* DRAFT badge — only on suggested slots. Sits adjacent to the rank
            so the admin knows exactly which slot is tentative without
            having to read the color-coded border. */}
        {isSuggested && (
          <span
            title="Auto-selected by the Smart Curator. Edit to commit."
            style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: '#60A5FA',
              background: 'rgba(96,165,250,0.10)',
              border: '1px solid rgba(96,165,250,0.30)',
              borderRadius: 4, padding: '1px 5px', flexShrink: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            DRAFT
          </span>
        )}

        {/* Traffic dot */}
        <span
          title={r.reasons.length ? r.reasons.join(' · ') : 'Ready to feature'}
          style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: color.dot, flexShrink: 0,
          }}
        />

        {/* Artist + Venue (single-line) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-display font-bold text-sm" style={{
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {event.artist_name || 'Unknown'}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-secondary)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {venueName} · {formatTime(event.event_date)}
          </div>
        </div>

        {/* Remove (unpin) button */}
        {onRemove && (
          <button
            data-stop
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: '4px 8px',
              borderRadius: 6, lineHeight: 1, flexShrink: 0,
            }}
            title="Unpin from spotlight"
          >
            ✕
          </button>
        )}

        {/* Expand/collapse chevron */}
        <span style={{
          color: 'var(--text-muted)', fontSize: 12, flexShrink: 0,
          transform: isExpanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }}>
          ▸
        </span>
      </div>

      {/* Expanded body — image + full untruncated metadata */}
      {isExpanded && (
        <div style={{
          padding: '0 16px 16px 16px',
          borderTop: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: 'minmax(140px, 220px) 1fr',
          gap: 16,
          alignItems: 'start',
        }}>
          {/* Status chips row (shown only when expanded so the collapsed bar stays clean) */}
          {(r.templateMissing || r.artistNotLinked || r.state === 'red' || r.state === 'yellow' || w.is_human_edited) && (
            <div style={{
              gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6,
              paddingTop: 12,
            }}>
              {r.templateMissing && <span style={chipStyle('#F97316')}>Template Missing</span>}
              {r.artistNotLinked && (
                <span style={chipStyle('#F97316')} title="No artist_id — waterfall can't pull Artist Profile's image or bio until linked.">
                  Artist not linked
                </span>
              )}
              {r.state === 'red' && <span style={chipStyle('#EF4444')}>{w.start_time ? 'Stuck at 12:00 AM' : 'No start time'}</span>}
              {r.state === 'yellow' && !w.event_image && <span style={chipStyle('#EAB308')}>No Image</span>}
              {r.state === 'yellow' && w.event_image && !w.description && <span style={chipStyle('#EAB308')}>No Bio</span>}
              {w.is_human_edited && <span style={chipStyle('#60A5FA')}>Human-locked</span>}
            </div>
          )}

          {/* Image */}
          <div style={{
            aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden',
            background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', padding: 8,
            marginTop: 12,
          }}>
            {w.event_image ? (
              <img src={w.event_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            ) : (
              <span>No image across the full waterfall</span>
            )}
          </div>

          {/* Metadata rows — bio is untruncated and wraps to full height */}
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, marginTop: 12 }}>
            <PreviewRow label="Category" value={w.category || '— Other —'} source={sourceLabel(event, r.template, 'category')} />
            <PreviewRow label="Start time" value={timeLabel} source={sourceLabel(event, r.template, 'start_time')} />
            <PreviewRow label="Title" value={w.title || '—'} source={sourceLabel(event, r.template, 'title')} />
            <PreviewRow
              label="Bio"
              value={w.description || '—'}
              source={sourceLabel(event, r.template, 'bio')}
              multiline
            />
            {r.template && (
              <PreviewRow label="Template" value={r.template.template_name || '(unnamed)'} source="event.template_id" />
            )}
          </div>
        </div>
      )}

      {/* Warning overlay (red pulse when #5 is about to be bumped) */}
      {showWarning && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#EF4444',
            background: 'rgba(0,0,0,0.65)', borderRadius: 6, padding: '4px 12px',
          }}>
            Will be bumped off
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
 * Resolve a droppable's `over.id` into a slot index (0..MAX_PINS-1).
 *
 * Two ID shapes show up on the spotlight strip:
 *   • A raw event UUID — meaning the pointer is over a FILLED slot; its
 *     position is `pins.indexOf(uuid)`.
 *   • `empty::N` — meaning the pointer is over an empty placeholder slot;
 *     its position is N.
 *
 * Anything else (null, or an event UUID from the candidate list whose card
 * happened to be the nearest droppable) returns null — the caller treats
 * that as "not over a slot" and either cancels or unpins.
 */
function resolveSlotIndex(overId, pins) {
  if (typeof overId !== 'string') return null;
  if (overId.startsWith('empty::')) {
    const n = parseInt(overId.slice('empty::'.length), 10);
    return Number.isNaN(n) ? null : n;
  }
  const idx = pins.indexOf(overId);
  return idx >= 0 ? idx : null;
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
