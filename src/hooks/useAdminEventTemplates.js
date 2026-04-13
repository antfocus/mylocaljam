'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export default function useAdminEventTemplates({ password }) {
  const [templates, setTemplates] = useState([]);
  const [templatesSearch, setTemplatesSearch] = useState('');
  const [templatesNeedsInfo, setTemplatesNeedsInfo] = useState(false);
  const [templateMissingFilters, setTemplateMissingFilters] = useState({ bio: false, image_url: false, genres: false, vibes: false });
  const [templatesSortBy, setTemplatesSortBy] = useState('name');
  const [templateSourceFilter, setTemplateSourceFilter] = useState('all');
  const [templateSubTab, setTemplateSubTab] = useState('directory');
  const [directorySort, setDirectorySort] = useState({ col: 'date_added', dir: 'desc' });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ template_name: '', aliases: '', category: 'Live Music', venue_id: '', bio: '', genres: '', vibes: '', image_url: '' });
  const [templateActionLoading, setTemplateActionLoading] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [templateToast, setTemplateToast] = useState(null);
  const [selectedTemplates, setSelectedTemplates] = useState(new Set());
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [templateEvents, setTemplateEvents] = useState([]);
  const [enrichConfirm, setEnrichConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(null);
  const [mergeMasterId, setMergeMasterId] = useState(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [duplicateNameWarning, setDuplicateNameWarning] = useState(null);
  const dupCheckTimer = useRef(null);

  useEffect(() => {
    if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current);
    setDuplicateNameWarning(null);

    if (!editingTemplate || !templateForm.template_name) return;
    const trimmed = templateForm.template_name.trim();
    if (trimmed === editingTemplate.template_name) return;
    if (trimmed.length < 2) return;

    dupCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/event-templates?search=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${password}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          const exact = data.find(t => t.template_name.toLowerCase() === trimmed.toLowerCase() && t.id !== editingTemplate.id);
          if (exact) {
            setDuplicateNameWarning(exact.template_name);
          }
        }
      } catch { /* ignore check failures */ }
    }, 500);

    return () => { if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current); };
  }, [templateForm.template_name, editingTemplate, password]);

  const [regeneratingField, setRegeneratingField] = useState(null);
  const [imageCandidates, setImageCandidates] = useState([]);
  const [imageCarouselIdx, setImageCarouselIdx] = useState(0);
  const editPanelRef = useCallback(node => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingTemplate]);

  useEffect(() => {
    if (!editingTemplate) return;
    const fresh = templates.find(t => t.id === editingTemplate.id);
    if (!fresh) return;
    const freshLocks = fresh.is_human_edited || {};
    const currentLocks = editingTemplate.is_human_edited || {};
    const freshIsLocked = !!fresh.is_locked;
    const currentIsLocked = !!editingTemplate.is_locked;
    if (JSON.stringify(freshLocks) !== JSON.stringify(currentLocks) || freshIsLocked !== currentIsLocked) {
      setEditingTemplate(prev => prev ? ({ ...prev, is_human_edited: freshLocks, is_locked: fresh.is_locked }) : prev);
    }
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = useCallback(async (search = '', needsInfo = false) => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (needsInfo) params.set('needsInfo', 'true');
      const res = await fetch(`/api/admin/event-templates?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
        setSelectedTemplates(new Set());
      }
    } catch (err) { console.error('Failed to fetch event templates:', err); }
  }, [password]);

  const runBulkEnrich = async (overrideList) => {
    const toEnrich = overrideList || templates.filter(t => selectedTemplates.has(t.id));
    if (toEnrich.length === 0) return;
    setBulkEnrichProgress({ done: 0, total: toEnrich.length });
    let done = 0;

    for (const template of toEnrich) {
      try {
        if (template.is_locked) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }

        const res = await fetch('/api/admin/event-templates/ai-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ templateName: template.template_name }),
        });
        if (!res.ok) { done++; setBulkEnrichProgress({ done, total: toEnrich.length }); continue; }
        const ai = await res.json();

        const update = { id: template.id };
        const prevStatus = template.field_status || {};
        const newStatus = { ...prevStatus };

        if (ai.bio && !template.bio) { update.bio = ai.bio; newStatus.bio = 'pending'; }
        // NOTE: AI no longer returns genres for templates — existing manual genres are preserved.
        if (ai.category && !template.category) { update.category = ai.category; newStatus.category = 'pending'; }
        if (ai.vibes?.length && (!template.vibes || template.vibes.length === 0)) { update.vibes = ai.vibes; newStatus.vibes = 'pending'; }
        if (ai.image_url && !template.image_url) { update.image_url = ai.image_url; newStatus.image_url = 'pending'; }

        if (Object.keys(update).length > 1) {
          update.field_status = newStatus;
          update.bio_source = ai.bio_source || template.bio_source || 'Perplexity';
          update.image_source = ai.image_source || template.image_source || 'Serper';
          await fetch('/api/admin/event-templates', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
            body: JSON.stringify(update),
          });
        }
      } catch (err) {
        console.error(`Enrichment failed for ${template.template_name}:`, err);
      }
      done++;
      setBulkEnrichProgress({ done, total: toEnrich.length });
      await new Promise(r => setTimeout(r, 300));
    }

    setBulkEnrichProgress(null);
    setSelectedTemplates(new Set());
    fetchTemplates(templatesSearch, templatesNeedsInfo);
    setTemplateToast({ type: 'success', message: `AI enrichment complete: ${done} templates processed` });
    setTimeout(() => setTemplateToast(null), 4000);
  };

  const regenerateField = async (field) => {
    if (!editingTemplate) return;
    setRegeneratingField(field);
    setTemplateToast(null);
    try {
      const res = await fetch('/api/admin/event-templates/ai-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ templateName: editingTemplate.template_name }),
      });
      if (!res.ok) throw new Error('AI lookup failed');
      const ai = await res.json();

      if (field === 'bio' && ai.bio) {
        setTemplateForm(p => ({ ...p, bio: ai.bio }));
        setTemplateToast({ type: 'success', message: 'Bio regenerated — review & save' });
      } else if (field === 'image_url' && ai.image_candidates?.length > 0) {
        setImageCandidates(ai.image_candidates);
        setImageCarouselIdx(0);
        setTemplateForm(p => ({ ...p, image_url: ai.image_candidates[0] }));
        const note = ai.image_source === 'placeholder' ? ' (placeholders)' : ` (${ai.image_candidates.length} options)`;
        setTemplateToast({ type: 'success', message: `Images refreshed${note} — use arrows to browse` });
      } else if (field === 'category' && ai.category) {
        setTemplateForm(p => ({ ...p, category: ai.category }));
        setTemplateToast({ type: 'success', message: 'Category regenerated — review & save' });
      } else if (field === 'vibes' && ai.vibes?.length) {
        setTemplateForm(p => ({ ...p, vibes: ai.vibes.join(', ') }));
        setTemplateToast({ type: 'success', message: 'Vibes regenerated — review & save' });
      } else {
        setTemplateToast({ type: 'error', message: `AI couldn't generate a new ${field}` });
      }
      setTimeout(() => setTemplateToast(null), 4000);
    } catch (err) {
      console.error('Regenerate error:', err);
      setTemplateToast({ type: 'error', message: 'Regeneration failed' });
      setTimeout(() => setTemplateToast(null), 4000);
    }
    setRegeneratingField(null);
  };

  return {
    templates, setTemplates,
    templatesSearch, setTemplatesSearch,
    templatesNeedsInfo, setTemplatesNeedsInfo,
    templateMissingFilters, setTemplateMissingFilters,
    templatesSortBy, setTemplatesSortBy,
    templateSourceFilter, setTemplateSourceFilter,
    templateSubTab, setTemplateSubTab,
    directorySort, setDirectorySort,
    editingTemplate, setEditingTemplate,
    templateForm, setTemplateForm,
    templateActionLoading, setTemplateActionLoading,
    aiLoading, setAiLoading,
    templateToast, setTemplateToast,
    selectedTemplates, setSelectedTemplates,
    bulkEnrichProgress, setBulkEnrichProgress,
    deleteConfirm, setDeleteConfirm,
    templateEvents, setTemplateEvents,
    enrichConfirm, setEnrichConfirm,
    bulkDeleteConfirm, setBulkDeleteConfirm,
    bulkDeleteLoading, setBulkDeleteLoading,
    mergeConfirm, setMergeConfirm,
    mergeMasterId, setMergeMasterId,
    mergeLoading, setMergeLoading,
    duplicateNameWarning, setDuplicateNameWarning,
    regeneratingField, setRegeneratingField,
    imageCandidates, setImageCandidates,
    imageCarouselIdx, setImageCarouselIdx,
    editPanelRef,
    fetchTemplates,
    runBulkEnrich,
    regenerateField,
  };
}
