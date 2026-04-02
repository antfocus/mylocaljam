'use client';

import { formatDate } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import { MetadataField, StyleMoodSelector, ImagePreviewSection } from '@/components/admin/shared';

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
        if (artistMissingFilters.bio && a.bio) return false;
        if (artistMissingFilters.image_url && a.image_url) return false;
        if (artistMissingFilters.genres && a.genres?.length) return false;
        if (artistMissingFilters.vibes && a.vibes?.length) return false;
        return true;
      });
    }

    // Sort by
    if (artistsSortBy === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (artistsSortBy === 'recent') {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (artistsSortBy === 'popular') {
      list.sort((a, b) => (b.event_count || 0) - (a.event_count || 0));
    } else if (artistsSortBy === 'status') {
      list.sort((a, b) => {
        const aStatus = !a.bio || !a.image_url || !a.genres?.length || !a.vibes?.length ? 1 : 0;
        const bStatus = !b.bio || !b.image_url || !b.genres?.length || !b.vibes?.length ? 1 : 0;
        return bStatus - aStatus;
      });
    } else if (artistsSortBy === 'source') {
      list.sort((a, b) => (a.source_feed || '').localeCompare(b.source_feed || ''));
    }

    // Source filter
    if (artistSourceFilter && artistSourceFilter !== 'all') {
      list = list.filter(a => a.source_feed === artistSourceFilter);
    }

    return list;
  })();

  const sourceFeedOptions = ['all', ...new Set(artists.map(a => a.source_feed).filter(Boolean))];

  // Subtab logic
  if (artistSubTab === 'directory') {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <h2 className="text-xl font-semibold mb-4">Artists Directory</h2>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="mb-6 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Search by artist name..."
              value={artistsSearch}
              onChange={(e) => setArtistsSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            
            <select
              value={directorySort}
              onChange={(e) => setDirectorySort(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="name">Sort by Name</option>
              <option value="recent">Sort by Recent</option>
              <option value="popular">Sort by Popularity</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredArtists.filter(a => {
              if (!artistsSearch) return true;
              const s = artistsSearch.toLowerCase();
              return a.name?.toLowerCase().includes(s);
            }).map(artist => (
              <div
                key={artist.id}
                className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition"
                onClick={() => {
                  setEditingArtist(artist.id);
                  setArtistSubTab('edit');
                }}
              >
                {artist.image_url ? (
                  <img
                    src={artist.image_url}
                    alt={artist.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-300 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 dark:text-gray-400">No image</span>
                  </div>
                )}
                
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{artist.name}</h3>
                  {artist.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{artist.bio}</p>}
                  
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(artist.genres || []).map(g => (
                      <Badge key={g} className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">{g}</Badge>
                    ))}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(artist.vibes || []).map(v => (
                      <Badge key={v} className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">{v}</Badge>
                    ))}
                  </div>
                  
                  {artist.event_count > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{artist.event_count} events</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Edit mode
  if (artistSubTab === 'edit' && editingArtist) {
    const artist = artists.find(a => a.id === editingArtist);
    if (!artist) return <div>Artist not found</div>;

    return (
      <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }} ref={editPanelRef}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Edit Artist: {artist.name}</h2>
          <button
            onClick={() => setArtistSubTab('directory')}
            className="px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600"
          >
            Back to Directory
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold mb-4 text-lg">Basic Information</h3>
              <div className="space-y-4">
                <MetadataField
                  label="Name"
                  value={artistForm.name}
                  onChange={(value) => setArtistForm({ ...artistForm, name: value })}
                  readOnly={false}
                />

                <MetadataField
                  label="Bio"
                  value={artistForm.bio}
                  onChange={(value) => setArtistForm({ ...artistForm, bio: value })}
                  readOnly={false}
                  multiline
                />

                <MetadataField
                  label="Source Feed"
                  value={artistForm.source_feed || ''}
                  readOnly={true}
                />
              </div>
            </div>

            {/* Image Section */}
            <ImagePreviewSection
              currentImage={artistForm.image_url}
              candidates={imageCandidates}
              onSelectImage={(url) => setArtistForm({ ...artistForm, image_url: url })}
              carouselIdx={imageCarouselIdx}
              setCarouselIdx={setImageCarouselIdx}
              onRegenerate={() => regenerateField('image', artist.id)}
              isRegenerating={regeneratingField === 'image'}
              placeholder="Artist image"
            />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Genres */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Genres</h3>
                <button
                  onClick={() => regenerateField('genres', artist.id)}
                  disabled={regeneratingField === 'genres'}
                  className="text-sm px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {regeneratingField === 'genres' ? 'Generating...' : 'AI Generate'}
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {(artistForm.genres || []).map(g => (
                  <Badge
                    key={g}
                    className="bg-blue-500 text-white cursor-pointer hover:bg-blue-600 flex items-center gap-2"
                    onClick={() => {
                      setArtistForm({
                        ...artistForm,
                        genres: (artistForm.genres || []).filter(x => x !== g)
                      });
                    }}
                  >
                    {g} <span className="ml-1">×</span>
                  </Badge>
                ))}
              </div>

              <div className="space-y-2">
                {GENRES.filter(g => !(artistForm.genres || []).includes(g)).map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      const updated = artistForm.genres || [];
                      if (!updated.includes(g)) updated.push(g);
                      setArtistForm({ ...artistForm, genres: updated });
                    }}
                    className="block w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    + {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Vibes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Vibes</h3>
                <button
                  onClick={() => regenerateField('vibes', artist.id)}
                  disabled={regeneratingField === 'vibes'}
                  className="text-sm px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {regeneratingField === 'vibes' ? 'Generating...' : 'AI Generate'}
                </button>
              </div>
              
              <StyleMoodSelector
                selected={artistForm.vibes || []}
                onSelect={(v) => {
                  if ((artistForm.vibes || []).includes(v)) {
                    setArtistForm({
                      ...artistForm,
                      vibes: (artistForm.vibes || []).filter(x => x !== v)
                    });
                  } else {
                    setArtistForm({
                      ...artistForm,
                      vibes: [...(artistForm.vibes || []), v]
                    });
                  }
                }}
                options={VIBES}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              setArtistActionLoading(true);
              const artistId = artist.id;
              fetch(`/api/admin/artists/${artistId}?t=${Date.now()}`, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(artistForm)
              })
                .then(res => res.json())
                .then(() => {
                  setArtistActionLoading(false);
                  setArtistToast({ show: true, message: 'Artist updated', type: 'success' });
                  fetchArtists();
                  setTimeout(() => setArtistToast({ show: false }), 3000);
                })
                .catch(err => {
                  setArtistActionLoading(false);
                  setArtistToast({ show: true, message: 'Failed to update artist: ' + err.message, type: 'error' });
                  setTimeout(() => setArtistToast({ show: false }), 3000);
                });
            }}
            disabled={artistActionLoading}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md disabled:opacity-50"
          >
            {artistActionLoading ? 'Saving...' : 'Save'}
          </button>
          
          <button
            onClick={() => {
              setArtistForm(artist);
              setArtistToast({ show: true, message: 'Changes discarded', type: 'info' });
              setTimeout(() => setArtistToast({ show: false }), 2000);
            }}
            className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
          >
            Reset
          </button>

          <button
            onClick={() => setDeleteConfirm(artist.id)}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md"
          >
            Delete
          </button>
        </div>

        {/* Delete confirmation */}
        {deleteConfirm === artist.id && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-red-800 dark:text-red-200 mb-3">Are you sure you want to delete this artist? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setArtistActionLoading(true);
                  fetch(`/api/admin/artists/${artist.id}?t=${Date.now()}`, {
                    method: 'DELETE',
                    headers
                  })
                    .then(res => res.json())
                    .then(() => {
                      setArtistActionLoading(false);
                      setDeleteConfirm(null);
                      setArtistToast({ show: true, message: 'Artist deleted', type: 'success' });
                      fetchArtists();
                      setTimeout(() => setArtistToast({ show: false }), 3000);
                    })
                    .catch(err => {
                      setArtistActionLoading(false);
                      setArtistToast({ show: true, message: 'Failed to delete artist: ' + err.message, type: 'error' });
                      setTimeout(() => setArtistToast({ show: false }), 3000);
                    });
                }}
                disabled={artistActionLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50"
              >
                {artistActionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
              
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {artistToast.show && (
          <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white shadow-lg z-50 ${
            artistToast.type === 'success' ? 'bg-green-500' :
            artistToast.type === 'error' ? 'bg-red-500' :
            'bg-blue-500'
          }`}>
            {artistToast.message}
          </div>
        )}
      </div>
    );
  }

  // Main view
  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Artists</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setArtistSubTab('directory')}
            className={`px-4 py-2 rounded-md transition ${
              artistSubTab === 'directory'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-400 dark:hover:bg-gray-600'
            }`}
          >
            Directory
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search artists..."
              value={artistsSearch}
              onChange={(e) => setArtistsSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />

            <select
              value={artistsSortBy}
              onChange={(e) => setArtistsSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="name">Sort by Name</option>
              <option value="recent">Sort by Recent</option>
              <option value="popular">Sort by Popular</option>
              <option value="status">Sort by Status</option>
              <option value="source">Sort by Source</option>
            </select>

            <select
              value={artistSourceFilter}
              onChange={(e) => setArtistSourceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {sourceFeedOptions.map(opt => (
                <option key={opt} value={opt || 'all'}>{opt || 'All Sources'}</option>
              ))}
            </select>

            <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={artistsNeedsInfo}
                onChange={(e) => setArtistsNeedsInfo(e.target.checked)}
              />
              <span>Needs Info</span>
            </label>
          </div>

          {/* Missing Info Filters */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {['bio', 'image_url', 'genres', 'vibes'].map(field => (
              <label key={field} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={artistMissingFilters[field] || false}
                  onChange={(e) => setArtistMissingFilters({
                    ...artistMissingFilters,
                    [field]: e.target.checked
                  })}
                />
                <span>Missing {field === 'image_url' ? 'Image' : field === 'genres' ? 'Genres' : field === 'vibes' ? 'Vibes' : 'Bio'}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedArtists.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-blue-900 dark:text-blue-100">{selectedArtists.length} selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setEnrichConfirm(true)}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm"
                >
                  Bulk Enrich
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm"
                >
                  Bulk Delete
                </button>
              </div>
            </div>
            {bulkEnrichProgress > 0 && bulkEnrichProgress < 100 && (
              <div className="mt-3 w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${bulkEnrichProgress}%` }}></div>
              </div>
            )}
          </div>
        )}

        {/* Artists List */}
        <div className="space-y-2">
          {filteredArtists.map(artist => {
            const isSelected = selectedArtists.includes(artist.id);
            const needsInfo = !artist.bio || !artist.image_url || !artist.genres?.length || !artist.vibes?.length;
            
            return (
              <div
                key={artist.id}
                className={`p-4 rounded-lg border transition ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
                    : needsInfo
                    ? 'bg-yellow-50 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                } hover:shadow-md`}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedArtists([...selectedArtists, artist.id]);
                      } else {
                        setSelectedArtists(selectedArtists.filter(id => id !== artist.id));
                      }
                    }}
                    className="w-5 h-5"
                  />

                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center text-xs text-gray-500">
                      No img
                    </div>
                  )}

                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{artist.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{artist.bio?.substring(0, maxLen) || 'No bio'}...</p>
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(artist.genres || []).slice(0, 2).map(g => (
                        <Badge key={g} className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">{g}</Badge>
                      ))}
                      {artist.genres?.length > 2 && (
                        <Badge className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">+{artist.genres.length - 2}</Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {artist.event_count || 0} events
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setEditingArtist(artist.id);
                          setArtistForm(artist);
                          setArtistSubTab('edit');
                        }}
                        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enrich confirmation modal */}
      {enrichConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">Confirm Bulk Enrich</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              This will AI-enrich {selectedArtists.length} artists with missing metadata. This may take a few minutes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEnrichConfirm(false);
                  runBulkEnrich(selectedArtists);
                }}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
              >
                Proceed
              </button>
              <button
                onClick={() => setEnrichConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h3 className="font-bold text-lg mb-4 text-red-600 dark:text-red-400">Confirm Bulk Delete</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete {selectedArtists.length} artists? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBulkDeleteConfirm(false);
                  setArtistActionLoading(true);
                  Promise.all(
                    selectedArtists.map(id =>
                      fetch(`/api/admin/artists/${id}?t=${Date.now()}`, {
                        method: 'DELETE',
                        headers
                      }).then(res => res.json())
                    )
                  )
                    .then(() => {
                      setArtistActionLoading(false);
                      setSelectedArtists([]);
                      setArtistToast({ show: true, message: `Deleted ${selectedArtists.length} artists`, type: 'success' });
                      fetchArtists();
                      setTimeout(() => setArtistToast({ show: false }), 3000);
                    })
                    .catch(err => {
                      setArtistActionLoading(false);
                      setArtistToast({ show: true, message: 'Failed to delete artists: ' + err.message, type: 'error' });
                      setTimeout(() => setArtistToast({ show: false }), 3000);
                    });
                }}
                disabled={artistActionLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50"
              >
                {artistActionLoading ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {artistToast.show && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg text-white shadow-lg z-50 ${
          artistToast.type === 'success' ? 'bg-green-500' :
          artistToast.type === 'error' ? 'bg-red-500' :
          'bg-blue-500'
        }`}>
          {artistToast.message}
        </div>
      )}
    </div>
  );
}
