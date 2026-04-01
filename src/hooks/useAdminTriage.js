'use client';

import { useState, useCallback } from 'react';

export default function useAdminTriage({ password, showQueueToast }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` };

  const [triageEvents, setTriageEvents] = useState([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageActionId, setTriageActionId] = useState(null);

  const fetchTriage = useCallback(async () => {
    setTriageLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '200', sort: 'event_date', order: 'asc', triage: 'pending' });
      const res = await fetch(`/api/admin?${params}`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) return;
      const data = await res.json();
      setTriageEvents(data.events || (Array.isArray(data) ? data : []));
    } catch (err) { console.error('Triage fetch error:', err); }
    setTriageLoading(false);
  }, [password]);

  const triageCategorize = async (ev, category) => {
    setTriageEvents(prev => prev.filter(e => e.id !== ev.id));

    try {
      const body = { id: ev.id, category, triage_status: 'reviewed' };
      if (category !== 'Live Music') {
        body.artist_bio = null;
        body.artist_id = null;
      }
      const res = await fetch('/api/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to categorize');

      showQueueToast(`✅ → ${category}`, () => {
        fetch('/api/admin', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
          body: JSON.stringify({ id: ev.id, category: null, triage_status: 'pending' }),
        });
        setTriageEvents(prev => [ev, ...prev]);
      });
    } catch (err) {
      console.error('Triage categorize error:', err);
      setTriageEvents(prev => [ev, ...prev]);
      showQueueToast('Failed to categorize');
    }
  };

  const triageDelete = async (ev) => {
    setTriageEvents(prev => prev.filter(e => e.id !== ev.id));
    try {
      await fetch(`/api/admin?id=${ev.id}`, { method: 'DELETE', headers });
      showQueueToast(`🗑 Deleted: ${ev.artist_name || 'Event'}`);
    } catch (err) {
      console.error('Triage delete error:', err);
      setTriageEvents(prev => [ev, ...prev]);
      showQueueToast('Delete failed');
    }
  };

  return {
    triageEvents, setTriageEvents,
    triageLoading,
    triageActionId,
    fetchTriage,
    triageCategorize,
    triageDelete,
  };
}
