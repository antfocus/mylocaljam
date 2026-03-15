'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Palette (theme-aware) ────────────────────────────────────────────────────
const COLORS = {
  orange:     '#f47c20',
  orangeStrong: '#e06a10',
  teal:       '#2ecac8',
  tealStrong: '#1fb5b3',
  purple:     '#a78bfa',
  purpleStrong: '#8b6fe0',
};

function getPalette(dark) {
  return {
    ...COLORS,
    orangeBg:   dark ? 'rgba(244,124,32,0.18)' : 'rgba(244,124,32,0.12)',
    tealBg:     dark ? 'rgba(46,202,200,0.18)' : 'rgba(46,202,200,0.12)',
    tealTint:   dark ? 'rgba(46,202,200,0.12)' : 'rgba(46,202,200,0.08)',
    purpleBg:   dark ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.12)',
    purpleTint: dark ? 'rgba(167,139,250,0.12)' : 'rgba(167,139,250,0.08)',
    text:       dark ? '#e8e8f0' : '#1f2937',
    muted:      dark ? '#6b7280' : '#9ca3af',
    dropBg:     dark ? '#181c28' : '#ffffff',
    dropBorder: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
    divider:    dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    btnBorder:  dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    inputBg:    dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
  };
}

// ── Chevron SVG ──────────────────────────────────────────────────────────────
function Chevron({ open, color }) {
  return (
    <svg width="8" height="8" viewBox="0 0 10 10" style={{
      transition: 'transform 0.2s ease',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      flexShrink: 0,
    }}>
      <path d="M2 3.5L5 6.5L8 3.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Dropdown (compact, positioned relative to button) ────────────────────────
function Dropdown({ open, children, align = 'left', minWidth = 140, palette }) {
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
      top: 'calc(100% + 4px)',
      [align]: 0,
      minWidth,
      background: palette.dropBg,
      border: `1px solid ${palette.dropBorder}`,
      borderRadius: '10px',
      zIndex: 300,
      boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-4px)',
      transition: 'opacity 0.15s ease, transform 0.15s ease',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// ── Main FilterBar ───────────────────────────────────────────────────────────
export default function FilterBar({
  dateKey, setDateKey,
  activeVenues, setActiveVenues,
  venues,
  milesRadius, setMilesRadius,
  eventCount,
  hasActiveFilters,
  onClearFilters,
  darkMode = true,
}) {
  const C = getPalette(darkMode);
  const [openPanel, setOpenPanel] = useState(null);
  const [venueSearch, setVenueSearch] = useState('');
  const barRef = useRef(null);

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
    { key: 'all',      label: 'All' },
    { key: 'today',    label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'weekend',  label: 'Weekend' },
  ];
  const whenLabel = dateOptions.find(o => o.key === dateKey)?.label || 'All';

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

  // ── Shared dropdown item style ───────────────────────────────
  const dropItem = (selected, accentColor, tint) => ({
    display: 'block', width: '100%', padding: '9px 12px',
    border: 'none', cursor: 'pointer', textAlign: 'left',
    fontSize: '13px', fontWeight: selected ? 600 : 500,
    background: selected ? tint : 'transparent',
    color: selected ? accentColor : C.text,
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background 0.12s',
  });

  return (
    <div ref={barRef} style={{ position: 'relative' }}>
      {/* ── Filter buttons row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

        {/* ── When ── */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => togglePanel('when')} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', cursor: 'pointer',
            background: C.orangeBg, border: `1px solid ${C.btnBorder}`,
            borderRadius: '10px', transition: 'background 0.15s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.orange, lineHeight: 1 }}>When</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.text, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{whenLabel}</span>
            </div>
            <Chevron open={openPanel === 'when'} color={C.orange} />
          </button>

          <Dropdown open={openPanel === 'when'} align="left" minWidth={130} palette={C}>
            {dateOptions.map(opt => (
              <button key={opt.key}
                onClick={() => { setDateKey(opt.key); closeAll(); }}
                style={dropItem(dateKey === opt.key, C.orange, C.orangeBg)}
              >
                {opt.label}
              </button>
            ))}
          </Dropdown>
        </div>

        {/* ── Venue ── */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <button onClick={() => togglePanel('venue')} style={{
            display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
            padding: '6px 12px', cursor: 'pointer',
            background: C.purpleBg, border: `1px solid ${C.btnBorder}`,
            borderRadius: '10px', transition: 'background 0.15s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.purple, lineHeight: 1 }}>Venue</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: venueActive ? C.purple : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>{venueLabel}</span>
            </div>
            <Chevron open={openPanel === 'venue'} color={C.purple} />
          </button>

          <Dropdown open={openPanel === 'venue'} align="left" minWidth={200} palette={C}>
            {/* Sticky "Any" reset option */}
            <button onClick={() => { setActiveVenues([]); closeAll(); }} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '9px 12px',
              background: !venueActive ? C.purpleTint : 'transparent',
              border: 'none', borderBottom: `1px solid ${C.divider}`,
              cursor: 'pointer', transition: 'background 0.12s',
            }}>
              <span style={{ fontSize: '12px', fontWeight: !venueActive ? 700 : 500, color: !venueActive ? C.purple : C.text }}>
                Any (All Venues)
              </span>
              {!venueActive && <span style={{ fontSize: '11px', color: C.purple }}>✓</span>}
            </button>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.divider}` }}>
              <input
                type="text" placeholder="Search venues..."
                value={venueSearch} onChange={e => setVenueSearch(e.target.value)}
                autoFocus={openPanel === 'venue'}
                style={{
                  width: '100%', padding: '6px 8px',
                  background: C.inputBg,
                  border: `1px solid ${C.divider}`,
                  borderRadius: '6px', fontSize: '12px',
                  color: C.text, outline: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {filteredVenues.map(v => {
                const checked = activeVenues.includes(v.name);
                return (
                  <button key={v.name} onClick={() => toggleVenue(v.name)} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '8px 10px',
                    background: checked ? C.purpleTint : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.12s',
                  }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                      border: checked ? 'none' : `1.5px solid ${C.muted}`,
                      background: checked ? C.purple : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: checked ? C.purple : C.text, fontWeight: checked ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.name}
                    </span>
                    <span style={{ fontSize: '10px', color: C.muted }}>{v.count}</span>
                  </button>
                );
              })}
              {filteredVenues.length === 0 && (
                <div style={{ padding: '12px 10px', color: C.muted, fontSize: '12px', textAlign: 'center' }}>No venues found</div>
              )}
            </div>
          </Dropdown>
        </div>

        {/* ── Miles ── */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => togglePanel('miles')} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', cursor: 'pointer',
            background: C.tealBg, border: `1px solid ${C.btnBorder}`,
            borderRadius: '10px', transition: 'background 0.15s',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.teal, lineHeight: 1 }}>Miles</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: milesActive ? C.teal : C.text, whiteSpace: 'nowrap', lineHeight: 1.2 }}>{milesLabel}</span>
            </div>
            <Chevron open={openPanel === 'miles'} color={C.teal} />
          </button>

          <Dropdown open={openPanel === 'miles'} align="right" minWidth={200} palette={C}>
            <div style={{ padding: '12px 12px 10px' }}>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', color: C.muted }}>1 mi</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: milesRadius ? C.teal : C.muted }}>
                    {milesRadius ? `${milesRadius} mi` : 'Any distance'}
                  </span>
                  <span style={{ fontSize: '10px', color: C.muted }}>50 mi</span>
                </div>
                <input type="range" min="1" max="50"
                  className="distance-slider"
                  value={milesRadius || 50}
                  onChange={e => { const v = parseInt(e.target.value); setMilesRadius(v >= 50 ? null : v); }}
                  style={{
                    width: '100%', height: '4px',
                    appearance: 'none', WebkitAppearance: 'none',
                    background: `linear-gradient(to right, ${C.teal} ${((milesRadius || 50) - 1) / 49 * 100}%, ${C.inputBg} 0%)`,
                    borderRadius: '2px', outline: 'none', cursor: 'pointer', accentColor: C.teal,
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[...presets, null].map((p, i) => {
                  const sel = milesRadius === p;
                  return (
                    <button key={i} onClick={() => { setMilesRadius(p); closeAll(); }} style={{
                      flex: 1, padding: '6px 0', borderRadius: '6px',
                      fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: sel ? C.tealTint : C.inputBg,
                      color: sel ? C.teal : C.muted,
                      transition: 'all 0.12s', fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {p === null ? 'Any' : `${p} mi`}
                    </button>
                  );
                })}
              </div>
            </div>
          </Dropdown>
        </div>
      </div>

      {/* ── Event count + clear filters ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 2px 0',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 500, color: C.muted }}>
          {eventCount} event{eventCount !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <button onClick={onClearFilters} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '11px', color: C.muted, padding: '2px 0',
            fontFamily: "'DM Sans', sans-serif", transition: 'color 0.15s',
          }}
            onMouseEnter={e => e.target.style.color = C.text}
            onMouseLeave={e => e.target.style.color = C.muted}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
