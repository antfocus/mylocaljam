'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * useAdminEventSeries — replaces useAdminFestivals.
 *
 * The old hook treated "festivals" as anything with a non-empty event_title,
 * which conflated the data column with the conceptual grouping. This hook
 * reads from the proper `event_series` table (parent rows) and joins each
 * row's children via `events.series_id` so the admin UI can show counts +
 * sample previews.
 *
 * Returned shape:
 *   - series         — raw event_series rows (for autocomplete consumers)
 *   - seriesData     — enriched: { id, name, slug, category, status,
 *                                   start_date, end_date, count, events[] }
 *   - seriesNames    — sorted string[] of series names (datalist autocomplete)
 *   - seriesSearch   — controlled input for the search box
 *   - editingSeries  — { id, name, newName } | null
 *   - fetchSeries    — reload from supabase
 */
export default function useAdminEventSeries() {
  const [series, setSeries] = useState([]);
  const [seriesData, setSeriesData] = useState([]);
  const [seriesNames, setSeriesNames] = useState([]);
  const [seriesSearch, setSeriesSearch] = useState('');
  const [editingSeries, setEditingSeries] = useState(null);

  const fetchSeries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('event_series')
        .select(`
          id, name, slug, category, status, start_date, end_date,
          events ( id, artist_name, event_date )
        `)
        // Series with no start_date sink to the bottom; otherwise earliest first.
        .order('start_date', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('[useAdminEventSeries] fetch error:', error);
        return;
      }

      const rows = data || [];
      const enriched = rows.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        category: s.category,
        status: s.status,
        start_date: s.start_date,
        end_date: s.end_date,
        count: (s.events || []).length,
        // Sort child previews by event_date so the chips read chronologically.
        events: (s.events || []).slice().sort((a, b) => {
          const da = a.event_date || '';
          const db = b.event_date || '';
          return da.localeCompare(db);
        }),
      }));

      setSeries(rows);
      setSeriesData(enriched);
      setSeriesNames(
        rows
          .map(r => r.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );
    } catch (err) {
      console.error('[useAdminEventSeries] failed:', err);
    }
  }, []);

  return {
    series, seriesData, seriesNames,
    seriesSearch, setSeriesSearch,
    editingSeries, setEditingSeries,
    fetchSeries,
  };
}
