'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDate, formatTime, GENRES, VIBES } from '@/lib/utils';
import { Icons } from '@/components/Icons';
import { supabase } from '@/lib/supabase';
import EventFormModal from '@/components/EventFormModal';
import AdminArtistsTab from '@/components/admin/AdminArtistsTab';
import AdminArtistModals from '@/components/admin/AdminArtistModals';
import AdminSubmissionsTab from '@/components/admin/AdminSubmissionsTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';

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

  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reports, setReports] = useState([]);
  const [artists, setArtists] = useState([]);
  const [artistsSearch, setArtistsSearch] = useState('');
  const [artistsNeedsInfo, setArtistsNeedsInfo] = useState(false);
  const [artistMissingFilters, setArtistMissingFilters] = useState({ bio: false, image_url: false, genres: false, vibes: false });
  const [artistsSortBy, setArtistsSortBy] = useState('name'); // 'name' | 'next_event' | 'date_added'
  const [artistSourceFilter, setArtistSourceFilter] = useState('all'); // 'all' | 'lastfm' | 'scraper' | 'ai_generated' | 'manual' | 'unknown'
  const [artistSubTab, setArtistSubTab] = useState('directory'); // 'directory' | 'triage'
  const [directorySort, setDirectorySort] = useState({ col: 'date_added', dir: 'desc' }); // col: 'name' | 'next_event' | 'date_added'
  const [editingArtist, setEditingArtist] = useState(null);
  const [artistForm, setArtistForm] = useState({ name: '', bio: '', genres: '', vibes: '', image_url: '' });
  const [artistActionLoading, setArtistActionLoading] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [artistToast, setArtistToast] = useState(null);
  const [selectedArtists, setSelectedArtists] = useState(new Set());
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState(null); // { done, total } or null
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { artist, eventCount } or null
  const [artistEvents, setArtistEvents] = useState([]); // associated events for edit modal
  const [enrichConfirm, setEnrichConfirm] = useState(null); // array of artist objects to enrich, or null
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null); // { artists: [...], totalEvents: N, perArtistCounts: { id: count } } or null
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(null); // array of artist objects, or null
  const [mergeMasterId, setMergeMasterId] = useState(null); // selected master artist id
  const [mergeLoading, setMergeLoading] = useState(false);
  const [duplicateNameWarning, setDuplicateNameWarning] = useState(null); // existing artist name that conflicts