'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const DARK = {
  bg:       '#0D0D12',
  surface:  '#1A1A24',
  border:   '#2A2A3A',
  text:     '#F0F0F5',
  textMuted:'#7878A0',
  accent:   '#E8722A',
  inputBg:  '#22222E',
};
const LIGHT = {
  bg:       '#F7F5F2',
  surface:  '#FFFFFF',
  border:   '#E5E7EB',
  text:     '#1F2937',
  textMuted:'#6B7280',
  accent:   '#E8722A',
  inputBg:  '#F3F4F6',
};

export default function SubmitEventModal({ onClose, onSubmit, darkMode = true }) {
  const t = darkMode ? DARK : LIGHT;
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const submittedRef = useRef(false); // double-submit guard

  // Scroll input into view when focused (fixes iOS keyboard covering fields)
  const scrollFieldIntoView = (e) => {
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300); // wait for iOS keyboard to finish animating
  };

  // Photo upload state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Manual entry state
  const [showManual, setShowManual] = useState(false);
  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // ── Full reset + close ──────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setUploading(false);
    setShowManual(false);
    setArtist('');
    setVenue('');
    setDate('');
    setSubmitting(false);
    submittedRef.current = false;
    onClose();
  }, [onClose]);

  // ── Photo handlers ──────────────────────────────────────────────────
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handlePhotoSubmit = async () => {
    if (!photoFile || uploading || submittedRef.current) return;

    // File validation: max 10MB, images only
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (photoFile.size > MAX_SIZE) {
      alert('File is too large. Maximum size is 10MB.');
      return;
    }
    if (!ALLOWED_TYPES.includes(photoFile.type)) {
      alert('Invalid file type. Please upload a JPG, PNG, WebP, or GIF image.');
      return;
    }

    submittedRef.current = true;
    setUploading(true);
    try {
      const ext = photoFile.name.split('.').pop().toLowerCase();
      const uuid = crypto.randomUUID();
      const fileName = `${uuid}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('posters')
        .upload(fileName, photoFile, { contentType: photoFile.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('posters')
        .getPublicUrl(fileName);

      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: urlData.publicUrl, status: 'pending' }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('Photo submission DB error:', res.status, errBody);
        throw new Error(errBody.error || 'Submission failed');
      }
      onSubmit?.();
      handleClose();
    } catch (err) {
      console.error('Upload error:', err.message || err);
      alert(`Upload failed: ${err.message || 'Please try again.'}`);
      submittedRef.current = false;
    }
    setUploading(false);
  };

  // ── Manual submit handler ───────────────────────────────────────────
  const handleManualSubmit = async () => {
    if (!artist.trim() || !venue.trim() || !date) {
      alert('Please fill in all 3 fields.');
      return;
    }
    if (submitting || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_name: artist.trim(),
          venue_name: venue.trim(),
          event_date: date,
          status: 'pending',
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('Manual submit error:', res.status, errBody);
        throw new Error(errBody.error || 'Submission failed');
      }
      onSubmit?.();
      handleClose();
    } catch (err) {
      console.error('Manual submit error:', err.message);
      alert(`Submission failed: ${err.message}`);
      submittedRef.current = false;
    }
    setSubmitting(false);
  };

  // ── Shared styles ───────────────────────────────────────────────────
  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: '10px',
    color: t.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '16px', // 16px prevents iOS zoom on focus
    outline: 'none',
    WebkitAppearance: 'none',
    colorScheme: darkMode ? 'dark' : 'light',
    boxSizing: 'border-box',
  };

  const fieldLabelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    color: t.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    margin: 0,
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={scrollRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '480px',
          maxHeight: '90vh', overflowY: 'auto',
          background: t.surface,
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* ── Drag handle ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.border }} />
        </div>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ padding: '8px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: '20px', fontWeight: 800, color: t.text,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>
            Add to the Jar
          </h2>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.textMuted, fontSize: '28px', lineHeight: 1,
            padding: '8px', minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            ×
          </button>
        </div>

        <p style={{
          fontSize: '13px', color: t.textMuted, lineHeight: 1.5,
          fontFamily: "'DM Sans', sans-serif", margin: '0 20px 20px',
        }}>
          Help us build the ultimate local music scene. Drop a gig we missed into the jar, and we&apos;ll get it on the live feed.
        </p>

        <div style={{ padding: '0 20px 0', position: 'relative' }}>
          {/* ── Photo Upload (Primary) ───────────────────────────────── */}
          <input
            ref={fileRef}
            id="flyer-upload"
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', zIndex: -1, top: 0, left: 0 }}
          />

          {!photoPreview ? (
            <label
              htmlFor="flyer-upload"
              style={{
                width: '100%',
                padding: '32px 20px',
                borderRadius: '16px',
                border: `2px dashed ${t.border}`,
                background: darkMode ? 'rgba(232,114,42,0.06)' : 'rgba(232,114,42,0.04)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                transition: 'border-color 0.2s, background 0.2s',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: '40px' }}>📷</span>
              <span style={{
                fontSize: '16px', fontWeight: 700, color: t.text,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Upload Gig Poster / Flyer
              </span>
              <span style={{
                fontSize: '13px', color: t.textMuted,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Snap a photo or choose from your library
              </span>
            </label>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                position: 'relative', borderRadius: '12px', overflow: 'hidden',
                border: `1px solid ${t.border}`,
              }}>
                <img
                  src={photoPreview}
                  alt="Flyer preview"
                  style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', display: 'block' }}
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); submittedRef.current = false; }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                    color: 'white', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
              <button
                onClick={handlePhotoSubmit}
                disabled={uploading}
                style={{
                  width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                  background: uploading ? t.textMuted : t.accent,
                  color: 'white', fontWeight: 700, fontSize: '15px', cursor: uploading ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? 'Uploading...' : 'Submit Flyer'}
              </button>
            </div>
          )}

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '24px 0 20px',
          }}>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
            <button
              onClick={() => setShowManual(!showManual)}
              style={{
                background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${t.border}`,
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '15px', color: t.textMuted, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap',
                padding: '10px 20px',
                minHeight: '44px',
              }}
            >
              {showManual ? 'hide manual entry' : 'or enter manually'}
            </button>
            <div style={{ flex: 1, height: '1px', background: t.border }} />
          </div>

          {/* ── Manual Entry (Secondary) ─────────────────────────────── */}
          {showManual && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...fieldLabelStyle, marginBottom: '6px' }}>Artist / Band</label>
                <input
                  type="text"
                  placeholder="e.g. The Gaslight Anthem"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  onFocus={scrollFieldIntoView}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...fieldLabelStyle, marginBottom: '6px' }}>Venue</label>
                <input
                  type="text"
                  placeholder="e.g. The Stone Pony"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  onFocus={scrollFieldIntoView}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ ...fieldLabelStyle, marginBottom: '6px' }}>Date</label>
                <input
                  type="date"
                  value={date}
                  min={todayStr}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={(e) => { try { e.target.showPicker(); } catch {} }}
                  onFocus={(e) => { scrollFieldIntoView(e); try { e.target.showPicker(); } catch {} }}
                  style={inputStyle}
                />
              </div>

              <button
                onClick={handleManualSubmit}
                disabled={submitting}
                style={{
                  display: 'block',
                  width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                  background: submitting ? t.textMuted : t.accent,
                  color: 'white', fontWeight: 700, fontSize: '15px', cursor: submitting ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: submitting ? 0.7 : 1,
                  marginBottom: '0',
                }}
              >
                {submitting ? 'Submitting...' : 'Add to the Jar'}
              </button>
            </div>
          )}

          {/* ── Footer note ──────────────────────────────────────────── */}
          <p style={{
            fontSize: '12px', color: t.textMuted, textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
            marginTop: '20px', lineHeight: 1.5,
          }}>
            Submissions are reviewed before going live. Thank you for helping the community!
          </p>

          {/* Spacer so fields can scroll above the keyboard */}
          <div style={{ height: '40vh' }} />
        </div>
      </div>
    </div>
  );
}
