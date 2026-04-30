'use client';

/**
 * AdminVenuesTab — parent wrapper for two sub-tabs:
 *   • Directory — admin CRUD over the venues table (PARKED #1).
 *   • Scrapers — health dashboard for the scraper feeding each venue.
 *
 * Both sub-tabs work the same venues data (different lenses on it), so they
 * live together under one nav entry. Sub-tab choice persists in
 * sessionStorage so navigating away and back lands you on the lens you
 * last used. URL hash (#scrapers) deep-links into Scrapers on first load.
 *
 * Pattern mirrors AdminEnrichmentTab (Backfill | Triage). Same toggle
 * styling so the admin shell feels consistent.
 */

import { useEffect, useState } from 'react';
import AdminVenuesDirectory from './AdminVenuesDirectory';
import AdminVenuesScrapers from './AdminVenuesScrapers';

const SUB_TAB_STORAGE_KEY = 'admin-venues-sub-tab';

function readInitialSubTab() {
  if (typeof window === 'undefined') return 'directory';
  // URL hash takes precedence so deep-links work
  if (window.location.hash === '#scrapers') return 'scrapers';
  if (window.location.hash === '#directory') return 'directory';
  try {
    const stored = sessionStorage.getItem(SUB_TAB_STORAGE_KEY);
    if (stored === 'directory' || stored === 'scrapers') return stored;
  } catch {}
  return 'directory';
}

export default function AdminVenuesTab({
  // shared
  venues, scraperHealth,
  showQueueToast,
  // directory
  fetchVenuesFull, createVenue, updateVenue, deleteVenue,
  geocodeAddress, searchVenueImages,
  // scrapers
  venuesFilter, setVenuesFilter,
  forceSyncing, handleForceSync,
  updateVenueDefaultTime,
}) {
  const [activeSubTab, setActiveSubTab] = useState('directory');

  // Hydrate the sub-tab from sessionStorage / hash on mount only. Doing
  // this in useEffect avoids the SSR mismatch you'd hit if we read window
  // synchronously during render.
  useEffect(() => {
    setActiveSubTab(readInitialSubTab());
  }, []);

  // Persist whenever the user switches. Keeps the choice across navigation
  // away and back to this tab. Hash is also kept in sync so a copy/share
  // of the URL re-opens the same view.
  const handleSubTabChange = (key) => {
    setActiveSubTab(key);
    try { sessionStorage.setItem(SUB_TAB_STORAGE_KEY, key); } catch {}
    if (typeof window !== 'undefined') {
      const newHash = `#${key}`;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
      }
    }
  };

  return (
    <div>
      {/* Heading + description that updates per sub-tab */}
      <div style={{ marginBottom: '16px' }}>
        <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
          Venues
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
          {activeSubTab === 'directory'
            ? 'Edit, add, and delete venue rows. Search by name, city, or address. Coords + photo indicators surface gaps at a glance.'
            : 'Per-venue scraper health. Status (OK / Warn / Fail), platform, last sync, force-sync, and default start time editor.'}
        </p>
      </div>

      {/* Sub-tab toggle — same styling as AdminEnrichmentTab so the admin
          shell feels consistent across tabs that have sub-tabs. */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        {[
          { key: 'directory', label: 'Directory' },
          { key: 'scrapers', label: 'Scrapers' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => handleSubTabChange(t.key)}
            style={{
              padding: '10px 18px', background: 'transparent',
              border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px', fontWeight: 600,
              color: activeSubTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeSubTab === t.key ? '2px solid #E8722A' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'directory' && (
        <AdminVenuesDirectory
          venues={venues}
          scraperHealth={scraperHealth}
          fetchVenuesFull={fetchVenuesFull}
          createVenue={createVenue}
          updateVenue={updateVenue}
          deleteVenue={deleteVenue}
          geocodeAddress={geocodeAddress}
          searchVenueImages={searchVenueImages}
          showQueueToast={showQueueToast}
        />
      )}

      {activeSubTab === 'scrapers' && (
        <AdminVenuesScrapers
          venues={venues}
          scraperHealth={scraperHealth}
          venuesFilter={venuesFilter}
          setVenuesFilter={setVenuesFilter}
          forceSyncing={forceSyncing}
          handleForceSync={handleForceSync}
          updateVenueDefaultTime={updateVenueDefaultTime}
        />
      )}
    </div>
  );
}
