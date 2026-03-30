'use client';

import { formatDate } from '@/lib/utils';

export default function AdminArtistsTab({
  artists, events, venues, password, isMobile,
  artistsSearch, setArtistsSearch, artistsNeedsInfo, setArtistsNeedsInfo,
  artistMissingFilters = { bio: false, image_url: false, genres: false, vibes: false }, setArtistMissingFilters,
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

    // Missing metadata filters (object-based)
    if (Object.values(artistMissingFilters).some(Boolean)) {
      list = list.filter(a => {
        let matchesMissing = false;
        if (artistMissingFilters.bio && !a.bio) matchesMissing = true;
        if (artistMissingFilters.image_url && !a.image_url) matchesMissing = true;
        if (artistMissingFilters.genres && (!a.genres || a.genres.length === 0)) matchesMissing = true;
        if (artistMissingFilters.vibes && (!a.vibes || a.vibes.length === 0)) matchesMissing = true;
        return matchesMissing;
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

  const subTabToggle = (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', padding: '3px', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 'fit-content' }}>
      {[
        { key: 'directory', label: 'Directory' },
        { key: 'triage', label: 'Metadata Triage' },
      ].map(st => {
        const active = artistSubTab === st.key;
        return (
          <button
            key={st.key}
            onClick={() => setArtistSubTab(st.key)}
            style={{
              padding: '7px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
              background: active ? '#E8722A' : 'transparent',
              color: active ? '#1C1917' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            {st.label}
          </button>
        );
      })}
    </div>
  );

  if (artistSubTab === 'directory') {
    return (
      <div>
        {subTabToggle}

        {/* Directory search */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: '1 1 200px', maxWidth: '400px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search artists..."
              value={artistsSearch}
              onChange={e => { setArtistsSearch(e.target.value); fetchArtists(e.target.value, artistsNeedsInfo); }}
              style={{
                width: '100%', padding: '9px 32px 9px 14px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '8px', color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
              }}
            />
            {artistsSearch && (
              <button
                onClick={() => { setArtistsSearch(''); fetchArtists('', artistsNeedsInfo); }}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
              </button>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
            {artists.filter(a => a.bio && a.image_url).length} approved artist{artists.filter(a => a.bio && a.image_url).length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Directory list — sortable, read-only */}
        {(() => {
          const SortChevron = ({ col }) => {
            if (directorySort.col !== col) return null;
            return (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: '3px', display: 'inline-block', verticalAlign: 'middle' }}>
                {directorySort.dir === 'asc'
                  ? <path d="M5 2L9 7H1L5 2Z" fill="currentColor" />
                  : <path d="M5 8L1 3H9L5 8Z" fill="currentColor" />
                }
              </svg>
            );
          };
          const toggleSort = (col) => {
            setDirectorySort(prev => prev.col === col
              ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
              : { col, dir: col === 'name' ? 'asc' : 'desc' }
            );
          };
          const headerStyle = (col) => ({
            fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            color: directorySort.col === col ? '#E8722A' : 'var(--text-muted)',
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', userSelect: 'none',
            display: 'inline-flex', alignItems: 'center',
          });

          const approvedArtists = artists
            .filter(a => a.bio && a.image_url)
            .sort((a, b) => {
              const { col, dir } = directorySort;
              const mult = dir === 'asc' ? 1 : -1;
              if (col === 'name') {
                return mult * (a.name || '').localeCompare(b.name || '');
              }
              if (col === 'next_event') {
                const aD = a.next_event_date, bD = b.next_event_date;
                if (!aD && !bD) return 0;
                if (!aD) return 1;
                if (!bD) return -1;
                return mult * (aD < bD ? -1 : aD > bD ? 1 : 0);
              }
              if (col === 'date_added') {
                const aD = a.created_at || '', bD = b.created_at || '';
                if (!aD && !bD) return 0;
                if (!aD) return 1;
                if (!bD) return -1;
                return mult * (aD < bD ? -1 : aD > bD ? 1 : 0);
              }
              return 0;
            });

          if (approvedArtists.length === 0) return (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>🎵</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
                No fully approved artists yet
              </p>
              <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
                Artists with both a bio and image will appear here.
              </p>
            </div>
          );

          return (<>
            {/* Header row — sortable */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 16px',
              borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '4px',
              position: 'sticky', top: 0, zIndex: 10,
            }}>
              <span style={{ width: '36px', flexShrink: 0 }} />
              <span style={{ flex: 1 }} onClick={() => toggleSort('name')}>
                <span style={headerStyle('name')}>Artist<SortChevron col="name" /></span>
              </span>
              {!isMobile && <span style={{ width: '120px', textAlign: 'center' }} onClick={() => toggleSort('next_event')}>
                <span style={headerStyle('next_event')}>Next Event<SortChevron col="next_event" /></span>
              </span>}
              {!isMobile && <span style={{ width: '110px', textAlign: 'center' }} onClick={() => toggleSort('date_added')}>
                <span style={headerStyle('date_added')}>Date Added<SortChevron col="date_added" /></span>
              </span>}
              {!isMobile && <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '120px', textAlign: 'center' }}>
                Genres
              </span>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {approvedArtists.map(artist => (
                <div
                  key={artist.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '10px 16px', borderRadius: '10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    overflow: 'hidden',
                  }}>
                    <img src={artist.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {artist.name}
                    </span>
                    {isMobile && artist.next_event_date && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", marginTop: '2px' }}>
                        {new Date(artist.next_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>

                  {/* Next Event */}
                  {!isMobile && <div style={{ width: '120px', textAlign: 'center', flexShrink: 0 }}>
                    {artist.next_event_date ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", color: 'var(--text-muted)' }}>
                        {new Date(artist.next_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{'\u2014'}</span>
                    )}
                  </div>}

                  {/* Date Added */}
                  {!isMobile && <div style={{ width: '110px', textAlign: 'center', flexShrink: 0 }}>
                    {artist.created_at ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", color: 'var(--text-muted)' }}>
                        {new Date(artist.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{'\u2014'}</span>
                    )}
                  </div>}

                  {/* Genres */}
                  {!isMobile && <div style={{ width: '120px', textAlign: 'center', flexShrink: 0 }}>
                    {artist.genres && artist.genres.length > 0 ? (
                      <span style={{
                        fontSize: '10px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                        color: 'var(--text-secondary)', lineHeight: '1.4',
                      }}>
                        {(Array.isArray(artist.genres) ? artist.genres : [artist.genres]).slice(0, 2).join(', ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5 }}>{'\u2014'}</span>
                    )}
                  </div>}
                </div>
              ))}
            </div>
          </>);
        })()}
      </div>
    );
  }

  // Triage tab
  return (
    <>
      {subTabToggle}

      {/* Toolbar: Search + compact filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ flex: '1 1 200px', maxWidth: '400px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search artists..."
            value={artistsSearch}
            onChange={e => { setArtistsSearch(e.target.value); fetchArtists(e.target.value, artistsNeedsInfo); }}
            style={{
              width: '100%', padding: '9px 32px 9px 14px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '8px', color: 'var(--text-primary)',
              fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
            }}
          />
          {artistsSearch && (
            <button
              onClick={() => { setArtistsSearch(''); fetchArtists('', artistsNeedsInfo); }}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
            </button>
          )}
        </div>

        {/* Filter Missing dropdown */}
        {(() => {
          const activeMissing = Object.entries(artistMissingFilters).filter(([, v]) => v).map(([k]) => k);
          const missingLabel = activeMissing.length === 0 ? 'Missing: All' : `Missing: ${activeMissing.length}`;
          const missingOptions = [
            { key: 'bio', label: 'Bio' },
            { key: 'image_url', label: 'Image' },
            { key: 'genres', label: 'Genre' },
            { key: 'vibes', label: 'Vibe' },
          ];
          return (
            <div style={{ position: 'relative' }}>
              <select
                value=""
                onChange={e => {
                  if (e.target.value === '__clear__') {
                    setArtistMissingFilters({ bio: false, image_url: false, genres: false, vibes: false });
                  } else if (e.target.value) {
                    setArtistMissingFilters(prev => ({ ...prev, [e.target.value]: !prev[e.target.value] }));
                  }
                }}
                style={{
                  padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
                  background: activeMissing.length > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-card)',
                  border: activeMissing.length > 0 ? '1px solid #ef4444' : '1px solid var(--border)',
                  color: activeMissing.length > 0 ? '#ef4444' : 'var(--text-secondary)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                }}
              >
                <option value="" disabled>{missingLabel}</option>
                {missingOptions.map(f => (
                  <option key={f.key} value={f.key}>{artistMissingFilters[f.key] ? '\u2713 ' : '  '}{f.label}</option>
                ))}
                {activeMissing.length > 0 && <option value="__clear__">{'\u2715'} Clear filters</option>}
              </select>
            </div>
          );
        })()}

        {/* Source dropdown */}
        <select
          value={artistSourceFilter}
          onChange={e => setArtistSourceFilter(e.target.value)}
          style={{
            padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
            background: artistSourceFilter !== 'all' ? 'rgba(138,43,226,0.08)' : 'var(--bg-card)',
            border: artistSourceFilter !== 'all' ? '1px solid #8B5CF6' : '1px solid var(--border)',
            color: artistSourceFilter !== 'all' ? '#8B5CF6' : 'var(--text-secondary)',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="all">Source: All</option>
          <option value="MusicBrainz">MusicBrainz</option>
          <option value="Discogs">Discogs</option>
          <option value="Last.fm">Last.fm</option>
          <option value="Scraped">Scraped</option>
          <option value="Manual">Manual</option>
          <option value="AI">AI Generated</option>
          <option value="Unknown">Unknown</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={artistsSortBy}
          onChange={e => setArtistsSortBy(e.target.value)}
          style={{
            padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="name">Sort: Name</option>
          <option value="next_event">Sort: Next Event</option>
          <option value="date_added">Sort: Date Added</option>
        </select>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
          {artists.length} artist{artists.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Toast notification */}
      {artistToast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px',
          background: artistToast.type === 'error' ? '#ef4444' : '#22c55e',
          color: '#fff', fontSize: '13px', fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {artistToast.message}
        </div>
      )}

      {/* Edit Panel — inline artist editor */}
      {editingArtist && (
        <div ref={editPanelRef} style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
          borderRadius: '12px', padding: '20px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
              Editing: {editingArtist.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                disabled={aiLoading}
                onClick={async () => {
                  setAiLoading(true);
                  setArtistToast(null);
                  try {
                    const res = await fetch('/api/admin/artists/ai-lookup', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ artistName: editingArtist.name }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error || `API error ${res.status}`);
                    }
                    const ai = await res.json();
                    const ml = !!editingArtist.is_locked;
                    setArtistForm(prev => ({
                      ...prev,
                      bio: ai.bio && !(ml && prev.bio) ? ai.bio : prev.bio,
                      genres: ai.genres?.length && !(ml && prev.genres) ? ai.genres.join(', ') : prev.genres,
                      vibes: ai.vibes?.length && !(ml && prev.vibes) ? ai.vibes.join(', ') : prev.vibes,
                      image_url: ai.image_url && !(ml && prev.image_url) ? ai.image_url : prev.image_url,
                    }));
                    if (ai.image_candidates?.length > 0) {
                      setImageCandidates(ai.image_candidates);
                      setImageCarouselIdx(0);
                    }
                    const imgNote = ai.image_source === 'placeholder' ? ' (placeholder images)' : ` (${ai.image_candidates?.length || 0} images found)`;
                    setArtistToast({ type: 'success', message: `AI fields populated${imgNote} — review & save!` });
                    setTimeout(() => setArtistToast(null), 4000);
                  } catch (err) {
                    console.error('AI auto-fill error:', err);
                    setArtistToast({ type: 'error', message: 'Could not auto-fill. Manual entry required.' });
                    setTimeout(() => setArtistToast(null), 5000);
                  } finally {
                    setAiLoading(false);
                  }
                }}
                style={{
                  padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: aiLoading ? 'rgba(232,114,42,0.15)' : 'linear-gradient(135deg, #E8722A, #d35f1a)',
                  color: aiLoading ? 'var(--text-muted)' : '#1C1917',
                  border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s ease',
                }}
              >
                {aiLoading ? '\u23F3 Searching...' : '\u2728 Auto-Fill with AI'}
              </button>
              <button
                onClick={() => { setEditingArtist(null); if (returnToTab) { setActiveTab(returnToTab); setReturnToTab(null); } }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
              >{'\u2715'}</button>
            </div>
          </div>
          {(() => {
            const labelStyle = { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'DM Sans', sans-serif" };
            const inputStyle = {
              width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
            };
            const lockedStyle = {
              ...inputStyle,
              background: 'var(--bg-elevated)', opacity: 0.6, cursor: 'not-allowed',
              border: '1px solid var(--border)',
            };
            const isArtistLocked = !!editingArtist.is_locked;
            const isFieldLocked = () => isArtistLocked;
            const fieldInputStyle = (field) => isFieldLocked(field) ? lockedStyle : inputStyle;
            const LockBadge = ({ field }) => {
              const locked = isArtistLocked;
              return (
                <span
                  title={locked ? 'Locked via Master Lock' : 'Unlocked \u2014 editable'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '2px',
                    background: locked ? 'rgba(34,197,94,0.1)' : 'rgba(136,136,136,0.06)',
                    border: locked ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(136,136,136,0.12)',
                    borderRadius: '4px', padding: '1px 5px',
                    fontSize: '9px', fontWeight: 600,
                    color: locked ? '#22c55e' : 'rgba(136,136,136,0.45)',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all 0.15s ease',
                  }}
                >
                  {locked && <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>}
                  {locked ? 'LOCKED' : 'OPEN'}
                </span>
              );
            };
            const RegenBtn = ({ field }) => (
              <button
                title={`Regenerate ${field} with AI`}
                disabled={regeneratingField !== null}
                onClick={() => regenerateField(field)}
                style={{
                  background: 'none', border: 'none', cursor: regeneratingField ? 'wait' : 'pointer',
                  color: regeneratingField === field ? '#E8722A' : 'var(--text-muted)',
                  fontSize: '12px', padding: '0 2px', display: 'inline-flex', alignItems: 'center',
                  animation: regeneratingField === field ? 'spin 1s linear infinite' : 'none',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor" /></svg>
              </button>
            );
            return (<>
              {/* Artist Name */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={labelStyle}>Artist Name</span>
                  <LockBadge field="name" />
                </div>
                <input
                  type="text"
                  value={artistForm.name}
                  onChange={e => !isFieldLocked('name') && setArtistForm(p => ({ ...p, name: e.target.value }))}
                  readOnly={isFieldLocked('name')}
                  placeholder="Clean display name"
                  style={{ ...(isFieldLocked('name') ? lockedStyle : inputStyle), marginTop: '4px', fontWeight: 700, fontSize: '15px' }}
                />
                {duplicateNameWarning && (
                  <div style={{ fontSize: '11px', color: '#facc15', marginTop: '4px', fontFamily: "'DM Sans', sans-serif", background: 'rgba(250,204,21,0.08)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(250,204,21,0.2)' }}>
                    {'\u26A0\uFE0F'} An artist named &ldquo;{duplicateNameWarning}&rdquo; already exists. Saving will fail — use the <strong>Merge</strong> tool instead.
                  </div>
                )}
                {!duplicateNameWarning && artistForm.name && editingArtist && artistForm.name !== editingArtist.name && (
                  <div style={{ fontSize: '10px', color: '#E8722A', marginTop: '3px', fontFamily: "'DM Sans', sans-serif" }}>
                    Renaming from &ldquo;{editingArtist.name}&rdquo; — old name will be saved as an alias
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <span style={labelStyle}>Bio</span>
                    <LockBadge field="bio" />
                    {!isFieldLocked('bio') && <RegenBtn field="bio" />}
                  </div>
                  <textarea
                    value={artistForm.bio}
                    onChange={e => !isFieldLocked('bio') && setArtistForm(p => ({ ...p, bio: e.target.value }))}
                    readOnly={isFieldLocked('bio')}
                    rows={3}
                    style={{ ...fieldInputStyle('bio'), resize: isFieldLocked('bio') ? 'none' : 'vertical' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', marginTop: '12px' }}>
                    <span style={labelStyle}>Vibes</span>
                    <LockBadge field="vibes" />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', opacity: isFieldLocked('vibes') ? 0.5 : 1 }}>
                    {VIBES.map(v => {
                      const selected = artistForm.vibes.split(',').map(s => s.trim()).filter(Boolean).includes(v);
                      return (
                        <button key={v} type="button" disabled={isFieldLocked('vibes')} onClick={() => {
                          if (isFieldLocked('vibes')) return;
                          const current = artistForm.vibes.split(',').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(x => x !== v) : [...current, v];
                          setArtistForm(p => ({ ...p, vibes: next.join(', ') }));
                        }} style={{
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif", cursor: isFieldLocked('vibes') ? 'not-allowed' : 'pointer', border: 'none',
                          background: selected ? 'rgba(232,114,42,0.15)' : 'var(--bg-card)',
                          color: selected ? '#E8722A' : 'var(--text-muted)',
                          outline: selected ? '1.5px solid #E8722A' : '1px solid var(--border)',
                          transition: 'all 0.12s ease',
                        }}>{v}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <span style={labelStyle}>Genres</span>
                    <LockBadge field="genres" />
                    {!isFieldLocked('genres') && <RegenBtn field="genres" />}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', opacity: isFieldLocked('genres') ? 0.5 : 1 }}>
                    {GENRES.map(g => {
                      const selected = artistForm.genres.split(',').map(s => s.trim()).filter(Boolean).includes(g);
                      return (
                        <button key={g} type="button" disabled={isFieldLocked('genres')} onClick={() => {
                          if (isFieldLocked('genres')) return;
                          const current = artistForm.genres.split(',').map(s => s.trim()).filter(Boolean);
                          const next = selected ? current.filter(x => x !== g) : [...current, g];
                          setArtistForm(p => ({ ...p, genres: next.join(', ') }));
                        }} style={{
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif", cursor: isFieldLocked('genres') ? 'not-allowed' : 'pointer', border: 'none',
                          background: selected ? 'rgba(232,114,42,0.15)' : 'var(--bg-card)',
                          color: selected ? '#E8722A' : 'var(--text-muted)',
                          outline: selected ? '1.5px solid #E8722A' : '1px solid var(--border)',
                          transition: 'all 0.12s ease',
                        }}>{g}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', marginTop: '12px' }}>
                    <span style={labelStyle}>Image URL</span>
                    <LockBadge field="image_url" />
                    {!isFieldLocked('image_url') && <RegenBtn field="image_url" />}
                    {imageCandidates.length > 1 && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        {imageCarouselIdx + 1}/{imageCandidates.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {imageCandidates.length > 1 && !isFieldLocked('image_url') && (
                      <button
                        onClick={() => {
                          const prev = (imageCarouselIdx - 1 + imageCandidates.length) % imageCandidates.length;
                          setImageCarouselIdx(prev);
                          setArtistForm(p => ({ ...p, image_url: imageCandidates[prev] }));
                        }}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        title="Previous image"
                      >&lt;</button>
                    )}
                    <input
                      type="text"
                      value={artistForm.image_url}
                      onChange={e => !isFieldLocked('image_url') && setArtistForm(p => ({ ...p, image_url: e.target.value }))}
                      readOnly={isFieldLocked('image_url')}
                      placeholder="https://..."
                      style={{ ...(isFieldLocked('image_url') ? lockedStyle : inputStyle), flex: 1 }}
                    />
                    {imageCandidates.length > 1 && !isFieldLocked('image_url') && (
                      <button
                        onClick={() => {
                          const next = (imageCarouselIdx + 1) % imageCandidates.length;
                          setImageCarouselIdx(next);
                          setArtistForm(p => ({ ...p, image_url: imageCandidates[next] }));
                        }}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: '6px', width: '28px', height: '34px', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        title="Next image"
                      >&gt;</button>
                    )}
                  </div>
                  {/* Live Mobile Preview */}
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                        Mobile Preview
                      </span>
                      {imageCandidates.length > 1 && (
                        <span style={{ fontSize: '10px', color: '#E8722A', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                          {imageCarouselIdx + 1} of {imageCandidates.length}
                        </span>
                      )}
                      {imageCandidates.length <= 1 && !regeneratingField && !isFieldLocked('image_url') && (
                        <button
                          onClick={() => regenerateField('image_url')}
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                            color: '#E8722A', fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Search for images
                        </button>
                      )}
                    </div>
                    <div style={{
                      position: 'relative', width: '100%', maxWidth: '180px',
                      aspectRatio: '1 / 1', borderRadius: '12px',
                      overflow: 'hidden', background: '#1A1A24',
                      border: '1px solid var(--border)',
                    }}>
                      {artistForm.image_url ? (
                        <img
                          src={artistForm.image_url}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.src = ''; e.target.alt = 'Failed to load'; }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '24px' }}>🎤</div>
                      )}
                      {imageCandidates.length > 1 && !isFieldLocked('image_url') && (<>
                        <button
                          onClick={() => {
                            const prev = (imageCarouselIdx - 1 + imageCandidates.length) % imageCandidates.length;
                            setImageCarouselIdx(prev);
                            setArtistForm(p => ({ ...p, image_url: imageCandidates[prev] }));
                          }}
                          style={{
                            position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)',
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                            color: '#fff', fontSize: '14px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >&lt;</button>
                        <button
                          onClick={() => {
                            const next = (imageCarouselIdx + 1) % imageCandidates.length;
                            setImageCarouselIdx(next);
                            setArtistForm(p => ({ ...p, image_url: imageCandidates[next] }));
                          }}
                          style={{
                            position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                            color: '#fff', fontSize: '14px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >&gt;</button>
                      </>)}
                    </div>
                  </div>
                </div>
              </div>
            </>);
          })()}
          {/* Associated Events */}
          {artistEvents.length > 0 && (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" }}>
                Associated Events ({artistEvents.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                {artistEvents.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.venue_name || ev.venues?.name || '\u2014'}</span>
                    <span>{'\u00B7'}</span>
                    <span>{formatDate(ev.event_date)}</span>
                    {ev.source && /^https?:\/\//i.test(ev.source) && (
                      <a href={ev.source} target="_blank" rel="noopener noreferrer" style={{ color: '#E8722A', fontSize: '10px', textDecoration: 'none' }}>
                        {(() => { try { return new URL(ev.source).hostname.replace('www.', ''); } catch { return 'source'; } })()}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setEditingArtist(null); if (returnToTab) { setActiveTab(returnToTab); setReturnToTab(null); } }}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >Cancel</button>
            {(() => {
              const doSave = async (approve) => {
                const genres = artistForm.genres
                  ? artistForm.genres.split(',').map(g => g.trim()).filter(Boolean)
                  : null;
                const vibes = artistForm.vibes
                  ? artistForm.vibes.split(',').map(v => v.trim()).filter(Boolean)
                  : null;
                const prevFS = editingArtist.field_status || {};
                const newFS = { ...prevFS };
                if (artistForm.bio) newFS.bio = 'live';
                if (artistForm.image_url) newFS.image_url = 'live';
                if (artistForm.genres) newFS.genres = 'live';
                if (artistForm.vibes) newFS.vibes = 'live';
                let finalImageUrl = artistForm.image_url || null;
                if (finalImageUrl && finalImageUrl.startsWith('data:')) {
                  try {
                    const upRes = await fetch('/api/admin/upload-image', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ image: finalImageUrl, folder: 'artists' }),
                    });
                    const upResult = await upRes.json();
                    if (upRes.ok && upResult.url) {
                      finalImageUrl = upResult.url;
                      setArtistForm(p => ({ ...p, image_url: upResult.url }));
                    } else {
                      setArtistToast({ type: 'error', message: `Image upload failed: ${upResult.error || 'Unknown error'}` });
                      setTimeout(() => setArtistToast(null), 6000);
                      return;
                    }
                  } catch (upErr) {
                    setArtistToast({ type: 'error', message: `Image upload failed: ${upErr.message}` });
                    setTimeout(() => setArtistToast(null), 6000);
                    return;
                  }
                }
                const payload = {
                  id: editingArtist.id,
                  bio: artistForm.bio || null,
                  genres: genres && genres.length > 0 ? genres : null,
                  vibes: vibes && vibes.length > 0 ? vibes : null,
                  image_url: finalImageUrl,
                  field_status: newFS,
                };
                const nameChanged = artistForm.name && artistForm.name.trim() !== editingArtist.name;
                if (nameChanged) {
                  payload.name = artistForm.name.trim();
                  payload.old_name = editingArtist.name;
                }
                const res = await fetch('/api/admin/artists', {
                  method: 'PUT', headers,
                  body: JSON.stringify(payload),
                });
                const result = await res.json().catch(() => ({}));
                if (!res.ok || result.error) {
                  const errMsg = result.error || 'Unknown error';
                  if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('23505') || errMsg.includes('artists_name_key')) {
                    setArtistToast({ type: 'error', message: `An artist named "${artistForm.name.trim()}" already exists. Select both from the list and use the Merge tool.` });
                  } else {
                    setArtistToast({ type: 'error', message: `Save failed: ${errMsg}` });
                  }
                  setTimeout(() => setArtistToast(null), 6000);
                  return;
                }
                setEditingArtist(null);
                setDuplicateNameWarning(null);
                fetchArtists(artistsSearch, artistsNeedsInfo);
                setArtistToast({ type: 'success', message: nameChanged ? `Renamed & saved — "${editingArtist.name}" saved as alias` : (approve ? 'Approved & saved' : 'Saved') });
                setTimeout(() => setArtistToast(null), 3000);
                if (returnToTab) {
                  const dest = returnToTab;
                  setReturnToTab(null);
                  setActiveTab(dest);
                }
              };
              return (<>
                <button onClick={() => doSave(false)} style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}>Save Draft</button>
                <button onClick={() => doSave(true)} style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                }}>Approve &amp; Publish</button>
              </>);
            })()}
          </div>
        </div>
      )}

      {/* Artist list */}
      {(() => {
        const anyFilterActive = Object.values(artistMissingFilters).some(Boolean) || artistSourceFilter !== 'all';
        let displayArtists = artists.filter(a => {
          if (Object.values(artistMissingFilters).some(Boolean)) {
            let matchesMissing = false;
            if (artistMissingFilters.bio && !a.bio) matchesMissing = true;
            if (artistMissingFilters.image_url && !a.image_url) matchesMissing = true;
            if (artistMissingFilters.genres && (!a.genres || a.genres.length === 0)) matchesMissing = true;
            if (artistMissingFilters.vibes && (!a.vibes || a.vibes.length === 0)) matchesMissing = true;
            if (!matchesMissing) return false;
          }
          if (artistSourceFilter !== 'all') {
            const detectSrc = (explicit, url, meta) => {
              if (explicit) {
                const n = explicit.toLowerCase();
                if (n === 'musicbrainz') return 'MusicBrainz';
                if (n === 'discogs') return 'Discogs';
                if (n === 'lastfm' || n === 'last.fm') return 'Last.fm';
                if (n === 'manual') return 'Manual';
                if (n === 'scraped' || n === 'scraper') return 'Scraped';
                if (n === 'ai_generated' || n === 'ai') return 'AI';
                return explicit;
              }
              if (url) {
                const u = url.toLowerCase();
                if (u.includes('last.fm') || u.includes('lastfm')) return 'Last.fm';
                if (u.includes('discogs.com')) return 'Discogs';
                if (u.includes('musicbrainz.org')) return 'MusicBrainz';
              }
              if (meta) {
                const m = meta.toLowerCase();
                if (m === 'lastfm' || m === 'last.fm') return 'Last.fm';
                if (m === 'scraper') return 'Scraped';
                if (m === 'manual') return 'Manual';
                if (m === 'ai_generated') return 'AI';
              }
              return null;
            };
            const imgSrc = detectSrc(a.image_source, a.image_url, a.metadata_source) || (a.image_url ? 'Scraped' : null);
            const bioSrc = detectSrc(a.bio_source, null, a.metadata_source) || (a.bio ? 'Scraped' : null);
            if (artistSourceFilter === 'Unknown') {
              if (imgSrc || bioSrc) return false;
            } else {
              if (imgSrc !== artistSourceFilter && bioSrc !== artistSourceFilter) return false;
            }
          }
          return true;
        });
        if (!anyFilterActive) displayArtists = [...artists];

        if (artistsSortBy === 'next_event') {
          displayArtists.sort((a, b) => {
            const aDate = a.next_event_date;
            const bDate = b.next_event_date;
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
          });
        }
        if (artistsSortBy === 'date_added') {
          displayArtists.sort((a, b) => {
            const aDate = a.created_at || '';
            const bDate = b.created_at || '';
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return bDate < aDate ? -1 : bDate > aDate ? 1 : 0;
          });
        }

        return displayArtists.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>🎸</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
              {anyFilterActive ? 'No artists match these filters' : 'No artists yet'}
            </p>
            <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
              {anyFilterActive
                ? 'Clear the filter chips above to see all artists.'
                : 'Run the SQL migration to create the artists table, then artists will appear here.'}
            </p>
          </div>
        ) : (<>
          {/* Select All header — sticky */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 16px',
            borderRadius: '8px', background: 'var(--bg-elevated)', marginBottom: '4px',
            position: 'sticky', top: 0, zIndex: 10,
          }}>
            <input
              type="checkbox"
              checked={displayArtists.length > 0 && selectedArtists.size === displayArtists.length}
              onChange={e => {
                if (e.target.checked) setSelectedArtists(new Set(displayArtists.map(a => a.id)));
                else setSelectedArtists(new Set());
              }}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A' }}
            />
            <span
              onClick={() => setArtistsSortBy(prev => prev === 'name' ? 'next_event' : 'name')}
              style={{ flex: 1, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: artistsSortBy === 'name' ? '#E8722A' : 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', userSelect: 'none' }}
            >
              Artist {artistsSortBy === 'name' ? '\u25BC' : ''}
            </span>
            {!isMobile && <span
              onClick={() => setArtistsSortBy(prev => prev === 'next_event' ? 'name' : 'next_event')}
              style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: artistsSortBy === 'next_event' ? '#E8722A' : 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '100px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
            >
              Next Event {artistsSortBy === 'next_event' ? '\u25B2' : ''}
            </span>}
            {!isMobile && <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", minWidth: '220px', textAlign: 'center' }}>
              Status
            </span>}
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '120px', textAlign: 'right' }}>
              Actions
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {displayArtists.map(artist => {
              const hasBio = !!artist.bio;
              const hasImg = !!artist.image_url;
              const hasGenre = artist.genres && artist.genres.length > 0;
              const hasVibe = artist.vibes && artist.vibes.length > 0;
              const isEditing = editingArtist?.id === artist.id;
              const isSelected = selectedArtists.has(artist.id);
              const isMasterLocked = !!artist.is_locked;
              const fs = artist.field_status || {};

              const TrafficDot = ({ field, hasData, label }) => {
                const status = fs[field] || (hasData ? 'live' : 'missing');
                const showLocked = isMasterLocked && hasData;
                const lockedS   = { bg: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.5)' };
                const liveS     = { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' };
                const missingS  = { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' };
                const pendingS  = { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)' };
                const c = showLocked ? lockedS
                  : status === 'pending' ? pendingS
                  : status === 'missing' || !hasData ? missingS
                  : liveS;
                return (
                  <span
                    title={showLocked ? `${label} — locked via Master Lock` : hasData ? `${label} — live` : `${label} — missing`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      padding: '2px 8px', borderRadius: '9999px',
                      fontSize: '10px', fontWeight: showLocked ? 600 : 500, fontFamily: "'DM Sans', sans-serif",
                      background: c.bg, color: c.color, border: c.border,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {showLocked && <span style={{ fontSize: '7px' }}>🔒</span>}
                    {label}
                  </span>
                );
              };

              return (
                <div
                  key={artist.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '10px 16px', borderRadius: '10px',
                    background: isSelected ? 'rgba(232,114,42,0.06)' : (isEditing ? 'rgba(232,114,42,0.04)' : 'var(--bg-card)'),
                    border: `1px solid ${isEditing ? '#E8722A' : (isSelected ? '#E8722A44' : 'var(--border)')}`,
                    transition: 'all 0.1s ease',
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => {
                      setSelectedArtists(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(artist.id);
                        else next.delete(artist.id);
                        return next;
                      });
                    }}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#E8722A', flexShrink: 0 }}
                  />

                  {/* Avatar */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: artist.image_url ? 'none' : 'linear-gradient(135deg, var(--accent), #3AADA0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontSize: '16px',
                  }}>
                    {artist.image_url
                      ? <img src={artist.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : '🎤'
                    }
                  </div>

                  {/* Name + Source Badges */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {artist.name}
                    </span>
                    {(() => {
                      const sourceColors = {
                        'MusicBrainz': { color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
                        'Discogs':     { color: '#ea580c', bg: 'rgba(234,88,12,0.1)' },
                        'Last.fm':     { color: '#d51007', bg: 'rgba(213,16,7,0.1)' },
                        'Scraped':     { color: '#3AADA0', bg: 'rgba(58,173,160,0.1)' },
                        'Manual':      { color: '#E8722A', bg: 'rgba(232,114,42,0.1)' },
                        'AI':          { color: '#A855F7', bg: 'rgba(168,85,247,0.1)' },
                      };
                      const detectSource = (explicitSource, url, metaSrc) => {
                        if (explicitSource) {
                          const norm = explicitSource.toLowerCase();
                          if (norm === 'musicbrainz') return 'MusicBrainz';
                          if (norm === 'discogs') return 'Discogs';
                          if (norm === 'lastfm' || norm === 'last.fm') return 'Last.fm';
                          if (norm === 'manual') return 'Manual';
                          if (norm === 'scraped' || norm === 'scraper') return 'Scraped';
                          if (norm === 'ai_generated' || norm === 'ai') return 'AI';
                          return explicitSource;
                        }
                        if (url) {
                          const u = url.toLowerCase();
                          if (u.includes('last.fm') || u.includes('lastfm')) return 'Last.fm';
                          if (u.includes('discogs.com')) return 'Discogs';
                          if (u.includes('musicbrainz.org')) return 'MusicBrainz';
                        }
                        if (metaSrc) {
                          const m = metaSrc.toLowerCase();
                          if (m === 'lastfm' || m === 'last.fm') return 'Last.fm';
                          if (m === 'scraper') return 'Scraped';
                          if (m === 'manual') return 'Manual';
                          if (m === 'ai_generated') return 'AI';
                        }
                        return null;
                      };
                      const imgSrc = detectSource(artist.image_source, artist.image_url, artist.metadata_source) || (artist.image_url ? 'Scraped' : null);
                      const bioSrc = detectSource(artist.bio_source, null, artist.metadata_source) || (artist.bio ? 'Scraped' : null);
                      const badgeStyle = (cfg) => ({
                        display: 'inline-flex', alignItems: 'center',
                        padding: '1px 5px', borderRadius: '4px',
                        fontSize: '8px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                        textTransform: 'uppercase', letterSpacing: '0.3px',
                        background: cfg?.bg || 'rgba(136,136,136,0.08)',
                        color: cfg?.color || '#888',
                        flexShrink: 0, whiteSpace: 'nowrap',
                      });
                      return (
                        <span style={{ display: 'inline-flex', gap: '3px', flexShrink: 0 }}>
                          {imgSrc && <span style={badgeStyle(sourceColors[imgSrc])}>Img: {imgSrc}</span>}
                          {bioSrc && <span style={badgeStyle(sourceColors[bioSrc])}>Bio: {bioSrc}</span>}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Next Event date */}
                  {!isMobile && <div style={{ width: '100px', textAlign: 'center', flexShrink: 0 }}>
                    {artist.next_event_date ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif", color: 'var(--text-muted)' }}>
                        {new Date(artist.next_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5, fontFamily: "'DM Sans', sans-serif" }}>{'\u2014'}</span>
                    )}
                  </div>}

                  {/* Traffic light status pills */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: isMobile ? 'wrap' : 'nowrap', minWidth: isMobile ? '0' : '220px', justifyContent: 'center', flexShrink: 0 }}>
                    <TrafficDot field="bio" hasData={hasBio} label="Bio" />
                    <TrafficDot field="image_url" hasData={hasImg} label="Img" />
                    <TrafficDot field="genres" hasData={hasGenre} label="Genre" />
                    <TrafficDot field="vibes" hasData={hasVibe} label="Vibe" />
                  </div>

                  {/* Action buttons — lock + pencil + trash */}
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0, width: isMobile ? 'auto' : '140px', justifyContent: 'flex-end' }}>
                    {/* Lock toggle */}
                    <button
                      title={artist.is_locked ? 'Unlock — allow scrapers to update' : 'Lock — protect from scraper overwrites'}
                      onClick={async () => {
                        try {
                          const nowLocking = !artist.is_locked;
                          const newFieldLocks = nowLocking
                            ? {
                                ...(artist.bio ? { bio: true } : {}),
                                ...(artist.image_url ? { image_url: true } : {}),
                                ...(artist.genres?.length ? { genres: true } : {}),
                                ...(artist.vibes?.length ? { vibes: true } : {}),
                                ...(artist.name ? { name: true } : {}),
                              }
                            : {};
                          await fetch('/api/admin/artists', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                            body: JSON.stringify({ id: artist.id, is_locked: nowLocking, is_human_edited: newFieldLocks }),
                          });
                          fetchArtists(artistsSearch, artistsNeedsInfo);
                          setArtistToast({ type: 'success', message: nowLocking ? `${artist.name} locked — all fields protected` : `${artist.name} unlocked — all field locks cleared` });
                          setTimeout(() => setArtistToast(null), 3000);
                        } catch {}
                      }}
                      style={{ color: artist.is_locked ? '#22c55e' : 'rgba(136,136,136,0.6)', cursor: 'pointer', background: 'none', border: 'none', padding: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        {artist.is_locked
                          ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor" />
                          : <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" fill="currentColor" />
                        }
                      </svg>
                    </button>
                    {/* Edit (pencil) */}
                    <button
                      title="Edit artist"
                      onClick={async () => {
                        setEditingArtist(artist);
                        setImageCandidates(artist.image_url ? [artist.image_url] : []);
                        setImageCarouselIdx(0);
                        setArtistForm({
                          name: artist.name || '',
                          bio: artist.bio || '',
                          genres: artist.genres ? (Array.isArray(artist.genres) ? artist.genres.join(', ') : artist.genres) : '',
                          vibes: artist.vibes ? (Array.isArray(artist.vibes) ? artist.vibes.join(', ') : artist.vibes) : '',
                          image_url: artist.image_url || '',
                        });
                        try {
                          const params = new URLSearchParams({ page: '1', limit: '20', sort: 'event_date', order: 'asc' });
                          const res = await fetch(`/api/admin?${params}`, { headers });
                          if (res.ok) {
                            const data = await res.json();
                            const all = data.events || [];
                            setArtistEvents(all.filter(e =>
                              e.artist_id === artist.id ||
                              (e.artist_name && e.artist_name.toLowerCase() === artist.name.toLowerCase())
                            ));
                          }
                        } catch { setArtistEvents([]); }
                      }}
                      style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '6px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.001 1.001 0 000-1.42l-2.34-2.34a1.001 1.001 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="currentColor" /></svg>
                    </button>
                    {/* Delete (trash) */}
                    <button
                      title="Delete artist"
                      disabled={artistActionLoading === artist.id}
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/admin/artists?id=${artist.id}&action=count-events`, { method: 'DELETE', headers });
                          const data = await res.json();
                          setDeleteConfirm({ artist, eventCount: data.upcoming_event_count || 0 });
                        } catch {
                          setDeleteConfirm({ artist, eventCount: 0 });
                        }
                      }}
                      style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '6px', opacity: artistActionLoading === artist.id ? 0.5 : 1 }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>);
      })()}
    </>
  );
}