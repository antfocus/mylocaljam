'use client';

import { useState, useEffect, useRef } from 'react';

const DEFAULT_CENTER = [40.2204, -74.0121]; // Asbury Park, NJ
const DEFAULT_ZOOM   = 12;

export default function MapView({ events = [], onClose, darkMode = true }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const [addressInput,  setAddressInput]  = useState('');
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState('');
  const [pinStatus,     setPinStatus]     = useState('Loading venue pins…');

  // ── Load Leaflet from CDN and init map ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const init = async () => {
      // Inject Leaflet CSS once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id   = 'leaflet-css';
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load Leaflet JS if not already present
      if (!window.L) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          s.onload  = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      if (!mapContainerRef.current) return;

      const L = window.L;

      // Fix broken default icon paths in Next.js
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

      // OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

      // Custom zoom control (bottom-right)
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;

      // Geocode & pin each unique venue
      await pinVenues(map, L, events, setPinStatus);
    };

    init().catch(console.error);

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ── Address / zip search ────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    const raw = addressInput.trim();
    if (!raw || !mapRef.current) return;
    setSearching(true);
    setSearchError('');

    try {
      const isZip = /^\d{5}(-\d{4})?$/.test(raw);

      // Build the best possible query string for Nominatim
      // For zip codes, append country so it resolves correctly
      // For addresses, if no state/country clue, nudge toward NJ
      let query;
      if (isZip) {
        query = `${raw}, USA`;
      } else if (/\b(nj|new jersey|ny|pa|de|md)\b/i.test(raw)) {
        query = raw; // already has state context
      } else {
        query = `${raw}, NJ, USA`; // default to NJ area
      }

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'myLocalJam/1.0' } });
      const data = await res.json();

      if (data?.length > 0) {
        mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], isZip ? 13 : 14);
      } else {
        setSearchError('Location not found — try a full address or zip code.');
      }
    } catch { setSearchError('Search failed. Please try again.'); }
    setSearching(false);
  };

  // ── Theme ───────────────────────────────────────────────────────────────────
  const bg      = darkMode ? '#1A1A24' : '#FFFFFF';
  const surface = darkMode ? '#22222E' : '#F9FAFB';
  const border  = darkMode ? '#2A2A3A' : '#E5E7EB';
  const text    = darkMode ? '#F0F0F5' : '#1F2937';
  const muted   = darkMode ? '#7878A0' : '#6B7280';
  const inputBg = darkMode ? '#14141E' : '#F3F4F6';

  // Unique venue names for the list
  const uniqueVenues = [...new Set(events.map(e => e.venue).filter(Boolean))];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '480px', margin: '0 auto', background: bg, borderRadius: '20px 20px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: darkMode ? '#3A3A50' : '#D1D5DB' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 10px', borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: '16px', fontWeight: 800, color: text }}>📍 Map View</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: muted }}>✕</button>
        </div>

        {/* Address search */}
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
        {searchError && <p style={{ fontSize: '12px', color: '#E8722A', padding: '4px 16px 2px', margin: 0 }}>{searchError}</p>}

        {/* Map */}
        <div
          ref={mapContainerRef}
          style={{ flexShrink: 0, height: '300px', width: '100%' }}
        />

        {/* Venue list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>
            {uniqueVenues.length} venue{uniqueVenues.length !== 1 ? 's' : ''} · {events.length} event{events.length !== 1 ? 's' : ''}
            {pinStatus && <span style={{ marginLeft: '8px', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({pinStatus})</span>}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {uniqueVenues.map((venue, i) => {
              const venueEvents = events.filter(e => e.venue === venue);
              return (
                <div key={i} style={{ background: surface, borderRadius: '10px', padding: '10px 12px', border: `1px solid ${border}` }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: text, margin: '0 0 4px' }}>{venue}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {venueEvents.slice(0, 3).map((ev, j) => (
                      <p key={j} style={{ fontSize: '11px', color: muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#E8722A', fontWeight: 700 }}>{ev.start_time || '—'}</span> {ev.name}
                      </p>
                    ))}
                    {venueEvents.length > 3 && (
                      <p style={{ fontSize: '11px', color: muted, margin: 0 }}>+{venueEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Geocode venues and drop pins ────────────────────────────────────────────
async function pinVenues(map, L, events, setStatus) {
  const venueMap = {};
  events.forEach(e => {
    if (!e.venue) return;
    if (!venueMap[e.venue]) venueMap[e.venue] = { address: e.venue_address || '', events: [] };
    venueMap[e.venue].events.push(e);
  });

  const venues  = Object.entries(venueMap);
  let   pinned  = 0;

  for (const [name, info] of venues) {
    try {
      const query = info.address
        ? `${info.address}, New Jersey, USA`
        : `${name}, New Jersey, USA`;

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'myLocalJam/1.0' } });
      const data = await res.json();
      if (data?.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        // Custom orange pin
        const icon = L.divIcon({
          html: `<div style="
            width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
            background:#E8722A;display:flex;align-items:center;justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,0.45);border:2px solid white;
          "><span style="transform:rotate(45deg);font-size:12px">🎵</span></div>`,
          iconSize:   [28, 28],
          iconAnchor: [14, 28],
          className:  '',
        });

        const evLines = info.events.slice(0, 4)
          .map(e => `<div style="font-size:11px;padding:1px 0;color:#444">${e.start_time || '—'} · ${e.name}</div>`)
          .join('');

        L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-weight:800;font-size:13px;margin-bottom:4px">${name}</div>${evLines}`, { maxWidth: 200 });

        pinned++;
        setStatus(`${pinned} pin${pinned !== 1 ? 's' : ''} placed`);
      }
    } catch { /* skip this venue */ }

    // Respect Nominatim rate limit (1 req/sec)
    await new Promise(r => setTimeout(r, 1100));
  }

  setStatus(pinned > 0 ? `${pinned} venue${pinned !== 1 ? 's' : ''} on map` : 'Pins unavailable');
}
