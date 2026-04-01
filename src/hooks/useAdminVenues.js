'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function useAdminVenues({ password, showQueueToast }) {
  const [venues, setVenues] = useState([]);
  const [scraperHealth, setScraperHealth] = useState([]);
  const [venuesFilter, setVenuesFilter] = useState('all');
  const [forceSyncing, setForceSyncing] = useState(null);

  const fetchVenues = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name')
        .order('name');
      if (!error && data) setVenues(data);
    } catch (err) { console.error('Failed to load venues:', err); }
  }, []);

  const fetchScraperHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/scraper-health', { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setScraperHealth(await res.json());
    } catch (err) { console.error('Failed to fetch scraper health:', err); }
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
    fetchScraperHealth,
    handleForceSync,
  };
}
