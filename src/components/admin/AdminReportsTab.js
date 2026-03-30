'use client';

import { formatDate } from '@/lib/utils';

export default function AdminReportsTab({
  reports, setReports, events, artists, venues, password,
  flagsViewFilter, setFlagsViewFilter,
  setEditingEvent, setShowEventForm, setEditingArtist, setArtistForm,
  setArtistsSearch, setArtistSubTab, setImageCandidates, setImageCarouselIdx,
  setActiveTab, setReturnToTab,
  fetchArtists, showQueueToast,
}) {
  const headers = { Authorization: 'Bearer ' + password };
  const filteredFlags = reports.filter(r =>
    flagsViewFilter === 'pending' ? r.status === 'pending' : r.status !== 'pending'
  );
  return (
        <div>
          {/* Header + view filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>User Flags</h2>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'pending', label: 'Pending' },
                { key: 'archived', label: 'Archived' },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setFlagsViewFilter(seg.key)}
                  style={{
                    padding: '6px 14px', fontSize: '13px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: flagsViewFilter === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: flagsViewFilter === seg.key ? '2px solid #F0F0F5' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredFlags.map((rep) => {
              const flagColors = {
                cancel: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#ef4444', label: 'Band Canceled' },
                cover: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', color: '#EAB308', label: 'Cover Added' },
                other: { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', color: '#60A5FA', label: 'Other' },
              };
              const statusColors = {
                fixed: { bg: '#22c55e', color: '#fff', label: 'FIXED' },
                rejected: { bg: '#6B7280', color: '#fff', label: 'REJECTED' },
                reviewed: { bg: '#60A5FA', color: '#fff', label: 'REVIEWED' },
              };
              const fc = flagColors[rep.issue_type] || flagColors.other;
              const sc = statusColors[rep.status];
              const ghostBtn = {
                padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                background: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              };
              return (
                <div key={rep.id} style={{
                  padding: '14px 16px', borderRadius: '12px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: '0',
                }}>
                  {/* Card body */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {rep.events?.artist_name || 'Unknown Event'}
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                        background: fc.bg, color: fc.color, border: `1px solid ${fc.border}`,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {fc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif", marginBottom: '2px' }}>
                      {rep.events?.venue_name || '—'} · {rep.events?.event_date ? formatDate(rep.events.event_date) : '—'}
                    </div>
                    {rep.description && (
                      <div style={{
                        fontSize: '13px', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif",
                        marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        lineHeight: 1.5,
                      }}>
                        &ldquo;{rep.description}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Card footer — timestamp left, actions right */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                      Reported {rep.created_at ? new Date(rep.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                      {rep.resolved_at && ` · Resolved ${new Date(rep.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Edit Event — ghost button */}
                      {rep.event_id && (
                        <button
                          onClick={() => {
                            const ev = events.find(e => e.id === rep.event_id);
                            if (ev) { setEditingEvent(ev); setShowEventForm(true); }
                            else { setActiveTab('events'); setEventsSearch(rep.events?.artist_name || ''); }
                          }}
                          style={{ ...ghostBtn, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          Edit Event
                        </button>
                      )}
                      {/* Edit Artist — ghost button */}
                      <button
                        onClick={() => {
                          const artistName = rep.events?.artist_name || '';
                          const linkedArtist = artists.find(a => a.name?.toLowerCase() === artistName.toLowerCase());
                          if (linkedArtist) {
                            setActiveTab('artists');
                            setEditingArtist(linkedArtist);
                            setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                            setImageCarouselIdx(0);
                            setArtistForm({
                              name: linkedArtist.name || '',
                              bio: linkedArtist.bio || '',
                              genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                              vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                              image_url: linkedArtist.image_url || '',
                            });
                          } else {
                            setActiveTab('artists');
                            setArtistsSearch(artistName);
                            fetchArtists(artistName, false);
                          }
                        }}
                        style={{ ...ghostBtn, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      >
                        Edit Artist
                      </button>
                      {/* Resolve — primary action or archived badge */}
                      {rep.status === 'pending' ? (
                        <select
                          value=""
                          onChange={async (e) => {
                            const newStatus = e.target.value;
                            if (!newStatus) return;
                            try {
                              await fetch('/api/reports', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                body: JSON.stringify({ id: rep.id, status: newStatus }),
                              });
                              const idx = reports.findIndex(r => r.id === rep.id);
                              if (idx !== -1) {
                                const updated = [...reports];
                                updated[idx] = { ...updated[idx], status: newStatus, resolved_at: new Date().toISOString() };
                                setReports(updated);
                              }
                              showQueueToast(`Flag resolved as "${newStatus}"`);
                            } catch (err) { console.error('Resolve error:', err); }
                          }}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            background: '#E8722A', color: '#1C1917',
                            border: 'none', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", outline: 'none',
                          }}
                        >
                          <option value="">Resolve ▾</option>
                          <option value="fixed">Fixed</option>
                          <option value="rejected">Rejected</option>
                          <option value="reviewed">Reviewed</option>
                        </select>
                      ) : sc && (
                        <span style={{
                          fontSize: '11px', fontWeight: 800, padding: '6px 16px', borderRadius: '8px',
                          background: sc.bg, color: sc.color,
                          fontFamily: "'DM Sans', sans-serif",
                          letterSpacing: '0.8px', textTransform: 'uppercase',
                          cursor: 'default', userSelect: 'none',
                        }}>
                          {sc.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredFlags.length === 0 && (
              <p className="text-center py-8 text-brand-text-muted">
                {flagsViewFilter === 'pending' ? 'No pending flags.' : 'No archived flags yet.'}
              </p>
            )}
          </div>
        </div>
  );
}