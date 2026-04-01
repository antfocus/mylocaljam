'use client';

import { useState } from 'react';
import Badge from '@/components/ui/Badge';

/* ── Genre / Vibe constants (must match admin page) ─────────────────────── */
const GENRES = ['Rock','Alternative','Indie','Pop','R&B / Soul','Hip-Hop','Jazz','Blues','Country','Folk','Acoustic','Reggae','Latin','Electronic','Punk','Metal','Classical','Funk','Jam Band','Singer-Songwriter','Americana','World','Covers / Variety','DJ Set','Karaoke','Open Mic','Other'];
const VIBES = ['Chill','Energetic','Intimate','Party','Upbeat','Mellow','Romantic','Wild','Laid-back','Rowdy','Sophisticated','Family-Friendly','Late Night','Happy Hour','Brunch','Other'];

/* ── Source badge sub-component ──────────────────────────────────────────── */
function SourceBadge({ isCustom, inheritedLabel }) {
  return (
    <Badge
      label={isCustom ? 'Source: Custom Event Data' : `Source: ${inheritedLabel}`}
      size="sm"
      bg={isCustom ? 'rgba(232,114,42,0.12)' : 'rgba(59,130,246,0.10)'}
      color={isCustom ? '#E8722A' : '#60A5FA'}
      uppercase={false}
      style={{
        borderRadius: '999px',
        border: `1px solid ${isCustom ? 'rgba(232,114,42,0.25)' : 'rgba(59,130,246,0.20)'}`,
      }}
    />
  );
}

/* ── Revert button sub-component ─────────────────────────────────────────── */
function RevertButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
        background: 'rgba(239,68,68,0.08)', color: '#F87171',
        border: '1px solid rgba(239,68,68,0.20)', cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
      title={label || 'Clear custom value and revert to artist default'}
    >
      ✕ Revert
    </button>
  );
}

/* ── Inherited preview (greyed-out read-only display) ────────────────────── */
function InheritedPreview({ text, type }) {
  if (!text) return null;
  if (type === 'image') {
    return (
      <div style={{ marginTop: '6px', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', maxHeight: '100px', position: 'relative', opacity: 0.5 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={text} alt="Inherited artist image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
        <div style={{
          position: 'absolute', bottom: '4px', left: '4px',
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(0,0,0,0.7)', color: '#94A3B8',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Artist default image
        </div>
      </div>
    );
  }
  return (
    <div style={{
      marginTop: '4px', padding: '8px 12px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px dashed var(--border)',
      fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic',
      maxHeight: '60px', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontStyle: 'normal' }}>
        Inherited from artist:
      </span>
      {text.substring(0, 200)}{text.length > 200 ? '…' : ''}
    </div>
  );
}

/* ── Main EventFormModal ─────────────────────────────────────────────────── */
export default function EventFormModal({ event, artists = [], venues = [], onClose, onSave, adminPassword }) {
  const [form, setForm] = useState({
    event_title: event?.event_title || '',
    artist_name: event?.artist_name || '',
    artist_bio: event?.artist_bio || '',
    venue_name: event?.venue_name || event?.venues?.name || '',
    event_date: event?.event_date ? new Date(event.event_date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '',
    event_time: event?.event_date ? new Date(event.event_date).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    genre: event?.genre || '',
    vibe: event?.vibe || '',
    cover: event?.cover || '',
    ticket_link: event?.ticket_link || '',
    event_image_url: event?.event_image_url || '',
    status: event?.status || 'published',
    source: event?.source || 'Admin',
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Look up linked artist for inheritance
  const linkedArtist = event?.artist_id
    ? artists.find(a => a.id === event.artist_id)
    : artists.find(a => a.name?.toLowerCase() === form.artist_name?.toLowerCase());
  const inheritedGenres = linkedArtist?.genres || [];
  const inheritedVibes = linkedArtist?.vibes || [];
  const inheritedBio = linkedArtist?.bio || '';
  const inheritedImage = linkedArtist?.image_url || '';
  const inheritedName = linkedArtist?.name || form.artist_name || '';

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.artist_name || !form.venue_name || !form.event_date || !form.event_time) {
      alert('Please fill in Artist, Venue, Date, and Time.');
      return;
    }
    const probe = new Date(`${form.event_date}T12:00:00`);
    const etOffset = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    const eventDate = new Date(`${form.event_date}T${form.event_time}:00${etOffset}`).toISOString();
    onSave({ ...form, event_date: eventDate });
  };

  const handleAiEnhance = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/admin/ai-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminPassword}` },
        body: JSON.stringify({
          artist_name: form.artist_name,
          venue_name: form.venue_name,
          event_date: form.event_date,
          genre: form.genre,
          current_description: form.artist_bio,
        }),
      });
      const data = await res.json();
      if (data.enhanced) {
        update('artist_bio', data.enhanced);
      } else {
        alert(data.error || 'AI enhance failed');
      }
    } catch (err) {
      alert('AI enhance error: ' + err.message);
    }
    setAiLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    outline: 'none',
  };

  const readOnlyInputStyle = {
    ...inputStyle,
    opacity: 0.45,
    cursor: 'default',
    background: 'var(--bg-elevated)',
    borderStyle: 'dashed',
  };

  // Build venue options
  const venueNames = venues.map(v => v.name).filter(Boolean);
  const currentVenue = (form.venue_name || '').trim();
  const VENUE_OPTIONS = currentVenue && !venueNames.includes(currentVenue)
    ? [currentVenue, ...venueNames]
    : venueNames;

  /* ── Field label row helper (label + badge + revert) ───────────────────── */
  const FieldHeader = ({ label, required, isCustom, inheritedLabel, onRevert, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label className="font-display font-semibold text-[13px] text-brand-text-secondary" style={{ margin: 0 }}>
          {label}{required ? ' *' : ''}
        </label>
        <SourceBadge isCustom={isCustom} inheritedLabel={inheritedLabel} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {isCustom && onRevert && <RevertButton onClick={onRevert} />}
        {children}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-[540px] max-h-[85vh] overflow-y-auto rounded-2xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-display font-bold text-lg">{event ? 'Edit Event' : 'Add Event'}</h2>
          <button className="p-1 rounded-md text-brand-text-muted hover:text-brand-text" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">

          {/* ── Event Title (overrides artist name as headline) ──────────── */}
          <div>
            <FieldHeader
              label="Event Title"
              isCustom={!!form.event_title.trim()}
              inheritedLabel={`Artist Name: ${inheritedName || '—'}`}
              onRevert={form.event_title.trim() ? () => update('event_title', '') : null}
            />
            <input
              style={form.event_title.trim() ? inputStyle : readOnlyInputStyle}
              placeholder={inheritedName ? `Default headline: "${inheritedName}"` : 'e.g. Annual Mushfest (optional)'}
              value={form.event_title}
              onChange={(e) => update('event_title', e.target.value)}
              onFocus={(e) => { if (!form.event_title.trim()) e.target.style.opacity = '1'; e.target.style.borderStyle = 'solid'; e.target.style.cursor = 'text'; }}
              onBlur={(e) => { if (!form.event_title.trim()) { e.target.style.opacity = '0.45'; e.target.style.borderStyle = 'dashed'; e.target.style.cursor = 'default'; } }}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>If set, this shows as the primary headline. Leave blank to use the artist name.</p>
          </div>

          {/* ── Artist / Band Name (always required, not an override) ─────── */}
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Artist / Band Name *</label>
            <input style={inputStyle} placeholder="Links this event to the artist profile" value={form.artist_name} onChange={(e) => update('artist_name', e.target.value)} />
          </div>

          {/* ── Event Description (overrides artist bio) ─────────────────── */}
          <div>
            <FieldHeader
              label="Event Description"
              isCustom={!!form.artist_bio.trim()}
              inheritedLabel="Default Artist Bio"
              onRevert={form.artist_bio.trim() ? () => update('artist_bio', '') : null}
            >
              <button
                type="button"
                onClick={handleAiEnhance}
                disabled={aiLoading || !form.artist_name}
                style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                  background: aiLoading ? 'var(--border)' : 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  color: '#FFFFFF', border: 'none', cursor: aiLoading ? 'wait' : 'pointer',
                  opacity: !form.artist_name ? 0.4 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s ease',
                }}
              >
                {aiLoading ? 'Enhancing...' : 'AI Enhance'}
              </button>
            </FieldHeader>
            {form.artist_bio.trim() ? (
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} placeholder="Custom event-specific description" value={form.artist_bio} onChange={(e) => update('artist_bio', e.target.value)} />
            ) : (
              <>
                <textarea
                  style={{ ...readOnlyInputStyle, resize: 'vertical', minHeight: '60px' }}
                  placeholder="Click to add a custom description for this event..."
                  value={form.artist_bio}
                  onChange={(e) => update('artist_bio', e.target.value)}
                  onFocus={(e) => { e.target.style.opacity = '1'; e.target.style.borderStyle = 'solid'; e.target.style.cursor = 'text'; }}
                  onBlur={(e) => { if (!form.artist_bio.trim()) { e.target.style.opacity = '0.45'; e.target.style.borderStyle = 'dashed'; e.target.style.cursor = 'default'; } }}
                />
                {inheritedBio && <InheritedPreview text={inheritedBio} />}
              </>
            )}
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>If set, this shows instead of the global artist bio. Leave blank to use the artist&apos;s default bio.</p>
          </div>

          {/* ── Venue (always required, not an override) ──────────────────── */}
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Venue *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.venue_name} onChange={(e) => update('venue_name', e.target.value)}>
              <option value="">Select venue...</option>
              {VENUE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* ── Date + Time ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Date *</label>
              <input type="date" style={inputStyle} value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Time *</label>
              <input type="time" style={inputStyle} value={form.event_time} onChange={(e) => update('event_time', e.target.value)} />
            </div>
          </div>

          {/* ── Genre + Vibe Overrides ────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldHeader
                label="Genre"
                isCustom={!!form.genre}
                inheritedLabel={inheritedGenres.length > 0 ? `Artist: ${inheritedGenres[0]}${inheritedGenres.length > 1 ? '…' : ''}` : 'No Artist Default'}
                onRevert={form.genre ? () => update('genre', '') : null}
              />
              <select style={{ ...(form.genre ? inputStyle : readOnlyInputStyle), cursor: 'pointer' }} value={form.genre} onChange={(e) => update('genre', e.target.value)}>
                <option value="">{inheritedGenres.length > 0 ? `Inheriting: ${inheritedGenres.join(', ')}` : 'Select...'}</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <FieldHeader
                label="Vibe"
                isCustom={!!form.vibe}
                inheritedLabel={inheritedVibes.length > 0 ? `Artist: ${inheritedVibes[0]}${inheritedVibes.length > 1 ? '…' : ''}` : 'No Artist Default'}
                onRevert={form.vibe ? () => update('vibe', '') : null}
              />
              <select style={{ ...(form.vibe ? inputStyle : readOnlyInputStyle), cursor: 'pointer' }} value={form.vibe} onChange={(e) => update('vibe', e.target.value)}>
                <option value="">{inheritedVibes.length > 0 ? `Inheriting: ${inheritedVibes.join(', ')}` : 'Select...'}</option>
                {VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* ── Cover + Status ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Cover Charge</label>
              <input style={inputStyle} placeholder="Free, $10, etc." value={form.cover} onChange={(e) => update('cover', e.target.value)} />
            </div>
            <div>
              <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Status</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* ── Ticket Link ──────────────────────────────────────────────── */}
          <div>
            <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Ticket Link</label>
            <input style={inputStyle} placeholder="https://..." value={form.ticket_link} onChange={(e) => update('ticket_link', e.target.value)} />
          </div>

          {/* ── Event Image URL (overrides artist/venue image) ────────────── */}
          <div>
            <FieldHeader
              label="Event Image URL"
              isCustom={!!form.event_image_url.trim()}
              inheritedLabel="Default Artist Image"
              onRevert={form.event_image_url.trim() ? () => update('event_image_url', '') : null}
            />
            <input
              style={form.event_image_url.trim() ? inputStyle : readOnlyInputStyle}
              placeholder={inheritedImage ? 'Click to override with a custom flyer URL...' : 'https://... — overrides artist/venue image on cards'}
              value={form.event_image_url}
              onChange={(e) => update('event_image_url', e.target.value)}
              onFocus={(e) => { e.target.style.opacity = '1'; e.target.style.borderStyle = 'solid'; e.target.style.cursor = 'text'; }}
              onBlur={(e) => { if (!form.event_image_url.trim()) { e.target.style.opacity = '0.45'; e.target.style.borderStyle = 'dashed'; e.target.style.cursor = 'default'; } }}
            />
            {form.event_image_url.trim() ? (
              <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', maxHeight: '120px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.event_image_url} alt="Event preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              </div>
            ) : (
              inheritedImage && <InheritedPreview text={inheritedImage} type="image" />
            )}
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>If set, this image takes priority over the artist and venue photos.</p>
          </div>

          {/* ── Save Button ──────────────────────────────────────────────── */}
          <button
            className="w-full py-3 rounded-xl font-display font-semibold text-[15px] text-white"
            style={{ background: 'var(--accent)' }}
            onClick={handleSave}
          >
            {event ? 'Update Event' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
