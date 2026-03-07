'use client';

/**
 * MapView.js
 * ──────────
 * Map view panel with radius control and nearby event list.
 * Drop into: src/components/MapView.js
 *
 * This component is intentionally map-library-agnostic.
 * It renders a placeholder map area with a "Search this area" CTA.
 * When you're ready to add a real map, swap the <MapPlaceholder>
 * section for your preferred library (Leaflet, Mapbox, Google Maps, etc.)
 *
 * Props:
 *   events   – array of event objects from your existing query
 *   onClose  – fn() => void  (back to list view)
 */

import { useState } from 'react';

const RADIUS_OPTIONS = [5, 10, 25];

const CATEGORY_COLORS = {
  'Live Music':    '#E8722A',
  'Music':         '#E8722A',
  'Happy Hour':    '#3AADA0',
  'Happy Hours':   '#3AADA0',
  'Daily Special': '#7C3AED',
  'Community':     '#D97706',
};

function formatTime(timeStr) {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':');
    const d = new Date(); d.setHours(+h, +m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return timeStr; }
}

function MapPlaceholder({ events = [] }) {
  /**
   * ─── SWAP THIS COMPONENT FOR A REAL MAP LIBRARY ───────────────────
   * e.g. with Leaflet:
   *   import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
   *   <MapContainer center={[40.22, -74.01]} zoom={13} style={{height:'100%'}}>
   *     <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
   *     {events.map(e => <Marker key={e.id} position={[e.lat, e.lng]}> ... </Marker>)}
   *   </MapContainer>
   * ──────────────────────────────────────────────────────────────────
   */
  return (
    <div className="relative w-full h-full flex items-center justify-center"
         style={{ background: '#e8e0d8' }}>

      {/* Stylised road grid – pure CSS, replace with real map */}
      <svg className="absolute inset-0 w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
        {/* Horizontal roads */}
        <rect x="0" y="38%" width="100%" height="8"  fill="white" />
        <rect x="0" y="62%" width="100%" height="8"  fill="white" />
        <rect x="0" y="22%" width="100%" height="5"  fill="white" opacity="0.7" />
        <rect x="0" y="78%" width="100%" height="5"  fill="white" opacity="0.7" />
        {/* Vertical roads */}
        <rect x="35%" y="0" width="8"  height="100%" fill="white" />
        <rect x="65%" y="0" width="8"  height="100%" fill="white" />
        <rect x="20%" y="0" width="5"  height="100%" fill="white" opacity="0.7" />
        {/* Parks */}
        <rect x="18%" y="12%" width="100" height="70" rx="8" fill="#c8dba0" />
        <rect x="72%" y="60%" width="80"  height="55" rx="8" fill="#c8dba0" />
        {/* Buildings */}
        <rect x="42%" y="18%" width="40" height="28" rx="3" fill="#cdc8c0" />
        <rect x="55%" y="44%" width="55" height="22" rx="3" fill="#cdc8c0" />
      </svg>

      {/* Pin overlays */}
      {events.slice(0, 4).map((ev, i) => {
        const positions = [
          { left: '37%', top: '40%' },
          { left: '62%', top: '34%' },
          { left: '50%', top: '58%' },
          { left: '28%', top: '70%' },
        ];
        const pos   = positions[i] ?? positions[0];
        const color = CATEGORY_COLORS[ev.genre] ?? '#E8722A';
        return (
          <div key={ev.id ?? i}
               className="absolute z-10 cursor-pointer"
               style={{ ...pos, transform: 'translate(-50%, -100%)' }}>
            <div className="w-9 h-9 rounded-tl-full rounded-tr-full rounded-br-full
                            flex items-center justify-center shadow-lg text-white text-sm
                            rotate-[-45deg]"
                 style={{ background: color }}>
              <span className="rotate-45">🎵</span>
            </div>
          </div>
        );
      })}

      {/* "Search this area" CTA */}
      <button className="absolute top-3 left-1/2 -translate-x-1/2 z-20
                         flex items-center gap-2 text-white text-sm font-bold
                         px-5 py-2 rounded-full whitespace-nowrap"
              style={{
                background: '#2D2D2D',
                boxShadow: '0 4px 12px rgba(0,0,0,0.28)'
              }}>
        🔍 Search this area
      </button>
    </div>
  );
}

export default function MapView({ events = [], onClose }) {
  const [radius, setRadius] = useState(5);

  const nearby = events.slice(0, 6); // replace with real distance filter when lat/lng available

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Map area */}
      <div className="relative flex-shrink-0 h-64">
        <MapPlaceholder events={nearby} />
      </div>

      {/* Radius selector */}
      <div className="bg-white px-4 py-3 border-b" style={{ borderColor: '#E5E1DC' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold" style={{ color: '#2D2D2D' }}>
            Search Radius
          </span>
          <span className="text-sm font-bold" style={{ color: '#E8722A' }}>
            {radius} miles
          </span>
        </div>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map(r => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className="flex-1 py-1.5 rounded-xl text-sm font-bold border-2 transition-all duration-150"
              style={radius === r ? {
                borderColor: '#E8722A', color: '#E8722A',
                background: 'rgba(232,114,42,0.06)'
              } : {
                borderColor: '#E5E1DC', color: '#6B7280',
                background: 'white'
              }}>
              {r} mi
            </button>
          ))}
        </div>
      </div>

      {/* Nearby event mini-list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <h3 className="text-base font-extrabold" style={{ color: '#2D2D2D' }}>
            {nearby.length} events nearby
          </h3>
          {onClose && (
            <button onClick={onClose}
                    className="text-xs font-bold"
                    style={{ color: '#E8722A' }}>
              ← List view
            </button>
          )}
        </div>

        <div className="px-4 pb-24 flex flex-col gap-2.5">
          {nearby.map((ev, i) => {
            const color = CATEGORY_COLORS[ev.genre] ?? '#E8722A';
            return (
              <div key={ev.id ?? i}
                   className="flex items-center gap-3 bg-white rounded-xl p-3 cursor-pointer"
                   style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                     style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold truncate" style={{ color: '#2D2D2D' }}>
                    {ev.name}
                  </p>
                  <p className="text-xs font-medium truncate" style={{ color: '#6B7280' }}>
                    {ev.venue}
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                      style={{ background: '#F7F5F2', color: '#2D2D2D' }}>
                  {ev.start_time ? formatTime(ev.start_time) : 'TBD'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
