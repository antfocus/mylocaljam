'use client';

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';

// ── Theme (matching page.js DARK/LIGHT) ──────────────────────────────────────
const DARK = {
  bg:         '#0D0D12',
  surface:    '#1A1A24',
  surfaceAlt: '#22222E',
  elevated:   '#252535',
  border:     '#2A2A3A',
  borderLight:'#22222E',
  text:       '#F0F0F5',
  textMuted:  '#7878A0',
  textSubtle: '#4A4A6A',
  accent:     '#E8722A',
  accentAlt:  '#3AADA0',
  navBg:      '#12121A',
  inputBg:    '#22222E',
  cardBg:     '#1A1A24',
  cardHover:  '#222233',
  overlay:    'rgba(0,0,0,0.7)',
  followBg:   '#2A2A3A',
  followText: '#FFFFFF',
};
const LIGHT = {
  bg:         '#F7F5F2',
  surface:    '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  elevated:   '#FFFFFF',
  border:     '#E5E7EB',
  borderLight:'#F3F4F6',
  text:       '#1F2937',
  textMuted:  '#6B7280',
  textSubtle: '#9CA3AF',
  accent:     '#E8722A',
  accentAlt:  '#3AADA0',
  navBg:      '#FFFFFF',
  inputBg:    '#F3F4F6',
  cardBg:     '#FFFFFF',
  cardHover:  '#F9FAFB',
  overlay:    'rgba(0,0,0,0.4)',
  followBg:   '#E5E7EB',
  followText: '#1F2937',
};

// ── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_VENUES = [
  { id: 'v1', name: "Joe's Surf Shack", location: 'Wall Township, NJ', upcoming: 8 },
  { id: 'v2', name: 'The Stone Pony', location: 'Asbury Park, NJ', upcoming: 12 },
  { id: 'v3', name: 'Bar Anticipation', location: 'Lake Como, NJ', upcoming: 5 },
  { id: 'v4', name: "Donovan's Reef", location: 'Sea Bright, NJ', upcoming: 3 },
  { id: 'v5', name: 'The Wonder Bar', location: 'Asbury Park, NJ', upcoming: 9 },
  { id: 'v6', name: 'The Headliner', location: 'Neptune, NJ', upcoming: 6 },
  { id: 'v7', name: 'Beach Haus Brewery', location: 'Belmar, NJ', upcoming: 4 },
  { id: 'v8', name: 'Osprey Hotel', location: 'Manasquan, NJ', upcoming: 7 },
  { id: 'v9', name: 'The Columns', location: 'Avon-by-the-Sea, NJ', upcoming: 2 },
  { id: 'v10', name: "D'Jais", location: 'Belmar, NJ', upcoming: 11 },
  { id: 'v11', name: "Leggett's Sand Bar", location: 'Manasquan, NJ', upcoming: 3 },
  { id: 'v12', name: 'Porta', location: 'Asbury Park, NJ', upcoming: 5 },
];

const MOCK_ARTISTS = [
  { id: 'a1', name: 'DJ Funsize', genre: 'Electronic / DJ', saved: true },
  { id: 'a2', name: 'The Acoustic Duo', genre: 'Acoustic / Folk', saved: false },
  { id: 'a3', name: 'Shore Thing Band', genre: 'Cover Band', saved: true },
  { id: 'a4', name: 'Bobby Bandolier', genre: 'Rock / Blues', saved: false },
  { id: 'a5', name: 'Coastal Frequency', genre: 'Indie Rock', saved: false },
  { id: 'a6', name: 'Emily Paige', genre: 'Singer-Songwriter', saved: true },
  { id: 'a7', name: 'The Jettys', genre: 'Reggae / Ska', saved: false },
  { id: 'a8', name: 'Midnight Social', genre: 'Dance / Pop', saved: false },
  { id: 'a9', name: 'Sarah & The Sundays', genre: 'Indie Pop', saved: true },
  { id: 'a10', name: 'Tidal Wave', genre: 'Punk / Alt Rock', saved: false },
  { id: 'a11', name: 'Vinyl Groove', genre: 'Funk / Soul', saved: false },
  { id: 'a12', name: 'Whiskey River', genre: 'Country / Americana', saved: false },
];

const MOCK_EVENTS = [
  { id: 'e1', artist: 'DJ Funsize', venue: "Joe's Surf Shack", time: '9:00 PM', date: 'Tonight' },
  { id: 'e2', artist: 'The Acoustic Duo', venue: "Joe's Surf Shack", time: '8:00 PM', date: 'Tomorrow' },
  { id: 'e3', artist: 'Shore Thing Band', venue: 'The Stone Pony', time: '8:30 PM', date: 'Fri, Mar 20' },
  { id: 'e4', artist: 'Bobby Bandolier', venue: 'The Stone Pony', time: '10:00 PM', date: 'Sat, Mar 21' },
  { id: 'e5', artist: 'Coastal Frequency', venue: 'Bar Anticipation', time: '7:00 PM', date: 'Tonight' },
  { id: 'e6', artist: 'Emily Paige', venue: 'The Wonder Bar', time: '6:00 PM', date: 'Tomorrow' },
  { id: 'e7', artist: 'Midnight Social', venue: "D'Jais", time: '9:30 PM', date: 'Sat, Mar 21' },
  { id: 'e8', artist: 'Vinyl Groove', venue: 'The Headliner', time: '8:00 PM', date: 'Fri, Mar 20' },
];

// ── Chevron SVG ──────────────────────────────────────────────────────────────
function Chevron({ open, color = '#7878A0', size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{
      transition: 'transform 0.25s ease',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      flexShrink: 0,
    }}>
      <path d="M2 3.5L5 6.5L8 3.5" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Checkbox ─────────────────────────────────────────────────────────────────
function Checkbox({ checked, color = '#a78bfa' }) {
  return (
    <div style={{
      width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
      border: checked ? 'none' : `1.5px solid #4A4A6A`,
      background: checked ? color : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s ease',
    }}>
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: UNIFIED SEARCH & FILTER BLOCK (Airbnb stacked-card style)
// ═══════════════════════════════════════════════════════════════════════════════

function UnifiedSearchBlock({
  darkMode = true,
  eventCount = 42,
  onVenueTap,
  onArtistTap,
  onClose,
  filters,
  setFilters,
}) {
  const t = darkMode ? DARK : LIGHT;
  const [activeCard, setActiveCard] = useState(null); // 'distance' | 'when' | 'venue' | 'artist'
  const containerRef = useRef(null);

  // Destructure filter state from parent
  const { location, radius, dateFilter, selectedVenues, selectedArtists, useCurrentLocation, customZip, pickedDate, showDatePicker } = filters;
  const setLocation = (v) => setFilters(f => ({ ...f, location: v }));
  const setRadius = (v) => setFilters(f => ({ ...f, radius: v }));
  const setDateFilter = (v) => setFilters(f => ({ ...f, dateFilter: v }));
  const setSelectedVenues = (v) => setFilters(f => ({ ...f, selectedVenues: typeof v === 'function' ? v(f.selectedVenues) : v }));
  const setSelectedArtists = (v) => setFilters(f => ({ ...f, selectedArtists: typeof v === 'function' ? v(f.selectedArtists) : v }));
  const [venueSearch, setVenueSearch] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const setUseCurrentLocation = (v) => setFilters(f => ({ ...f, useCurrentLocation: v }));
  const setCustomZip = (v) => setFilters(f => ({ ...f, customZip: v }));
  const setPickedDate = (v) => setFilters(f => ({ ...f, pickedDate: v }));
  const setShowDatePicker = (v) => setFilters(f => ({ ...f, showDatePicker: v }));
  const dateInputRef = useRef(null);
  const datePickInputRef = useRef(null);

  // Outside click is now handled by the scrim in the parent component

  // ── Swipe-down-to-dismiss ──────────────────────────────────────────
  const touchStartY = useRef(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    setSwipeOffset(0);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartY.current === null) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    // Only allow downward swipe
    if (deltaY > 0) {
      setSwipeOffset(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // If swiped down more than 80px, dismiss
    if (swipeOffset > 80) {
      onClose?.();
    }
    setSwipeOffset(0);
    touchStartY.current = null;
  }, [swipeOffset, onClose]);

  const toggleCard = (card) => {
    setActiveCard(activeCard === card ? null : card);
  };

  const dateOptions = [
    { key: 'all', label: 'ALL' },
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'weekend', label: 'Weekend' },
    { key: 'pick', label: 'Pick a Date' },
  ];

  const filteredMockVenues = MOCK_VENUES.filter(v =>
    v.name.toLowerCase().includes(venueSearch.toLowerCase())
  );

  const savedArtists = MOCK_ARTISTS.filter(a => a.saved);
  const trendingArtists = MOCK_ARTISTS.slice(0, 4);
  const allArtists = MOCK_ARTISTS.filter(a =>
    a.name.toLowerCase().includes(artistSearch.toLowerCase())
  );

  const toggleVenue = (id) => {
    setSelectedVenues(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const toggleArtist = (id) => {
    setSelectedArtists(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  // Summary labels
  const distanceLabel = `${radius} mi`;
  const whenLabel = dateFilter === 'pick' && pickedDate
    ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : dateOptions.find(o => o.key === dateFilter)?.label || 'ALL';
  const venueLabel = selectedVenues.length === 0 ? 'Any Venue' : selectedVenues.length === 1
    ? MOCK_VENUES.find(v => v.id === selectedVenues[0])?.name
    : `${selectedVenues.length} venues`;
  const artistLabel = selectedArtists.length === 0 ? 'Any Artist' : selectedArtists.length === 1
    ? MOCK_ARTISTS.find(a => a.id === selectedArtists[0])?.name
    : `${selectedArtists.length} artists`;

  // Lighter filter panel colors
  const panelBg = darkMode ? '#20202E' : '#F5F3F0';
  const panelCardBg = darkMode ? '#262636' : '#FFFFFF';
  const panelCardActiveBg = darkMode ? '#2C2C3E' : '#FAFAF8';

  // Card style helper — compact
  const cardStyle = (isActive, isFirst, isLast) => ({
    background: isActive ? panelCardActiveBg : panelCardBg,
    border: `1px solid ${isActive ? t.accent + '30' : (darkMode ? '#2E2E40' : '#E0DDD8')}`,
    borderRadius: isFirst && isLast ? '10px' : isFirst ? '10px 10px 0 0' : isLast ? '0 0 10px 10px' : '0',
    marginTop: isFirst ? 0 : '-1px',
    overflow: 'hidden',
    transition: 'all 0.15s ease',
  });

  // Material Design icon helper for filter cards
  const MaterialIcon = ({ type, color = t.textMuted }) => {
    const icons = {
      location: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill={color} /></svg>,
      calendar: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" fill={color} /></svg>,
      venue: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 3l.01 10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4.01 4S14 19.21 14 17V7h4V3h-6z" fill={color} /></svg>,
      artist: <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill={color} /></svg>,
    };
    return <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icons[type]}</span>;
  };

  // Card header — compact
  const CardHeader = ({ icon, label, value, isActive, onClick, accentColor }) => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px',
      background: 'transparent', border: 'none', cursor: 'pointer', gap: '8px',
    }}>
      <MaterialIcon type={icon} color={accentColor || t.textMuted} />
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: accentColor || t.textMuted, lineHeight: 1, marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{value}</div>
      </div>
      <Chevron open={isActive} color={accentColor || t.textMuted} size={10} />
    </button>
  );

  return (
    <div ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        padding: '6px 12px 8px',
        transform: swipeOffset > 0 ? `translateY(${Math.min(swipeOffset * 0.5, 60)}px)` : 'none',
        opacity: swipeOffset > 60 ? 0.5 : 1,
        transition: swipeOffset === 0 ? 'transform 0.25s ease, opacity 0.25s ease' : 'none',
      }}>
      {/* ── Drag handle indicator (swipe down to dismiss) ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', padding: '4px 0 2px', cursor: 'grab',
      }}>
        <div style={{
          width: '36px', height: '4px', borderRadius: '2px',
          background: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        }} />
      </div>
      {/* ── Filter panel ── */}
        <div style={{
          borderRadius: '12px', overflow: 'hidden',
          boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.08)',
          background: panelBg,
        }}>

          {/* ── DISTANCE & SEARCH CARD ── */}
          <div style={cardStyle(activeCard === 'distance', true, false)}>
            <CardHeader
              icon="location" label="Where" value={`${useCurrentLocation ? location : (customZip || 'Enter location')} · ${distanceLabel}`}
              isActive={activeCard === 'distance'} onClick={() => toggleCard('distance')}
              accentColor={t.accentAlt}
            />
            {activeCard === 'distance' && (
              <div style={{ padding: '0 12px 8px' }}>
                {/* Location row */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  <button onClick={() => setUseCurrentLocation(true)} style={{
                    flex: 1, padding: '5px 6px', borderRadius: '6px', border: `1px solid ${useCurrentLocation ? t.accentAlt + '60' : (darkMode ? '#2E2E40' : '#DDD')}`,
                    background: useCurrentLocation ? `${t.accentAlt}12` : 'transparent',
                    cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                    color: useCurrentLocation ? t.accentAlt : t.textMuted,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    {useCurrentLocation ? location : 'Current'}
                  </button>
                  <button onClick={() => setUseCurrentLocation(false)} style={{
                    padding: '5px 8px', borderRadius: '6px', border: `1px solid ${!useCurrentLocation ? t.accentAlt + '60' : (darkMode ? '#2E2E40' : '#DDD')}`,
                    background: !useCurrentLocation ? `${t.accentAlt}12` : 'transparent',
                    cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                    color: !useCurrentLocation ? t.accentAlt : t.textMuted,
                    fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
                  }}>
                    ZIP
                  </button>
                </div>
                {!useCurrentLocation && (
                  <input type="text" placeholder="Zip or city..."
                    value={customZip} onChange={e => setCustomZip(e.target.value)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: '6px',
                      border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`, background: t.inputBg,
                      color: t.text, fontSize: '11px', outline: 'none', marginBottom: '6px',
                      fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
                    }}
                  />
                )}
                {/* Radius — single compact row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px', color: t.textMuted }}>5</span>
                  <input type="range" min="5" max="55" value={radius}
                    className="distance-slider"
                    onChange={e => setRadius(parseInt(e.target.value))}
                    style={{
                      flex: 1, height: '3px', appearance: 'none', WebkitAppearance: 'none',
                      background: `linear-gradient(to right, ${t.accentAlt} ${(radius - 5) / 50 * 100}%, ${darkMode ? '#2A2A3A' : '#DDD'} 0%)`,
                      borderRadius: '2px', outline: 'none', cursor: 'pointer', accentColor: t.accentAlt,
                    }}
                  />
                  <span style={{ fontSize: '9px', color: t.textMuted }}>50+</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: t.accentAlt, minWidth: '34px', textAlign: 'right' }}>{radius} mi</span>
                </div>
              </div>
            )}
          </div>

          {/* ── WHEN CARD ── */}
          <div style={cardStyle(activeCard === 'when', false, false)}>
            <CardHeader
              icon="calendar" label="When" value={whenLabel}
              isActive={activeCard === 'when'} onClick={() => toggleCard('when')}
              accentColor={t.accent}
            />
            {activeCard === 'when' && (
              <div style={{ padding: '0 12px 8px' }}>
                {/* Chip row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {dateOptions.filter(o => o.key !== 'pick').map(opt => (
                    <button key={opt.key} onClick={() => {
                      setDateFilter(opt.key); setPickedDate(''); setShowDatePicker(false); setActiveCard(null);
                    }} style={{
                      padding: '10px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                      background: dateFilter === opt.key ? t.accent : (darkMode ? '#2A2A3C' : '#E8E6E2'),
                      color: dateFilter === opt.key ? '#fff' : t.text,
                      fontSize: '14px', fontWeight: dateFilter === opt.key ? 700 : 500,
                      fontFamily: "'DM Sans', sans-serif", transition: 'all 0.12s',
                      minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {opt.label}
                    </button>
                  ))}
                  <label style={{
                    padding: '10px 16px', borderRadius: '20px', border: `1px dashed ${t.textMuted}40`, cursor: 'pointer',
                    background: dateFilter === 'pick' ? t.accent : 'transparent',
                    color: dateFilter === 'pick' ? '#fff' : t.textMuted,
                    fontSize: '14px', fontWeight: dateFilter === 'pick' ? 700 : 500,
                    fontFamily: "'DM Sans', sans-serif",
                    minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {dateFilter === 'pick' && pickedDate
                      ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Pick a Date'}
                    <input ref={datePickInputRef} type="date" value={pickedDate}
                      onChange={(e) => { setPickedDate(e.target.value); setDateFilter('pick'); setShowDatePicker(false); setActiveCard(null); }}
                      style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        opacity: 0, cursor: 'pointer', fontSize: '16px',
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ── VENUE CARD ── */}
          <div style={cardStyle(activeCard === 'venue', false, false)}>
            <CardHeader
              icon="venue" label="Venue" value={venueLabel}
              isActive={activeCard === 'venue'} onClick={() => toggleCard('venue')}
              accentColor="#a78bfa"
            />
            {activeCard === 'venue' && (
              <div style={{ padding: '0 12px 8px' }}>
                <input type="text" placeholder="Search venues..." value={venueSearch} onChange={e => setVenueSearch(e.target.value)} autoFocus
                  style={{
                    width: '100%', padding: '5px 8px', borderRadius: '6px',
                    border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`, background: t.inputBg,
                    color: t.text, fontSize: '11px', outline: 'none', marginBottom: '4px',
                    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
                  }}
                />
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {selectedVenues.length > 0 && (
                    <button onClick={() => setSelectedVenues([])} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', marginBottom: '2px',
                      fontSize: '10px', color: '#a78bfa', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    }}>✕ Clear</button>
                  )}
                  {filteredMockVenues.map(v => {
                    const checked = selectedVenues.includes(v.id);
                    return (
                      <button key={v.id} onClick={() => toggleVenue(v.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                        padding: '5px 4px', background: checked ? 'rgba(167,139,250,0.08)' : 'transparent',
                        border: 'none', cursor: 'pointer', borderRadius: '4px',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        <Checkbox checked={checked} color="#a78bfa" />
                        <span style={{ fontSize: '11px', fontWeight: checked ? 600 : 400, color: checked ? '#a78bfa' : t.text, flex: 1, textAlign: 'left' }}>{v.name}</span>
                        <span style={{ fontSize: '9px', color: t.textMuted }}>{v.upcoming}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── ARTIST CARD ── */}
          <div style={cardStyle(activeCard === 'artist', false, true)}>
            <CardHeader
              icon="artist" label="Artist" value={artistLabel}
              isActive={activeCard === 'artist'} onClick={() => toggleCard('artist')}
              accentColor={t.accent}
            />
            {activeCard === 'artist' && (
              <div style={{ padding: '0 12px 8px' }}>
                <input type="text" placeholder="Search artists..." value={artistSearch} onChange={e => setArtistSearch(e.target.value)} autoFocus
                  style={{
                    width: '100%', padding: '5px 8px', borderRadius: '6px',
                    border: `1px solid ${darkMode ? '#2E2E40' : '#DDD'}`, background: t.inputBg,
                    color: t.text, fontSize: '11px', outline: 'none', marginBottom: '4px',
                    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
                  }}
                />
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {!artistSearch && savedArtists.length > 0 && (
                    <>
                      <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.accent, padding: '3px 4px 2px' }}>Saved</div>
                      {savedArtists.map(a => {
                        const checked = selectedArtists.includes(a.id);
                        return (
                          <button key={a.id} onClick={() => toggleArtist(a.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                            padding: '4px', background: checked ? `${t.accent}10` : 'transparent',
                            border: 'none', cursor: 'pointer', borderRadius: '4px', fontFamily: "'DM Sans', sans-serif",
                          }}>
                            <Checkbox checked={checked} color={t.accent} />
                            <span style={{ fontSize: '11px', fontWeight: checked ? 600 : 400, color: checked ? t.accent : t.text, flex: 1, textAlign: 'left' }}>{a.name}</span>
                            <span style={{ fontSize: '9px', color: t.textMuted }}>{a.genre}</span>
                          </button>
                        );
                      })}
                      <div style={{ height: '1px', background: darkMode ? '#2E2E40' : '#E0DDD8', margin: '3px 0' }} />
                    </>
                  )}
                  {!artistSearch && (
                    <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: t.textMuted, padding: '3px 4px 2px' }}>All</div>
                  )}
                  {allArtists.map(a => {
                    const checked = selectedArtists.includes(a.id);
                    return (
                      <button key={`all-${a.id}`} onClick={() => toggleArtist(a.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                        padding: '4px', background: checked ? `${t.accent}10` : 'transparent',
                        border: 'none', cursor: 'pointer', borderRadius: '4px', fontFamily: "'DM Sans', sans-serif",
                      }}>
                        <Checkbox checked={checked} color={t.accent} />
                        <span style={{ fontSize: '11px', fontWeight: checked ? 600 : 400, color: checked ? t.accent : t.text, flex: 1, textAlign: 'left' }}>{a.name}</span>
                        <span style={{ fontSize: '9px', color: t.textMuted }}>{a.genre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Action bar — compact ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: panelCardBg, borderTop: `1px solid ${darkMode ? '#2E2E40' : '#E0DDD8'}`,
            borderRadius: '0 0 12px 12px', marginTop: '-1px',
          }}>
            <button onClick={() => {
              setSelectedVenues([]); setSelectedArtists([]); setDateFilter('all'); setRadius(15); setPickedDate(''); setShowDatePicker(false);
            }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, color: t.textMuted,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Clear all
            </button>
            <button onClick={() => { onClose?.(); setActiveCard(null); }} style={{
              padding: '7px 18px', borderRadius: '8px', border: 'none',
              background: t.accent, color: 'white', cursor: 'pointer',
              fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            }}>
              Show {eventCount} events
            </button>
          </div>
        </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: BOTTOM SHEET — Venue/Artist Profile
// ═══════════════════════════════════════════════════════════════════════════════

function BottomSheet({ type = 'venue', data, events = [], darkMode = true, onClose, onFollow }) {
  const t = darkMode ? DARK : LIGHT;
  const [following, setFollowing] = useState(false);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleFollow = () => {
    setFollowing(prev => !prev);
    onFollow?.(!following);
  };

  if (!data) return null;

  const isVenue = type === 'venue';
  const name = data.name;
  const subtitle = isVenue ? data.location : data.genre;
  const upcomingCount = events.length;

  return (
    <>
      {/* Overlay */}
      <div onClick={handleClose} style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: t.overlay,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }} />

      {/* Sheet */}
      <div ref={sheetRef} style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 100%)',
        width: '100%', maxWidth: '480px', zIndex: 1600,
        background: t.surface,
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        maxHeight: '55vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.textSubtle }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>{isVenue ? '📍' : '🎤'}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif" }}>{name}</span>
            </div>
            <div style={{ fontSize: '13px', color: t.textMuted, paddingLeft: '28px' }}>{subtitle}</div>
          </div>

          {/* Follow button */}
          <button onClick={handleFollow} style={{
            padding: '8px 18px', borderRadius: '10px', cursor: 'pointer',
            border: following ? 'none' : `1.5px solid ${t.accent}`,
            background: following ? t.followBg : 'transparent',
            color: following ? '#8DD888' : t.accent,
            fontSize: '13px', fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {following ? 'Following ✓' : '+ Follow'}
          </button>
        </div>

        {/* Upcoming shows button */}
        <div style={{ padding: '0 20px 12px' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            padding: '12px 14px', borderRadius: '12px',
            background: `${t.accent}12`, border: `1px solid ${t.accent}30`,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <span style={{ fontSize: '14px' }}>🗓️</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: t.accent }}>
              View All Upcoming Shows ({upcomingCount})
            </span>
          </button>
        </div>

        {/* Upcoming list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {events.map((ev, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 0',
              borderTop: i > 0 ? `1px solid ${t.border}` : 'none',
            }}>
              <div style={{
                background: t.accent, color: 'white', fontSize: '10px', fontWeight: 800,
                padding: '4px 8px', borderRadius: '6px', flexShrink: 0,
                textAlign: 'center', minWidth: '52px',
              }}>
                {ev.time}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: t.text }}>{ev.artist}</div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>{ev.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: SAVED TAB WITH SEGMENTED CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

function SavedTab({ darkMode = true, onVenueTap, onArtistTap }) {
  const t = darkMode ? DARK : LIGHT;
  const [segment, setSegment] = useState('events'); // events | artists | venues

  const savedVenues = MOCK_VENUES.slice(0, 4);
  const savedArtists = MOCK_ARTISTS.filter(a => a.saved);
  const savedEvents = MOCK_EVENTS.slice(0, 5);

  const segments = [
    { key: 'events', label: 'Events' },
    { key: 'artists', label: 'Artists' },
    { key: 'venues', label: 'Venues' },
  ];

  return (
    <div style={{ background: t.bg, flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Title */}
      <div style={{ padding: '16px 20px 12px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", margin: 0 }}>My Saved</h2>
      </div>

      {/* Segmented control */}
      <div style={{
        display: 'flex', margin: '0 16px 16px', padding: '3px',
        background: t.inputBg, borderRadius: '12px',
      }}>
        {segments.map(seg => (
          <button key={seg.key} onClick={() => setSegment(seg.key)} style={{
            flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: segment === seg.key ? t.surface : 'transparent',
            color: segment === seg.key ? t.text : t.textMuted,
            fontSize: '13px', fontWeight: segment === seg.key ? 700 : 500,
            fontFamily: "'DM Sans', sans-serif",
            transition: 'all 0.2s ease',
            boxShadow: segment === seg.key ? (darkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.08)') : 'none',
          }}>
            {seg.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 80px' }}>

        {/* ── Events segment ── */}
        {segment === 'events' && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted, marginBottom: '10px' }}>
              {savedEvents.length} saved events
            </div>
            {savedEvents.map((ev, i) => (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px', borderRadius: '12px', marginBottom: '8px',
                background: t.cardBg, border: `1px solid ${t.border}`,
              }}>
                <div style={{
                  background: t.accent, color: 'white', fontSize: '10px', fontWeight: 800,
                  padding: '4px 8px', borderRadius: '6px', flexShrink: 0, minWidth: '48px', textAlign: 'center',
                }}>
                  {ev.time}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.artist}</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>{ev.venue} · {ev.date}</div>
                </div>
                <span style={{ fontSize: '16px', color: t.accent, cursor: 'pointer' }}>♥</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Artists segment ── */}
        {segment === 'artists' && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted, marginBottom: '10px' }}>
              {savedArtists.length} followed artists
            </div>
            {savedArtists.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px', borderRadius: '12px', marginBottom: '8px',
                background: t.cardBg, border: `1px solid ${t.border}`,
                cursor: 'pointer',
              }}
                onClick={() => onArtistTap?.(a)}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accentAlt})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', flexShrink: 0,
                }}>
                  🎤
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: t.text }}>{a.name}</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>{a.genre}</div>
                </div>
                <button style={{
                  padding: '6px 12px', borderRadius: '8px', border: 'none',
                  background: t.followBg, color: '#8DD888',
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Following ✓
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Venues segment ── */}
        {segment === 'venues' && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted, marginBottom: '10px' }}>
              {savedVenues.length} followed venues
            </div>
            {savedVenues.map(v => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px', borderRadius: '12px', marginBottom: '8px',
                background: t.cardBg, border: `1px solid ${t.border}`,
                cursor: 'pointer',
              }}
                onClick={() => onVenueTap?.(v)}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: `linear-gradient(135deg, #a78bfa, ${t.accentAlt})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', flexShrink: 0,
                }}>
                  📍
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: t.text }}>{v.name}</div>
                  <div style={{ fontSize: '11px', color: t.textMuted }}>{v.upcoming} Upcoming Shows</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    background: t.followBg, color: '#8DD888',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Following ✓
                  </button>
                  <span style={{ color: t.textMuted, fontSize: '14px' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEMO APP — Full interactive prototype
// ═══════════════════════════════════════════════════════════════════════════════

// ── Filter Summary Bar — compact, dismissible chips ─────────────────────────
function FilterSummary({ darkMode, filters, eventCount, onClearAll, onClearFilter }) {
  const t = darkMode ? DARK : LIGHT;
  const { radius, dateFilter, selectedVenues, selectedArtists, pickedDate } = filters;

  const dateOptions = { all: 'All Upcoming', today: 'Today', tomorrow: 'Tomorrow', weekend: 'This Weekend' };
  const whenText = dateFilter === 'pick' && pickedDate
    ? new Date(pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : dateOptions[dateFilter] || 'All Upcoming';

  // Build chip data with individual clear actions
  const chips = [];
  if (radius !== 15) chips.push({ key: 'radius', label: `${radius} mi`, onClear: () => onClearFilter('radius') });
  if (dateFilter !== 'all') chips.push({ key: 'date', label: whenText, onClear: () => onClearFilter('date') });
  if (selectedVenues.length > 0) chips.push({ key: 'venues', label: `${selectedVenues.length} venue${selectedVenues.length > 1 ? 's' : ''}`, onClear: () => onClearFilter('venues') });
  if (selectedArtists.length > 0) chips.push({ key: 'artists', label: `${selectedArtists.length} artist${selectedArtists.length > 1 ? 's' : ''}`, onClear: () => onClearFilter('artists') });

  const hasActiveFilters = chips.length > 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 16px',
      borderBottom: `1px solid ${t.border}`,
      minHeight: '24px',
    }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, flexShrink: 0 }}>
        {eventCount}
      </span>
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: '3px', flex: 1, overflow: 'auto', alignItems: 'center', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {chips.map((chip) => (
            <span key={chip.key} style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              fontSize: '9px', fontWeight: 600, color: t.accentAlt,
              background: `${t.accentAlt}10`, padding: '1px 6px 1px 7px', borderRadius: '9px',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {chip.label}
              <button onClick={chip.onClear} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                display: 'flex', alignItems: 'center', lineHeight: 1, marginLeft: '1px',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.accentAlt} fillOpacity="0.6" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
      {!hasActiveFilters && (
        <span style={{ fontSize: '9px', color: t.textSubtle, flex: 1 }}>All events near you</span>
      )}
      {hasActiveFilters && (
        <button onClick={onClearAll} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '9px', fontWeight: 600, color: t.textSubtle,
          fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
          padding: '1px 2px', whiteSpace: 'nowrap',
        }}>
          Clear all
        </button>
      )}
    </div>
  );
}


export default function SearchFilterRedesign() {
  const [darkMode, setDarkMode] = useState(true);
  const t = darkMode ? DARK : LIGHT;
  const [activeTab, setActiveTab] = useState('home');
  const [bottomSheet, setBottomSheet] = useState(null); // { type, data }
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Lifted filter state
  const [filters, setFilters] = useState({
    location: 'Wall Township',
    radius: 15,
    dateFilter: 'all',
    selectedVenues: [],
    selectedArtists: [],
    useCurrentLocation: true,
    customZip: '',
    pickedDate: '',
    showDatePicker: false,
  });

  const clearAllFilters = () => {
    setFilters({
      location: 'Wall Township',
      radius: 15,
      dateFilter: 'all',
      selectedVenues: [],
      selectedArtists: [],
      useCurrentLocation: true,
      customZip: '',
      pickedDate: '',
      showDatePicker: false,
    });
  };

  const clearSingleFilter = (filterKey) => {
    switch (filterKey) {
      case 'radius': setFilters(f => ({ ...f, radius: 15 })); break;
      case 'date': setFilters(f => ({ ...f, dateFilter: 'all', pickedDate: '', showDatePicker: false })); break;
      case 'venues': setFilters(f => ({ ...f, selectedVenues: [] })); break;
      case 'artists': setFilters(f => ({ ...f, selectedArtists: [] })); break;
      default: break;
    }
  };

  // Check if any filters are active (for search bar indicator)
  const hasActiveFilters = filters.radius !== 15 || filters.dateFilter !== 'all' || filters.selectedVenues.length > 0 || filters.selectedArtists.length > 0;
  const activeFilterCount = [filters.radius !== 15, filters.dateFilter !== 'all', filters.selectedVenues.length > 0, filters.selectedArtists.length > 0].filter(Boolean).length;

  // Dynamic event count based on active filters
  const filteredEventCount = useMemo(() => {
    let events = [...MOCK_EVENTS];
    // Filter by date
    if (filters.dateFilter === 'today') {
      events = events.filter(e => e.date === 'Tonight');
    } else if (filters.dateFilter === 'tomorrow') {
      events = events.filter(e => e.date === 'Tomorrow');
    } else if (filters.dateFilter === 'weekend') {
      events = events.filter(e => e.date !== 'Tonight' && e.date !== 'Tomorrow');
    }
    // Filter by selected venues
    if (filters.selectedVenues.length > 0) {
      const venueNames = filters.selectedVenues.map(id => MOCK_VENUES.find(v => v.id === id)?.name).filter(Boolean);
      events = events.filter(e => venueNames.includes(e.venue));
    }
    // Filter by selected artists
    if (filters.selectedArtists.length > 0) {
      const artistNames = filters.selectedArtists.map(id => MOCK_ARTISTS.find(a => a.id === id)?.name).filter(Boolean);
      events = events.filter(e => artistNames.includes(e.artist));
    }
    return events.length;
  }, [filters.dateFilter, filters.selectedVenues, filters.selectedArtists]);

  const openVenueSheet = (venue) => {
    const venueEvents = MOCK_EVENTS.filter(e => e.venue === venue.name);
    setBottomSheet({ type: 'venue', data: venue, events: venueEvents });
  };

  const openArtistSheet = (artist) => {
    const artistEvents = MOCK_EVENTS.filter(e => e.artist === artist.name);
    setBottomSheet({ type: 'artist', data: artist, events: artistEvents });
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: t.bg, maxWidth: '480px', margin: '0 auto',
      fontFamily: "'DM Sans', sans-serif", position: 'relative',
      width: '100%',
    }}>

      {/* ── Scrim overlay ── */}
      <div
        onClick={() => setFiltersExpanded(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.65)',
          opacity: filtersExpanded ? 1 : 0,
          pointerEvents: filtersExpanded ? 'auto' : 'none',
          transition: 'opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />

      {/* ── Sticky Header with Omnibar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 110,
        background: darkMode ? '#1E1E2C' : '#FFFFFF',
        borderBottom: filtersExpanded ? 'none' : `1px solid ${t.border}`,
        boxShadow: filtersExpanded
          ? (darkMode ? '0 8px 40px rgba(0,0,0,0.7)' : '0 4px 30px rgba(0,0,0,0.15)')
          : (darkMode ? '0 2px 16px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.08)'),
        transition: 'box-shadow 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
      }}>
        {/* Top row: logo + search pill + actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 12px',
        }}>
          {/* Logo — full */}
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, flexShrink: 0 }}>
            <span style={{ color: darkMode ? '#FFFFFF' : '#1F2937' }}>my</span>
            <span style={{ color: '#E8722A' }}>Local</span>
            <span style={{ color: '#3AADA0' }}>Jam</span>
          </span>

          {/* Spacer between logo and search */}
          <div style={{ width: '8px', flexShrink: 0 }} />

          {/* Omnibar pill — Glow & Badge approach */}
          <button onClick={() => setFiltersExpanded(e => !e)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
            padding: '7px 10px',
            background: darkMode ? '#1E1E2A' : '#EDECEA',
            border: `1px solid ${
              filtersExpanded ? t.accentAlt
              : hasActiveFilters ? t.accentAlt
              : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
            }`,
            borderRadius: '20px', cursor: 'pointer', position: 'relative',
            boxShadow: filtersExpanded
              ? `0 0 0 1px ${t.accentAlt}40, 0 0 8px ${t.accentAlt}25`
              : hasActiveFilters
                ? `0 0 6px ${t.accentAlt}30, 0 0 12px ${t.accentAlt}15`
                : (darkMode ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(0,0,0,0.06)'),
            transition: 'all 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          }}>
            {/* Material Search icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={t.textMuted} />
            </svg>

            {/* Search text — always visible, never overwritten */}
            <span style={{
              fontSize: '12px', fontWeight: 500,
              color: filtersExpanded ? t.accentAlt : t.textMuted,
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
              transition: 'color 0.2s ease',
            }}>
              Search / Filters
            </span>

            {/* Active filter pills — appear inside bar when filters are set */}
            {hasActiveFilters && !filtersExpanded && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                {/* Separator dot */}
                <span style={{ color: t.textMuted, fontSize: '8px', opacity: 0.5, flexShrink: 0 }}>|</span>
                {/* Date pill */}
                {filters.dateFilter !== 'all' && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '2px',
                    fontSize: '9px', fontWeight: 600, color: t.accentAlt,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" fill={t.accentAlt} />
                    </svg>
                    {filters.dateFilter === 'pick' && filters.pickedDate
                      ? new Date(filters.pickedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : { today: 'Today', tomorrow: 'Tmrw', weekend: 'Wknd' }[filters.dateFilter] || filters.dateFilter}
                  </span>
                )}
                {/* Distance pill */}
                {filters.radius !== 15 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '2px',
                    fontSize: '9px', fontWeight: 600, color: t.accentAlt,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill={t.accentAlt} />
                    </svg>
                    {filters.radius}mi
                  </span>
                )}
                {/* Venue pill */}
                {filters.selectedVenues.length > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '2px',
                    fontSize: '9px', fontWeight: 600, color: t.accentAlt,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill={t.accentAlt} />
                    </svg>
                    {filters.selectedVenues.length}
                  </span>
                )}
                {/* Artist pill */}
                {filters.selectedArtists.length > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '2px',
                    fontSize: '9px', fontWeight: 600, color: t.accentAlt,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill={t.accentAlt} />
                    </svg>
                    {filters.selectedArtists.length}
                  </span>
                )}
              </div>
            )}

            {/* Spacer when no pills */}
            {(!hasActiveFilters || filtersExpanded) && <div style={{ flex: 1 }} />}

            {/* Right side: badge count or tune/close icon */}
            {filtersExpanded ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={t.accentAlt} />
              </svg>
            ) : hasActiveFilters ? (
              /* Active badge — shows count in teal */
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                fontSize: '9px', fontWeight: 700, color: darkMode ? '#1E1E2A' : '#FFFFFF',
                background: t.accentAlt, borderRadius: '8px',
                padding: '1px 5px', flexShrink: 0, lineHeight: '14px',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={darkMode ? '#1E1E2A' : '#FFFFFF'} />
                </svg>
                {activeFilterCount}
              </span>
            ) : (
              /* Default tune icon */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" fill={t.textMuted} />
              </svg>
            )}
          </button>

          {/* Theme toggle */}
          <button onClick={() => setDarkMode(d => !d)} style={{
            background: 'none', border: `1px solid ${t.border}`, borderRadius: '8px',
            padding: '4px 6px', cursor: 'pointer', fontSize: '11px', color: t.textMuted, flexShrink: 0,
          }}>
            {darkMode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" fill={t.textMuted} /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9.5 2c-1.82 0-3.53.5-5 1.35 2.99 1.73 5 4.95 5 8.65s-2.01 6.92-5 8.65A9.973 9.973 0 009.5 22c5.52 0 10-4.48 10-10S15.02 2 9.5 2z" fill={t.textMuted} /></svg>
            )}
          </button>
          <button style={{
            width: '26px', height: '26px', borderRadius: '50%', border: 'none',
            background: t.accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {/* Material Add icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="white" />
            </svg>
          </button>
        </div>

        {/* ── Container Transform: filter panel expands from header ── */}
        <div style={{
          maxHeight: filtersExpanded ? '500px' : '0px',
          opacity: filtersExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: filtersExpanded
            ? 'max-height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease'
            : 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
          background: darkMode ? '#1A1A28' : '#F2F0ED',
          borderTop: filtersExpanded ? `1px solid ${darkMode ? '#2A2A3A' : '#E0DDD8'}` : 'none',
        }}>
          {activeTab === 'home' && (
            <UnifiedSearchBlock
              darkMode={darkMode}
              eventCount={filteredEventCount}
              onVenueTap={openVenueSheet}
              onArtistTap={openArtistSheet}
              onClose={() => setFiltersExpanded(false)}
              filters={filters}
              setFilters={setFilters}
            />
          )}
        </div>
      </header>

      {/* ── Hero placeholder (home only) ── */}
      {activeTab === 'home' && (
        <div style={{
          background: `linear-gradient(135deg, ${darkMode ? '#1A1024' : '#FFF5EE'}, ${darkMode ? '#0D1520' : '#EEF8F7'})`,
          padding: '28px 20px',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
            Tonight's Spotlight
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: t.text, fontFamily: "'Outfit', sans-serif", marginBottom: '4px' }}>
            DJ Funsize
          </div>
          <div style={{ fontSize: '13px', color: t.textMuted }}>
            Joe's Surf Shack · 9:00 PM · Wall Township
          </div>
        </div>
      )}

      {/* ── Main content area ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>

        {/* Home — mock event list */}
        {activeTab === 'home' && (
          <div style={{ padding: '12px 16px' }}>
            {/* Date separator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0 8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted }}>Tonight</span>
              <div style={{ flex: 1, height: '1px', background: t.border }} />
            </div>
            {/* Mock event cards */}
            {MOCK_EVENTS.filter(e => e.date === 'Tonight').map(ev => (
              <div key={ev.id} style={{
                display: 'flex', background: t.cardBg, borderRadius: '12px',
                border: `1px solid ${t.border}`, overflow: 'hidden', marginBottom: '8px',
                boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)',
              }}>
                <div style={{ width: '4px', background: t.accent, flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', flex: 1 }}>
                  <div style={{
                    background: t.accent, color: 'white', fontSize: '11px', fontWeight: 800,
                    padding: '3px 7px', borderRadius: '6px', flexShrink: 0, minWidth: '44px', textAlign: 'center',
                  }}>
                    {ev.time}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill={t.textMuted} /></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.artist}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openVenueSheet(MOCK_VENUES.find(v => v.name === ev.venue) || { name: ev.venue, location: 'NJ' }); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#4DB8B2', fontWeight: 500 }}
                    >
                      {ev.venue}
                    </button>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer', flexShrink: 0 }}><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" fill={t.textSubtle} /></svg>
                </div>
              </div>
            ))}

            {/* Tomorrow group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0 8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted }}>Tomorrow</span>
              <div style={{ flex: 1, height: '1px', background: t.border }} />
            </div>
            {MOCK_EVENTS.filter(e => e.date === 'Tomorrow').map(ev => (
              <div key={ev.id} style={{
                display: 'flex', background: t.cardBg, borderRadius: '12px',
                border: `1px solid ${t.border}`, overflow: 'hidden', marginBottom: '8px',
                boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)',
              }}>
                <div style={{ width: '4px', background: t.accentAlt, flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', flex: 1 }}>
                  <div style={{
                    background: t.accentAlt, color: 'white', fontSize: '11px', fontWeight: 800,
                    padding: '3px 7px', borderRadius: '6px', flexShrink: 0, minWidth: '44px', textAlign: 'center',
                  }}>
                    {ev.time}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill={t.textMuted} /></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: t.text }}>{ev.artist}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openVenueSheet(MOCK_VENUES.find(v => v.name === ev.venue) || { name: ev.venue, location: 'NJ' }); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#4DB8B2', fontWeight: 500 }}
                    >
                      {ev.venue}
                    </button>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer', flexShrink: 0 }}><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" fill={t.textSubtle} /></svg>
                </div>
              </div>
            ))}

            {/* Weekend group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0 8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: t.textMuted }}>This Weekend</span>
              <div style={{ flex: 1, height: '1px', background: t.border }} />
            </div>
            {MOCK_EVENTS.filter(e => e.date !== 'Tonight' && e.date !== 'Tomorrow').map(ev => (
              <div key={ev.id} style={{
                display: 'flex', background: t.cardBg, borderRadius: '12px',
                border: `1px solid ${t.border}`, overflow: 'hidden', marginBottom: '8px',
                boxShadow: darkMode ? '0 2px 12px rgba(0,0,0,0.35)' : '0 1px 6px rgba(0,0,0,0.07)',
              }}>
                <div style={{ width: '4px', background: '#a78bfa', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', flex: 1 }}>
                  <div style={{
                    background: '#a78bfa', color: 'white', fontSize: '11px', fontWeight: 800,
                    padding: '3px 7px', borderRadius: '6px', flexShrink: 0, minWidth: '44px', textAlign: 'center',
                  }}>
                    {ev.time}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.22 0-4.01 1.79-4.01 4.01S7.79 21 10.01 21 14 19.21 14 17V7h4V3h-6z" fill={t.textMuted} /></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: t.text }}>{ev.artist}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openVenueSheet(MOCK_VENUES.find(v => v.name === ev.venue) || { name: ev.venue, location: 'NJ' }); }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: '#4DB8B2', fontWeight: 500 }}
                    >
                      {ev.venue}
                    </button>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer', flexShrink: 0 }}><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" fill={t.textSubtle} /></svg>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Saved Tab (Phase 3) */}
        {activeTab === 'saved' && (
          <SavedTab darkMode={darkMode} onVenueTap={openVenueSheet} onArtistTap={openArtistSheet} />
        )}

        {/* Profile stub */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 32px', textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${t.accent}, ${t.accentAlt})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="36" height="36" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="white" /></svg>
            </div>
            <p style={{ fontWeight: 800, fontSize: '18px', color: t.text, marginTop: '16px' }}>Your Profile</p>
            <p style={{ fontSize: '13px', color: t.textMuted }}>Sign in to save events across devices</p>
          </div>
        )}
      </div>

      {/* ── Bottom Navigation ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: t.navBg, borderTop: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 calc(8px + env(safe-area-inset-bottom))',
        boxShadow: darkMode ? '0 -2px 20px rgba(0,0,0,0.5)' : '0 -2px 12px rgba(0,0,0,0.06)',
      }}>
        {[
          { key: 'home', label: 'Home', path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
          { key: 'saved', label: 'Saved', path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
          { key: 'profile', label: 'Profile', path: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 16px',
              color: isActive ? t.accent : t.textMuted,
              transition: 'color 0.15s',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d={tab.path} fill={isActive ? t.accent : t.textMuted} />
              </svg>
              <span style={{ fontSize: '10px', fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Bottom Sheet (Phase 2) ── */}
      {bottomSheet && (
        <BottomSheet
          type={bottomSheet.type}
          data={bottomSheet.data}
          events={bottomSheet.events || []}
          darkMode={darkMode}
          onClose={() => setBottomSheet(null)}
          onFollow={(following) => console.log(`${following ? 'Followed' : 'Unfollowed'} ${bottomSheet.data.name}`)}
        />
      )}
    </div>
  );
}
