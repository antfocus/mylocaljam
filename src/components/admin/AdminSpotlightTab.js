'use client';

import { formatTime } from '@/lib/utils';

export default function AdminSpotlightTab({
  artists, events,
  spotlightDate, setSpotlightDate,
  spotlightPins, setSpotlightPins,
  spotlightEvents, spotlightLoading,
  spotlightSearch, setSpotlightSearch,
  setSpotlightImageWarning,
  fetchSpotlight, fetchSpotlightEvents,
  saveSpotlight, clearSpotlight, toggleSpotlightPin,
}) {
  return (
        <div>
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
            <div className="flex items-center gap-3">
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
            </div>
          </div>

          {/* Pinned events (reorderable list) — filter out stale/deleted pins */}
          {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).length > 0 && (
            <div className="mb-6">
              <h3 className="font-display font-semibold text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pinned Order (drag to reorder)
              </h3>
              <div className="space-y-2">
                {spotlightPins.filter(id => spotlightEvents.some(e => e.id === id)).map((eventId, i) => {
                  const ev = spotlightEvents.find(e => e.id === eventId);
                  return (
                    <div key={eventId} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: '#E8722A44' }}>
                      <span className="text-xs font-bold" style={{ color: '#E8722A', minWidth: '20px' }}>#{i + 1}</span>
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
                          >
                            ↑
                          </button>
                        )}
                        {i < spotlightPins.length - 1 && (
                          <button className="px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-card)' }}
                            onClick={() => setSpotlightPins(prev => { const n = [...prev]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n; })}
                          >
                            ↓
                          </button>
                        )}
                      </div>
                      <button
                        className="p-1.5 rounded text-red-400 hover:text-red-300"
                        onClick={() => toggleSpotlightPin(eventId)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All events for the selected date — click to pin/unpin */}
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
                <button
                  onClick={() => setSpotlightSearch('')}
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
          <div className="space-y-2">
            {spotlightEvents
              .filter(ev => {
                if (!spotlightSearch.trim()) return true;
                const q = spotlightSearch.trim().toLowerCase();
                const artist = (ev.artist_name || '').toLowerCase();
                const venue = (ev.venue_name || ev.venues?.name || '').toLowerCase();
                return artist.includes(q) || venue.includes(q);
              })
              .map(ev => {
                const isPinned = spotlightPins.includes(ev.id);
                // Check for image: event-level, joined artist from API, or artists state array
                const hasImage = !!(ev.image_url || ev.artists?.image_url);
                const linkedArtist = ev.artist_id
                  ? artists.find(a => a.id === ev.artist_id)
                  : artists.find(a => a.name?.toLowerCase() === (ev.artist_name || '').toLowerCase());
                const artistHasImage = !!(linkedArtist?.image_url);
                const effectiveHasImage = hasImage || artistHasImage;
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all"
                    style={{
                      background: isPinned ? 'rgba(232,114,42,0.08)' : 'var(--bg-card)',
                      borderColor: isPinned ? '#E8722A' : 'var(--border)',
                    }}
                    onClick={() => {
                      // If unpinning, always allow
                      if (isPinned) { toggleSpotlightPin(ev.id); return; }
                      // If missing image, show warning modal
                      if (!effectiveHasImage) { setSpotlightImageWarning(ev); return; }
                      toggleSpotlightPin(ev.id);
                    }}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold"
                      style={{
                        background: isPinned ? '#E8722A' : 'var(--bg-elevated)',
                        color: isPinned ? '#111' : 'var(--text-muted)',
                      }}>
                      {isPinned ? '★' : '☆'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {ev.artist_name}
                        {!effectiveHasImage && (
                          <span style={{
                            fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
                            background: 'rgba(234,179,8,0.12)', color: '#EAB308', border: '1px solid rgba(234,179,8,0.25)',
                            fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                          }}>
                            Warning: No Image
                          </span>
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
                  </div>
                );
              })}
            {spotlightEvents.length === 0 && (
              <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>No published events on this date.</p>
            )}
          </div>
        </div>
  );
}