'use client';

import { useState, Fragment } from 'react';
import Badge from '@/components/ui/Badge';
import { MetadataField, StyleMoodSelector, ImagePreviewSection, GENRES, VIBES } from '@/components/admin/shared';

const NEW_TEMPLATE_FORM = { template_name: '', aliases: '', category: 'Live Music', venue_id: '', bio: '', genres: '', vibes: '', image_url: '', start_time: '', is_human_edited: {} };

// Fields that respect per-field locks. Mirrors LOCKABLE_FIELDS in
// /api/admin/event-templates/route.js — backend strips locked fields from
// incoming PUTs, so keeping these in sync prevents silent discards.
const LOCKABLE_FIELDS = ['template_name', 'bio', 'genres', 'vibes', 'image_url', 'aliases', 'category', 'start_time'];

export default function AdminEventTemplatesTab({
  templates, venues, password, isMobile,
  templatesSearch, setTemplatesSearch,
  templatesNeedsInfo, setTemplatesNeedsInfo,
  templateMissingFilters = { bio: false, image_url: false, genres: false, vibes: false }, setTemplateMissingFilters,
  templatesSortBy, setTemplatesSortBy,
  templateSubTab, setTemplateSubTab,
  directorySort, setDirectorySort,
  editingTemplate, setEditingTemplate,
  templateForm, setTemplateForm,
  templateToast, setTemplateToast,
  duplicateNameWarning, setDuplicateNameWarning,
  imageCandidates, setImageCandidates,
  imageCarouselIdx, setImageCarouselIdx,
  editPanelRef,
  deleteConfirm, setDeleteConfirm,
  regenerateField, regeneratingField,
  runBulkEnrich, bulkEnrichProgress,
  aiLoading, setAiLoading,
  fetchTemplates,
  showQueueToast,
}) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + password };

  // ── "Discover Recurring Events" (seed-from-feed) local state ────────────
  // Data model rewrite to support Venue-Specific templates:
  //
  //   seedGroups:    [{ title, total_count, splits: [{venue_id, venue_name, count, occurrences}],
  //                     global_candidate: {count, occurrences}, existing_scopes: [...] }]
  //   seedScopeMode: Map<normTitle, 'global'|'local'>  — one per group
  //   seedSelected:  Set<string>  — selection keys:
  //                     'g:<normTitle>'            when group is in global mode + global is checked
  //                     'v:<normTitle>|<venueId>'  when group is in local mode + a venue is checked
  //   seedExpanded:  Set<string>  — groupKey or split key showing sources panel
  //
  // The snappy 🌐/📍 toggle lives on each group header. Switching modes
  // doesn't destroy the other mode's checkbox state — we just read the
  // appropriate subset of seedSelected based on the current mode. That way
  // toggling back and forth feels instant (no "now select again" friction).
  const [seedModalOpen, setSeedModalOpen] = useState(false);
  const [seedGroups, setSeedGroups] = useState([]);
  const [seedScopeMode, setSeedScopeMode] = useState(new Map());
  const [seedSelected, setSeedSelected] = useState(new Set());
  const [seedExpanded, setSeedExpanded] = useState(new Set());
  // Per-occurrence "cherry pick": Set of event IDs that the admin has unchecked.
  // Default is all-checked, so the set starts empty. Keyed by event id (UUID),
  // not scoped per-group — the same event can appear under a global rollup and
  // under its venue's split, and we want those two views to reflect a single
  // "exclude this event" decision.
  const [seedOccExcluded, setSeedOccExcluded] = useState(new Set());
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedSubmitting, setSeedSubmitting] = useState(false);
  const [seedMinFreq, setSeedMinFreq] = useState(3);

  const normTitle = (s) => (s || '').trim().toLowerCase();

  // Pretty-format an ISO date (YYYY-MM-DD or full timestamp) for the sources list.
  const formatOccDate = (iso) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Pretty-format the start time from the event's ISO timestamp. Respects
  // is_time_tbd so "00:00"-esque rows don't mislead the admin.
  const formatOccTime = (o) => {
    if (!o) return '\u2014';
    if (o.is_time_tbd) return 'TBD';
    const d = new Date(o.event_date);
    if (Number.isNaN(d.getTime())) return '\u2014';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  };

  // Toggle the exclude flag for a single occurrence id.
  const toggleOccurrence = (id) => {
    setSeedOccExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // How many of `occs` are still checked (= not in the exclude set).
  // Used by the live count badges and the Convert payload builder.
  const effectiveOccCount = (occs) => {
    let n = 0;
    for (const o of occs || []) if (!seedOccExcluded.has(o.id)) n++;
    return n;
  };

  // IDs that survive the admin's cherry-pick for a given occurrences slice.
  const pickCheckedIds = (occs) =>
    (occs || []).filter(o => !seedOccExcluded.has(o.id)).map(o => o.id);

  // Venue name prefixing rule for locally-scoped template_names.
  // Kept out of the API — this is a UI naming decision per the architecture.
  // The matchmaker still finds "Music Bingo" because we push the original
  // title into aliases.
  const buildLocalTemplateName = (title, venueName) => {
    if (!venueName) return title;
    const normT = normTitle(title);
    const normV = venueName.trim().toLowerCase();
    if (normT.includes(normV)) return title; // don't double-prefix
    return `${venueName} ${title}`;
  };

  const openDiscoverModal = async () => {
    setSeedModalOpen(true);
    setSeedLoading(true);
    setSeedGroups([]);
    setSeedSelected(new Set());
    setSeedExpanded(new Set());
    setSeedScopeMode(new Map());
    setSeedOccExcluded(new Set());
    try {
      const res = await fetch('/api/admin/event-templates/seed', { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const groups = Array.isArray(data.groups) ? data.groups : [];
      setSeedGroups(groups);
      setSeedMinFreq(data.min_frequency || 3);

      // Default scope mode per group:
      //   - If feed only shows this title at ONE venue → 📍 local
      //   - Otherwise → 🌐 global (operator can flip to 📍 if splits are meaningful)
      // Default selection: select every split/scope that isn't already claimed.
      const modes = new Map();
      const sel = new Set();
      for (const g of groups) {
        const nt = normTitle(g.title);
        const claimed = new Set(g.existing_scopes || []);
        const usableSplits = (g.splits || []).filter(s => !claimed.has(s.venue_id || 'GLOBAL'));
        if (usableSplits.length === 1 && usableSplits[0].venue_id) {
          modes.set(nt, 'local');
          sel.add(`v:${nt}|${usableSplits[0].venue_id}`);
        } else {
          modes.set(nt, 'global');
          if (!claimed.has('GLOBAL')) sel.add(`g:${nt}`);
        }
      }
      setSeedScopeMode(modes);
      setSeedSelected(sel);
    } catch (err) {
      console.error('Discover failed:', err);
      setTemplateToast({ type: 'error', message: `Discover failed: ${err.message}` });
      setTimeout(() => setTemplateToast(null), 3500);
      setSeedModalOpen(false);
    } finally {
      setSeedLoading(false);
    }
  };

  const setScopeMode = (title, mode) => {
    const nt = normTitle(title);
    setSeedScopeMode(prev => {
      const next = new Map(prev);
      next.set(nt, mode);
      return next;
    });
  };

  const toggleGlobalSelection = (title) => {
    const key = `g:${normTitle(title)}`;
    setSeedSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleVenueSelection = (title, venueId) => {
    const key = `v:${normTitle(title)}|${venueId}`;
    setSeedSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleExpanded = (key) => {
    setSeedExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Count how many items (across all groups) would be created on submit.
  const seedSelectionCount = (() => {
    let n = 0;
    for (const g of seedGroups) {
      const nt = normTitle(g.title);
      const mode = seedScopeMode.get(nt) || 'global';
      if (mode === 'global') {
        if (seedSelected.has(`g:${nt}`)) n++;
      } else {
        for (const s of g.splits || []) {
          if (s.venue_id && seedSelected.has(`v:${nt}|${s.venue_id}`)) n++;
        }
      }
    }
    return n;
  })();

  const convertSelectedToTemplates = async () => {
    if (seedSelectionCount === 0) return;

    // Build venue-scoped items from current selection + scope mode per group.
    // Each item carries the exact set of occurrence_ids the admin still has
    // checked — the backend's "Safe Link" step uses this to set template_id
    // only on those rows and leaves unchecked ones untouched.
    const items = [];
    for (const g of seedGroups) {
      const nt = normTitle(g.title);
      const mode = seedScopeMode.get(nt) || 'global';
      if (mode === 'global') {
        if (seedSelected.has(`g:${nt}`)) {
          items.push({
            template_name: g.title,
            venue_id: null,
            aliases: [],
            occurrence_ids: pickCheckedIds(g.global_candidate?.occurrences),
          });
        }
      } else {
        for (const s of g.splits || []) {
          if (!s.venue_id) continue;
          if (!seedSelected.has(`v:${nt}|${s.venue_id}`)) continue;
          const venueName = s.venue_name || '';
          items.push({
            template_name: buildLocalTemplateName(g.title, venueName),
            venue_id: s.venue_id,
            // Put the bare title in aliases so the matchmaker's name lookup
            // still finds this local template when a scraped event arrives
            // with title="Music Bingo" and venue_id=<this venue>.
            aliases: g.title ? [g.title] : [],
            occurrence_ids: pickCheckedIds(s.occurrences),
          });
        }
      }
    }

    if (items.length === 0) return;
    setSeedSubmitting(true);
    try {
      const res = await fetch('/api/admin/event-templates/seed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ items }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.error) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      const inserted = result.inserted || 0;
      const skipped = (result.skipped || []).length;
      const linkedTotal = (result.links || []).reduce((s, l) => s + (l.linked_count || 0), 0);
      const linkWarns = (result.link_warnings || []).length;
      const linkBits = [];
      if (linkedTotal > 0) linkBits.push(`linked ${linkedTotal} event${linkedTotal === 1 ? '' : 's'}`);
      if (linkWarns > 0) linkBits.push(`${linkWarns} link warning${linkWarns === 1 ? '' : 's'}`);
      const tail = [
        skipped > 0 ? `${skipped} already existed` : null,
        linkBits.length > 0 ? linkBits.join(', ') : null,
      ].filter(Boolean).join(' \u00B7 ');
      setTemplateToast({
        type: linkWarns > 0 ? 'warning' : 'success',
        message: `Created ${inserted} template${inserted === 1 ? '' : 's'}${tail ? ` (${tail})` : ''}`,
      });
      if (linkWarns > 0) {
        console.warn('Template link warnings:', result.link_warnings);
      }
      setTimeout(() => setTemplateToast(null), 3500);
      setSeedModalOpen(false);
      fetchTemplates(templatesSearch, templatesNeedsInfo);
    } catch (err) {
      console.error('Seed POST failed:', err);
      setTemplateToast({ type: 'error', message: `Conversion failed: ${err.message}` });
      setTimeout(() => setTemplateToast(null), 3500);
    } finally {
      setSeedSubmitting(false);
    }
  };

  // ── Filter & sort ───────────────────────────────────────────────────────
  const filteredTemplates = (() => {
    let list = [...templates];
    if (templatesSearch) {
      const s = templatesSearch.toLowerCase();
      list = list.filter(t => t.template_name?.toLowerCase().includes(s));
    }
    if (templatesNeedsInfo) {
      list = list.filter(t => !t.bio || !t.image_url || !t.genres?.length || !t.vibes?.length);
    }
    if (Object.values(templateMissingFilters).some(Boolean)) {
      list = list.filter(t => {
        let m = false;
        if (templateMissingFilters.bio && !t.bio) m = true;
        if (templateMissingFilters.image_url && !t.image_url) m = true;
        if (templateMissingFilters.genres && (!t.genres || t.genres.length === 0)) m = true;
        if (templateMissingFilters.vibes && (!t.vibes || t.vibes.length === 0)) m = true;
        return m;
      });
    }
    if (templatesSortBy === 'created') {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (templatesSortBy === 'frequency') {
      list.sort((a, b) => {
        const ca = a._event_count || 0;
        const cb = b._event_count || 0;
        if (cb !== ca) return cb - ca;
        return (a.template_name || '').localeCompare(b.template_name || '');
      });
    } else {
      list.sort((a, b) => (a.template_name || '').localeCompare(b.template_name || ''));
    }
    return list;
  })();

  // ── Sub-tab toggle ──────────────────────────────────────────────────────
  const subTabToggle = (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', padding: '3px', borderRadius: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 'fit-content' }}>
      {[{ key: 'directory', label: 'Directory' }, { key: 'triage', label: 'Metadata Triage' }].map(st => {
        const active = templateSubTab === st.key;
        return (
          <button
            key={st.key}
            onClick={() => setTemplateSubTab(st.key)}
            style={{
              padding: '7px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', border: 'none',
              background: active ? '#E8722A' : 'transparent',
              color: active ? '#1C1917' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >{st.label}</button>
        );
      })}
    </div>
  );

  // ── Toast helper ────────────────────────────────────────────────────────
  const toast = (t) => { setTemplateToast(t); setTimeout(() => setTemplateToast(null), 3500); };

  // ── Form helpers ────────────────────────────────────────────────────────
  const openNewTemplate = () => {
    setEditingTemplate({ __new: true });
    setTemplateForm(NEW_TEMPLATE_FORM);
    setImageCandidates([]);
    setImageCarouselIdx(0);
  };

  const openEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    setImageCandidates(tpl.image_url ? [tpl.image_url] : []);
    setImageCarouselIdx(0);
    setTemplateForm({
      template_name: tpl.template_name || '',
      aliases: Array.isArray(tpl.aliases) ? tpl.aliases.join(', ') : (tpl.aliases || ''),
      category: tpl.category || 'Live Music',
      venue_id: tpl.venue_id || '',
      bio: tpl.bio || '',
      genres: Array.isArray(tpl.genres) ? tpl.genres.join(', ') : (tpl.genres || ''),
      vibes: Array.isArray(tpl.vibes) ? tpl.vibes.join(', ') : (tpl.vibes || ''),
      image_url: tpl.image_url || '',
      // Master Time (HH:MM 24h) for recurring events — nullable.
      start_time: tpl.start_time || '',
      // Carry the per-field lock map — each LockPill toggles the matching key.
      is_human_edited: (tpl.is_human_edited && typeof tpl.is_human_edited === 'object') ? { ...tpl.is_human_edited } : {},
    });
  };

  const closeEditor = () => {
    setEditingTemplate(null);
    setDuplicateNameWarning(null);
  };

  const saveTemplate = async () => {
    const name = (templateForm.template_name || '').trim();
    if (!name) {
      toast({ type: 'error', message: 'Template name is required' });
      return;
    }
    const aliases = templateForm.aliases
      ? templateForm.aliases.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const genres = templateForm.genres
      ? templateForm.genres.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    const vibes = templateForm.vibes
      ? templateForm.vibes.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const prevFS = editingTemplate?.field_status || {};
    const newFS = { ...prevFS };
    if (templateForm.bio) newFS.bio = 'live';
    if (templateForm.image_url) newFS.image_url = 'live';
    if (templateForm.genres) newFS.genres = 'live';
    if (templateForm.vibes) newFS.vibes = 'live';

    const payload = {
      template_name: name,
      aliases,
      category: templateForm.category || 'Live Music',
      venue_id: templateForm.venue_id || null,
      bio: templateForm.bio || null,
      genres: genres && genres.length > 0 ? genres : null,
      vibes: vibes && vibes.length > 0 ? vibes : null,
      image_url: templateForm.image_url || null,
      // Master Time — empty string becomes NULL so the frontend ladder falls through.
      start_time: templateForm.start_time || null,
      field_status: newFS,
      // Per-field lock map — prevents AI Bulk Enrich from overwriting
      // fields the admin has explicitly locked.
      is_human_edited: templateForm.is_human_edited && typeof templateForm.is_human_edited === 'object'
        ? templateForm.is_human_edited
        : {},
    };

    const isNew = editingTemplate?.__new;
    if (!isNew) payload.id = editingTemplate.id;

    const res = await fetch('/api/admin/event-templates', {
      method: isNew ? 'POST' : 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
      const errMsg = result.error || `HTTP ${res.status}`;
      if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('23505')) {
        toast({ type: 'error', message: `A template named "${name}" already exists.` });
      } else {
        toast({ type: 'error', message: `Save failed: ${errMsg}` });
      }
      return;
    }

    closeEditor();
    fetchTemplates(templatesSearch, templatesNeedsInfo);
    toast({ type: 'success', message: isNew ? 'Template created' : 'Saved' });
  };

  const deleteTemplate = async (id) => {
    const res = await fetch(`/api/admin/event-templates?id=${id}`, { method: 'DELETE', headers });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
      toast({ type: 'error', message: `Delete failed: ${result.error || `HTTP ${res.status}`}` });
      return;
    }
    setDeleteConfirm(null);
    if (editingTemplate?.id === id) closeEditor();
    fetchTemplates(templatesSearch, templatesNeedsInfo);
    if (showQueueToast) showQueueToast(`Deleted template: ${result.template_name || ''}`);
  };

  // ── Directory sub-tab ──────────────────────────────────────────────────
  if (templateSubTab === 'directory') {
    const approved = templates
      .filter(t => t.bio && t.image_url)
      .sort((a, b) => {
        const { col, dir } = directorySort;
        const mult = dir === 'asc' ? 1 : -1;
        if (col === 'name') return mult * (a.template_name || '').localeCompare(b.template_name || '');
        const aD = a.created_at || '';
        const bD = b.created_at || '';
        if (!aD && !bD) return 0;
        if (!aD) return 1;
        if (!bD) return -1;
        return mult * (aD < bD ? -1 : aD > bD ? 1 : 0);
      });

    return (
      <div>
        {subTabToggle}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ flex: '1 1 200px', maxWidth: '400px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search templates..."
              value={templatesSearch}
              onChange={e => { setTemplatesSearch(e.target.value); fetchTemplates(e.target.value, templatesNeedsInfo); }}
              style={{
                width: '100%', padding: '9px 14px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px', outline: 'none',
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
            {approved.length} approved template{approved.length !== 1 ? 's' : ''}
          </div>
        </div>

        {approved.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>📅</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
              No approved templates yet
            </p>
            <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
              Templates with both a bio and image will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {approved.map(tpl => (
              <div key={tpl.id} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tpl.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {tpl.template_name}
                  </span>
                </div>
                {!isMobile && (
                  <div style={{ width: '160px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
                    {tpl.category || '\u2014'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Triage sub-tab ─────────────────────────────────────────────────────
  const isTemplateLocked = !!editingTemplate && !!editingTemplate.is_locked;
  const inputStyle = {
    width: '100%', padding: '8px 12px', background: 'var(--bg-card)',
    border: '1px solid var(--border)', borderRadius: '8px',
    color: 'var(--text-primary)', fontSize: '13px',
    fontFamily: "'DM Sans', sans-serif", outline: 'none',
  };
  const lockedInputStyle = { ...inputStyle, background: 'var(--bg-elevated)', opacity: 0.6, cursor: 'not-allowed' };

  // Per-field lock pill. Click to flip templateForm.is_human_edited[field].
  // Backend strips locked fields from incoming PUTs, so this is what keeps
  // AI Bulk Enrich from overwriting hand-curated copy.
  //
  //   - Master lock on? Pill is locked + not clickable (master overrides).
  //   - Otherwise the pill is an interactive toggle:
  //       green closed padlock = "Locked" (field is protected)
  //       gray  open  padlock  = "Unlocked" (field is editable, AI may overwrite)
  const LockPill = ({ field }) => {
    const fieldLocks = (templateForm.is_human_edited && typeof templateForm.is_human_edited === 'object') ? templateForm.is_human_edited : {};
    const locked = isTemplateLocked || !!fieldLocks[field];
    const effectivelyMaster = isTemplateLocked && !fieldLocks[field]; // locked only because master is on
    const toggle = (e) => {
      e.stopPropagation();
      if (isTemplateLocked) return; // master lock takes priority
      setTemplateForm(p => {
        const prev = (p.is_human_edited && typeof p.is_human_edited === 'object') ? p.is_human_edited : {};
        const next = { ...prev };
        if (next[field]) delete next[field];
        else next[field] = true;
        return { ...p, is_human_edited: next };
      });
    };
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isTemplateLocked}
        title={effectivelyMaster
          ? 'Master Lock is on \u2014 unlock the template to toggle field locks'
          : locked
            ? `${field} is locked \u2014 AI Bulk Enrich will skip this field. Click to unlock.`
            : `${field} is unlocked \u2014 click to protect it from AI Bulk Enrich.`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px', borderRadius: '9999px',
          fontSize: '9px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.02em', textTransform: 'uppercase',
          background: locked ? 'rgba(34,197,94,0.1)' : 'rgba(136,136,136,0.06)',
          color: locked ? '#22c55e' : 'rgba(136,136,136,0.85)',
          border: locked ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(136,136,136,0.18)',
          cursor: isTemplateLocked ? 'not-allowed' : 'pointer',
          opacity: isTemplateLocked ? 0.75 : 1,
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          {locked
            ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            : <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" />
          }
        </svg>
        {locked ? 'Locked' : 'Unlocked'}
      </button>
    );
  };

  // Does this specific field currently behave as locked for input gating?
  // True when the master lock is on, OR when the field is per-field locked.
  const isFieldLocked = (field) => {
    if (isTemplateLocked) return true;
    const fl = (templateForm.is_human_edited && typeof templateForm.is_human_edited === 'object') ? templateForm.is_human_edited : {};
    return !!fl[field];
  };

  // ── Regenerate (sparkle) button — matches AdminArtistsTab pattern ──────
  const RegenBtn = ({ field }) => (
    <button
      type="button"
      title={`Regenerate ${field} with AI`}
      disabled={regeneratingField !== null}
      onClick={() => regenerateField && regenerateField(field)}
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

  // ── Templates missing AI-enrichable metadata (bio/image/vibes) ──────────
  const templatesNeedingEnrich = templates.filter(t => !t.is_locked && (!t.bio || !t.image_url || !t.vibes?.length || !t.category));
  const bulkEnrichActive = !!bulkEnrichProgress;
  const bulkEnrichLabel = bulkEnrichActive
    ? `Enriching ${bulkEnrichProgress.done}/${bulkEnrichProgress.total}\u2026`
    : `\u2728 Bulk Enrich Missing Metadata (${templatesNeedingEnrich.length})`;

  return (
    <>
      {subTabToggle}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ flex: '1 1 200px', maxWidth: '400px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search templates..."
            value={templatesSearch}
            onChange={e => { setTemplatesSearch(e.target.value); fetchTemplates(e.target.value, templatesNeedsInfo); }}
            style={{
              width: '100%', padding: '9px 14px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px', outline: 'none',
            }}
          />
        </div>

        {/* Missing filter */}
        {(() => {
          const activeMissing = Object.entries(templateMissingFilters).filter(([, v]) => v).map(([k]) => k);
          const missingLabel = activeMissing.length === 0 ? 'Missing: All' : `Missing: ${activeMissing.length}`;
          const opts = [{ key: 'bio', label: 'Bio' }, { key: 'image_url', label: 'Image' }, { key: 'genres', label: 'Genre' }, { key: 'vibes', label: 'Vibe' }];
          return (
            <select
              value=""
              onChange={e => {
                if (e.target.value === '__clear__') setTemplateMissingFilters({ bio: false, image_url: false, genres: false, vibes: false });
                else if (e.target.value) setTemplateMissingFilters(prev => ({ ...prev, [e.target.value]: !prev[e.target.value] }));
              }}
              style={{
                padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
                background: activeMissing.length > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-card)',
                border: activeMissing.length > 0 ? '1px solid #ef4444' : '1px solid var(--border)',
                color: activeMissing.length > 0 ? '#ef4444' : 'var(--text-secondary)',
              }}
            >
              <option value="" disabled>{missingLabel}</option>
              {opts.map(f => <option key={f.key} value={f.key}>{templateMissingFilters[f.key] ? '\u2713 ' : '  '}{f.label}</option>)}
              {activeMissing.length > 0 && <option value="__clear__">{'\u2715'} Clear filters</option>}
            </select>
          );
        })()}

        <select
          value={templatesSortBy}
          onChange={e => setTemplatesSortBy(e.target.value)}
          style={{
            padding: '7px 28px 7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', appearance: 'none',
            background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          }}
        >
          <option value="name">Sort: Name</option>
          <option value="created">Sort: Date Added</option>
          <option value="frequency">Sort: Frequency</option>
        </select>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </div>

        <button
          onClick={openNewTemplate}
          style={{
            padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#E8722A', color: '#1C1917', border: 'none', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >+ New Template</button>

        <button
          onClick={openDiscoverModal}
          disabled={seedLoading}
          title="Scan the events feed for recurring titles not yet in the template library"
          style={{
            padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid #E8722A', cursor: seedLoading ? 'wait' : 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >{seedLoading ? '\u23F3 Scanning...' : '\uD83D\uDD0D Discover Recurring Events'}</button>

        {templates.length > 0 && (
          <button
            onClick={() => {
              if (bulkEnrichActive) return;
              if (templatesNeedingEnrich.length === 0) {
                toast({ type: 'success', message: 'All templates already have complete metadata \u2728' });
                return;
              }
              runBulkEnrich(templatesNeedingEnrich);
            }}
            disabled={bulkEnrichActive}
            title={bulkEnrichActive ? 'Enrichment in progress\u2026' : `Run AI enrichment on ${templatesNeedingEnrich.length} templates missing bio / image / category / vibes`}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
              background: bulkEnrichActive ? 'rgba(232,114,42,0.3)' : 'linear-gradient(135deg, #E8722A, #d35f1a)',
              color: '#1C1917', border: 'none',
              cursor: bulkEnrichActive ? 'wait' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >{bulkEnrichLabel}</button>
        )}
      </div>

      {/* Toast */}
      {templateToast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          padding: '12px 20px', borderRadius: '10px',
          background: templateToast.type === 'error' ? '#ef4444' : '#22c55e',
          color: '#fff', fontSize: '13px', fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>{templateToast.message}</div>
      )}

      {/* Edit panel */}
      {editingTemplate && (
        <div ref={editPanelRef} style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
          borderRadius: '12px', padding: '20px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
              {editingTemplate.__new ? 'New Event Template' : `Editing: ${editingTemplate.template_name}`}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!editingTemplate.__new && (
                <button
                  disabled={aiLoading || isTemplateLocked}
                  title={isTemplateLocked ? 'Template is locked — unlock to auto-fill' : 'Run Perplexity + Serper to auto-fill bio, category, vibes, and image'}
                  onClick={async () => {
                    if (!editingTemplate?.template_name) return;
                    setAiLoading(true);
                    setTemplateToast(null);
                    try {
                      const venueName = (venues || []).find(v => v.id === editingTemplate.venue_id)?.name || '';
                      const res = await fetch('/api/admin/event-templates/ai-lookup', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ templateName: editingTemplate.template_name, venueName }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || `API error ${res.status}`);
                      }
                      const ai = await res.json();
                      const ml = !!editingTemplate.is_locked;
                      setTemplateForm(prev => ({
                        ...prev,
                        bio: ai.bio && !(ml && prev.bio) ? ai.bio : prev.bio,
                        category: ai.category && !(ml && prev.category) ? ai.category : prev.category,
                        vibes: ai.vibes?.length && !(ml && prev.vibes) ? ai.vibes.join(', ') : prev.vibes,
                        image_url: ai.image_url && !(ml && prev.image_url) ? ai.image_url : prev.image_url,
                      }));
                      if (ai.image_candidates?.length > 0) {
                        setImageCandidates(ai.image_candidates);
                        setImageCarouselIdx(0);
                      }
                      const imgNote = ai.image_source === 'placeholder' ? ' (placeholder images)' : ` (${ai.image_candidates?.length || 0} images found)`;
                      const reviewNote = ai.needs_review ? ' \u2014 flagged for review' : '';
                      toast({ type: 'success', message: `AI fields populated${imgNote}${reviewNote} \u2014 review & save!` });
                    } catch (err) {
                      console.error('AI auto-fill error:', err);
                      toast({ type: 'error', message: 'Could not auto-fill. Manual entry required.' });
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: aiLoading ? 'rgba(232,114,42,0.15)' : 'linear-gradient(135deg, #E8722A, #d35f1a)',
                    color: aiLoading ? 'var(--text-muted)' : '#1C1917',
                    border: 'none', cursor: aiLoading ? 'not-allowed' : (isTemplateLocked ? 'not-allowed' : 'pointer'),
                    fontFamily: "'DM Sans', sans-serif",
                    opacity: isTemplateLocked && !aiLoading ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {aiLoading ? '\u23F3 Searching...' : '\u2728 Auto-Fill with AI'}
                </button>
              )}
              <button
                onClick={closeEditor}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
              >{'\u2715'}</button>
            </div>
          </div>

          {/* Template Name */}
          <MetadataField label="Template Name" hasArtist={false} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><LockPill field="template_name" /></div>
            <input
              type="text"
              value={templateForm.template_name}
              onChange={e => !isFieldLocked('template_name') && setTemplateForm(p => ({ ...p, template_name: e.target.value }))}
              readOnly={isFieldLocked('template_name')}
              placeholder="e.g. Sunday Bluegrass Brunch"
              style={{ ...(isFieldLocked('template_name') ? lockedInputStyle : inputStyle), fontWeight: 700, fontSize: '15px' }}
            />
            {duplicateNameWarning && (
              <div style={{ fontSize: '11px', color: '#facc15', marginTop: '4px', fontFamily: "'DM Sans', sans-serif", background: 'rgba(250,204,21,0.08)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(250,204,21,0.2)' }}>
                {'\u26A0\uFE0F'} A template named &ldquo;{duplicateNameWarning}&rdquo; already exists.
              </div>
            )}
          </MetadataField>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            <div>
              {/* Category */}
              <MetadataField label="Category" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <LockPill field="category" />
                  {!isFieldLocked('category') && <RegenBtn field="category" />}
                </div>
                <input
                  type="text"
                  value={templateForm.category}
                  onChange={e => !isFieldLocked('category') && setTemplateForm(p => ({ ...p, category: e.target.value }))}
                  readOnly={isFieldLocked('category')}
                  placeholder="Live Music"
                  style={isFieldLocked('category') ? lockedInputStyle : inputStyle}
                />
              </MetadataField>

              {/* Venue */}
              <MetadataField label="Venue" hasArtist={false}>
                <select
                  value={templateForm.venue_id || ''}
                  onChange={e => setTemplateForm(p => ({ ...p, venue_id: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'auto' }}
                >
                  <option value="">— Select venue —</option>
                  {(venues || []).map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </MetadataField>

              {/* Master Time — the top rung of the frontend start_time ladder.
                  Leave blank to let the raw scraper time pass through. */}
              <MetadataField label="Master Time" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <LockPill field="start_time" />
                </div>
                <input
                  type="time"
                  value={templateForm.start_time || ''}
                  onChange={e => !isFieldLocked('start_time') && setTemplateForm(p => ({ ...p, start_time: e.target.value }))}
                  readOnly={isFieldLocked('start_time')}
                  style={isFieldLocked('start_time') ? lockedInputStyle : inputStyle}
                />
              </MetadataField>

              {/* Aliases */}
              <MetadataField label="Aliases (comma-separated)" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><LockPill field="aliases" /></div>
                <input
                  type="text"
                  value={templateForm.aliases}
                  onChange={e => !isFieldLocked('aliases') && setTemplateForm(p => ({ ...p, aliases: e.target.value }))}
                  readOnly={isFieldLocked('aliases')}
                  placeholder="Bluegrass Brunch, Sunday Brunch"
                  style={isFieldLocked('aliases') ? lockedInputStyle : inputStyle}
                />
              </MetadataField>

              {/* Bio */}
              <MetadataField label="Bio" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                  <LockPill field="bio" />
                  {!isFieldLocked('bio') && <RegenBtn field="bio" />}
                </div>
                <textarea
                  value={templateForm.bio}
                  onChange={e => !isFieldLocked('bio') && setTemplateForm(p => ({ ...p, bio: e.target.value }))}
                  readOnly={isFieldLocked('bio')}
                  rows={4}
                  style={{ ...(isFieldLocked('bio') ? lockedInputStyle : inputStyle), resize: isFieldLocked('bio') ? 'none' : 'vertical' }}
                />
              </MetadataField>

              {/* Vibes */}
              <MetadataField label="Vibes" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><LockPill field="vibes" /></div>
                <StyleMoodSelector
                  label=""
                  options={VIBES}
                  selected={templateForm.vibes}
                  onChange={next => setTemplateForm(p => ({ ...p, vibes: next }))}
                  disabled={isFieldLocked('vibes')}
                />
              </MetadataField>
            </div>

            <div>
              {/* Genres */}
              <MetadataField label="Genres" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><LockPill field="genres" /></div>
                <StyleMoodSelector
                  label=""
                  options={GENRES}
                  selected={templateForm.genres}
                  onChange={next => setTemplateForm(p => ({ ...p, genres: next }))}
                  disabled={isFieldLocked('genres')}
                />
              </MetadataField>

              {/* Image */}
              <MetadataField label="Template Image" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><LockPill field="image_url" /></div>
                <ImagePreviewSection
                  imageUrl={templateForm.image_url}
                  isInherited={false}
                  onUrlChange={url => !isFieldLocked('image_url') && setTemplateForm(p => ({ ...p, image_url: url }))}
                  disabled={isFieldLocked('image_url')}
                  candidates={imageCandidates}
                  candidateIdx={imageCarouselIdx}
                  onCandidateNav={newIdx => {
                    setImageCarouselIdx(newIdx);
                    setTemplateForm(p => ({ ...p, image_url: imageCandidates[newIdx] }));
                  }}
                  label="Mobile Preview"
                  maxPreviewHeight="180px"
                />
              </MetadataField>
            </div>
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {!editingTemplate.__new && (
                <button
                  onClick={() => setDeleteConfirm(editingTemplate)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >Delete</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={closeEditor}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--bg-card)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Cancel</button>
              <button
                onClick={saveTemplate}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      {filteredTemplates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>📅</p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>
            {templates.length === 0 ? 'No event templates yet' : 'No templates match these filters'}
          </p>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-muted)' }}>
            {templates.length === 0 ? 'Click "+ New Template" to create the first one.' : 'Clear the filter chips above to see all templates.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filteredTemplates.map(tpl => {
            const venueName = (venues || []).find(v => v.id === tpl.venue_id)?.name || '\u2014';
            const isSelected = !editingTemplate?.__new && editingTemplate?.id === tpl.id;
            const hasBio = !!tpl.bio;
            const hasImg = !!tpl.image_url;
            const hasCat = !!tpl.category;
            const hasVibe = Array.isArray(tpl.vibes) && tpl.vibes.length > 0;
            const isMasterLocked = !!tpl.is_locked;
            const fs = tpl.field_status || {};
            const fieldLocks = (tpl.is_human_edited && typeof tpl.is_human_edited === 'object') ? tpl.is_human_edited : {};

            // Per-field status pill — matches AdminArtistsTab.TrafficDot so the
            // two tabs feel like one family. Shows a padlock icon when the
            // field is locked (either via master lock or per-field lock map).
            const TrafficDot = ({ field, hasData, label }) => {
              const fieldLocked = !!fieldLocks[field];
              const status = fs[field] || (hasData ? 'live' : 'missing');
              const showLocked = (isMasterLocked || fieldLocked) && hasData;
              const lockedS  = { bg: 'rgba(34,197,94,0.2)',  color: '#22c55e', border: '1px solid rgba(34,197,94,0.5)' };
              const liveS    = { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' };
              const missingS = { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' };
              const pendingS = { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)' };
              const c = showLocked ? lockedS
                : status === 'pending' ? pendingS
                : status === 'missing' || !hasData ? missingS
                : liveS;
              const lockReason = isMasterLocked ? 'Master Lock' : 'per-field lock';
              return (
                <span
                  title={showLocked ? `${label} \u2014 locked via ${lockReason}` : hasData ? `${label} \u2014 live` : `${label} \u2014 missing`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    padding: '2px 8px', borderRadius: '9999px',
                    fontSize: '10px', fontWeight: showLocked ? 600 : 500, fontFamily: "'DM Sans', sans-serif",
                    background: c.bg, color: c.color, border: c.border,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {showLocked && <span style={{ fontSize: '7px' }}>{'\uD83D\uDD12'}</span>}
                  {label}
                </span>
              );
            };

            return (
              <div
                key={tpl.id}
                onClick={() => openEditTemplate(tpl)}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-card)'; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '10px 16px', borderRadius: '10px',
                  background: isSelected ? 'rgba(232,114,42,0.1)' : 'var(--bg-card)',
                  border: isSelected ? '1px solid #E8722A' : '1px solid var(--border)',
                  cursor: 'pointer', transition: 'background 0.1s ease, border-color 0.1s ease',
                }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                  overflow: 'hidden', background: 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                }}>
                  {tpl.image_url
                    ? <img src={tpl.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> // eslint-disable-line @next/next/no-img-element
                    : '📅'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Scope badge: 🌐 = Global (venue_id null, covers all venues), 📍 = Local (pinned to a specific venue) */}
                    <span
                      title={tpl.venue_id ? 'Local template (applies only to this venue)' : 'Global template (applies across all venues)'}
                      style={{
                        fontSize: '10px', lineHeight: 1, padding: '3px 6px', borderRadius: '6px',
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, flexShrink: 0,
                        background: tpl.venue_id ? 'rgba(232,114,42,0.12)' : 'rgba(100,116,139,0.12)',
                        color: tpl.venue_id ? '#E8722A' : '#64748b',
                        border: `1px solid ${tpl.venue_id ? 'rgba(232,114,42,0.25)' : 'rgba(100,116,139,0.2)'}`,
                      }}
                    >
                      {tpl.venue_id ? '\uD83D\uDCCD Local' : '\uD83C\uDF10 Global'}
                    </span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tpl.template_name}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: "'DM Sans', sans-serif" }}>
                    {venueName} {'\u00B7'} {tpl.category || 'Live Music'}
                  </div>
                </div>
                {!isMobile && tpl._event_count > 0 && (
                  <Badge
                    label={`${tpl._event_count}\u00D7`}
                    size="xs"
                    color="#E8722A"
                    bg="rgba(232,114,42,0.1)"
                  />
                )}

                {/* Traffic-light status pills — parity with AdminArtistsTab */}
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center', minWidth: '220px', justifyContent: 'center' }}>
                    <TrafficDot field="bio" hasData={hasBio} label="Bio" />
                    <TrafficDot field="image_url" hasData={hasImg} label="Img" />
                    <TrafficDot field="category" hasData={hasCat} label="Cat" />
                    <TrafficDot field="vibes" hasData={hasVibe} label="Vibe" />
                  </div>
                )}

                {/* Master Lock icon — far right. Toggles `is_locked` on the
                    template and auto-populates `is_human_edited` with every
                    field that currently has data (mirrors AdminArtistsTab). */}
                <button
                  title={isMasterLocked ? 'Unlock \u2014 allow scrapers / AI enrich to update' : 'Lock \u2014 protect this template from scraper overwrites'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const nowLocking = !isMasterLocked;
                      const newFieldLocks = nowLocking
                        ? {
                            ...(tpl.template_name ? { template_name: true } : {}),
                            ...(tpl.bio ? { bio: true } : {}),
                            ...(tpl.image_url ? { image_url: true } : {}),
                            ...(Array.isArray(tpl.genres) && tpl.genres.length ? { genres: true } : {}),
                            ...(Array.isArray(tpl.vibes) && tpl.vibes.length ? { vibes: true } : {}),
                            ...(Array.isArray(tpl.aliases) && tpl.aliases.length ? { aliases: true } : {}),
                            ...(tpl.category ? { category: true } : {}),
                          }
                        : {};
                      const res = await fetch('/api/admin/event-templates', {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ id: tpl.id, is_locked: nowLocking, is_human_edited: newFieldLocks }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || `HTTP ${res.status}`);
                      }
                      fetchTemplates(templatesSearch, templatesNeedsInfo);
                      toast({ type: 'success', message: nowLocking
                        ? `${tpl.template_name} locked \u2014 all fields protected`
                        : `${tpl.template_name} unlocked \u2014 all field locks cleared`
                      });
                    } catch (err) {
                      toast({ type: 'error', message: `Lock toggle failed: ${err.message}` });
                    }
                  }}
                  style={{
                    color: isMasterLocked ? '#22c55e' : 'rgba(136,136,136,0.6)',
                    cursor: 'pointer', background: 'none', border: 'none',
                    padding: '6px', flexShrink: 0, display: 'inline-flex', alignItems: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    {isMasterLocked
                      ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor" />
                      : <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" fill="currentColor" />
                    }
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Discover Recurring Events — candidate selection modal */}
      {seedModalOpen && (
        <div
          onClick={() => !seedSubmitting && setSeedModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
            padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '20px', maxWidth: '640px', width: '100%',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {'\uD83D\uDD0D'} Discover Recurring Events
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Titles appearing {seedMinFreq}+ times in the feed. Pick {'\uD83C\uDF10'} to cover every venue, or {'\uD83D\uDCCD'} to claim specific venues.
                </p>
              </div>
              <button
                onClick={() => !seedSubmitting && setSeedModalOpen(false)}
                disabled={seedSubmitting}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: seedSubmitting ? 'not-allowed' : 'pointer', fontSize: '18px' }}
              >{'\u2715'}</button>
            </div>

            {seedLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                Scanning events feed&hellip;
              </div>
            ) : seedGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: '28px', marginBottom: '8px' }}>{'\u2728'}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                  No new recurring events found
                </p>
                <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
                  Every frequent title is already represented as a template.
                </p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                {seedGroups.map(g => {
                  const nt = normTitle(g.title);
                  const mode = seedScopeMode.get(nt) || 'global';
                  const claimed = new Set(g.existing_scopes || []);
                  const globalClaimed = claimed.has('GLOBAL');
                  const isGlobal = mode === 'global';
                  const globalKey = `g:${nt}`;
                  const globalExpanded = seedExpanded.has(`group-global:${nt}`);
                  const globalChecked = seedSelected.has(globalKey);

                  return (
                    <div key={nt} style={{
                      borderRadius: '10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                    }}>
                      {/* Group header: title + count + snappy scope toggle */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px',
                        background: 'var(--bg-card)',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        <span style={{ flex: 1, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {g.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {g.total_count}{'\u00D7'} across {(g.splits || []).length} venue{(g.splits || []).length === 1 ? '' : 's'}
                        </span>
                        {/* Snappy scope toggle */}
                        <div style={{
                          display: 'inline-flex', padding: '2px', borderRadius: '999px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        }}>
                          <button
                            type="button"
                            onClick={() => setScopeMode(g.title, 'global')}
                            title="Create one Global template covering all venues"
                            style={{
                              padding: '4px 10px', borderRadius: '999px', border: 'none',
                              background: isGlobal ? '#E8722A' : 'transparent',
                              color: isGlobal ? '#1C1917' : 'var(--text-muted)',
                              fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                              cursor: 'pointer', transition: 'all 0.1s ease',
                            }}
                          >{'\uD83C\uDF10'} Global</button>
                          <button
                            type="button"
                            onClick={() => setScopeMode(g.title, 'local')}
                            title="Create a separate template per venue you check below"
                            style={{
                              padding: '4px 10px', borderRadius: '999px', border: 'none',
                              background: !isGlobal ? '#E8722A' : 'transparent',
                              color: !isGlobal ? '#1C1917' : 'var(--text-muted)',
                              fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                              cursor: 'pointer', transition: 'all 0.1s ease',
                            }}
                          >{'\uD83D\uDCCD'} Per-Venue</button>
                        </div>
                      </div>

                      {/* Group body — depends on mode */}
                      {isGlobal ? (
                        /* GLOBAL MODE — single row representing the rollup */
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '10px 12px',
                          // Informational (claimed) rows get a muted slate fill so the
                          // eye skips past them to the actionable tasks below. Actionable
                          // rows keep the orange "selected" tint only when checked.
                          background: globalClaimed
                            ? 'rgba(100,116,139,0.06)'
                            : (globalChecked ? 'rgba(232,114,42,0.08)' : 'transparent'),
                          borderLeft: globalClaimed ? '3px solid rgba(100,116,139,0.35)' : '3px solid transparent',
                          transition: 'all 0.1s ease',
                        }}>
                          {globalClaimed ? (
                            // Informational state — no input, just a linked-badge glyph.
                            // Flex-shrink:0 keeps the column aligned with the actionable
                            // checkbox above/below it.
                            <span
                              aria-hidden="true"
                              title="This event is already mapped to an existing template"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '16px', height: '16px', flexShrink: 0,
                                fontSize: '12px', color: '#22c55e', lineHeight: 1,
                              }}
                            >{'\u2705'}</span>
                          ) : (
                            <input
                              type="checkbox"
                              id={`seed-gchk-${nt}`}
                              checked={globalChecked}
                              onChange={() => toggleGlobalSelection(g.title)}
                              style={{ accentColor: '#E8722A', cursor: 'pointer' }}
                            />
                          )}
                          <label
                            htmlFor={globalClaimed ? undefined : `seed-gchk-${nt}`}
                            style={{
                              flex: 1, fontSize: '13px',
                              fontWeight: globalClaimed ? 500 : 600,
                              fontStyle: globalClaimed ? 'italic' : 'normal',
                              color: globalClaimed ? 'var(--text-muted)' : 'var(--text-primary)',
                              cursor: globalClaimed ? 'default' : 'pointer',
                            }}
                          >
                            {globalClaimed
                              ? <>Mapped to existing <strong style={{ fontStyle: 'normal' }}>{'\uD83C\uDF10'} Global</strong> template</>
                              : <>Create one <strong>{'\uD83C\uDF10'} Global</strong> template: <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>{g.title}</code></>
                            }
                          </label>
                          {(() => {
                            const occs = g.global_candidate?.occurrences || [];
                            const occTotal = occs.length;
                            const occLive = effectiveOccCount(occs);
                            const capped = g.total_count > occTotal;
                            return (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(`group-global:${nt}`)}
                                title={globalExpanded ? 'Hide sources' : `View source events${capped ? ` (showing ${occTotal} of ${g.total_count})` : ''}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  padding: '3px 8px', borderRadius: '999px',
                                  background: globalExpanded ? '#E8722A' : 'rgba(232,114,42,0.12)',
                                  color: globalExpanded ? '#1C1917' : '#E8722A',
                                  border: 'none', cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                                }}
                              >
                                <span>{`${occLive}\u00D7`}</span>
                                {capped && <span style={{ opacity: 0.6, fontWeight: 600 }}>{`/${g.total_count}`}</span>}
                                <span style={{ opacity: 0.75 }}>{globalExpanded ? '\u25B2' : '\u25BC'}</span>
                              </button>
                            );
                          })()}
                        </div>
                      ) : (
                        /* PER-VENUE MODE — one row per split */
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {(g.splits || []).map(s => {
                            if (!s.venue_id) return null; // Unscoped events can't be local templates.
                            const splitClaimed = claimed.has(s.venue_id);
                            const sKey = `v:${nt}|${s.venue_id}`;
                            const sChecked = seedSelected.has(sKey);
                            const sExpandKey = `split:${nt}|${s.venue_id}`;
                            const sExpanded = seedExpanded.has(sExpandKey);
                            const localName = buildLocalTemplateName(g.title, s.venue_name || '');
                            return (
                              <div key={s.venue_id} style={{
                                borderTop: '1px solid var(--border)',
                                // Claimed splits get the same informational slate wash
                                // as claimed globals, so the whole modal reads "skip me".
                                background: splitClaimed
                                  ? 'rgba(100,116,139,0.06)'
                                  : (sChecked ? 'rgba(232,114,42,0.08)' : 'transparent'),
                                borderLeft: splitClaimed ? '3px solid rgba(100,116,139,0.35)' : '3px solid transparent',
                                transition: 'all 0.1s ease',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px 8px 20px' }}>
                                  {splitClaimed ? (
                                    <span
                                      aria-hidden="true"
                                      title="This venue's events are already mapped to an existing local template"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: '16px', height: '16px', flexShrink: 0,
                                        fontSize: '12px', color: '#22c55e', lineHeight: 1,
                                      }}
                                    >{'\u2705'}</span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      id={`seed-vchk-${nt}-${s.venue_id}`}
                                      checked={sChecked}
                                      onChange={() => toggleVenueSelection(g.title, s.venue_id)}
                                      style={{ accentColor: '#E8722A', cursor: 'pointer' }}
                                    />
                                  )}
                                  <label
                                    htmlFor={splitClaimed ? undefined : `seed-vchk-${nt}-${s.venue_id}`}
                                    style={{
                                      flex: 1, fontSize: '13px',
                                      fontWeight: splitClaimed ? 500 : 600,
                                      fontStyle: splitClaimed ? 'italic' : 'normal',
                                      color: splitClaimed ? 'var(--text-muted)' : 'var(--text-primary)',
                                      cursor: splitClaimed ? 'default' : 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                                    }}
                                  >
                                    <span style={{
                                      fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                      // Muted venue chip when informational, orange when actionable.
                                      background: splitClaimed ? 'rgba(100,116,139,0.12)' : 'rgba(232,114,42,0.1)',
                                      color: splitClaimed ? '#64748b' : '#E8722A',
                                      fontWeight: 700, fontStyle: 'normal',
                                    }}>
                                      {'\uD83D\uDCCD'} {s.venue_name || '(no venue)'}
                                    </span>
                                    {splitClaimed
                                      ? <span>Mapped to existing <strong style={{ fontStyle: 'normal' }}>{'\uD83D\uDCCD'} Local</strong> template</span>
                                      : <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>{localName}</code>
                                    }
                                  </label>
                                  {(() => {
                                    // Split-level live count: how many occurrences are still checked.
                                    // `s.count` is the true total in the feed, `s.occurrences.length`
                                    // is what we got back (may be capped). The badge shows the live
                                    // "will be linked" number — matches the user's 4→3 expectation.
                                    const occTotal = (s.occurrences || []).length;
                                    const occLive = effectiveOccCount(s.occurrences);
                                    const capped = s.count > occTotal;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpanded(sExpandKey)}
                                        title={sExpanded ? 'Hide sources' : `View source events at this venue${capped ? ` (showing ${occTotal} of ${s.count})` : ''}`}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          padding: '3px 8px', borderRadius: '999px',
                                          background: sExpanded ? '#E8722A' : 'rgba(232,114,42,0.12)',
                                          color: sExpanded ? '#1C1917' : '#E8722A',
                                          border: 'none', cursor: 'pointer',
                                          fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: 700,
                                        }}
                                      >
                                        <span>{`${occLive}\u00D7`}</span>
                                        {capped && <span style={{ opacity: 0.6, fontWeight: 600 }}>{`/${s.count}`}</span>}
                                        <span style={{ opacity: 0.75 }}>{sExpanded ? '\u25B2' : '\u25BC'}</span>
                                      </button>
                                    );
                                  })()}
                                </div>

                                {sExpanded && (
                                  <div style={{
                                    borderTop: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    padding: '8px 12px 10px 48px',
                                  }}>
                                    {(s.occurrences || []).length === 0 ? (
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No source events returned.
                                      </div>
                                    ) : (
                                      <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '22px 92px 62px minmax(0, 1fr)',
                                        gap: '4px 12px',
                                        fontSize: '11px', fontFamily: "'DM Sans', sans-serif",
                                        alignItems: 'center',
                                      }}>
                                        <div />
                                        <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
                                        <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</div>
                                        <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Snippet</div>
                                        {s.occurrences.map(o => {
                                          const checked = !seedOccExcluded.has(o.id);
                                          const dim = checked ? 1 : 0.45;
                                          return (
                                            <Fragment key={o.id}>
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleOccurrence(o.id)}
                                                title={checked ? 'Uncheck to exclude this event' : 'Re-include this event'}
                                                style={{ accentColor: '#E8722A', cursor: 'pointer', margin: 0 }}
                                              />
                                              <div style={{ color: 'var(--text-secondary)', opacity: dim, textDecoration: checked ? 'none' : 'line-through' }}>{formatOccDate(o.event_date)}</div>
                                              <div style={{ color: 'var(--text-secondary)', opacity: dim, textDecoration: checked ? 'none' : 'line-through' }}>{formatOccTime(o)}</div>
                                              <div style={{ color: 'var(--text-primary)', opacity: dim, textDecoration: checked ? 'none' : 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {o.snippet || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(no description)</span>}
                                              </div>
                                            </Fragment>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {s.count > (s.occurrences || []).length && (
                                      <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        Showing {(s.occurrences || []).length} most recent of {s.count} total. Unshown occurrences stay unlinked.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {(g.splits || []).every(s => !s.venue_id) && (
                            <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              No venue-scoped occurrences for this title \u2014 use {'\uD83C\uDF10'} Global instead.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Global rollup sources — only when globalExpanded */}
                      {isGlobal && globalExpanded && (
                        <div style={{
                          borderTop: '1px solid var(--border)',
                          background: 'var(--bg-card)',
                          padding: '8px 12px 10px 40px',
                        }}>
                          {(g.global_candidate?.occurrences || []).length === 0 ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              No source events returned.
                            </div>
                          ) : (
                            <>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '22px 92px 62px minmax(0, 1fr) minmax(0, 1.4fr)',
                                gap: '4px 12px',
                                fontSize: '11px', fontFamily: "'DM Sans', sans-serif",
                                alignItems: 'center',
                              }}>
                                <div />
                                <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
                                <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</div>
                                <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Venue</div>
                                <div style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Snippet</div>
                                {g.global_candidate.occurrences.map(o => {
                                  const checked = !seedOccExcluded.has(o.id);
                                  const dim = checked ? 1 : 0.45;
                                  const strike = checked ? 'none' : 'line-through';
                                  return (
                                    <Fragment key={o.id}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleOccurrence(o.id)}
                                        title={checked ? 'Uncheck to exclude this event' : 'Re-include this event'}
                                        style={{ accentColor: '#E8722A', cursor: 'pointer', margin: 0 }}
                                      />
                                      <div style={{ color: 'var(--text-secondary)', opacity: dim, textDecoration: strike }}>{formatOccDate(o.event_date)}</div>
                                      <div style={{ color: 'var(--text-secondary)', opacity: dim, textDecoration: strike }}>{formatOccTime(o)}</div>
                                      <div style={{ color: 'var(--text-primary)', opacity: dim, textDecoration: strike, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {o.venue_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(no venue)</span>}
                                      </div>
                                      <div style={{ color: 'var(--text-primary)', opacity: dim, textDecoration: strike, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {o.snippet || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>(no description)</span>}
                                      </div>
                                    </Fragment>
                                  );
                                })}
                              </div>
                              {g.total_count > g.global_candidate.occurrences.length && (
                                <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                  Showing {g.global_candidate.occurrences.length} most recent of {g.total_count} total. Unshown occurrences stay unlinked.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {seedSelectionCount} template{seedSelectionCount === 1 ? '' : 's'} will be created
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSeedModalOpen(false)}
                  disabled={seedSubmitting}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    cursor: seedSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >Cancel</button>
                <button
                  onClick={convertSelectedToTemplates}
                  disabled={seedSubmitting || seedSelectionCount === 0 || seedGroups.length === 0}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                    background: (seedSubmitting || seedSelectionCount === 0) ? 'rgba(232,114,42,0.3)' : '#E8722A',
                    color: '#1C1917', border: 'none',
                    cursor: (seedSubmitting || seedSelectionCount === 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {seedSubmitting
                    ? `\u23F3 Creating ${seedSelectionCount}\u2026`
                    : `Convert ${seedSelectionCount} to Template${seedSelectionCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm — inline modal */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '90%',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Delete template?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              This will permanently delete <strong>{deleteConfirm.template_name}</strong>. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={() => deleteTemplate(deleteConfirm.id)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
