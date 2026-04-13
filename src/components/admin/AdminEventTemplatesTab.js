'use client';

import Badge from '@/components/ui/Badge';
import { MetadataField, StyleMoodSelector, ImagePreviewSection, GENRES, VIBES } from '@/components/admin/shared';

const NEW_TEMPLATE_FORM = { template_name: '', aliases: '', category: 'Live Music', venue_id: '', bio: '', genres: '', vibes: '', image_url: '' };

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
  fetchTemplates,
  showQueueToast,
}) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + password };

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
      field_status: newFS,
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
  const lockBadge = (
    <Badge
      label={isTemplateLocked ? 'LOCKED' : 'OPEN'}
      size="xs"
      color={isTemplateLocked ? '#22c55e' : 'rgba(136,136,136,0.45)'}
      bg={isTemplateLocked ? 'rgba(34,197,94,0.1)' : 'rgba(136,136,136,0.06)'}
      style={{ border: isTemplateLocked ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(136,136,136,0.12)', fontSize: '9px', fontWeight: 600, gap: '2px' }}
    >{isTemplateLocked ? 'LOCKED' : 'OPEN'}</Badge>
  );

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
            <button
              onClick={closeEditor}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
            >{'\u2715'}</button>
          </div>

          {/* Template Name */}
          <MetadataField label="Template Name" hasArtist={false} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>{lockBadge}</div>
            <input
              type="text"
              value={templateForm.template_name}
              onChange={e => !isTemplateLocked && setTemplateForm(p => ({ ...p, template_name: e.target.value }))}
              readOnly={isTemplateLocked}
              placeholder="e.g. Sunday Bluegrass Brunch"
              style={{ ...(isTemplateLocked ? lockedInputStyle : inputStyle), fontWeight: 700, fontSize: '15px' }}
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
                <input
                  type="text"
                  value={templateForm.category}
                  onChange={e => setTemplateForm(p => ({ ...p, category: e.target.value }))}
                  placeholder="Live Music"
                  style={inputStyle}
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

              {/* Aliases */}
              <MetadataField label="Aliases (comma-separated)" hasArtist={false}>
                <input
                  type="text"
                  value={templateForm.aliases}
                  onChange={e => setTemplateForm(p => ({ ...p, aliases: e.target.value }))}
                  placeholder="Bluegrass Brunch, Sunday Brunch"
                  style={inputStyle}
                />
              </MetadataField>

              {/* Bio */}
              <MetadataField label="Bio" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>{lockBadge}</div>
                <textarea
                  value={templateForm.bio}
                  onChange={e => !isTemplateLocked && setTemplateForm(p => ({ ...p, bio: e.target.value }))}
                  readOnly={isTemplateLocked}
                  rows={4}
                  style={{ ...(isTemplateLocked ? lockedInputStyle : inputStyle), resize: isTemplateLocked ? 'none' : 'vertical' }}
                />
              </MetadataField>

              {/* Vibes */}
              <MetadataField label="Vibes" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>{lockBadge}</div>
                <StyleMoodSelector
                  label=""
                  options={VIBES}
                  selected={templateForm.vibes}
                  onChange={next => setTemplateForm(p => ({ ...p, vibes: next }))}
                  disabled={isTemplateLocked}
                />
              </MetadataField>
            </div>

            <div>
              {/* Genres */}
              <MetadataField label="Genres" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>{lockBadge}</div>
                <StyleMoodSelector
                  label=""
                  options={GENRES}
                  selected={templateForm.genres}
                  onChange={next => setTemplateForm(p => ({ ...p, genres: next }))}
                  disabled={isTemplateLocked}
                />
              </MetadataField>

              {/* Image */}
              <MetadataField label="Template Image" hasArtist={false}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>{lockBadge}</div>
                <ImagePreviewSection
                  imageUrl={templateForm.image_url}
                  isInherited={false}
                  onUrlChange={url => !isTemplateLocked && setTemplateForm(p => ({ ...p, image_url: url }))}
                  disabled={isTemplateLocked}
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
            return (
              <div
                key={tpl.id}
                onClick={() => openEditTemplate(tpl)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '10px 16px', borderRadius: '10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  cursor: 'pointer', transition: 'all 0.1s ease',
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
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {tpl.template_name}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: "'DM Sans', sans-serif" }}>
                    {venueName} {'\u00B7'} {tpl.category || 'Live Music'}
                  </div>
                </div>
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {!tpl.bio && <Badge label="no bio" size="xs" color="#ef4444" bg="rgba(239,68,68,0.08)" />}
                    {!tpl.image_url && <Badge label="no image" size="xs" color="#ef4444" bg="rgba(239,68,68,0.08)" />}
                    {tpl.is_locked && <Badge label="locked" size="xs" color="#22c55e" bg="rgba(34,197,94,0.1)" />}
                  </div>
                )}
              </div>
            );
          })}
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
