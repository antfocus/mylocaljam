' use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';

// ── Title Case formatter (respects common lowercase words) ───────────────────
const TITLE_CASE_MINOR = new Set(['a','an','the','and','but','or','nor','for','yet','so','in','on','at','to','by','of','up','as','is']);
function toTitleCase(str) {
  if (!str) return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      // Always capitalize first/last word, otherwise skip minor words
      if (i === 0 || !TITLE_CASE_MINOR.has(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

// ── Venue list for queue editor dropdown ─────────────────────────────────────
const QUEUE_VENUE_OPTIONS = [
  'The Stone Pony', 'House of Independents', 'The Wonder Bar',
  'The Saint', 'Asbury Lanes', 'Danny Clinch Transparent Gallery',
  'Bar Anticipation', 'The Headliner', 'Donovan\'s Reef',
  'Langosta Lounge', 'Johnny Mac\'s', 'The Osprey',
];

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [returnToTab, setReturnToTab] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashDateRange, setDashDateRange] = useState('7d');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsEnv, setAnalyticsEnv] = useState('production');
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
    } catch { }
  }, []);

  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [artists, setArtists] = useState([]);
}