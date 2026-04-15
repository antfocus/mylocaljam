'use client';

import { useState } from 'react';
import { formatTime } from '@/lib/utils';
import { applyWaterfall, getSpotlightReadiness, isMidnight, normalizeName } from '@/lib/waterfall';

const TRAFFIC_COLORS = {
  green:  { dot: '#22C55E', ring: 'rgba(34,197,94,0.45)',  bg: 'rgba(34,197,94,0.08)' },
  yellow: { dot: '#EAB308', ring: 'rgba(234,179,8,0.45)',  bg: 'rgba(234,179,8,0.08)' },
  red:    { dot: '#EF4444', ring: 'rgba(239,68,68,0.55)',  bg: 'rgba(239,68,68,0.08)' },
};

export default function AdminSpotlightTab({
  artists, events, templates = [],
  spotlightDate, setSpotlightDate,
  spotlightPins, setSpotlightPins,
  spotlightEvents, spotlightLoading,
  spotlightSearch, setSpotlightSearch,
  setSpotlightImageWarning,
  fetchSpotlight, fetchSpotlightEvents,
  saveSpotlight, clearSpotlight, toggleSpotlightPin,
}) {
  // Accordion expansion — UI-local only; hook doesn't need to know.
  const [expandedId, setExpandedId] = useState(null);

  // `normalizeName` lives in @/lib/waterfall so the server-side spotlight
  // route and this component use the exact same matcher. Drift there
  // re-introduces the "admin finds the artist, homepage doesn't" bug.

  /**
   * Resolve an event through the shared waterfall module. We supply a
   * fallback `template` when the `event_templates` join isn't hydrated on
   * the row — so the waterfall always has the full template data.
   *
   * Also returns two surfaced warnings:
   *   • templateMissing — event has a template_id but no matching template.
   *   • artistNotLinked — event has no artist_id (inheritance chain is
   *     blind to the artist tier until an admin links via the matcher).
   */
  const resolve = (ev) => {
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

    const readiness = getSpotlightReadiness(ev, {
      template: joinedTpl || lookedUpTpl,
      artist: linkedArtist,
    });

    return {
      ...readiness,
      templateMissing,
      artistNotLinked,
      linkedArtist,
      template: joinedTpl || lookedUpTpl || null,
    };
  };

  // Filtered candidate list (search + sort: green > yellow > red).
  const orderFor = { green: 0, yellow: 1, red: 2 };
  const candidates = spotlightEvents
    .filter(ev => {
      if (!spotlightSearch.trim()) return true;
      const q = spotlightSearch.trim().toLowerCase();
      const artist = (ev.artist_name || '').toLowerCase();
      const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
      return artist.includes(q) || venue.includes(q);
    });

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
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
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
              onClick={saveSpotlight}
            >
              Save Spotlight
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
            {(() => { const validCount = spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).length; return validCount === 0 ? 'No pins — using auto fallback' : `${validCount}/5 pinned`; })()}
          </span>
          {/* Traffic-light legend */}
          <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.green.dot, marginRight: 4 }} />Ready</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.yellow.dot, marginRight: 4 }} />Missing image/bio</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: TRAFFIC_COLORS.red.dot, marginRight: 4 }} />Broken time</span>
          </div>
        </div>
      </div>

      {/* ── Pinned rail (reorder) ───────────────────────────────────────── */}
      {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).length > 0 && (
        <div className="mb-6">
          <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Pinned Order
          </h3>
          <div className="space-y-2">
            {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).map((eventId, i, arr) => {
              const ev = spotlightEvents.find(e => e.id === eventId);
              const r = ev ? resolve(ev) : null;
              const color = r ? TRAFFIC_COLORS[r.state] : TRAFFIC_COLORS.green;
              return (
                <div key={eventId} className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ background: 'var(--bg-elevated)', borderColor: '#E8722A44' }}>
                  <span className="text-xs font-bold" style={{ color: '#E8722A', minWidth: '20px' }}>#{i + 1}</span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color.dot, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm">{ev?.artist_name || 'Unknown'}</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {ev?.venue_name || ev?.venues?.name || ''} · {ev ? formatTime(ev.event_date) : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {i > 0 && (
                      <button className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-card)' }}
                        onClick={() => setSpotlightPins(prev => { const n = [...prev]; [n[i-1], n[i]] = [n[i], n[i-1]]; return n; })}
                      >↑</button>
                    )}
                    {i < arr.length - 1 && (
                      <button className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-card)' }}
                        onClick={() => setSpotlightPins(prev => { const n = [...prev]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n; })}
                      >↓</button>
                    )}
                  </div>
                  <button className="p-1.5 rounded text-red-400 hover:text-red-300"
                    onClick={() => toggleSpotlightPin(eventId)}
                  >✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Candidate list ──────────────────────────────────────────────── */}
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
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
          {spotlightEvents.length} events
        </span>
      </div>

      {spotlightLoading && (
        <p className="text-center py-6" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      )}

      <div className="space-y-2">
        {candidates.map(ev => {
          const isPinned = spotlightPins.includes(ev.id);
          const isExpanded = expandedId === ev.id;
          const r = resolve(ev);
          const color = TRAFFIC_COLORS[r.state];

          // Waterfall preview fields for the accordion.
          const w = r.resolved;
          const timeLabel = w.start_time
            ? (isMidnight(w.start_time) && !w.is_human_edited ? '12:00 AM (unresolved)' : w.start_time)
            : '— missing —';

          return (
            <div key={ev.id}
              className="rounded-xl border transition-all"
              style={{
                background: isPinned ? 'rgba(232,114,42,0.08)' : (isExpanded ? color.bg : 'var(--bg-card)'),
                borderColor: isPinned ? '#E8722A' : color.ring,
                borderLeft: `3px solid ${color.dot}`,
              }}
            >
              {/* Clickable row */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={(e) => {
                  // If click lands on a button inside the row, let that handle it.
                  if (e.target.closest('[data-stop]')) return;
                  setExpandedId(isExpanded ? null : ev.id);
                }}
              >
                {/* Pin/unpin star — separate button so accordion toggle doesn't fire.
                    The legacy "Missing Artist Image" modal is intentionally
                    retired here: the traffic-light dot + chips already
                    communicate readiness at a glance, and a second modal was
                    pure friction. The admin sees the state and decides. */}
                <button
                  data-stop
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSpotlightPin(ev.id);
                  }}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border-0"
                  style={{
                    background: isPinned ? '#E8722A' : 'var(--bg-elevated)',
                    color: isPinned ? '#111' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                  title={isPinned ? 'Unpin' : 'Pin to Spotlight'}
                >
                  {isPinned ? '★' : '☆'}
                </button>

                {/* Traffic-light dot */}
                <span
                  title={r.reasons.length ? r.reasons.join(' · ') : 'Ready to feature'}
                  style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color.dot, flexShrink: 0 }}
                />

                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {ev.artist_name}
                    {r.templateMissing && (
                      <span style={chipStyle('#F97316')}>Template Missing</span>
                    )}
                    {r.artistNotLinked && (
                      <span
                        style={chipStyle('#F97316')}
                        title="This event has no artist_id — the waterfall can't pull the Artist Profile's image or bio until you link it via the Event Feed matcher."
                      >
                        Artist not linked
                      </span>
                    )}
                    {r.state === 'red' && (
                      <span style={chipStyle('#EF4444')}>
                        {w.start_time ? 'Stuck at 12:00 AM' : 'No start time'}
                      </span>
                    )}
                    {r.state === 'yellow' && !w.event_image && (
                      <span style={chipStyle('#EAB308')}>Warning: No Image</span>
                    )}
                    {r.state === 'yellow' && w.event_image && !w.description && (
                      <span style={chipStyle('#EAB308')}>Warning: No Bio</span>
                    )}
                    {w.is_human_edited && (
                      <span style={chipStyle('#60A5FA')}>Human-locked</span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {ev.venue_name || ev.venues?.name} · {formatTime(ev.event_date)}
                  </div>
                </div>

                {isPinned && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8722A22', color: '#E8722A' }}>
                    Pinned #{spotlightPins.indexOf(ev.id) + 1}
                  </span>
                )}

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
                  {/* Image preview */}
                  <div style={{
                    aspectRatio: '4 / 3', borderRadius: '10px', overflow: 'hidden',
                    background: 'var(--bg-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center',
                    padding: '8px',
                    marginTop: '16px',
                  }}>
                    {w.event_image ? (
                      <img src={w.event_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <span>No image across the full waterfall</span>
                    )}
                  </div>

                  {/* Resolved metadata */}
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', marginTop: '16px' }}>
                    <PreviewRow label="Category" value={w.category || '— Other —'} source={sourceLabel(ev, r.template, 'category')} />
                    <PreviewRow label="Start time" value={timeLabel} source={sourceLabel(ev, r.template, 'start_time')} />
                    <PreviewRow label="Title" value={w.title || '—'} source={sourceLabel(ev, r.template, 'title')} />
                    <PreviewRow label="Bio" value={w.description ? truncate(w.description, 180) : '—'} source={sourceLabel(ev, r.template, 'bio')} multiline />
                    {r.template && (
                      <PreviewRow label="Template" value={r.template.template_name || '(unnamed)'} source="event.template_id" />
                    )}
                    {r.templateMissing && (
                      <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: 'rgba(249,115,22,0.1)', color: '#F97316' }}>
                        This event has a <code>template_id</code> but the matching
                        template is not in the loaded templates list. Open the
                        Event Templates tab to verify it exists.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {spotlightEvents.length === 0 && !spotlightLoading && (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No published events on this date.</p>
        )}
      </div>
    </div>
  );
}

// ── small presentational helpers ───────────────────────────────────────────

function chipStyle(color) {
  return {
    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
    background: hexWithAlpha(color, 0.12), color,
    border: `1px solid ${hexWithAlpha(color, 0.25)}`,
    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  };
}

function hexWithAlpha(hex, alpha) {
  // Accept #RRGGBB; fall back to rgba with the literal hex if malformed.
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

/**
 * Annotate each preview row with the waterfall tier that supplied the value.
 * Purely informational — helps the admin see "this came from the template"
 * vs "this is the raw scraper text."
 */
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
      display: 'grid',
      gridTemplateColumns: '80px 1fr auto',
      gap: '8px',
      padding: '4px 0',
      borderBottom: '1px dashed var(--border)',
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
