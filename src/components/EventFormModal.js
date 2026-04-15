'use client';

import { useState } from 'react';
import { MetadataField, StyleMoodSelector, ImagePreviewSection, GENRES, VIBES } from '@/components/admin/shared';
import { resolveTier, parentTierValue } from '@/lib/metadataWaterfall';

/* ═══════════════════════════════════════════════════════════════════════════
   EventFormModal — Unified Visual Metadata CMS (Phase 3: Twin Editor)
   Two-column layout: Left = Identity, Right = Visuals & Logistics
   Waterfall provenance: override → template → artist → scraper
   ═══════════════════════════════════════════════════════════════════════════ */

export default function EventFormModal({ event, artists = [], venues = [], templates = [], onClose, onSave, adminPassword, onNavigateToArtist }) {

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
    // Legacy scraper-tier fields — still sent for backward compat
    artist_bio:       event?.artist_bio || '',
    event_image_url:  event?.event_image_url || '',
    genre:            event?.genre || '',
    vibe:             event?.vibe || '',
    // Override-tier fields (Phase 0 custom_* columns)
    custom_bio:       event?.custom_bio || '',
    custom_genres:    event?.custom_genres || [],
    custom_vibes:     event?.custom_vibes || [],
    custom_image_url: event?.custom_image_url || '',
    // NOTE: `is_featured` removed — Spotlight curation now lives exclusively in
    // the dedicated Spotlights admin tab, which writes to the `spotlight_events`
    // table (date-scoped, single source of truth). See Agent_SOP §Spotlight.
    // Category — Confidence Cascade enum. Empty string means "inherit from
    // template/AI". When the user picks a value here, it counts as a manual
    // override (Verified Flip) on save.
    category:         event?.category || '',
    // Template link — null when standalone. Admin can manually bridge a
    // "Standalone" event to a template from the selector below; the on-change
    // handler clobbers the 12:00 AM scraper default if still present.
    template_id:      event?.template_id || null,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState(null); // { message, type: 'error' | 'success' }
  const [aiResult, setAiResult] = useState(null);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Linked artist lookup ──────────────────────────────────────────────────
  const linkedArtist = event?.artist_id
    ? artists.find(a => a.id === event.artist_id)
    : artists.find(a => a.name?.toLowerCase() === form.artist_name?.toLowerCase());
  const hasArtist = !!linkedArtist;
  const artistName = linkedArtist?.name || form.artist_name || '';

  // ── Waterfall tiers ───────────────────────────────────────────────────────
  // Override → Template → Artist Profile → Raw Scraper
  // Resolve the selected template from the templates prop when the form has
  // a template_id (either pre-existing or just picked from the selector).
  // Falls back to event.event_templates for backward-compat with callers that
  // already hydrate the join.
  const selectedTemplate = form.template_id
    ? (templates.find(t => t.id === form.template_id) || event?.event_templates || null)
    : null;
  const template = selectedTemplate;
  const hasTemplate = !!form.template_id;

  // ── Template-inheritance helpers (Time + Category) ─────────────────────
  // start_time on event_templates is the column the spec calls "master_time".
  const templateTimeRaw = template?.start_time || null;
  const templateTime = (() => {
    if (!templateTimeRaw) return '';
    // Normalize "HH:MM:SS" → "HH:MM" for the <input type="time"> control.
    const [hh, mm] = String(templateTimeRaw).split(':');
    if (!hh || !mm) return '';
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
  })();
  const templateCategory = template?.category || '';
  const isHumanEdited = !!event?.is_human_edited;

  // ── The "12:00 AM Exception" ──────────────────────────────────────────
  // Every Jersey Shore scraper we integrate with defaults missing start
  // times to midnight ("00:00"). That's not data — it's digital silence.
  // When a template is linked and the row hasn't been human-edited, treat
  // "00:00" the same as empty so the template's master_time wins over the
  // scraper default. Anything else (including "00:01" or an explicit admin
  // edit to midnight) is respected.
  const isMidnight = (t) => t === '00:00' || t === '00:00:00';
  const shouldTreatTimeAsEmpty = hasTemplate && !isHumanEdited && isMidnight(form.event_time);
  const effectiveFormTime = shouldTreatTimeAsEmpty ? '' : form.event_time;

  // A field is "inheriting" if the form currently shows the template value
  // (or is empty / midnight-scraper-default) and the row hasn't been admin
  // edited. Used to render the template indicator chip.
  const timeIsInherited     = hasTemplate && !isHumanEdited && !!templateTime && (!effectiveFormTime || effectiveFormTime === templateTime);
  const categoryIsInherited = hasTemplate && !isHumanEdited && !!templateCategory && (form.category === templateCategory || form.category === '');

  // Distinct template indicator — a small "T" badge. Intentionally NOT the
  // 🔗 emoji, which is used elsewhere for source-venue hyperlinks.
  const TemplateChip = ({ title }) => (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: '16px', height: '16px', padding: '0 4px',
        borderRadius: '4px', background: 'rgba(59,130,246,0.15)',
        border: '1px solid rgba(59,130,246,0.35)',
        color: '#60A5FA', fontSize: '10px', fontWeight: 800,
        fontFamily: "'DM Sans', sans-serif", lineHeight: 1,
      }}
    >T</span>
  );

  // ── Manual Template Link handler — force-clobber the 12:00 AM default ──
  const applyTemplateLink = (newTemplateId) => {
    if (!newTemplateId) {
      // Unlink
      setForm(f => ({ ...f, template_id: null }));
      return;
    }
    const picked = templates.find(t => t.id === newTemplateId);
    if (!picked) {
      setForm(f => ({ ...f, template_id: newTemplateId }));
      return;
    }
    // Compute the template's master_time in HH:MM form.
    const [ph, pm] = String(picked.start_time || '').split(':');
    const pickedTime = (ph && pm) ? `${ph.padStart(2, '0')}:${pm.padStart(2, '0')}` : '';

    setForm(f => {
      const next = { ...f, template_id: newTemplateId };
      // Force-overwrite time if empty OR midnight (scraper default).
      if (pickedTime && (!f.event_time || isMidnight(f.event_time))) {
        next.event_time = pickedTime;
      }
      // Fill category only if blank — respect explicit admin picks.
      if (picked.category && !f.category) {
        next.category = picked.category;
      }
      return next;
    });
  };

  const bioSources = {
    override: form.custom_bio,
    template: template?.bio || '',
    artist:   linkedArtist?.bio || '',
    scraper:  event?.artist_bio || '',
  };
  const imageSources = {
    override: form.custom_image_url,
    template: template?.image_url || '',
    artist:   linkedArtist?.image_url || '',
    scraper:  event?.event_image_url || '',
  };
  const genreSources = {
    override: form.custom_genres,
    template: Array.isArray(template?.genres) ? template.genres : [],
    artist:   linkedArtist?.genres || [],
    scraper:  event?.genre ? [event.genre] : [],
  };
  // Vibes get a 3-tier waterfall (templates don't carry vibes)
  const vibeSources = {
    override: form.custom_vibes,
    artist:   linkedArtist?.vibes || [],
    scraper:  event?.vibe ? [event.vibe] : [],
  };

  const bioResolved   = resolveTier(bioSources);
  const imageResolved = resolveTier(imageSources);
  const genreResolved = resolveTier(genreSources, 'array');
  const vibeResolved  = resolveTier(vibeSources, 'array');

  // ── Reset handlers — clear the override so the waterfall flows down ──────
  const resetField = (field) => {
    if (field === 'bio')    update('custom_bio', '');
    if (field === 'genres') update('custom_genres', []);
    if (field === 'vibes')  update('custom_vibes', []);
    if (field === 'image')  { update('custom_image_url', ''); update('event_image_url', ''); }
  };

  // ── Click-in seeding — populate override with the parent tier's value so
  //    the user can EDIT inherited content rather than retype it. Called on
  //    first focus of a field that's currently showing an inherited value.
  const seedOverride = (field) => {
    if (field === 'bio' && !form.custom_bio) {
      const seed = parentTierValue(bioSources);
      if (seed) update('custom_bio', seed);
    }
    if (field === 'image' && !form.custom_image_url) {
      const seed = parentTierValue(imageSources);
      if (seed) { update('custom_image_url', seed); update('event_image_url', seed); }
    }
  };

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = () => {
    // 12:00 AM Exception: when a template is linked, midnight is treated as
    // empty for inheritance purposes — fall through to the template's master
    // time on save instead of persisting the scraper default.
    const saveTimeCandidate = effectiveFormTime || templateTime;
    if (!form.artist_name || !form.venue_name || !form.event_date || !saveTimeCandidate) {
      alert('Please fill in Artist, Venue, Date, and Time.');
      return;
    }
    const probe = new Date(`${form.event_date}T12:00:00`);
    const etOffset = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    const effectiveTime = saveTimeCandidate;
    const eventDate = new Date(`${form.event_date}T${effectiveTime}:00${etOffset}`).toISOString();

    // is_custom_metadata: any override tier has content
    const isCustom = !!(form.custom_bio || form.custom_genres?.length || form.custom_vibes?.length || form.custom_image_url);

    const payload = {
      ...form,
      event_date: eventDate,
      // Backward-compat mirrors (legacy readers still consume these)
      artist_bio: form.custom_bio || form.artist_bio,
      event_image_url: form.custom_image_url || form.event_image_url,
      is_custom_metadata: isCustom,
    };
    setToast({ message: event ? 'Event updated successfully.' : 'Event created successfully.', type: 'success' });
    setTimeout(() => onSave(payload), 600);
  };

  // ── AI Enhance — writes into the override tier ────────────────────────────
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
          genre: genreResolved.value[0] || '',
          current_description: bioResolved.value,
        }),
      });
      const data = await res.json();
      if (data.enhanced || data.bio) {
        update('custom_bio', data.bio || data.enhanced);
        if (data.genre && !form.custom_genres?.length) update('custom_genres', [data.genre]);
        if (data.vibe  && !form.custom_vibes?.length)  update('custom_vibes',  [data.vibe]);
        setAiResult(data);
      } else {
        alert(data.error || 'AI enhance failed');
      }
    } catch (err) {
      alert('AI enhance error: ' + err.message);
    }
    setAiLoading(false);
  };

  // ── Image carousel — read candidates from the linked artist ──────────────
  const imageCandidates = Array.isArray(linkedArtist?.image_candidates) ? linkedArtist.image_candidates : [];
  const setCandidateAsActive = (url) => {
    update('custom_image_url', url);
    update('event_image_url', url);
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
            {template && (
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                borderRadius: '999px', background: 'rgba(59,130,246,0.08)',
                color: '#60A5FA', border: '1px solid rgba(59,130,246,0.20)',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Template: {template.template_name}
              </span>
            )}
            {!hasArtist && form.artist_name && (
              hasTemplate ? (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                  borderRadius: '999px', background: 'rgba(59,130,246,0.08)',
                  color: '#60A5FA', border: '1px solid rgba(59,130,246,0.20)',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <TemplateChip title={`Template: ${template?.template_name || ''}`} /> Template Linked
                </span>
              ) : (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                  borderRadius: '999px', background: 'rgba(136,136,136,0.08)',
                  color: 'var(--text-muted)', border: '1px solid var(--border)',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Standalone Event
                </span>
              )
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

            {/* Description / Bio — Twin Editor, single editable textarea */}
            <MetadataField
              label="Description"
              sources={bioSources}
              onReset={() => resetField('bio')}
              hasArtist={hasArtist}
            >
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }}
                placeholder="Event description — click to edit the inherited value or type your own"
                value={form.custom_bio || bioResolved.value}
                onFocus={() => seedOverride('bio')}
                onChange={e => update('custom_bio', e.target.value.slice(0, 500))}
                maxLength={500}
              />
              <div style={{ fontSize: '11px', color: '#888', textAlign: 'right', marginTop: '2px' }}>
                {(form.custom_bio || bioResolved.value || '').length} / 500
              </div>
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

              {/* Genres — waterfall; selector seeded with resolved value */}
              <MetadataField
                label="Genres"
                sources={genreSources}
                sourceType="array"
                onReset={() => resetField('genres')}
                hasArtist={hasArtist}
                style={{ marginBottom: '12px' }}
              >
                <StyleMoodSelector
                  options={GENRES}
                  selected={form.custom_genres?.length ? form.custom_genres : genreResolved.value}
                  onChange={v => update('custom_genres', v)}
                />
              </MetadataField>

              {/* Vibes — 3-tier waterfall (no template vibes) */}
              <MetadataField
                label="Vibes"
                sources={vibeSources}
                sourceType="array"
                onReset={() => resetField('vibes')}
                hasArtist={hasArtist}
              >
                <StyleMoodSelector
                  options={VIBES}
                  selected={form.custom_vibes?.length ? form.custom_vibes : vibeResolved.value}
                  onChange={v => update('custom_vibes', v)}
                  accentColor="#3AADA0"
                />
              </MetadataField>
            </div>

          </div>

          {/* ═══════════ RIGHT COLUMN — Visuals & Logistics ══════════════ */}
          <div style={{ padding: '20px 24px' }}>

            {/* Event Image — waterfall + candidate carousel */}
            <MetadataField
              label="Event Image"
              sources={imageSources}
              onReset={() => resetField('image')}
              hasArtist={hasArtist}
              hint="Waterfall picks the first non-empty tier. Pick a candidate below to override."
            >
              <ImagePreviewSection
                imageUrl={imageResolved.value}
                inheritedUrl=""
                isInherited={false}
                onUrlChange={v => {
                  update('custom_image_url', v);
                  update('event_image_url', v);
                }}
                placeholder="https://... (paste image URL)"
              />
            </MetadataField>

            {/* Image Candidate Carousel — from artists.image_candidates */}
            {imageCandidates.length > 0 && (
              <div style={{
                marginTop: '10px', padding: '12px', borderRadius: '10px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
                    textTransform: 'uppercase', color: 'var(--text-secondary)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Image Candidates ({imageCandidates.length})
                  </span>
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    From artist AI enrichment
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                  gap: '8px',
                }}>
                  {imageCandidates.map((url, i) => {
                    const isActive = url === imageResolved.value;
                    return (
                      <div key={`${url}-${i}`} style={{
                        position: 'relative', borderRadius: '6px', overflow: 'hidden',
                        border: isActive ? '2px solid #E8722A' : '1px solid var(--border)',
                        aspectRatio: '1 / 1',
                        boxShadow: isActive ? '0 0 0 2px rgba(232,114,42,0.20)' : 'none',
                        transition: 'all 0.15s',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Candidate ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.currentTarget.style.opacity = 0.2; }}
                        />
                        <button
                          type="button"
                          onClick={() => setCandidateAsActive(url)}
                          disabled={isActive}
                          style={{
                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            padding: '4px',
                            background: isActive
                              ? 'linear-gradient(to top, rgba(232,114,42,0.85), transparent 60%)'
                              : 'linear-gradient(to top, rgba(0,0,0,0.75), transparent 60%)',
                            color: '#FFFFFF',
                            fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px',
                            fontFamily: "'DM Sans', sans-serif",
                            border: 'none', cursor: isActive ? 'default' : 'pointer',
                            opacity: 1,
                          }}
                        >
                          {isActive ? '✓ Active' : 'Set as Active'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Logistics Rail ──────────────────────────────────────────── */}
            <div style={{
              marginTop: '14px', padding: '14px', borderRadius: '10px',
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

              {/* Template Selector — manual bridging for orphaned Standalone events */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Linked Template
                  {hasTemplate && <TemplateChip title="This event inherits from a template" />}
                </label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.template_id || ''}
                  onChange={e => applyTemplateLink(e.target.value || null)}
                >
                  <option value="">— Standalone (no template) —</option>
                  {(templates || [])
                    .slice()
                    .sort((a, b) => (a.template_name || '').localeCompare(b.template_name || ''))
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.template_name}{t.start_time ? ` · ${String(t.start_time).slice(0, 5)}` : ''}{t.category ? ` · ${t.category}` : ''}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: "'DM Sans', sans-serif" }}>
                  Linking a template clobbers the 12:00 AM scraper default with the template&rsquo;s master time.
                </div>
              </div>

              {/* Date + Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" style={inputStyle} value={form.event_date} onChange={e => update('event_date', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Time *
                    {timeIsInherited && (
                      <TemplateChip title={`Inheriting from template "${template?.template_name || ''}"`} />
                    )}
                  </label>
                  <input
                    type="time"
                    style={inputStyle}
                    // Midnight-aware: when a template is linked and the row is
                    // sitting on the scraper's 00:00 default, show the
                    // template's master_time instead so the field reflects the
                    // inheritance the backend will apply on save.
                    value={effectiveFormTime || templateTime}
                    placeholder={templateTime || 'HH:MM'}
                    onChange={e => update('event_time', e.target.value)}
                  />
                </div>
              </div>

              {/* Category — Confidence Cascade enum + template inheritance */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Category
                  {categoryIsInherited && (
                    <TemplateChip title={`Inheriting from template "${template?.template_name || ''}"`} />
                  )}
                </label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.category || ''}
                  onChange={e => update('category', e.target.value)}
                >
                  <option value="">
                    {templateCategory ? `— Template: ${templateCategory} —` : '— None (use AI inference) —'}
                  </option>
                  <option value="Live Music">Live Music</option>
                  <option value="Trivia">Trivia</option>
                  <option value="Karaoke">Karaoke</option>
                  <option value="DJ/Dance Party">DJ/Dance Party</option>
                  <option value="Comedy">Comedy</option>
                  <option value="Food & Drink">Food & Drink</option>
                  <option value="Sports">Sports</option>
                  <option value="Other">Other</option>
                </select>
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

              {/* Spotlight curation intentionally lives in the dedicated
                  Spotlights admin tab (date-scoped pins in `spotlight_events`).
                  The in-modal toggle was removed to eliminate the dual-source
                  conflict documented in the Spotlight audit. */}
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
