'use client';

import { safeHref } from '@/lib/safeHref';

/**
 * Venue Scrapers sub-tab — formerly the entire AdminVenuesTab.js.
 * Now lives as a child of AdminVenuesTab alongside AdminVenuesDirectory.
 *
 * Pure relocation of the prior scraper-health view: status filter, platform
 * chips, per-venue rows with default-start-time inline editor, force-sync
 * button, and platform badge. Behavior unchanged — just moved.
 */

export default function AdminVenuesScrapers({
  venues,
  scraperHealth, venuesFilter, setVenuesFilter,
  forceSyncing, handleForceSync,
  updateVenueDefaultTime,
}) {
  // Build a lookup from venue name → venue record (for default_start_time)
  const venueByName = {};
  (venues || []).forEach(v => { venueByName[v.name?.toLowerCase()] = v; });

  // Platform colors for read-only badges (auto-populated from VENUE_REGISTRY in sync route)
  const PLATFORM_COLORS = {
    'WordPress': '#21759B', 'WordPress AJAX': '#21759B', 'Squarespace': '#5B8A72',
    'Wix': '#0C6EFC', 'BentoBox/Wix': '#0C6EFC', 'Google Calendar': '#4285F4',
    'Eventbrite API': '#F05537', 'Ticketmaster API': '#026CDF', 'GraphQL': '#E535AB',
    'HTML Scrape': '#E8722A', 'RestaurantPassion': '#8B5CF6', 'Image Poster': '#D97706', 'Custom': '#6B7280', 'Unknown': '#6B7280',
  };

  // Filter by status OR platform
  let filtered = scraperHealth;
  if (venuesFilter !== 'all') {
    if (['fail', 'warning', 'success'].includes(venuesFilter)) {
      filtered = filtered.filter(s => s.status === venuesFilter);
    } else {
      filtered = filtered.filter(s => (s.platform || 'Unknown') === venuesFilter);
    }
  }
  const failCount = scraperHealth.filter(s => s.status === 'fail').length;
  const warnCount = scraperHealth.filter(s => s.status === 'warning').length;
  const okCount = scraperHealth.filter(s => s.status === 'success').length;
  const platforms = [...new Set(scraperHealth.map(s => s.platform || 'Unknown'))].sort();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
          {scraperHealth.length} scraper{scraperHealth.length === 1 ? '' : 's'} configured
        </span>
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
          {[
            { key: 'all', label: `All` },
            { key: 'fail', label: `Failed (${failCount})` },
            { key: 'warning', label: `Warn (${warnCount})` },
            { key: 'success', label: `OK (${okCount})` },
          ].map(seg => (
            <button
              key={seg.key}
              onClick={() => setVenuesFilter(seg.key)}
              style={{
                padding: '6px 10px', fontSize: '11px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                background: 'none', border: 'none',
                color: venuesFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                borderBottom: venuesFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

      {platforms.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {platforms.map(p => (
            <button
              key={p}
              onClick={() => setVenuesFilter(venuesFilter === p ? 'all' : p)}
              style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
                background: venuesFilter === p ? (PLATFORM_COLORS[p] || '#6B7280') : 'var(--bg-elevated)',
                color: venuesFilter === p ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.12s ease',
              }}
            >
              {p} ({scraperHealth.filter(s => (s.platform || 'Unknown') === p).length})
            </button>
          ))}
        </div>
      )}

      {scraperHealth.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
            No scraper health data yet. Run a sync to populate.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const statusStyle = {
              success: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'OK' },
              fail: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'FAIL' },
              warning: { bg: 'rgba(234,179,8,0.12)', color: '#EAB308', label: 'WARN' },
            }[s.status] || { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', label: '?' };
            const platColor = PLATFORM_COLORS[s.platform] || '#6B7280';

            return (
              <div key={s.scraper_key} style={{
                padding: '12px 16px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <span style={{
                  fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px',
                  background: statusStyle.bg, color: statusStyle.color,
                  fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.5px',
                  minWidth: '44px', textAlign: 'center',
                }}>
                  {statusStyle.label}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {s.venue_name}
                    </span>
                    {/* safeHref drops non-http(s) URLs (security audit H4). */}
                    {safeHref(s.website_url) && (
                      <a href={safeHref(s.website_url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {s.last_sync && (
                      <span>Synced {new Date(s.last_sync).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                    <span>·</span>
                    <span>{s.events_found} events</span>
                  </div>
                  {s.error_message && (
                    <div style={{
                      fontSize: '11px', color: '#ef4444', fontFamily: "'DM Sans', monospace",
                      marginTop: '4px', padding: '4px 8px', borderRadius: '4px',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      wordBreak: 'break-word',
                    }}>
                      {s.error_message}
                    </div>
                  )}
                </div>

                {/* Default start time — inline editor */}
                {(() => {
                  const matchedVenue = venueByName[s.venue_name?.toLowerCase()];
                  if (!matchedVenue) return null;
                  const currentTime = matchedVenue.default_start_time
                    ? String(matchedVenue.default_start_time).slice(0, 5)
                    : '';
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, letterSpacing: '0.3px' }}>
                        DEFAULT
                      </span>
                      <input
                        type="time"
                        defaultValue={currentTime}
                        onBlur={(e) => {
                          const newVal = e.target.value;
                          const oldVal = currentTime;
                          if (newVal !== oldVal) {
                            updateVenueDefaultTime(matchedVenue.id, newVal);
                          }
                        }}
                        style={{
                          width: '90px', padding: '3px 6px', borderRadius: '6px',
                          fontSize: '11px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif",
                          background: currentTime ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)',
                          color: currentTime ? '#22c55e' : 'var(--text-muted)',
                          border: `1px solid ${currentTime ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
                          outline: 'none', cursor: 'pointer',
                        }}
                      />
                    </div>
                  );
                })()}

                <span style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                  background: platColor + '18', color: platColor,
                  border: `1px solid ${platColor}33`,
                  fontFamily: "'DM Sans', sans-serif",
                  flexShrink: 0, cursor: 'default', userSelect: 'none',
                }}>
                  {s.platform || 'Unknown'}
                </span>
                <button
                  onClick={() => handleForceSync(s.scraper_key)}
                  disabled={!!forceSyncing}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                    background: forceSyncing === s.scraper_key ? '#E8722A' : 'rgba(232, 114, 42, 0.12)',
                    color: forceSyncing === s.scraper_key ? '#1C1917' : '#E8722A',
                    border: '1px solid rgba(232, 114, 42, 0.3)',
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: forceSyncing ? 'not-allowed' : 'pointer',
                    flexShrink: 0, opacity: forceSyncing && forceSyncing !== s.scraper_key ? 0.4 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {forceSyncing === s.scraper_key ? '⟳ Syncing…' : '⟳ Sync'}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center py-8 text-brand-text-muted">No venues match this filter.</p>
          )}
        </div>
      )}
    </div>
  );
}
