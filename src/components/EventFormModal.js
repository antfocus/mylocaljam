'use client';

import { useState } from 'react';
import { MetadataField, StyleMoodSelector, ImagePreviewSection, GENRES, VIBES } from '@/components/admin/shared';

/* ═══════════════════════════════════════════════════════════════════════════
   EventFormModal — Unified Visual Metadata CMS (Phase 2)
   Two-column layout: Left = Identity, Right = Visuals & Logistics
   Supports artist inheritance via custom_* fields + sync toggles
   ═══════════════════════════════════════════════════════════════════════════ */

export default function EventFormModal({ event, artists = [], venues = [], onClose, onSave, adminPassword, onNavigateToArtist }) {

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    event_title:      event?.event_title || '',
    artist_name:      event?.artist_name || '',
    venue_name:       event?.venue_name || event?.venues?.name || '',
    event_date:       event?.event_date ? new Date(event.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '',
    event_time:       event?.event_date ? new Date(event.event_date).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    cover:            event?.cover || '',
    ticket_link:      event?.ticket_link || '',
    status:           event?.status || 'published',
    source:           event?.source || 'Admin',
    // Legacy field — still sent for backward compat
    artist_bio:       event?.artist_bio || '',
    // Custom override fields (Phase 0 columns)
    custom_bio:       event?.custom_bio || '',
    custom_genres:    event?.custom_genres || [],
    custom_vibes:     event?.custom_vibes || [],
    custom_image_url: event?.custom_image_url || event?.event_image_url || '',
    // Legacy single-select fields (kept for backward compat)
    genre:            event?.genre || '',
    vibe:             event?.vibe || '',
    event_image_url:  event?.event_image_url || '',
    is_featured:      event?.is_featured || false,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState(null); // { message, type: 'error' | 'success' }

  // ── Sync lock state per field ─────────────────────────────────────────────
  // Locked = inheriting from artist (custom_* is empty)
  // Unlocked = event has custom override
  const [locks, setLocks] = useState({
    bio:    !form.custom_bio,
    genres: !form.custom_genres?.length,
    vibes:  !form.custom_vibes?.length,
    image:  !form.custom_image_url,
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Linked artist lookup ──────────────────────────────────────────────────
  const linkedArtist = event?.artist_id
    ? artists.find(a => a.id === event.artist_id)
    : artists.find(a => a.name?.toLowerCase() === form.artist_name?.toLowerCase());
  const hasArtist = !!linkedArtist;
  const artistName = linkedArtist?.name || form.artist_name || '';
  const inheritedBio = linkedArtist?.bio || '';
  const inheritedGenres = linkedArtist?.genres || [];
  const inheritedVibes = linkedArtist?.vibes || [];
  const inheritedImage = linkedArtist?.image_url || '';

  // ── Sync toggle handlers ──────────────────────────────────────────────────
  // When unlocking: copy artist data into custom field so it's not blank
  // When locking: clear custom field to revert to inheritance
  const toggleLock = (field) => {
    const newLocked = !locks[field];
    setLocks(l => ({ ...l, [field]: newLocked }));

    if (newLocked) {
      // Re-locking → clear custom data (revert to artist)
      if (field === 'bio')    update('custom_bio', '');
      if (field === 'genres') update('custom_genres', []);
      if (field === 'vibes')  update('custom_vibes', []);
      if (field === 'image')  { update('custom_image_url', ''); update('event_image_url', ''); }
    } else {
      // Unlocking → seed custom field with current artist data
      if (field === 'bio')    update('custom_bio', inheritedBio);
      if (field === 'genres') update('custom_genres', [...inheritedGenres]);
      if (field === 'vibes')  update('custom_vibes', [...inheritedVibes]);
      if (field === 'image')  update('custom_image_url', inheritedImage);
    }
  };

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!form.artist_name || !form.venue_name || !form.event_date || !form.event_time) {
      alert('Please fill in Artist, Venue, Date, and Time.');
      return;
    }
    const probe = new Date(`${form.event_date}T12:00:00`);
    const etOffset = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    const eventDate = new Date(`${form.event_date}T${form.event_time}:00${etOffset}`).toISOString();

    // Compute is_custom_metadata flag
    const isCustom = !!(form.custom_bio || form.custom_genres?.length || form.custom_vibes?.length || form.custom_image_url);

    // Backward compat: sync custom_bio → artist_bio, custom_image_url → event_image_url
    const payload = {
      ...form,
      event_date: eventDate,
      artist_bio: form.custom_bio || form.artist_bio,
      event_image_url: form.custom_image_url || form.event_image_url,
      is_custom_metadata: isCustom,
      is_featured: form.is_featured,
    };
    setToast({ message: event ? 'Event updated successfully.' : 'Event created successfully.', type: 'success' });
    setTimeout(() => onSave(payload), 600);
  };

  // ── AI Enhance (returns structured JSON: bio, genre, vibe, image_search_query) ──
  const [aiResult, setAiResult] = useState(null); // stores last AI response for image_search_query display
  const handleAiEnhance = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/admin/ai-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminPassword}` },
        body: JSON.stringify({
          artist_name: form.artist_name,
          venue_name: form.venue_name,
          event_date: form.event_date,
          genre: form.genre || (inheritedGenres[0] || ''),
          current_description: form.custom_bio || inheritedBio,
        }),
      });
      const data = await res.json();
      if (data.enhanced || data.bio) {
        // Always apply bio
        update('custom_bio', data.bio || data.enhanced);
        setLocks(l => ({ ...l, bio: false }));
        // Apply genre if returned and no custom override exists
        if (data.genre && !form.custom_genres?.length) {
          update('custom_genres', [data.genre]);
          setLocks(l => ({ ...l, genres: false }));
        }
        // Apply vibe if returned and no custom override exists
        if (data.vibe && !form.custom_vibes?.length) {
          update('custom_vibes', [data.vibe]);
          setLocks(l => ({ ...l, vibes: false }));
        }
        // Store full result for image_search_query display
        setAiResult(data);
      } else {
        alert(data.error || 'AI enhance failed');
      }
    } catch (err) {
      alert('AI enhance error: ' + err.message);
    }
    setAiLoading(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text-primary)',
    fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
  };

  const labelStyle = {
    display: 'block', fontSize: '11px', fontWeight: 700,
    color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif",
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
  };

  // ── Venue options ─────────────────────────────────────────────────────────
  const venueNames = venues.map(v => v.name).filter(Boolean);
  const currentVenue = (form.venue_name || '').trim();
  const VENUE_OPTIONS = currentVenue && !venueNames.includes(currentVenue)
    ? [currentVenue, ...venueNames]
    : venueNames;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-h-[90vh] overflow-y-auto rounded-2xl border"
        style={{
          maxWidth: '820px',
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="font-display font-bold text-lg">
              {event ? 'Edit Event' : 'Add Event'}
            </h2>
            {hasArtist && (
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '999px', background: 'rgba(59,130,246,0.08)',
                color: '#60A5FA', border: '1px solid rgba(59,130,246,0.20)',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Linked: {artistName}
              </span>
            )}
            {!hasArtist && form.artist_name && (
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '999px', background: 'rgba(136,136,136,0.08)',
                color: 'var(--text-muted)', border: '1px solid var(--border)',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Standalone Event
              </span>
            )}
          </div>
          <button className="p-1 rounded-md text-brand-text-muted hover:text-brand-text" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Toast notification ──────────────────────────────────────────── */}
        {toast && (
          <div style={{
            margin: '0 24px', padding: '10px 16px', borderRadius: '8px',
            fontSize: '13px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            display: 'flex', alignItems: 'center', gap: '8px',
            background: toast.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            color: toast.type === 'error' ? '#EF4444' : '#22C55E',
            border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
            transition: 'opacity 0.2s ease',
          }}>
            <span>{toast.type === 'error' ? '⚠' : '✓'}</span>
            {toast.message}
          </div>
        )}

        {/* ── Two-Column Body ────────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '0',
        }}>

          {/* ═══════════ LEFT COLUMN — Identity ══════════════════════════ */}
          <div style={{
            padding: '20px 24px',
            borderRight: '1px solid var(--border)',
          }}>

            {/* Artist / Band Name */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Artist / Band Name *</label>
              <input
                style={inputStyle}
                placeholder="Links this event to the artist profile"
                value={form.artist_name}
                onChange={e => update('artist_name', e.target.value)}
              />
            </div>

            {/* Event Title (headline override) */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Event Title</label>
              <input
                style={inputStyle}
                placeholder={artistName ? `Default: "${artistName}"` : 'Optional headline override'}
                value={form.event_title}
                onChange={e => update('event_title', e.target.value)}
              />
              <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                If set, shows as the primary headline instead of artist name.
              </p>
            </div>

            {/* Description / Bio — with sync toggle */}
            <MetadataField
              label="Description"
              isCustom={!locks.bio}
              artistName={artistName}
              isLocked={locks.bio}
              onToggleLock={() => toggleLock('bio')}
              onRevert={!locks.bio ? () => toggleLock('bio') : null}
              hasArtist={hasArtist}
              inheritedValue={locks.bio ? inheritedBio : null}
              inheritedType="text"
            >
              {locks.bio && hasArtist ? (
                /* Locked — show read-only placeholder */
                <textarea
                  style={{
                    ...inputStyle, resize: 'vertical', minHeight: '70px',
                    opacity: 0.45, cursor: 'default',
                    background: 'var(--bg-elevated)', borderStyle: 'dashed',
                  }}
                  placeholder="Inheriting artist bio — unlock to customize"
                  readOnly
                  onClick={() => toggleLock('bio')}
                />
              ) : (
                /* Unlocked or no artist — editable */
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                  placeholder="Custom event-specific description..."
                  value={form.custom_bio}
                  onChange={e => update('custom_bio', e.target.value)}
                />
              )}
            </MetadataField>

            {/* AI Enhance button */}
            <div style={{ marginBottom: '18px' }}>
              <button
                type="button"
                onClick={handleAiEnhance}
                disabled={aiLoading || !form.artist_name}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                  background: aiLoading ? 'var(--border)' : 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  color: '#FFFFFF', border: 'none',
                  cursor: aiLoading ? 'wait' : 'pointer',
                  opacity: !form.artist_name ? 0.4 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s ease',
                  width: '100%',
                }}
              >
                {aiLoading ? 'Enhancing...' : '✨ AI Enhance (Bio + Genre + Vibe)'}
              </button>
              {/* Show image search query hint after AI runs */}
              {aiResult?.image_search_query && (
                <p style={{
                  fontSize: '11px', marginTop: '6px', color: '#7C3AED',
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                }}>
                  Image search tip: <strong>{aiResult.image_search_query}</strong>
                </p>
              )}
            </div>

            {/* ── Style & Mood section ────────────────────────────────────── */}
            <div style={{
              padding: '14px', borderRadius: '10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Style & Mood
              </div>

              {/* Genres — always show full grid, disabled when locked */}
              <MetadataField
                label="Genres"
                isCustom={!locks.genres}
                artistName={artistName}
                isLocked={locks.genres}
                onToggleLock={() => toggleLock('genres')}
                onRevert={!locks.genres ? () => toggleLock('genres') : null}
                hasArtist={hasArtist}
                style={{ marginBottom: '12px' }}
              >
                <StyleMoodSelector
                  options={GENRES}
                  selected={locks.genres && hasArtist ? inheritedGenres : form.custom_genres}
                  onChange={v => update('custom_genres', v)}
                  disabled={locks.genres && hasArtist}
                />
              </MetadataField>

              {/* Vibes — always show full grid, disabled when locked */}
              <MetadataField
                label="Vibes"
                isCustom={!locks.vibes}
                artistName={artistName}
                isLocked={locks.vibes}
                onToggleLock={() => toggleLock('vibes')}
                onRevert={!locks.vibes ? () => toggleLock('vibes') : null}
                hasArtist={hasArtist}
              >
                <StyleMoodSelector
                  options={VIBES}
                  selected={locks.vibes && hasArtist ? inheritedVibes : form.custom_vibes}
                  onChange={v => update('custom_vibes', v)}
                  accentColor="#3AADA0"
                  disabled={locks.vibes && hasArtist}
                />
              </MetadataField>
            </div>

          </div>

          {/* ═══════════ RIGHT COLUMN — Visuals & Logistics ══════════════ */}
          <div style={{ padding: '20px 24px' }}>

            {/* Event Image — unified single field for all events */}
            <MetadataField
              label="Event Image"
              isCustom={!locks.image}
              artistName={artistName}
              isLocked={locks.image}
              onToggleLock={hasArtist ? () => toggleLock('image') : undefined}
              onRevert={!locks.image && hasArtist ? () => toggleLock('image') : null}
              hasArtist={hasArtist}
              hint="If set, this image takes priority over artist and venue photos."
            >
              <ImagePreviewSection
                imageUrl={locks.image && hasArtist ? '' : form.custom_image_url}
                inheritedUrl={inheritedImage}
                isInherited={locks.image && hasArtist}
                onUrlChange={v => {
                  update('custom_image_url', v);
                  update('event_image_url', v); // keep legacy field in sync
                }}
                disabled={locks.image && hasArtist}
                placeholder={hasArtist && inheritedImage ? 'Unlock to set a custom event image...' : 'https://... (paste image URL)'}
              />
            </MetadataField>

            {/* ── Logistics Rail ──────────────────────────────────────────── */}
            <div style={{
              marginTop: '6px', padding: '14px', borderRadius: '10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)',
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Logistics
              </div>

              {/* Date + Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" style={inputStyle} value={form.event_date} onChange={e => update('event_date', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Time *</label>
                  <input type="time" style={inputStyle} value={form.event_time} onChange={e => update('event_time', e.target.value)} />
                </div>
              </div>

              {/* Venue */}
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Venue *</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.venue_name}
                  onChange={e => update('venue_name', e.target.value)}
                >
                  <option value="">Select venue...</option>
                  {VENUE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {/* Cover + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelStyle}>Cover Charge</label>
                  <input style={inputStyle} placeholder="Free, $10, etc." value={form.cover} onChange={e => update('cover', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={e => update('status', e.target.value)}>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Ticket Link */}
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Ticket Link</label>
                <input style={inputStyle} placeholder="https://..." value={form.ticket_link} onChange={e => update('ticket_link', e.target.value)} />
              </div>

              {/* Standalone event_image_url input removed — unified into ImagePreviewSection above */}

              {/* Feature in Spotlight toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderTop: '1px solid var(--border)',
              }}>
                <div>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Feature in Spotlight</span>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif", margin: '2px 0 0' }}>
                    Highlighted in the homepage carousel
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.is_featured) {
                      // Validate: must have image AND bio/description
                      const hasImage = !!(form.custom_image_url || form.event_image_url || (hasArtist && inheritedImage));
                      const hasBio = !!(form.custom_bio || (hasArtist && inheritedBio));
                      if (!hasImage || !hasBio) {
                        const missing = [];
                        if (!hasImage) missing.push('image');
                        if (!hasBio) missing.push('description');
                        setToast({ message: `Cannot feature: ${missing.join(' and ')} required.`, type: 'error' });
                        setTimeout(() => setToast(null), 4000);
                        return;
                      }
                    }
                    update('is_featured', !form.is_featured);
                  }}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                    background: form.is_featured ? '#FBBF24' : 'var(--border)',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px',
                    left: form.is_featured ? '22px' : '2px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: '#FFFFFF', transition: 'left 0.15s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 border-t"
          style={{
            borderColor: 'var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Cross-link to artist profile (only when linked + callback available) */}
          <div>
            {hasArtist && onNavigateToArtist ? (
              <button
                type="button"
                onClick={() => onNavigateToArtist(linkedArtist)}
                style={{
                  fontSize: '11px', color: '#60A5FA', fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer', background: 'none', border: 'none',
                  padding: 0, textDecoration: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                Edit Global Artist Profile: {artistName} →
              </button>
            ) : hasArtist ? (
              <span style={{
                fontSize: '11px', color: '#60A5FA', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: 'default',
              }}>
                Linked to artist: {artistName}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '10px 28px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                background: '#E8722A', color: '#1C1917',
                border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {event ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
