'use client';

import { useState, useCallback } from 'react';

export default function useAdminReports({ password }) {
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [flagsViewFilter, setFlagsViewFilter] = useState('pending');

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports', { headers: { Authorization: `Bearer ${password}` } });
      if (res.ok) setReports(await res.json());
    } catch (err) { console.error('Failed to fetch reports:', err); }
  }, [password]);

  return {
    submissions, setSubmissions,
    reports, setReports,
    flagsViewFilter, setFlagsViewFilter,
    fetchReports,
  };
}
