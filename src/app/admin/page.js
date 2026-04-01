'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import EventFormModal from '@/components/EventFormModal';
import AdminDashboardTab from '@/components/admin/AdminDashboardTab';
import AdminTriageTab from '@/components/admin/AdminTriageTab';
import AdminEventsTab from '@/components/admin/AdminEventsTab';
import AdminArtistsTab from '@/components/admin/AdminArtistsTab';
import AdminSpotlightTab from '@/components/admin/AdminSpotlightTab';
import AdminVenuesTab from '@/components/admin/AdminVenuesTab';
import AdminFestivalsTab from '@/components/admin/AdminFestivalsTab';
import AdminSubmissionsTab from '@/components/admin/AdminSubmissionsTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminArtistModals from '@/components/admin/AdminArtistModals';
import AdminLoginScreen from '@/components/admin/AdminLoginScreen';
import ModalWrapper from '@/components/ui/ModalWrapper';
import useAdminQueue from '@/hooks/useAdminQueue';
import useAdminTriage from '@/hooks/useAdminTriage';
import useAdminArtists from '@/hooks/useAdminArtists';
import useAdminSpotlight from '@/hooks/useAdminSpotlight';
import useAdminEvents from '@/hooks/useAdminEvents';
import useAdminVenues from '@/hooks/useAdminVenues';
import useAdminFestivals from '@/hooks/useAdminFestivals';
import useAdminReports from '@/hooks/useAdminReports';

const TITLE_CASE_MINOR = new Set(['a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','by','of','up','as','is']);
function toTitleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0 || !TITLE_CASE_MINOR.has(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [returnToTab, setReturnToTab] = useState(null); // remembers which tab to return to after artist edit
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashDateRange, setDashDateRange] = useState('7d'); // 'today' | '7d' | '30d' | 'all'
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsEnv, setAnalyticsEnv] = useState('production'); // 'production' | 'dev'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileQueueDetail, setMobileQueueDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Session persistence: restore auth from sessionStorage on mount ──
  const sessionRestored = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('mlj_admin_pw');
      if (saved) {
        setPassword(saved);
        setAuthenticated(true);
        sessionRestored.current = true;
      }
    } catch { /* SSR or sessionStorage blocked */ }
  }, []);

  const [loading, setLoading] = useState(false);
  const [queueToast, setQueueToast] = useState(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const toastTimerRef = useRef(null);
  const showQueueToast = (msgOrObj, undoFn = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const toast = typeof msgOrObj === 'string' ? { msg: msgOrObj, undoFn } : { ...msgOrObj, undoFn };
    setQueueToast(toast);
    const duration = toast.type === 'error' ? 8000 : toast.type === 'success' ? 4000 : (undoFn ? 5000 : 3000);
    toastTimerRef.current = setTimeout(() => { setQueueToast(null); toastTimerRef.current = null; }, duration);
  };

  const fetchAnalytics = useCallback(async (range, env) => {
    setAnalyticsLoading(true);
    try {
      const r = range || dashDateRange;
      const e = env || analyticsEnv;
      const res = await fetch(`/api/admin/analytics?password=${encodeURIComponent(password)}&range=${r}&env=${e}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [password, dashDateRange, analyticsEnv]);

  const re = useAdminReports({ password });

  const ev = useAdminEvents({ password, showQueueToast, setAuthenticated });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [, subRes, repRes] = await Promise.all([
        ev.fetchEvents(),
        fetch('/api/submissions', { headers: { Authorization: `Bearer ${password}` } }),
        fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } }),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        if (Array.isArray(subData)) re.setSubmissions(subData);
      }
      if (repRes.ok) {
        const repData = await repRes.json();
        if (Array.isArray(repData)) re.setReports(repData);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [password, ev.fetchEvents]);

  const ve = useAdminVenues({ password, showQueueToast });
  const q = useAdminQueue({ password, venues: ve.venues, setVenues: ve.setVenues, fetchAll, supabase, toTitleCase, showQueueToast, authenticated });
  const tr = useAdminTriage({ password, showQueueToast });
  const ar = useAdminArtists({ password });
  const sp = useAdminSpotlight({ password, fetchAll });
  const fe = useAdminFestivals();

  // ── Auto-fetch when session is restored from sessionStorage ──
  useEffect(() => {
    if (authenticated && sessionRestored.current) {
      sessionRestored.current = false; // only fire once
      fetchAll();
      q.fetchQueue();
      tr.fetchTriage();
      ar.fetchArtists();
      ve.fetchScraperHealth();
      ve.fetchVenues();
      fe.fetchFestivalNames();
    }
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e) => {
    e.preventDefault();
    // Validate password with a lightweight API call before setting authenticated
    try {
      const testRes = await fetch('/api/admin?page=1&limit=1', {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (testRes.status === 401) {
        alert('Invalid password');
        return;
      }
      if (!testRes.ok) {
        alert(`Login failed (HTTP ${testRes.status})`);
        return;
      }
    } catch (err) {
      alert(`Login failed: ${err.message}`);
      return;
    }
    setAuthenticated(true);
    try { sessionStorage.setItem('mlj_admin_pw', password); } catch { /* blocked */ }
    fetchAll();
    q.fetchQueue();
    tr.fetchTriage();
    ar.fetchArtists();
    ve.fetchScraperHealth();
    fetchAnalytics(); // PostHog analytics for dashboard
    ve.fetchVenues(); // populate venue datalist for queue triage
    fe.fetchFestivalNames(); // populate festival name autocomplete
  };

  const deleteEvent = async (id) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    await fetch(`/api/admin?id=${id}`, { method: 'DELETE', headers });
    fetchAll();
  };

  const saveEvent = async (formData) => {
    const method = ev.editingEvent ? 'PUT' : 'POST';
    const body = ev.editingEvent ? { ...formData, id: ev.editingEvent.id } : formData;

    await fetch('/api/admin', {
      method,
      headers,
      body: JSON.stringify(body),
    });

    ev.setShowEventForm(false);
    ev.setEditingEvent(null);
    fetchAll();
  };


  const unpublishEvent = async (evt) => {
    const prev = ev.events;
    ev.setEvents(p => p.map(e => e.id === evt.id ? { ...e, status: 'archived', is_featured: false } : e));
    try {
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: evt.id, status: 'archived', is_featured: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showQueueToast(`📴 Unpublished: ${evt.artist_name}`);
    } catch (err) {
      console.error('Unpublish failed:', err);
      ev.setEvents(prev);
      alert(`Unpublish failed: ${err.message}`);
    }
  };


  if (!authenticated) {
    return <AdminLoginScreen password={password} setPassword={setPassword} showPassword={showPassword} setShowPassword={setShowPassword} handleLogin={handleLogin} />;
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12" style={{ background: 'var(--bg-primary)', minHeight: '100vh', padding: isMobile ? '0 12px' : '0 16px' }}>
      {/* Header */}
      <header className="flex items-center justify-between py-5 border-b border-white/[0.06] mb-6" style={{ paddingTop: isMobile ? '12px' : '20px', paddingBottom: isMobile ? '12px' : '20px' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white" style={{ background: 'var(--accent)', width: isMobile ? '32px' : '40px', height: isMobile ? '32px' : '40px' }}>
            {Icons.settings}
          </div>
          <div className="font-display font-extrabold" style={{ fontSize: isMobile ? '16px' : '20px' }}>
            my<span style={{ color: 'var(--accent)' }}>Local</span>Jam {!isMobile && '— Admin'}
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center gap-3">
            <a href="/" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {Icons.eye} View Site
            </a>
            <button onClick={fetchAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              ↻ Refresh
            </button>
          </div>
        )}
      </header>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="admin-tabs flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {[
          { key: 'dashboard', label: 'Dashboard', count: 0 },
          { key: 'triage', label: 'Triage', count: tr.triageEvents.length },
          { key: 'events', label: 'Event Feed', count: ev.eventsTotal || ev.events.length },
          { key: 'artists', label: 'Artists', count: ar.artists.length },
          { key: 'spotlight', label: 'Spotlight', count: sp.spotlightPins.length },
          { key: 'venues', label: 'Venues', count: ve.scraperHealth.filter(s => s.status === 'fail').length },
          { key: 'festivals', label: 'Festivals', count: fe.festivalData.length },
          { key: 'submissions', label: 'Submissions', count: q.queue.length },
          { key: 'reports', label: 'User Flags', count: re.reports.filter((r) => r.status === 'pending').length },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`py-2.5 rounded-lg font-display font-semibold text-sm transition-all ${
              activeTab === tab.key ? 'text-white' : 'text-brand-text-muted'
            }`}
            style={{
              whiteSpace: 'nowrap', flexShrink: 0, padding: '10px 14px',
              ...(activeTab === tab.key
                ? { background: 'var(--bg-card)', borderBottom: '2px solid #E8722A', color: '#FFFFFF' }
                : { opacity: 0.6 }),
            }}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'dashboard') { ev.fetchEvents(); if (ar.artists.length === 0) ar.fetchArtists(); re.fetchReports(); ve.fetchScraperHealth(); } if (tab.key === 'events') ev.fetchEvents(); if (tab.key === 'triage') tr.fetchTriage(); if (tab.key === 'spotlight') { sp.setSpotlightSearch(''); sp.fetchSpotlight(sp.spotlightDate); if (ar.artists.length === 0) ar.fetchArtists(); } if (tab.key === 'submissions') { setMobileQueueDetail(false); q.fetchQueue(); } if (tab.key === 'artists') ar.fetchArtists(ar.artistsSearch, ar.artistsNeedsInfo); if (tab.key === 'venues') ve.fetchScraperHealth(); if (tab.key === 'reports') { re.setFlagsViewFilter('pending'); re.fetchReports(); } if (tab.key === 'festivals') fe.fetchFestivalNames(); }}
          >
            {tab.label} {tab.count > 0 && <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: tab.key !== 'events' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab.key !== 'events' ? '#1C1917' : 'var(--text-secondary)' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Scrollbar-hide for mobile tabs */}
      <style>{`.admin-tabs::-webkit-scrollbar { display: none; }`}</style>

      {loading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading...</div>}

      {/* ── Dashboard Tab — Platform Analytics ───────────────────────────── */}
      {activeTab === 'dashboard' && !loading && (
        <AdminDashboardTab
          events={ev.events} artists={ar.artists} reports={re.reports} venues={ve.venues}
          scraperHealth={ve.scraperHealth}
          eventsTotal={ev.eventsTotal} newEvents24h={ev.newEvents24h}
          dashDateRange={dashDateRange} setDashDateRange={setDashDateRange}
          analyticsData={analyticsData} analyticsLoading={analyticsLoading}
          analyticsEnv={analyticsEnv} setAnalyticsEnv={setAnalyticsEnv}
          fetchAnalytics={fetchAnalytics} fetchEvents={ev.fetchEvents}
          fetchArtists={ar.fetchArtists} fetchScraperHealth={ve.fetchScraperHealth}
          fetchReports={re.fetchReports}
          eventsSortField={ev.eventsSortField} eventsSortOrder={ev.eventsSortOrder}
          eventsStatusFilter={ev.eventsStatusFilter} setEventsStatusFilter={ev.setEventsStatusFilter} setActiveTab={setActiveTab}
          setVenuesFilter={ve.setVenuesFilter} setEventsRecentlyAdded={ev.setEventsRecentlyAdded}
          setEvents={ev.setEvents} setFlagsViewFilter={re.setFlagsViewFilter}
          setEventsMissingTime={ev.setEventsMissingTime} setArtistMissingFilters={ar.setArtistMissingFilters}
        />
      )}

      {/* ── Triage Tab ── */}
      {activeTab === 'triage' && (
        <AdminTriageTab
          events={ev.events} venues={ve.venues}
          triageEvents={tr.triageEvents} triageLoading={tr.triageLoading}
          triageActionId={tr.triageActionId}
          triageCategorize={tr.triageCategorize} triageDelete={tr.triageDelete}
          fetchTriage={tr.fetchTriage}
          setEditingEvent={ev.setEditingEvent} setShowEventForm={ev.setShowEventForm}
        />
      )}

      {/* Events Tab */}
      {activeTab === 'events' && !loading && (
        <AdminEventsTab
          events={ev.events} artists={ar.artists} venues={ve.venues} password={password}
          isMobile={isMobile}
          eventsSearch={ev.eventsSearch} setEventsSearch={ev.setEventsSearch}
          eventsStatusFilter={ev.eventsStatusFilter} setEventsStatusFilter={ev.setEventsStatusFilter}
          eventsMissingTime={ev.eventsMissingTime} setEventsMissingTime={ev.setEventsMissingTime}
          eventsSortField={ev.eventsSortField} setEventsSortField={ev.setEventsSortField}
          eventsSortOrder={ev.eventsSortOrder} setEventsSortOrder={ev.setEventsSortOrder}
          eventsPage={ev.eventsPage} setEventsPage={ev.setEventsPage}
          eventsTotalPages={ev.eventsTotalPages} eventsTotal={ev.eventsTotal}
          newEvents24h={ev.newEvents24h} eventsRecentlyAdded={ev.eventsRecentlyAdded}
          setEventsRecentlyAdded={ev.setEventsRecentlyAdded}
          selectedEvents={ev.selectedEvents} setSelectedEvents={ev.setSelectedEvents}
          setEvents={ev.setEvents}
          fetchEvents={ev.fetchEvents} deleteEvent={deleteEvent}
          toggleFeatured={ev.toggleFeatured} unpublishEvent={unpublishEvent}
          updateEventCategory={ev.updateEventCategory}
          CATEGORY_OPTIONS={ev.CATEGORY_OPTIONS}
          setEditingEvent={ev.setEditingEvent} setShowEventForm={ev.setShowEventForm}
          setBulkTimeModal={ev.setBulkTimeModal} setBulkTime={ev.setBulkTime}
          showQueueToast={showQueueToast}
        />
      )}

      {/* Artists Tab */}
      {activeTab === 'artists' && !loading && (
        <AdminArtistsTab
          artists={ar.artists} events={ev.events} venues={ve.venues} password={password} isMobile={isMobile}
          artistsSearch={ar.artistsSearch} setArtistsSearch={ar.setArtistsSearch}
          artistsNeedsInfo={ar.artistsNeedsInfo} setArtistsNeedsInfo={ar.setArtistsNeedsInfo}
          artistMissingFilters={ar.artistMissingFilters} setArtistMissingFilters={ar.setArtistMissingFilters}
          artistsSortBy={ar.artistsSortBy} setArtistsSortBy={ar.setArtistsSortBy}
          artistSourceFilter={ar.artistSourceFilter} setArtistSourceFilter={ar.setArtistSourceFilter}
          artistSubTab={ar.artistSubTab} setArtistSubTab={ar.setArtistSubTab}
          directorySort={ar.directorySort} setDirectorySort={ar.setDirectorySort}
          editingArtist={ar.editingArtist} setEditingArtist={ar.setEditingArtist}
          artistForm={ar.artistForm} setArtistForm={ar.setArtistForm}
          artistActionLoading={ar.artistActionLoading} setArtistActionLoading={ar.setArtistActionLoading}
          aiLoading={ar.aiLoading} setAiLoading={ar.setAiLoading}
          artistToast={ar.artistToast} setArtistToast={ar.setArtistToast}
          artistEvents={ar.artistEvents} setArtistEvents={ar.setArtistEvents}
          duplicateNameWarning={ar.duplicateNameWarning} setDuplicateNameWarning={ar.setDuplicateNameWarning}
          regeneratingField={ar.regeneratingField} setRegeneratingField={ar.setRegeneratingField}
          imageCandidates={ar.imageCandidates} setImageCandidates={ar.setImageCandidates}
          imageCarouselIdx={ar.imageCarouselIdx} setImageCarouselIdx={ar.setImageCarouselIdx}
          editPanelRef={ar.editPanelRef}
          selectedArtists={ar.selectedArtists} setSelectedArtists={ar.setSelectedArtists}
          bulkEnrichProgress={ar.bulkEnrichProgress}
          deleteConfirm={ar.deleteConfirm} setDeleteConfirm={ar.setDeleteConfirm}
          enrichConfirm={ar.enrichConfirm} setEnrichConfirm={ar.setEnrichConfirm}
          bulkDeleteConfirm={ar.bulkDeleteConfirm} setBulkDeleteConfirm={ar.setBulkDeleteConfirm}
          mergeConfirm={ar.mergeConfirm} setMergeConfirm={ar.setMergeConfirm}
          mergeMasterId={ar.mergeMasterId} setMergeMasterId={ar.setMergeMasterId}
          fetchArtists={ar.fetchArtists} runBulkEnrich={ar.runBulkEnrich}
          regenerateField={ar.regenerateField} showQueueToast={showQueueToast}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab} returnToTab={returnToTab}
          GENRES={GENRES} VIBES={VIBES}
        />
      )}

      {/* Spotlight Tab */}
      {activeTab === 'spotlight' && !loading && (
        <AdminSpotlightTab
          artists={ar.artists} events={ev.events}
          spotlightDate={sp.spotlightDate} setSpotlightDate={sp.setSpotlightDate}
          spotlightPins={sp.spotlightPins} setSpotlightPins={sp.setSpotlightPins}
          spotlightEvents={sp.spotlightEvents} spotlightLoading={sp.spotlightLoading}
          spotlightSearch={sp.spotlightSearch} setSpotlightSearch={sp.setSpotlightSearch}
          setSpotlightImageWarning={sp.setSpotlightImageWarning}
          fetchSpotlight={sp.fetchSpotlight} fetchSpotlightEvents={sp.fetchSpotlightEvents}
          saveSpotlight={sp.saveSpotlight} clearSpotlight={sp.clearSpotlight}
          toggleSpotlightPin={sp.toggleSpotlightPin}
        />
      )}

      {/* Venues Tab */}
      {activeTab === 'venues' && !loading && (
        <AdminVenuesTab
          events={ev.events} venues={ve.venues}
          scraperHealth={ve.scraperHealth} venuesFilter={ve.venuesFilter}
          setVenuesFilter={ve.setVenuesFilter}
          forceSyncing={ve.forceSyncing} handleForceSync={ve.handleForceSync}
        />
      )}

      {/* Festivals Tab */}
      {activeTab === 'festivals' && !loading && (
        <AdminFestivalsTab
          events={ev.events} submissions={re.submissions} password={password}
          festivalData={fe.festivalData} festivalSearch={fe.festivalSearch}
          setFestivalSearch={fe.setFestivalSearch}
          editingFestival={fe.editingFestival} setEditingFestival={fe.setEditingFestival}
          fetchFestivalNames={fe.fetchFestivalNames}
        />
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && !loading && (
        <AdminSubmissionsTab
          artists={ar.artists} venues={ve.venues} queue={q.queue}
          submissions={re.submissions} reports={re.reports}
          queueSelectedIdx={q.queueSelectedIdx} queueActionLoading={q.queueActionLoading}
          queueForm={q.queueForm} queueDuplicates={q.queueDuplicates} queueDupLoading={q.queueDupLoading}
          adminFlyerUploading={q.adminFlyerUploading}
          adminFlyerDragOver={q.adminFlyerDragOver} setAdminFlyerDragOver={q.setAdminFlyerDragOver}
          newVenueOpen={q.newVenueOpen} setNewVenueOpen={q.setNewVenueOpen}
          newVenueName={q.newVenueName} setNewVenueName={q.setNewVenueName}
          newVenueAddress={q.newVenueAddress} setNewVenueAddress={q.setNewVenueAddress}
          newVenueLoading={q.newVenueLoading}
          isMobile={isMobile} mobileQueueDetail={mobileQueueDetail} setMobileQueueDetail={setMobileQueueDetail}
          qSurface={q.qSurface} qSurfaceAlt={q.qSurfaceAlt} qBorder={q.qBorder}
          qText={q.qText} qTextMuted={q.qTextMuted} qAccent={q.qAccent}
          fetchQueue={q.fetchQueue} handleAdminFlyerUpload={q.handleAdminFlyerUpload}
          selectQueueItem={q.selectQueueItem} updateQueueForm={q.updateQueueForm}
          handleQueueApprove={q.handleQueueApprove} handleQueueReject={q.handleQueueReject}
          handleQueueArchive={q.handleQueueArchive}
          handleCreateVenue={q.handleCreateVenue} resolveVenueId={q.resolveVenueId}
          applyBatchToFlyer={q.applyBatchToFlyer}
          setQueueLightboxUrl={q.setQueueLightboxUrl}
          adminFlyerRef={q.adminFlyerRef}
          queueSelected={q.queueSelected}
          festivalNames={fe.festivalNames}
          batchApplyPrompt={q.batchApplyPrompt} setBatchApplyPrompt={q.setBatchApplyPrompt}
          qLabelStyle={q.qLabelStyle} qInputStyle={q.qInputStyle}
          qGreen={q.qGreen} qRed={q.qRed}
        />
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && !loading && (
        <AdminReportsTab
          reports={re.reports} setReports={re.setReports} events={ev.events}
          artists={ar.artists} venues={ve.venues} password={password}
          flagsViewFilter={re.flagsViewFilter} setFlagsViewFilter={re.setFlagsViewFilter}
          setEditingEvent={ev.setEditingEvent} setShowEventForm={ev.setShowEventForm}
          setEditingArtist={ar.setEditingArtist} setArtistForm={ar.setArtistForm}
          setArtistsSearch={ar.setArtistsSearch} setArtistSubTab={ar.setArtistSubTab}
          setImageCandidates={ar.setImageCandidates} setImageCarouselIdx={ar.setImageCarouselIdx}
          setActiveTab={setActiveTab} setReturnToTab={setReturnToTab}
          fetchArtists={ar.fetchArtists} showQueueToast={showQueueToast}
        />
      )}

      {/* Spotlight Missing Image Warning Modal */}
      {sp.spotlightImageWarning && (
        <ModalWrapper onClose={() => sp.setSpotlightImageWarning(null)} maxWidth="420px">
          <>
            <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', textAlign: 'center' }}>
              Missing Artist Image
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{sp.spotlightImageWarning.artist_name}</strong> is missing a profile image. Spotlight features require an image to render correctly on mobile.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={async () => {
                  const ev = sp.spotlightImageWarning;
                  sp.setSpotlightImageWarning(null);

                  // Ensure artists are loaded (they may not be if user went straight to Spotlight)
                  let pool = ar.artists;
                  if (!pool || pool.length === 0) {
                    try {
                      const res = await fetch(`/api/admin/artists?limit=2000`, { headers: { Authorization: `Bearer ${password}` } });
                      if (res.ok) {
                        const data = await res.json();
                        pool = Array.isArray(data) ? data : (data.artists || []);
                        ar.setArtists(pool);
                      }
                    } catch { /* fall through to search fallback */ }
                  }

                  // Find the linked artist by ID first, then name
                  const linkedArtist = ev.artist_id
                    ? pool.find(a => a.id === ev.artist_id)
                    : pool.find(a => a.name?.toLowerCase() === ev.artist_name?.toLowerCase());

                  // Remember where we came from, then route to Artists → Triage sub-tab
                  setReturnToTab('spotlight');
                  setActiveTab('artists');
                  ar.setArtistSubTab('triage');

                  if (linkedArtist) {
                    ar.setEditingArtist(linkedArtist);
                    ar.setImageCandidates(linkedArtist.image_url ? [linkedArtist.image_url] : []);
                    ar.setImageCarouselIdx(0);
                    ar.setArtistForm({
                      name: linkedArtist.name || '',
                      bio: linkedArtist.bio || '',
                      genres: linkedArtist.genres ? (Array.isArray(linkedArtist.genres) ? linkedArtist.genres.join(', ') : linkedArtist.genres) : '',
                      vibes: linkedArtist.vibes ? (Array.isArray(linkedArtist.vibes) ? linkedArtist.vibes.join(', ') : linkedArtist.vibes) : '',
                      image_url: linkedArtist.image_url || '',
                    });
                  } else {
                    ar.setArtistsSearch(ev.artist_name || '');
                    ar.fetchArtists(ev.artist_name || '', false);
                  }
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(232,114,42,0.12)', color: '#E8722A',
                  border: '1px solid rgba(232,114,42,0.3)', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Edit Artist Profile
              </button>
              <button
                onClick={() => {
                  sp.toggleSpotlightPin(sp.spotlightImageWarning.id);
                  sp.setSpotlightImageWarning(null);
                }}
                style={{
                  padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                  background: 'rgba(234,179,8,0.1)', color: '#EAB308',
                  border: '1px solid rgba(234,179,8,0.25)', cursor: 'pointer', textAlign: 'center',
                }}
              >
                Spotlight with Default Graphic
              </button>
              <button
                onClick={() => sp.setSpotlightImageWarning(null)}
                style={{
                  padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer', marginTop: '4px',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        </ModalWrapper>
      )}

      {/* Bulk Edit Time Modal */}
      {ev.bulkTimeModal && (
        <ModalWrapper onClose={() => { if (!ev.bulkTimeLoading) ev.setBulkTimeModal(false); }} maxWidth="360px">
          <>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              Set Time for {ev.selectedEvents.size} Event{ev.selectedEvents.size !== 1 ? 's' : ''}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              This will update the start time on all selected events.
            </p>
            <input
              type="time"
              value={ev.bulkTime}
              onChange={e => ev.setBulkTime(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-primary)', fontSize: '16px', fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif", outline: 'none', marginBottom: '16px',
              }}
            />
            {ev.bulkTimeLoading ? (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#E8722A', fontWeight: 600 }}>
                Updating...
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => ev.setBulkTimeModal(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'transparent', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >Cancel</button>
                <button
                  disabled={!ev.bulkTime}
                  onClick={async () => {
                    if (!ev.bulkTime) return;
                    ev.setBulkTimeLoading(true);
                    try {
                      const ids = [...ev.selectedEvents];
                      for (const id of ids) {
                        const evt = ev.events.find(e => e.id === id);
                        if (!evt) continue;
                        const existingDate = evt.event_date ? new Date(evt.event_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
                        const newDateTime = new Date(`${existingDate}T${ev.bulkTime}:00`).toISOString();
                        await fetch('/api/admin', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                          body: JSON.stringify({ id, event_date: newDateTime, is_time_tbd: false }),
                        });
                      }
                      ev.setBulkTimeModal(false);
                      ev.setSelectedEvents(new Set());
                      ev.fetchEvents();
                      showQueueToast(`Updated time to ${ev.bulkTime} on ${ids.length} event(s)`);
                    } catch (err) {
                      console.error('Bulk time update error:', err);
                      showQueueToast('Bulk time update failed');
                    }
                    ev.setBulkTimeLoading(false);
                  }}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                    background: ev.bulkTime ? '#E8722A' : 'rgba(232,114,42,0.2)',
                    color: ev.bulkTime ? '#1C1917' : '#666',
                    border: 'none', cursor: ev.bulkTime ? 'pointer' : 'not-allowed',
                  }}
                >Save Time</button>
              </div>
            )}
          </>
        </ModalWrapper>
      )}

      {/* Event Form Modal */}
      {ev.showEventForm && (
        <EventFormModal
          event={ev.editingEvent}
          artists={ar.artists}
          venues={ve.venues}
          onClose={() => { ev.setShowEventForm(false); ev.setEditingEvent(null); }}
          onSave={saveEvent}
          adminPassword={password}
        />
      )}

      {/* Queue Image Lightbox */}
      {q.queueLightboxUrl && (
        <ModalWrapper
          onClose={() => q.setQueueLightboxUrl(null)}
          zIndex={300}
          blur={0}
          overlayBg="rgba(0,0,0,0.9)"
          overlayStyle={{ cursor: 'zoom-out' }}
          cardStyle={{
            background: 'none', border: 'none', boxShadow: 'none',
            padding: 0, maxWidth: '95vw', maxHeight: '95vh', width: 'auto',
            borderRadius: 0, overflow: 'visible',
          }}
        >
          <img
            src={q.queueLightboxUrl}
            alt="Flyer zoomed"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </ModalWrapper>
      )}

      {/* Sticky Bulk Action Bar + Artist Modals */}
      <AdminArtistModals
        activeTab={activeTab}
        artists={ar.artists} password={password}
        selectedArtists={ar.selectedArtists} setSelectedArtists={ar.setSelectedArtists}
        bulkEnrichProgress={ar.bulkEnrichProgress} setBulkEnrichProgress={ar.setBulkEnrichProgress}
        enrichConfirm={ar.enrichConfirm} setEnrichConfirm={ar.setEnrichConfirm}
        bulkDeleteConfirm={ar.bulkDeleteConfirm} setBulkDeleteConfirm={ar.setBulkDeleteConfirm}
        bulkDeleteLoading={ar.bulkDeleteLoading} setBulkDeleteLoading={ar.setBulkDeleteLoading}
        mergeConfirm={ar.mergeConfirm} setMergeConfirm={ar.setMergeConfirm}
        mergeMasterId={ar.mergeMasterId} setMergeMasterId={ar.setMergeMasterId}
        mergeLoading={ar.mergeLoading} setMergeLoading={ar.setMergeLoading}
        deleteConfirm={ar.deleteConfirm} setDeleteConfirm={ar.setDeleteConfirm}
        runBulkEnrich={ar.runBulkEnrich} fetchArtists={ar.fetchArtists}
        showQueueToast={showQueueToast}
      />

      {/* Admin Toast — top-center, enlarged */}
      {queueToast && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          padding: '14px 24px', borderRadius: '14px',
          background: queueToast?.type === 'error' ? '#3A1A1A' : queueToast?.type === 'success' ? '#0D2818' : '#1A1A24',
          border: queueToast?.type === 'error' ? '1px solid #ef4444' : queueToast?.type === 'success' ? '1px solid #23CE6B' : '1px solid #3A3A4A',
          color: queueToast?.type === 'error' ? '#fca5a5' : queueToast?.type === 'success' ? '#86efac' : '#F0F0F5',
          fontWeight: 700, fontSize: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 500,
          fontFamily: "'DM Sans', sans-serif",
          animation: 'slideDown 0.25s ease-out',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span>{typeof queueToast === 'string' ? queueToast : (queueToast.msg || queueToast.message || 'Something went wrong')}</span>
          {queueToast?.undoFn && (
            <button
              onClick={() => { queueToast.undoFn(); setQueueToast(null); }}
              style={{
                background: 'none', border: '1px solid #E8722A', borderRadius: '6px',
                color: '#E8722A', fontWeight: 700, fontSize: '12px',
                padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
