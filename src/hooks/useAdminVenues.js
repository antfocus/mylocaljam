'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Admin venues hook — backs both the Directory and Scrapers sub-tabs of
 * AdminVenuesTab. Existing minimal fetch + scraper-health methods stay
 * intact for backward compatibility with consumers like AdminEventsTab
 * (datalist) and AdminSubmissionsTab (queue triage). New full-row CRUD
 * methods power the Directory.
 */
export default function useAdminVenues({ password, showQueueToast }) {
  const [venues, setVenues] = useState([]);
  const [scraperHealth, setScraperHealth] = useState([]);
  const [venuesFilter, setVenuesFilter] = useState('all');
  const [forceSyncing, setForceSyncing] = useState(null);

  // ── Reads ───────────────────────────────────────────────────────────

  // Minimal fetch — just the columns existing consumers need (datalist
  // population, default-start-time editor in the Scrapers sub-tab).
  // Keep this lean so AdminEventsTab / AdminSubmissionsTab don't pay
  // for columns they never read.
  const fetchVenues = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, default_start_time')
        .order('name');
      if (!error && data) setVenues(data);
    } catch (err) { console.error('Failed to load venues:', err); }
  }, []);

  // Full-row fetch — selects every editable column for the Directory
  // sub-tab. Replaces the minimal `venues` state with the richer payload
  // so the same state works for both sub-tabs (the lean ones just ignore
  // the extra columns). 72 rows × ~14 cols = trivial; no perf concern.
  const fetchVenuesFull = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, address, city, slug, latitude, longitude, website, photo_url, venue_type, tags, default_start_time, color, created_at')
        .order('name');
      if (!error && data) setVenues(data);
    } catch (err) { console.error('Failed to load venues (full):', err); }
  }, []);

  const fetchScraperHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/scraper-health', { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setScraperHealth(await res.json());
    } catch (err) { console.error('Failed to fetch scraper health:', err); }
  }, [password]);

  // ── Writes ──────────────────────────────────────────────────────────

  const updateVenueDefaultTime = useCallback(async (venueId, time) => {
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: venueId, default_start_time: time || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setVenues(prev => prev.map(v => v.id === venueId ? { ...v, default_start_time: time || null } : v));
        showQueueToast(`Default start time ${time ? 'set to ' + time : 'cleared'}`);
      } else {
        showQueueToast(`Failed to update: ${data.error}`);
      }
    } catch (err) {
      showQueueToast(`Error updating default time: ${err.message}`);
    }
  }, [password, showQueueToast]);

  // Directory: create a new venue from the full-row form. Returns the
  // created row on success, null on failure (toast surfaces the error).
  const createVenue = useCallback(async (payload) => {
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showQueueToast(`Create failed: ${data.error || 'unknown error'}`);
        return null;
      }
      return data;
    } catch (err) {
      showQueueToast(`Create error: ${err.message}`);
      return null;
    }
  }, [password, showQueueToast]);

  // Directory: full update via PUT. Returns true on success.
  const updateVenue = useCallback(async (id, payload) => {
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        showQueueToast(`Update failed: ${data.error || 'unknown error'}`);
        return false;
      }
      return true;
    } catch (err) {
      showQueueToast(`Update error: ${err.message}`);
      return false;
    }
  }, [password, showQueueToast]);

  // Directory: delete with FK pre-check on the server. Returns one of:
  //   { ok: true }
  //   { fkBlocked: true, events, templates, series }
  //   { error: string }
  // The directory UI uses this discriminated shape to render the right
  // toast (success vs. "blocked by N events" vs. "unknown error").
  const deleteVenue = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/admin/venues?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await res.json();
      if (res.ok) return { ok: true };
      if (res.status === 409 && data.fkBlocked) {
        return {
          fkBlocked: true,
          events: data.events || 0,
          templates: data.templates || 0,
          series: data.series || 0,
        };
      }
      return { error: data.error || `HTTP ${res.status}` };
    } catch (err) {
      return { error: err.message };
    }
  }, [password]);

  const handleForceSync = useCallback(async (scraperKey) => {
    if (forceSyncing) return;
    setForceSyncing(scraperKey);
    try {
      const res = await fetch('/api/admin/force-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify({ scraper_key: scraperKey }),
      });
      const data = await res.json();
      if (data.ok) {
        showQueueToast(`${scraperKey}: synced ${data.eventsScraped} events in ${data.duration}`);
        fetchScraperHealth();
      } else {
        showQueueToast(`${scraperKey} sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      showQueueToast(`Force sync error: ${err.message}`);
    } finally {
      setForceSyncing(null);
    }
  }, [password, forceSyncing, fetchScraperHealth, showQueueToast]);

  return {
    venues, setVenues,
    scraperHealth,
    venuesFilter, setVenuesFilter,
    forceSyncing,
    fetchVenues,
    fetchVenuesFull,
    fetchScraperHealth,
    handleForceSync,
    updateVenueDefaultTime,
    createVenue,
    updateVenue,
    deleteVenue,
  };
}
