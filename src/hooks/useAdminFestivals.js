'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function useAdminFestivals() {
  const [festivalNames, setFestivalNames] = useState([]);
  const [festivalData, setFestivalData] = useState([]); // { name, count, events[] }
  const [festivalSearch, setFestivalSearch] = useState('');
  const [editingFestival, setEditingFestival] = useState(null); // { name, newName }

  const fetchFestivalNames = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, event_title, artist_name, event_date, venue_name')
        .not('event_title', 'is', null)
        .not('event_title', 'eq', '')
        .order('event_title')
        .limit(1000);
      if (!error && data) {
        const unique = [...new Set(data.map(e => e.event_title).filter(Boolean))].sort();
        setFestivalNames(unique);
        // Group by festival name with counts
        const grouped = {};
        for (const e of data) {
          const key = e.event_title;
          if (!grouped[key]) grouped[key] = { name: key, count: 0, events: [] };
          grouped[key].count++;
          grouped[key].events.push(e);
        }
        setFestivalData(Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) { console.error('Failed to load festival names:', err); }
  }, []);

  return {
    festivalNames, setFestivalNames,
    festivalData, setFestivalData,
    festivalSearch, setFestivalSearch,
    editingFestival, setEditingFestival,
    fetchFestivalNames,
  };
}
