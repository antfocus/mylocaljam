'use client';

import { useState } from 'react';

const DEFAULT_CENTER = { lat: 40.2204, lng: -74.0121 }; // Asbury Park, NJ
const DEFAULT_ZOOM   = 13;

// Convert center + zoom into a bbox string for the OSM embed URL
function getBbox(center, zoom) {
  const delta = 0.12 * Math.pow(2, 13 - zoom);
  return [
    center.lng - delta * 1.6,
    center.lat - delta,
    center.lng + delta * 1.6,
    center.lat + delta,
  ].join(',');
}

function buildMapUrl(center, zoom) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${getBbox(center, zoom)}&layer=mapnik`;
}

const CATEGORY_COLORS = {
  'Live Music':    '#E8722A',
  'Music':         '#E8722A',
  'Happy Hour':    '#3AADA0',
  'Happy Hours':   '#3AADA0',
  'Daily Special': '#F59E0B',
  'Community':     '#8B5CF6',
};

export default function MapView({ events = [], onClose, darkMode = true }) {
  const [center,       setCenter]       = useState(DEFAULT_CENTER);
  const [zoom,         setZoom]         = useState(DEFAULT_ZOOM);
  const [mapKey,       setMapKey]       = useState(0); // force iframe reload on search
  const [addressInput, setAddressInput] = useState('');
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState('');

  const mapUrl = buildMapUrl(center, zoom);

  const handleZoomIn  = () => setZoom(z => { const n = Math.min(z + 1, 18); setMapKey(k => k + 1); return n; });
  const handleZoomOut = () => setZoom(z => { const n = Math.max(z - 1, 5);  setMapKey(k => k + 1); return n; });

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressInput)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        setCenter({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        setZoom(13);
        setMapKey(k => k + 1);
      } else {
        setSearchError('Location not found — try a city, address, or zip code.');
      }
    } catch {
      setSearchError('Search failed. Please try again.');
    }
    setSearching(false);
  };

  // Theme
  const bg       = darkMode ? '#1A1A24' : '#FFFFFF';
  const surface  = darkMode ? '#22222E' : '#F9FAFB';
  const border   = darkMode ? '#2A2A3A' : '#E5E7EB';
  const text     = darkMode ? '#F0F0F5' : '#1F2937';
  const muted    = darkMode ? '#7878A0' : '#6B7280';
  const inputBg  = darkMode ? '#14141E' : '#F3F4F6';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      {/* Modal sheet — stops click-through */}
      <div
        style={{ width: '100%', maxWidth: '480px', margin: '0 auto', background: bg, borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: darkMode ? '#3A3A50' : '#D1D5DB' }} />
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 10px', borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: '16px', fontWeight: 800, color: text }}>📍 Map View</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: muted, lineHeight: 1 }}>✕</button>
        </div>

        {/* Address / zip search */}
        <form onSubmit={handleSearch} style={{ padding: '10px 16px 8px', borderBottom: `1px solid ${border}`, display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', background: inputBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '8px 12px' }}>
            <span style={{ fontSize: '13px', color: muted, flexShrink: 0 }}>🔍</span>
            <input
              type="text"
              placeholder="Enter address or zip code…"
              value={addressInput}
              onChange={e => { setAddressInput(e.target.value); setSearchError(''); }}
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '13px', color: text }}
            />
            {addressInput && (
              <button type="button" onClick={() => setAddressInput('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: '13px', padding: 0 }}>✕</button>
            )}
          </div>
          <button
            type="submit"
            disabled={searching || !addressInput.trim()}
            style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: '#E8722A', color: 'white', fontWeight: 700, fontSize: '13px', flexShrink: 0, opacity: (searching || !addressInput.trim()) ? 0.5 : 1 }}
          >
            {searching ? '…' : 'Go'}
          </button>
        </form>

        {searchError && (
          <p style={{ fontSize: '12px', color: '#E8722A', padding: '4px 16px 2px', margin: 0 }}>{searchError}</p>
        )}

        {/* Map + zoom controls */}
        <div style={{ position: 'relative', flexShrink: 0, height: '300px' }}>
          <iframe
            key={`${mapKey}-${center.lat}-${center.lng}-${zoom}`}
            src={mapUrl}
            style={{ width: '100%', height: '300px', border: 'none', display: 'block' }}
            title="Map"
            loading="lazy"
          />

          {/* Zoom buttons */}
          <div style={{ position: 'absolute', right: '10px', bottom: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[
              { label: '+', onClick: handleZoomIn,  disabled: zoom >= 18 },
              { label: '−', onClick: handleZoomOut, disabled: zoom <= 5  },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                disabled={btn.disabled}
                style={{ width: '34px', height: '34px', borderRadius: '8px', border: 'none', cursor: btn.disabled ? 'default' : 'pointer', background: 'white', color: '#1F2937', fontSize: '20px', fontWeight: 700, lineHeight: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', opacity: btn.disabled ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Reset to default area */}
          <button
            onClick={() => { setCenter(DEFAULT_CENTER); setZoom(DEFAULT_ZOOM); setMapKey(k => k + 1); setAddressInput(''); }}
            style={{ position: 'absolute', left: '10px', bottom: '10px', fontSize: '11px', fontWeight: 700, background: 'white', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', color: '#1F2937', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
          >
            📍 Reset
          </button>
        </div>

        {/* Event list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: 0 }}>
            {events.length} event{events.length !== 1 ? 's' : ''} loaded
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {events.slice(0, 10).map((ev, i) => {
              const dot = CATEGORY_COLORS[ev.genre] ?? '#E8722A';
              return (
                <div key={ev.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: surface, borderRadius: '10px', padding: '10px 12px', border: `1px solid ${border}` }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{ev.name}</p>
                    <p style={{ fontSize: '11px', color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{ev.venue}</p>
                  </div>
                  {ev.start_time && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#E8722A', flexShrink: 0 }}>{ev.start_time}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
