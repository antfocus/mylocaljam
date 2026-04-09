'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Badge from '@/components/ui/Badge';

const DARK = {
  bg:       '#0D0D12',
  surface:  '#1A1A24',
  surfaceAlt:'#22222E',
  border:   '#2A2A3A',
  text:     '#F0F0F5',
  textMuted:'#7878A0',
  textSubtle:'#4A4A6A',
  accent:   '#E8722A',
  accentAlt:'#3AADA0',
  inputBg:  '#22222E',
};
const LIGHT = {
  bg:       '#F7F5F2',
  surface:  '#FFFFFF',
  surfaceAlt:'#F9FAFB',
  border:   '#E5E7EB',
  text:     '#1F2937',
  textMuted:'#6B7280',
  textSubtle:'#9CA3AF',
  accent:   '#E8722A',
  accentAlt:'#3AADA0',
  inputBg:  '#F3F4F6',
};

// ── Drag-and-Drop overlay helper ─────────────────────────────────────────────
function useDragDrop(onFileDrop) {
  const [dragOver, setDragOver] = useState(false);
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) onFileDrop(file);
  };
  return { dragOver, handleDragOver, handleDragLeave, handleDrop };
}

export default function SubmitEventModal({ onClose, onSubmit, darkMode = true }) {
  const t = darkMode ? DARK : LIGHT;
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const submittedRef = useRef(false);
  const confirmedRef = useRef(false);  // GATEKEEPER: only true when Confirm button is clicked

  // ── View state: 'cards' (default) | 'poster' | 'manual' ──────────────
  const [view, setView] = useState('cards');

  // Photo upload state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Manual entry state
  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Submission history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  // ── RULE: File selection ONLY sets local preview — NEVER uploads ──────
  const setPreviewFromFile = useCallback((file) => {
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setView('poster');
  }, [photoPreview]);

  // Drag-and-drop — only sets preview, never uploads
  const { dragOver, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(setPreviewFromFile);

  // Scroll input into view (iOS keyboard fix)
  const scrollFieldIntoView = (e) => {
    setTimeout(() => { e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
  };

  // Load recent submissions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch('/api/submissions/mine');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setHistory(data.slice(0, 5));
        }
      } catch { /* silent — history is non-critical */ }
      if (!cancelled) setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Reset + close ──────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setView('cards');
    setPhotoFile(null);
    setPhotoPreview(null);
    setUploading(false);
    setArtist('');
    setVenue('');
    setDate('');
    setSubmitting(false);
    submittedRef.current = false;
    confirmedRef.current = false;  // Reset gatekeeper
    onClose();
  }, [onClose, photoPreview]);

  // ── File input onChange — preview only, NEVER uploads ───────────────
  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input value so re-selecting the same file still fires onChange
    e.target.value = '';
    setPreviewFromFile(file);
  }, [setPreviewFromFile]);

  const handlePhotoSubmit = async () => {
    // ── DEBUG: trace every invocation ──
    console.log('DEBUG: handlePhotoSubmit TRIGGERED', {
      confirmedRef: confirmedRef.current,
      hasFile: !!photoFile,
      uploading,
      submitted: submittedRef.current,
      caller: new Error().stack?.split('\n')[2]?.trim(),
    });

    // ── GATEKEEPER: block unless Confirm button was explicitly clicked ──
    if (!confirmedRef.current) {
      console.warn('DEBUG: handlePhotoSubmit BLOCKED — confirmedRef is false');
      return;
    }

    if (!photoFile || uploading || submittedRef.current) return;
    const MAX_SIZE = 10 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (photoFile.size > MAX_SIZE) { alert('File is too large. Maximum size is 10MB.'); return; }
    if (!ALLOWED_TYPES.includes(photoFile.type)) { alert('Invalid file type. Please upload a JPG, PNG, WebP, or GIF image.'); return; }

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

      const { data: urlData } = supabase.storage.from('posters').getPublicUrl(fileName);
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: urlData.publicUrl, status: 'pending' }),
      });
      if (!res.ok) { const errBody = await res.json().catch(() => ({})); throw new Error(errBody.error || 'Submission failed'); }
      onSubmit?.();
      handleClose();
    } catch (err) {
      alert(`Upload failed: ${err.message || 'Please try again.'}`);
      submittedRef.current = false;
      confirmedRef.current = false;  // Reset gatekeeper on failure
    }
    setUploading(false);
  };

  // ── Manual submit handler ─────────────────────────────────────────────
  const handleManualSubmit = async () => {
    if (!artist.trim() || !venue.trim() || !date) { alert('Please fill in all 3 fields.'); return; }
    if (submitting || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_name: artist.trim(), venue_name: venue.trim(), event_date: date, status: 'pending' }),
      });
      if (!res.ok) { const errBody = await res.json().catch(() => ({})); throw new Error(errBody.error || 'Submission failed'); }
      onSubmit?.();
      handleClose();
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
      submittedRef.current = false;
    }
    setSubmitting(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '12px 14px',
    background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: '10px',
    color: t.text, fontFamily: "'DM Sans', sans-serif", fontSize: '16px',
    outline: 'none', WebkitAppearance: 'none', colorScheme: darkMode ? 'dark' : 'light', boxSizing: 'border-box',
  };
  const fieldLabel = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: t.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0, fontFamily: "'DM Sans', sans-serif",
  };

  // ── Status badge helper ───────────────────────────────────────────────
  const STATUS_CONFIGS = {
    pending:  { label: 'Pending',  bg: 'rgba(234,179,8,0.12)',  color: '#EAB308' },
    approved: { label: 'Approved', bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
    rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
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
        {/* ── Drag handle ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.border }} />
        </div>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ padding: '8px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {view !== 'cards' && (
              <button onClick={() => { if (photoPreview) URL.revokeObjectURL(photoPreview); setView('cards'); setPhotoFile(null); setPhotoPreview(null); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: '20px',
                padding: '4px', display: 'flex', alignItems: 'center',
              }}>
                &#8592;
              </button>
            )}
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
              {view === 'cards' ? 'Add to the Jar' : view === 'poster' ? 'Submit a Gig Poster' : 'Create Manually'}
            </h2>
          </div>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.textMuted, fontSize: '28px', lineHeight: 1,
            padding: '8px', minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            &times;
          </button>
        </div>

        {view === 'cards' && (
          <p style={{
            fontSize: '13px', color: t.textMuted, lineHeight: 1.5,
            fontFamily: "'DM Sans', sans-serif", margin: '0 20px 16px',
          }}>
            Know about a gig we missed? Drop it in the jar and we&apos;ll get it on the live feed.
          </p>
        )}

        <div style={{ padding: '0 20px 0' }}>

          {/* ═══════════════════════════════════════════════════════════════
               VIEW: CARDS — The Two-Door Hub
             ═══════════════════════════════════════════════════════════════ */}
          {view === 'cards' && (
            <>
              {/* ── Card 1: Submit Gig Poster (Primary / Massive) ──────── */}
              {/* Hidden file input — NOT linked via <label htmlFor> to prevent
                  double-fire on drag-and-drop. Triggered via fileRef.click(). */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', zIndex: -1, top: 0, left: 0 }}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '36px 20px',
                  borderRadius: '16px',
                  border: dragOver ? `2px solid ${t.accent}` : `2px dashed ${t.border}`,
                  background: dragOver
                    ? (darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.08)')
                    : (darkMode ? 'rgba(232,114,42,0.06)' : 'rgba(232,114,42,0.03)'),
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{
                  width: '56px', height: '56px', borderRadius: '16px',
                  background: darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '28px',
                }}>
                  &#128247;
                </div>
                <span style={{ fontSize: '17px', fontWeight: 800, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                  Submit a Gig Poster
                </span>
                <span style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>
                  Drag &amp; drop a flyer, or tap to choose from your library.{'\n'}Our AI reads it automatically.
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  marginTop: '4px', padding: '4px 12px', borderRadius: '20px',
                  background: darkMode ? 'rgba(232,114,42,0.15)' : 'rgba(232,114,42,0.1)',
                  fontSize: '11px', fontWeight: 700, color: t.accent,
                  fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  &#9889; Fastest way
                </span>
              </div>

              {/* ── Card 2: Create Manually (Secondary / Smaller) ──────── */}
              <button
                onClick={() => setView('manual')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  width: '100%', padding: '16px 18px', marginTop: '12px',
                  borderRadius: '14px',
                  border: `1px solid ${t.border}`,
                  background: t.surfaceAlt,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: darkMode ? 'rgba(58,173,160,0.12)' : 'rgba(58,173,160,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', flexShrink: 0,
                }}>
                  &#9998;
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                    Create Manually
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif", marginTop: '2px' }}>
                    Enter artist, venue &amp; date by hand
                  </span>
                </div>
                <span style={{ color: t.textSubtle, fontSize: '18px' }}>&#8250;</span>
              </button>

              {/* ── Recent Submissions History ─────────────────────────── */}
              {(history.length > 0 || historyLoading) && (
                <div style={{ marginTop: '24px' }}>
                  <p style={{
                    fontSize: '12px', fontWeight: 700, color: t.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.6px',
                    fontFamily: "'DM Sans', sans-serif", margin: '0 0 8px',
                  }}>
                    Your Recent Submissions
                  </p>
                  {historyLoading ? (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <span style={{ fontSize: '12px', color: t.textSubtle, fontFamily: "'DM Sans', sans-serif" }}>Loading...</span>
                    </div>
                  ) : (
                    <div style={{
                      borderRadius: '12px', overflow: 'hidden',
                      border: `1px solid ${t.border}`,
                    }}>
                      {history.map((sub, i) => (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 14px',
                            borderBottom: i < history.length - 1 ? `1px solid ${t.border}` : 'none',
                            background: t.surfaceAlt,
                          }}
                        >
                          {/* Thumbnail or icon */}
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '6px', flexShrink: 0,
                            background: sub.image_url ? 'none' : (darkMode ? '#2A2A3A' : '#E5E7EB'),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', fontSize: '14px',
                          }}>
                            {sub.image_url
                              ? <img src={sub.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : '&#9834;'
                            }
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: 'block', fontSize: '12px', fontWeight: 600, color: t.text,
                              fontFamily: "'DM Sans', sans-serif",
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {sub.artist_name || 'Flyer Upload'}
                            </span>
                            <span style={{ fontSize: '10px', color: t.textSubtle, fontFamily: "'DM Sans', sans-serif" }}>
                              {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {sub.venue_name ? ` \u00b7 ${sub.venue_name}` : ''}
                            </span>
                          </div>
                          {(() => { const c = STATUS_CONFIGS[sub.status] || STATUS_CONFIGS.pending; return <Badge label={c.label} size="sm" bg={c.bg} color={c.color} />; })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <p style={{
                fontSize: '12px', color: t.textSubtle, textAlign: 'center',
                fontFamily: "'DM Sans', sans-serif", marginTop: '20px', lineHeight: 1.5,
              }}>
                Submissions are reviewed before going live.
              </p>
              <div style={{ height: '24px' }} />
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
               VIEW: POSTER UPLOAD
             ═══════════════════════════════════════════════════════════════ */}
          {view === 'poster' && (
            <>
              {/* Hidden file input — triggered via fileRef.click() only */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', zIndex: -1 }}
              />

              {!photoPreview ? (
                /* ── No file selected yet — drop zone ──────────────────── */
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '40px 20px',
                    borderRadius: '16px',
                    border: dragOver ? `2px solid ${t.accent}` : `2px dashed ${t.border}`,
                    background: darkMode ? 'rgba(232,114,42,0.06)' : 'rgba(232,114,42,0.04)',
                    cursor: 'pointer', boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: '40px' }}>&#128247;</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
                    Choose a flyer image
                  </span>
                  <span style={{ fontSize: '13px', color: t.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
                    Drag &amp; drop or tap to browse
                  </span>
                </div>
              ) : (
                /* ── Preview + Confirmation ─────────────────────────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Preview label */}
                  <span style={{
                    fontSize: '12px', fontWeight: 700, color: t.textMuted,
                    textTransform: 'uppercase', letterSpacing: '0.6px',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Preview
                  </span>

                  {/* Image preview — contain (no crop), dark letterbox fill */}
                  <div style={{
                    position: 'relative', borderRadius: '12px', overflow: 'hidden',
                    border: `1px solid ${t.border}`,
                    background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    maxHeight: '400px',
                  }}>
                    <img
                      src={photoPreview}
                      alt="Flyer preview"
                      style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', display: 'block' }}
                    />
                  </div>

                  {/* Confirmation buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Change Image — secondary */}
                    <button
                      onClick={() => {
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        submittedRef.current = false;
                        confirmedRef.current = false;  // Reset gatekeeper
                        // Re-open file picker immediately
                        setTimeout(() => fileRef.current?.click(), 50);
                      }}
                      disabled={uploading}
                      style={{
                        flex: 1, padding: '14px', borderRadius: '12px',
                        border: `1px solid ${t.border}`, background: t.surfaceAlt,
                        color: t.text, fontWeight: 700, fontSize: '14px',
                        cursor: uploading ? 'default' : 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: uploading ? 0.5 : 1,
                      }}
                    >
                      Change Image
                    </button>

                    {/* Confirm & Upload — THE ONLY PATH that sets confirmedRef */}
                    <button
                      onClick={() => { confirmedRef.current = true; handlePhotoSubmit(); }}
                      disabled={uploading}
                      style={{
                        flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                        background: uploading ? t.textMuted : t.accent,
                        color: '#1C1917', fontWeight: 700, fontSize: '14px',
                        cursor: uploading ? 'default' : 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: uploading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      {uploading && (
                        <span style={{
                          display: 'inline-block', width: '14px', height: '14px',
                          border: '2px solid rgba(28,25,23,0.3)',
                          borderTopColor: '#1C1917',
                          borderRadius: '50%',
                          animation: 'submitSpin 0.6s linear infinite',
                        }} />
                      )}
                      {uploading ? 'Uploading\u2026' : 'Confirm & Upload'}
                    </button>
                  </div>
                </div>
              )}
              <div style={{ height: '40vh' }} />
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
               VIEW: MANUAL ENTRY
             ═══════════════════════════════════════════════════════════════ */}
          {view === 'manual' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...fieldLabel, marginBottom: '6px' }}>Artist / Band</label>
                <input
                  type="text" placeholder="e.g. The Gaslight Anthem"
                  value={artist} onChange={(e) => setArtist(e.target.value)}
                  onFocus={scrollFieldIntoView} style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ ...fieldLabel, marginBottom: '6px' }}>Venue</label>
                <input
                  type="text" placeholder="e.g. The Stone Pony"
                  value={venue} onChange={(e) => setVenue(e.target.value)}
                  onFocus={scrollFieldIntoView} style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ ...fieldLabel, marginBottom: '6px' }}>Date</label>
                <input
                  type="date" value={date} min={todayStr}
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
                  display: 'block', width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                  background: submitting ? t.textMuted : t.accent,
                  color: '#1C1917', fontWeight: 700, fontSize: '15px',
                  cursor: submitting ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Submitting...' : 'Add to the Jar'}
              </button>
              <div style={{ height: '40vh' }} />
            </>
          )}

        </div>
      </div>

      {/* Spinner keyframe for Confirm & Upload button */}
      <style>{`@keyframes submitSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
