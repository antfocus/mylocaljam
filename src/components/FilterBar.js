'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  card:       '#12151f',
  cardBorder: 'rgba(255,255,255,0.08)',
  divider:    'rgba(255,255,255,0.08)',
  orange:     '#f47c20',
  orangeTint: 'rgba(244,124,32,0.12)',
  teal:       '#2ecac8',
  tealTint:   'rgba(46,202,200,0.12)',
  purple:     '#a78bfa',
  purpleTint: 'rgba(167,139,250,0.12)',
  text:       '#e8e8f0',
  muted:      '#6b7280',
  dropBg:     '#181c28',
  dropBorder: 'rgba(255,255,255,0.10)',
  check:      '#a78bfa',
};

// ── Chevron SVG ──────────────────────────────────────────────────────────────
function Chevron({ open, color = C.muted }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10"
      style={{
        transition: 'transform 0.2s ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Dropdown wrapper (fade + slide) ──────────────────────────────────────────
function Dropdown({ open, children, align = 'left', width = 200 }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 8px)',
      [align]: 0,
      width,
      background: C.dropBg,
      border: `1px solid ${C.dropBorder}`,
      borderRadius: '12px',
      zIndex: 300,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-6px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// ── Main FilterBar ───────────────────────────────────────────────────────────
export default function FilterBar({
  dateKey, setDateKey,
  activeVenues, setActiveVenues,   // now an array for multi-select
  venues,                           // [{name, count}]
  milesRadius, setMilesRadius,
}) {
  const [openPanel, setOpenPanel] = useState(null); // 'when' | 'venue' | 'miles' | null
  const [venueSearch, setVenueSearch] = useState('');
  const barRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) {
        setOpenPanel(null);
        setVenueSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeAll = useCallback(() => { setOpenPanel(null); setVenueSearch(''); }, []);

  const togglePanel = (key) => {
    setOpenPanel(prev => prev === key ? null : key);
    if (key !== 'venue') setVenueSearch('');
  };

  // ── When ─────────────────────────────────────────────────────
  const dateOptions = [
    { key: 'today',    label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'weekend',  label: 'This Weekend' },
    { key: 'all',      label: 'All Upcoming' },
  ];
  const whenLabel = dateOptions.find(o => o.key === dateKey)?.label || 'All Upcoming';
  const whenActive = dateKey !== 'all';

  // ── Venue ────────────────────────────────────────────────────
  const venueLabel = activeVenues.length === 0
    ? 'Any'
    : activeVenues.length === 1
      ? activeVenues[0]
      : `${activeVenues.length} venues`;
  const venueActive = activeVenues.length > 0;

  const filteredVenues = venues.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const toggleVenue = (name) => {
    setActiveVenues(prev =>
      prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]
    );
  };

  // ── Miles ────────────────────────────────────────────────────
  const milesLabel = milesRadius === null ? 'Any' : `${milesRadius} mi`;
  const milesActive = milesRadius !== null;
  const presets = [2, 5, 10, 25];

  // ── Shared button style ──────────────────────────────────────
  const btnStyle = (active, tint) => ({
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '2px',
    padding: '10px 6px',
    cursor: 'pointer',
    background: active ? tint : 'transparent',
    border: 'none',
    position: 'relative',
    minWidth: 0,
    transition: 'background 0.15s',
  });

  return (
    <div ref={barRef} style={{ position: 'relative', padding: '0 12px' }}>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: C.card,
        borderRadius: '14px',
        border: `1px solid ${C.cardBorder}`,
        overflow: 'visible',
        position: 'relative',
      }}>
        {/* ── When button ── */}
        <button onClick={() => togglePanel('when')} style={btnStyle(whenActive, C.orangeTint)}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: whenActive ? C.orange : C.muted }}>
            When
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: whenActive ? C.orange : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
              {whenLabel}
            </span>
            <Chevron open={openPanel === 'when'} color={whenActive ? C.orange : C.muted} />
          </span>
        </button>

        {/* divider */}
        <div style={{ width: '1px', background: C.divider, margin: '10px 0' }} />

        {/* ── Venue button ── */}
        <button onClick={() => togglePanel('venue')} style={btnStyle(venueActive, C.purpleTint)}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: venueActive ? C.purple : C.muted }}>
            Venue
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: venueActive ? C.purple : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
              {venueLabel}
            </span>
            <Chevron open={openPanel === 'venue'} color={venueActive ? C.purple : C.muted} />
          </span>
        </button>

        {/* divider */}
        <div style={{ width: '1px', background: C.divider, margin: '10px 0' }} />

        {/* ── Miles button ── */}
        <button onClick={() => togglePanel('miles')} style={btnStyle(milesActive, C.tealTint)}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: milesActive ? C.teal : C.muted }}>
            Miles
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: milesActive ? C.teal : C.text }}>
              {milesLabel}
            </span>
            <Chevron open={openPanel === 'miles'} color={milesActive ? C.teal : C.muted} />
          </span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
         DROPDOWNS
         ════════════════════════════════════════════════════════════════════════ */}

      {/* ── When dropdown (2×2 grid) ── */}
      <div style={{ position: 'absolute', left: '12px', right: '12px', zIndex: 300 }}>
        <Dropdown open={openPanel === 'when'} width="100%">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: C.divider }}>
            {dateOptions.map(opt => {
              const sel = dateKey === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setDateKey(opt.key); closeAll(); }}
                  style={{
                    padding: '14px 12px',
                    background: sel ? C.orangeTint : C.dropBg,
                    border: 'none', cursor: 'pointer',
                    color: sel ? C.orange : C.text,
                    fontSize: '14px', fontWeight: sel ? 700 : 500,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'background 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Dropdown>
      </div>

      {/* ── Venue dropdown (searchable checkboxes) ── */}
      <div style={{ position: 'absolute', left: '12px', right: '12px', zIndex: 300 }}>
        <Dropdown open={openPanel === 'venue'} width="100%">
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.divider}` }}>
            <input
              type="text"
              placeholder="Search venues..."
              value={venueSearch}
              onChange={e => setVenueSearch(e.target.value)}
              autoFocus={openPanel === 'venue'}
              style={{
                width: '100%', padding: '8px 10px',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${C.divider}`,
                borderRadius: '8px', fontSize: '13px',
                color: C.text, outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filteredVenues.map(v => {
              const checked = activeVenues.includes(v.name);
              return (
                <button
                  key={v.name}
                  onClick={() => toggleVenue(v.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '10px 12px',
                    background: checked ? C.purpleTint : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                    border: checked ? 'none' : `1.5px solid ${C.muted}`,
                    background: checked ? C.purple : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {checked && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', color: checked ? C.purple : C.text, fontWeight: checked ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name}
                  </span>
                  <span style={{ fontSize: '11px', color: C.muted }}>{v.count}</span>
                </button>
              );
            })}
            {filteredVenues.length === 0 && (
              <div style={{ padding: '16px 12px', color: C.muted, fontSize: '13px', textAlign: 'center' }}>
                No venues found
              </div>
            )}
          </div>
        </Dropdown>
      </div>

      {/* ── Miles dropdown (slider + presets) ── */}
      <div style={{ position: 'absolute', left: '12px', right: '12px', zIndex: 300 }}>
        <Dropdown open={openPanel === 'miles'} width="100%">
          <div style={{ padding: '16px 16px 12px' }}>
            {/* Slider */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>1 mi</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: milesRadius ? C.teal : C.muted }}>
                  {milesRadius ? `${milesRadius} mi` : 'Any distance'}
                </span>
                <span style={{ fontSize: '12px', color: C.muted }}>50 mi</span>
              </div>
              <input
                type="range"
                min="1" max="50"
                value={milesRadius || 50}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setMilesRadius(v >= 50 ? null : v);
                }}
                style={{
                  width: '100%', height: '4px',
                  appearance: 'none', WebkitAppearance: 'none',
                  background: `linear-gradient(to right, ${C.teal} ${((milesRadius || 50) - 1) / 49 * 100}%, rgba(255,255,255,0.1) 0%)`,
                  borderRadius: '2px', outline: 'none', cursor: 'pointer',
                  accentColor: C.teal,
                }}
              />
            </div>
            {/* Presets */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[...presets, null].map((p, i) => {
                const sel = milesRadius === p;
                const label = p === null ? 'Any' : `${p} mi`;
                return (
                  <button
                    key={i}
                    onClick={() => { setMilesRadius(p); closeAll(); }}
                    style={{
                      flex: 1, padding: '8px 0',
                      borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: sel ? C.tealTint : 'rgba(255,255,255,0.05)',
                      color: sel ? C.teal : C.muted,
                      transition: 'all 0.15s',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
