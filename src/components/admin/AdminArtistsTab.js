'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/utils';
import { safeHref } from '@/lib/safeHref';
import Badge from '@/components/ui/Badge';
import { MetadataField, StyleMoodSelector, ImagePreviewSection } from '@/components/admin/shared';

/**
 * AliasTagInput — pill/tag input for artists.alias_names.
 *
 * - Type + Enter (or comma) to commit a new tag.
 * - Backspace on empty input removes the last tag (standard chip-input UX).
 * - Click × on a pill to remove.
 * - Duplicates (case-insensitive) are silently rejected.
 * - The artist's canonical name is rejected (can't alias yourself).
 * - Whitespace is trimmed; empty strings ignored.
 *
 * Controlled component: parent owns the string[] via `value` / `onChange`.
 */
function AliasTagInput({ value, onChange, canonicalName = '', disabled = false }) {
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? value : [];

  const commit = (raw) => {
    const t = (raw || '').trim().replace(/,+$/, '').trim();
    if (!t) return;
    const tLower = t.toLowerCase();
    if (canonicalName && tLower === canonicalName.trim().toLowerCase()) return;
    if (tags.some(x => (x || '').toLowerCase() === tLower)) return;
    onChange([...tags, t]);
    setDraft('');
  };

  const removeAt = (idx) => {
    const next = tags.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      // Chip-input convention: backspace on empty field pops the last tag.
      removeAt(tags.length - 1);
    }
  };

  const onPaste = (e) => {
    if (disabled) return;
    const text = e.clipboardData.getData('text');
    if (text.includes(',') || text.includes('\n')) {
      e.preventDefault();
      const parts = text.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      let next = tags.slice();
      const canonLower = canonicalName.trim().toLowerCase();
      for (const p of parts) {
        const pl = p.toLowerCase();
        if (pl === canonLower) continue;
        if (next.some(x => (x || '').toLowerCase() === pl)) continue;
        next.push(p);
      }
      onChange(next);
      setDraft('');
    }
  };

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px',
        padding: '8px 10px',
        background: disabled ? 'var(--bg-elevated)' : 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: '8px',
        minHeight: '42px',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      onClick={(e) => {
        // Focus the input when the user clicks empty space inside the pill box
        const input = e.currentTarget.querySelector('input');
        if (input) input.focus();
      }}
    >
      {tags.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '3px 4px 3px 10px',
            background: 'rgba(147, 51, 234, 0.12)',
            color: '#C084FC',
            border: '1px solid rgba(147, 51, 234, 0.28)',
            borderRadius: '999px',
            fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.2,
          }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeAt(idx); }}
              aria-label={`Remove alias ${tag}`}
              title="Remove alias"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '16px', height: '16px', borderRadius: '999px',
                background: 'rgba(147, 51, 234, 0.22)',
                color: '#C084FC',
                border: 'none', cursor: 'pointer', padding: 0,
                fontSize: '12px', lineHeight: 1,
              }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={draft}
        disabled={disabled}
        placeholder={tags.length === 0 ? 'e.g. "The Jukes", "Southside Johnny"' : ''}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        style={{
          flex: 1, minWidth: '120px',
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text-primary)', fontSize: '13px',
          fontFamily: "'DM Sans', sans-serif",
          padding: '2px 0',
        }}
      />
    </div>
  );
}

/**
 * KindToggle — 3-way Musician/Billing/Event selector for artists.kind.
 *
 *   - musician : real, singular artist. Default. Shows in directory + all
 *                user-facing artist surfaces.
 *   - billing  : concatenated lineup ("Headliner w/ Opener 1, Opener 2").
 *                Events keep the lineup string for display, but the row is
 *                hidden from directory + follow surfaces.
 *   - event    : not a performer at all (trivia, drink specials, brunch).
 *                Same hiding behavior as billing.
 *
 * Implemented as a native <select> styled to look like a colored pill so we
 * inherit free accessibility, keyboard support, and click-outside. The pill
 * is color-coded by current value (slate / blue / orange) so admin can scan
 * the list and spot misclassifications at a glance.
 *
 * `compact` mode shrinks the trigger for mobile rendering under the artist
 * name (alongside next-event-date).
 */
function KindToggle({ artist, headers, fetchArtists, artistsSearch, artistsNeedsInfo, compact = false }) {
  const [busy, setBusy] = useState(false);
  const kind = artist.kind || 'musician';

  // Color tokens per kind. Musician is the unobtrusive default; billing &
  // event are visually distinct from each other so the admin can tell at a
  // glance which bucket a misclassified row was bulk-assigned to.
  const VARIANTS = {
    musician: { bg: 'rgba(140, 140, 170, 0.18)', fg: 'var(--text-secondary)', border: 'transparent' },
    billing:  { bg: 'rgba(67, 56, 202, 0.20)',   fg: '#A5B4FC',                border: 'rgba(165, 180, 252, 0.35)' },
    event:    { bg: 'rgba(232, 114, 42, 0.18)',  fg: '#E8722A',                border: '#E8722A' },
  };
  const variant = VARIANTS[kind] || VARIANTS.musician;

  const onChange = async (e) => {
    e.stopPropagation();
    const next = e.target.value;
    if (next === kind || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/artists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: artist.id, kind: next }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        console.error('[KindToggle] update failed:', result.error || res.status);
      }
      if (typeof fetchArtists === 'function') {
        await fetchArtists(artistsSearch, artistsNeedsInfo);
      }
    } finally {
      setBusy(false);
    }
  };

  const padding = compact ? '2px 22px 2px 8px' : '4px 26px 4px 10px';
  const fontSize = compact ? '10px' : '11px';

  // Inline SVG chevron baked into background-image so the native arrow is
  // hidden but the trigger still tells the user it's a dropdown.
  const chevronUrl = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='${encodeURIComponent(variant.fg.startsWith('var(') ? '%23999' : variant.fg.replace('#', '%23'))}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>")`;

  return (
    <select
      value={kind}
      onChange={onChange}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      title={`Currently: ${kind.charAt(0).toUpperCase() + kind.slice(1)}. Click to change.`}
      style={{
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding, borderRadius: '999px',
        fontFamily: "'DM Sans', sans-serif",
        fontSize, fontWeight: 700, letterSpacing: '0.4px',
        textTransform: 'uppercase',
        cursor: busy ? 'wait' : 'pointer',
        border: `1px solid ${variant.border}`,
        background: `${variant.bg} ${chevronUrl} no-repeat right 8px center`,
        backgroundSize: 'auto, 10px 10px',
        color: variant.fg,
        opacity: busy ? 0.5 : 1,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        outline: 'none',
        textAlign: 'center',
        textAlignLast: 'center',
      }}
    >
      <option value="musician">Musician</option>
      <option value="billing">Billing</option>
      <option value="event">Event</option>
    </select>
  );
}

export default function AdminArtistsTab({
  artists, setArtists, events, venues, password, isMobile,
  artistsSearch, setArtistsSearch, artistsNeedsInfo, setArtistsNeedsInfo,
  artistMissingFilters = { bio: false, image_url: false, genres: false, vibes: false }, setArtistMissingFilters,
  artistsSortBy, setArtistsSortBy, artistSourceFilter, setArtistSourceFilter,
  artistKindFilter = 'musician', setArtistKindFilter,
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
  GENRES, VIBES, ARTIST_VIBES,
}) {
  const headers = { Authorization: 'Bearer ' + password };
  const maxLen = 50;

  // ── Manual "+ Add Artist" modal state ─────────────────────────────────
  // Lets admins create an artist when the scraper missed one. POST hits
  // /api/admin/artists with just `{ name }`; that route validates,
  // dedupes case-insensitively, and refuses blacklisted names.
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [addArtistName, setAddArtistName] = useState('');
  const [addArtistLoading, setAddArtistLoading] = useState(false);
  const [addArtistError, setAddArtistError] = useState(null);

  const submitAddArtist = async () => {
    const trimmed = addArtistName.trim();
    if (!trimmed) {
      setAddArtistError('Artist name is required');
      return;
    }
    setAddArtistLoading(true);
    setAddArtistError(null);
    try {
      const res = await fetch('/api/admin/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddArtistError(data?.error || `Failed (${res.status})`);
        setAddArtistLoading(false);
        return;
      }
      // Optimistic: prepend to local list so the new artist is immediately visible.
      if (typeof setArtists === 'function' && data?.id) {
        setArtists(prev => [{ ...data, next_event_date: null }, ...(Array.isArray(prev) ? prev : [])]);
      }
      setAddArtistOpen(false);
      setAddArtistName('');
      setAddArtistLoading(false);
      if (typeof setArtistToast === 'function') {
        setArtistToast({ type: 'success', message: `Added "${trimmed}" — refresh from source to enrich.` });
        setTimeout(() => setArtistToast(null), 4000);
      }
      // Reconcile with backend (so search/filter caches stay accurate).
      if (typeof fetchArtists === 'function') {
        fetchArtists(artistsSearch, artistsNeedsInfo);
      }
    } catch (err) {
      setAddArtistError(err.message || 'Network error');
      setAddArtistLoading(false);
    }
  };

  const addArtistButton = (
    <button
      onClick={() => { setAddArtistError(null); setAddArtistName(''); setAddArtistOpen(true); }}
      style={{
        padding: '9px 14px', borderRadius: '8px',
        background: '#E8722A', border: '1px solid #E8722A',
        color: '#1C1917', fontWeight: 700, fontSize: '13px',
        fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        whiteSpace: 'nowrap',
      }}
      title="Manually add an artist the scraper missed"
    >
      <span style={{ fontSize: '15px', lineHeight: 1 }}>+</span> Add Artist
    </button>
  );

  const addArtistModal = addArtistOpen ? (
    <div
      onClick={() => { if (!addArtistLoading) setAddArtistOpen(false); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '420px',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Add Artist
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Creates a stub artist record. Bio, image, and tags can be enriched after.
        </p>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
          Artist Name
        </label>
        <input
          type="text"
          autoFocus
          value={addArtistName}
          onChange={e => { setAddArtistName(e.target.value); if (addArtistError) setAddArtistError(null); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !addArtistLoading) submitAddArtist();
            if (e.key === 'Escape' && !addArtistLoading) setAddArtistOpen(false);
          }}
          placeholder="e.g. The Wallflowers"
          disabled={addArtistLoading}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text-primary)',
            fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
            marginBottom: '12px',
          }}
        />
        {addArtistError && (
          <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '12px' }}>
            {addArtistError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={() => setAddArtistOpen(false)}
            disabled={addArtistLoading}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontWeight: 600, fontSize: '13px',
              cursor: addArtistLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submitAddArtist}
            disabled={addArtistLoading || !addArtistName.trim()}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: '#E8722A', border: '1px solid #E8722A',
              color: '#1C1917', fontWeight: 700, fontSize: '13px',
              cursor: (addArtistLoading || !addArtistName.trim()) ? 'not-allowed' : 'pointer',
              opacity: (addArtistLoading || !addArtistName.trim()) ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {addArtistLoading ? 'Adding…' : 'Add Artist'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

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

    // Kind filter — defaults to 'musician'. Hides venue-event rows
    // (Trivia, Karaoke, BOGO Burger, etc.) and multi-artist billing rows
    // from the default Artists view so the tab is just real artists. Admin
    // can flip the filter pill above search to access the others when
    // curating those rows. Rows missing a kind value are treated as
    // 'musician' so legacy data continues to show under the default view.
    //
    // BYPASSED WHEN SEARCHING: if there's a search query, we always search
    // across ALL kinds. Otherwise the admin types "mother" and the filter
    // hides the kind='event' "Mother's Day" row they're trying to find /
    // delete — exactly the dead-end Tony hit on May 2. Search is the
    // explicit "find this thing" intent; the filter is the implicit "tidy
    // default list" intent. Search wins.
    const trimmedSearch = (artistsSearch || '').trim();
    if (artistKindFilter && artistKindFilter !== 'all' && !trimmedSearch) {
      list = list.filter(a => (a.kind || 'musician') === artistKindFilter);
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

          {/* Kind filter — same control as on Metadata Triage. Defaults to
              'musician' so opening the Directory lands on real artists; flip
              to Events / Billings / All when curating those plumbing rows
              ("Happy Mother's Day", "Trivia NIGHT", "BOGO Burger" etc.).
              Highlighted in orange when not on Musicians so the change of
              context is unmistakable. */}
          <select
            value={artistKindFilter}
            onChange={e => setArtistKindFilter(e.target.value)}
            title="Filter the Directory by row kind"
            style={{
              padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
              background: artistKindFilter !== 'musician' ? 'rgba(232,114,42,0.10)' : 'var(--bg-card)',
              border: artistKindFilter !== 'musician' ? '1px solid #E8722A' : '1px solid var(--border)',
              color: artistKindFilter !== 'musician' ? '#E8722A' : 'var(--text-secondary)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}
          >
            <option value="musician">Musicians</option>
            <option value="event">Events</option>
            <option value="billing">Billings</option>
            <option value="all">All kinds</option>
          </select>

          {/* Count — reflects the kind filter so admins see how many rows
              are actually visible under the current filter, not the raw
              approved-artists total which is misleading when filtered.
              Mirrors the same search-bypass rule as the list filter
              (search overrides kind), so the count never disagrees with
              what's actually rendered. */}
          {(() => {
            const searchActive = !!(artistsSearch && artistsSearch.trim());
            const visible = artists
              .filter(a => a.bio && a.image_url)
              .filter(a => searchActive
                || artistKindFilter === 'all'
                || (a.kind || 'musician') === artistKindFilter
              );
            const noun = (searchActive || artistKindFilter === 'all')
              ? 'row'
              : artistKindFilter === 'musician' ? 'artist' : artistKindFilter;
            return (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                {visible.length} approved {noun}{visible.length !== 1 ? 's' : ''}
              </div>
            );
          })()}
          <div style={{ marginLeft: 'auto' }}>{addArtistButton}</div>
        </div>
        {addArtistModal}

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

          const directorySearchActive = !!(artistsSearch && artistsSearch.trim());
          const approvedArtists = artists
            .filter(a => a.bio && a.image_url)
            // Same kind filter as Metadata Triage — defaults to 'musician'
            // so the Directory opens onto real artists, not the venue-event
            // plumbing rows ("Happy Mother's Day", "Trivia NIGHT", "BOGO
            // Burger"…) that exist in the artists table for join purposes.
            // Treat null kind as 'musician' so legacy rows still appear.
            //
            // BYPASSED WHEN SEARCHING — if there's a search query the filter
            // is suspended so admin always finds matches by name regardless
            // of which kind they live under. Same rationale as Metadata
            // Triage: search is "find this thing", filter is the default
            // tidy view. Search wins.
            .filter(a => directorySearchActive
              || artistKindFilter === 'all'
              || (a.kind || 'musician') === artistKindFilter
            )
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
              {!isMobile && <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", width: '92px', textAlign: 'center' }}>
                Kind
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

                  {/* Name + lock indicator. The 🔒 icon renders inline next
                      to the name when artist.is_locked is true — quick visual
                      cue that this row is protected from scraper overwrites
                      and AI re-enrichment. The Metadata Triage view's lock
                      toggle remains the canonical place to flip the state;
                      this is read-only signal for the directory. */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {artist.name}
                      </span>
                      {artist.is_locked && (
                        <span
                          title="Locked — protected from scraper overwrites and AI re-enrichment"
                          aria-label="Locked"
                          style={{
                            fontSize: '12px',
                            color: '#22c55e',
                            flexShrink: 0,
                            cursor: 'help',
                            lineHeight: 1,
                          }}
                        >
                          🔒
                        </span>
                      )}
                    </span>
                    {isMobile && ((artist.kind && artist.kind !== 'musician') || artist.next_event_date) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        {artist.kind && artist.kind !== 'musician' && (
                          <KindToggle artist={artist} headers={headers} fetchArtists={fetchArtists} artistsSearch={artistsSearch} artistsNeedsInfo={artistsNeedsInfo} compact />
                        )}
                        {artist.next_event_date && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                            {new Date(artist.next_event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
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

                  {/* Kind toggle — Musician (default, subtle) | Event (orange, flagged) */}
                  {!isMobile && <div style={{ width: '92px', textAlign: 'center', flexShrink: 0 }}>
                    <KindToggle artist={artist} headers={headers} fetchArtists={fetchArtists} artistsSearch={artistsSearch} artistsNeedsInfo={artistsNeedsInfo} />
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

        {/* Kind filter — sits before Source so it's the FIRST filter pill
            (this is the primary "what am I looking at" lever). Defaults to
            Musicians so the tab opens onto real artists, not the venue-
            event rows (Trivia, Karaoke, BOGO Burger) and billing rows
            (multi-artist shows) that share the artists table for plumbing.
            Admin can flip to Events / Billings / All to access those when
            curating. Highlighted in orange when not 'musician' so the
            change-of-context is visually obvious. */}
        <select
          value={artistKindFilter}
          onChange={e => setArtistKindFilter(e.target.value)}
          title="Filter the artists list by row kind"
          style={{
            padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
            background: artistKindFilter !== 'musician' ? 'rgba(232,114,42,0.10)' : 'var(--bg-card)',
            border: artistKindFilter !== 'musician' ? '1px solid #E8722A' : '1px solid var(--border)',
            color: artistKindFilter !== 'musician' ? '#E8722A' : 'var(--text-secondary)',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
        >
          <option value="musician">Musicians</option>
          <option value="event">Events</option>
          <option value="billing">Billings</option>
          <option value="all">All kinds</option>
        </select>

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

        <div style={{ marginLeft: 'auto' }}>{addArtistButton}</div>
      </div>
      {addArtistModal}

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
          {/* ── Two-Column Layout (Master Record — no inheritance UI) ────────── */}
          {(() => {
            const isArtistLocked = !!editingArtist.is_locked;
            const inputStyle = {
              width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none',
            };
            const lockedInputStyle = {
              ...inputStyle,
              background: 'var(--bg-elevated)', opacity: 0.6, cursor: 'not-allowed',
              border: '1px solid var(--border)',
            };
            const lockBadge = (
              <Badge
                label={isArtistLocked ? 'LOCKED' : 'OPEN'}
                size="xs"
                color={isArtistLocked ? '#22c55e' : 'rgba(136,136,136,0.45)'}
                bg={isArtistLocked ? 'rgba(34,197,94,0.1)' : 'rgba(136,136,136,0.06)'}
                style={{
                  border: isArtistLocked ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(136,136,136,0.12)',
                  fontSize: '9px', fontWeight: 600, gap: '2px',
                  transition: 'all 0.15s ease',
                }}
              >
                {isArtistLocked && <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>}
                {isArtistLocked ? 'LOCKED' : 'OPEN'}
              </Badge>
            );
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
              {/* ── Artist Name (full width, above two-column grid) ──────────── */}
              <MetadataField label="Artist Name" hasArtist={false} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  {lockBadge}
                </div>
                <input
                  type="text"
                  value={artistForm.name}
                  onChange={e => !isArtistLocked && setArtistForm(p => ({ ...p, name: e.target.value }))}
                  readOnly={isArtistLocked}
                  placeholder="Clean display name"
                  style={{ ...(isArtistLocked ? lockedInputStyle : inputStyle), fontWeight: 700, fontSize: '15px' }}
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
              </MetadataField>

              {/* ── Aliases / Also Known As ─────────────────────────────────── */}
              <MetadataField label="Also Known As (Aliases)" hasArtist={false} style={{ marginBottom: '16px' }}>
                <AliasTagInput
                  value={artistForm.alias_names}
                  onChange={(next) => setArtistForm(p => ({ ...p, alias_names: next }))}
                  canonicalName={artistForm.name}
                  disabled={isArtistLocked}
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: "'DM Sans', sans-serif" }}>
                  Type a variant name and press <kbd style={{ fontSize: '9px', padding: '1px 5px', background: 'var(--bg-card)', borderRadius: '3px', border: '1px solid var(--border)' }}>Enter</kbd> or <kbd style={{ fontSize: '9px', padding: '1px 5px', background: 'var(--bg-card)', borderRadius: '3px', border: '1px solid var(--border)' }}>,</kbd> to add. Future scraper rows matching any alias will auto-link to this artist.
                </div>
              </MetadataField>

              {/* ── Two-column grid ──────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* ── LEFT COLUMN: Identity & Creative ──────────────────────── */}
                <div>
                  {/* Bio */}
                  <MetadataField label="Bio" hasArtist={false}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      {lockBadge}
                      {!isArtistLocked && <RegenBtn field="bio" />}
                    </div>
                    <textarea
                      value={artistForm.bio}
                      onChange={e => !isArtistLocked && setArtistForm(p => ({ ...p, bio: e.target.value }))}
                      readOnly={isArtistLocked}
                      rows={3}
                      style={{ ...(isArtistLocked ? lockedInputStyle : inputStyle), resize: isArtistLocked ? 'none' : 'vertical' }}
                    />
                  </MetadataField>

                  {/* Vibes */}
                  <MetadataField label="Vibes" hasArtist={false}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      {lockBadge}
                    </div>
                    <StyleMoodSelector
                      label="Vibes"
                      options={ARTIST_VIBES}
                      selected={artistForm.vibes}
                      onChange={(next) => setArtistForm(p => ({ ...p, vibes: next }))}
                      disabled={isArtistLocked}
                    />
                  </MetadataField>
                </div>

                {/* ── RIGHT COLUMN: Visuals & Genres ───────────────────────── */}
                <div>
                  {/* Genres */}
                  <MetadataField label="Genres" hasArtist={false}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      {lockBadge}
                      {!isArtistLocked && <RegenBtn field="genres" />}
                    </div>
                    <StyleMoodSelector
                      label="Genres"
                      options={GENRES}
                      selected={artistForm.genres}
                      onChange={(next) => setArtistForm(p => ({ ...p, genres: next }))}
                      disabled={isArtistLocked}
                    />
                  </MetadataField>

                  {/* Default Category — Confidence Cascade Tier 1
                      Once set, the scraper bypasses AI inference for this artist
                      and stamps every future event with this category +
                      is_category_verified=true. See HANDOVER.md "Confidence
                      Cascade" architecture.

                      Hidden for kind='musician' rows: musicians' events default
                      to "Live Music" via the AI/keyword router with high
                      accuracy, so the field is redundant noise on the 95% case
                      and was confusing admins (the user thought it controlled
                      the rendered category for existing events, which it does
                      not). The field stays visible — and useful — for kind=
                      'event' (Trivia, Karaoke, BOGO Burger…) and 'billing'
                      rows where the artist name *is* the category and AI
                      inference is shakier. To set a default category on a
                      musician, flip the KindToggle on the row first. */}
                  {editingArtist?.kind && editingArtist.kind !== 'musician' && (
                    <MetadataField label="Default Category" hasArtist={false}>
                      <select
                        value={artistForm.default_category || ''}
                        onChange={e => setArtistForm(p => ({ ...p, default_category: e.target.value }))}
                        disabled={isArtistLocked}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: '8px',
                          background: 'var(--bg-elevated)',
                          border: artistForm.default_category ? '1px solid #E8722A' : '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontFamily: "'DM Sans', sans-serif", fontSize: '14px',
                          outline: 'none', cursor: isArtistLocked ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="">— None (use AI inference) —</option>
                        <option value="Live Music">Live Music</option>
                        <option value="Trivia">Trivia</option>
                        <option value="Karaoke">Karaoke</option>
                        <option value="DJ/Dance Party">DJ/Dance Party</option>
                        <option value="Comedy">Comedy</option>
                        <option value="Food & Drink">Food & Drink</option>
                        <option value="Sports">Sports</option>
                        <option value="Other">Other</option>
                      </select>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
                        Auto-categorize FUTURE scraped events for this row. Existing events keep their current category. Templates and per-event edits still override.
                      </div>
                    </MetadataField>
                  )}

                  {/* Image */}
                  <MetadataField label="Artist Image" hasArtist={false}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                      {lockBadge}
                      {!isArtistLocked && <RegenBtn field="image_url" />}
                      {imageCandidates.length <= 1 && !regeneratingField && !isArtistLocked && (
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
                    <ImagePreviewSection
                      imageUrl={artistForm.image_url}
                      isInherited={false}
                      onUrlChange={(url) => !isArtistLocked && setArtistForm(p => ({ ...p, image_url: url }))}
                      disabled={isArtistLocked}
                      candidates={imageCandidates}
                      candidateIdx={imageCarouselIdx}
                      onCandidateNav={(newIdx) => {
                        setImageCarouselIdx(newIdx);
                        setArtistForm(p => ({ ...p, image_url: imageCandidates[newIdx] }));
                      }}
                      label="Mobile Preview"
                      maxPreviewHeight="180px"
                    />
                  </MetadataField>
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
                    {/* safeHref drops non-http(s) URLs (security audit H4). */}
                    {safeHref(ev.source) && (
                      <a href={safeHref(ev.source)} target="_blank" rel="noopener noreferrer" style={{ color: '#E8722A', fontSize: '10px', textDecoration: 'none' }}>
                        {(() => { try { return new URL(safeHref(ev.source)).hostname.replace('www.', ''); } catch { return 'source'; } })()}
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
                // Normalize alias list: trim, dedupe (case-insensitive), drop empty,
                // and strip any entry equal to the canonical name.
                const canonicalLower = (artistForm.name || editingArtist.name || '').trim().toLowerCase();
                const aliasSeen = new Set();
                const aliasClean = [];
                for (const a of (artistForm.alias_names || [])) {
                  const t = (a || '').trim();
                  if (!t) continue;
                  const k = t.toLowerCase();
                  if (k === canonicalLower) continue;
                  if (aliasSeen.has(k)) continue;
                  aliasSeen.add(k);
                  aliasClean.push(t);
                }

                const payload = {
                  id: editingArtist.id,
                  bio: artistForm.bio || null,
                  genres: genres && genres.length > 0 ? genres : null,
                  vibes: vibes && vibes.length > 0 ? vibes : null,
                  image_url: finalImageUrl,
                  alias_names: aliasClean,
                  field_status: newFS,
                  // Confidence Cascade Tier 1: empty string → null (clears the
                  // bypass); otherwise pass the enum value through. Backend
                  // PUT route validates against the enum.
                  default_category: artistForm.default_category ? artistForm.default_category : null,
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

                {/* Row-level lock toggle. Sits immediately left of Approve &
                    Publish so locking is one click away from the primary
                    save action. Click toggles is_locked + flips per-field
                    is_human_edited locks for any populated fields. Persists
                    immediately via PUT /api/admin/artists; updates local
                    editingArtist state. Independent of the form save —
                    locking doesn't require Approve, and Approve doesn't
                    auto-lock. */}
                <button
                  type="button"
                  onClick={async () => {
                    const nowLocking = !editingArtist.is_locked;
                    let newFieldLocks = {};
                    if (nowLocking) {
                      const prevLocks = editingArtist.is_human_edited || {};
                      const fields = ['bio', 'image_url', 'genres', 'vibes', 'name'];
                      fields.forEach((f) => {
                        const v = editingArtist[f];
                        const populated = Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && String(v).trim() !== '');
                        if (populated) {
                          newFieldLocks[f] = true;
                        } else if (prevLocks[f] !== undefined) {
                          newFieldLocks[f] = prevLocks[f];
                        }
                      });
                    }
                    try {
                      const res = await fetch('/api/admin/artists', {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({
                          id: editingArtist.id,
                          is_locked: nowLocking,
                          is_human_edited: newFieldLocks,
                        }),
                      });
                      if (!res.ok) throw new Error('Failed to update lock state');
                      setEditingArtist((prev) => ({ ...prev, is_locked: nowLocking, is_human_edited: newFieldLocks }));
                      setArtistToast({ type: 'success', message: nowLocking ? 'Artist locked' : 'Artist unlocked' });
                      setTimeout(() => setArtistToast(null), 2500);
                    } catch (err) {
                      setArtistToast({ type: 'error', message: err.message || 'Failed to toggle lock' });
                      setTimeout(() => setArtistToast(null), 3000);
                    }
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 600,
                    background: editingArtist.is_locked ? 'rgba(34,197,94,0.12)' : 'transparent',
                    color: editingArtist.is_locked ? '#22c55e' : 'var(--text-muted)',
                    border: `1px solid ${editingArtist.is_locked ? 'rgba(34,197,94,0.30)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all 0.15s ease',
                  }}
                  title={editingArtist.is_locked ? 'Click to unlock — accept automated enrichment writes again' : 'Click to lock — block all automated enrichment writes'}
                >
                  {editingArtist.is_locked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                  )}
                  {editingArtist.is_locked ? 'Locked' : 'Unlocked'}
                </button>

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

              // Extracted so both the card-root onClick and the explicit
              // pencil button bind to the same handler. Same code that used
              // to live inline on the pencil button.
              const openArtistEditor = async () => {
                setEditingArtist(artist);
                setImageCandidates(artist.image_url ? [artist.image_url] : []);
                setImageCarouselIdx(0);
                setArtistForm({
                  name: artist.name || '',
                  bio: artist.bio || '',
                  genres: artist.genres ? (Array.isArray(artist.genres) ? artist.genres.join(', ') : artist.genres) : '',
                  vibes: artist.vibes ? (Array.isArray(artist.vibes) ? artist.vibes.join(', ') : artist.vibes) : '',
                  image_url: artist.image_url || '',
                  alias_names: Array.isArray(artist.alias_names) ? [...artist.alias_names] : [],
                  default_category: artist.default_category || '',
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
              };

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
                  onClick={openArtistEditor}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openArtistEditor();
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '10px 16px', borderRadius: '10px',
                    background: isSelected ? 'rgba(232,114,42,0.06)' : (isEditing ? 'rgba(232,114,42,0.04)' : 'var(--bg-card)'),
                    border: `1px solid ${isEditing ? '#E8722A' : (isSelected ? '#E8722A44' : 'var(--border)')}`,
                    transition: 'all 0.1s ease',
                    cursor: 'pointer',
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={e => e.stopPropagation()}
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
                      return (
                        <span style={{ display: 'inline-flex', gap: '3px', flexShrink: 0 }}>
                          {imgSrc && <Badge label={`Img: ${imgSrc}`} size="xs" color={sourceColors[imgSrc]?.color} bg={sourceColors[imgSrc]?.bg} />}
                          {bioSrc && <Badge label={`Bio: ${bioSrc}`} size="xs" color={sourceColors[bioSrc]?.color} bg={sourceColors[bioSrc]?.bg} />}
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
                      onClick={async (e) => {
                        e.stopPropagation();
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
                    {/* Edit pencil removed — the entire row is clickable to
                        open the editor (openArtistEditor on row onClick).
                        Lock toggle + delete remain because they're
                        destructive / state-changing actions distinct from
                        "open the editor." */}
                    {/* Delete (trash) */}
                    <button
                      title="Delete artist"
                      disabled={artistActionLoading === artist.id}
                      onClick={async (e) => {
                        e.stopPropagation();
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
                    {/* Per-row 🚫 Ignore button removed — April 14, 2026.
                        Bulk flow (checkbox + "Ignore Selected (N)" in the
                        bottom action bar) is now the single path. Batch
                        endpoint /api/admin/ignored-names accepts names[]. */}
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