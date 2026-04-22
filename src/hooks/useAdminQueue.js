'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const QUEUE_VENUE_OPTIONS = [
  'The Stone Pony', 'House of Independents', 'The Wonder Bar',
  'The Saint', 'Asbury Lanes', 'Danny Clinch Transparent Gallery',
  'Bar Anticipation', 'The Headliner', 'Donovan\'s Reef',
  'Langosta Lounge', 'Johnny Mac\'s', 'The Osprey',
];

const qSurface = '#1A1A24';
const qSurfaceAlt = '#22222E';
const qBorder = '#2A2A3A';
const qText = '#F0F0F5';
const qTextMuted = '#7878A0';
const qAccent = '#E8722A';
const qGreen = '#23CE6B';
const qRed = '#EF4444';

const qInputStyle = {
  width: '100%', padding: '10px 12px', background: qSurfaceAlt,
  border: `1px solid ${qBorder}`, borderRadius: '8px', color: qText,
  fontFamily: "'DM Sans', sans-serif", fontSize: '14px', outline: 'none',
  colorScheme: 'dark',
};

const qLabelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: qTextMuted,
  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px',
  fontFamily: "'DM Sans', sans-serif",
};

export default function useAdminQueue({ password, venues, setVenues, fetchAll, supabase, toTitleCase, showQueueToast, authenticated }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const [queue, setQueue] = useState([]);
  const [queueSelectedIdx, setQueueSelectedIdx] = useState(0);
  const [queueActionLoading, setQueueActionLoading] = useState(false);
  const [queueForm, setQueueForm] = useState({
    artist_name: '', venue_name: '', event_date: '', event_time: '',
    genre: '', vibe: '', cover: '', ticket_link: '', event_name: '',
    category: '', confidence_score: 0,
    // Series/festival linkage (admin-controlled; defaults OFF so OCR
    // event_name suggestions don't silently promote every submission
    // into a festival/series — the old bug). See queue/route.js for
    // the find-or-create-and-link logic.
    is_series: false, series_category: 'festival',
  });
  const [queueDuplicates, setQueueDuplicates] = useState([]);
  const [queueDupLoading, setQueueDupLoading] = useState(false);
  const [queueLightboxUrl, setQueueLightboxUrl] = useState(null);
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [newVenueLoading, setNewVenueLoading] = useState(false);
  const [adminFlyerUploading, setAdminFlyerUploading] = useState(false);
  const [adminFlyerDragOver, setAdminFlyerDragOver] = useState(false);
  const adminFlyerRef = useRef(null);
  const [batchApplyPrompt, setBatchApplyPrompt] = useState(null);

  const populateQueueForm = (sub) => {
    setQueueForm({
      artist_name: sub.artist_name || '',
      venue_name: sub.venue_name || '',
      event_date: sub.event_date ? sub.event_date.substring(0, 10) : '',
      event_time: sub.event_date && sub.event_date.length > 10 ? sub.event_date.substring(11, 16) : '',
      genre: sub.genre || '',
      vibe: sub.vibe || '',
      cover: sub.cover || '',
      ticket_link: sub.ticket_link || '',
      event_name: sub.event_name || '',
      category: sub.category || '',
      confidence_score: sub.confidence_score || 0,
      // Always reset series linkage to OFF per-submission — admin must
      // explicitly opt in. Prevents cross-contamination between queue rows.
      is_series: false,
      series_category: 'festival',
    });
    setQueueDuplicates([]);
  };

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/queue', { headers: { Authorization: `Bearer ${password}` } });
      if (res.status === 401) return;
      const data = await res.json();
      setQueue(data);
      if (data.length > 0) {
        setQueueSelectedIdx(0);
        populateQueueForm(data[0]);
      }
    } catch (err) { console.error(err); }
  }, [password]);

  const handleAdminFlyerUpload = async (file) => {
    if (!file || adminFlyerUploading) return;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) { showQueueToast({ type: 'error', msg: '❌ Invalid file type — use JPG, PNG, WebP, or GIF' }); return; }
    if (file.size > 15 * 1024 * 1024) { showQueueToast({ type: 'error', msg: '❌ File too large (max 15 MB)' }); return; }

    setAdminFlyerUploading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const fileName = `admin-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('posters').upload(fileName, file, { contentType: file.type });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      const { data: urlData } = supabase.storage.from('posters').getPublicUrl(fileName);

      const res = await fetch('/api/admin/ocr-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ image_url: urlData.publicUrl }),
      });

      let result;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): ${res.statusText || 'No response body'}`);
      }
      if (!res.ok) throw new Error(result.error || `OCR failed (${res.status})`);

      if (result.drafts_created === 0) {
        showQueueToast({ type: 'error', msg: '⚠️ AI could not extract any events from this flyer — try a clearer image' });
      } else {
        showQueueToast({ type: 'success', msg: `✅ AI extracted ${result.drafts_created} event${result.drafts_created > 1 ? 's' : ''} — added to queue` });
      }
      fetchQueue();
    } catch (err) {
      console.error('[flyer-upload] Error:', err);
      const msg = err.message || 'Unknown error';
      if (msg.includes('413') || msg.includes('payload') || msg.includes('too large')) {
        showQueueToast({ type: 'error', msg: '❌ Upload failed: Image file too large for server' });
      } else if (msg.includes('504') || msg.includes('timeout') || msg.includes('Timeout')) {
        showQueueToast({ type: 'error', msg: '❌ Upload failed: AI processing timed out — try a simpler flyer' });
      } else if (msg.includes('Storage upload')) {
        showQueueToast({ type: 'error', msg: `❌ Upload failed: Could not save image — ${msg}` });
      } else {
        showQueueToast({ type: 'error', msg: `❌ Upload failed: ${msg}` });
      }
    }
    setAdminFlyerUploading(false);
    setAdminFlyerDragOver(false);
  };

  const selectQueueItem = (idx) => {
    setQueueSelectedIdx(idx);
    if (queue[idx]) populateQueueForm(queue[idx]);
    setQueueDuplicates([]);
    setNewVenueOpen(false);
    setNewVenueName('');
    setNewVenueAddress('');
  };

  const advanceQueue = () => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== queueSelectedIdx);
      const newIdx = Math.min(queueSelectedIdx, next.length - 1);
      if (next.length > 0 && next[newIdx]) {
        setQueueSelectedIdx(newIdx);
        populateQueueForm(next[newIdx]);
      } else {
        setQueueSelectedIdx(0);
        setQueueForm({ artist_name: '', venue_name: '', event_date: '', event_time: '', genre: '', vibe: '', cover: '', ticket_link: '' });
      }
      return next;
    });
  };

  const handleCreateVenue = async () => {
    if (!newVenueName.trim()) return;
    setNewVenueLoading(true);
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({
          name: newVenueName.trim(),
          address: newVenueAddress.trim() || null,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && result.venue) {
          setVenues(prev => {
            const exists = prev.some(v => v.id === result.venue.id);
            return exists ? prev : [...prev, result.venue].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          });
          updateQueueForm('venue_name', result.venue.name);
          setNewVenueOpen(false);
          setNewVenueName('');
          setNewVenueAddress('');
          showQueueToast(`✅ Venue "${result.venue.name}" already exists — auto-selected`);
          setNewVenueLoading(false);
          return;
        }
        throw new Error(result.error || `Error ${res.status}`);
      }
      const created = result;
      setVenues(prev => [...prev, created].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      updateQueueForm('venue_name', created.name);
      setNewVenueOpen(false);
      setNewVenueName('');
      setNewVenueAddress('');
      showQueueToast(`✅ Venue "${created.name}" created`);
    } catch (err) {
      showQueueToast({ type: 'error', msg: `⛔ Failed to create venue: ${err.message}` });
    }
    setNewVenueLoading(false);
  };

  const resolveVenueId = (venueName) => {
    if (!venueName || !venues || venues.length === 0) return null;
    const normalized = venueName.trim().toLowerCase();
    const match = venues.find(v => v.name && v.name.trim().toLowerCase() === normalized);
    return match ? match.id : null;
  };

  const handleQueueApprove = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    if (!queueForm.artist_name || !queueForm.venue_name || !queueForm.event_date) {
      alert('Please fill in Artist, Venue, and Date before approving.');
      return;
    }

    const venueId = resolveVenueId(queueForm.venue_name);
    if (!venueId) {
      showQueueToast({ type: 'error', msg: `⛔ "${queueForm.venue_name}" is not a registered venue. Please select one from the dropdown before publishing.` });
      return;
    }

    setQueueActionLoading(true);
    try {
      const sanitized = {
        ...queueForm,
        artist_name: toTitleCase(queueForm.artist_name),
        venue_name: toTitleCase(queueForm.venue_name),
      };
      let eventDate = sanitized.event_date;
      if (sanitized.event_time) {
        const probe = new Date(`${sanitized.event_date}T12:00:00`);
        const etOff = probe.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
        eventDate = new Date(`${sanitized.event_date}T${sanitized.event_time}:00${etOff}`).toISOString();
      }
      const res = await fetch('/api/admin/queue', {
        method: 'POST', headers,
        body: JSON.stringify({ submission_id: sub.id, event_data: { ...sanitized, event_date: eventDate, venue_id: venueId } }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        const errMsg = result.error || `Server error ${res.status}`;
        showQueueToast({ type: 'error', msg: `⛔ Publish failed: ${errMsg}` });
        setQueueActionLoading(false);
        return;
      }
      const confidence = queueForm.confidence_score || 0;
      const triageNote = confidence >= 90 ? ' → auto-routed (skipped triage)' : '';
      showQueueToast({ type: 'success', msg: `✅ ${sanitized.artist_name} published!${triageNote}` });
      advanceQueue();
      fetchAll();
    } catch (err) {
      showQueueToast({ type: 'error', msg: `⛔ Publish failed: ${err.message || 'Network error'}` });
    }
    setQueueActionLoading(false);
  };

  const handleQueueReject = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'reject' }),
      });
      showQueueToast('❌ Rejected');
      advanceQueue();
    } catch { alert('Reject failed'); }
    setQueueActionLoading(false);
  };

  const handleQueueBlock = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    if (!confirm('Block this submitter? They won\'t be able to submit again.')) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'block' }),
      });
      showQueueToast('🚫 Submitter blocked');
      advanceQueue();
    } catch { alert('Block failed'); }
    setQueueActionLoading(false);
  };

  const handleQueueArchive = async () => {
    const sub = queue[queueSelectedIdx];
    if (!sub) return;
    setQueueActionLoading(true);
    try {
      await fetch('/api/admin/queue', {
        method: 'PUT', headers,
        body: JSON.stringify({ submission_id: sub.id, action: 'archive' }),
      });
      showQueueToast('📝 Saved as Draft');
      advanceQueue();
    } catch { alert('Save failed'); }
    setQueueActionLoading(false);
  };

  const updateQueueForm = (k, v) => {
    setQueueForm(f => ({ ...f, [k]: v }));

    if ((k === 'event_name' || k === 'venue_name') && v && queue.length > 1) {
      const currentSub = queue[queueSelectedIdx];
      if (currentSub?.image_url) {
        const siblings = queue.filter((s, i) =>
          i !== queueSelectedIdx && s.image_url === currentSub.image_url
        );
        if (siblings.length > 0) {
          setBatchApplyPrompt({ field: k, value: v, count: siblings.length, flyerUrl: currentSub.image_url });
        }
      }
    }
  };

  const applyBatchToFlyer = async () => {
    if (!batchApplyPrompt) return;
    const { field, value, flyerUrl } = batchApplyPrompt;

    const siblingIds = queue
      .filter(s => s.image_url === flyerUrl)
      .map(s => s.id);

    if (siblingIds.length > 0) {
      try {
        const res = await fetch('/api/admin/queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ submission_ids: siblingIds, updates: { [field]: value } }),
        });
        if (res.ok) {
          setQueue(prev => prev.map(s =>
            siblingIds.includes(s.id) ? { ...s, [field]: value } : s
          ));
          showQueueToast(`✅ Applied "${value}" to ${siblingIds.length} submissions from this flyer`);
        }
      } catch (err) {
        showQueueToast({ type: 'error', msg: `⛔ Batch update failed: ${err.message}` });
      }
    }
    setBatchApplyPrompt(null);
  };

  const queueSelected = queue[queueSelectedIdx] || null;

  const checkQueueDuplicates = useCallback(async () => {
    if (!queueForm.venue_name || !queueForm.event_date) { setQueueDuplicates([]); return; }
    setQueueDupLoading(true);
    try {
      const res = await fetch(
        `/api/admin/duplicate-check?venue=${encodeURIComponent(queueForm.venue_name)}&date=${queueForm.event_date}`,
        { headers: { Authorization: `Bearer ${password}` } }
      );
      const data = await res.json();
      const currentArtist = (queueForm.artist_name || '').trim().toLowerCase();
      const filtered = (data.duplicates || []).filter(d =>
        (d.artist_name || '').trim().toLowerCase() !== currentArtist
      );
      setQueueDuplicates(filtered);
    } catch { setQueueDuplicates([]); }
    setQueueDupLoading(false);
  }, [queueForm.venue_name, queueForm.event_date, queueForm.artist_name, password]);

  useEffect(() => {
    if (authenticated && queueForm.venue_name && queueForm.event_date) {
      const t = setTimeout(checkQueueDuplicates, 500);
      return () => clearTimeout(t);
    }
  }, [queueForm.venue_name, queueForm.event_date, authenticated, checkQueueDuplicates]);

  return {
    queue, setQueue,
    queueSelectedIdx, setQueueSelectedIdx,
    queueActionLoading,
    queueForm, setQueueForm,
    queueDuplicates, queueDupLoading,
    queueLightboxUrl, setQueueLightboxUrl,
    newVenueOpen, setNewVenueOpen,
    newVenueName, setNewVenueName,
    newVenueAddress, setNewVenueAddress,
    newVenueLoading,
    adminFlyerUploading,
    adminFlyerDragOver, setAdminFlyerDragOver,
    adminFlyerRef,
    batchApplyPrompt, setBatchApplyPrompt,
    queueSelected,

    fetchQueue,
    handleAdminFlyerUpload,
    selectQueueItem,
    handleQueueApprove,
    handleQueueReject,
    handleQueueBlock,
    handleQueueArchive,
    handleCreateVenue,
    resolveVenueId,
    updateQueueForm,
    applyBatchToFlyer,

    qSurface, qSurfaceAlt, qBorder, qText, qTextMuted, qAccent, qGreen, qRed,
    qInputStyle, qLabelStyle,
    QUEUE_VENUE_OPTIONS,
  };
}
