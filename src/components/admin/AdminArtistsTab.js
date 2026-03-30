'use client';

import { formatDate } from '@/lib/utils';

export default function AdminArtistsTab({
  artists, events, venues, password, isMobile,
  artistsSearch, setArtistsSearch, artistsNeedsInfo, setArtistsNeedsInfo,
  artistMissingFilters, setArtistMissingFilters,
  artistsSortBy, setArtistsSortBy, artistSourceFilter, setArtistSourceFilter,
  artistSubTab, setArtistSubTab, directorySort, setDirectorySort,
  editingArtist, setEditingArtist, artistForm, setArtistForm,
  artistActionLoading, setArtistActionLoading, aiLoading, setAiLoading,
  artistToast, setArtistToast, artistEvents, setArtistEvents,
  duplicateNameWarning, setDuplicateNameWarning,
  regeneratingField, setRegeneratingField,
  imageCandidates, setImageCandidates, imageCarouselIdx, setImageCarouselIdx,
  editPanelRef,
  selectedArtists, setSelectedArtists, bulkEnrichProgress,
  deleteConfirm, setDeleteConfirm, enrichConfirm, setEnrichConfirm,
  bulkDeleteConfirm, setBulkDeleteConfirm,
  mergeConfirm, setMergeConfirm, mergeMasterId, setMergeMasterId,
  fetchArtists, runBulkEnrich, regenerateField, showQueueToast,
  setActiveTab, setReturnToTab, returnToTab,
  GENRES, VIBES,
}) {
  const headers = { Authorization: 'Bearer ' + password };
  const maxLen = 50;
  const filteredArtists = (() => {
    let list = artists;

    // Search filter
    if (artistsSearch) {
      const s = artistsSearch.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(s));
    }

    // Needs Info toggle
    if (artistsNeedsInfo) {
      list = list.filter(a => !a.bio || !a.image_url || !a.genres?.length || !a.vibes?.length);
    }

    // Missing metadata filters
    if (artistMissingFilters.length > 0) {
      list = list.filter(a => {
        const missing = [];
        if (!a.bio) missing.push('bio');
        if (!a.image_url) missing.push('image');
        if (!a.genres?.length) missing.push('genre');
        if (!a.vibes?.length) missing.push('vibe');
        return missing.some(m => artistMissingFilters.includes(m));
      });
    }

    // Source filter
    if (artistSourceFilter !== 'all') {
      list = list.filter(a => a.source === artistSourceFilter);
    }

    // Sort
    if (artistsSortBy === 'created') {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (artistsSortBy === 'events') {
      list.sort((a, b) => {
        const aCount = events.filter(e => e.artist_id === a.id).length;
        const bCount = events.filter(e => e.artist_id === b.id).length;
        return bCount - aCount;
      });
    } else {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return list;
  })();

  // For directory tab: secondary sort on top of initial sort
  const sortedArtists = (() => {
    const sorted = [...filteredArtists];
    if (artistSubTab === 'directory' && directorySort === 'trending') {
      // Trending: event count descending
      sorted.sort((a, b) => {
        const aCount = events.filter(e => e.artist_id === a.id).length;
        const bCount = events.filter(e => e.artist_id === b.id).length;
        return bCount - aCount;
      });
    }
    return sorted;
  })();

  if (artistSubTab === 'directory') {
    return (
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1 }}>
            <input
              type="text"
              value={artistsSearch}
              onChange={e => setArtistsSearch(e.target.value)}
              placeholder="Search by artist name..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
          </div>
          <select value={directorySort} onChange={e => setDirectorySort(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="name">Sort: Name</option>
            <option value="trending">Sort: Trending</option>
          </select>
        </div>

        {/* Grid of artists */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {sortedArtists.map(a => {
            const eventCount = events.filter(e => e.artist_id === a.id).length;
            return (
              <div
                key={a.id}
                onClick={() => {
                  setEditingArtist(a);
                  setArtistForm({
                    name: a.name || '',
                    bio: a.bio || '',
                    genres: a.genres ? (Array.isArray(a.genres) ? a.genres.join(', ') : a.genres) : '',
                    vibes: a.vibes ? (Array.isArray(a.vibes) ? a.vibes.join(', ') : a.vibes) : '',
                    image_url: a.image_url || '',
                  });
                  setImageCandidates(a.image_url ? [a.image_url] : []);
                  setImageCarouselIdx(0);
                }}
                style={{
                  cursor: 'pointer', background: 'var(--bg-card)', borderRadius: '12px',
                  border: '1px solid var(--border)', padding: '16px', textAlign: 'center',
                  transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8722A'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(232,114,42,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Image */}
                <div style={{
                  width: '100%', height: '100px', borderRadius: '8px', marginBottom: '12px',
                  background: a.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '40px',
                }}>
                  {a.image_url ? <img src={a.image_url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎤'}
                </div>
                {/* Name */}
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {a.name?.length > maxLen ? a.name.substring(0, maxLen - 3) + '...' : a.name}
                </div>
                {/* Event count */}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  {eventCount} event{eventCount !== 1 ? 's' : ''}
                </div>
                {/* Missing badges */}
                {(!a.bio || !a.image_url || !a.genres?.length || !a.vibes?.length) && (
                  <div style={{ fontSize: '10px', color: '#EAB308', fontWeight: 700, textTransform: 'uppercase' }}>
                    {[!a.bio && 'bio', !a.image_url && 'img', !a.genres?.length && 'genre', !a.vibes?.length && 'vibe'].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {sortedArtists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            {artistsSearch ? 'No artists found.' : 'No artists yet.'}
          </div>
        )}
      </div>
    );
  }

  // Triage tab
  return (
    <>
      {/* Top bar: search + filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={artistsSearch}
          onChange={e => setArtistsSearch(e.target.value)}
          placeholder="Search by name..."
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          {['bio', 'image', 'genre', 'vibe'].map(m => (
            <button
              key={m}
              onClick={() => {
                const idx = artistMissingFilters.indexOf(m);
                if (idx !== -1) {
                  const updated = artistMissingFilters.filter((_, i) => i !== idx);
                  setArtistMissingFilters(updated);
                } else {
                  setArtistMissingFilters([...artistMissingFilters, m]);
                }
              }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                background: artistMissingFilters.includes(m) ? '#EAB308' : 'var(--bg-elevated)',
                color: artistMissingFilters.includes(m) ? '#000' : 'var(--text-muted)',
                border: artistMissingFilters.includes(m) ? 'none' : '1px solid var(--border)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={artistsNeedsInfo}
            onChange={e => setArtistsNeedsInfo(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Needs Info
        </label>
        <select value={artistsSortBy} onChange={e => setArtistsSortBy(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="name">Sort: Name</option>
          <option value="created">Sort: Newest</option>
          <option value="events">Sort: Most Events</option>
        </select>
        <select value={artistSourceFilter} onChange={e => setArtistSourceFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
          <option value="all">Source: All</option>
          <option value="manual">Source: Manual</option>
          <option value="imported">Source: Imported</option>
        </select>
      </div>

      {/* Table of artists */}
      <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px', gap: '0', maxHeight: isMobile ? 'auto' : 'calc(100vh - 260px)', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: '12px' }}>
          {/* Headers */}
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            Artist
          </div>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            Info
          </div>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            Events
          </div>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            Updated
          </div>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            Actions
          </div>

          {/* Rows */}
          {filteredArtists.map((a) => {
            const eventCount = events.filter(e => e.artist_id === a.id).length;
            const missing = [!a.bio && 'bio', !a.image_url && 'image', !a.genres?.length && 'genre', !a.vibes?.length && 'vibe'].filter(Boolean);
            return (
              <div key={a.id} style={{ display: 'contents' }}>
                {/* Artist Name + Image */}
                <div
                  onClick={() => {
                    setEditingArtist(a);
                    setArtistForm({
                      name: a.name || '',
                      bio: a.bio || '',
                      genres: a.genres ? (Array.isArray(a.genres) ? a.genres.join(', ') : a.genres) : '',
                      vibes: a.vibes ? (Array.isArray(a.vibes) ? a.vibes.join(', ') : a.vibes) : '',
                      image_url: a.image_url || '',
                    });
                    setImageCandidates(a.image_url ? [a.image_url] : []);
                    setImageCarouselIdx(0);
                  }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    background: editingArtist?.id === a.id ? 'rgba(232, 114, 42, 0.08)' : 'transparent',
                    transition: 'background 0.15s', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { if (editingArtist?.id !== a.id) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  onMouseLeave={e => { if (editingArtist?.id !== a.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Checkbox for bulk select */}
                  <input
                    type="checkbox"
                    checked={selectedArtists.has(a.id)}
                    onChange={() => {
                      const updated = new Set(selectedArtists);
                      if (updated.has(a.id)) {
                        updated.delete(a.id);
                      } else {
                        updated.add(a.id);
                      }
                      setSelectedArtists(updated);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', flexShrink: 0, background: a.image_url ? 'none' : '#2A2A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '16px' }}>
                    {a.image_url ? <img src={a.image_url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎤'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.source || 'manual'}</div>
                  </div>
                </div>

                {/* Info badges */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', flexWrap: 'wrap' }}>
                  {[a.bio && 'bio', a.image_url && 'image', a.genres?.length && 'genre', a.vibes?.length && 'vibe'].filter(Boolean).map(b => (
                    <span key={b} style={{ padding: '2px 8px', borderRadius: '4px', background: '#23CE6B33', color: '#23CE6B', fontWeight: 600 }}>
                      ✓ {b}
                    </span>
                  ))}
                  {missing.map(m => (
                    <span key={m} style={{ padding: '2px 8px', borderRadius: '4px', background: '#EAB30833', color: '#EAB308', fontWeight: 600 }}>
                      ✕ {m}
                    </span>
                  ))}
                </div>

                {/* Event count */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {eventCount}
                </div>

                {/* Last updated */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {a.updated_at ? formatDate(a.updated_at) : '—'}
                </div>

                {/* Action dropdown */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '4px' }}>
                  <select
                    onChange={(e) => {
                      const action = e.target.value;
                      e.target.value = '';
                      if (action === 'edit') {
                        setEditingArtist(a);
                        setArtistForm({
                          name: a.name || '',
                          bio: a.bio || '',
                          genres: a.genres ? (Array.isArray(a.genres) ? a.genres.join(', ') : a.genres) : '',
                          vibes: a.vibes ? (Array.isArray(a.vibes) ? a.vibes.join(', ') : a.vibes) : '',
                          image_url: a.image_url || '',
                        });
                        setImageCandidates(a.image_url ? [a.image_url] : []);
                        setImageCarouselIdx(0);
                      } else if (action === 'delete') {
                        (async () => {
                          const eventCount = events.filter(e => e.artist_id === a.id).length;
                          const res = await fetch(`/api/admin/artists?id=${a.id}&action=count-events`, { method: 'DELETE', headers });
                          if (res.ok) {
                            const data = await res.json();
                            setDeleteConfirm({ artist: a, eventCount: data.upcoming_event_count || eventCount });
                          }
                        })();
                      }
                    }}
                    style={{
                      padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    <option value="">Actions</option>
                    <option value="edit">Edit</option>
                    <option value="delete">Delete</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filteredArtists.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          {artistsSearch ? 'No artists match your search.' : 'No artists to display.'}
        </div>
      )}

      {/* Edit Panel */}
      {editingArtist && <AdminArtistEditPanel ref={editPanelRef} {...editPanelProps} />}
    </>
  );
}