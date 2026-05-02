'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function useAdminArtists({ password }) {
  const [artists, setArtists] = useState([]);
  const [artistsSearch, setArtistsSearch] = useState('');
  const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
  const [artistMissingFilters, setArtistMissingFilters] = useState({ bio: false, image_url: false, genres: false, vibes: false });
  const [artistsSortBy, setArtistsSortBy] = useState('name');
  const [artistSourceFilter, setArtistSourceFilter] = useState('all');
  // Kind filter — defaults to 'musician' so the Artists tab opens onto
  // actual artists, not the venue-event rows (Trivia, Karaoke, BOGO Burger
  // etc.) that share the artists table for plumbing reasons. Admin can
  // flip to Events / Billings / All to access those when needed.
  const [artistKindFilter, setArtistKindFilter] = useState('musician');
  const [artistSubTab, setArtistSubTab] = useState('directory');
  const [directorySort, setDirectorySort] = useState({ col: 'date_added', dir: 'desc' });
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistForm, setArtistForm] = useState({ name: '', bio: '', genres: '', vibes: '', image_url: '', alias_names: [], default_category: '' });
  const [artistActionLoading, setArtistActionLoading] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [artistToast, setArtistToast] = useState(null);
  const [selectedArtists, setSelectedArtists] = useState(new Set());
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [artistEvents, setArtistEvents] = useState([]);
  const [enrichConfirm, setEnrichConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(null);
  const [mergeMasterId, setMergeMasterId] = useState(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [duplicateNameWarning, setDuplicateNameWarning] = useState(null);
  const dupCheckTimer = useRef(null);

  useEffect(() => {
    if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current);
    setDuplicateNameWarning(null);

    if (!editingArtist || !artistForm.name) return;
    const trimmed = artistForm.name.trim();
    if (trimmed === editingArtist.name) return;
    if (trimmed.length < 2) return;

    dupCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/artists?search=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${password}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          const exact = data.find(a => a.name.toLowerCase() === trimmed.toLowerCase() && a.id !== editingArtist.id);
          if (exact) {
            setDuplicateNameWarning(exact.name);
          }
        }
      } catch { /* ignore check failures */ }
    }, 500);

    return () => { if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current); };
  }, [artistForm.name, editingArtist, password]);

  const [regeneratingField, setRegeneratingField] = useState(null);
  const [imageCandidates, setImageCandidates] = useState([]);
  const [imageCarouselIdx, setImageCarouselIdx] = useState(0);
  const editPanelRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingArtist]);

  useEffect(() => {
    if (!editingArtist) return;
    const fresh = artists.find(a => a.id === editingArtist.id);
    if (!fresh) return;
    const freshLocks = fresh.is_human_edited || {};
    const currentLocks = editingArtist.is_human_edited || {};
    const freshIsLocked = !!fresh.is_locked;
    const currentIsLocked = !!editingArtist.is_locked;
    if (JSON.stringify(freshLocks) !== JSON.stringify(currentLocks) || freshIsLocked !== currentIsLocked) {
      setEditingArtist(prev => prev ? ({ ...prev, is_human_edited: freshLocks, is_locked: fresh.is_locked }) : prev);
    }
  }, [artists]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchArtists = useCallback(async (search = '', needsInfo = false) => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (needsInfo) params.set('needsInfo', 'true');
      const res = await fetch(`/api/admin/artists?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) {
        const data = await res.json();
        setArtists(data);
        setSelectedArtists(new Set());
      }
    } catch (err) { console.error('Failed to fetch artists:', err); }
  }, [password]);

  const runBulkEnrich = async (overrideList) => {
    const toEnrich = overrideList || artists.filter(a => selectedArtists.has(a.id));
    if (toEnrich.length === 0) return;
    setBulkEnrichProgress({ done: 0, total: toEnrich.length });
    let done = 0;

    for (const artist of toEnrich) {
      try {
        if (artist.is_locked) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }

        const res = await fetch('/api/admin/artists/ai-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ artistName: artist.name }),
        });
        if (!res.ok) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }
        const ai = await res.json();

        const update = { id: artist.id };
        const prevStatus = artist.field_status || {};
        const newStatus = { ...prevStatus };

        if (ai.bio && !artist.bio) { update.bio = ai.bio; newStatus.bio = 'pending'; }
        if (ai.genres?.length && (!artist.genres || artist.genres.length === 0)) { update.genres = ai.genres; newStatus.genres = 'pending'; }
        if (ai.vibes?.length && (!artist.vibes || artist.vibes.length === 0)) { update.vibes = ai.vibes; newStatus.vibes = 'pending'; }
        if (ai.image_url && !artist.image_url) { update.image_url = ai.image_url; newStatus.image_url = 'pending'; }
        // Persist the full candidate array so the Event Edit Modal carousel can read it later.
        if (Array.isArray(ai.image_candidates) && ai.image_candidates.length > 0) {
          update.image_candidates = ai.image_candidates;
        }
        if (ai.is_tribute !== undefined && !artist.is_tribute) update.is_tribute = ai.is_tribute;

        if (Object.keys(update).length > 1) {
          update.field_status = newStatus;
          update.metadata_source = 'ai_generated';
          await fetch('/api/admin/artists', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
            body: JSON.stringify(update),
          });
        }
      } catch (err) {
        console.error(`Enrichment failed for ${artist.name}:`, err);
      }
      done++;
      setBulkEnrichProgress({ done, total: toEnrich.length });
      await new Promise(r => setTimeout(r, 300));
    }

    setBulkEnrichProgress(null);
    setSelectedArtists(new Set());
    fetchArtists(artistsSearch, artistsNeedsInfo);
    setArtistToast({ type: 'success', message: `AI enrichment complete: ${done} artists processed` });
    setTimeout(() => setArtistToast(null), 4000);
  };

  const regenerateField = async (field) => {
    if (!editingArtist) return;
    setRegeneratingField(field);
    setArtistToast(null);
    try {
      const res = await fetch('/api/admin/artists/ai-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ artistName: editingArtist.name }),
      });
      if (!res.ok) throw new Error('AI lookup failed');
      const ai = await res.json();

      if (field === 'bio' && ai.bio) {
        setArtistForm(p => ({ ...p, bio: ai.bio }));
        setArtistToast({ type: 'success', message: 'Bio regenerated — review & save' });
      } else if (field === 'image_url' && ai.image_candidates?.length > 0) {
        setImageCandidates(ai.image_candidates);
        setImageCarouselIdx(0);
        setArtistForm(p => ({ ...p, image_url: ai.image_candidates[0] }));
        // Fire-and-forget: persist the candidate array so the carousel survives reload
        // and the Event Edit Modal can read it via the linked artist.
        if (editingArtist?.id) {
          fetch('/api/admin/artists', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
            body: JSON.stringify({ id: editingArtist.id, image_candidates: ai.image_candidates }),
          }).catch(err => console.error('Failed to persist image_candidates:', err));
        }
        const note = ai.image_source === 'placeholder' ? ' (placeholders)' : ` (${ai.image_candidates.length} options)`;
        setArtistToast({ type: 'success', message: `Images refreshed${note} — use arrows to browse` });
      } else if (field === 'genres' && ai.genres?.length) {
        setArtistForm(p => ({ ...p, genres: ai.genres.join(', ') }));
        if (ai.vibes?.length) setArtistForm(p => ({ ...p, vibes: ai.vibes.join(', ') }));
        setArtistToast({ type: 'success', message: 'Genres & vibes regenerated — review & save' });
      } else {
        setArtistToast({ type: 'error', message: `AI couldn't generate a new ${field}` });
      }
      setTimeout(() => setArtistToast(null), 4000);
    } catch (err) {
      console.error('Regenerate error:', err);
      setArtistToast({ type: 'error', message: 'Regeneration failed' });
      setTimeout(() => setArtistToast(null), 4000);
    }
    setRegeneratingField(null);
  };

  return {
    artists, setArtists,
    artistsSearch, setArtistsSearch,
    artistsNeedsInfo, setArtistsNeedsInfo,
    artistMissingFilters, setArtistMissingFilters,
    artistsSortBy, setArtistsSortBy,
    artistSourceFilter, setArtistSourceFilter,
    artistKindFilter, setArtistKindFilter,
    artistSubTab, setArtistSubTab,
    directorySort, setDirectorySort,
    editingArtist, setEditingArtist,
    artistForm, setArtistForm,
    artistActionLoading, setArtistActionLoading,
    aiLoading, setAiLoading,
    artistToast, setArtistToast,
    selectedArtists, setSelectedArtists,
    bulkEnrichProgress, setBulkEnrichProgress,
    deleteConfirm, setDeleteConfirm,
    artistEvents, setArtistEvents,
    enrichConfirm, setEnrichConfirm,
    bulkDeleteConfirm, setBulkDeleteConfirm,
    bulkDeleteLoading, setBulkDeleteLoading,
    mergeConfirm, setMergeConfirm,
    mergeMasterId, setMergeMasterId,
    mergeLoading, setMergeLoading,
    duplicateNameWarning, setDuplicateNameWarning,
    regeneratingField, setRegeneratingField,
    imageCandidates, setImageCandidates,
    imageCarouselIdx, setImageCarouselIdx,
    editPanelRef,
    fetchArtists,
    runBulkEnrich,
    regenerateField,
  };
}
