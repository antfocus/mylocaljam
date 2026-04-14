'use client';

import ModalWrapper from '@/components/ui/ModalWrapper';
import Badge from '@/components/ui/Badge';

export default function AdminArtistModals({
  activeTab,
  artists, setArtists, password,
  setArtistToast,
  selectedArtists, setSelectedArtists,
  bulkEnrichProgress, setBulkEnrichProgress,
  enrichConfirm, setEnrichConfirm,
  bulkDeleteConfirm, setBulkDeleteConfirm,
  bulkDeleteLoading, setBulkDeleteLoading,
  mergeConfirm, setMergeConfirm,
  mergeMasterId, setMergeMasterId, mergeLoading, setMergeLoading,
  deleteConfirm, setDeleteConfirm,
  runBulkEnrich, fetchArtists, showQueueToast,
  artistActionLoading, setArtistActionLoading,
  artistsSearch, artistsNeedsInfo,
  editingArtist, setEditingArtist,
}) {
  const headers = { Authorization: 'Bearer ' + password };
  return (
    <>
      {activeTab === 'artists' && (selectedArtists.size > 0 || bulkEnrichProgress) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 400,
          background: '#1A1A24', borderTop: '1px solid #2A2A3A',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8722A' }}>
            {selectedArtists.size} selected
          </span>
          <button
            onClick={() => setSelectedArtists(new Set())}
            style={{
              background: 'none', border: '1px solid #3A3A4A', borderRadius: '6px',
              color: '#9898B8', fontSize: '11px', fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Deselect All
          </button>
          <div style={{ flex: 1 }} />
          {bulkEnrichProgress ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
              <span style={{ fontSize: '12px', color: '#C0C0D0', whiteSpace: 'nowrap' }}>
                Enriching {bulkEnrichProgress.done}/{bulkEnrichProgress.total}...
              </span>
              <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#2A2A3A', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round((bulkEnrichProgress.done / bulkEnrichProgress.total) * 100)}%`,
                  height: '100%', background: '#E8722A', borderRadius: '3px', transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ) : (<>
            <button
              onClick={() => {
                const toEnrich = artists.filter(a => selectedArtists.has(a.id));
                setEnrichConfirm(toEnrich);
              }}
              style={{
                padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'linear-gradient(135deg, #E8722A, #d35f1a)', color: '#1C1917',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.71 11.04a.996.996 0 000-1.41l-2.34-2.34z" fill="currentColor" /></svg>
              AI Enrich ({selectedArtists.size})
            </button>
            <button
              onClick={async () => {
                // Fetch event counts for all selected artists in parallel
                const selected = artists.filter(a => selectedArtists.has(a.id));
                let totalEvents = 0;
                const perArtistCounts = {};
                try {
                  const counts = await Promise.all(
                    selected.map(a =>
                      fetch(`/api/admin/artists?id=${a.id}&action=count-events`, { method: 'DELETE', headers })
                        .then(r => r.json())
                        .then(d => {
                          const c = d.upcoming_event_count || 0;
                          perArtistCounts[a.id] = c;
                          return c;
                        })
                        .catch(() => { perArtistCounts[a.id] = 0; return 0; })
                    )
                  );
                  totalEvents = counts.reduce((sum, c) => sum + c, 0);
                } catch { /* fallback to 0 */ }
                setBulkDeleteConfirm({ artists: selected, totalEvents, perArtistCounts });
              }}
              style={{
                padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
              Delete ({selectedArtists.size})
            </button>
            {/* Ignore Selected — Ghost Hunt blacklist, batched */}
            <button
              onClick={async () => {
                const selected = artists.filter(a => selectedArtists.has(a.id));
                if (selected.length === 0) return;
                const selectedIds = new Set(selected.map(a => a.id));
                const names = selected.map(a => a.name).filter(Boolean);
                // Snapshot for undo-on-failure
                const prevArtists = artists;
                // Optimistically remove all selected rows
                if (typeof setArtists === 'function') {
                  setArtists(list => list.filter(a => !selectedIds.has(a.id)));
                }
                setSelectedArtists(new Set());
                try {
                  // 1. Batch-blacklist the names (single round-trip).
                  const bl = await fetch('/api/admin/ignored-names', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + password },
                    body: JSON.stringify({ names, reason: 'ghost_ignored_bulk' }),
                  });
                  if (!bl.ok) throw new Error('blacklist_failed');
                  // 2. Delete each artist + unlink events. We loop with a
                  //    small concurrency (Promise.all) — the endpoint is
                  //    per-id, and batching here would require a new API.
                  const results = await Promise.allSettled(
                    selected.map(a =>
                      fetch('/api/admin/artists?id=' + encodeURIComponent(a.id) + '&action=unlink-events', {
                        method: 'DELETE',
                        headers: { Authorization: 'Bearer ' + password },
                      }).then(r => { if (!r.ok) throw new Error('delete_failed:' + a.id); return r; })
                    )
                  );
                  const failed = results.filter(r => r.status === 'rejected').length;
                  if (typeof setArtistToast === 'function') {
                    if (failed === 0) {
                      setArtistToast({ type: 'success', message: 'Ignored ' + selected.length + ' artist' + (selected.length !== 1 ? 's' : '') + ' — blacklisted & unlinked' });
                    } else {
                      setArtistToast({ type: 'error', message: failed + ' of ' + selected.length + ' ignores failed — refreshing list' });
                      if (typeof fetchArtists === 'function') fetchArtists(artistsSearch, artistsNeedsInfo);
                    }
                    setTimeout(() => setArtistToast(null), 4000);
                  }
                } catch (err) {
                  console.error('Bulk ignore failed:', err);
                  // Rollback optimistic removal
                  if (typeof setArtists === 'function') setArtists(prevArtists);
                  if (typeof setArtistToast === 'function') {
                    setArtistToast({ type: 'error', message: 'Bulk ignore failed — no changes applied' });
                    setTimeout(() => setArtistToast(null), 4000);
                  }
                }
              }}
              style={{
                padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: 'rgba(156,163,175,0.12)', color: '#9CA3AF',
                border: '1px solid rgba(156,163,175,0.35)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span style={{ fontSize: '14px', lineHeight: 1 }}>{'\uD83D\uDEAB'}</span>
              Ignore Selected ({selectedArtists.size})
            </button>
            {selectedArtists.size >= 2 && (
              <button
                onClick={() => {
                  const selected = artists.filter(a => selectedArtists.has(a.id));
                  setMergeMasterId(selected[0]?.id || null);
                  setMergeConfirm(selected);
                }}
                style={{
                  padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(96,165,250,0.12)', color: '#60A5FA',
                  border: '1px solid rgba(96,165,250,0.3)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 20.41L18.41 19 15 15.59 13.59 17 17 20.41zM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8z" fill="currentColor" /></svg>
                Merge ({selectedArtists.size})
              </button>
            )}
          </>)}
        </div>
      )}

      {/* AI Enrichment Confirmation Modal */}
      {enrichConfirm && (
        <ModalWrapper onClose={() => setEnrichConfirm(null)}>
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Run AI Enrichment on {enrichConfirm.length} artist{enrichConfirm.length !== 1 ? 's' : ''}?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              This will fetch missing images, bios, genres, and vibes using AI. Human-edited fields are protected and won&apos;t be overwritten.
            </p>

            {/* Artist name list */}
            <div style={{
              maxHeight: '200px', overflowY: 'auto', marginBottom: '16px',
              padding: '8px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {enrichConfirm.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '4px 0', fontSize: '12px', color: 'var(--text-primary)',
                }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                    background: a.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontSize: '10px',
                  }}>
                    {a.image_url
                      ? <img src={a.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : '🎤'
                    }
                  </div>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  {/* Show what's missing */}
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {[
                      !a.bio && 'bio',
                      !a.image_url && 'img',
                      (!a.genres || a.genres.length === 0) && 'genre',
                      (!a.vibes || a.vibes.length === 0) && 'vibe',
                    ].filter(Boolean).join(', ') || 'complete'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEnrichConfirm(null)}
                style={{
                  padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const list = [...enrichConfirm];
                  setSelectedArtists(new Set(list.map(a => a.id)));
                  setEnrichConfirm(null);
                  runBulkEnrich(list);
                }}
                style={{
                  padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: 'linear-gradient(135deg, #E8722A, #d35f1a)', color: '#1C1917',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5z" fill="currentColor" /></svg>
                Confirm &amp; Run
              </button>
            </div>
          </>
        </ModalWrapper>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <ModalWrapper onClose={() => { if (!bulkDeleteLoading) setBulkDeleteConfirm(null); }}>
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Delete {bulkDeleteConfirm.artists.length} selected artist{bulkDeleteConfirm.artists.length !== 1 ? 's' : ''}?
            </h3>
            {bulkDeleteConfirm.totalEvents > 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                <strong style={{ color: '#E8722A' }}>{bulkDeleteConfirm.totalEvents}</strong> upcoming event{bulkDeleteConfirm.totalEvents !== 1 ? 's' : ''} are linked to these artists.
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                No upcoming events are linked to these artists.
              </p>
            )}

            {/* Granular artist list with per-artist event counts */}
            <div style={{
              maxHeight: '200px', overflowY: 'auto', marginBottom: '16px',
              padding: '8px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {bulkDeleteConfirm.artists.map(a => {
                const evCount = bulkDeleteConfirm.perArtistCounts?.[a.id] || 0;
                return (
                  <div key={a.id} style={{ padding: '4px 0', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{a.name}</span>
                    {evCount > 0 && (
                      <span style={{ fontSize: '11px', color: '#E8722A', fontWeight: 700, marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        {evCount} upcoming event{evCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {bulkDeleteLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#E8722A', fontWeight: 600 }}>
                Deleting...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Option A: Delete & Hide Events (always shown) */}
                <button
                  onClick={async () => {
                    const { artists: toDelete, totalEvents } = bulkDeleteConfirm;
                    setBulkDeleteLoading(true);
                    try {
                      for (const a of toDelete) {
                        await fetch(`/api/admin/artists?id=${a.id}&action=hide-events`, { method: 'DELETE', headers });
                      }
                      setBulkDeleteConfirm(null);
                      setSelectedArtists(new Set());
                      fetchArtists(artistsSearch, artistsNeedsInfo);
                      if (editingArtist && toDelete.some(a => a.id === editingArtist.id)) setEditingArtist(null);
                      showQueueToast(`Deleted ${toDelete.length} artists — ${totalEvents} event(s) hidden`);
                    } catch (err) { console.error(err); }
                    setBulkDeleteLoading(false);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>Delete Artists{bulkDeleteConfirm.totalEvents > 0 ? ' & Hide Events' : ''}</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                    {bulkDeleteConfirm.totalEvents > 0
                      ? 'Removes profiles and archives linked events from the live app'
                      : 'Permanently removes these artist profiles'}
                  </div>
                </button>

                {/* Option B: Delete & Keep Events — only if events exist */}
                {bulkDeleteConfirm.totalEvents > 0 && (
                  <button
                    onClick={async () => {
                      const { artists: toDelete, totalEvents } = bulkDeleteConfirm;
                      setBulkDeleteLoading(true);
                      try {
                        for (const a of toDelete) {
                          await fetch(`/api/admin/artists?id=${a.id}&action=unlink-events`, { method: 'DELETE', headers });
                        }
                        setBulkDeleteConfirm(null);
                        setSelectedArtists(new Set());
                        fetchArtists(artistsSearch, artistsNeedsInfo);
                        if (editingArtist && toDelete.some(a => a.id === editingArtist.id)) setEditingArtist(null);
                        showQueueToast(`Deleted ${toDelete.length} artists — ${totalEvents} event(s) kept as "Other"`);
                      } catch (err) { console.error(err); }
                      setBulkDeleteLoading(false);
                    }}
                    style={{
                      padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                      background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                      border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div>Delete Artists, Keep Events</div>
                    <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                      Removes profiles but keeps events live as &ldquo;Other / Special Event&rdquo;
                    </div>
                  </button>
                )}

                <button
                  onClick={() => setBulkDeleteConfirm(null)}
                  style={{
                    padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        </ModalWrapper>
      )}

      {/* Merge Duplicates Modal */}
      {mergeConfirm && (
        <ModalWrapper onClose={() => { if (!mergeLoading) { setMergeConfirm(null); setMergeMasterId(null); } }}>
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Which profile is the correct Master Profile?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              All events from the other {mergeConfirm.length - 1} profile{mergeConfirm.length - 1 !== 1 ? 's' : ''} will be transferred to the master. Duplicate profiles will then be deleted.
            </p>

            {/* Artist radio list */}
            <div style={{
              maxHeight: '240px', overflowY: 'auto', marginBottom: '16px',
              padding: '4px', borderRadius: '8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              {mergeConfirm.map(a => (
                <label
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                    borderRadius: '8px', cursor: 'pointer',
                    background: mergeMasterId === a.id ? 'rgba(96,165,250,0.1)' : 'transparent',
                    border: mergeMasterId === a.id ? '1px solid rgba(96,165,250,0.3)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="merge-master"
                    checked={mergeMasterId === a.id}
                    onChange={() => setMergeMasterId(a.id)}
                    style={{ accentColor: '#60A5FA', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  {a.image_url ? (
                    <img src={a.image_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#2A2A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#6B6B8A' }}>
                      ?
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {a.bio && <span style={{ color: '#22c55e' }}>Bio</span>}
                      {a.image_url && <span style={{ color: '#22c55e' }}>Img</span>}
                      {a.genres?.length > 0 && <span style={{ color: '#22c55e' }}>Genre</span>}
                      {a.vibes?.length > 0 && <span style={{ color: '#22c55e' }}>Vibe</span>}
                      {!a.bio && !a.image_url && (!a.genres || a.genres.length === 0) && <span style={{ color: '#6B6B8A' }}>No data</span>}
                    </div>
                  </div>
                  {mergeMasterId === a.id && (
                    <Badge label="Master" size="sm" color="#60A5FA" bg="transparent" style={{ fontWeight: 800 }} />
                  )}
                </label>
              ))}
            </div>

            {mergeLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#60A5FA', fontWeight: 600 }}>
                Merging profiles...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  disabled={!mergeMasterId}
                  onClick={async () => {
                    if (!mergeMasterId) return;
                    const duplicateIds = mergeConfirm.filter(a => a.id !== mergeMasterId).map(a => a.id);
                    setMergeLoading(true);
                    try {
                      const res = await fetch('/api/admin/artists/merge', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ masterId: mergeMasterId, duplicateIds }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setMergeConfirm(null);
                        setMergeMasterId(null);
                        setSelectedArtists(new Set());
                        fetchArtists(artistsSearch, artistsNeedsInfo);
                        if (editingArtist && duplicateIds.includes(editingArtist.id)) setEditingArtist(null);
                        showQueueToast(`Merged ${duplicateIds.length + 1} profiles into "${data.master}" — ${data.eventsTransferred} event(s) transferred`);
                      } else {
                        showQueueToast(`Merge failed: ${data.error || 'Unknown error'}`);
                      }
                    } catch (err) {
                      console.error('Merge error:', err);
                      showQueueToast('Merge failed — see console');
                    }
                    setMergeLoading(false);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: mergeMasterId ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.05)',
                    color: mergeMasterId ? '#60A5FA' : '#4A4A6A',
                    border: `1px solid ${mergeMasterId ? 'rgba(96,165,250,0.3)' : 'rgba(96,165,250,0.1)'}`,
                    cursor: mergeMasterId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Confirm Merge
                </button>
                <button
                  onClick={() => { setMergeConfirm(null); setMergeMasterId(null); }}
                  style={{
                    padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        </ModalWrapper>
      )}

      {/* Smart Delete Confirmation Modal */}
      {deleteConfirm && (
        <ModalWrapper onClose={() => setDeleteConfirm(null)} maxWidth="440px">
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Delete &ldquo;{deleteConfirm.artist.name}&rdquo;?
            </h3>
            {deleteConfirm.eventCount > 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                This artist has <strong style={{ color: '#E8722A' }}>{deleteConfirm.eventCount}</strong> upcoming event{deleteConfirm.eventCount !== 1 ? 's' : ''}. Choose how to handle them:
              </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
                No upcoming events linked to this artist.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Option A: Delete & Hide Events */}
              <button
                onClick={async () => {
                  const { artist, eventCount } = deleteConfirm;
                  setDeleteConfirm(null);
                  setArtistActionLoading(artist.id);
                  try {
                    await fetch(`/api/admin/artists?id=${artist.id}&action=hide-events`, { method: 'DELETE', headers });
                    fetchArtists(artistsSearch, artistsNeedsInfo);
                    if (editingArtist?.id === artist.id) setEditingArtist(null);
                    showQueueToast(`Deleted "${artist.name}" — ${eventCount} event(s) hidden`);
                  } catch (err) { console.error(err); }
                  setArtistActionLoading(null);
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div>Delete Artist &amp; Hide Events</div>
                <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                  Removes the profile and archives linked events from the live app
                </div>
              </button>

              {/* Option B: Delete Artist, Keep Events (Unlink) */}
              {deleteConfirm.eventCount > 0 && (
                <button
                  onClick={async () => {
                    const { artist, eventCount } = deleteConfirm;
                    setDeleteConfirm(null);
                    setArtistActionLoading(artist.id);
                    try {
                      await fetch(`/api/admin/artists?id=${artist.id}&action=unlink-events`, { method: 'DELETE', headers });
                      fetchArtists(artistsSearch, artistsNeedsInfo);
                      if (editingArtist?.id === artist.id) setEditingArtist(null);
                      showQueueToast(`Deleted "${artist.name}" — ${eventCount} event(s) kept as "Other"`);
                    } catch (err) { console.error(err); }
                    setArtistActionLoading(null);
                  }}
                  style={{
                    padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                    border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>Delete Artist, Keep Events</div>
                  <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>
                    Removes the fake profile but keeps events live as &ldquo;Other / Special Event&rdquo;
                  </div>
                </button>
              )}

              {/* Cancel */}
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        </ModalWrapper>
      )}
    </>
  );
}