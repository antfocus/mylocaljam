'use client';

/**
 * Venue Directory sub-tab — admin CRUD for the venues table.
 *
 * Closes the gap where adding or fixing a venue today requires SQL.
 * Lives alongside AdminVenuesScrapers under the parent AdminVenuesTab.
 *
 * v1 scope (Apr 30, 2026):
 *   - Searchable list, sortable by name / city / scraper-fed status
 *   - Edit modal with all editable fields (name, address, city, slug,
 *     lat/lng, website, photo_url, venue_type, tags, default_start_time)
 *   - "+ New Venue" creates a new row from an empty modal
 *   - Delete with FK pre-check on the server (events / templates / series).
 *     The UI surfaces the count and blocks delete if any reference exists.
 *
 * Deferred to v2 (per PARKED #1 scope creep):
 *   - Geocode-from-address button (Nominatim or Mapbox)
 *   - Photo upload to Supabase Storage (currently URL paste only)
 *   - Scraper-source assignment per venue
 *   - venue_type as a true enum dropdown with canonical list
 */

import { useState, useMemo, useCallback } from 'react';

// Empty form template — used both for "+ New Venue" and as the reset state
// when the modal closes. Mirrors the columns we expose for editing; any
// venue fields not in this list (id, color, created_at) are managed by
// the DB or stay at defaults.
const EMPTY_VENUE = {
  id: null,
  name: '',
  address: '',
  city: '',
  slug: '',
  latitude: '',
  longitude: '',
  website: '',
  photo_url: '',
  venue_type: '',
  tags: [],
  default_start_time: '',
};

// Common venue types as a non-authoritative dropdown helper. The column is
// freeform text; this datalist just prevents typos. Easy to extend.
const VENUE_TYPE_SUGGESTIONS = [
  'bar', 'restaurant', 'club', 'theater', 'concert hall',
  'brewery', 'winery', 'outdoor', 'rooftop', 'patio',
  'festival grounds', 'private', 'other',
];

export default function AdminVenuesDirectory({
  venues,
  scraperHealth,
  fetchVenuesFull,
  createVenue,
  updateVenue,
  deleteVenue,
  geocodeAddress,
  showQueueToast,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'city' | 'scraper'
  const [editing, setEditing] = useState(null); // venue object or null
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Build a name-keyed lookup of scraper rows so we can show a "scraper-fed"
  // chip on each venue row in the list. Lower-cased for case-insensitive
  // match — matches the same approach AdminVenuesScrapers uses.
  const scraperByVenueName = useMemo(() => {
    const map = {};
    (scraperHealth || []).forEach(s => {
      if (s.venue_name) map[s.venue_name.toLowerCase()] = s;
    });
    return map;
  }, [scraperHealth]);

  // Filter + sort the list based on search + sortBy. Search is case-insensitive
  // substring across name, city, and address so admins can find a venue by
  // any of those three identifiers.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (venues || []).slice();
    if (q) {
      list = list.filter(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.city || '').toLowerCase().includes(q) ||
        (v.address || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'city') {
        return (a.city || 'zzz').localeCompare(b.city || 'zzz');
      }
      if (sortBy === 'scraper') {
        const aHas = !!scraperByVenueName[a.name?.toLowerCase()];
        const bHas = !!scraperByVenueName[b.name?.toLowerCase()];
        if (aHas !== bHas) return aHas ? -1 : 1;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [venues, search, sortBy, scraperByVenueName]);

  // ── Modal handlers ──────────────────────────────────────────────────

  const handleNew = useCallback(() => setEditing({ ...EMPTY_VENUE }), []);

  const handleEdit = useCallback((venue) => {
    // Hydrate an existing venue into the form shape — convert nullable
    // numerics + arrays to the controlled-input shape the form expects.
    setEditing({
      ...EMPTY_VENUE,
      ...venue,
      latitude: venue.latitude ?? '',
      longitude: venue.longitude ?? '',
      tags: Array.isArray(venue.tags) ? venue.tags : [],
      default_start_time: venue.default_start_time
        ? String(venue.default_start_time).slice(0, 5)
        : '',
    });
  }, []);

  const handleClose = useCallback(() => {
    if (saving || deleting) return;
    setEditing(null);
  }, [saving, deleting]);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name?.trim()) {
      showQueueToast('Name is required');
      return;
    }
    setSaving(true);
    try {
      // Coerce form values to DB shape: empty strings → null, lat/lng → number
      const payload = {
        name: editing.name.trim(),
        address: editing.address?.trim() || null,
        city: editing.city?.trim() || null,
        slug: editing.slug?.trim() || null,
        latitude: editing.latitude !== '' ? Number(editing.latitude) : null,
        longitude: editing.longitude !== '' ? Number(editing.longitude) : null,
        website: editing.website?.trim() || null,
        photo_url: editing.photo_url?.trim() || null,
        venue_type: editing.venue_type?.trim() || null,
        tags: (editing.tags || []).filter(t => t && t.trim()),
        default_start_time: editing.default_start_time || null,
      };

      if (editing.id) {
        // Update path
        const ok = await updateVenue(editing.id, payload);
        if (ok) {
          showQueueToast(`Saved "${payload.name}"`);
          setEditing(null);
          fetchVenuesFull();
        }
      } else {
        // Create path
        const created = await createVenue(payload);
        if (created) {
          showQueueToast(`Created "${payload.name}"`);
          setEditing(null);
          fetchVenuesFull();
        }
      }
    } catch (err) {
      showQueueToast(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [editing, createVenue, updateVenue, fetchVenuesFull, showQueueToast]);

  const handleDelete = useCallback(async () => {
    if (!editing?.id) return;
    if (!confirm(`Delete "${editing.name}"?\n\nThis cannot be undone. The server will block delete if any events, templates, or event series reference this venue — you'll need to reassign or delete those first.`)) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteVenue(editing.id);
      if (result?.ok) {
        showQueueToast(`Deleted "${editing.name}"`);
        setEditing(null);
        fetchVenuesFull();
      } else if (result?.fkBlocked) {
        // Server returned a FK block with counts — surface them to the admin
        const parts = [];
        if (result.events) parts.push(`${result.events} event${result.events === 1 ? '' : 's'}`);
        if (result.templates) parts.push(`${result.templates} template${result.templates === 1 ? '' : 's'}`);
        if (result.series) parts.push(`${result.series} series`);
        showQueueToast(`Cannot delete — referenced by ${parts.join(', ')}. Reassign or delete those first.`);
      } else {
        showQueueToast(`Delete failed: ${result?.error || 'unknown error'}`);
      }
    } catch (err) {
      showQueueToast(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }, [editing, deleteVenue, fetchVenuesFull, showQueueToast]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header row — search + sort + add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, city, address…"
          style={{
            flex: '1 1 240px',
            padding: '7px 12px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif", outline: 'none',
          }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}
        >
          <option value="name">Sort: Name</option>
          <option value="city">Sort: City</option>
          <option value="scraper">Sort: Scraper-fed first</option>
        </select>
        <button
          onClick={handleNew}
          style={{
            padding: '7px 14px', borderRadius: '8px',
            background: '#E8722A', color: '#000', border: 'none',
            fontSize: '12px', fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}
        >
          + New Venue
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
          {filtered.length} of {(venues || []).length}
        </span>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif" }}>
          {search ? 'No venues match this search.' : 'No venues yet — click + New Venue to add one.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => {
            const scraper = scraperByVenueName[v.name?.toLowerCase()];
            const hasCoords = v.latitude != null && v.longitude != null;
            const hasPhoto = !!v.photo_url;
            return (
              <div
                key={v.id}
                onClick={() => handleEdit(v)}
                style={{
                  padding: '10px 14px', borderRadius: '10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                      {v.name}
                    </span>
                    {v.venue_type && (
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                        background: 'rgba(139,92,246,0.12)', color: '#A78BFA',
                        fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.4px', textTransform: 'uppercase',
                      }}>
                        {v.venue_type}
                      </span>
                    )}
                    {scraper && (
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                        background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                        fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.4px', textTransform: 'uppercase',
                      }}>
                        Scraper-fed
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {v.city && <span>{v.city}</span>}
                    {v.address && (
                      <>
                        {v.city && <span>·</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.address}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Indicator chips — coords + photo presence at a glance */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <span title={hasCoords ? 'Has coords' : 'Missing coords'} style={{
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: hasCoords ? 'rgba(34,197,94,0.10)' : 'rgba(234,179,8,0.10)',
                    color: hasCoords ? '#22c55e' : '#EAB308',
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  }}>
                    📍
                  </span>
                  <span title={hasPhoto ? 'Has photo' : 'No photo'} style={{
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: hasPhoto ? 'rgba(34,197,94,0.10)' : 'var(--bg-elevated)',
                    color: hasPhoto ? '#22c55e' : 'var(--text-muted)',
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  }}>
                    📷
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <VenueEditModal
          venue={editing}
          setVenue={setEditing}
          onClose={handleClose}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          deleting={deleting}
          geocodeAddress={geocodeAddress}
          showQueueToast={showQueueToast}
        />
      )}
    </div>
  );
}

/**
 * Edit modal — controlled form for one venue. Pure presentational; the
 * parent owns the venue state and the save/delete handlers.
 */
function VenueEditModal({ venue, setVenue, onClose, onSave, onDelete, saving, deleting, geocodeAddress, showQueueToast }) {
  const isNew = !venue.id;
  const [geocoding, setGeocoding] = useState(false);
  // Ergonomic field setter — keeps the JSX below tidy.
  const set = (key, val) => setVenue(prev => ({ ...prev, [key]: val }));

  // Geocode handler — calls the server-side Nominatim proxy with the
  // current address and fills both lat/lng fields on success. Surfaces
  // errors via toast (e.g., empty address, no Nominatim match, timeout).
  const handleGeocode = async () => {
    if (!venue.address?.trim()) {
      showQueueToast?.('Fill in the address first');
      return;
    }
    setGeocoding(true);
    try {
      const result = await geocodeAddress(venue.address);
      if (result) {
        // Round to 6 decimal places — beyond that is meter-scale noise
        // and adds no real precision for venue mapping.
        const lat = Math.round(result.latitude * 1e6) / 1e6;
        const lng = Math.round(result.longitude * 1e6) / 1e6;
        setVenue(prev => ({ ...prev, latitude: lat, longitude: lng }));
        showQueueToast?.(`Geocoded → ${lat}, ${lng}`);
      }
      // On null result, geocodeAddress already toasted the specific error
    } finally {
      setGeocoding(false);
    }
  };
  // Auto-derive a slug suggestion when name changes on a new venue (only if
  // slug is still empty; never overwrite an admin's edit).
  const onNameChange = (val) => {
    setVenue(prev => {
      const next = { ...prev, name: val };
      if (isNew && !prev.slug) {
        next.slug = val.toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
      return next;
    });
  };
  // Tags input is comma-separated text in the form; we split to array on
  // change so the payload is already shaped for the DB column.
  const tagsText = (venue.tags || []).join(', ');
  const onTagsChange = (val) => {
    set('tags', val.split(',').map(t => t.trim()).filter(Boolean));
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflow: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '560px',
          background: 'var(--bg-primary)', borderRadius: '14px',
          border: '1px solid var(--border)',
          padding: '20px 22px',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isNew ? 'New Venue' : venue.name || 'Edit Venue'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '20px', padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Form — paired columns where it makes sense, full-width otherwise */}
        <div style={{ display: 'grid', gap: '12px' }}>
          <Field label="Name *" required>
            <input
              type="text" value={venue.name} onChange={e => onNameChange(e.target.value)}
              autoFocus={isNew}
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="City">
              <input
                type="text" value={venue.city} onChange={e => set('city', e.target.value)}
                placeholder="Asbury Park"
                style={inputStyle}
              />
            </Field>
            <Field label="Slug">
              <input
                type="text" value={venue.slug} onChange={e => set('slug', e.target.value)}
                placeholder="auto-generated from name"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              type="text" value={venue.address} onChange={e => set('address', e.target.value)}
              placeholder="123 Main St, Town, NJ 07712"
              style={inputStyle}
            />
          </Field>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700,
                color: 'var(--text-muted)',
                fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.4px',
                textTransform: 'uppercase',
              }}>
                Coordinates
              </span>
              {/* Geocode button — calls Nominatim with the current address
                  and fills both lat/lng on success. Disabled while a
                  geocode is in flight, or while the parent is saving /
                  deleting (so the form state doesn't shift mid-save). */}
              <button
                type="button"
                onClick={handleGeocode}
                disabled={geocoding || saving || deleting || !venue.address?.trim()}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  fontSize: '11px', fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  background: 'rgba(232,114,42,0.12)',
                  color: '#E8722A',
                  border: '1px solid rgba(232,114,42,0.30)',
                  cursor: (geocoding || saving || deleting || !venue.address?.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (geocoding || saving || deleting || !venue.address?.trim()) ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                {geocoding ? '⟳ Geocoding…' : '⟳ Geocode from address'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Latitude">
                <input
                  type="number" step="any"
                  value={venue.latitude} onChange={e => set('latitude', e.target.value)}
                  placeholder="40.2206"
                  style={inputStyle}
                />
              </Field>
              <Field label="Longitude">
                <input
                  type="number" step="any"
                  value={venue.longitude} onChange={e => set('longitude', e.target.value)}
                  placeholder="-74.0121"
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>

          <Field label="Website">
            <input
              type="url" value={venue.website} onChange={e => set('website', e.target.value)}
              placeholder="https://venue.com"
              style={inputStyle}
            />
          </Field>

          <Field label="Photo URL">
            <input
              type="url" value={venue.photo_url} onChange={e => set('photo_url', e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Type">
              <input
                type="text" list="venue-type-suggestions"
                value={venue.venue_type} onChange={e => set('venue_type', e.target.value)}
                placeholder="bar, restaurant, …"
                style={inputStyle}
              />
              <datalist id="venue-type-suggestions">
                {VENUE_TYPE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
              </datalist>
            </Field>
            <Field label="Default start time">
              <input
                type="time" value={venue.default_start_time}
                onChange={e => set('default_start_time', e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input
              type="text" value={tagsText} onChange={e => onTagsChange(e.target.value)}
              placeholder="outdoor, dog-friendly, rooftop"
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Footer — Delete (left, danger), Cancel + Save (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px', gap: '8px' }}>
          {!isNew ? (
            <button
              onClick={onDelete}
              disabled={saving || deleting}
              style={{
                padding: '8px 14px', borderRadius: '8px',
                background: 'transparent', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.30)',
                fontSize: '12px', fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: (saving || deleting) ? 'not-allowed' : 'pointer',
                opacity: (saving || deleting) ? 0.6 : 1,
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              disabled={saving || deleting}
              style={{
                padding: '8px 14px', borderRadius: '8px',
                background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                fontSize: '12px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: (saving || deleting) ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving || deleting || !venue.name?.trim()}
              style={{
                padding: '8px 16px', borderRadius: '8px',
                background: '#E8722A', color: '#000', border: 'none',
                fontSize: '12px', fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: (saving || deleting || !venue.name?.trim()) ? 'not-allowed' : 'pointer',
                opacity: (saving || deleting || !venue.name?.trim()) ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : (isNew ? 'Create' : 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: '13px',
  fontFamily: "'DM Sans', sans-serif", outline: 'none',
};

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', marginBottom: '4px',
        fontSize: '11px', fontWeight: 700,
        color: required ? 'var(--text-primary)' : 'var(--text-muted)',
        fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.4px',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}
